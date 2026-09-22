import * as THREE from "three";
import { ReactionAnimator } from "./reactionAnimator";
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

function creatureMesh(id: CreatureId): THREE.Mesh {
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
  return new THREE.Mesh(geometry, material);
}

function particleGroup(count: number, radius: number, color: string): THREE.Mesh {
  return new THREE.Mesh(particleBurstGeometry(count, radius, color), creatureMaterial());
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

function place(mesh: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * STEP_PROMPT_creature_reactions.md Section 2: spawns near a tapped tile's
 * built element, alongside (never instead of) the occupant info card —
 * `main.ts`'s `openTilePopover()` calls `trigger()` in its `built` branch,
 * which already only runs once per click and only when something is
 * actually built there.
 */
export class ElementReactions {
  readonly group = new THREE.Group();
  private animator = new ReactionAnimator();
  /** Verify checklist: "tap 4-5 times, confirm visibly different outcomes" — records what each Mangrove/Khazan trigger actually chose, so a verification script can check the real deterministic-cycle sequence directly instead of diffing screenshots. */
  lastCombo: string[] = [];

  constructor() {
    this.group.add(this.animator.group);
  }

  tick(nowMs: number): void {
    this.animator.tick(nowMs);
  }

  /** `originY` is the tile's terrain-top world Y (`terrain.heightAt`) — every offset below is relative to that. */
  trigger(elementId: string, originX: number, originY: number, originZ: number): void {
    switch (elementId) {
      case "mangrove":
        this.mangrove(originX, originY, originZ);
        break;
      case "khazan":
        this.khazan(originX, originY, originZ);
        break;
      case "dune":
        this.dune(originX, originY, originZ);
        break;
      case "sandy_vegetation":
        this.sandyVegetation(originX, originY, originZ);
        break;
      case "house":
        this.house(originX, originY, originZ);
        break;
      case "beachside_resort":
        this.beachsideResort(originX, originY, originZ);
        break;
      case "seawall":
        this.seawall(originX, originY, originZ);
        break;
      case "small_dam":
        this.smallDam(originX, originY, originZ);
        break;
      case "sand_mining":
        this.sandMining(originX, originY, originZ);
        break;
      case "breakwater":
        this.breakwater(originX, originY, originZ);
        break;
      case "yacht":
        this.yacht(originX, originY, originZ);
        break;
      // Any other/future element id: no reaction, not an error — a new
      // roster addition simply has none until explicitly given one.
    }
  }

  private mangrove(x: number, y: number, z: number): void {
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
    // cluster" instead and isn't occluded by it.
    combo.forEach((id, i) => {
      const bird = creatureMesh(id);
      place(bird, x + 0.55 + (i - (combo.length - 1) / 2) * 0.13, y + 0.3, z + 0.3);
      this.animator.spawn(bird, { durationMs: 2400, peakScale: 1, rise: 0.1 });
    });
  }

  private khazan(x: number, y: number, z: number): void {
    const id = KHAZAN_CYCLE.next();
    this.lastCombo = [id];
    const creature = creatureMesh(id);
    // Water half of the tile — see khazanGeometry()'s own water box at local x=-0.17.
    place(creature, x - 0.17, y + 0.05, z);
    this.animator.spawn(creature, { durationMs: 1800, peakScale: 1.4, rise: id === "dragonfly" ? 0.18 : 0.08 });
  }

  private dune(x: number, y: number, z: number): void {
    const kickup = particleGroup(6, 0.05, "#c9932e");
    place(kickup, x, y + 0.18, z + 0.05);
    this.animator.spawn(kickup, { durationMs: 1200, peakScale: 1, rise: 0.03 });

    const lizard = creatureMesh("lizard");
    place(lizard, x + 0.06, y + 0.22, z + 0.05);
    this.animator.spawn(lizard, { durationMs: 1600, peakScale: 1.1, rise: 0.02 });
  }

  private sandyVegetation(x: number, y: number, z: number): void {
    const crab = creatureMesh("crab");
    place(crab, x + 0.1, y + 0.02, z);
    this.animator.spawn(crab, { durationMs: 1500, peakScale: 1.2 });
  }

  private house(x: number, y: number, z: number): void {
    // Window-glow pulse: two small warm-glow blocks at House's window inset positions (houseGeometry()'s own window(-0.18)/window(0.18)).
    const glowL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.012), new THREE.MeshBasicMaterial({ color: "#f4d9a6" }));
    place(glowL, x - 0.18, y + 0.16, z + 0.26);
    this.animator.spawn(glowL, { durationMs: 1800, peakScale: 1 });
    const glowR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.012), new THREE.MeshBasicMaterial({ color: "#f4d9a6" }));
    place(glowR, x + 0.18, y + 0.16, z + 0.26);
    this.animator.spawn(glowR, { durationMs: 1800, peakScale: 1 });

    const cat = creatureMesh("cat");
    place(cat, x, y + 0.02, z + 0.34);
    this.animator.spawn(cat, { durationMs: 2000, peakScale: 1 });
  }

  private beachsideResort(x: number, y: number, z: number): void {
    // Pool is at local (0.55, 0, -0.05) per beachsideResortGeometry() — the static model's own palm was removed in a later pass, so this frond is a new, small, transient reaction-only prop (same category as every other creature here), not a restoration of static geometry.
    const frond = creatureMesh("palmFrond");
    place(frond, x + 0.78, y, z - 0.05);
    this.animator.spawn(frond, { durationMs: 2200, peakScale: 1 });

    const ball = creatureMesh("beachBall");
    place(ball, x + 0.45, y + 0.05, z - 0.15);
    this.animator.spawn(ball, { durationMs: 1600, peakScale: 1, rise: 0.15 });

    const rippleA = particleGroup(8, 0.14, "#8fc0c2");
    rippleA.scale.y = 0.05;
    place(rippleA, x + 0.55, y + 0.02, z - 0.05);
    this.animator.spawn(rippleA, { durationMs: 1400, peakScale: 1 });
    const rippleB = particleGroup(8, 0.2, "#8fc0c2");
    rippleB.scale.y = 0.05;
    place(rippleB, x + 0.55, y + 0.02, z - 0.05);
    this.animator.spawn(rippleB, { durationMs: 1800, peakScale: 1 });
  }

  private seawall(x: number, y: number, z: number): void {
    const spray = particleGroup(7, 0.08, "#c9dde2");
    place(spray, x, y + 0.42, z + 0.18);
    this.animator.spawn(spray, { durationMs: 900, peakScale: 1, rise: 0.06 });

    const perch = new THREE.Group();
    const pigeonA = creatureMesh("pigeon");
    place(pigeonA, -0.12, 0, 0);
    const pigeonB = creatureMesh("pigeon");
    place(pigeonB, 0.1, 0, 0);
    perch.add(pigeonA, pigeonB);
    place(perch, x, y + 0.42, z);
    this.animator.spawn(perch, { durationMs: 2600, peakScale: 1, rise: 0.05 });
  }

  private smallDam(x: number, y: number, z: number): void {
    const mist = particleGroup(6, 0.06, "#e7f0ef");
    place(mist, x, y + 0.34, z);
    this.animator.spawn(mist, { durationMs: 1000, peakScale: 1, rise: 0.08 });

    const fish = creatureMesh("fish");
    place(fish, x, y + 0.3, z);
    this.animator.spawn(fish, { durationMs: 1300, peakScale: 1, rise: 0.22 });
  }

  private sandMining(x: number, y: number, z: number): void {
    const puff = particleGroup(6, 0.07, "#d5972e");
    place(puff, x, y + 0.4, z);
    this.animator.spawn(puff, { durationMs: 900, peakScale: 1, rise: 0.05 });

    // Fast, panicked timing — shorter hold, quicker exit than any other reaction here.
    const flock = new THREE.Group();
    const birdA = creatureMesh("shorebird");
    place(birdA, -0.06, 0, 0);
    const birdB = creatureMesh("shorebird");
    place(birdB, 0.08, 0.03, -0.04);
    flock.add(birdA, birdB);
    place(flock, x, y + 0.44, z);
    this.animator.spawn(flock, { durationMs: 1100, peakScale: 1, rise: 0.16 });
  }

  private breakwater(x: number, y: number, z: number): void {
    const bird = creatureMesh("cormorant");
    place(bird, x, y + 0.2, z + 0.1);
    this.animator.spawn(bird, { durationMs: 2200, peakScale: 1, rise: 0.03 });
  }

  private yacht(x: number, y: number, z: number): void {
    // Not in the artifact's 10-item catalog — a fresh, deliberately minimal
    // design (per Section 0's restraint calibration): two small ripple
    // rings off the waterline, nothing else.
    const rippleA = particleGroup(7, 0.12, "#d8b158");
    rippleA.scale.y = 0.05;
    place(rippleA, x, y + 0.02, z);
    this.animator.spawn(rippleA, { durationMs: 1300, peakScale: 1 });
    const rippleB = particleGroup(7, 0.18, "#8fc0c2");
    rippleB.scale.y = 0.05;
    place(rippleB, x, y + 0.02, z);
    this.animator.spawn(rippleB, { durationMs: 1600, peakScale: 1 });
  }
}
