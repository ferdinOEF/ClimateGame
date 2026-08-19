import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { BUILDING_BY_ID } from "../src/core/buildings";

describe("Buildings & economy", () => {
  it("paddy field is only buildable on khazan_flatland", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "khazan_flatland" }]);
    const options = state.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options).toContain("paddy_field");

    const state2 = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "village_plains" }]);
    const options2 = state2.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options2).not.toContain("paddy_field");
  });

  it("fishing dock requires coast/estuary adjacency", () => {
    const inland = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "village_plains" }]);
    expect(inland.buildableAt({ q: 0, r: 0 }).map((d) => d.id)).not.toContain("fishing_dock");
  });

  it("build() deducts cost and rejects when unaffordable", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "village_plains" }]);
    const before = state.coin;
    const def = BUILDING_BY_ID.get("village_hut")!;

    expect(state.build({ q: 0, r: 0 }, "village_hut")).toBe(true);
    expect(state.coin).toBe(before - def.buildCost);

    // Already has a building on that tile now.
    expect(state.build({ q: 0, r: 0 }, "grove")).toBe(false);

    const state2 = new GameState([{ coord: { q: 1, r: 0 }, terrainId: "village_plains" }]);
    state2.coin = 0;
    expect(state2.build({ q: 1, r: 0 }, "village_hut")).toBe(false);
  });

  it("each claim (turn) pays out building income", () => {
    const map = [
      { coord: { q: 0, r: 0 }, terrainId: "village_plains" },
      { coord: { q: 1, r: 0 }, terrainId: "village_plains" }
    ];
    const state = new GameState(map, [{ q: 0, r: 0 }]); // (1,0) starts unclaimed, on purpose
    state.build({ q: 0, r: 0 }, "village_hut");
    const def = BUILDING_BY_ID.get("village_hut")!;
    const coinAfterBuild = state.coin;

    expect(state.claim({ q: 1, r: 0 })).toBe(true);

    expect(state.turn).toBe(1);
    expect(state.coin).toBe(coinAfterBuild - 4 + def.coinPerTurn); // CLAIM_COST is 4
  });
});
