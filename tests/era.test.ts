import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveMonsoonFlood, resolveCyclone } from "../src/core/hazard";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Era loop (Section 2/9: soft-loss, no hard game-over, no stuck state)", () => {
  it("an undefended era eventually reaches isEraOver via repeated hazards, with no crash", () => {
    const rng = mulberry32(11);
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "estuary" }, rng);

    for (let i = 0; i < 40; i++) {
      const handIdx = state.hand.findIndex((t) => state.legalFrontierFor(t).length > 0);
      if (handIdx === -1) break;
      const coord = state.legalFrontierFor(state.hand[handIdx])[0];
      state.placeFromHand(handIdx, coord);
    }

    expect(state.resilience).toBe(100);
    let guard = 0;
    while (!state.isEraOver && guard < 30) {
      resolveMonsoonFlood(state, 3.0);
      resolveCyclone(state, 3.0);
      guard++;
    }

    expect(state.isEraOver).toBe(true);
    expect(state.resilience).toBe(0);
    expect(guard).toBeLessThan(30); // actually terminated, not stuck
  });

  it("severityBaseline only ever increases within an era", () => {
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "estuary" });
    expect(state.severityBaseline).toBe(0);
    resolveMonsoonFlood(state, 1.0);
    const afterFirst = state.severityBaseline;
    expect(afterFirst).toBeGreaterThan(0);
    resolveCyclone(state, 1.0);
    expect(state.severityBaseline).toBeGreaterThan(afterFirst);
  });

  it("startNewEra resets play state but preserves erasCompleted and keeps the map playable", () => {
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "estuary" });
    state.debugForcePlace({ q: 5, r: 5 }, "forest");
    state.resilience = 0;
    state.trust = 5;
    state.severityBaseline = 3;
    expect(state.erasCompleted).toBe(0);

    state.startNewEra();

    expect(state.erasCompleted).toBe(1);
    expect(state.resilience).toBe(100);
    expect(state.trust).toBe(50);
    expect(state.severityBaseline).toBe(0);
    expect(state.turn).toBe(0);
    expect(state.placed.size).toBe(1); // just the fresh seed tile
    expect(state.handHasAnyLegalPlacement()).toBe(true);

    state.startNewEra();
    expect(state.erasCompleted).toBe(2);
  });
});
