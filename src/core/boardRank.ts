import { boardNameKey } from "./nameFilter";

/**
 * Section 37.3: the board's ranking, shared by every board answer (the top 10, a place for N points, a post, a rename).
 *
 * One row per name: the name's best run (names match as the player sees them: case and the width of characters do not
 * count). Ranks are dense: equal points share a rank and the next rank follows (1, 1, 2), never a gap (1, 1, 3).
 *
 * Pure: no database, no DOM.
 */
export interface RankedRow {
  id: string;
  name: string;
  points: number;
}

/** The key two names are the same name by (Section 37.9: `boardNameKey`, shared with the name check). */
export const nameKey = boardNameKey;

/**
 * The board's rows, one per name: the name's best (most points; on a tie the earliest, then the lowest id). `rows` in
 * any order; the result by points, most first, then earliest.
 */
export function bestPerName<T extends RankedRow & { createdAt?: number }>(rows: readonly T[]): T[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of sorted) {
    const key = nameKey(row.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** The dense rank `points` gets among `rows` (one per name): one more than the number of distinct totals above it. */
export function denseRank(points: number, rows: readonly { points: number }[]): number {
  const above = new Set<number>();
  for (const row of rows) if (row.points > points) above.add(row.points);
  return above.size + 1;
}

/** Each row with its dense rank (rows by points, most first). */
export function withDenseRanks<T extends { points: number }>(rows: readonly T[]): (T & { rank: number })[] {
  return rows.map((row) => ({ ...row, rank: denseRank(row.points, rows) }));
}
