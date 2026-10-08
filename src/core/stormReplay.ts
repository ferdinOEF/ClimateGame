import { defendsAgainst, type StormRecord } from "./stormRecord";
import { hazardsOf } from "./exposure";

/**
 * The Aftermath replay: what a storm did, step by step, in real numbers.
 *
 * Every figure here is read from the storm's record (core/stormRecord.ts):
 * the houses the resolver lost and kept, the same storm resolved with every
 * defence removed, and resolved with each kind of defence removed in turn.
 * Nothing is estimated. Each step says which tiles to light (houses hit,
 * houses kept dry, the defences of one kind) and gives a caption and a line
 * for Maya. The wording is generic: no named storm, no date, no outside
 * statistic.
 *
 * Pure: no DOM, no renderer.
 */
export interface ReplayStep {
  /** Caption on the replay card. */
  text: string;
  /** What Maya says over this step. */
  maya: string;
  /** Houses to mark as hit (red) and kept dry (green). */
  hit: string[];
  dry: string[];
  /** Tiles to light gold: the defences this step is about. */
  highlight: string[];
}

/** Plural, lower-case names for the defences, as Maya says them. */
export const DEFENCE_PLURAL: Record<string, string> = {
  dune: "dunes",
  sandy_vegetation: "pandanus",
  mangrove: "mangroves",
  khazan: "khazans",
  seawall: "seawalls",
  small_dam: "small dams",
  breakwater: "breakwaters"
};

function plural(elementId: string): string {
  return DEFENCE_PLURAL[elementId] ?? elementId.replace(/_/g, " ");
}

function homes(n: number): string {
  return `${n} ${n === 1 ? "home" : "homes"}`;
}

/** Capitalises the first letter. */
function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The replay's steps for a recorded storm. `defences` names what stood on
 * each tile before the storm (key → element id).
 */
export function replaySteps(record: StormRecord, defences: ReadonlyMap<string, string>, maxDefences = 3): ReplayStep[] {
  const hit = [...record.outcome.damagedHouses];
  const hitSet = new Set(hit);
  const dry = [...record.field.tiles.values()].filter((tile) => tile.house && (tile.surgePeak > 0 || tile.floodPeak > 0 || tile.backwaterPeak > 0 || record.undefended.outcome.damagedHouses.includes(tile.key)) && !hitSet.has(tile.key)).map((tile) => tile.key);
  const steps: ReplayStep[] = [];
  steps.push({
    text: `${cap(homes(hit.length))} hit · ${homes(dry.length)} spared`,
    maya: hit.length === 0 ? "Every home in its path was spared." : dry.length === 0 ? `${cap(homes(hit.length))} were hit.` : `${cap(homes(hit.length))} were hit, and ${homes(dry.length)} were spared.`,
    hit,
    dry,
    highlight: []
  });
  const without = record.undefended.outcome.housesDamaged;
  const hazards = hazardsOf(record.kind);
  const defended = [...defences.values()].some((id) => defendsAgainst(id, hazards));
  if (defended && without > hit.length) {
    steps.push({
      text: `With no defences at all: ${homes(without)} hit`,
      maya: `Without any of your defences, ${homes(without)} would have been hit. You saved ${homes(without - hit.length)}.`,
      hit: [...record.undefended.outcome.damagedHouses],
      dry: [],
      highlight: []
    });
  }
  for (const save of record.savedBy.slice(0, maxDefences)) {
    const tiles = [...defences].filter(([, id]) => id === save.elementId).map(([key]) => key);
    steps.push({
      text: `${cap(plural(save.elementId))} ×${save.count}: ${homes(save.houses)} saved`,
      maya: `Without your ${plural(save.elementId)}, ${homes(save.houses)} more would have been hit.`,
      hit,
      dry,
      highlight: tiles
    });
  }
  return steps;
}
