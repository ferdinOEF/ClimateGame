import { isDailyLevel, LEVELS, levelIndex } from "./levels";

/**
 * Campaign progression — which levels are open, and how well each was
 * played. Pure functions over a plain record, with no storage and no
 * network in sight; `src/services/profileStore.ts` owns persistence and
 * calls in here for every decision.
 *
 * Keeping it pure is what lets the same logic run against localStorage for
 * a signed-out player and against a Firestore document for a signed-in
 * one, and lets `tests/progression.test.ts` verify the unlock rules
 * without a browser.
 */

/** One level's personal best. */
export interface LevelRecord {
  levelId: string;
  bestScore: number;
  stars: number;
  bestTurns: number;
  attempts: number;
  completed: boolean;
}

export interface PlayerProgress {
  displayName: string;
  levels: Record<string, LevelRecord>;
  /** Achievement ids the player has unlocked. */
  achievements: string[];
  schemaVersion: number;
}

export const PROGRESS_SCHEMA_VERSION = 1;

export function emptyProgress(displayName = "Coastkeeper"): PlayerProgress {
  return { displayName, levels: {}, achievements: [], schemaVersion: PROGRESS_SCHEMA_VERSION };
}

export function recordFor(progress: PlayerProgress, levelId: string): LevelRecord {
  return (
    progress.levels[levelId] ?? {
      levelId,
      bestScore: 0,
      stars: 0,
      bestTurns: 0,
      attempts: 0,
      completed: false
    }
  );
}

/**
 * Opens the whole campaign regardless of progress.
 *
 * On for playtesting. A tester handed the game for an hour needs to reach the
 * Khazan level to tell you anything about the Khazan level, and making them
 * clear four levels first spends the session on levels you already understand.
 *
 * Set this back to `false` to restore the sequential campaign. Nothing else
 * has to change: the unlock rule below is written out in full underneath the
 * short-circuit, `recordRun` still computes `unlockedLevelId` so the results
 * screen keeps announcing what a clear opened, and
 * `tests/progression.test.ts` covers both settings.
 */
export const ALL_LEVELS_UNLOCKED = true;

/**
 * A level is playable if it is the first one, or the level before it has
 * been completed — unless `ALL_LEVELS_UNLOCKED` is on, in which case every
 * campaign level is open.
 *
 * Star count deliberately does NOT gate progress. A player who scrapes a
 * one-star clear should keep moving through the campaign — star-gating
 * turns a difficulty spike into a hard stop and is the most reliable way
 * to lose someone mid-campaign. Stars are there to pull people *back* to
 * old levels, not to block them from new ones.
 */
export function isLevelUnlocked(progress: PlayerProgress, levelId: string): boolean {
  if (isDailyLevel(levelId)) return true; // the daily is always open, campaign progress or not
  const index = levelIndex(levelId);
  // An id that is not a real level stays locked even in open mode — that is a
  // stale bookmark or a hand-edited URL, not a level anyone should be sent to.
  if (index < 0) return false;
  if (ALL_LEVELS_UNLOCKED) return true;
  if (index === 0) return true;
  return recordFor(progress, LEVELS[index - 1].id).completed;
}

/** The level the player should be dropped into from the menu's main button — the first one they have not yet cleared, or the last one if the campaign is done. */
export function currentLevelId(progress: PlayerProgress): string {
  for (const level of LEVELS) {
    if (!recordFor(progress, level.id).completed) return level.id;
  }
  return LEVELS[LEVELS.length - 1].id;
}

export function totalStars(progress: PlayerProgress): number {
  let total = 0;
  for (const level of LEVELS) total += recordFor(progress, level.id).stars;
  return total;
}

export function totalScore(progress: PlayerProgress): number {
  let total = 0;
  for (const level of LEVELS) total += recordFor(progress, level.id).bestScore;
  return total;
}

export function levelsCompleted(progress: PlayerProgress): number {
  let count = 0;
  for (const level of LEVELS) if (recordFor(progress, level.id).completed) count++;
  return count;
}

export function maxCampaignStars(): number {
  return LEVELS.length * 3;
}

export interface RunOutcome {
  levelId: string;
  score: number;
  stars: number;
  turns: number;
  completed: boolean;
}

