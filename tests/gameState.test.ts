import { describe, expect, it } from "vitest";
import { GameState, type PlacedTile } from "../src/core/gameState";
import { axialKey, hexSpiral } from "../src/core/hex";

/** A small synthetic fixed map — terrain id doesn't matter here (that's mapgen's job now). */
function smallTestMap(radius = 3): PlacedTile[] {
  return hexSpiral({ q: 0, r: 0 }, radius).map((coord) => ({ coord, terrainId: "beach" }));
}

describe("GameState: every tile is buildable from turn one (STEP_PROMPT_remove_claiming.md — no separate claim step)", () => {
  it("claimed always equals placed, for the whole map, from construction", () => {
    const map = smallTestMap();
    const state = new GameState(map);
    expect(state.claimed.size).toBe(state.placed.size);
    for (const key of state.placed.keys()) expect(state.claimed.has(key)).toBe(true);
  });

  it("buildableAt returns options for any tile immediately, including ones far from the map's origin", () => {
    const map = smallTestMap();
    const state = new GameState(map);
    const farCoord = { q: 3, r: -3 }; // deliberately far from (0,0)
    expect(map.some((t) => t.coord.q === farCoord.q && t.coord.r === farCoord.r)).toBe(true);
    expect(state.buildableAt(farCoord).length).toBeGreaterThan(0);
  });

  it("build() deducts cost, places the element, and counts as a turn", () => {
    const map = smallTestMap();
    const state = new GameState(map);
    state.coin = 1000;
    const target = map[0].coord;
    const before = state.coin;

    expect(state.build(target, "dune")).toBe(true); // beach-valid, no separate claim needed first
    expect(state.turn).toBe(1);
    expect(state.elements.has(axialKey(target))).toBe(true);
    expect(state.coin).not.toBe(before); // cost deducted (net of that turn's own income, if any)
  });

  it("rejects building on an already-occupied tile or without enough coin", () => {
    const map = smallTestMap();
    const state = new GameState(map);
    state.coin = 1000;
    const target = map[0].coord;
    expect(state.build(target, "dune")).toBe(true);
    expect(state.build(target, "dune")).toBe(false); // occupied now

    const state2 = new GameState(map);
    state2.coin = 0;
    expect(state2.build(map[1].coord, "dune")).toBe(false);
  });

  it("an idle session (no builds) never advances past turn 0", () => {
    const state = new GameState(smallTestMap());
    expect(state.turn).toBe(0);
  });
});

describe("Food deficit — a soft consequence, never a hard block (STEP_PROMPT_economy_food_yacht.md item 2)", () => {
  it("drains Trust and Resilience the moment a Food deficit exists, but never blocks building", () => {
    const map: PlacedTile[] = [{ coord: { q: 0, r: 0 }, terrainId: "land" }];
    const state = new GameState(map);
    state.coin = 500;
    const trustBefore = state.trust;
    const resilienceBefore = state.resilience;

    // A House alone (food -1, no offsetting Mangrove/Khazan) is a guaranteed
    // deficit — and build() is now the sole call site of advanceTurn(), so
    // this single build already exercises the real path a player's action
    // takes, same as the old claim()-based version of this test did.
    const built = state.build({ q: 0, r: 0 }, "house");

    expect(built, "a running Food deficit must never block a build").toBe(true);
    expect(state.food).toBeLessThan(0);
    expect(state.trust).toBeLessThan(trustBefore);
    expect(state.resilience).toBeLessThan(resilienceBefore);
  });

  it("does nothing to Trust/Resilience when Food is at or above zero", () => {
    const map: PlacedTile[] = [{ coord: { q: 0, r: 0 }, terrainId: "estuary" }];
    const state = new GameState(map);
    state.coin = 500;
    const trustBefore = state.trust;
    const resilienceBefore = state.resilience;

    expect(state.build({ q: 0, r: 0 }, "mangrove")).toBe(true); // food +1, no Houses yet — Food stays >= 0

    expect(state.trust).toBe(trustBefore);
    expect(state.resilience).toBe(resilienceBefore);
  });
});
