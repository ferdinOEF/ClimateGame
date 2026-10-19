import { damageAt, floodsHouse, HAZARD_MODEL } from "./hazardModel";

/**
 * Damage to a Panjim landmark from one storm (Section 21.3). In this game a
 * landmark is damaged when the water on its tile (wind included) reaches the
 * line at which homes are lost, as the result cards count it ("Damaged"), and
 * destroyed at twice that. A destroyed landmark is drawn clearly broken but
 * still recognisable; nothing about the real buildings is claimed.
 *
 * Pure: no DOM, no renderer.
 */
export type LandmarkDamage = 0 | 1 | 2;

/** How many times the house-loss line the water must reach for a landmark to count as destroyed (a game rule). */
export const LANDMARK_DESTROYED_FACTOR = 2;

export function landmarkDamage(field: { depth: ReadonlyMap<string, number>; wind?: ReadonlyMap<string, number> }, key: string): LandmarkDamage {
  const depth = damageAt(field, key);
  if (depth >= HAZARD_MODEL.houseLossDepthM * LANDMARK_DESTROYED_FACTOR) return 2;
  return floodsHouse(depth) ? 1 : 0;
}

/** The worst a landmark has taken over every storm so far: damage piles up and never mends. */
export function landmarkDamageSoFar(records: Iterable<{ depth: ReadonlyMap<string, number>; wind?: ReadonlyMap<string, number> }>, key: string): LandmarkDamage {
  let worst: LandmarkDamage = 0;
  for (const record of records) worst = Math.max(worst, landmarkDamage(record, key)) as LandmarkDamage;
  return worst;
}
