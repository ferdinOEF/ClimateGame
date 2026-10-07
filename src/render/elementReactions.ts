import * as THREE from "three";
import { ReactionAnimator } from "./reactionAnimator";
import type { PlacedElement } from "./elementMeshManager";
import {
  kingfisherGeometry,
  egretGeometry,
  brahminyKiteGeometry,
  shorebirdGeometry,
  pigeonGeometry,
  cormorantGeometry,
  dragonflyGeometry,
  prawnGeometry,
  mudskipperGeometry,
  gardenLizardGeometry,
  ghostCrabGeometry,
  leapingFishGeometry,
  catGeometry,
  beachBallGeometry,
  palmFrondGeometry,
  particleBurstGeometry
} from "./creatureGeometry";

/**
 * STEP_PROMPT_creature_reactions.md Section 1: one shared, module-level
 * geometry+material per creature/prop type, built once and reused across
 * every spawn — a triggered reaction only ever creates a lightweight
 * `Mesh`/`Group` wrapper around these, never a unique geometry. Flat-
 * shaded, vertex-colored, `vertexColors: true` — matching every other
 * low-poly builder in this codebase (`elementMeshManager.ts`'s own
 * material). Deliberately its OWN material per creature (not shared with
 * `ElementMeshManager`'s per-element-type materials) — these meshes never
 * join that manager's `InstancedMesh` pool, so they never receive its
 * per-instance tint multiply (the `STEP_PROMPT_icon_legibility_pass.md`
 * addendum's gotcha) — confirmed by this separation, not assumed; the
 * Verify pass takes a screenshot to check it renders as authored anyway.
 */
function creatureMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8, vertexColors: true });
}

type CreatureId =
  | "kingfisher"
  | "egret"
  | "kite"
  | "shorebird"
  | "pigeon"
  | "cormorant"
  | "dragonfly"
  | "prawn"
  | "mudskipper"
  | "lizard"
  | "crab"
  | "fish"
  | "cat"
  | "beachBall"
  | "palmFrond";

const CREATURE_BUILDERS: Record<CreatureId, () => THREE.BufferGeometry> = {
  kingfisher: kingfisherGeometry,
  egret: egretGeometry,
  kite: brahminyKiteGeometry,
  shorebird: shorebirdGeometry,
  pigeon: pigeonGeometry,
  cormorant: cormorantGeometry,
  dragonfly: dragonflyGeometry,
  prawn: prawnGeometry,
  mudskipper: mudskipperGeometry,
  lizard: gardenLizardGeometry,
  crab: ghostCrabGeometry,
  fish: leapingFishGeometry,
  cat: catGeometry,
  beachBall: beachBallGeometry,
  palmFrond: palmFrondGeometry
};

const creatureGeometryCache = new Map<CreatureId, THREE.BufferGeometry>();
const creatureMaterialCache = new Map<CreatureId, THREE.MeshStandardMaterial>();

/**
 * Creatures spawned by the reaction currently being triggered, so `trigger()`
 * can say which species appeared (Panjim 2050's Field Guide collects them).
 */
let spawnLog: CreatureId[] = [];

function creatureMesh(id: CreatureId): THREE.Mesh {
  spawnLog.push(id);
  let geometry = creatureGeometryCache.get(id);
  if (!geometry) {
    geometry = CREATURE_BUILDERS[id]();
    creatureGeometryCache.set(id, geometry);
  }
  let material = creatureMaterialCache.get(id);
  if (!material) {
    material = creatureMaterial();
    creatureMaterialCache.set(id, material);
  }
  const mesh = new THREE.Mesh(geometry, material);
  // Lets a tap on the creature itself be recognised (see `speciesAt`).
  mesh.userData.species = id;
  return mesh;
}

/**
 * Particle bursts and the house window glow are cached too, keyed by shape.
 * Reactions fire continuously now (see the ambient scheduler), and the
 * animator only detaches a finished reaction — it never disposes — so a
 * geometry built per spawn would be a GPU buffer leaked every few seconds
 * for as long as the level ran.
 */
const particleGeometryCache = new Map<string, THREE.BufferGeometry>();
let particleMaterial: THREE.MeshStandardMaterial | null = null;

