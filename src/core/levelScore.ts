import type { GameState } from "./gameState";
import type { RunStatsSnapshot } from "./runStats";
import { computeEraScoreBreakdown, type EraScoreBreakdown } from "./scoring";

/**
 * Level scoring, layered on top of the existing era score rather than
 * replacing it.
 *
 * `computeEraScoreBreakdown()` (scoring.ts) already answers "how healthy is
 * this coast" — the four meters, clamped and weighted so neither a wall of
 * mangroves nor a wall of concrete can run away with the total. That stays
 * exactly as it is and remains the bulk of a level score.
 *
 * What a *level* adds on top is the part an era never had: it was set as a
 * challenge, so how well the challenge was met counts. Three bonuses, all
 * of them things a player can see themselves earning while playing:
 *
 *   - Coast held      — a flat bonus per hazard weathered with zero damage.
 *   - Under par       — finishing inside the level's `parTurns` budget.
 *   - Nothing lost    — a clean run with no defence destroyed outright.
 *
 * A failed run (Resilience hit zero before the objectives were met) still
 * scores; it just does not earn the completion bonus or any stars. Showing
 * a real number for a loss is deliberate — it gives the retry a target.
 *
 * Note on the score ceiling: every term here is bounded (the era breakdown
 * is clamped internally, and the three bonuses are all capped constants
 * times a bounded count), which is what lets firestore.rules reject a
 * submitted score above 100000 as definitionally impossible rather than
 * merely implausible.
 */

/** Flat award per hazard that got through with no damage and no defence loss. */
const PERFECT_DEFENSE_BONUS = 60;
/** Awarded once, at completion, if no defence was destroyed all run. */
const NO_LOSSES_BONUS = 100;
/** Per turn saved against the level's par. Modest on purpose — rushing should not beat building well. */
const UNDER_PAR_PER_TURN = 8;
/** Awarded once for clearing every objective. The single largest term, so completing the level always beats farming meters on a level you never finish. */
const COMPLETION_BONUS = 250;

export interface LevelScoreBreakdown {
  /** The existing four-meter era score, unchanged. */
  era: EraScoreBreakdown;
  completion: number;
  perfectDefense: number;
  underPar: number;
  noLosses: number;
  total: number;
  /** 0 on a failed run; 1–3 on a cleared one, from the level's own thresholds. */
  stars: number;
}

export interface LevelScoreInput {
  state: GameState;
  stats: RunStatsSnapshot;
  /** Turn budget the "under par" bonus measures against. */
  parTurns: number;
  /** Ascending score thresholds for 1, 2 and 3 stars. */
  starThresholds: readonly [number, number, number];
  /** Whether every objective was met. A run that ended in failure passes false. */
  completed: boolean;
}

/**
 * Stars are awarded off the *final* total, including the completion bonus —
 * so the thresholds in levels.json are read against the number the player
 * is actually shown, not an intermediate one. A run that did not complete
 * gets zero stars regardless of how high it scored, which keeps "3 stars"
 * meaning "cleared it well" rather than "survived a long time".
 */
function starsFor(total: number, thresholds: readonly [number, number, number], completed: boolean): number {
  if (!completed) return 0;
  if (total >= thresholds[2]) return 3;
  if (total >= thresholds[1]) return 2;
  if (total >= thresholds[0]) return 1;
  // Clearing a level is worth at least one star even on a scrappy run —
  // otherwise a player can meet every objective the level set and be told
  // they earned nothing, which reads as the game not noticing.
  return 1;
}

export function computeLevelScore(input: LevelScoreInput): LevelScoreBreakdown {
  const era = computeEraScoreBreakdown(input.state);

  const completion = input.completed ? COMPLETION_BONUS : 0;
  const perfectDefense = input.stats.perfectDefenses * PERFECT_DEFENSE_BONUS;
  const noLosses = input.completed && input.stats.defensesDestroyed === 0 ? NO_LOSSES_BONUS : 0;
  // Only a completed run can be "under par" — otherwise every abandoned
  // run at turn 1 would collect the maximum speed bonus for having spent
  // no turns, which is the exact opposite of what this rewards.
  const turnsUnderPar = input.completed ? Math.max(0, input.parTurns - input.state.turn) : 0;
  const underPar = turnsUnderPar * UNDER_PAR_PER_TURN;

  const total = Math.max(0, era.total + completion + perfectDefense + underPar + noLosses);

  return {
    era,
    completion,
    perfectDefense,
    underPar,
    noLosses,
    total,
    stars: starsFor(total, input.starThresholds, input.completed)
  };
}

/**
 * The outcome of one scored run.
 *
 * Lives here rather than beside the session that produces it because it is
 * expressed entirely in core types, and because the results screen needs
 * it — having `ui/` import from `app/` would be a back-edge against the
 * dependency direction the rest of the project holds to (see
 * docs/ARCHITECTURE.md).
 */
export interface SessionResult {
  levelId: string;
  /** Whether every objective was met. False for a run that ended at zero Resilience. */
  completed: boolean;
  score: LevelScoreBreakdown;
  stats: RunStatsSnapshot;
  turns: number;
  /** Standing element counts on the final board — achievements read these rather than re-walking the game state. */
  standingByElement: Map<string, number>;
  standingByCategory: Map<string, number>;
}

/** The rows the level-complete screen lists, in display order. Built here so the screen never re-derives which terms exist. */
export function scoreRows(breakdown: LevelScoreBreakdown): { label: string; value: number }[] {
  const rows = [
    { label: "Trust", value: breakdown.era.trust },
    { label: "Resilience", value: breakdown.era.resilience },
    { label: "Biodiversity", value: breakdown.era.biodiversity },
    { label: "Carbon", value: breakdown.era.carbon },
    { label: "Turns survived", value: breakdown.era.turnsSurvived }
  ];
  if (breakdown.completion > 0) rows.push({ label: "Level cleared", value: breakdown.completion });
  if (breakdown.perfectDefense > 0) rows.push({ label: "Coast held", value: breakdown.perfectDefense });
  if (breakdown.underPar > 0) rows.push({ label: "Under par", value: breakdown.underPar });
  if (breakdown.noLosses > 0) rows.push({ label: "Nothing lost", value: breakdown.noLosses });
  return rows;
}
