/**
 * One mutable pose shared by both bird rigs. The director owns one per bird
 * and rewrites its fields every frame (no allocation); the rig reads it in
 * `applyPose()`. Angles are radians in the bird's own frame (+Z forward,
 * +Y up, +X the bird's left).
 */
export interface BirdPose {
  /** + raises the head end of the body. */
  bodyPitch: number;
  /** + rolls toward the bird's right (banking right). */
  bodyRoll: number;
  /** Lifts the whole body (crouch < 0 < push). Model units. */
  bodyLift: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  /**
   * Neck: kingfisher 0 = hunched .. 1 = stretched forward (a dive).
   * Egret: 0 = S folded back on the shoulders (flight) .. 1 = tall S
   * (alert), with 0.5 the wading posture.
   */
  neck: number;
  /** Egret only: fore/aft head pull (-1 drawn back .. +1 thrust forward) for the walking bob. */
  neckThrust: number;
  /** + lifts the tail. */
  tailPitch: number;
  /** 0 spread .. 1 folded. */
  fold: number;
  /** Shoulder elevation, + up. */
  flap: number;
  /** + swings the spread wing back. */
  sweep: number;
  /** + leading edge up. */
  twist: number;
  /** + swings the hand back (upstroke). */
  wristFlex: number;
  /** 0..1 primaries fanned. */
  spread: number;
  /** 0 standing/perched .. 1 tucked (kingfisher) or trailing behind (egret). */
  legTuck: number;
  /** Kingfisher: show the fish in the bill. */
  carrying: boolean;
}

export function restPose(): BirdPose {
  return {
    bodyPitch: 0,
    bodyRoll: 0,
    bodyLift: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    neck: 0.5,
    neckThrust: 0,
    tailPitch: 0,
    fold: 1,
    flap: 0,
    sweep: 0,
    twist: 0,
    wristFlex: 0,
    spread: 1,
    legTuck: 0,
    carrying: false
  };
}

/**
 * A wing-beat waveform: `phase` in cycles. Returns elevation in [-1, 1]
 * with a quicker, stronger downstroke than upstroke (as birds beat), and
 * writes the upstroke's wrist fold into the second slot of `out`.
 */
export function beat(phase: number, out: [number, number]): [number, number] {
  const f = phase - Math.floor(phase);
  // 0..0.42 downstroke (top -> bottom), 0.42..1 upstroke.
  let e: number;
  if (f < 0.42) e = Math.cos((f / 0.42) * Math.PI);
  else e = -Math.cos(((f - 0.42) / 0.58) * Math.PI);
  out[0] = e;
  // The hand flexes back during the upstroke, most in its middle.
  out[1] = f < 0.42 ? 0 : Math.sin(((f - 0.42) / 0.58) * Math.PI);
  return out;
}
