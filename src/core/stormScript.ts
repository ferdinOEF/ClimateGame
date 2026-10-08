import { axialKey, neighbor } from "./hex";
import { arrivalTime, hitTime, type DepthField } from "./hazard";
import type { ChallengeOutcome } from "./zones";
import { defendsAgainst, type StormRecord } from "./stormRecord";

/**
 * The storm's script: every moment the visuals mark, in storm time, taken
 * from the resolution rather than from timers.
 *
 *   - a house goes when the water on it first passes the damage line
 *     (`hitTime`), and only the houses the resolver lost go;
 *   - a defence answers when the water first reaches it or the tile beside
 *     it, and how it answers (held, overwhelmed, failed) is what the resolver
 *     recorded for it;
 *   - the first defence the water reaches gets the slow-motion beat;
 *   - lightning strikes sparsely around landfall (cyclones and the finale).
 *
 * Pure: no DOM, no renderer.
 */
export type DefenceResult = "held" | "overwhelmed" | "failed";

export type StormEvent =
  | { t: number; type: "house"; key: string }
  | { t: number; type: "defence"; key: string; elementId: string; result: DefenceResult; first: boolean }
  | { t: number; type: "landfall" }
  | { t: number; type: "lightning"; seed: number };

export interface StormScript {
  events: StormEvent[];
  duration: number;
  /** Storm time of the first defence the water reaches (the slow-motion beat), or null. */
  firstContact: number | null;
}

/** Minimum gap between strikes: well under three flashes a second. */
export const LIGHTNING_GAP = 2.5;

function defenceResult(outcome: ChallengeOutcome, key: string): DefenceResult {
  for (const zone of outcome.zones) {
    if (zone.failed.includes(key)) return "failed";
    if (zone.overwhelmed.includes(key)) return "overwhelmed";
  }
  return "held";
}

/**
 * The defences this storm actually tested: those standing in a zone one of
 * its fronts passed through, answering that front's hazard. A defence
 * elsewhere (beside the sea, but off the storm's path) is never shown
 * answering, because the resolver never counted it.
 */
export function testedDefences(record: StormRecord, defences: ReadonlyMap<string, string>, zoneOf: (key: string) => string | null): Map<string, string> {
  const hazardsByZone = new Map<string, Set<string>>();
  for (const zone of record.outcome.zones) {
    const set = hazardsByZone.get(zone.zoneId) ?? new Set<string>();
    set.add(zone.hazard);
    hazardsByZone.set(zone.zoneId, set);
  }
  const tested = new Map<string, string>();
  for (const [key, elementId] of defences) {
    const zoneId = zoneOf(key);
    const hazards = zoneId ? hazardsByZone.get(zoneId) : undefined;
    if (hazards && defendsAgainst(elementId, [...hazards] as ("cyclone" | "flood")[])) tested.set(key, elementId);
  }
  return tested;
}

/** When water first reaches a tile or a neighbour of it (null: never). */
function contactTime(field: DepthField, key: string): number | null {
  let best = arrivalTime(field, key);
  const [q, r] = key.split(",").map(Number);
  for (let dir = 0; dir < 6; dir++) {
    const t = arrivalTime(field, axialKey(neighbor({ q, r }, dir)));
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * The script for a recorded storm. `defences` lists the defences standing
 * when it came (key → element id): a failed structure is gone from the board
 * after resolution, so it has to be named from before.
 */
export function buildStormScript(record: StormRecord, defences: ReadonlyMap<string, string>, zoneOf: (key: string) => string | null): StormScript {
  const { field, outcome } = record;
  const events: StormEvent[] = [];
  for (const key of outcome.damagedHouses) {
    const t = hitTime(field, key);
    if (t !== null) events.push({ t, type: "house", key });
  }
  const contacts: { t: number; key: string; elementId: string }[] = [];
  for (const [key, elementId] of testedDefences(record, defences, zoneOf)) {
    const t = contactTime(field, key);
    if (t === null) continue;
    contacts.push({ t, key, elementId });
  }
  contacts.sort((a, b) => a.t - b.t || (a.key < b.key ? -1 : 1));
  const firstContact = contacts.length > 0 ? contacts[0].t : null;
  contacts.forEach((c, i) => events.push({ t: c.t, type: "defence", key: c.key, elementId: c.elementId, result: defenceResult(outcome, c.key), first: i === 0 }));
  if (field.landfall !== null) {
    events.push({ t: field.landfall, type: "landfall" });
    // Sparse strikes while the storm is at its height (the prototype's:
    // one every 2.5 to 5.5 s), irregular but fixed for the storm.
    let t = field.landfall - 1.5;
    let seed = 1;
    while (t < field.landfall + 9) {
      events.push({ t, type: "lightning", seed });
      seed++;
      t += LIGHTNING_GAP + ((seed * 7919) % 31) / 10;
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { events, duration: field.duration, firstContact };
}
