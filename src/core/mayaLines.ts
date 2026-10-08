import mayaData from "@data/maya.json";
import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import { axialDistance as hexDistance, type AxialCoord } from "./hex";
import type { ChallengeKind } from "./climate";
import type { ChallengeOutcome, ZoneIndex } from "./zones";

/**
 * What Maya says, worked out from the game's own numbers. Pure, so every
 * line can be tested against a real outcome; the wording lives in
 * src/data/maya.json.
 */
export const MAYA = mayaData;

/** A line kept in the Field Guide's "Maya's notes". */
export interface SavedNote {
  id: string;
  title: string;
  text: string;
}

/**
 * Notes saved on the device, brought up to date: a note whose line still
 * exists takes its current title and text (so a rewording reaches players
 * who heard the old one), and a note whose line is gone is dropped.
 */
export function refreshSavedNotes(saved: readonly SavedNote[]): SavedNote[] {
  const current = new Map<string, SavedNote>([[MAYA.greeting.id, MAYA.greeting], ...MAYA.tips.map((tip) => [tip.id, tip] as [string, SavedNote])]);
  const out: SavedNote[] = [];
  for (const note of saved) {
    const line = current.get(note.id);
    if (line && !out.some((kept) => kept.id === line.id)) out.push({ id: line.id, title: line.title, text: line.text });
  }
  return out;
}

export type MayaMood = "celebrates" | "worried";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

function coordOf(key: string): AxialCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/**
 * Where the most houses are at risk: the at-risk house with the most other
 * at-risk houses within `radius` hexes (ties to the harder hit). Not the
 * hottest tile, which is usually empty wetland nearest the river: Maya goes
 * where there are homes to save.
 */
export function riskHotspot(housesAtRisk: string[], intensity: Map<string, number>, radius = 2): { key: string; count: number } | null {
  let best: { key: string; count: number; heat: number } | null = null;
  const coords = housesAtRisk.map((key) => ({ key, coord: coordOf(key) }));
  for (const a of coords) {
    let count = 0;
    for (const b of coords) if (hexDistance(a.coord, b.coord) <= radius) count++;
    const heat = intensity.get(a.key) ?? 0;
    if (!best || count > best.count || (count === best.count && (heat > best.heat || (heat === best.heat && a.key < best.key)))) best = { key: a.key, count, heat };
  }
  return best ? { key: best.key, count: best.count } : null;
}

/** Neighbourhood names a place can be called by, from the map's landmarks: "Miramar Beach" reads as Miramar. */
const NEIGHBOURHOODS: Record<string, string> = {
  "Miramar Beach": "Miramar",
  "Dona Paula": "Dona Paula",
  Caranzalem: "Caranzalem",
  Taleigao: "Taleigao",
  "St Cruz": "St Cruz",
  Merces: "Merces",
  "Campal Garden": "Campal",
  "Our Lady of the Immaculate Conception": "the city centre",
  "Panjim Municipal Market": "the market"
};

/**
 * What to call a place on the board: the nearest neighbourhood landmark
 * within six hexes, else the short name of its zone.
 */
export function placeName(coord: AxialCoord, landmarks: readonly { name: string; q: number; r: number }[], zoneId: string | null): string {
  let best: { name: string; distance: number } | null = null;
  for (const landmark of landmarks) {
    const name = NEIGHBOURHOODS[landmark.name];
    if (!name) continue;
    const distance = hexDistance(coord, { q: landmark.q, r: landmark.r });
    if (distance <= 6 && (!best || distance < best.distance)) best = { name, distance };
  }
  if (best) return best.name;
  const zonePlaces = MAYA.zonePlaces as Record<string, string>;
  return (zoneId && zonePlaces[zoneId]) || "the city";
}

export function stormWord(kind: ChallengeKind): string {
  return (MAYA.stormNames as Record<string, string>)[kind] ?? "storm";
}

/** The warning she gives three quarters out, and the last call one quarter out. */
export function warningLine(kind: "exposed" | "lastCall" | "fixed", place: string, storm: ChallengeKind, count = 0): string {
  return fill(MAYA.warning[kind], { place, storm: stormWord(storm), count });
}

const SINGULAR: Record<string, string> = {
  dune: "dune",
  sandy_vegetation: "pandanus",
  mangrove: "mangrove",
  khazan: "khazan",
  seawall: "seawall",
  breakwater: "breakwater",
  small_dam: "dam"
};
const PLURAL: Record<string, string> = {
  dune: "dunes",
  sandy_vegetation: "pandanus",
  mangrove: "mangroves",
  khazan: "khazans",
  seawall: "seawalls",
  breakwater: "breakwaters",
  small_dam: "dams"
};

