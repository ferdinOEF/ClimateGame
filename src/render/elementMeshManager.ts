import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { ELEMENT_DEFS, ELEMENT_BY_ID } from "@core/elements";
import { HEX_SIZE } from "./terrainMeshManager";
import { createElementGeometry } from "./elementGeometry";
import { jitterColor, paletteColor } from "./palette";
import { SettleAnimator } from "./settleAnimation";
import { MAX_ELEMENT_INSTANCES_PER_TYPE } from "./instanceLimits";

const DEGRADED_TINT = new THREE.Color("#5b4a36"); // dull, patchy brown — a visibly weakened structure

/**
 * What one storm does to a building that was not protected.
 *
 * This is the game's central lesson made visible. A house behind a mature
 * mangrove belt takes little or nothing; the same house on bare sand leans,
 * settles and darkens, and does it again on the next storm until it is a
 * wreck. Three hits take it from new to ruined, which is slow enough that a
 * player can see the trend and still have time to act on it.
 */
const DAMAGE_PER_HIT = 0.38;

/**
 * Elements whose geometry already carries its own full colour scheme, and so
 * must NOT be tinted by the palette.
 *
 * `instanceColor` is multiplied against every vertex colour in the shader.
 * That is fine for a prop built in one hue — it is how the roster gets its
 * per-tile variation — and ruinous for one built in several. A House with
 * cream walls, a terracotta roof, teal shutters and a laterite plinth
 * multiplied by `houseTerracotta` is a House that is uniformly red: every
 * distinction the geometry was given collapses into the tint.
 *
 * `sand_mining` hit this first and worked around it by picking vertex colours
 * for how they survive the multiply (see its own comment). That works for one
 * accent on one model and does not scale to a building with a dozen parts.
 * The fix for those is to make the multiply a no-op by tinting them white,
 * which is what this set does — the jitter still applies, so two houses still
 * differ slightly, they just differ in brightness rather than in hue.
 */
const SELF_COLOURED = new Set(["house", "beachside_resort", "yacht"]);

/** The near-white tint `SELF_COLOURED` elements get instead of a palette hue. Just off white so the jitter has something to vary. */
const NEUTRAL_TINT = new THREE.Color("#f7f5f0");
/** Radians of lean at full damage — a clear collapse, short of lying flat. */
const MAX_DAMAGE_LEAN = 0.38;
/** How far a ruined building settles into the ground, in world units. */
const MAX_DAMAGE_SINK = 0.1;
/** How much of its height a ruined building loses, as a fraction. */
const MAX_DAMAGE_SLUMP = 0.3;

/**
 * Elements that sway, and how far.
 *
 * Only living things move. That is the point rather than a shortcut: this
 * game's whole argument is the difference between a defence that grows and
 * one that is poured, and having the mangroves and the dune grass breathe
 * while the seawall and the breakwater sit dead still says it continuously,
 * without a line of text.
 *
 * The amplitude is a rotation about the vertical axis plus a small tilt, in
 * radians. Small numbers deliberately: a mangrove belt should look alive at
 * rest, not animated. The dune moves least — it is a mound of sand with
 * grass on it, not a canopy.
 */
const SWAY_BY_ELEMENT: Record<string, { tiltRadians: number; periodSeconds: number }> = {
  mangrove: { tiltRadians: 0.05, periodSeconds: 3.4 },
  sandy_vegetation: { tiltRadians: 0.065, periodSeconds: 2.6 },
  dune: { tiltRadians: 0.022, periodSeconds: 4.1 },
  khazan: { tiltRadians: 0.018, periodSeconds: 5.2 }
};

/** Phase offset per world unit, so a belt of mangroves ripples along its length instead of leaning in unison. */
const SWAY_PHASE_PER_UNIT = 0.55;

/**
 * Whether the player has asked their system for reduced motion.
 *
 * Wrapped so the manager can still be constructed where `matchMedia` does not
 * exist, which is any vitest run without a DOM. Defaults to "no preference",
 * which is what a browser reports when none has been set.
 */
function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** One element standing on the board, as the ambient reaction scheduler sees it. */
export interface PlacedElement {
  /**
   * Stable for as long as this element stands: the tile plus the element id,
   * so a tile cleared and rebuilt with something else reads as a new element
   * with its own timer rather than inheriting the old one's.
   */
  key: string;
  elementId: string;
  x: number;
  y: number;
  z: number;
}

