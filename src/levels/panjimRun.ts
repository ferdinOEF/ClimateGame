import { ActionRun } from "@core/actionRun";
import { GameState } from "@core/gameState";
import { BUILDING_KINDS } from "@core/phaseResult";
import type { PointsConfig, PointsModel, PointValues } from "@core/resiliencePoints";
import type { Place } from "@core/phaseResult";
import { boardSetup } from "./balance";
import { mapById } from "./levelMap";
import { LEVEL_BY_ID, type LevelDef } from "./levels";

/**
 * Play Panjim's run, started headless exactly as the session starts it (app/gameSession.ts and the controller): the
 * Panaji board with its town, the monuments reserved, the level's houses, exclusions and sea limit, and the same
 * `ActionRun` options. The bots, the points tests and the server's replay (Section 35.4) all start here, so a build
 * list played in the browser replays to the same board.
 */
export const PANJIM_LEVEL_ID = "l01-first-rains";

/** The map's iconic places: its monuments that are buildings (a church, a school; not a beach or a garden). */
export function iconicPlaces(map: { monuments: readonly { name: string; q: number; r: number; kind?: string }[] }): Place[] {
  return map.monuments.filter((m) => m.kind && BUILDING_KINDS.has(m.kind)).map((m) => ({ name: m.name, q: m.q, r: m.r }));
}

/** The points config for a map (Section 35.1). */
export function pointsConfig(map: { monuments: readonly { name: string; q: number; r: number; kind?: string }[] }, values?: Readonly<PointValues>): PointsConfig {
  return { iconicPlaces: iconicPlaces(map), ...(values ? { values } : {}) };
}

export interface PanjimRunOptions {
  level?: LevelDef;
  /** Choose each phase's objective with the model (the game does; the bots mostly skip it). Default true. */
  objectives?: boolean;
  /** Count points (Section 35.1). Default true; false or values to tune them. */
  points?: boolean | Readonly<PointValues>;
}

export function newPanjimRun(options: PanjimRunOptions = {}): ActionRun {
  const level = options.level ?? LEVEL_BY_ID.get(PANJIM_LEVEL_ID)!;
  const map = mapById(level.mapId ?? "panaji")!;
  const setup = boardSetup(level, map);
  const state = new GameState(map.tiles, setup.startingElements, level.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  state.severityCreepPerHazard = level.hazards.severityCreepPerHazard;
  for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
  const points = options.points ?? true;
  return new ActionRun(state, level.timeline!, {
    climate: level.climate,
    zones: map.zones,
    houseStars: level.houseStars,
    houseRule: level.houses?.rule,
    prep: level.prep,
    economy: level.economy,
    growth: level.growth,
    landmarks: map.landmarks,
    localities: map.localities,
    generateObjectives: options.objectives ?? true,
    ...(points ? { points: pointsConfig(map, points === true ? undefined : points) } : {})
  });
}

/** The model the server replays Play Panjim's runs with (Section 35.4). */
export const PANJIM_POINTS_MODEL: PointsModel = { newRun: () => newPanjimRun() };
