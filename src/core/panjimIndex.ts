import type { GameState } from "./gameState";
import type { ChallengeOutcome } from "./zones";

/**
 * The Panjim 2050 index: how the city stands in 2050, on five counts, each
 * 0–100, averaged.
 *
 *   Resilience   how well its defences did on the day, averaged over the
 *                three storms (their protection).
 *   Biodiversity the living coast: the generic biodiversity meter (60 is full).
 *   Livelihoods  what the city earns per quarter in 2050.
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
  incomePerQuarter: number;
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
  /** Index × 10 plus 100 per star: the number the leaderboard compares. */
  score: number;
}

const clamp100 = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export function computePanjimIndex(input: IndexInput): PanjimIndex {
  const { state, outcomes } = input;
  const protection = outcomes.length > 0 ? outcomes.reduce((sum, o) => sum + o.protection, 0) / outcomes.length : 0;
  const resilience = clamp100(protection * 100);
  const biodiversity = clamp100((state.biodiversity / 60) * 100);
  const livelihoods = clamp100((input.incomePerQuarter / 30) * 100);
  const population = clamp100(((state.population - 50) / 150) * 100);
  const food = clamp100(50 + state.food * 3);
  const index = clamp100((resilience + biodiversity + livelihoods + population + food) / 5);
  const challengeStars = outcomes.map((o) => o.stars);
  const totalStars = challengeStars.reduce((sum, s) => sum + s, 0);
  const levelStars = Math.max(1, Math.min(3, Math.round(totalStars / Math.max(1, outcomes.length))));
  return { resilience, biodiversity, livelihoods, population, food, index, challengeStars, totalStars, levelStars, score: index * 10 + totalStars * 100 };
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