interface ElementInstanceRef {
  elementId: string;
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  y: number;
  z: number;
  baseColor: THREE.Color;
  /** Offset into the sway cycle, in radians. Absent on anything that does not sway. */
  swayPhase?: number;
  /** How battered this instance is, 0 to 1. Accumulates across storms and never recovers — there is no repair mechanic. */
  damage: number;
  /** Which way it falls, in radians about the vertical. Fixed per tile so repeated hits deepen one collapse. */
  damageLean: number;
  /** Panjim 2050 maturity as drawn, 0 (just planted) to 1, easing toward `growthTarget`. 1 everywhere else. */
  growth: number;
  growthTarget: number;
  /** The growth value the colour was last painted for, so recolouring happens in steps, not every frame. */
  paintedGrowth: number;
  /** How weathered a defence looks, 0–0.5 (see `setDegradeVisual`). */
  degrade: number;
  /** Panjim 2050's skyline: buildings grow taller as the years pass. 1 everywhere else. */
  heightScale: number;
}

/** A just-planted defence is drawn at this fraction of its full size, growing to 1 at maturity. */
const SAPLING_SCALE = 0.35;
/** Young growth is paler; this is the colour it starts from. */
const YOUNG_TINT = new THREE.Color("#d9ecb0");

function growthScale(growth: number): number {
  return SAPLING_SCALE + (1 - SAPLING_SCALE) * growth;
}

/**
 * v2.2: buildings and defenses merged into one `elements.json` roster
 * (Section 0.1's generic-effects requirement), so their render-side
 * bookkeeping — near-identical between the old BuildingMeshManager and
 * DefenseMeshManager — merges into one manager too. One InstancedMesh per
 * element type, small flat-silhouette icon props sitting on their tile.
 * `destroy()`/`setDegradeVisual()` only ever get called for defense-kind
 * elements in practice (a hazard event), but work uniformly either way.
 */
