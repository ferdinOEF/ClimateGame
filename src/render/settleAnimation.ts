import * as THREE from "three";

const SETTLE_DURATION_MS = 480;
const SETTLE_DROP_HEIGHT = 2.5;
const COLLAPSE_DURATION_MS = 500;

/** t in [0,1] -> eased [0,1] with a slight overshoot, for a "click into place" feel. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

interface SettleAnim {
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  z: number;
  finalY: number;
  startTime: number;
  /** The scale the instance lands at: 1 normally, smaller for a young planting that has yet to grow. */
  finalScale: number;
}

interface CollapseAnim {
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  y: number;
  z: number;
  startTime: number;
}

/** Shared drop-and-settle animation for any InstancedMesh-backed placed object (tiles, buildings, ...). */
export class SettleAnimator {
  private active: SettleAnim[] = [];
  private collapsing: CollapseAnim[] = [];

  /** Sets the instance's initial (elevated, shrunk) transform and registers it to animate in. */
  begin(mesh: THREE.InstancedMesh, index: number, x: number, z: number, finalY: number, nowMs: number, finalScale = 1): void {
    const matrix = new THREE.Matrix4().makeScale(0.4 * finalScale, 0.4 * finalScale, 0.4 * finalScale).setPosition(x, finalY + SETTLE_DROP_HEIGHT, z);
    mesh.setMatrixAt(index, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    this.active.push({ mesh, index, x, z, finalY, startTime: nowMs, finalScale });
  }

  /** Animates an existing instance shrinking to nothing — a catastrophic engineered-defense failure. */
  collapse(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, nowMs: number): void {
    this.collapsing.push({ mesh, index, x, y, z, startTime: nowMs });
  }

  /**
   * Whether this animator currently owns a given instance's transform.
   *
   * Exists so another per-frame effect can stand aside. `TerrainMeshManager`'s
   * water swell writes a matrix for every water tile on every frame; if it did
   * that to a tile mid-settle, the two would both be setting the same instance
   * and the tile would judder between its drop-in position and its swell
   * position instead of landing.
   *
   * Linear over both lists, which is the right shape here: both are empty on
   * the overwhelming majority of frames and hold a handful of entries on the
   * rest, so an index would cost more to maintain than it saves.
   */
  isAnimating(index: number, mesh: THREE.InstancedMesh): boolean {
    for (const anim of this.active) {
      if (anim.index === index && anim.mesh === mesh) return true;
    }
    for (const anim of this.collapsing) {
      if (anim.index === index && anim.mesh === mesh) return true;
    }
    return false;
  }

  tick(nowMs: number): void {
    const touchedMeshes = new Set<THREE.InstancedMesh>();

    if (this.active.length > 0) {
      const stillActive: SettleAnim[] = [];
      for (const anim of this.active) {
        const t = Math.min(1, (nowMs - anim.startTime) / SETTLE_DURATION_MS);
        const eased = easeOutBack(t);
        const y = anim.finalY + SETTLE_DROP_HEIGHT * (1 - eased);
        const scale = THREE.MathUtils.clamp(0.4 + 0.6 * eased, 0, 1.08) * anim.finalScale;

        /*
         * Squash and stretch, on top of the existing drop.
         *
         * The drop alone happens entirely above the tile, which at this
         * game's near-top-down camera reads as the prop appearing rather than
         * as it landing. Stretching it tall while it falls and squashing it
         * wide as it touches down is the oldest trick there is for selling an
         * impact, and it costs two multiplies.
         *
         * The window is the last fifth of the animation, where `easeOutBack`
         * is already overshooting — so the squash lands on the bounce rather
         * than fighting it.
         */
        const impact = t < 0.8 ? 0 : Math.sin(((t - 0.8) / 0.2) * Math.PI);
        const stretch = t < 0.8 ? 1 + (1 - t) * 0.22 : 1 - impact * 0.18;
        const spread = t < 0.8 ? 1 - (1 - t) * 0.12 : 1 + impact * 0.14;

        const matrix =
          t < 1
            ? new THREE.Matrix4()
                .makeScale(scale * spread, scale * stretch, scale * spread)
                .setPosition(anim.x, y, anim.z)
            : new THREE.Matrix4().makeScale(anim.finalScale, anim.finalScale, anim.finalScale).setPosition(anim.x, anim.finalY, anim.z);
        anim.mesh.setMatrixAt(anim.index, matrix);
        anim.mesh.instanceMatrix.needsUpdate = true;
        touchedMeshes.add(anim.mesh);
        if (t < 1) stillActive.push(anim);
      }
      this.active = stillActive;
    }

    if (this.collapsing.length > 0) {
      const stillCollapsing: CollapseAnim[] = [];
      for (const anim of this.collapsing) {
        const t = Math.min(1, (nowMs - anim.startTime) / COLLAPSE_DURATION_MS);
        const scale = Math.max(0, 1 - t);
        const matrix = new THREE.Matrix4().makeScale(scale, scale, scale).setPosition(anim.x, anim.y, anim.z);
        anim.mesh.setMatrixAt(anim.index, matrix);
        anim.mesh.instanceMatrix.needsUpdate = true;
        touchedMeshes.add(anim.mesh);
        if (t < 1) stillCollapsing.push(anim);
      }
      this.collapsing = stillCollapsing;
    }

    // InstancedMesh.boundingSphere is computed lazily (on first raycast or
    // first frustum-culling check) and then cached forever — it's never
    // auto-recomputed as instances move. Without this, a bounding sphere
    // computed while a tile/element is mid-flight (e.g. still at its
    // elevated "drop-in" position, or several tiles claimed in one burst
    // before the first render frame — exactly what happens under
    // `?autoclaim=N`) freezes at that stale, wrong-shaped volume, and
    // every later raycast against that instance silently reports zero
    // hits even though the mesh is clearly visible on screen — a click
    // that looks correct but produces no game action. Invalidating here
    // every tick an animation is in flight keeps it self-correcting once
    // the animation settles, at near-zero cost (a null assignment) and
    // only while something is actually moving.
    for (const mesh of touchedMeshes) mesh.boundingSphere = null;
  }
}
