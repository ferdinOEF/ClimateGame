import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveMonsoonFlood, resolveCyclone } from "../src/core/hazard";
import { neighbor, axialKey } from "../src/core/hex";

/** Backdates a just-built defense's construction turn so it reads as fully matured. */
function forceMature(state: GameState, coord: { q: number; r: number }): void {
  const inst = state.elements.get(axialKey(coord));
  if (inst) inst.builtOnTurn = -1000;
}

describe("GameState.clone()", () => {
  it("copies every primitive field by value", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "beach" }]);
    state.coin = 321;
    state.turn = 7;
    state.trust = 42;
    state.resilience = 55;
    state.severityBaseline = 0.24;

    const clone = state.clone();
    expect(clone.coin).toBe(321);
    expect(clone.turn).toBe(7);
    expect(clone.trust).toBe(42);
    expect(clone.resilience).toBe(55);
    expect(clone.severityBaseline).toBe(0.24);

    // Mutating the clone's primitives must never touch the original.
    clone.coin = 999;
    clone.resilience = 0;
    expect(state.coin).toBe(321);
    expect(state.resilience).toBe(55);
  });

  it("copies elements as distinct objects, not shared references", () => {
    const coord = { q: 0, r: 0 };
    const state = new GameState([{ coord, terrainId: "beach" }]);
    state.coin = 500;
    state.build(coord, "seawall");
    const key = axialKey(coord);

    const clone = state.clone();
    clone.degradeDefense(coord, 0.5);
    clone.destroyDefense(coord);

    expect(clone.elements.has(key)).toBe(false);
    expect(state.elements.has(key), "destroying the clone's copy must not destroy the original's").toBe(true);
    expect(state.elements.get(key)!.degradeAmount, "degrading the clone's copy must not degrade the original's").toBe(0);
  });
});

describe("Hazard preview via clone leaves the real GameState untouched (STEP_PROMPT_pacing_telegraph_preview.md Section 3)", () => {
  it("resolveCyclone against a clone destroys/degrades/damages ONLY the clone — the original's defenses, Resilience, and Trust are byte-for-byte unchanged", () => {
    const COAST = { q: 0, r: 0 };
    const seawallTile = neighbor(COAST, 0);
    const mangroveTile = neighbor(COAST, 1);
    const state = new GameState([
      { coord: COAST, terrainId: "coast" },
      { coord: seawallTile, terrainId: "beach" },
      { coord: mangroveTile, terrainId: "estuary" }
    ]);
    state.coin = 500;
    state.build(seawallTile, "seawall");
    state.build(mangroveTile, "mangrove");
    forceMature(state, seawallTile);
    forceMature(state, mangroveTile);

    const seawallKey = axialKey(seawallTile);
    const mangroveKey = axialKey(mangroveTile);

    // Deep snapshot of everything the resolver could possibly touch, before any preview runs.
    const before = {
      coin: state.coin,
      turn: state.turn,
      trust: state.trust,
      resilience: state.resilience,
      severityBaseline: state.severityBaseline,
      seawallDegrade: state.elements.get(seawallKey)!.degradeAmount,
      seawallExists: state.elements.has(seawallKey),
      mangroveDegrade: state.elements.get(mangroveKey)!.degradeAmount,
      elementsCount: state.elements.size
    };

    // Severity 3.0: comfortably breaches Seawall's failureThreshold (1.2)
    // and overwhelms Mangrove's overwhelmSeverity (1.4) — exercises
    // destroyDefense(), degradeDefense(), and applyHazardOutcome() (Trust
    // loss from cyclone's own building-damage rule too, if reachable) all
    // in one resolve, against the CLONE only.
    const previewState = state.clone();
    const result = resolveCyclone(previewState, 3.0);

    // The preview clone really did get mutated — proves this isn't a vacuous test.
    expect(result.destroyedDefenses, "the clone's Seawall should have catastrophically failed").toContain(seawallKey);
    expect(previewState.elements.has(seawallKey)).toBe(false);
    expect(result.overwhelmedDefenses, "the clone's Mangrove should have been overwhelmed").toContain(mangroveKey);
    expect(previewState.resilience).toBeLessThan(before.resilience);

    // The REAL state must be exactly as it was before the preview ran.
    expect(state.coin).toBe(before.coin);
    expect(state.turn).toBe(before.turn);
    expect(state.trust).toBe(before.trust);
    expect(state.resilience).toBe(before.resilience);
    expect(state.severityBaseline).toBe(before.severityBaseline);
    expect(state.elements.size).toBe(before.elementsCount);
    expect(state.elements.has(seawallKey), "the real Seawall must still be standing").toBe(true);
    expect(state.elements.get(seawallKey)!.degradeAmount).toBe(before.seawallDegrade);
    expect(state.elements.get(mangroveKey)!.degradeAmount, "the real Mangrove must not have degraded").toBe(before.mangroveDegrade);
  });

  it("resolveMonsoonFlood against a clone draws down the flood buffer on ONLY the clone — the original Khazan's floodBufferFilled is untouched", () => {
    const RIVER = { q: 0, r: 0 };
    const khazanTile = neighbor(RIVER, 0);
    const state = new GameState([
      { coord: RIVER, terrainId: "river" },
      { coord: khazanTile, terrainId: "estuary" }
    ]);
    state.coin = 500;
    state.build(khazanTile, "khazan");
    forceMature(state, khazanTile);
    const key = axialKey(khazanTile);

    expect(state.elements.get(key)!.floodBufferFilled).toBe(0);

    const previewState = state.clone();
    resolveMonsoonFlood(previewState, 5.0); // well past a full buffer fill

    expect(previewState.elements.get(key)!.floodBufferFilled, "the clone's buffer should have drawn down").toBeGreaterThan(0);
    expect(state.elements.get(key)!.floodBufferFilled, "the real Khazan's buffer must still read empty").toBe(0);
    expect(state.resilience).toBe(100);
  });
});
