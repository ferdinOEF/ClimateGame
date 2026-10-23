import type { ActionRun } from "./actionRun";
import type { AxialCoord } from "./hex";

/**
 * Section 31.2 (owner decision): the Tutorial's nudge. One defence a year, in this order: the four cyclone defences
 * before the cyclone, the three river defences before the flood. Nothing is locked: the player may build something
 * else, or somewhere else; the nudge then moves on to the first defence in the order not yet tried.
 */
export const NUDGE_ORDER = ["dune", "sandy_vegetation", "breakwater", "seawall", "mangrove", "khazan", "small_dam"] as const;
export type NudgeId = (typeof NUDGE_ORDER)[number];

/** The defences tried so far: every one of the seven ever built in this run (ticked on the checklist). */
export function triedDefences(builtIds: Iterable<string>): Set<NudgeId> {
  const tried = new Set<NudgeId>();
  for (const id of builtIds) if ((NUDGE_ORDER as readonly string[]).includes(id)) tried.add(id as NudgeId);
  return tried;
}

/** The defence the Tutorial suggests now: the first in the order not yet tried, or null once all seven are. */
export function suggestedDefence(tried: ReadonlySet<string>): NudgeId | null {
  return NUDGE_ORDER.find((id) => !tried.has(id)) ?? null;
}

/**
 * The 2 or 3 tiles that pulse for `elementId`: where it saves the most homes from the next storm (at least one), by
 * the same model as the storm (`ActionRun.homesSavedBy`). Fewer when fewer save any; none after the last storm.
 */
export function goodTiles(run: ActionRun, elementId: string, max = 3): { coord: AxialCoord; saves: number }[] {
  const next = run.nextChallenge();
  if (!next) return [];
  const all: { coord: AxialCoord; saves: number }[] = [];
  for (const tile of run.state.placed.values()) {
    if (!run.state.canBuild(tile.coord, elementId)) continue;
    const saves = run.homesSavedBy(next, tile.coord, elementId) ?? 0;
    if (saves > 0) all.push({ coord: tile.coord, saves });
  }
  return all.sort((a, b) => b.saves - a.saves || a.coord.q - b.coord.q || a.coord.r - b.coord.r).slice(0, max);
}
