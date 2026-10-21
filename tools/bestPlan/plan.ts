/**
 * The best-plan solver's shared pieces (Section 24): a plan as a list of the
 * year's actions, replayed through the game's own run code (`newRun`, the
 * real resolver, the real star rule), and the exact scoring of a board
 * against every storm still to come.
 *
 * Nothing here is a copy of a rule: a plan is played by `ActionRun.build` /
 * `repair` exactly as the browser game plays it, a storm resolves through
 * `ActionRun`'s own `land`, and a candidate is weighed by running the game's
 * resolver for every storm to come on a copy of the board.
 */
import { BOT_LEVEL, newRun } from "../panjimBots/bots";
import { computeExposure } from "../../src/core/exposure";
import { computeCombos } from "../../src/core/combos";
import { shelterOf } from "../../src/core/climate";
import { resolveChallenge } from "../../src/core/zones";
import { axialDistance, type AxialCoord } from "../../src/core/hex";
import { mapById } from "../../src/levels/levelMap";
import type { ActionRun } from "../../src/core/actionRun";
import type { GameState } from "../../src/core/gameState";
import type { ScheduledChallenge } from "../../src/core/climate";

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

/** What a board is worth for the run: stars and homes lost, the storms already past as they went, the rest as they would go if nothing more were built. */
export interface Assessment {
  /** Stars over the three storms. */
  stars: number;
  /** Homes lost over the run, counted once each. */
  lost: number;
  /** Water and wind over the house-loss line on the homes lost, in loss depths: how close more builds are to saving more. */
  excess: number;
  /** Section 25.2: how far each storm's biodiversity falls short of the three star rise, added up (0 where it is reached). */
  bioShort: number;
  /** The storm still to come next: its stars and homes lost (all three storms past: the last's). */
  next: { stars: number; lost: number; excess: number };
  /** Section 26.2: the last storm's biodiversity change (measured at the end of 2050). */
  endBio: number;
  /** Per storm, in calendar order. */
  storms: { id: string; stars: number; saved: number; total: number; lost: number; bio: number; excess?: number }[];
}

/**
 * Scores `state` (the run's board, or a copy with one more action) for the
 * whole run. The storms already past come from `run.outcomes`. The storms to
 * come are resolved one after the other on one copy of the board by the
 * game's own resolver (`resolveChallenge`, with the arguments `ActionRun.land`
 * passes), so each sees what the one before it left: homes ruined, defences
 * worn or failed. Exact for "nothing more is built", by the game's own rules.
 */
export function assess(run: ActionRun, state: GameState): Assessment {
  const storms: Assessment["storms"] = [];
  let stars = 0;
  let lost = 0;
  let excess = 0;
  let bioShort = 0;
  // Each storm's own three star rise (Section 26.2: the 2050 storm's is higher).
  const short = (challenge: (typeof run.schedule)[number], change: number | undefined): number => {
    const target = run.houseStarsFor(challenge)?.bioThree;
    return target === undefined || change === undefined ? 0 : Math.max(0, target - change);
  };
  for (const challenge of run.schedule) {
    const outcome = run.outcomes.get(challenge.id);
    if (!outcome) continue;
    bioShort += short(challenge, outcome.biodiversityChange);
    const l = outcome.housesTotal - outcome.housesSaved;
    storms.push({ id: challenge.id, stars: outcome.stars, saved: outcome.housesSaved, total: outcome.housesTotal, lost: l, bio: outcome.biodiversityChange ?? 0 });
    stars += outcome.stars;
    lost += l;
  }
  const climate = run.climate!;
  const scale = run.houseRule?.resilience ?? climate.intensityPerStrength;
  const board = state.clone();
  for (const challenge of run.schedule) {
    if (run.landed.has(challenge.id)) continue;
    // Section 26.1: each storm as it lands, every defence as old as it will be then.
    board.turn = challenge.turn - 1;
    const damage = new Map<string, number>();
    const outcome = resolveChallenge(
      board,
      run.zones!,
      challenge.kind,
      run.intensityOf(challenge),
      climate.intensityPerStrength,
      computeCombos(board).bonus,
      run.houseStarsFor(challenge),
      run.houseRule,
      (key, _water, _hazard, d) => damage.set(key, Math.max(damage.get(key) ?? 0, d)),
      run.landfallOf(challenge),
      shelterOf(challenge),
      challenge.wind
    );
    const l = outcome.housesTotal - outcome.housesSaved;
    storms.push({ id: challenge.id, stars: outcome.stars, saved: outcome.housesSaved, total: outcome.housesTotal, lost: l, bio: outcome.biodiversityChange ?? 0 });
    stars += outcome.stars;
    lost += l;
    bioShort += short(challenge, outcome.biodiversityChange);
    let stormExcess = 0;
    for (const key of outcome.damagedHouses) stormExcess += Math.max(0, (damage.get(key) ?? 0) / scale - 1);
    storms[storms.length - 1].excess = stormExcess;
    excess += stormExcess;
  }
  const nextStorm = storms[Math.min(run.landed.size, storms.length - 1)];
  return { stars, lost, excess, bioShort, storms, next: { stars: nextStorm?.stars ?? 0, lost: nextStorm?.lost ?? 0, excess: nextStorm?.excess ?? 0 }, endBio: storms[storms.length - 1]?.bio ?? 0 };
}

/** Homes `challenge` (the next storm) would take on `state`, by the game's own preview. */
export function previewLost(run: ActionRun, state: GameState, challenge: ScheduledChallenge): string[] {
  const site = run.landfallOf(challenge);
  return computeExposure(state, run.zones!, challenge.kind, run.intensityOf(challenge), run.climate!.intensityPerStrength, {
    combos: computeCombos(state).bonus,
    houseStars: run.houseStarsFor(challenge),
    houseRule: run.houseRule,
    landfallSites: site === null ? null : [site],
    sheltered: shelterOf(challenge),
    wind: challenge.wind,
    turn: challenge.turn - 1
  }).housesAtRisk;
}

/**
 * Every build and repair the game allows this year: each defence on each free
 * tile it fits, and each defence a storm wore down. (Demolishing, also a
 * year's action, is not searched: on Panaji it can only remove a defence.)
 */
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
/**
 * Section 25.2: stars, then the biodiversity still short of three stars, then homes. Not a goal of its own: it keeps
 * plans that build nature first in the beam, whose stars come a few builds later than a seawall's homes.
 */
/**
 * The phase's own storm first (Section 24: "score each phase by the stars and homes saved at its storm"): its stars
 * and homes, then the whole run. Not a goal of its own: it keeps plans that hold the next storm, when whole-run
 * orders would spend the early builds on a later, bigger storm.
 */
export function nextFirst(a: Assessment, b: Assessment): number {
  return b.next.stars - a.next.stars || a.next.lost - b.next.lost || a.next.excess - b.next.excess || b.stars - a.stars || a.lost - b.lost || a.excess - b.excess;
}

export function greener(a: Assessment, b: Assessment): number {
  return b.stars - a.stars || a.bioShort - b.bioShort || a.lost - b.lost || a.excess - b.excess;
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
