import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { TERRAIN_DEFS, TERRAIN_BY_ID } from "@core/terrain";
import { createHexPrismGeometry } from "./hexGeometry";
import { jitterColor, paletteColor } from "./palette";
import { SettleAnimator } from "./settleAnimation";
import { MAX_TERRAIN_INSTANCES_PER_TYPE } from "./instanceLimits";

export const HEX_SIZE = 1.0;
const UNCLAIMED_SINK = 0.15; // unclaimed tiles sit slightly lower, like they're still in the fog
// Three playtest passes on this function now. First, the original
// per-terrain HSL desaturate (scale saturation down, nudge lightness toward
// mid-gray) read fine tile-by-tile but not at a glance: two terrain types
// with very different base lightness (sun-bleached sand vs. deep forest)
// still read as clearly different colors even dimmed, so "is this claimed?"
// wasn't legible across a mixed-terrain map. The fix for that — blending
// *hard* toward one shared neutral fog tone — overshot in the opposite
// direction: unclaimed tiles converged on one flat, near-indistinguishable
// tan regardless of terrain. Worse, `STEP_PROMPT_visuals_map_river.md` item
// 1 measured the ACTUAL rendered luminance (screenshot -> grayscale ->
// sample) and found that "blend toward fog" approach doesn't even reliably
// solve the original problem it was written for: for an already-light
// terrain like Beach, `fog` (itself a bright, near-white tone) is barely
// darker than the terrain's own full color, so claimed-vs-unclaimed Beach
// came out ONE point of luminance apart — invisible in grayscale, and a
// real accessibility failure for color-vision-deficient players, not just
// a subjective "looks kinda samey" complaint.
//
// The actual fix has to guarantee a real luminance gap structurally,
// regardless of how light or dark a given terrain's full color happens to
// be — blending toward a fixed *lighter* reference color can never do that
// for terrains already close to that reference. A flat HSL-lightness
// *subtraction* (an earlier version of this function, see git history)
// turned out to have the same class of problem one level down: THREE.js's
// `Color.getHSL()` runs in a color-managed working space, not naive sRGB
// hex math, so a hand-picked absolute lightness target doesn't mean what
// it looks like on paper — mangroveTeal's actual `l` there measures
// ~0.06, *below* a flat-subtraction version's own "floor" meant to
// protect already-dark colors from crushing to black, which made that
// floor clamp mangrove's unclaimed state *brighter* than its claimed
// state instead of darker. A *proportional* (multiplicative) lightness
// cut sidesteps the whole class of bug: multiplying any positive `l` by a
// fixed factor < 1 always reduces it and never needs a separate floor,
// regardless of which color space or absolute range `l` actually lives
// in. Verified against `tools/verify_readability.ts`, which reads real
// rendered pixels off the live WebGL canvas rather than trusting this
// math on paper — see that script for the actual measured deltas.
const UNCLAIMED_SATURATION_SCALE = 0.62; // how much of the terrain's own saturation survives — still reads "muted," not grayscale
const UNCLAIMED_LIGHTNESS_FACTOR = 0.3; // unclaimed lightness = claimed lightness * this — the real source of the claimed/unclaimed gap

interface TerrainInstance {
  coord: AxialCoord;
  index: number;
  terrainId: string;
  fullColor: THREE.Color;
  dimColor: THREE.Color;
  claimed: boolean;
  /** World position, cached so the swell does not re-derive it from the axial coord every frame. */
  x: number;
  z: number;
  /** This tile's offset into the swell cycle, in radians. Absent on land. */
  swellPhase?: number;
}

function dim(color: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return color.clone().setHSL(hsl.h, hsl.s * UNCLAIMED_SATURATION_SCALE, hsl.l * UNCLAIMED_LIGHTNESS_FACTOR);
}

