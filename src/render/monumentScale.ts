/**
 * How big a monument is drawn, against its hex and the buildings round it (Section 18).
 *
 * Each landmark has its own model now (landmarkModels.ts), drawn to read at
 * the default zoom: it fills most of its hex, its plan reaching at most
 * `MAX_REACH` from the tile centre (inside the hex's 0.866 inner radius, so
 * about 0.85 of the hex across), and stands about `HEIGHT_RATIO` times the
 * tallest House on a neighbouring tile. The vertical scale stays within
 * `MIN_STRETCH`..`MAX_STRETCH` of the horizontal, so a model keeps its drawn
 * proportions: a tall church is not squashed to its street, a low school and
 * its pitch are not pulled up into a tower. A drawing choice, not a
 * measurement of the real buildings.
 *
 * Section 3's rule (1.6 times a House's footprint, 1.55 times its height) made
 * the old generic blocks; the new models carry their grounds (pitch, court,
 * palms), so they are sized by the hex they fill instead.
 *
 * Pure numbers in and out, so the rule is tested on its own (tests/cityHill.test.ts).
 */
export interface Size {
  /** Plan width (x) and depth (z), and height, world units. */
  w: number;
  d: number;
  h: number;
  /** The farthest any point of the plan reaches from the model's origin; half the plan diagonal when absent. */
  reach?: number;
}

export const HEIGHT_RATIO = 2;
/** The plan's farthest point from the tile centre, at most: the hex's inner radius is 0.866. */
export const MAX_REACH = 0.82;
/** The vertical scale against the horizontal, at least and at most. */
export const MIN_STRETCH = 0.75;
export const MAX_STRETCH = 1.35;

export function monumentScale(monument: Size, neighbour: Size): { sx: number; sy: number } {
  const reach = monument.reach ?? Math.hypot(monument.w, monument.d) / 2;
  const sx = MAX_REACH / reach;
  const sy = Math.min(Math.max((HEIGHT_RATIO * neighbour.h) / monument.h, sx * MIN_STRETCH), sx * MAX_STRETCH);
  return { sx, sy };
}

/** The ratios a scale gives, for the tests and the QA report. */
export function monumentRatios(monument: Size, neighbour: Size, scale: { sx: number; sy: number }): { footprint: number; height: number; reach: number } {
  return {
    footprint: (monument.w * monument.d * scale.sx * scale.sx) / (neighbour.w * neighbour.d),
    height: (monument.h * scale.sy) / neighbour.h,
    reach: (monument.reach ?? Math.hypot(monument.w, monument.d) / 2) * scale.sx
  };
}

/** How far a geometry's plan reaches from its origin (rotation does not change it). */
export function planReach(positions: ArrayLike<number>): number {
  let r = 0;
  for (let i = 0; i < positions.length; i += 3) r = Math.max(r, Math.hypot(positions[i], positions[i + 2]));
  return r;
}
