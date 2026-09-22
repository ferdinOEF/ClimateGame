import * as THREE from "three";

/**
 * STEP_PROMPT_creature_reactions.md Section 1: every reaction is one
 * animation curve with an explicit plateau — grow toward the camera, hold
 * fully formed and still for ~30-40% of the duration, then exit. Skipping
 * the hold is what made earlier (non-Three.js) attempts read as flickery;
 * this mirrors SettleAnimator's tick-driven, render-loop-polled pattern
 * (`settleAnimation.ts`) but adds the hold phase SettleAnimator doesn't
 * need (a one-shot grow-in has nothing to hold before it settles), and
 * operates on ordinary `Object3D`s (creatures spawned standalone near a
 * tile) rather than `InstancedMesh` instance slots.
 */
const GROW_FRACTION = 0.25;
const HOLD_FRACTION = 0.35;
// EXIT_FRACTION is the remainder (0.40) — kept implicit so the three
// fractions can't drift out of summing to 1.

const MAX_CONCURRENT = 9;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

interface ActiveReaction {
  object: THREE.Object3D;
  startTime: number;
  durationMs: number;
  peakScale: number;
  baseY: number;
  riseY: number;
}

/**
 * Every creature/prop mesh used here is a small, shared, module-level
 * `BufferGeometry`/`Material` pair (built once in `creatureGeometry.ts`,
 * reused across every spawn) — a spawned reaction only ever creates a
 * lightweight `Object3D` wrapper around that shared geometry, never a
 * unique one. So `tick()` below never disposes anything on removal: there
 * is nothing per-spawn to free, only a scene-graph detach.
 */
export class ReactionAnimator {
  readonly group = new THREE.Group();
  private active: ActiveReaction[] = [];

  /** Spawns `object` (already positioned at its base/final world position) and animates it through grow→hold→exit. */
  spawn(object: THREE.Object3D, options: { durationMs?: number; peakScale?: number; rise?: number } = {}): void {
    if (this.active.length >= MAX_CONCURRENT) {
      // Rapid tapping shouldn't let reactions pile up unbounded — force-
      // finish (not gracefully animate out) the oldest to make room.
      const oldest = this.active.shift()!;
      this.group.remove(oldest.object);
    }
    const durationMs = options.durationMs ?? 2000;
    const peakScale = options.peakScale ?? 1;
    const rise = options.rise ?? 0;
    object.scale.setScalar(0.001);
    this.group.add(object);
    this.active.push({ object, startTime: performance.now(), durationMs, peakScale, baseY: object.position.y, riseY: rise });
  }

  tick(nowMs: number): void {
    if (this.active.length === 0) return;
    const stillActive: ActiveReaction[] = [];
    for (const r of this.active) {
      const t = Math.min(1, (nowMs - r.startTime) / r.durationMs);
      let scale: number;
      let yOffset: number;
      if (t < GROW_FRACTION) {
        const localT = t / GROW_FRACTION;
        const eased = easeOutCubic(localT);
        scale = eased * r.peakScale;
        yOffset = eased * r.riseY;
      } else if (t < GROW_FRACTION + HOLD_FRACTION) {
        scale = r.peakScale;
        yOffset = r.riseY;
      } else {
        const exitFraction = 1 - GROW_FRACTION - HOLD_FRACTION;
        const localT = Math.min(1, (t - GROW_FRACTION - HOLD_FRACTION) / exitFraction);
        scale = (1 - easeInCubic(localT)) * r.peakScale;
        yOffset = r.riseY;
      }
      r.object.scale.setScalar(Math.max(0.001, scale));
      r.object.position.y = r.baseY + yOffset;
      if (t < 1) {
        stillActive.push(r);
      } else {
        this.group.remove(r.object);
      }
    }
    this.active = stillActive;
  }
}
