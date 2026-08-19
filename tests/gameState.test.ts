import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { TERRAIN_BY_ID, isWaterFamily } from "../src/core/terrain";
import { axialKey, neighbor, oppositeEdge } from "../src/core/hex";
import { edgesCompatible } from "../src/core/edgeTypes";

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

describe("GameState placement legality", () => {
  it("never offers a dead hand across 30+ scripted placements", () => {
    const rng = mulberry32(42);
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "estuary" }, rng);
    expect(state.handHasAnyLegalPlacement()).toBe(true);

    let placements = 0;
    let guard = 0;
    while (placements < 35 && guard < 5000) {
      guard++;
      expect(state.handHasAnyLegalPlacement()).toBe(true);

      let placedThisRound = false;
      for (let i = 0; i < state.hand.length && !placedThisRound; i++) {
        const legal = state.legalFrontierFor(state.hand[i]);
        if (legal.length > 0) {
          const ok = state.placeFromHand(i, legal[0]);
          expect(ok).toBe(true);
          placedThisRound = true;
          placements++;
        }
      }
      expect(placedThisRound).toBe(true);
      expect(state.handHasAnyLegalPlacement()).toBe(true);
    }

    expect(placements).toBeGreaterThanOrEqual(30);
  });

  it("rejects placement on an already-occupied coord", () => {
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "estuary" });
    expect(state.isLegal({ q: 0, r: 0 }, "coast")).toBe(false);
  });

  it("rejects an edge-incompatible neighbor (rock straight into water)", () => {
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "estuary" });
    const n = neighbor({ q: 0, r: 0 }, 0);
    expect(state.isLegal(n, "laterite_plateau")).toBe(false);
  });

  it("enforces water-continuity: a river/estuary tile must touch existing water", () => {
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "khazan_flatland" }, mulberry32(7));
    // khazan_flatland's edges are FARM-only; find a frontier cell and confirm
    // river/estuary are illegal there since nothing water-family exists yet.
    for (const key of state.frontier) {
      const [q, r] = key.split(",").map(Number);
      expect(state.isLegal({ q, r }, "river")).toBe(false);
      expect(state.isLegal({ q, r }, "estuary")).toBe(false);
    }
  });

  it("every successful placement keeps every touching edge pair compatible", () => {
    const rng = mulberry32(99);
    const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "coast" }, rng);
    for (let round = 0; round < 25; round++) {
      const i = state.hand.findIndex((t) => state.legalFrontierFor(t).length > 0);
      if (i === -1) break;
      const coord = state.legalFrontierFor(state.hand[i])[0];
      const terrainId = state.hand[i];
      state.placeFromHand(i, coord);

      const def = TERRAIN_BY_ID.get(terrainId)!;
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(coord, dir);
        const np = state.placed.get(axialKey(n));
        if (!np) continue;
        const neighborDef = TERRAIN_BY_ID.get(np.terrainId)!;
        const ok = edgesCompatible(def.edgeTypes[dir], neighborDef.edgeTypes[oppositeEdge(dir)]);
        expect(ok).toBe(true);
      }
      if (isWaterFamily(terrainId)) {
        const hasWaterNeighbor = [0, 1, 2, 3, 4, 5].some((dir) => {
          const np = state.placed.get(axialKey(neighbor(coord, dir)));
          return np && isWaterFamily(np.terrainId);
        });
        expect(hasWaterNeighbor).toBe(true);
      }
    }
  });
});
