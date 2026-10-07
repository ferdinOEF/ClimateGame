import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { computePanjimIndex, tempoBadge } from "../src/core/panjimIndex";
import type { ChallengeOutcome } from "../src/core/zones";

const outcome = (protection: number, stars: 1 | 2 | 3): ChallengeOutcome => ({
  intensity: 30,
  zones: [],
  protection,
  stars,
  housesSaved: 0,
  housesTotal: 0,
  housesDamaged: 0,
  damagedHouses: []
});

describe("Panjim 2050 index", () => {
  it("averages five 0–100 counts and adds 100 per star to the score", () => {
    const state = new GameState([], [], 0);
    const result = computePanjimIndex({ state, outcomes: [outcome(1, 3), outcome(0.6, 2), outcome(0.2, 1)], incomePerQuarter: 15 });
    expect(result.resilience).toBe(60);
    expect(result.livelihoods).toBe(50);
    expect(result.food).toBe(50);
    expect(result.challengeStars).toEqual([3, 2, 1]);
    expect(result.levelStars).toBe(2);
    expect(result.score).toBe(result.index * 10 + 600);
  });

  it("never gives a finished run fewer than one star", () => {
    const result = computePanjimIndex({ state: new GameState([], [], 0), outcomes: [outcome(0, 1), outcome(0, 1), outcome(0, 1)], incomePerQuarter: 0 });
    expect(result.levelStars).toBe(1);
  });

  it("keeps real time out of the score: the tempo badge is a name, not a number in it", () => {
    expect(tempoBadge(8 * 60000).name).toBe("Swift tide");
    expect(tempoBadge(14 * 60000).name).toBe("Steady tide");
    expect(tempoBadge(31 * 60000).name).toBe("Slow, deep tide");
  });
});
