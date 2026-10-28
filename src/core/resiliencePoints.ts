import { ELEMENT_BY_ID, NATURE_BASED } from "./elements";
import type { GameState } from "./gameState";
import { resolveChallenge } from "./zones";
import { computeCombos } from "./combos";
import { damageAt, floodsHouse } from "./hazardModel";
import { placesInArea, type Place } from "./phaseResult";
import type { StormArgs, StormRecord } from "./stormRecord";
import type { ScheduledChallenge } from "./climate";
import type { ActionRun } from "./actionRun";

/**
 * Section 35.1: Play Panjim's points (a game rule: "In this game, points…"). Counted only when a storm resolves, from
 * the same storm record that drives its result cards, on playable tiles only. Losses never take points away. Six
 * sources:
 *
 *   - Homes saved: per home in the storm's path still standing (the card's "N of M homes saved").
 *   - Iconic places saved: per building on the result card's list (in or beside the storm's area) that stood.
 *   - Objective: when every row of the phase's objective was done as the storm came.
 *   - Living coast: per dune, pandanus, mangrove or khazan standing after the storm; more for each that protected a
 *     home (taken away, the same storm on the same board takes at least one more home).
 *   - Biodiversity, end of 2050: per point above the run's start.
 *   - Veterans, end of 2050: per defence that stood through all three storms.
 *
 * A storm's points live with its record: "Try this storm again" drops them with it, and the storm counts once.
 * Stars are not touched. Pure: no DOM, no renderer, no network, so the server replays a run through the same code
 * (`pointsForRun`).
 */

/** What each source is worth (Section 35.6 tuned them; their order of importance is the brief's). */
export interface PointValues {
  /** Per home saved. */
  home: number;
  /** Per iconic place at risk still standing. */
  place: number;
  /** The phase's objective done when its storm came. */
  objective: number;
  /** Per living coast defence standing after the storm. */
  coastStanding: number;
  /** More per living coast defence that protected a home. */
  coastProtecting: number;
  /** Per biodiversity point above the start, at the end of 2050. */
  biodiversity: number;
  /** Per defence that stood through all three storms. */
  veteran: number;
}

export const POINT_VALUES: Readonly<PointValues> = {
  home: 10,
  place: 250,
  objective: 300,
  coastStanding: 20,
  coastProtecting: 30,
  biodiversity: 5,
  veteran: 50
};

/** The living coast: the nature based defences. */
export const LIVING_COAST: readonly string[] = NATURE_BASED;

/** What a level counts points with: the values, and its iconic places (the map's buildings). */
export interface PointsConfig {
  values?: Readonly<PointValues>;
  /** The map's iconic places (its monuments that are buildings): the places a storm can put at risk. */
  iconicPlaces: readonly Place[];
}

/** One storm's points, one object per source. */
export interface StormPoints {
  challengeId: string;
  year: number;
  homes: { saved: number; points: number };
  places: { names: string[]; points: number };
  objective: { done: boolean; points: number };
  livingCoast: { standing: number; protecting: number; points: number };
  total: number;
  /** The defences standing after this storm (`key|elementId|builtOnTurn`): what Veterans compares. */
  standing: string[];
}

/** The run's end of 2050 sources. */
export interface EndPoints {
  biodiversity: { rise: number; points: number };
  veterans: { count: number; points: number };
  total: number;
}

/** The whole run: each storm's points in calendar order, the end of 2050's, and the total. */
export interface RunPoints {
  storms: StormPoints[];
  end: EndPoints | null;
  total: number;
}

/** A defence instance, as Veterans tells one from another: a rebuilt tile is a new defence. */
function defenceId(key: string, elementId: string, builtOnTurn: number): string {
  return `${key}|${elementId}|${builtOnTurn}`;
}

/** The defences standing on `state` (not broken), as `defenceId`s. */
export function standingDefences(state: GameState): string[] {
  const out: string[] = [];
  for (const [key, inst] of state.elements) {
    const def = ELEMENT_BY_ID.get(inst.elementId);
    if (!def || def.kind !== "defense" || inst.broken || state.isScenery(key)) continue;
    out.push(defenceId(key, inst.elementId, inst.builtOnTurn));
  }
  return out.sort();
}

/**
 * Living coast: the dunes, pandanus, mangroves and khazans standing after the storm (on `after`), and how many of
 * them protected a home: on `before` (the board as the storm came) with that one taken away and its combos
 * recomputed, the same storm takes more homes than it did.
 */
export function livingCoast(before: GameState, after: GameState, args: StormArgs, housesDamaged: number): { standing: number; protecting: number } {
  let standing = 0;
  let protecting = 0;
  for (const [key, inst] of after.elements) {
    if (!LIVING_COAST.includes(inst.elementId) || inst.broken || after.isScenery(key)) continue;
    const was = before.elements.get(key);
    standing++;
    // Built after the storm (never: a storm resolves straight after its year's build) or a different defence then.
    if (!was || was.elementId !== inst.elementId || was.builtOnTurn !== inst.builtOnTurn) continue;
    const copy = before.clone();
    copy.elements.delete(key);
    const combos = args.combos ? computeCombos(copy).bonus : undefined;
    const lost = resolveChallenge(copy, args.zones, args.kind, args.intensity, args.strengthUnit, combos, args.houseStars, args.houseRule, undefined, args.landfall, args.sheltered, args.wind).housesDamaged;
    if (lost > housesDamaged) protecting++;
  }
  return { standing, protecting };
}

