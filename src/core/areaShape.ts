import { axialKey, neighbor } from "./hex";

/**
 * The area to protect as one shape (Section 14): the houses at stake are
 * scattered, so an outline round each tile drew many small islands. A
 * morphological closing (grow by one tile, then shrink by one) joins tiles
 * that are one gap apart into one outline, and fills one-tile holes, while
 * tiles far apart stay separate shapes. Pure: keys in, keys out.
 */
export function mergedArea(keys: readonly string[]): string[] {
  const coords = keys.map((key) => {
    const [q, r] = key.split(",").map(Number);
    return { q, r };
  });
  const grown = new Set(keys);
  for (const c of coords) for (let d = 0; d < 6; d++) grown.add(axialKey(neighbor(c, d)));
  const kept: string[] = [];
  for (const key of grown) {
    const [q, r] = key.split(",").map(Number);
    let all = true;
    for (let d = 0; d < 6 && all; d++) all = grown.has(axialKey(neighbor({ q, r }, d)));
    // Every original tile stays; a new one only where the grown area surrounds it.
    if (all || keys.includes(key)) kept.push(key);
  }
  return kept.sort();
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
