import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { BUILDING_BY_ID } from "../src/core/buildings";

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

describe("Buildings & economy", () => {
  it("paddy field is only buildable on khazan_flatland", () => {
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "khazan_flatland" });
    const options = state.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options).toContain("paddy_field");

    const state2 = new GameState({ coord: { q: 0, r: 0 }, terrainId: "village_plains" });
    const options2 = state2.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options2).not.toContain("paddy_field");
  });

  it("fishing dock requires coast/estuary adjacency", () => {
    const inland = new GameState({ coord: { q: 0, r: 0 }, terrainId: "village_plains" });
    expect(inland.buildableAt({ q: 0, r: 0 }).map((d) => d.id)).not.toContain("fishing_dock");
  });

  it("build() deducts cost and rejects when unaffordable", () => {
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "village_plains" });
    const before = state.coin;
    const def = BUILDING_BY_ID.get("village_hut")!;

    expect(state.build({ q: 0, r: 0 }, "village_hut")).toBe(true);
    expect(state.coin).toBe(before - def.buildCost);

    // Already has a building on that tile now.
    expect(state.build({ q: 0, r: 0 }, "grove")).toBe(false);

    state.coin = 0;
    const state2 = new GameState({ coord: { q: 1, r: 0 }, terrainId: "village_plains" });
    state2.coin = 0;
    expect(state2.build({ q: 1, r: 0 }, "village_hut")).toBe(false);
  });

  it("each tile placement (turn) pays out building income", () => {
    const rng = mulberry32(5);
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "village_plains" }, rng);
    state.build({ q: 0, r: 0 }, "village_hut");
    const def = BUILDING_BY_ID.get("village_hut")!;
    const coinAfterBuild = state.coin;

    const i = state.hand.findIndex((t) => state.legalFrontierFor(t).length > 0);
    const coord = state.legalFrontierFor(state.hand[i])[0];
    state.placeFromHand(i, coord);

    expect(state.turn).toBe(1);
    expect(state.coin).toBe(coinAfterBuild + def.coinPerTurn);
  });
});
