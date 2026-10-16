import { axialKey, neighbor } from "./hex";

/**
 * The area to protect as one shape (Section 14): the houses at stake are
 * scattered, so an outline round each tile drew many small islands. A
 * morphological closing (grow by one tile, then shrink by one) joins tiles
 * that are one gap apart into one outline, and fills one-tile holes, while
 * tiles far apart stay separate shapes. Pure: keys in, keys out.
 */
export function mergedArea(keys: readonly string[], reach = 2): string[] {
  const toCoord = (key: string) => {
    const [q, r] = key.split(",").map(Number);
    return { q, r };
  };
  // Grow `reach` tiles, then shrink `reach` tiles: gaps up to 2 × reach − 1 tiles wide close.
  let grown = new Set(keys);
  for (let i = 0; i < reach; i++) {
    const next = new Set(grown);
    for (const key of grown) for (let d = 0; d < 6; d++) next.add(axialKey(neighbor(toCoord(key), d)));
    grown = next;
  }
  for (let i = 0; i < reach; i++) {
    const next = new Set<string>();
    for (const key of grown) {
      let all = true;
      for (let d = 0; d < 6 && all; d++) all = grown.has(axialKey(neighbor(toCoord(key), d)));
      if (all) next.add(key);
    }
    grown = next;
  }
  // Every original tile stays in.
  for (const key of keys) grown.add(key);
  return [...grown].sort();
}

/** How many separate shapes a set of tiles makes (edge-connected). */
export function shapeCount(keys: readonly string[]): number {
  const left = new Set(keys);
  let shapes = 0;
  for (const start of keys) {
    if (!left.has(start)) continue;
    shapes++;
    const stack = [start];
    left.delete(start);
    while (stack.length > 0) {
      const [q, r] = stack.pop()!.split(",").map(Number);
      for (let d = 0; d < 6; d++) {
        const key = axialKey(neighbor({ q, r }, d));
        if (left.has(key)) {
          left.delete(key);
          stack.push(key);
        }
      }
    }
  }
  return shapes;
}
