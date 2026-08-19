/**
 * The 6 edge "socket" types used for tile placeability (WFC-lite).
 * Two tiles may share a border only if their touching edges are compatible
 * per EDGE_COMPATIBILITY below.
 */
export type EdgeType = "WATER" | "SAND" | "GRASS" | "FARM" | "ROCK" | "FOREST";

export const EDGE_TYPES: readonly EdgeType[] = ["WATER", "SAND", "GRASS", "FARM", "ROCK", "FOREST"];

/**
 * Compatibility is symmetric. An edge is always compatible with itself.
 * A few soft transitions are allowed (sand<->water, grass<->farm,
 * grass<->forest) so the hand isn't over-constrained; harsh transitions
 * (e.g. rock straight into water) are not.
 */
const SOFT_PAIRS: [EdgeType, EdgeType][] = [
  ["SAND", "WATER"],
  ["GRASS", "FARM"],
  ["GRASS", "FOREST"],
  ["GRASS", "SAND"],
  ["ROCK", "FOREST"],
  ["ROCK", "GRASS"],
  ["FARM", "WATER"],
  ["FARM", "SAND"],
  ["FOREST", "WATER"]
];

export function edgesCompatible(a: EdgeType, b: EdgeType): boolean {
  if (a === b) return true;
  return SOFT_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
