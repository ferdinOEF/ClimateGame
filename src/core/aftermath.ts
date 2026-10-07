import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import type { ChallengeOutcome, ZoneIndex } from "./zones";

/**
 * The one line under an Aftermath's stars: specific to what just happened,
 * never a lecture. It names a place and a thing the player built (or did
 * not), so the lesson is "the dunes at Miramar took it", not "nature-based
 * solutions are important".
 *
 * Picks the single most telling fact, in priority order: something failed;
 * the first zone was bare; a zone held because of what stood in it; houses
 * were hit; nature defences were worn. Pure, so the wording is tested.
 */
const SHORT_ZONE: Record<string, string> = {
  z1: "Miramar",
  z2: "Taleigao",
  z3: "the Ourem creek",
  z4: "the waterfront"
};

function place(zoneId: string, zones: ZoneIndex): string {
  return SHORT_ZONE[zoneId] ?? zones.name(zoneId);
}

/** The element type doing most of the defending in a zone, as a plural noun ("dunes", "mangroves"). */
function mainDefence(state: GameState, zones: ZoneIndex, zoneId: string, hazard: string): string | null {
  const tally = new Map<string, number>();
  for (const key of zones.keys(zoneId)) {
    const inst = state.elements.get(key);
    const def = inst ? ELEMENT_BY_ID.get(inst.elementId) : undefined;
    if (!def?.targetsHazards?.includes(hazard) || (def.effects.resilience ?? 0) <= 0) continue;
    tally.set(def.id, (tally.get(def.id) ?? 0) + (def.effects.resilience ?? 0));
  }
  let best: string | null = null;
  let bestValue = 0;
  for (const [id, value] of tally) {
    if (value > bestValue) {
      best = id;
      bestValue = value;
    }
  }
  return best ? plural(best) : null;
}

function plural(elementId: string): string {
  const names: Record<string, string> = {
    dune: "dunes",
    sandy_vegetation: "pandanus",
    mangrove: "mangroves",
    khazan: "khazan bunds",
    seawall: "seawalls",
    breakwater: "breakwaters",
    small_dam: "dams"
  };
  return names[elementId] ?? (ELEMENT_BY_ID.get(elementId)?.name ?? elementId).toLowerCase();
}

export function aftermathLine(kind: ChallengeKind, outcome: ChallengeOutcome, state: GameState, zones: ZoneIndex, failedIds: string[]): string {
  const first = outcome.zones[0];
  const failedZone = outcome.zones.find((zone) => zone.failed.length > 0);
  if (failedZone) {
    const what = failedIds.includes("small_dam") ? "The dam" : failedIds.includes("seawall") ? "The seawall" : "An engineered wall";
    return `${what} at ${place(failedZone.zoneId, zones)} gave way and let everything it held through at once.`;
  }
  if (first && first.defence < first.incoming * 0.1) {
    const next = outcome.zones[1];
    return next
      ? `Nothing stood in the way at ${place(first.zoneId, zones)}, so the ${kind === "flood" ? "water" : "storm"} ran on into ${place(next.zoneId, zones)}.`
      : `Nothing stood in the way at ${place(first.zoneId, zones)}.`;
  }
  // The zone that did the work: one that held outright, or, on a good
  // result, the one that absorbed the most.
  const held = outcome.zones.find((zone) => zone.held);
  const strongest = [...outcome.zones].sort((a, b) => b.absorbed - a.absorbed)[0];
  const holder = held ?? (outcome.protection >= 0.5 && strongest && strongest.absorbed > 0 ? strongest : null);
  if (holder) {
    const what = mainDefence(state, zones, holder.zoneId, holder.hazard);
    const spared = outcome.housesSaved;
    const took = holder.held ? "took it" : "took most of it";
    return what
      ? `The ${what} at ${place(holder.zoneId, zones)} ${took}${spared > 0 ? `: ${spared} house${spared === 1 ? "" : "s"} never got wet` : ""}.`
      : `${place(holder.zoneId, zones)} held.`;
  }
  const hit = outcome.zones.filter((zone) => zone.housesDamaged > 0).sort((a, b) => b.housesDamaged - a.housesDamaged)[0];
  if (hit) {
    return `${hit.housesDamaged} house${hit.housesDamaged === 1 ? "" : "s"} at ${place(hit.zoneId, zones)} took water. Repair them to get their income back.`;
  }
  const worn = outcome.zones.find((zone) => zone.overwhelmed.length > 0);
  if (worn) return `The defences at ${place(worn.zoneId, zones)} bent but stayed. They'll want a repair.`;
  return `It got through ${place(outcome.zones[outcome.zones.length - 1]?.zoneId ?? "z4", zones)}, but slowed all the way.`;
}

/**
 * Which kind of defence saved the most houses, as one line for the
 * Aftermath: "The mangroves saved the most homes: about 38 of 52."
 *
 * Credit follows the arithmetic the resolver did. Each zone is credited with
 * its share of everything absorbed, and inside a zone each element type with
 * its share of that zone's defence; the houses saved are shared out the same
 * way. An estimate (a house is saved by the whole line in front of it), but
 * one that cannot credit something that did no work.
 */
export function topDefenceLine(outcome: ChallengeOutcome, state: GameState, zones: ZoneIndex): string | null {
  if (outcome.housesSaved <= 0) return null;
  const totalAbsorbed = outcome.zones.reduce((sum, zone) => sum + zone.absorbed, 0);
  if (totalAbsorbed <= 0) return null;
  const credit = new Map<string, number>();
  for (const zone of outcome.zones) {
    if (zone.absorbed <= 0) continue;
    const byType = new Map<string, number>();
    let zoneDefence = 0;
    for (const key of zones.keys(zone.zoneId)) {
      const inst = state.elements.get(key);
      const def = inst ? ELEMENT_BY_ID.get(inst.elementId) : undefined;
      const value = def?.effects.resilience ?? 0;
      if (!def || value <= 0 || !def.targetsHazards?.includes(zone.hazard)) continue;
      byType.set(def.id, (byType.get(def.id) ?? 0) + value);
      zoneDefence += value;
    }
    for (const [id, value] of byType) {
      credit.set(id, (credit.get(id) ?? 0) + (zone.absorbed / totalAbsorbed) * (value / zoneDefence) * outcome.housesSaved);
    }
  }
  const [best] = [...credit].sort((a, b) => b[1] - a[1]);
  if (!best) return null;
  const name = plural(best[0]);
  const count = Math.max(1, Math.round(best[1]));
  return `The ${name} saved the most homes: about ${count} of ${outcome.housesSaved}.`;
}
