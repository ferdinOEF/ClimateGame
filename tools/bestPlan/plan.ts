/**
 * The best-plan solver's shared pieces (Section 24): a plan as a list of the
 * year's actions, replayed through the game's own run code (`newRun`, the
 * real resolver, the real star rule), and the exact scoring of a board
 * against every storm still to come.
 *
 * Nothing here is a copy of a rule: a plan is played by `ActionRun.build` /
 * `repair` exactly as the browser game plays it, a storm resolves through
 * `ActionRun`'s own `land`, and a candidate build is weighed with
 * `computeExposure` on a copy of the board, the same preview the game's
 * Homes at risk and build numbers use (preview equals resolution,
 * tests/exposure.test.ts).
 */
import { BOT_LEVEL, newRun } from "../panjimBots/bots";
import { computeExposure } from "../../src/core/exposure";
import { computeCombos } from "../../src/core/combos";
import { shelterOf } from "../../src/core/climate";
import { starsForHouses } from "../../src/core/zones";
import { axialDistance, type AxialCoord } from "../../src/core/hex";
import { mapById } from "../../src/levels/levelMap";
import type { ActionRun } from "../../src/core/actionRun";
import type { GameState } from "../../src/core/gameState";

export const MAP = mapById("panaji")!;

/** One year's action: a build, or a repair of a defence a storm wore down (also the year's build). */
export type PlanAction = { type: "build"; q: number; r: number; elementId: string } | { type: "repair"; q: number; r: number };

export function actionKey(a: PlanAction): string {
  return a.type === "build" ? `${a.q},${a.r}|${a.elementId}` : `${a.q},${a.r}|repair`;
}

/** Plays `actions` from the start of Play Panjim through the game's own run. Throws on a refused action. */
export function replay(actions: readonly PlanAction[]): ActionRun {
  const run = newRun("best-plan", BOT_LEVEL);
  for (const [i, a] of actions.entries()) {
    const coord = { q: a.q, r: a.r };
    const outcome = a.type === "build" ? run.build(coord, a.elementId) : run.repair(coord);
    if (!outcome.ok) throw new Error(`action ${i + 1} (${actionKey(a)}) refused: ${outcome.reason ?? ""}`);
  }
  return run;
}

/** What a board is worth for the run: stars and homes lost, the storms already past as they went, the rest as they would come on it. */
export interface Assessment {
  /** Stars over the three storms (past: as resolved; to come: the exact preview, later storms leaving out homes an earlier one takes). */
  stars: number;
  /** Homes lost over the run, counted once each. */
  lost: number;
  /** Water over the house-loss line on the homes lost, in loss depths: how close the next builds are to saving more. */
  excess: number;
  /** Per storm, in calendar order. */
  storms: { id: string; stars: number; saved: number; total: number; lost: number; exact: boolean }[];
}

/**
 * Scores `state` (the run's board, or a copy with one more build) for the
 * whole run. The storms already past come from `run.outcomes`. The next storm
 * is exact: its preview on this board is what it will do if nothing else is
 * built. A later storm is worked out on the same board, without the homes an
 * earlier storm to come would already have taken (they are ruins by then).
 */
export function assess(run: ActionRun, state: GameState): Assessment {
  const storms: Assessment["storms"] = [];
  let stars = 0;
  let lost = 0;
  let excess = 0;
  for (const challenge of run.schedule) {
    const outcome = run.outcomes.get(challenge.id);
    if (!outcome) continue;
    const l = outcome.housesTotal - outcome.housesSaved;
    storms.push({ id: challenge.id, stars: outcome.stars, saved: outcome.housesSaved, total: outcome.housesTotal, lost: l, exact: true });
    stars += outcome.stars;
    lost += l;
  }
  const combos = computeCombos(state).bonus;
  const climate = run.climate!;
  const scale = run.houseRule?.resilience ?? climate.intensityPerStrength;
  const taken = new Set<string>();
  let first = true;
  for (const challenge of run.schedule) {
    if (run.landed.has(challenge.id)) continue;
    const site = run.landfallOf(challenge);
    const ex = computeExposure(state, run.zones!, challenge.kind, run.intensityOf(challenge), climate.intensityPerStrength, {
      combos,
      houseStars: run.houseStars,
      houseRule: run.houseRule,
      landfallSites: site === null ? null : [site],
      sheltered: shelterOf(challenge)
    });
    const lostHere = ex.housesAtRisk.filter((key) => !taken.has(key));
    const gone = [...taken].filter((key) => ex.intensity.has(key)).length;
    const total = Math.max(0, ex.outcome.housesTotal - gone);
    const s = first ? ex.outcome.stars : starsForHouses(total - lostHere.length, total, run.houseStars!);
    storms.push({ id: challenge.id, stars: s, saved: total - lostHere.length, total, lost: lostHere.length, exact: first });
    stars += s;
    lost += lostHere.length;
    for (const key of ex.housesAtRisk) excess += Math.max(0, (ex.intensity.get(key) ?? 0) / scale - 1);
    for (const key of lostHere) taken.add(key);
    first = false;
  }
  return { stars, lost, excess, storms };
}

/** Every action the game allows this year: each defence on each free tile it fits, and each repair. */
export function legalActions(run: ActionRun): PlanAction[] {
  const out: PlanAction[] = [];
  for (const tile of run.state.placed.values()) {
    for (const def of run.state.buildableAt(tile.coord)) out.push({ type: "build", q: tile.coord.q, r: tile.coord.r, elementId: def.id });
  }
  for (const key of run.state.elements.keys()) {
    const [q, r] = key.split(",").map(Number);
    if (run.needsRepair({ q, r })) out.push({ type: "repair", q, r });
  }
  return out;
}

/** The board with `action` applied, on a copy (the run itself is untouched). */
export function trialBoard(run: ActionRun, action: PlanAction): GameState {
  const trial = run.state.clone();
  if (action.type === "build") trial.build({ q: action.q, r: action.r }, action.elementId, false);
  else {
    const inst = trial.elements.get(`${action.q},${action.r}`);
    if (inst) inst.degradeAmount = 0;
  }
  return trial;
}

/** The two goals, as orderings (higher first). Goal 1: stars, then homes. Goal 2: homes, then stars. */
export function goal1(a: Assessment, b: Assessment): number {
  return b.stars - a.stars || a.lost - b.lost || a.excess - b.excess;
}
export function goal2(a: Assessment, b: Assessment): number {
  return a.lost - b.lost || b.stars - a.stars || a.excess - b.excess;
}

/** The nearest named place (the map's own locality names) to a tile. */
export function placeName(coord: AxialCoord): string {
  let best = MAP.localities[0];
  let bestD = Infinity;
  for (const l of MAP.localities) {
    const d = axialDistance(coord, { q: l.q, r: l.r });
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return bestD === 0 ? best.name : `near ${best.name}`;
}

/** A plan's canonical form: each phase's actions as a set (within a phase the order changes nothing a storm does). */
export function canonical(actions: readonly PlanAction[], phaseEnds: readonly number[]): string {
  const parts: string[] = [];
  let start = 0;
  for (const end of phaseEnds) {
    parts.push(
      actions
        .slice(start, end)
        .map(actionKey)
        .sort()
        .join(";")
    );
    start = end;
    if (start >= actions.length) break;
  }
  return parts.join(" / ");
}
