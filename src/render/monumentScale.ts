/**
 * How big a monument is drawn, against the buildings round it (Section 3).
 *
 * A landmark should stand out from its street without swallowing it: its
 * footprint (plan area) about 1.6 times that of the largest House on a
 * neighbouring tile, and its height about 1.55 times that House's. Inside
 * the brief's ranges (1.5-1.7 and 1.3-1.8), and a drawing choice, not a
 * measurement of the real buildings.
 *
 * Pure numbers in and out, so the rule is tested on its own
 * (tests/monuments.test.ts).
 */
export interface Size {
  /** Plan width (x) and depth (z), and height, world units. */
  w: number;
  d: number;
  h: number;
}

export const FOOTPRINT_RATIO = 1.6;
export const HEIGHT_RATIO = 1.55;
/** Half the plan diagonal may not pass this, so a monument stays inside its hex (inner radius 0.866). */
export const MAX_HALF_DIAGONAL = 0.82;
/**
 * The vertical scale stays within this factor of the horizontal. A long, low
 * building (the market's shed, the palace) next to a tall apartment block
 * needs its walls and columns drawn taller than its plan scale to reach 1.3x
 * that block's height; 3 lets it, and nothing tall is ever squashed flat.
 */
export const MAX_DISTORTION = 3;

export function monumentScale(monument: Size, neighbour: Size): { sx: number; sy: number } {
  let sx = Math.sqrt((FOOTPRINT_RATIO * neighbour.w * neighbour.d) / (monument.w * monument.d));
  sx = Math.min(sx, MAX_HALF_DIAGONAL / (Math.hypot(monument.w, monument.d) / 2));
  let sy = (HEIGHT_RATIO * neighbour.h) / monument.h;
  sy = Math.min(Math.max(sy, sx / MAX_DISTORTION), sx * MAX_DISTORTION);
  return { sx, sy };
}

/** The ratios a scale gives, for the tests and the QA report. */
export function monumentRatios(monument: Size, neighbour: Size, scale: { sx: number; sy: number }): { footprint: number; height: number } {
  return {
    footprint: (monument.w * monument.d * scale.sx * scale.sx) / (neighbour.w * neighbour.d),
    height: (monument.h * scale.sy) / neighbour.h
  };
}