/** The element type doing most of a zone's defending against `hazard`, and how many of it stand there. */
function zoneHero(state: GameState, zones: ZoneIndex, zoneId: string, hazard: string): { id: string; count: number } | null {
  const tally = new Map<string, { value: number; count: number }>();
  for (const key of zones.keys(zoneId)) {
    const inst = state.elements.get(key);
    const def = inst ? ELEMENT_BY_ID.get(inst.elementId) : undefined;
    const value = def?.effects.resilience ?? 0;
    if (!def || value <= 0 || !def.targetsHazards?.includes(hazard)) continue;
    const entry = tally.get(def.id) ?? { value: 0, count: 0 };
    entry.value += value;
    entry.count += 1;
    tally.set(def.id, entry);
  }
  const [best] = [...tally].sort((a, b) => b[1].value - a[1].value);
  return best ? { id: best[0], count: best[1].count } : null;
}

const SHORT_PLACE = MAYA.zonePlaces as Record<string, string>;

/**
 * Maya's Aftermath line: what actually happened, from the resolved storm.
 * "The khazan at Taleigao held 12 homes." Celebrates a good save (three
 * stars, or nothing lost), is worried about losses, and never blames: a loss
 * is followed by what would help, not by what the player did wrong.
 */
export function mayaAftermath(
  outcome: ChallengeOutcome,
  state: GameState,
  zones: ZoneIndex,
  /**
   * What each kind of defence really saved: the storm resolved again with
   * that kind removed (core/stormRecord.ts). When given, Maya quotes it and
   * nothing else; without it she falls back to the zone tally.
   */
  savedBy?: readonly { elementId: string; count: number; houses: number }[]
): { text: string; mood: MayaMood } {
  const hazardWord = (hazard: string): string => (hazard === "flood" ? "flood water" : "surge");
  let heroText: string | null = null;
  if (savedBy) {
    const top = savedBy[0];
    if (top && top.houses > 0) {
      const defence = PLURAL[top.elementId] ?? top.elementId;
      heroText = fill(MAYA.aftermath.saved, { defence, count: top.houses }).replace(/\b1 more homes\b/, "1 more home");
    }
  } else {
    // The zone where defences saved the most homes.
    let best: { zoneId: string; hazard: string; saved: number; absorbed: number } | null = null;
    for (const zone of outcome.zones) {
      if (zone.absorbed <= 0) continue;
      const saved = zone.housesInZone - zone.housesDamaged;
      if (!best || saved > best.saved || (saved === best.saved && zone.absorbed > best.absorbed)) best = { zoneId: zone.zoneId, hazard: zone.hazard, saved, absorbed: zone.absorbed };
    }
    if (best) {
      const hero = zoneHero(state, zones, best.zoneId, best.hazard);
      const place = SHORT_PLACE[best.zoneId] ?? zones.name(best.zoneId);
      if (hero) {
        const defence = hero.count === 1 ? SINGULAR[hero.id] ?? hero.id : PLURAL[hero.id] ?? hero.id;
        heroText =
          best.saved > 0
            ? fill(MAYA.aftermath.held, { defence, place, count: best.saved })
            : fill(MAYA.aftermath.absorbed, { defence, place, hazard: hazardWord(best.hazard) });
        heroText = heroText.replace(/held 1 homes/, "held 1 home");
      }
    }
  }
  const lost = outcome.housesDamaged;
  if (lost === 0) {
    return { text: heroText ?? MAYA.aftermath.allSaved, mood: "celebrates" };
  }
  const worst = [...outcome.zones].sort((a, b) => b.housesDamaged - a.housesDamaged)[0];
  const worstPlace = SHORT_PLACE[worst.zoneId] ?? zones.name(worst.zoneId);
  const defended = zoneHero(state, zones, worst.zoneId, worst.hazard) !== null;
  const lossText = heroText
    ? fill(MAYA.aftermath.someLost, { lost: worst.housesDamaged, place: worstPlace })
    : defended
      ? fill(MAYA.aftermath.notYet, { hazard: hazardWord(worst.hazard), place: worstPlace })
      : fill(MAYA.aftermath.noDefence, { hazard: hazardWord(worst.hazard), place: worstPlace });
  const fixedLoss = lossText.replace(/lost 1 homes/, "lost 1 home");
  return { text: heroText ? `${heroText} ${fixedLoss}` : fixedLoss, mood: outcome.stars === 3 ? "celebrates" : "worried" };
}