/**
 * Which terrain types move, and how much.
 *
 * Water tiles were as static as the land, which is the single thing that most
 * made a board of a hundred tiles read as a diagram rather than a coast. Half
 * of some of these maps is open sea — on Palolem it is over a third of the
 * board — and a third of the screen holding perfectly still is a lot of
 * stillness to look at.
 *
 * The fix is a slow swell: each water tile rises and falls a few centimetres
 * and brightens very slightly, with its phase offset by position so the
 * motion travels across the map as a wave rather than pulsing in unison. Open
 * sea gets the largest amplitude, the river less (a channel is calmer than
 * open water), the estuary least of all — a mangrove shallow is the stillest
 * water on this coast, and that is worth saying visually.
 *
 * Deliberately small numbers. The job is to stop the sea looking painted on,
 * not to animate surf; anything large enough to notice as movement would also
 * be large enough to compete with the hazard overlays, which is where the
 * player's attention genuinely needs to go.
 */
interface SwellProfile {
  /** World-space vertical travel, peak to trough. */
  amplitudeY: number;
  /** Lightness added at the crest, as a fraction of the tile's own lightness. */
  lightnessGain: number;
  /** Seconds for one full cycle. */
  periodSeconds: number;
}

const SWELL_BY_TERRAIN: Record<string, SwellProfile> = {
  coast: { amplitudeY: 0.045, lightnessGain: 0.1, periodSeconds: 4.2 },
  river: { amplitudeY: 0.022, lightnessGain: 0.06, periodSeconds: 5.6 },
  estuary: { amplitudeY: 0.014, lightnessGain: 0.045, periodSeconds: 7.1 }
};

/**
 * How far the swell's phase advances per world unit travelled.
 *
 * This is what turns a field of independently bobbing tiles into a wave with
 * a direction. The two components differ so the crest lines run diagonally
 * across the board rather than square to it — a swell parallel to the tile
 * rows would read as the grid animating, not as water.
 */
const SWELL_PHASE_PER_X = 0.42;
const SWELL_PHASE_PER_Z = 0.27;

/** The crest tint target. Shared constant so the swell allocates nothing per frame. */
const WHITE = new THREE.Color(0xffffff);

/**
 * Whether the player has asked their system for reduced motion.
 *
 * Wrapped rather than called inline so the manager can be constructed in a
 * test environment with no `matchMedia`, which jsdom-less vitest runs are.
 * Defaults to "no preference expressed" on failure, matching what a browser
 * reports when the user has not set one.
 */
function matchMediaReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * v2.1: the terrain map is fixed (Section 4) — `loadMap` renders the whole
 * authored map at boot, unclaimed tiles dimmed and slightly sunken.
 * `claimTile` reveals one in place (rise + brighten), reusing the same
 * settle-animation feel the old player-drawn tiles had.
 */