function particleGroup(count: number, radius: number, color: string): THREE.Mesh {
  const key = `${count}|${radius}|${color}`;
  let geometry = particleGeometryCache.get(key);
  if (!geometry) {
    geometry = particleBurstGeometry(count, radius, color);
    particleGeometryCache.set(key, geometry);
  }
  particleMaterial ??= creatureMaterial();
  return new THREE.Mesh(geometry, particleMaterial);
}

let windowGlowGeometry: THREE.BoxGeometry | null = null;
let windowGlowMaterial: THREE.MeshBasicMaterial | null = null;

function windowGlow(): THREE.Mesh {
  windowGlowGeometry ??= new THREE.BoxGeometry(0.09, 0.11, 0.012);
  windowGlowMaterial ??= new THREE.MeshBasicMaterial({ color: "#f4d9a6" });
  return new THREE.Mesh(windowGlowGeometry, windowGlowMaterial);
}

/**
 * Deterministic-cycle variety (Section 1): an ordered outcome list stepped
 * by an incrementing per-element-type counter, modulo the list length —
 * not `Math.random()`, which visibly clusters/repeats over a handful of
 * taps in a way a fixed cycle doesn't. One counter per element TYPE (not
 * per tile instance) — simpler, and reads fine at real tap cadence since a
 * player taps one tile a few times in a row far more often than they
 * round-robin between several tiles of the same element.
 */
class Cycle<T> {
  private index = 0;
  constructor(private readonly outcomes: T[]) {}
  next(): T {
    const outcome = this.outcomes[this.index % this.outcomes.length];
    this.index++;
    return outcome;
  }
}

// Mangrove: 1-3 of kingfisher/egret/kite, "all three together only rarely."
const MANGROVE_CYCLE = new Cycle<CreatureId[]>([
  ["kingfisher"],
  ["kite"],
  ["egret"],
  ["kingfisher", "egret"],
  ["kite", "egret"],
  ["kingfisher", "kite", "egret"]
]);

// Khazan: one of three water creatures, cycled (Section 1 explicitly names Khazan as needing the same cycle treatment as Mangrove, despite item 2's looser "randomized" wording).
const KHAZAN_CYCLE = new Cycle<CreatureId>(["dragonfly", "prawn", "mudskipper"]);

/** Wrapped so this can be constructed where `matchMedia` does not exist (vitest). Same check as `elementMeshManager.ts`. */
function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** See `trigger()`. */
const REACTION_SCALE = 1;

/** First ambient reaction lands this long after an element is first seen, in ms. */
const AMBIENT_FIRST_MS: [number, number] = [400, 4900];
/** Gap between one ambient reaction and the next on the same element, in ms. */
const AMBIENT_REPEAT_MS: [number, number] = [4500, 11000];
/**
 * Ambient spawns pause while this many reactions are already live. Below the
 * animator's own cap (`MAX_CONCURRENT`), so a tap always has room and never
 * finds its reaction force-finished by background play.
 */
export const AMBIENT_HEADROOM_CAP = 20;

