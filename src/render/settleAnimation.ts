import * as THREE from "three";

const SETTLE_DURATION_MS = 420;
const SETTLE_DROP_HEIGHT = 2.5;
const COLLAPSE_DURATION_MS = 500;

/**
 * STEP_PROMPT_liquid_glass_hud.md item 2.5: the exact scale sequence
 * given in the doc (copied from the Khazan Interface Study artifact),
 * read as (t-fraction, scaleXZ, scaleY) keyframes — a squash-and-stretch
 * "pop into existence and jiggle to rest," not a drop from above (no Y
 * offset anywhere here, unlike `begin()`'s SETTLE_DROP_HEIGHT). Linearly
 * interpolated between neighboring keyframes at tick time; the bounce
 * itself comes from the keyframe values overshooting past (1,1) and back,
 * not from an easing curve between them.
 */
const BUILD_CONFIRM_DURATION_MS = 620;
const BUILD_CONFIRM_KEYFRAMES: [number, number, number][] = [
  [0, 0.3, 1.7],
  [0.2, 1.32, 0.72],
  [0.5, 0.92, 1.1],
  [0.75, 1.04, 0.97],
  [1, 1, 1]
];

/** t in [0,1] -> eased [0,1] with a slight overshoot, for a "click into place" feel. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** Linearly interpolates BUILD_CONFIRM_KEYFRAMES at fraction `t` in [0,1] — returns [scaleXZ, scaleY]. */
function sampleBuildConfirmKeyframes(t: number): [number, number] {
  for (let i = 1; i < BUILD_CONFIRM_KEYFRAMES.length; i++) {
    const [tPrev, xzPrev, yPrev] = BUILD_CONFIRM_KEYFRAMES[i - 1];
    const [tNext, xzNext, yNext] = BUILD_CONFIRM_KEYFRAMES[i];
    if (t <= tNext) {
      const segmentT = tNext === tPrev ? 1 : (t - tPrev) / (tNext - tPrev);
      return [THREE.MathUtils.lerp(xzPrev, xzNext, segmentT), THREE.MathUtils.lerp(yPrev, yNext, segmentT)];
    }
  }
  const last = BUILD_CONFIRM_KEYFRAMES[BUILD_CONFIRM_KEYFRAMES.length - 1];
  return [last[1], last[2]];
}

interface SettleAnim {
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  z: number;
  finalY: number;
  startTime: number;
}

interface BuildConfirmAnim {
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  y: number;
  z: number;
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
  private buildConfirming: BuildConfirmAnim[] = [];
  private collapsing: CollapseAnim[] = [];

  /** Sets the instance's initial (elevated, shrunk) transform and registers it to animate in. */
  begin(mesh: THREE.InstancedMesh, index: number, x: number, z: number, finalY: number, nowMs: number): void {
    const matrix = new THREE.Matrix4().makeScale(0.4, 0.4, 0.4).setPosition(x, finalY + SETTLE_DROP_HEIGHT, z);
    mesh.setMatrixAt(index, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    this.active.push({ mesh, index, x, z, finalY, startTime: nowMs });
  }

  /**
   * STEP_PROMPT_liquid_glass_hud.md item 2.5: "diegetic build confirmation"
   * — a just-built element squash-and-stretches into its final shape in
   * place, rather than dropping in from above. Sets the instance to its
   * final position immediately (no elevated start) and registers it to
   * animate scale only.
   */
  beginBuildConfirm(mesh: THREE.InstancedMesh, index: number, x: number, z: number, finalY: number, nowMs: number): void {
    const matrix = new THREE.Matrix4().makeScale(0.3, 1.7, 0.3).setPosition(x, finalY, z);
    mesh.setMatrixAt(index, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    this.buildConfirming.push({ mesh, index, x, y: finalY, z, startTime: nowMs });
  }

  /** Animates an existing instance shrinking to nothing — a catastrophic engineered-defense failure. */
  collapse(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, nowMs: number): void {
    this.collapsing.push({ mesh, index, x, y, z, startTime: nowMs });
  }

  tick(nowMs: number): void {
    const touchedMeshes = new Set<THREE.InstancedMesh>();

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
        touchedMeshes.add(anim.mesh);
        if (t < 1) stillActive.push(anim);
      }
      this.active = stillActive;
    }

    if (this.buildConfirming.length > 0) {
      const stillConfirming: BuildConfirmAnim[] = [];
      for (const anim of this.buildConfirming) {
        const t = Math.min(1, (nowMs - anim.startTime) / BUILD_CONFIRM_DURATION_MS);
        const [scaleXZ, scaleY] = sampleBuildConfirmKeyframes(t);
        const matrix = new THREE.Matrix4().makeScale(scaleXZ, scaleY, scaleXZ).setPosition(anim.x, anim.y, anim.z);
        anim.mesh.setMatrixAt(anim.index, matrix);
        anim.mesh.instanceMatrix.needsUpdate = true;
        touchedMeshes.add(anim.mesh);
        if (t < 1) stillConfirming.push(anim);
      }
      this.buildConfirming = stillConfirming;
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