export class TerrainMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();
  private placed = new Map<string, TerrainInstance>();
  private animator = new SettleAnimator();
  /** Water tiles only, in one flat list — see the note in `loadMap`. */
  private swellTiles: TerrainInstance[] = [];
  /**
   * Set while the swell is running. Turned off for a player who has asked
   * their system for reduced motion: this is decorative movement over a third
   * of the screen, which is exactly what that preference is about.
   *
   * Read once at construction rather than watched. A player changing the
   * setting mid-run gets the new behaviour on their next level, which is a
   * fair trade for not holding a media-query listener per session.
   */
  private readonly swellEnabled = !matchMediaReducedMotion();
  /** Scratch objects, reused every frame — allocating a Matrix4 and a Color per water tile per frame would be ~8000 objects a second on a large map. */
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchColor = new THREE.Color();

  constructor() {
    for (const terrain of TERRAIN_DEFS) {
      const geometry = createHexPrismGeometry(HEX_SIZE * 0.98, terrain.height);
      // Per-instance tint comes from InstancedMesh.instanceColor, which the
      // renderer picks up automatically — vertexColors is for a per-vertex
      // `color` geometry attribute we don't have, and would otherwise force
      // the shader to multiply against a missing (black) attribute.
      const material = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.9,
        metalness: 0.0
      });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_TERRAIN_INSTANCES_PER_TYPE);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TERRAIN_INSTANCES_PER_TYPE * 3), 3);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = `terrain-${terrain.id}`;
      this.meshes.set(terrain.id, mesh);
      this.counts.set(terrain.id, 0);
      this.group.add(mesh);
    }
  }

  height(terrainId: string): number {
    return TERRAIN_BY_ID.get(terrainId)?.height ?? 0.5;
  }

  hasTile(coord: AxialCoord): boolean {
    return this.placed.has(`${coord.q},${coord.r}`);
  }

  /** Renders the entire fixed map at once, every tile dimmed/sunken (unclaimed) except `claimedCoords`. */
  loadMap(mapTiles: { coord: AxialCoord; terrainId: string }[], claimedCoords: Iterable<AxialCoord>): void {
    const claimedKeys = new Set(Array.from(claimedCoords, (c) => `${c.q},${c.r}`));

    for (const { coord, terrainId } of mapTiles) {
      const terrain = TERRAIN_BY_ID.get(terrainId);
      if (!terrain) throw new Error(`Unknown terrain id: ${terrainId}`);
      const mesh = this.meshes.get(terrainId)!;
      const index = this.counts.get(terrainId)!;
      if (index >= MAX_TERRAIN_INSTANCES_PER_TYPE) throw new Error(`Terrain instance cap exceeded for ${terrainId}`);

      const { x, z } = axialToWorld(coord, HEX_SIZE);
      const key = `${coord.q},${coord.r}`;
      const claimed = claimedKeys.has(key);
      const seed = coord.q * 31 + coord.r * 17;
      const fullColor = jitterColor(paletteColor(terrain.colorKey), seed);
      const dimColor = dim(fullColor);

      const y = claimed ? 0 : -UNCLAIMED_SINK;
      mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, y, z));
      mesh.setColorAt(index, claimed ? fullColor : dimColor);

      this.counts.set(terrainId, index + 1);
      mesh.count = index + 1;

      this.placed.set(key, {
        coord,
        index,
        terrainId,
        fullColor,
        dimColor,
        claimed,
        x,
        z,
        swellPhase: SWELL_BY_TERRAIN[terrainId] ? x * SWELL_PHASE_PER_X + z * SWELL_PHASE_PER_Z : undefined
      });
    }

    // One flat list of just the water tiles, built once here rather than
    // filtered out of `placed` on every frame. On the largest map that is 130
    // tiles to walk per frame instead of 357.
    this.swellTiles = Array.from(this.placed.values()).filter((inst) => inst.swellPhase !== undefined);

    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /** Reveals a tile: rises to its resting height and brightens to full color, over ~SETTLE_DURATION_MS. */
  claimTile(coord: AxialCoord): void {
    const inst = this.placed.get(`${coord.q},${coord.r}`);
    if (!inst || inst.claimed) return;
    inst.claimed = true;

    const mesh = this.meshes.get(inst.terrainId)!;
    const { x, z } = axialToWorld(coord, HEX_SIZE);
    this.animator.begin(mesh, inst.index, x, z, 0, performance.now());
    mesh.setColorAt(inst.index, inst.fullColor);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /**
   * Overrides a tile's color (e.g. the flood telegraph darkening river
   * tiles), blending from whatever its current resting color is (dimmed if
   * still unclaimed, full if claimed). Pass `null` to restore that resting color.
   */
  setTint(coord: AxialCoord, tint: THREE.Color | null, blend = 0.6): void {
    const inst = this.placed.get(`${coord.q},${coord.r}`);
    if (!inst) return;
    const mesh = this.meshes.get(inst.terrainId)!;
    const resting = inst.claimed ? inst.fullColor : inst.dimColor;
    const color = tint ? resting.clone().lerp(tint, blend) : resting;
    mesh.setColorAt(inst.index, color);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Advances any in-flight settle animations. Call once per rendered frame. */
  tick(nowMs: number): void {
    this.animator.tick(nowMs);
    this.tickSwell(nowMs);
  }

  /**
   * Advances the water swell by one frame.
   *
   * Writes both the matrix and the colour for every water tile, every frame,
   * which sounds expensive and is not: it is a sine and two multiplies per
   * tile, at most 130 tiles on the largest map, into buffers that were going
   * to be uploaded anyway. The scratch matrix and colour are reused for the
   * same reason — the arithmetic is free, the allocations would not be.
   *
   * A tile mid-settle is skipped. `SettleAnimator` owns that instance's
   * matrix until the animation lands, and writing to it here would fight the
   * drop-in: the tile would judder between the two.
   */
  private tickSwell(nowMs: number): void {
    if (!this.swellEnabled || this.swellTiles.length === 0) return;

    const seconds = nowMs / 1000;
    const touched = new Set<THREE.InstancedMesh>();

    for (const inst of this.swellTiles) {
      const profile = SWELL_BY_TERRAIN[inst.terrainId];
      if (!profile) continue;
      if (this.animator.isAnimating(inst.index, this.meshes.get(inst.terrainId)!)) continue;

      const mesh = this.meshes.get(inst.terrainId)!;
      // Range [-1, 1]. `swellPhase` is what makes neighbouring tiles crest at
      // different moments, so the motion reads as a wave crossing the board.
      const wave = Math.sin((seconds / profile.periodSeconds) * Math.PI * 2 + inst.swellPhase!);

      const restY = inst.claimed ? 0 : -UNCLAIMED_SINK;
      mesh.setMatrixAt(
        inst.index,
        this.scratchMatrix.makeTranslation(inst.x, restY + (wave * profile.amplitudeY) / 2, inst.z)
      );

      // Brighten toward the crest only — the trough keeps the tile's own
      // colour. Darkening below it as well would read as the sea flickering
      // rather than catching the light.
      const base = inst.claimed ? inst.fullColor : inst.dimColor;
      const lift = Math.max(0, wave) * profile.lightnessGain;
      mesh.setColorAt(
        inst.index,
        this.scratchColor.copy(base).lerp(WHITE, lift)
      );

      touched.add(mesh);
    }

    for (const mesh of touched) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // The swell moves tiles by a few centimetres, which cannot meaningfully
      // change the mesh's bounds — but `InstancedMesh.boundingSphere` is
      // computed lazily and cached forever, and a sphere computed on a frame
      // where tiles happened to be at their trough is then used for every
      // later raycast. Invalidating keeps click-picking self-correcting, for
      // the cost of a null assignment. See SettleAnimator.tick for the bug
      // this class has already produced once.
      mesh.boundingSphere = null;
    }
  }

  /** Re-dims every tile back to unclaimed (a new era resetting the player's footprint — the map itself stays). */
  resetClaims(claimedCoords: Iterable<AxialCoord> = []): void {
    const claimedKeys = new Set(Array.from(claimedCoords, (c) => `${c.q},${c.r}`));
    for (const inst of this.placed.values()) {
      const mesh = this.meshes.get(inst.terrainId)!;
      inst.claimed = claimedKeys.has(`${inst.coord.q},${inst.coord.r}`);
      const { x, z } = axialToWorld(inst.coord, HEX_SIZE);
      const y = inst.claimed ? 0 : -UNCLAIMED_SINK;
      mesh.setMatrixAt(inst.index, new THREE.Matrix4().makeTranslation(x, y, z));
      mesh.setColorAt(inst.index, inst.claimed ? inst.fullColor : inst.dimColor);
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  /** Objects to include when raycasting for tile clicks. */
  get raycastTargets(): THREE.Object3D[] {
    return Array.from(this.meshes.values());
  }

  /** Maps a raycast hit (mesh + instanceId) back to the axial coord it represents. */
  coordForHit(object: THREE.Object3D, instanceId: number): AxialCoord | null {
    for (const inst of this.placed.values()) {
      if (this.meshes.get(inst.terrainId) === object && inst.index === instanceId) return inst.coord;
    }
    return null;
  }

  terrainIdAt(coord: AxialCoord): string | undefined {
    return this.placed.get(`${coord.q},${coord.r}`)?.terrainId;
  }

  isClaimedVisually(coord: AxialCoord): boolean {
    return this.placed.get(`${coord.q},${coord.r}`)?.claimed ?? false;
  }

  /** World-space Y a building/prop should sit at on this tile (its top surface). */
  heightAt(coord: AxialCoord): number {
    const terrainId = this.terrainIdAt(coord);
    return terrainId ? this.height(terrainId) : 0;
  }
}
