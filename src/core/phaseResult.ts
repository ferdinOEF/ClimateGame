import { ELEMENT_BY_ID } from "./elements";
import { damageAt, floodsHouse } from "./hazardModel";
import type { ScheduledChallenge } from "./climate";
import type { StormRecord } from "./stormRecord";

/**
 * What the result cards show after a storm (Section 9), from the storm's own
 * record: no estimate, nothing random.
 *
 *   - STARS AND HOMES: the resolver's outcome (the level's houseStars rule).
 *   - PLACES: the named places (landmarks and monuments) in or next to the
 *     storm's area to protect, as the forecast drew it at the start of the
 *     phase. A place counts as Damaged when the water on its tile, with the
 *     player's defences, would have destroyed a house there (the same depth
 *     line the houses fall at); else it Stood. A game rule: the places
 *     themselves are not damaged on the map.
 *   - DEFENCES: one row per kind of defence the player built in the phase,
 *     with the homes that would have been lost without that kind: the same
 *     storm re-run on the board as it stood just before, with every defence
 *     of that kind removed and everything else equal (core/stormRecord.ts).
 *
 * Pure: no DOM, no renderer.
 */
export interface PlaceResult {
  name: string;
  stood: boolean;
}

export interface DefenceResult {
  elementId: string;
  name: string;
  /** Homes that would have been lost without this kind of defence. */
  homes: number;
}

export interface PhaseResult {
  challengeId: string;
  /** "2030 · Cyclone". */
  eyebrow: string;
  stars: number;
  homesSaved: number;
  homesTotal: number;
  places: PlaceResult[];
  defences: DefenceResult[];
  /** Every row of the phase's objective was done when the storm came (Section 12): a badge, never stars. */
  objectiveComplete?: boolean;
}

export interface Place {
  name: string;
  q: number;
  r: number;
}

/** Hex distance between two tile keys. */
function hexDistance(a: string, b: string): number {
  const [aq, ar] = a.split(",").map(Number);
  const [bq, br] = b.split(",").map(Number);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}

/** The named places in or next to `area` (a tile in it, or touching one), in the order given, each name once. */
export function placesInArea(places: readonly Place[], area: readonly string[]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const place of places) {
    if (seen.has(place.name)) continue;
    const key = `${place.q},${place.r}`;
    if (!area.some((tile) => hexDistance(tile, key) <= 1)) continue;
    seen.add(place.name);
    out.push(place);
  }
  return out;
}

/** The result of one storm, for its cards. `area` is its area to protect at the start of its phase; `builtKinds` the defences the player built in the phase. */
export function phaseResult(challenge: ScheduledChallenge, record: StormRecord, area: readonly string[], places: readonly Place[], builtKinds: readonly string[]): PhaseResult {
  const outcome = record.outcome;
  // Section 16 B4: the places in (or next to) the storm's area, and any other place it damaged (not the
  // labels that stand on the river or the sea); the damaged ones first.
  const damaged = (place: Place): boolean => floodsHouse(damageAt(record, `${place.q},${place.r}`));
  const inArea = placesInArea(places, area);
  const names = new Set(inArea.map((place) => place.name));
  const elsewhere = places.filter((place) => {
    if (names.has(place.name)) return false;
    const terrain = record.field.tiles.get(`${place.q},${place.r}`)?.terrainId;
    if (terrain === "river" || terrain === "coast" || !damaged(place)) return false;
    names.add(place.name);
    return true;
  });
  const listed = [...inArea, ...elsewhere].map((place) => ({ name: place.name, stood: !damaged(place) }));
  const placeResults = [...listed.filter((p) => !p.stood), ...listed.filter((p) => p.stood)];
  // Every kind built in the phase that still stood when the storm came was re-run without; one that was gone by then did nothing.
  const saved = record.withoutEach;
  const kinds = [...new Set(builtKinds)].filter((id) => (ELEMENT_BY_ID.get(id)?.effects.resilience ?? 0) > 0);
  const defences = kinds
    .map((elementId) => ({ elementId, name: ELEMENT_BY_ID.get(elementId)?.name ?? elementId, homes: saved.get(elementId) ?? 0 }))
    .sort((a, b) => b.homes - a.homes || (a.name < b.name ? -1 : 1));
  return {
    challengeId: challenge.id,
    eyebrow: `${challenge.name} in ${challenge.year}`,
    stars: outcome.stars,
    homesSaved: outcome.housesSaved,
    homesTotal: outcome.housesTotal,
    places: placeResults,
    defences
  };
}

/** Card 1's headline, by stars. */
export function resultHeadline(stars: number): string {
  if (stars >= 3) return "Your city came through.";
  if (stars === 2) return "Most of your city held.";
  return "Your city took a heavy hit.";
}

/** The button that leaves card 2: what comes next. */
export function nextLabel(next: ScheduledChallenge | null): string {
  if (!next) return "Panjim in 2050";
  if (next.kind === "compound") return `Next: cyclone and flood in ${next.year}`;
  return `Next: the ${next.kind} in ${next.year}`;
}
