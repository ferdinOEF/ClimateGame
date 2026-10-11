import RELIEF_DATA from "@data/relief.json";

/**
 * How a land tile's real ground height becomes height on the board.
 *
 * The metres come from a DEM (see the map's `elevation` block); how tall they
 * are drawn is a gameRule in `src/data/relief.json`. Pure, so the renderer
 * and the tests agree on the same numbers.
 */
export interface ReliefConfig {
  worldUnitsPerMetre: number;
  maxLiftWorld: number;
  contourIntervalM: number;
  contourColor: string;
  contourOpacity: number;
  contourLift: number;
  /** Width of a contour ribbon, world units. */
  contourWidth: number;
  /** How dark a raised tile's step sides are drawn, as a multiple of its top colour. */
  sideShade: number;
}

export const RELIEF: ReliefConfig = RELIEF_DATA as ReliefConfig;

/** World units a tile at `elevationM` stands above its terrain's flat height. 0 for no elevation. */
export function reliefLift(elevationM: number | undefined, config: ReliefConfig = RELIEF): number {
  if (elevationM === undefined || !(elevationM > 0)) return 0;
  return Math.min(config.maxLiftWorld, elevationM * config.worldUnitsPerMetre);
}

/**
 * How many contour lines lie between two neighbouring heights: the multiples
 * of the interval in (low, high]. A shared edge carries a contour when this
 * is at least one.
 */
export function contoursBetween(a: number, b: number, config: ReliefConfig = RELIEF): number {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  const step = config.contourIntervalM;
  return Math.floor(high / step) - Math.floor(low / step);
}
