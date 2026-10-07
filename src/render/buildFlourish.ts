import * as THREE from "three";

/**
 * The little burst of movement when something is placed on a tile.
 *
 * WHY
 *
 * Placing a building was already animated — `SettleAnimator` drops the prop in
 * with an overshoot — but the drop happens entirely above the tile, so at this
 * game's near-top-down camera it reads as the prop appearing rather than as an
 * act of construction. The tile itself never acknowledged anything had
 * happened on it.
 *
 * This adds the ground half: a ring that expands and fades on the tile surface,
 * timed to land as the prop does. It is the cheapest way to make a click feel
 * like it did something, and on a 897-tile board where a player will place
 * dozens of things, "did that register?" is a real question to pre-empt.
 *
 * HOW IT IS BUILT
 *
 * A small pool of ring meshes, reused. The obvious alternative — create a mesh
 * per placement and dispose it on completion — allocates and frees a geometry
 * and a material several times a second during a building spree, and leaves
 * the collector to clean up after. A pool of eight covers any realistic burst,
 * and the oldest is recycled if somehow it does not.
 */

const POOL_SIZE = 8;
const DURATION_MS = 520;
/** How far above the tile's top surface the ring floats, so it does not z-fight with the terrain. */
const CLEARANCE = 0.04;
const START_RADIUS = 0.2;
const END_RADIUS = 0.95;

interface Ripple {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  startMs: number;
  active: boolean;
}

export class BuildFlourish {
  readonly group = new THREE.Group();
  private readonly ripples: Ripple[] = [];
  private next = 0;

  constructor() {
    // A unit ring, scaled per frame. Scaling one geometry beats rebuilding a
    // RingGeometry at a new radius every frame, which is what an earlier
    // version of this idea did and why it was never kept.
    const geometry = new THREE.RingGeometry(0.82, 1, 28);
    geometry.rotateX(-Math.PI / 2);

    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffe9a8"),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.ripples.push({ mesh, material, startMs: 0, active: false });
    }
  }

  /** Fires a ripple centred on a tile. `topY` is the tile's own surface height. */
  play(x: number, topY: number, z: number, nowMs: number): void {
    // Prefer a free slot; fall back to the oldest, so a burst of placements
    // drops the stalest ripple rather than silently doing nothing.
    const free = this.ripples.find((ripple) => !ripple.active);
    const ripple = free ?? this.ripples[this.next % POOL_SIZE];
    this.next++;

    ripple.startMs = nowMs;
    ripple.active = true;
    ripple.mesh.visible = true;
    ripple.mesh.position.set(x, topY + CLEARANCE, z);
    ripple.mesh.scale.setScalar(START_RADIUS);
    ripple.material.opacity = 0.75;
  }

  tick(nowMs: number): void {
    for (const ripple of this.ripples) {
      if (!ripple.active) continue;
      const t = (nowMs - ripple.startMs) / DURATION_MS;
      if (t >= 1) {
        ripple.active = false;
        ripple.mesh.visible = false;
        ripple.material.opacity = 0;
        continue;
      }
      // Fast out, slow to a stop — the shape of something spreading across a
      // surface rather than a circle growing at a constant rate.
      const eased = 1 - Math.pow(1 - t, 3);
      ripple.mesh.scale.setScalar(START_RADIUS + (END_RADIUS - START_RADIUS) * eased);
      // Fades on a steeper curve than it grows, so the ring thins out before
      // it reaches the tile edge instead of being cut off at full strength.
      ripple.material.opacity = 0.75 * (1 - t) * (1 - t);
    }
  }

  dispose(): void {
    for (const ripple of this.ripples) ripple.material.dispose();
    this.ripples[0]?.mesh.geometry.dispose();
  }
}