function jitter([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function place(mesh: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * STEP_PROMPT_creature_reactions.md Section 2: spawns near a tapped tile's
 * built element, alongside (never instead of) the occupant info card —
 * `app/gameSession.ts`'s `openTilePopover()` calls `trigger()` in its `built` branch,
 * which already only runs once per click and only when something is
 * actually built there.
 */
export class ElementReactions {
  readonly group = new THREE.Group();
  private animator = new ReactionAnimator();
  /** Verify checklist: "tap 4-5 times, confirm visibly different outcomes" — records what each Mangrove/Khazan trigger actually chose, so a verification script can check the real deterministic-cycle sequence directly instead of diffing screenshots. */
  lastCombo: string[] = [];

  /**
   * Off for a player who has asked their system for reduced motion, matching
   * the element sway and the water swell. Only the ambient reactions stop: a
   * tap is something the player chose to do, so its reaction still plays.
   */
  private readonly ambientEnabled: boolean;

  constructor(options: { reducedMotion?: boolean } = {}) {
    this.ambientEnabled = !(options.reducedMotion ?? prefersReducedMotion());
    this.group.add(this.animator.group);
  }

  /**
   * Ambient mode: every placed element plays its own reaction on a staggered,
   * jittered timer — birds keep flushing from the mangroves, crabs and cats
   * keep appearing — with no click. Tapping still fires `trigger()` on top.
   *
   * The source is a function rather than a list so it is re-read every frame:
   * the element mesh manager is the one place that knows what is standing on
   * the board after a build, a storm, a removal or a board reset, and asking
   * it each frame means none of those paths has to remember to notify this.
   */
  private ambientSource: (() => Iterable<PlacedElement>) | null = null;
  /** When each placed element is next due to react, keyed by `PlacedElement.key`. */
  private nextAmbient = new Map<string, number>();

  setAmbientSource(source: () => Iterable<PlacedElement>): void {
    this.ambientSource = source;
  }

  tick(nowMs: number): void {
    this.animator.tick(nowMs);
    if (!this.ambientSource || !this.ambientEnabled) return;
    const seen = new Set<string>();
    let spawnedThisFrame = false;
    for (const el of this.ambientSource()) {
      seen.add(el.key);
      let due = this.nextAmbient.get(el.key);
      if (due === undefined) {
        // Staggered, so a board loaded with twenty elements does not fire
        // all twenty on the same frame.
        due = nowMs + jitter(AMBIENT_FIRST_MS);
        this.nextAmbient.set(el.key, due);
      }
      // One ambient spawn per frame keeps a backlog (a tab returning from the
      // background, say) from arriving as a single burst.
      if (nowMs < due || spawnedThisFrame) continue;
      // Never let ambient play evict a tap reaction: the animator force-
      // finishes its oldest reaction at the cap, so stop short of it.
      if (this.animator.activeCount >= AMBIENT_HEADROOM_CAP) continue;
      this.trigger(el.elementId, el.x, el.y, el.z);
      spawnedThisFrame = true;
      this.nextAmbient.set(el.key, nowMs + jitter(AMBIENT_REPEAT_MS));
    }
    // Unconditional (not gated on a size comparison): a destroy and a rebuild
    // in the same frame leave the counts equal but the keys different.
    for (const k of this.nextAmbient.keys()) if (!seen.has(k)) this.nextAmbient.delete(k);
  }

  /**
   * `originY` is the tile's terrain-top world Y (`terrain.heightAt`) —
   * every offset below is relative to that.
   *
   * Every placement takes a scale factor `f`. The version this was ported
   * from had grown its element geometry and scaled reactions to match; this
   * version's geometry is at its original size, so `f` is 1 throughout. It
   * stays a parameter so a future resize changes one number, not forty.
   */
  trigger(elementId: string, originX: number, originY: number, originZ: number): string[] {
    const factor = REACTION_SCALE;
    spawnLog = [];
    switch (elementId) {
      case "mangrove":
        this.mangrove(originX, originY, originZ, factor);
        break;
      case "khazan":
        this.khazan(originX, originY, originZ, factor);
        break;
      case "dune":
        this.dune(originX, originY, originZ, factor);
        break;
      case "sandy_vegetation":
        this.sandyVegetation(originX, originY, originZ, factor);
        break;
      case "house":
        this.house(originX, originY, originZ, factor);
        break;
      case "beachside_resort":
        this.beachsideResort(originX, originY, originZ, factor);
        break;
      case "seawall":
        this.seawall(originX, originY, originZ, factor);
        break;
      case "small_dam":
        this.smallDam(originX, originY, originZ, factor);
        break;
      case "sand_mining":
        this.sandMining(originX, originY, originZ, factor);
        break;
      case "breakwater":
        this.breakwater(originX, originY, originZ, factor);
        break;
      case "yacht":
        this.yacht(originX, originY, originZ, factor);
        break;
      // Any other/future element id: no reaction, not an error — a new
      // roster addition simply has none until explicitly given one.
    }
    return [...spawnLog];
  }

  /** The species of the creature (if any) under a ray, for tapping a creature directly. */
  speciesAt(raycaster: THREE.Raycaster): string | null {
    for (const hit of raycaster.intersectObjects(this.group.children, true)) {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        if (typeof object.userData.species === "string") return object.userData.species;
        object = object.parent;
      }
    }
    return null;
  }

  private mangrove(x: number, y: number, z: number, f: number): void {
    const combo = MANGROVE_CYCLE.next();
    this.lastCombo = combo;
    // The center clump's own canopy is a solid dome reaching local Y~0.76
    // (mangroveClump()'s canopyBase: baseY 0.28 + 2*radiusY 0.24) and
    // footprint out to roughly X/Z~0.3 — a bird "near the canopy" at a
    // modest height directly above the tree's own X/Z spawns INSIDE that
    // solid volume and is fully hidden behind it (confirmed live: pixel-
    // sampled zero color deviation at the computed spawn point, the only
    // element in the whole roster where that happened). Offsetting to the
    // side, clear of the canopy's footprint, reads as "swooping past the
    // cluster" instead and isn't occluded by it. Every offset here scales
    // by `f` so "clear of the canopy's footprint" stays true if the canopy
    // is ever resized.
    combo.forEach((id, i) => {
      const bird = creatureMesh(id);
      place(bird, x + 0.55 * f + (i - (combo.length - 1) / 2) * 0.13 * f, y + 0.3 * f, z + 0.3 * f);
      this.animator.spawn(bird, { durationMs: 2400, peakScale: f, rise: 0.1 * f });
    });
  }

  private khazan(x: number, y: number, z: number, f: number): void {
    const id = KHAZAN_CYCLE.next();
    this.lastCombo = [id];
    const creature = creatureMesh(id);
    // Water half of the tile — see khazanGeometry()'s own water box at
    // local x=-0.17. `rise` bumped further above the proportional scale
    // alone (not just *f) — Section 0 separately found this reaction
    // sitting mostly behind the built-tile info card's own bottom edge
    // (the card anchors above the tile in gameSession.ts, tuned for
    // taller features like a Seawall's cap course; Khazan's own reaction
    // is deliberately low, "from the water," so it never fully escapes
    // that anchor the way a taller reaction does) — the extra lift here
    // is a targeted compromise (clear more of the card without losing the
    // "emerging from the water" read), not a full fix to the card's own
    // anchor height, which stays out of scope for this tuning pass.
    place(creature, x - 0.17 * f, y + 0.05 * f, z);
    this.animator.spawn(creature, { durationMs: 1800, peakScale: 1.4 * f, rise: (id === "dragonfly" ? 0.3 : 0.2) * f });
  }

  private dune(x: number, y: number, z: number, f: number): void {
    const kickup = particleGroup(6, 0.05 * f, "#c9932e");
    place(kickup, x, y + 0.18 * f, z + 0.05 * f);
    this.animator.spawn(kickup, { durationMs: 1200, peakScale: f, rise: 0.03 * f });

    const lizard = creatureMesh("lizard");
    place(lizard, x + 0.06 * f, y + 0.22 * f, z + 0.05 * f);
    this.animator.spawn(lizard, { durationMs: 1600, peakScale: 1.1 * f, rise: 0.02 * f });
  }

  private sandyVegetation(x: number, y: number, z: number, f: number): void {
    const crab = creatureMesh("crab");
    place(crab, x + 0.1 * f, y + 0.02 * f, z);
    this.animator.spawn(crab, { durationMs: 1500, peakScale: 1.2 * f });
  }

  private house(x: number, y: number, z: number, f: number): void {
    // Window-glow pulse: two small warm-glow blocks at House's window inset positions (houseGeometry()'s own window(-0.18)/window(0.18)).
    const glowL = windowGlow();
    place(glowL, x - 0.18 * f, y + 0.16 * f, z + 0.26 * f);
    this.animator.spawn(glowL, { durationMs: 1800, peakScale: f });
    const glowR = windowGlow();
    place(glowR, x + 0.18 * f, y + 0.16 * f, z + 0.26 * f);
    this.animator.spawn(glowR, { durationMs: 1800, peakScale: f });

    const cat = creatureMesh("cat");
    place(cat, x, y + 0.02 * f, z + 0.34 * f);
    this.animator.spawn(cat, { durationMs: 2000, peakScale: f });
  }

  private beachsideResort(x: number, y: number, z: number, f: number): void {
    // Pool is at local (0.55, 0, -0.05) per beachsideResortGeometry() — the static model's own palm was removed in a later pass, so this frond is a new, small, transient reaction-only prop (same category as every other creature here), not a restoration of static geometry.
    const frond = creatureMesh("palmFrond");
    place(frond, x + 0.78 * f, y, z - 0.05 * f);
    this.animator.spawn(frond, { durationMs: 2200, peakScale: f });

    const ball = creatureMesh("beachBall");
    place(ball, x + 0.45 * f, y + 0.05 * f, z - 0.15 * f);
    this.animator.spawn(ball, { durationMs: 1600, peakScale: f, rise: 0.15 * f });

    const rippleA = particleGroup(8, 0.14 * f, "#8fc0c2");
    rippleA.scale.y = 0.05;
    place(rippleA, x + 0.55 * f, y + 0.02 * f, z - 0.05 * f);
    this.animator.spawn(rippleA, { durationMs: 1400, peakScale: f });
    const rippleB = particleGroup(8, 0.2 * f, "#8fc0c2");
    rippleB.scale.y = 0.05;
    place(rippleB, x + 0.55 * f, y + 0.02 * f, z - 0.05 * f);
    this.animator.spawn(rippleB, { durationMs: 1800, peakScale: f });
  }

  private seawall(x: number, y: number, z: number, f: number): void {
    const spray = particleGroup(7, 0.08 * f, "#c9dde2");
    place(spray, x, y + 0.42 * f, z + 0.18 * f);
    this.animator.spawn(spray, { durationMs: 900, peakScale: f, rise: 0.06 * f });

    const perch = new THREE.Group();
    const pigeonA = creatureMesh("pigeon");
    place(pigeonA, -0.12 * f, 0, 0);
    const pigeonB = creatureMesh("pigeon");
    place(pigeonB, 0.1 * f, 0, 0);
    perch.add(pigeonA, pigeonB);
    place(perch, x, y + 0.42 * f, z);
    this.animator.spawn(perch, { durationMs: 2600, peakScale: f, rise: 0.05 * f });
  }

  private smallDam(x: number, y: number, z: number, f: number): void {
    const mist = particleGroup(6, 0.06 * f, "#e7f0ef");
    place(mist, x, y + 0.34 * f, z);
    this.animator.spawn(mist, { durationMs: 1000, peakScale: f, rise: 0.08 * f });

    const fish = creatureMesh("fish");
    place(fish, x, y + 0.3 * f, z);
    this.animator.spawn(fish, { durationMs: 1300, peakScale: f, rise: 0.22 * f });
  }

  private sandMining(x: number, y: number, z: number, f: number): void {
    const puff = particleGroup(6, 0.07 * f, "#d5972e");
    place(puff, x, y + 0.4 * f, z);
    this.animator.spawn(puff, { durationMs: 900, peakScale: f, rise: 0.05 * f });

    // Fast, panicked timing — shorter hold, quicker exit than any other reaction here.
    const flock = new THREE.Group();
    const birdA = creatureMesh("shorebird");
    place(birdA, -0.06 * f, 0, 0);
    const birdB = creatureMesh("shorebird");
    place(birdB, 0.08 * f, 0.03 * f, -0.04 * f);
    flock.add(birdA, birdB);
    place(flock, x, y + 0.44 * f, z);
    this.animator.spawn(flock, { durationMs: 1100, peakScale: f, rise: 0.16 * f });
  }

  private breakwater(x: number, y: number, z: number, f: number): void {
    const bird = creatureMesh("cormorant");
    place(bird, x, y + 0.2 * f, z + 0.1 * f);
    this.animator.spawn(bird, { durationMs: 2200, peakScale: f, rise: 0.03 * f });
  }

  private yacht(x: number, y: number, z: number, f: number): void {
    // Not in the artifact's 10-item catalog — a fresh, deliberately minimal
    // design (per Section 0's restraint calibration): two small ripple
    // rings off the waterline, nothing else. `f` is 1.0 for Yacht (Section
    // 2 deliberately left it unscaled), so this is a no-op multiply, kept
    // for consistency with every other method rather than a special case.
    const rippleA = particleGroup(7, 0.12 * f, "#d8b158");
    rippleA.scale.y = 0.05;
    place(rippleA, x, y + 0.02 * f, z);
    this.animator.spawn(rippleA, { durationMs: 1300, peakScale: f });
    const rippleB = particleGroup(7, 0.18 * f, "#8fc0c2");
    rippleB.scale.y = 0.05;
    place(rippleB, x, y + 0.02 * f, z);
    this.animator.spawn(rippleB, { durationMs: 1600, peakScale: f });
  }
}
