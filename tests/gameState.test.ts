import { describe, expect, it } from "vitest";
import { GameState, type PlacedTile } from "../src/core/gameState";
import { axialKey, hexSpiral } from "../src/core/hex";

/** A small synthetic fixed map for claim-mechanic tests — terrain id doesn't matter here (that's mapgen's job now). */
function smallTestMap(radius = 3): PlacedTile[] {
  return hexSpiral({ q: 0, r: 0 }, radius).map((coord) => ({ coord, terrainId: "beach" }));
}

describe("GameState claim mechanic (v2.2: claim-anywhere, no adjacency gate)", () => {
  it("starts with only the given starting cluster claimed, everything else unclaimed", () => {
    const map = smallTestMap();
    const state = new GameState(map, [{ q: 0, r: 0 }]);
    expect(state.claimed.size).toBe(1);
    expect(state.claimed.has(axialKey({ q: 0, r: 0 }))).toBe(true);
    expect(state.placed.size).toBe(map.length); // the whole map exists regardless of claim status
  });

  it("isClaimable is true for every unclaimed tile on the map, not just ones adjacent to claimed land", () => {
    const map = smallTestMap();
    const state = new GameState(map, [{ q: 0, r: 0 }]);
    const farCoord = { q: 3, r: -3 }; // deliberately not adjacent to the starting cluster
    expect(map.some((t) => t.coord.q === farCoord.q && t.coord.r === farCoord.r)).toBe(true);
    expect(state.claimed.has(axialKey(farCoord))).toBe(false);
    expect(state.isClaimable(farCoord)).toBe(true);
  });

  it("rejects claiming an already-claimed tile or a tile outside the map, but allows a distant unclaimed one", () => {
    const map = smallTestMap();
    const state = new GameState(map, [{ q: 0, r: 0 }]);
    expect(state.claim({ q: 0, r: 0 })).toBe(false); // already claimed
    expect(state.claim({ q: 99, r: 99 })).toBe(false); // not part of the fixed map at all
    expect(state.claim({ q: 3, r: -3 })).toBe(true); // far from claimed land, but v2.2 allows it
  });

  it("claiming deducts coin, marks the tile claimed, and counts as a turn", () => {
    const map = smallTestMap();
    const state = new GameState(map, [{ q: 0, r: 0 }]);
    const before = state.coin;
    const target = map.find((t) => !state.claimed.has(axialKey(t.coord)))!.coord;

    expect(state.claim(target)).toBe(true);
    expect(state.coin).toBeLessThan(before);
    expect(state.claimed.has(axialKey(target))).toBe(true);
    expect(state.turn).toBe(1);
  });

  it("never runs out of claimable tiles across 30+ sequential claims (no dead click)", () => {
    const map = smallTestMap(4); // generous radius so coin never runs out before tiles do
    const state = new GameState(map, [{ q: 0, r: 0 }]);
    state.coin = 1000;

    let claims = 0;
    let guard = 0;
    while (claims < 30 && guard < 500) {
      guard++;
      const next = map.find((t) => state.isClaimable(t.coord));
      expect(next).toBeDefined();
      expect(state.claim(next!.coord)).toBe(true);
      claims++;
    }

    expect(claims).toBeGreaterThanOrEqual(30);
  });

  it("buildableAt requires the tile to be claimed first", () => {
    const map: PlacedTile[] = [
      { coord: { q: 0, r: 0 }, terrainId: "estuary" },
      { coord: { q: 1, r: 0 }, terrainId: "beach" }
    ];
    const state = new GameState(map, [{ q: 0, r: 0 }]); // (1,0) intentionally left unclaimed
    expect(state.buildableAt({ q: 1, r: 0 })).toHaveLength(0);

    state.claim({ q: 1, r: 0 });
    expect(state.buildableAt({ q: 1, r: 0 }).length).toBeGreaterThan(0);
  });
});
