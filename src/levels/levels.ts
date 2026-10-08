import levelData from "@data/levels.json";
import type { Objective } from "@core/objectives";
import { dailyChallengeId, hashSeed, Rng } from "@core/rng";
import type { TimelineConfig } from "@core/actionRun";
import type { ClimateConfig } from "@core/climate";
import type { PrepConfig } from "@core/prep";
import { applyBalance, type BalancePreset, type HouseFill } from "./balance";

/**
 * Level definitions — the campaign, loaded from data, never hardcoded.
 *
 * Everything that makes one level different from another lives in
 * `levels.json`: the starting Coin, how often each hazard comes and how
 * hard, what the player has to achieve, and what a good score looks like.
 * The session layer reads a `LevelDef` and configures itself from it; it
 * has no per-level branches at all. Adding level 9 is a JSON edit.
 */

/** Per-level hazard pacing and difficulty. Replaces the old module-level constants in main.ts, which were one fixed setting for the whole game. */
export interface HazardConfig {
  cycloneEnabled: boolean;
  cycloneIntervalTurns: number;
  cycloneTelegraphTurns: number;
  floodEnabled: boolean;
  floodIntervalTurns: number;
  floodTelegraphTurns: number;
  /** Floor for a severity roll. */
  severityBase: number;
  /** Width of the random band above `severityBase`. */
  severitySpread: number;
  /** How much the standing severity baseline rises after each resolved hazard — the level's "it gets worse" slope. */
  severityCreepPerHazard: number;
}

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  brief: string;
  /**
   * Which map this level is played on — an id from `src/levels/levelMap.ts`.
   *
   * This is what makes each level a different PLACE rather than a different
   * crop of one place. Eight of the nine are real stretches of the Goan
   * coast, rasterised from traced coordinates; the first is a teaching
   * diagram. `tests/levels.test.ts` checks every id resolves and that the
   * map it names can physically host what the level asks for.
   */
  mapId: string;
  /**
   * True for the guided tutorial. The session shows a step-by-step coach
   * instead of only the objectives panel, and progression treats clearing it
   * as the thing that opens the campaign.
   */
  tutorial?: boolean;
  startingCoin: number;
  /** Turn budget the "under par" score bonus measures against. */
  parTurns: number;
  /**
   * Crops the level's map to this many hexes around the map's focus point.
   * `null` — every level today — means the whole map.
   *
   * This was load-bearing when the whole campaign shared one coastline and
   * the window was the only thing distinguishing levels. The city maps are
   * each sized to their own level, so nothing needs it now; it is kept
   * because it is still the right answer for a level that wants one corner
   * of a large map, and because removing it would delete a tested feature to
   * save a single branch. See src/levels/levelMap.ts.
   */
  mapRadius: number | null;
  hazards: HazardConfig;
  /**
   * How time moves. `"turns"` (the default, and the tutorial's) is the
   * original model: a build is a turn and hazards come on turn intervals.
   * `"actions"` is the Panjim 2050 run: a 25-year clock in quarters that moves
   * only when the player spends an action, with scheduled challenges instead
   * of interval hazards. See core/actionRun.ts.
   */
  timeModel?: "turns" | "actions";
  /** Required when `timeModel` is `"actions"`. */
  timeline?: TimelineConfig;
  /** The action-driven run's scheduled challenges and rising baseline (core/climate.ts). */
  climate?: ClimateConfig;
  /** "Get ready": optional jobs for each coming storm (core/prep.ts). */
  prep?: PrepConfig;
  /** The active balance preset's name, and the presets this level offers (see levels/balance.ts). */
  balancePreset?: string;
  balancePresets?: Record<string, BalancePreset>;
  /** Set from the active preset: stars per storm by the share of houses saved. */
  houseStars?: { three: number; two: number };
  /** Houses pre-built on the land, and how they count (levels/balance.ts). */
  houses?: HouseFill;
  objectives: Objective[];
  starThresholds: [number, number, number];
}

/** The levels exactly as written in levels.json, before any balance preset is applied. */
export const RAW_LEVELS: LevelDef[] = levelData as unknown as LevelDef[];
/** The levels as played: each with its active balance preset folded in. */
export const LEVELS: LevelDef[] = RAW_LEVELS.map((level) => applyBalance(level));

