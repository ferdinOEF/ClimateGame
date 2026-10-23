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
  /** Section 30.11 bug 13: none alone, because another defence covered for it: it shared the work. */
  shared?: boolean;
}

export interface PhaseResult {
  challengeId: string;
  /** "2030 · Cyclone". */
  eyebrow: string;
  stars: number;
  homesSaved: number;
  /** The homes in its path still standing when it hit (Section 22.4). */
  homesTotal: number;
  /** Homes in its path an earlier storm had already ruined: their own line on the card. */
  homesLostBefore: number;
  places: PlaceResult[];
  defences: DefenceResult[];
  /** Every row of the phase's objective was done when the storm came (Section 12): a badge, never stars. */
  objectiveComplete?: boolean;
  /** Section 25.2: the biodiversity line, where the level's stars count it. */
  nature?: NatureLine;
  /** Section 26.3: homes lost that the water alone would have left standing: the wind took them. */
  windLost: number;
  /** Section 30.9: with the objective done but fewer than 3 stars, one line on what stopped the third (a game rule). */
  shortOfThree?: string;
  /** Section 30.11 bug 1: a damaged place a seawall's end push reached (a game rule), named. */
  pushNote?: string;
}

/** Section 25.2: the card's second line: the board's biodiversity change since the run began, and why. */
export interface NatureLine {
  change: number;
  /** The rise three stars need (the level's houseStars.bioThree). */
  target: number;
  /** A few words on why (`natureReason`). */
  reason: string;
  /** The year it is compared with: the run's first. */
  since: number;
  /** Section 26.2: when it was measured, where not as the storm came ("at the end of 2050"). */
  at?: string;
}

/** How the cards name each defence in the plural. */
export const PLURAL: Record<string, string> = {
  dune: "Dunes",
  sandy_vegetation: "Pandanus",
  mangrove: "Mangroves",
  khazan: "Khazans",
  seawall: "Seawalls",
  breakwater: "Breakwaters",
  small_dam: "Small dams"
};

/**
 * Why the biodiversity moved, in a few words, from what each kind on the board adds or takes (`byKind`, each kind's
 * total `effects.biodiversity`): below the start, the kind that costs the most ("Seawalls cost nature"); short of
 * the three star rise, how far; at or over it, the kind that brings the most.
 */
export function natureReason(change: number, target: number, byKind: ReadonlyMap<string, number>): string {
  const kinds = [...byKind].filter(([id]) => PLURAL[id]);
  if (change < 0) {
    const worst = kinds.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])[0];
    return worst ? `${PLURAL[worst[0]]} cost nature` : "Nature is down";
  }
  if (change < target) return kinds.some(([, v]) => v > 0) ? `Short of the +${target} three stars need` : "No nature based defences yet";
  const best = kinds.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  return best ? `${PLURAL[best[0]]} bring nature back` : "Nature is up";
}

/** Each kind's total biodiversity on a board (defences only), for `natureReason`. */
export function biodiversityByKind(elements: Iterable<{ elementId: string }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const inst of elements) {
    const def = ELEMENT_BY_ID.get(inst.elementId);
    const v = def?.kind === "defense" ? (def.effects.biodiversity ?? 0) : 0;
    if (v !== 0) out.set(inst.elementId, (out.get(inst.elementId) ?? 0) + v);
  }
  return out;
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
export function phaseResult(challenge: ScheduledChallenge, record: StormRecord, area: readonly string[], places: readonly Place[], builtKinds: readonly string[], nature?: { target: number; since: number; at?: string; byKind: ReadonlyMap<string, number> }): PhaseResult {
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
    .map((elementId) => ({ elementId, name: ELEMENT_BY_ID.get(elementId)?.name ?? elementId, homes: saved.get(elementId) ?? 0, ...(record.sharedWork?.includes(elementId) ? { shared: true } : {}) }))
    .sort((a, b) => b.homes - a.homes || (a.name < b.name ? -1 : 1));
  return {
    challengeId: challenge.id,
    eyebrow: `${challenge.name} in ${challenge.year}`,
    stars: outcome.stars,
    homesSaved: outcome.housesSaved,
    homesTotal: outcome.housesTotal,
    // A run saved before Section 22 has no count of its own: none shown.
    homesLostBefore: outcome.housesLostBefore ?? 0,
    places: placeResults,
    defences,
    windLost: outcome.damagedHouses.filter((key) => !floodsHouse(record.depth.get(key) ?? 0)).length,
    ...(nature && outcome.biodiversityChange !== undefined
      ? { nature: { change: outcome.biodiversityChange, target: nature.target, since: nature.since, ...(nature.at ? { at: nature.at } : {}), reason: natureReason(outcome.biodiversityChange, nature.target, nature.byKind) } }
      : {})
  };
}

/**
 * Section 30.9: what kept a storm under three stars, in one line (the level's star lines are game rules): too many
 * homes lost, too little biodiversity, or both. Null at three stars.
 */
export function shortOfThree(stars: number, saved: number, total: number, thresholds: { three: number; bioThree?: number }, biodiversityChange?: number): string | null {
  if (stars >= 3) return null;
  const lost = total - saved;
  const allowed = Math.max(0, total - Math.ceil(thresholds.three * total - 1e-9));
  const homesShort = total > 0 && saved / total < thresholds.three;
  // Compared as shown (whole numbers), so the line never reads "+3; three stars need +3".
  const bioShort = thresholds.bioThree !== undefined && biodiversityChange !== undefined && Math.round(biodiversityChange) < thresholds.bioThree;
  const homes = `${lost} ${lost === 1 ? "home was" : "homes were"} lost; three stars allow ${allowed === 0 ? "none" : `${allowed} at most`}`;
  const sign = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : "0");
  const bio = bioShort ? `biodiversity was ${sign(Math.round(biodiversityChange!))}; three stars need ${sign(thresholds.bioThree!)}` : "";
  if (homesShort && bioShort) return `In this game ${homes}, and ${bio}.`;
  if (homesShort) return `In this game ${homes}.`;
  if (bioShort) return `In this game ${bio}.`;
  return null;
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
