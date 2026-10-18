import { axialDistance, axialKey, axialToWorld, type AxialCoord } from "./hex";

/**
 * A stretch of coast between two places on the board, and the tiles that
 * belong to it: Section 6's "Kala Academy to Sharada Mandir".
 *
 * A tile is in the stretch when it lies between the two places along the
 * line joining them, at most `inland` hexes on the land side of that line
 * and at most `seaward` hexes on the sea side. Which side is the land side is
 * read from the board (where the land tiles near the line are), so the two
 * places can be given in either order. Pure: no DOM, no renderer.
 */
export interface StretchSpec {
  from: AxialCoord;
  to: AxialCoord;
  /** Hexes from the line on the land side. */
  inland: number;
  /** Hexes from the line on the sea side (the coast in front of it). */
  seaward: number;
}

export interface StretchTile {
  coord: AxialCoord;
  terrainId: string;
}

/** Where `coord` lies against the line from `from` to `to`: `along` 0 to 1 between them, `across` in hexes (sign set by `side`). */
export function placeOnLine(coord: AxialCoord, from: AxialCoord, to: AxialCoord): { along: number; across: number } {
  const a = axialToWorld(from, 1);
  const b = axialToWorld(to, 1);
  const p = axialToWorld(coord, 1);
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const length2 = vx * vx + vz * vz;
  const along = length2 > 0 ? ((p.x - a.x) * vx + (p.z - a.z) * vz) / length2 : 0;
  // One hex is sqrt(3) world units centre to centre (axialToWorld at size 1).
  const across = length2 > 0 ? ((p.x - a.x) * vz - (p.z - a.z) * vx) / Math.sqrt(length2) / Math.sqrt(3) : 0;
  return { along, across };
}

/** The keys of every tile in the stretch. */
export function stretchTiles(tiles: Iterable<StretchTile>, spec: StretchSpec): Set<string> {
  const list = [...tiles].map((tile) => ({ tile, at: placeOnLine(tile.coord, spec.from, spec.to) }));
  // The land side: where the land near the line is.
  let sum = 0;
  for (const { tile, at } of list) {
    if (at.along < 0 || at.along > 1 || Math.abs(at.across) > 3) continue;
    if (tile.terrainId === "land") sum += Math.sign(at.across);
    if (tile.terrainId === "coast") sum -= Math.sign(at.across);
  }
  const side = sum >= 0 ? 1 : -1;
  const out = new Set<string>();
  for (const { tile, at } of list) {
    const across = at.across * side;
    if (at.along >= 0 && at.along <= 1 && across <= spec.inland && across >= -spec.seaward) out.add(axialKey(tile.coord));
  }
  return out;
}

/** The keys of every tile within `radius` hexes of `centre`: the ground round one place (Section 16.4's school). */
export function discTiles(tiles: Iterable<StretchTile>, centre: AxialCoord, radius: number): Set<string> {
  const out = new Set<string>();
  for (const tile of tiles) if (axialDistance(tile.coord, centre) <= radius) out.add(axialKey(tile.coord));
  return out;
}

/**
 * The locality label nearest `coord` (hex distance; ties to the name first in
 * the alphabet): which neighbourhood a tile belongs to.
 */
export function nearestLocality<T extends { name: string; q: number; r: number }>(coord: AxialCoord, localities: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestDistance = Infinity;
  for (const place of localities) {
    const d = axialDistance(place, coord);
    if (d < bestDistance || (d === bestDistance && best !== undefined && place.name < best.name)) {
      best = place;
      bestDistance = d;
    }
  }
  return best;
}

/** The keys of every tile whose nearest locality label is one of `names` (Section 16.5's Taleigao, Merces and St Cruz). */
export function localityTiles(tiles: Iterable<StretchTile>, localities: readonly { name: string; q: number; r: number }[], names: readonly string[]): Set<string> {
  const wanted = new Set(names);
  const out = new Set<string>();
  for (const tile of tiles) {
    const nearest = nearestLocality(tile.coord, localities);
    if (nearest && wanted.has(nearest.name)) out.add(axialKey(tile.coord));
  }
  return out;
}
