export interface AxialCoord {
  q: number;
  r: number;
}

export const HEX_DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];

export function axialKey(coord: AxialCoord): string {
  return `${coord.q},${coord.r}`;
}

export function axialFromKey(key: string): AxialCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

export function axialEqual(a: AxialCoord, b: AxialCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function axialAdd(a: AxialCoord, b: AxialCoord): AxialCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function neighbor(coord: AxialCoord, direction: number): AxialCoord {
  const d = HEX_DIRECTIONS[((direction % 6) + 6) % 6];
  return axialAdd(coord, d);
}

export function neighbors(coord: AxialCoord): AxialCoord[] {
  return HEX_DIRECTIONS.map((_, i) => neighbor(coord, i));
}

/** Cube distance between two axial hexes. */
export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const aq = a.q;
  const ar = a.r;
  const as = -aq - ar;
  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

/**
 * Returns the direction index (0-5) pointing from `a` to `b` if the two
 * hexes are adjacent, or null if they are not neighbors.
 */
export function edgeIndexTo(a: AxialCoord, b: AxialCoord): number | null {
  for (let i = 0; i < HEX_DIRECTIONS.length; i++) {
    if (axialEqual(neighbor(a, i), b)) return i;
  }
  return null;
}

/** The edge index on the neighboring tile that touches edge `index` on this tile. */
export function oppositeEdge(index: number): number {
  return (index + 3) % 6;
}

/** Axial -> world-space (x, z) for pointy-top hexes. Y is left for elevation. */
export function axialToWorld(coord: AxialCoord, hexSize: number): { x: number; z: number } {
  const x = hexSize * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const z = hexSize * (1.5 * coord.r);
  return { x, z };
}

export function hexRing(center: AxialCoord, radius: number): AxialCoord[] {
  if (radius === 0) return [center];
  const results: AxialCoord[] = [];
  let hex = axialAdd(center, { q: HEX_DIRECTIONS[4].q * radius, r: HEX_DIRECTIONS[4].r * radius });
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push(hex);
      hex = neighbor(hex, i);
    }
  }
  return results;
}

export function hexSpiral(center: AxialCoord, radius: number): AxialCoord[] {
  const results: AxialCoord[] = [center];
  for (let r = 1; r <= radius; r++) {
    results.push(...hexRing(center, r));
  }
  return results;
}