/**
 * The iconic places at risk from a storm that stood: buildings on its result card's list (in or beside its area to
 * protect), on playable tiles, that the same storm would have damaged on the board with no defences, and that stood.
 */
export function placesSaved(record: StormRecord, area: readonly string[], iconic: readonly Place[], state: GameState): string[] {
  const bare = { depth: record.undefended.depth ?? new Map<string, number>(), wind: record.undefended.wind };
  return placesInArea(iconic, area)
    .filter((place) => !state.isScenery(`${place.q},${place.r}`))
    .filter((place) => floodsHouse(damageAt(bare, `${place.q},${place.r}`)))
    .filter((place) => !floodsHouse(damageAt(record, `${place.q},${place.r}`)))
    .map((place) => place.name);
}

/** One storm's points from what it did (the run gathers these as it lands; `stormPoints` only does the sums). */
export function stormPoints(
  challenge: Pick<ScheduledChallenge, "id" | "year">,
  facts: { homesSaved: number; places: string[]; objectiveDone: boolean; coast: { standing: number; protecting: number }; standing: string[] },
  values: Readonly<PointValues> = POINT_VALUES
): StormPoints {
  const homes = { saved: facts.homesSaved, points: Math.max(0, facts.homesSaved) * values.home };
  const places = { names: facts.places, points: facts.places.length * values.place };
  const objective = { done: facts.objectiveDone, points: facts.objectiveDone ? values.objective : 0 };
  const coastPoints = facts.coast.standing * values.coastStanding + facts.coast.protecting * values.coastProtecting;
  const livingCoastPart = { ...facts.coast, points: coastPoints };
  return {
    challengeId: challenge.id,
    year: challenge.year,
    homes,
    places,
    objective,
    livingCoast: livingCoastPart,
    total: homes.points + places.points + objective.points + coastPoints,
    standing: facts.standing
  };
}

/**
 * The end of 2050: biodiversity above the run's start (whole points, as the cards show it; 0 if below), and the
 * defences that stood through every storm (in each storm's standing list, the same defence each time).
 */
export function endPoints(bioRise: number, standingAfterEach: readonly (readonly string[])[], values: Readonly<PointValues> = POINT_VALUES): EndPoints {
  const rise = Math.max(0, Math.round(bioRise));
  const [first, ...rest] = standingAfterEach;
  const count = first ? first.filter((id) => rest.every((list) => list.includes(id))).length : 0;
  const biodiversity = { rise, points: rise * values.biodiversity };
  const veterans = { count, points: count * values.veteran };
  return { biodiversity, veterans, total: biodiversity.points + veterans.points };
}

/** The run's points as they stand: its storms' (calendar order) and, once 2050 is done, the end's. */
export function runPoints(run: Pick<ActionRun, "schedule" | "stormPoints" | "endPoints">): RunPoints {
  const storms = run.schedule.map((c) => run.stormPoints.get(c.id)).filter((p): p is StormPoints => !!p);
  const end = run.endPoints;
  return { storms, end, total: storms.reduce((sum, s) => sum + s.total, 0) + (end?.total ?? 0) };
}

/** One year's action as played: its year, its tile ("q,r") and its element (or "repair" or "demolish"). */
export interface BuildEntry {
  year: number;
  tile: string;
  element: string;
}

/** The actions besides a build that also end a year. */
export const REPAIR = "repair";
export const DEMOLISH = "demolish";

/** How to start a fresh run with points on, as the game starts Play Panjim (levels/panjimRun.ts). */
export interface PointsModel {
  newRun(): ActionRun;
}

export interface Replay {
  run: ActionRun;
  points: RunPoints;
  /** Null when every action went through in its year; else why the list was refused. */
  error: string | null;
}

/**
 * Replays a build list on a fresh run: every action must be legal in its own year, in order. The server's anti
 * cheat (Section 35.4): it stores the points this gets, never a number a client sends.
 */
export function replayBuilds(builds: readonly BuildEntry[], model: PointsModel): Replay {
  const run = model.newRun();
  const done = (error: string | null): Replay => ({ run, points: runPoints(run), error });
  for (const [i, entry] of builds.entries()) {
    if (run.finished) return done(`action ${i + 1}: the run is over`);
    if (!entry || typeof entry.year !== "number" || typeof entry.tile !== "string" || typeof entry.element !== "string") return done(`action ${i + 1}: malformed`);
    if (entry.year !== run.year) return done(`action ${i + 1}: year ${entry.year}, expected ${run.year}`);
    const match = /^(-?\d{1,3}),(-?\d{1,3})$/.exec(entry.tile);
    if (!match) return done(`action ${i + 1}: bad tile`);
    const coord = { q: Number(match[1]), r: Number(match[2]) };
    const outcome = entry.element === REPAIR ? run.repair(coord) : entry.element === DEMOLISH ? run.demolish(coord) : run.build(coord, entry.element);
    if (!outcome.ok) return done(`action ${i + 1}: ${outcome.reason ?? "refused"}`);
  }
  return done(null);
}

/** Section 35.1: the points a build list earns, exactly as the game counted them. */
export function pointsForRun(builds: readonly BuildEntry[], model: PointsModel): RunPoints {
  return replayBuilds(builds, model).points;
}
