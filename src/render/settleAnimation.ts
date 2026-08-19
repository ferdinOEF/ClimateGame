import * as THREE from "three";

const SETTLE_DURATION_MS = 420;
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
  begin(mesh: THREE.InstancedMesh, index: number, x: number, z: number, finalY: number, nowMs: number): void {
    const matrix = new THREE.Matrix4().makeScale(0.4, 0.4, 0.4).setPosition(x, finalY + SETTLE_DROP_HEIGHT, z);
    mesh.setMatrixAt(index, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    this.active.push({ mesh, index, x, z, finalY, startTime: nowMs });
  }

  /** Animates an existing instance shrinking to nothing — a catastrophic engineered-defense failure. */
  collapse(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, nowMs: number): void {
    this.collapsing.push({ mesh, index, x, y, z, startTime: nowMs });
  }

  tick(nowMs: number): void {
    if (this.active.length > 0) {
      const stillActive: SettleAnim[] = [];
      for (const anim of this.active) {
        const t = Math.min(1, (nowMs - anim.startTime) / SETTLE_DURATION_MS);
        const eased = easeOutBack(t);
        const y = anim.finalY + SETTLE_DROP_HEIGHT * (1 - eased);
        const scale = THREE.MathUtils.clamp(0.4 + 0.6 * eased, 0, 1.08);
        const matrix =
          t < 1
            ? new THREE.Matrix4().makeScale(scale, scale, scale).setPosition(anim.x, y, anim.z)
            : new THREE.Matrix4().makeTranslation(anim.x, anim.finalY, anim.z);
        anim.mesh.setMatrixAt(anim.index, matrix);
        anim.mesh.instanceMatrix.needsUpdate = true;
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
        if (t < 1) stillCollapsing.push(anim);
      }
      this.collapsing = stillCollapsing;
    }
  }
}
