import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveMonsoonFlood } from "../src/core/hazard";
import { neighbor, axialKey } from "../src/core/hex";

const RIVER = { q: 0, r: 0 };

function freshState(): GameState {
  const state = new GameState([{ coord: RIVER, terrainId: "river" }]);
  state.coin = 500;
  return state;
}

/** Backdates a just-built defense's construction turn so it reads as fully matured. */
function forceMature(state: GameState, coord: { q: number; r: number }): void {
  const inst = state.elements.get(axialKey(coord));
  if (inst) inst.builtOnTurn = -1000;
}

describe("resolveMonsoonFlood — no defense", () => {
  it("deals full decayed severity to an undefended downstream tile", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "beach");

    const result = resolveMonsoonFlood(state, 1.0);
    expect(result.tileDamage.get(axialKey(target))).toBeCloseTo(0.72, 5);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(result.overwhelmedDefenses).toHaveLength(0);
  });

  it("decays with distance from the river (v2.2: no elevation gating, just adjacency-based spread)", () => {
    const state = freshState();
    const near = neighbor(RIVER, 0);
    const far = neighbor(near, 0);
    state.debugForcePlace(near, "beach");
    state.debugForcePlace(far, "beach");

    const result = resolveMonsoonFlood(state, 1.0);
    const nearDamage = result.tileDamage.get(axialKey(near))!;
    const farDamage = result.tileDamage.get(axialKey(far))!;
    expect(farDamage).toBeLessThan(nearDamage);
  });
});

describe("resolveMonsoonFlood — NBS (mangrove)", () => {
  it("reduces damage below the undefended amount when not overwhelmed", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "estuary");
    expect(state.build(target, "mangrove")).toBe(true);
    forceMature(state, target);

    const result = resolveMonsoonFlood(state, 1.0); // arrives at 0.72, well under overwhelmSeverity 1.4
    const dealt = result.tileDamage.get(axialKey(target))!;

    expect(dealt).toBeLessThan(0.72);
    expect(dealt).toBeCloseTo(0.72 * (1 - 0.55), 5);
    expect(state.elements.has(axialKey(target))).toBe(true); // never destroyed
    expect(result.overwhelmedDefenses).toHaveLength(0);
  });

  it("gets overwhelmed above its threshold but survives (no catastrophic failure)", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "estuary");
    state.build(target, "mangrove");
    forceMature(state, target);

    const result = resolveMonsoonFlood(state, 3.0); // arrives at 2.16, over overwhelmSeverity 1.4
    const key = axialKey(target);

    expect(result.overwhelmedDefenses).toContain(key);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(state.elements.has(key)).toBe(true); // still standing
    // NBS overwhelm is temporary only — no permanent degrade recorded.
    expect(state.elements.get(key)!.degradeAmount).toBe(0);
  });
});

describe("resolveMonsoonFlood — engineered (small dam)", () => {
  it("absorbs most damage and survives below its failure threshold", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "river");
    state.build(target, "small_dam");

    // A Small Dam sits directly on its own river tile (Section 4), which
    // makes that tile a flood source in its own right (every river tile
    // is), not a downstream tile reached via propagation — so it engages
    // at the full, undecayed baseSeverity, not baseSeverity*FLOOD_DECAY.
    const result = resolveMonsoonFlood(state, 1.0); // 1.0, under failureThreshold 1.15
    const key = axialKey(target);

    expect(result.tileDamage.get(key)).toBeCloseTo(1.0 * (1 - 0.75), 5);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(state.elements.has(key)).toBe(true);
  });

  it("reduces downstream flood damage relative to an undefended river source — helps, not hurts (STEP_PROMPT_visuals_map_river.md item 3: resilience sign flip)", () => {
    const withDam = freshState();
    const damTarget = neighbor(RIVER, 0);
    withDam.debugForcePlace(damTarget, "beach");
    withDam.build(RIVER, "small_dam");

    const withoutDam = freshState();
    const bareTarget = neighbor(RIVER, 0);
    withoutDam.debugForcePlace(bareTarget, "beach");
    // (no build — matches "resolveMonsoonFlood — no defense"'s baseline above)

    const resultWithDam = resolveMonsoonFlood(withDam, 1.0);
    const resultWithoutDam = resolveMonsoonFlood(withoutDam, 1.0);

    const downstreamWithDam = resultWithDam.tileDamage.get(axialKey(damTarget))!;
    const downstreamWithoutDam = resultWithoutDam.tileDamage.get(axialKey(bareTarget))!;
    expect(downstreamWithDam).toBeLessThan(downstreamWithoutDam);
  });

  it("catastrophically fails above threshold and redirects an amplified surge onward", () => {
    // With the dam: destroyed, and the tile behind it takes MORE damage
    // than an equivalent undefended run — the "safe until, spectacularly,
    // it isn't" behavior the brief calls for.
    const withDefense = freshState();
    const damTile = neighbor(RIVER, 0);
    const downstreamTile = neighbor(damTile, 0);
    withDefense.debugForcePlace(damTile, "river");
    withDefense.debugForcePlace(downstreamTile, "beach");
    withDefense.build(damTile, "small_dam");

    const resultWithDefense = resolveMonsoonFlood(withDefense, 2.0); // 2.0 (a source tile, undecayed), over failureThreshold 1.15
    const damKey = axialKey(damTile);
    const downKey = axialKey(downstreamTile);

    expect(resultWithDefense.destroyedDefenses).toContain(damKey);
    expect(withDefense.elements.has(damKey)).toBe(false);
    expect(resultWithDefense.tileDamage.get(damKey)).toBeCloseTo(2.0, 5); // full source severity, defense gave no protection this time

    const control = freshState();
    control.debugForcePlace(damTile, "river");
    control.debugForcePlace(downstreamTile, "beach");
    // No defense built at all in the control run.
    const resultControl = resolveMonsoonFlood(control, 2.0);

    expect(resultWithDefense.tileDamage.get(downKey)!).toBeGreaterThan(resultControl.tileDamage.get(downKey)!);
  });
});

describe("resolveMonsoonFlood — hybrid (khazan)", () => {
  it("reduces damage and never appears in destroyedDefenses even when overwhelmed", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "estuary");
    state.build(target, "khazan");
    forceMature(state, target);

    const result = resolveMonsoonFlood(state, 3.0); // arrives at 2.16, over overwhelmSeverity 1.6
    const key = axialKey(target);

    expect(result.destroyedDefenses).toHaveLength(0);
    expect(state.elements.has(key)).toBe(true);
    expect(result.overwhelmedDefenses).toContain(key);
  });

  it("degrades gracefully: a repeat event at the same severity deals more damage the second time", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "estuary");
    state.build(target, "khazan");
    forceMature(state, target);
    const key = axialKey(target);

    const first = resolveMonsoonFlood(state, 3.0);
    expect(state.elements.get(key)!.degradeAmount).toBeGreaterThan(0);

    const second = resolveMonsoonFlood(state, 3.0);
    expect(second.tileDamage.get(key)!).toBeGreaterThan(first.tileDamage.get(key)!);
  });
});

describe("Maintenance neglect (Section 5's khazan/engineered upkeep tradeoff)", () => {
  it("silently weakens a defense whose upkeep goes unpaid, with no hazard involved", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "estuary");
    state.build(target, "khazan");
    const key = axialKey(target);
    expect(state.elements.get(key)!.degradeAmount).toBe(0);

    state.coin = 0; // can't afford the next upkeep payment
    state.advanceTurn();

    expect(state.elements.get(key)!.degradeAmount).toBeGreaterThan(0);
  });
});