export class ElementMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  /** High-water mark per type — only ever grows, capped at MAX_ELEMENT_INSTANCES_PER_TYPE. */
  private nextIndex = new Map<string, number>();
  /** Indices freed by destroy() — drawn from before nextIndex grows further. */
  private freeIndices = new Map<string, number[]>();
  private byCoord = new Map<string, ElementInstanceRef>();
  private animator = new SettleAnimator();
  /**
   * Whether the sway runs. Off for a player who has asked their system for
   * reduced motion — see TerrainMeshManager for the same decision about the
   * water swell, and for why this is read once rather than watched.
   */
  private readonly swayEnabled = !prefersReducedMotion();
  /**
   * How hard the wind is blowing, 0 to 1, from the storm.
   *
   * Scales both the lean and the rate of the sway, so a mangrove belt that
   * breathes gently in fair weather visibly thrashes in a surge. That is the
   * cheapest honest way to show a living defence doing work: the player can
   * see it taking the energy, which a static prop cannot convey however
   * detailed it is.
   */
  private wind = 0;
  /** Reused every frame: allocating these per element per frame would be thousands of objects a second. */
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchEuler = new THREE.Euler();
  private readonly scratchQuaternion = new THREE.Quaternion();
  private readonly scratchScale = new THREE.Vector3();

  constructor() {
    for (const element of ELEMENT_DEFS) {
      const geometry = createElementGeometry(element.id);
      // vertexColors: true — the element-icon redesign pass bakes real
      // per-part color into each geometry's `color` attribute (see
      // primitives3d.ts), which Three.js multiplies against the
      // per-instance `instanceColor` set below (jitterColor's subtle
      // per-tile variation still applies on top of every part uniformly).
      const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, vertexColors: true });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_ELEMENT_INSTANCES_PER_TYPE);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ELEMENT_INSTANCES_PER_TYPE * 3), 3);
      mesh.count = 0;
      mesh.name = `element-${element.id}`;
      this.meshes.set(element.id, mesh);
      this.nextIndex.set(element.id, 0);
      this.freeIndices.set(element.id, []);
      this.group.add(mesh);
    }
  }

  /**
   * STEP_PROMPT_gameplay_stability_test.md Part A: `index` used to be a
   * strictly-increasing per-type counter that never gave back a destroyed
   * instance's slot — live-reproduced that a rapid rebuild/catastrophic-
   * failure cycle on the same tile (a real scenario once a Storm Surge can
   * repeatedly breach a rebuilt Seawall) hits MAX_ELEMENT_INSTANCES_PER_TYPE and
   * throws well within a single era, uncaught, from inside the build
   * popover's click handler — which aborts that handler before it reaches
   * `this.hide()`, leaving the modal backdrop stuck open and the game
   * reading as hung. Now draws from `freeIndices` (populated by `destroy()`)
   * before growing `nextIndex`, so a destroyed instance's slot is actually
   * reusable instead of burning one more of the fixed pool forever.
   */
  place(coord: AxialCoord, elementId: string, terrainTopY: number, options: { animate?: boolean; growth?: number } = {}): void {
    const def = ELEMENT_BY_ID.get(elementId);
    if (!def) throw new Error(`Unknown element id: ${elementId}`);
    const mesh = this.meshes.get(elementId)!;
    const free = this.freeIndices.get(elementId)!;
    let index: number;
    if (free.length > 0) {
      index = free.pop()!;
    } else {
      index = this.nextIndex.get(elementId)!;
      if (index >= MAX_ELEMENT_INSTANCES_PER_TYPE) throw new Error(`Element instance cap exceeded for ${elementId}`);
      this.nextIndex.set(elementId, index + 1);
    }

    const { x, z } = axialToWorld(coord, HEX_SIZE);

    const growth = options.growth ?? 1;
    const landScale = growthScale(growth);
    if (options.animate) {
      this.animator.begin(mesh, index, x, z, terrainTopY, performance.now(), landScale);
    } else {
      mesh.setMatrixAt(index, new THREE.Matrix4().makeScale(landScale, landScale, landScale).setPosition(x, terrainTopY, z));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }

    const seed = coord.q * 41 + coord.r * 19;
    const baseColor = SELF_COLOURED.has(elementId)
      ? jitterColor(NEUTRAL_TINT, seed)
      : jitterColor(paletteColor(def.colorKey), seed);
    mesh.setColorAt(index, growth < 1 ? baseColor.clone().lerp(YOUNG_TINT, (1 - growth) * 0.5) : baseColor);

    mesh.count = Math.max(mesh.count, index + 1);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.byCoord.set(`${coord.q},${coord.r}`, {
      elementId,
      mesh,
      index,
      x,
      y: terrainTopY,
      z,
      baseColor,
      swayPhase: SWAY_BY_ELEMENT[elementId] ? (x + z) * SWAY_PHASE_PER_UNIT : undefined,
      // A rebuild starts clean: `place()` is the only repair this game has.
      damage: 0,
      // Derived from the tile rather than rolled, so the same building leans
      // the same way every time it is hit, and two neighbours do not collapse
      // in lockstep.
      damageLean: ((coord.q * 73856093) ^ (coord.r * 19349663)) % 628 / 100,
      growth,
      growthTarget: growth,
      paintedGrowth: growth,
      degrade: 0,
      heightScale: 1
    });
  }

  /** The colour an instance should show now: its own, paler while young, browner when weathered or damaged. */
  private paint(ref: ElementInstanceRef): void {
    const color = ref.baseColor.clone();
    if (ref.growth < 1) color.lerp(YOUNG_TINT, (1 - ref.growth) * 0.5);
    if (ref.degrade > 0) color.lerp(DEGRADED_TINT, THREE.MathUtils.clamp(ref.degrade / 0.5, 0, 1) * 0.7);
    if (ref.damage > 0) color.lerp(DEGRADED_TINT, 0.35 + ref.damage * 0.45);
    ref.mesh.setColorAt(ref.index, color);
    if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true;
    ref.paintedGrowth = ref.growth;
  }

  /**
   * Panjim 2050: how mature a growing defence is, 0 to 1. A young mangrove is
   * drawn small and pale and fills out as the quarters pass; on a swaying
   * element the change eases in over a few frames rather than jumping.
   */
  setGrowth(coord: AxialCoord, target: number): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref) return;
    const clamped = THREE.MathUtils.clamp(target, 0, 1);
    if (Math.abs(clamped - ref.growthTarget) < 1e-4) return;
    ref.growthTarget = clamped;
    if (this.swayEnabled && SWAY_BY_ELEMENT[ref.elementId]) return; // tickSway eases it in
    ref.growth = clamped;
    this.paint(ref);
    if (!this.animator.isAnimating(ref.index, ref.mesh)) {
      this.writeTransform(ref);
      ref.mesh.instanceMatrix.needsUpdate = true;
      ref.mesh.boundingSphere = null;
    }
  }

  /** Panjim 2050's skyline: a building's height relative to its authored size. */
  setHeightScale(coord: AxialCoord, scale: number): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref || Math.abs(ref.heightScale - scale) < 1e-3) return;
    ref.heightScale = scale;
    if (this.animator.isAnimating(ref.index, ref.mesh)) return;
    this.writeTransform(ref);
    ref.mesh.instanceMatrix.needsUpdate = true;
    ref.mesh.boundingSphere = null;
  }

  /** Catastrophic engineered failure: collapses and permanently hides the instance, freeing its slot for reuse. */
  destroy(coord: AxialCoord): void {
    const key = `${coord.q},${coord.r}`;
    const ref = this.byCoord.get(key);
    if (!ref) return;
    this.animator.collapse(ref.mesh, ref.index, ref.x, ref.y, ref.z, performance.now());
    this.byCoord.delete(key);
    this.freeIndices.get(ref.elementId)!.push(ref.index);
  }

  /** Khazan graceful degrade: tints the structure toward a patchy, weathered brown as degradeAmount grows. */
  setDegradeVisual(coord: AxialCoord, degradeAmount: number): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref) return;
    ref.degrade = degradeAmount;
    this.paint(ref);
  }

  /**
   * STEP_PROMPT_test_slider_resort_damage.md Section 3: House/Beachside
   * Resort took real Storm Surge damage (a discrete "this building was
   * hit" state, not a defense's gradual wear) — reuses `setDegradeVisual`'s
   * own tint-toward-`DEGRADED_TINT` blend math at its own maximum (the same
   * 0.7 ceiling a fully degraded defense reaches), rather than a second,
   * separately named color for the same visual idea. Kept as its own
   * method (not `setDegradeVisual(coord, 0.5)` with a magic number) since
   * that method's own name/doc comment are specifically about graceful
   * defense degradation — persists until `destroy()`/`place()` (a rebuild)
   * or `reset()` (a new era) restores the clean `baseColor`; there's no
   * repair mechanic in this codebase to clear it any other way.
   */
  setBuildingDamagedVisual(coord: AxialCoord): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref) return;

    // Cumulative. A house hit by three storms should look three storms worse,
    // not the same as one hit once — a building that bottoms out after a
    // single wave has nothing left to say about the second.
    ref.damage = Math.min(1, ref.damage + DAMAGE_PER_HIT);
    this.paint(ref);

    this.writeTransform(ref);
    ref.mesh.instanceMatrix.needsUpdate = true;
    ref.mesh.boundingSphere = null;
  }

  /** Panjim 2050's Repair: the instance stands straight and takes its own colour back. */
  repairVisual(coord: AxialCoord): void {
    const ref = this.byCoord.get(`${coord.q},${coord.r}`);
    if (!ref) return;
    ref.damage = 0;
    ref.degrade = 0;
    this.paint(ref);
    this.writeTransform(ref);
    ref.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Composes an instance's transform from everything currently acting on it:
   * where it sits, how far the wind has bent it, and how badly the sea has
   * knocked it about.
   *
   * One function because those three used to be written by two separate
   * paths that each assumed they owned the matrix — so a damaged mangrove's
   * lean was erased by the next sway frame, and a swaying element that took
   * damage snapped upright. Composing them here is what lets a building be
   * both leaning and settling at once, which is what erosion looks like.
   */
  private writeTransform(ref: ElementInstanceRef, swayAngle = 0, swayRoll = 0): void {
    /*
     * The visual response is front-loaded: `damage ^ 0.55` rather than
     * `damage` itself.
     *
     * Linear looked right on paper and taught nothing. One storm moved a
     * house by about eight degrees, which a player simply does not notice,
     * so the first and most important lesson — "that storm hurt those houses
     * because you had not planted anything" — was invisible exactly when it
     * mattered. The curve makes the first hit unmistakable while still
     * leaving somewhere worse for the second and third to go.
     */
    const damage = Math.pow(ref.damage, 0.55);
    // Leans over, settles into the ground, and slumps slightly. The lean
    // direction is fixed per tile (see `damageLean`) so repeated hits deepen
    // one collapse rather than rocking the building back and forth.
    const lean = damage * MAX_DAMAGE_LEAN;
    const sink = damage * MAX_DAMAGE_SINK;
    const slump = 1 - damage * MAX_DAMAGE_SLUMP;

    this.scratchEuler.set(
      swayAngle + Math.cos(ref.damageLean) * lean,
      0,
      swayRoll + Math.sin(ref.damageLean) * lean
    );
    this.scratchQuaternion.setFromEuler(this.scratchEuler);
    this.scratchMatrix.makeRotationFromQuaternion(this.scratchQuaternion);
    const g = growthScale(ref.growth);
    this.scratchMatrix.scale(this.scratchScale.set(g, slump * g * ref.heightScale, g));
    this.scratchMatrix.setPosition(ref.x, ref.y - sink, ref.z);
    ref.mesh.setMatrixAt(ref.index, this.scratchMatrix);
  }

  /** Called once per frame from the session, before `tick`. */
  setWind(wind: number): void {
    this.wind = Math.max(0, Math.min(1, wind));
  }

  tick(nowMs: number): void {
    this.animator.tick(nowMs);
    this.tickSway(nowMs);
  }

  /**
   * Leans the living defences. See `SWAY_BY_ELEMENT` for why only some things
   * move and why the amounts are small.
   *
   * A tile mid-settle or mid-collapse is skipped: `SettleAnimator` owns that
   * instance's matrix until it lands, and writing here as well would make a
   * newly planted mangrove judder between dropping in and swaying.
   */
  private tickSway(nowMs: number): void {
    if (!this.swayEnabled) return;

    const seconds = nowMs / 1000;
    const touched = new Set<THREE.InstancedMesh>();

    for (const ref of this.byCoord.values()) {
      if (ref.swayPhase === undefined) continue;
      const profile = SWAY_BY_ELEMENT[ref.elementId];
      if (!profile) continue;
      if (this.animator.isAnimating(ref.index, ref.mesh)) continue;

      // Growth eases toward its target over about half a second.
      if (ref.growth !== ref.growthTarget) {
        const step = ref.growthTarget - ref.growth;
        ref.growth = Math.abs(step) < 0.004 ? ref.growthTarget : ref.growth + step * 0.12;
        if (Math.abs(ref.growth - ref.paintedGrowth) > 0.04 || ref.growth === ref.growthTarget) this.paint(ref);
      }

      // Wind both speeds the cycle up and widens it, which is what separates
      // a breeze from a gale. The period shortens by up to two thirds and the
      // lean grows roughly fivefold at full storm.
      const rate = 1 + this.wind * 2.2;
      const gust = 1 + this.wind * 4.5;
      const wave = Math.sin((seconds * rate / profile.periodSeconds) * Math.PI * 2 + ref.swayPhase);
      // A tilt about X and a smaller counter-tilt about Z, which together read
      // as a lean into a breeze rather than a rock side to side. Composed
      // through Euler angles because the props are small and axis-aligned, so
      // the cheaper route has no visible cost here.
      const tilt = profile.tiltRadians * gust;
      // A storm blows one way. Adding a constant lean on top of the
      // oscillation is what stops a gale reading as a faster wobble.
      const bend = this.wind * 0.12;
      this.writeTransform(ref, wave * tilt + bend, wave * tilt * 0.45);
      touched.add(ref.mesh);
    }

    for (const mesh of touched) {
      mesh.instanceMatrix.needsUpdate = true;
      // `InstancedMesh.boundingSphere` is cached on first use and never
      // recomputed as instances move, so one computed mid-lean would be used
      // for every later frustum check. Invalidating costs a null assignment.
      // See SettleAnimator.tick for the click-picking bug this class has
      // already caused once.
      mesh.boundingSphere = null;
    }
  }

  /**
   * Every element currently standing, read live from the same map `place()`,
   * `destroy()` and `reset()` maintain — so a build, a storm loss, a player
   * removal and a board reset are all reflected on the next call with no
   * separate bookkeeping. A collapsing element is already gone from it.
   */
  *placedElements(): Generator<PlacedElement> {
    for (const [coordKey, ref] of this.byCoord) {
      yield { key: `${coordKey}:${ref.elementId}`, elementId: ref.elementId, x: ref.x, y: ref.y, z: ref.z };
    }
  }

  /** Clears every placed element (a new era starting a fresh map). */
  reset(): void {
    this.byCoord.clear();
    for (const elementId of this.nextIndex.keys()) {
      this.nextIndex.set(elementId, 0);
      this.freeIndices.set(elementId, []);
      this.meshes.get(elementId)!.count = 0;
    }
  }
}