/** A level under a named preset, for comparing presets (the bots, the tests). */
export function levelWithPreset(levelId: string, preset: string): LevelDef | null {
  const raw = RAW_LEVELS.find((level) => level.id === levelId);
  return raw ? applyBalance(raw, preset) : null;
}
export const LEVEL_BY_ID = new Map(LEVELS.map((level) => [level.id, level]));

export function levelIndex(levelId: string): number {
  return LEVELS.findIndex((level) => level.id === levelId);
}

/** The level after this one, or null at the end of the campaign. */
export function nextLevel(levelId: string): LevelDef | null {
  const index = levelIndex(levelId);
  if (index < 0 || index >= LEVELS.length - 1) return null;
  return LEVELS[index + 1];
}

/**
 * The daily challenge: the campaign level's shape, re-rolled every UTC day.
 *
 * Built rather than authored, so it never runs out, and seeded off the date so
 * every player worldwide gets the identical run — which is the only thing that
 * makes a shared daily board mean anything. The variation is deliberately
 * narrow (starting Coin, hazard cadence and severity) rather than random
 * objectives: a challenge you can learn the shape of in one attempt and then
 * optimise is the engaging kind, and one that might roll an impossible
 * objective set is not.
 *
 * THE MAP IS FIXED, NOT ROLLED
 *
 * It used to rotate across eight coasts. The campaign is Panaji only now and
 * those maps are no longer bundled (see levelMap.ts), so a roll would silently
 * fall back to the generated coast and break the daily's one promise: that
 * every player is on the same board. Naming one map cannot drift that way.
 */
const DAILY_MAP_ID = "panaji";

export function dailyChallengeLevel(dateId: string = dailyChallengeId()): LevelDef {
  const rng = new Rng(hashSeed(`daily-${dateId}`));
  // The last campaign level, which is the hardest authored one — the daily is
  // meant to be the expert board.
  const template = LEVELS[LEVELS.length - 1];

  return {
    ...template,
    id: `daily-${dateId}`,
    name: "Daily Challenge",
    subtitle: dateId,
    brief:
      "One coast, one day, one shot at the board. Every player in the world gets this exact coast and this exact storm sequence — the seed is the date itself. Come back tomorrow for a new one.",
    mapId: DAILY_MAP_ID,
    // A daily is never the guided tutorial, whichever template it copied.
    tutorial: false,
    startingCoin: rng.int(420, 620),
    parTurns: rng.int(24, 32),
    // Always the full map: a shared leaderboard needs every player on
    // identical terrain.
    mapRadius: null,
    hazards: {
      ...template.hazards,
      cycloneIntervalTurns: rng.int(7, 11),
      floodEnabled: true,
      floodIntervalTurns: rng.int(8, 13),
      severityBase: Number(rng.range(0.6, 0.95).toFixed(3)),
      severitySpread: Number(rng.range(0.35, 0.6).toFixed(3)),
      severityCreepPerHazard: Number(rng.range(0.03, 0.06).toFixed(4))
    },
    objectives: [
      { type: "survive_hazards", count: rng.int(4, 7) },
      { type: "meter_at_least", meter: "biodiversity", value: rng.int(16, 26) },
      { type: "resilience_at_least", value: rng.int(25, 45) }
    ],
    starThresholds: [760, 980, 1220]
  };
}

/** True for a generated daily-challenge level id — the campaign progression store must not treat these as campaign levels. */
export function isDailyLevel(levelId: string): boolean {
  return levelId.startsWith("daily-");
}

/**
 * Resolves any level id the app can be asked to start, campaign or daily.
 * Returns null for an unknown id rather than throwing — a stale bookmark
 * or a hand-edited URL should land the player on the menu, not a crash.
 */
export function resolveLevel(levelId: string): LevelDef | null {
  if (isDailyLevel(levelId)) {
    const dateId = levelId.slice("daily-".length);
    // Only ever build today's challenge. Rebuilding an old date on demand
    // would let a player reroll yesterday's easier seed onto today's board.
    return dateId === dailyChallengeId() ? dailyChallengeLevel(dateId) : null;
  }
  return LEVEL_BY_ID.get(levelId) ?? null;
}
