import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { computeEraScore } from "../src/core/scoring";

describe("computeEraScore (Section 7: not just biggest-map, not just never-build-engineered)", () => {
  it("increases when biodiversity/carbon-positive defenses are built", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    state.coin = 500;
    const before = computeEraScore(state);

    const target = { q: 0, r: -1 };
    state.debugForcePlace(target, "estuary");
    state.buildDefense(target, "mangrove_buffer"); // positive biodiversity/carbon coBenefits

    expect(computeEraScore(state)).toBeGreaterThan(before);
  });

  it("does not let map size alone dominate the score", () => {
    const small = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    small.trust = 90;
    small.resilience = 90;

    const big = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    big.trust = 5;
    big.resilience = 5;
    for (let i = 1; i <= 40; i++) big.debugForcePlace({ q: i, r: 0 }, "village_plains");

    // A huge, but otherwise-devastated, map should not automatically outscore
    // a small, thriving one.
    expect(computeEraScore(small)).toBeGreaterThan(computeEraScore(big));
  });
});