/** What changed when a run was recorded — the level-complete screen uses this to say "new best!" rather than silently overwriting. */
export interface ProgressDelta {
  progress: PlayerProgress;
  isNewBestScore: boolean;
  isNewBestStars: boolean;
  isFirstCompletion: boolean;
  unlockedLevelId: string | null;
}

/**
 * Folds one finished run into the player's progress.
 *
 * Returns a NEW progress object rather than mutating the one passed in —
 * the store diffs old against new to decide whether a cloud write is even
 * needed, which on the Spark plan's 20k-writes-a-day budget is worth the
 * allocation.
 *
 * Records only ever improve. A worse run never lowers a best score, drops
 * a star, or un-completes a level, so replaying an early level for fun can
 * never cost the player the progress they already earned.
 */
export function recordRun(progress: PlayerProgress, outcome: RunOutcome): ProgressDelta {
  const previous = recordFor(progress, outcome.levelId);

  const isNewBestScore = outcome.score > previous.bestScore;
  const isNewBestStars = outcome.stars > previous.stars;
  const isFirstCompletion = outcome.completed && !previous.completed;

  const updated: LevelRecord = {
    levelId: outcome.levelId,
    bestScore: Math.max(previous.bestScore, outcome.score),
    stars: Math.max(previous.stars, outcome.stars),
    // "Best turns" means fewest, but only across runs that actually
    // cleared the level — a run that died on turn 3 is not a speed record.
    bestTurns:
      outcome.completed && (previous.bestTurns === 0 || outcome.turns < previous.bestTurns)
        ? outcome.turns
        : previous.bestTurns,
    attempts: previous.attempts + 1,
    completed: previous.completed || outcome.completed
  };

  const next: PlayerProgress = {
    ...progress,
    levels: { ...progress.levels, [outcome.levelId]: updated }
  };

  // The daily challenge sits outside the campaign, so clearing it never
  // unlocks anything.
  let unlockedLevelId: string | null = null;
  if (isFirstCompletion && !isDailyLevel(outcome.levelId)) {
    const index = levelIndex(outcome.levelId);
    if (index >= 0 && index < LEVELS.length - 1) unlockedLevelId = LEVELS[index + 1].id;
  }

  return { progress: next, isNewBestScore, isNewBestStars, isFirstCompletion, unlockedLevelId };
}

/**
 * Merges a cloud-stored progress record with a local one, taking the best
 * of each level.
 *
 * This runs whenever a player signs in on a device that already has local
 * play on it. Best-of rather than last-write-wins is the only merge that
 * cannot lose progress: a player who cleared level 4 offline on their
 * phone and level 3 on their laptop should end up with both, and neither
 * device's copy should be able to erase the other's.
 */
export function mergeProgress(local: PlayerProgress, remote: PlayerProgress): PlayerProgress {
  const levels: Record<string, LevelRecord> = { ...remote.levels };

  for (const [levelId, localRecord] of Object.entries(local.levels)) {
    const remoteRecord = remote.levels[levelId];
    if (!remoteRecord) {
      levels[levelId] = localRecord;
      continue;
    }
    levels[levelId] = {
      levelId,
      bestScore: Math.max(localRecord.bestScore, remoteRecord.bestScore),
      stars: Math.max(localRecord.stars, remoteRecord.stars),
      bestTurns: bestOfTurns(localRecord, remoteRecord),
      attempts: localRecord.attempts + remoteRecord.attempts,
      completed: localRecord.completed || remoteRecord.completed
    };
  }

  return {
    // A name set on this device is the more recent intent, but an empty
    // local name should never blank out one already stored in the cloud.
    displayName: local.displayName || remote.displayName,
    levels,
    achievements: [...new Set([...local.achievements, ...remote.achievements])],
    schemaVersion: PROGRESS_SCHEMA_VERSION
  };
}

/** Fewest turns, treating 0 as "no record yet" rather than as an unbeatable best. */
function bestOfTurns(a: LevelRecord, b: LevelRecord): number {
  if (a.bestTurns === 0) return b.bestTurns;
  if (b.bestTurns === 0) return a.bestTurns;
  return Math.min(a.bestTurns, b.bestTurns);
}
