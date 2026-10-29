import { axialToWorld } from "./hex";

/**
 * Section 37.6 (C1): the tile O moves the keyboard's cursor to. O cycles through exactly the tiles pulsing on the board,
 * in their order: from a pulsing tile to the next one (the last back to the first); from anywhere else to the pulsing
 * tile nearest the middle of the view (`centre`, world x and z). Null when nothing pulses.
 *
 * Pure: no renderer, no DOM.
 */
export function nextPulseTile(pulsing: readonly string[], cursor: string | null, centre: { x: number; z: number }): string | null {
  if (pulsing.length === 0) return null;
  const at = cursor === null ? -1 : pulsing.indexOf(cursor);
  if (at >= 0) return pulsing[(at + 1) % pulsing.length];
  let best = pulsing[0];
  let bestDistance = Infinity;
  for (const key of pulsing) {
    const [q, r] = key.split(",").map(Number);
    const { x, z } = axialToWorld({ q, r }, 1.0);
    const distance = Math.hypot(x - centre.x, z - centre.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }
  return best;
}
