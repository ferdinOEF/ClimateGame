import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveMonsoonFlood } from "../src/core/hazard";
import { neighbor, axialKey } from "../src/core/hex";

const RIVER = { q: 0, r: 0 };

function freshState(): GameState {
  const state = new GameState({ coord: RIVER, terrainId: "river" });
  state.coin = 500;
  return state;
}

/** Backdates a just-built defense's construction turn so it reads as fully matured. */
function forceMature(state: GameState, coord: { q: number; r: number }): void {
  const inst = state.defenses.get(axialKey(coord));
  if (inst) inst.builtOnTurn = -1000;
}

describe("resolveMonsoonFlood — no defense", () => {
  it("deals full decayed severity to an undefended downstream tile", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "khazan_flatland");

    const result = resolveMonsoonFlood(state, 1.0);
    expect(result.tileDamage.get(axialKey(target))).toBeCloseTo(0.72, 5);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(result.overwhelmedDefenses).toHaveLength(0);
  });

  it("does not flow uphill onto a higher elevation tier", () => {
    const state = freshState();
    const upstreamHighland = neighbor(RIVER, 0);
    state.debugForcePlace(upstreamHighland, "laterite_plateau"); // highland > river's midland

    const result = resolveMonsoonFlood(state, 1.0);
    expect(result.tileDamage.has(axialKey(upstreamHighland))).toBe(false);
  });
});

describe("resolveMonsoonFlood — NBS (riparian forest buffer)", () => {
  it("reduces damage below the undefended amount when not overwhelmed", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "forest");
    expect(state.buildDefense(target, "riparian_forest_buffer")).toBe(true);
    forceMature(state, target);

    const result = resolveMonsoonFlood(state, 1.0); // arrives at 0.72, well under overwhelmSeverity 1.3
    const dealt = result.tileDamage.get(axialKey(target))!;

    expect(dealt).toBeLessThan(0.72);
    expect(dealt).toBeCloseTo(0.72 * (1 - 0.45), 5);
    expect(state.defenses.has(axialKey(target))).toBe(true); // never destroyed
    expect(result.overwhelmedDefenses).toHaveLength(0);
  });

  it("gets overwhelmed above its threshold but survives (no catastrophic failure)", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "forest");
    state.buildDefense(target, "riparian_forest_buffer");
    forceMature(state, target);

    const result = resolveMonsoonFlood(state, 2.5); // arrives at 1.8, over overwhelmSeverity 1.3
    const key = axialKey(target);

    expect(result.overwhelmedDefenses).toContain(key);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(state.defenses.has(key)).toBe(true); // still standing
    // NBS overwhelm is temporary only — no permanent degrade recorded.
    expect(state.defenses.get(key)!.degradeAmount).toBe(0);
  });
});

describe("resolveMonsoonFlood — engineered (river embankment)", () => {
  it("absorbs most damage and survives below its failure threshold", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "khazan_flatland");
    state.buildDefense(target, "river_embankment");

    const result = resolveMonsoonFlood(state, 1.0); // arrives at 0.72, under failureThreshold 1.1
    const key = axialKey(target);

    expect(result.tileDamage.get(key)).toBeCloseTo(0.72 * (1 - 0.85), 5);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(state.defenses.has(key)).toBe(true);
  });

  it("catastrophically fails above threshold and redirects an amplified surge onward", () => {
    // With the embankment: destroyed, and the tile behind it takes MORE
    // damage than an equivalent undefended run — the "safe until,
    // spectacularly, it isn't" behavior the brief calls for.
    const withDefense = freshState();
    const embankmentTile = neighbor(RIVER, 0);
    const downstreamTile = neighbor(embankmentTile, 0);
    withDefense.debugForcePlace(embankmentTile, "khazan_flatland");
    withDefense.debugForcePlace(downstreamTile, "khazan_flatland");
    withDefense.buildDefense(embankmentTile, "river_embankment");

    const resultWithDefense = resolveMonsoonFlood(withDefense, 2.0); // arrives at 1.44, over failureThreshold 1.1
    const embKey = axialKey(embankmentTile);
    const downKey = axialKey(downstreamTile);

    expect(resultWithDefense.destroyedDefenses).toContain(embKey);
    expect(withDefense.defenses.has(embKey)).toBe(false);
    expect(resultWithDefense.tileDamage.get(embKey)).toBeCloseTo(1.44, 5); // full damage, defense gave no protection this time

    const control = freshState();
    control.debugForcePlace(embankmentTile, "khazan_flatland");
    control.debugForcePlace(downstreamTile, "khazan_flatland");
    // No defense built at all in the control run.
    const resultControl = resolveMonsoonFlood(control, 2.0);

    expect(resultWithDefense.tileDamage.get(downKey)!).toBeGreaterThan(resultControl.tileDamage.get(downKey)!);
  });
});

describe("resolveMonsoonFlood — hybrid (khazan)", () => {
  it("reduces damage and never appears in destroyedDefenses even when overwhelmed", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "khazan_flatland");
    state.buildDefense(target, "khazan");
    forceMature(state, target);

    const result = resolveMonsoonFlood(state, 3.0); // arrives at 2.16, over overwhelmSeverity 1.6
    const key = axialKey(target);

    expect(result.destroyedDefenses).toHaveLength(0);
    expect(state.defenses.has(key)).toBe(true);
    expect(result.overwhelmedDefenses).toContain(key);
  });

  it("degrades gracefully: a repeat event at the same severity deals more damage the second time", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "khazan_flatland");
    state.buildDefense(target, "khazan");
    forceMature(state, target);
    const key = axialKey(target);

    const first = resolveMonsoonFlood(state, 3.0);
    expect(state.defenses.get(key)!.degradeAmount).toBeGreaterThan(0);

    const second = resolveMonsoonFlood(state, 3.0);
    expect(second.tileDamage.get(key)!).toBeGreaterThan(first.tileDamage.get(key)!);
  });
});

describe("Maintenance neglect (Section 5's khazan/engineered upkeep tradeoff)", () => {
  it("silently weakens a defense whose upkeep goes unpaid, with no hazard involved", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "khazan_flatland");
    state.buildDefense(target, "khazan");
    const key = axialKey(target);
    expect(state.defenses.get(key)!.degradeAmount).toBe(0);

    state.coin = 0; // can't afford the next upkeep payment
    state.advanceTurn();

    expect(state.defenses.get(key)!.degradeAmount).toBeGreaterThan(0);
  });
});
