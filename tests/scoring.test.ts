import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { computeEraScore, computeEraScoreBreakdown } from "../src/core/scoring";

describe("computeEraScore (Section 7: not just biggest-map, not just never-build-engineered)", () => {
  it("increases when a biodiversity-positive defense is built", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    state.coin = 500;
    const before = computeEraScore(state);

    const target = { q: 0, r: -1 };
    state.debugForcePlace(target, "estuary");
    state.build(target, "mangrove"); // positive biodiversity effect

    expect(computeEraScore(state)).toBeGreaterThan(before);
  });

  it("does not let map size alone dominate the score", () => {
    const small = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    small.trust = 90;
    small.resilience = 90;

    const big = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    big.trust = 5;
    big.resilience = 5;
    for (let i = 1; i <= 40; i++) big.debugForcePlace({ q: i, r: 0 }, "beach");

    // A huge, but otherwise-devastated, map should not automatically outscore
    // a small, thriving one.
    expect(computeEraScore(small)).toBeGreaterThan(computeEraScore(big));
  });
});

describe("computeEraScoreBreakdown (STEP_PROMPT_balance_tuning_findings.md Section 2: what the end-of-era screen shows)", () => {
  it("sums to exactly computeEraScore's own total, and reports the trust/resilience terms unweighted", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    state.coin = 500;
    const target = { q: 0, r: -1 };
    state.debugForcePlace(target, "estuary");
    state.build(target, "mangrove");
    state.trust = 42;
    state.resilience = 77;

    const breakdown = computeEraScoreBreakdown(state);
    expect(breakdown.total).toBeCloseTo(computeEraScore(state), 10);
    expect(breakdown.trust).toBe(42);
    expect(breakdown.resilience).toBe(77);
    const sum = breakdown.trust + breakdown.resilience + breakdown.biodiversity + breakdown.carbon + breakdown.turnsSurvived + breakdown.mapFootprint;
    expect(breakdown.total).toBeCloseTo(sum, 10);
  });
});
