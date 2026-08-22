import { describe, expect, it } from "vitest";
import { GameState, type PlacedTile } from "../src/core/gameState";
import { resolveMonsoonFlood, resolveCyclone } from "../src/core/hazard";
import mapData from "../src/data/map.json";

interface MapFile {
  tiles: { q: number; r: number; terrainId: string }[];
}
const mapTiles: PlacedTile[] = (mapData as MapFile).tiles.map((t) => ({
  coord: { q: t.q, r: t.r },
  terrainId: t.terrainId
}));

describe("Era loop (Section 2/9: soft-loss, no hard game-over, no stuck state)", () => {
  it("an undefended era eventually reaches isEraOver via repeated hazards, with no crash", () => {
    // v2.1: hazards spread across the whole fixed map (`placed`), not just
    // claimed land, so no claiming is needed to set this scenario up — but
    // it does need the real map's many river/coast/estuary source tiles to
    // deal enough cumulative damage per event (a single-tile fixture barely
    // dents Resilience at all).
    const state = new GameState(mapTiles);

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
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    expect(state.severityBaseline).toBe(0);
    resolveMonsoonFlood(state, 1.0);
    const afterFirst = state.severityBaseline;
    expect(afterFirst).toBeGreaterThan(0);
    resolveCyclone(state, 1.0);
    expect(state.severityBaseline).toBeGreaterThan(afterFirst);
  });

  it("startNewEra resets play state but preserves erasCompleted, keeping the fixed map (and its claimed status) intact", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    state.debugForcePlace({ q: 5, r: 5 }, "beach");
    state.coin = 500;
    state.build({ q: 0, r: 0 }, "mangrove");
    state.resilience = 0;
    state.trust = 5;
    state.severityBaseline = 3;
    expect(state.erasCompleted).toBe(0);
    expect(state.placed.size).toBe(2); // estuary seed + the beach tile added via debugForcePlace
    expect(state.elements.size).toBe(1);

    state.startNewEra();

    expect(state.erasCompleted).toBe(1);
    expect(state.resilience).toBe(100);
    expect(state.trust).toBe(50);
    expect(state.severityBaseline).toBe(0);
    expect(state.turn).toBe(0);
    expect(state.placed.size).toBe(2); // the fixed map itself is untouched by a new era
    expect(state.elements.size).toBe(0); // built elements don't survive a reset
    // STEP_PROMPT_remove_claiming.md: claimed is always every placed tile
    // now, not a shrinking-back-to-a-starting-cluster set — both tiles
    // (including the one added via debugForcePlace) stay claimed across
    // the reset.
    expect(state.claimed.size).toBe(2);
    expect(state.claimed.has("0,0")).toBe(true);
    expect(state.claimed.has("5,5")).toBe(true);

    state.startNewEra();
    expect(state.erasCompleted).toBe(2);
  });
});
