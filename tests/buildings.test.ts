import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { ELEMENT_BY_ID } from "../src/core/elements";

describe("Buildings & economy (v2.2: Beachside Resort is the one income building)", () => {
  it("beachside resort is only buildable on beach, not on estuary/river/coast", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "beach" }]);
    const options = state.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options).toContain("beachside_resort");

    const state2 = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    const options2 = state2.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options2).not.toContain("beachside_resort");
  });

  it("build() deducts cost and rejects when the tile is occupied or unaffordable", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "beach" }]);
    const before = state.coin;
    const def = ELEMENT_BY_ID.get("beachside_resort")!;

    expect(state.build({ q: 0, r: 0 }, "beachside_resort")).toBe(true);
    expect(state.coin).toBe(before - def.buildCost);

    // Already has an element on that tile now.
    expect(state.build({ q: 0, r: 0 }, "beachside_resort")).toBe(false);

    const state2 = new GameState([{ coord: { q: 1, r: 0 }, terrainId: "beach" }]);
    state2.coin = 0;
    expect(state2.build({ q: 1, r: 0 }, "beachside_resort")).toBe(false);
  });

  it("each claim (turn) pays out building income via the generic effects accumulator", () => {
    const map = [
      { coord: { q: 0, r: 0 }, terrainId: "beach" },
      { coord: { q: 1, r: 0 }, terrainId: "beach" }
    ];
    const state = new GameState(map, [{ q: 0, r: 0 }]); // (1,0) starts unclaimed, on purpose
    state.build({ q: 0, r: 0 }, "beachside_resort");
    const def = ELEMENT_BY_ID.get("beachside_resort")!;
    const coinAfterBuild = state.coin;

    expect(state.claim({ q: 1, r: 0 })).toBe(true);

    expect(state.turn).toBe(1);
    expect(state.coin).toBe(coinAfterBuild - 4 + def.effects.coinPerTurn); // CLAIM_COST is 4
  });
});
