import type { GameState } from "./gameState";
import type { ChallengeOutcome } from "./zones";

/**
 * The Panjim 2050 index: how the city stands in 2050, on five counts, each
 * 0–100, averaged.
 *
 *   Resilience   how well its defences did on the day, averaged over the
 *                three storms (their protection).
 *   Biodiversity the living coast: the generic biodiversity meter (60 is full).
 *   Livelihoods  what the city earns a year in 2050 (its income at the level's scale).
 *   Population   how many people it grew to house.
 *   Food         whether it feeds itself (khazan and mangroves against houses).
 *
 * Scored separately from the stars: stars are about the three storms, the
 * index is about the city they hit. The score is the index plus the stars.
 * Real time played is never part of either; it gets its own tempo badge.
 */
export interface IndexInput {
  state: GameState;
  outcomes: ChallengeOutcome[];
  income: number;
}

export interface PanjimIndex {
  resilience: number;
  biodiversity: number;
  livelihoods: number;
  population: number;
  food: number;
  /** 0–100, the mean of the five. */
  index: number;
  /** Stars per challenge, in order. */
  challengeStars: number[];
  totalStars: number;
  /** 1–3 for the level: the average challenge result, never below 1. */
  levelStars: number;
  /**
   * Section 22.4 (owner decision), a game rule: the level is cleared with at least one star in every storm and at
   * least `CLEAR_TOTAL_STARS` of the stars in all, so one storm's three stars cannot clear it alone.
   */
  cleared: boolean;
  /** Index × 10 plus 100 per star: the number the leaderboard compares. */
  score: number;
}

const clamp100 = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

/** Stars needed in all to clear the level (with at least one in every storm): five of Panjim's nine. */
export const CLEAR_TOTAL_STARS = 5;

/** The clear rule on its own: at least one star in every storm and `CLEAR_TOTAL_STARS` in all. */
export function clearsLevel(stars: readonly number[]): boolean {
  return stars.length > 0 && stars.every((s) => s >= 1) && stars.reduce((a, b) => a + b, 0) >= CLEAR_TOTAL_STARS;
}

export function computePanjimIndex(input: IndexInput): PanjimIndex {
  const { state, outcomes } = input;
  const protection = outcomes.length > 0 ? outcomes.reduce((sum, o) => sum + o.protection, 0) / outcomes.length : 0;
  const resilience = clamp100(protection * 100);
  const biodiversity = clamp100((state.biodiversity / 60) * 100);
  const livelihoods = clamp100((input.income / 30) * 100);
  const population = clamp100(((state.population - 50) / 150) * 100);
  const food = clamp100(50 + state.food * 3);
  const index = clamp100((resilience + biodiversity + livelihoods + population + food) / 5);
  const challengeStars: number[] = outcomes.map((o) => o.stars);
  const totalStars = challengeStars.reduce((sum, s) => sum + s, 0);
  const levelStars = Math.max(1, Math.min(3, Math.round(totalStars / Math.max(1, outcomes.length))));
  return { resilience, biodiversity, livelihoods, population, food, index, challengeStars, totalStars, levelStars, cleared: clearsLevel(challengeStars), score: index * 10 + totalStars * 100 };
}

/**
 * The tempo badge: real minutes played, named rather than ranked. A careful
 * player and a fast one both reach 2050; this just says which one you were.
 */
export function tempoBadge(playMs: number): { name: string; minutes: number } {
  const minutes = Math.max(1, Math.round(playMs / 60000));
  if (minutes < 10) return { name: "Swift tide", minutes };
  if (minutes <= 20) return { name: "Steady tide", minutes };
  return { name: "Slow, deep tide", minutes };
}
