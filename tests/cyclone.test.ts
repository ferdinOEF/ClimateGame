import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveCyclone } from "../src/core/hazard";
import { neighbor, axialKey } from "../src/core/hex";

const COAST = { q: 0, r: 0 };

function freshState(): GameState {
  const state = new GameState([{ coord: COAST, terrainId: "coast" }]);
  state.coin = 500;
  return state;
}

function forceMature(state: GameState, coord: { q: number; r: number }): void {
  const inst = state.elements.get(axialKey(coord));
  if (inst) inst.builtOnTurn = -1000;
}

describe("resolveCyclone — spread", () => {
  it("damages the coast source tile itself (unlike flood's river source)", () => {
    const state = freshState();
    const result = resolveCyclone(state, 1.0);
    expect(result.tileDamage.get(axialKey(COAST))).toBeCloseTo(1.0, 5);
  });

  it("reaches an inland neighbor with no elevation gating (v2.2: no elevation system at all)", () => {
    const state = freshState();
    const inland = neighbor(COAST, 0);
    state.debugForcePlace(inland, "beach");

    const result = resolveCyclone(state, 1.0);
    expect(result.tileDamage.has(axialKey(inland))).toBe(true);
  });
});

describe("resolveCyclone — dune (NBS)", () => {
  it("reduces damage when not overwhelmed and survives", () => {
    const state = freshState();
    // Every coast/estuary tile is independently a cyclone source (the storm
    // hits the whole coastline, not one point that propagates along it), so
    // an adjacent beach tile takes the decayed severity, not the full source hit.
    const target = neighbor(COAST, 0);
    state.debugForcePlace(target, "beach");
    state.build(target, "dune");
    forceMature(state, target);

    const result = resolveCyclone(state, 1.0); // arrives at 0.6, under overwhelmSeverity 1.3
    const dealt = result.tileDamage.get(axialKey(target))!;

    expect(dealt).toBeCloseTo(0.6 * (1 - 0.35), 5);
    expect(state.elements.has(axialKey(target))).toBe(true);
  });
});

describe("resolveCyclone — breakwater (STEP_PROMPT_balance_tuning_findings.md Section 3: Coast's first-ever defense option)", () => {
  it("reduces damage on the Coast source tile itself when not overwhelmed, and survives", () => {
    const state = freshState();
    state.build(COAST, "breakwater"); // Coast is itself the cyclone source tile — no neighbor decay to account for here
    forceMature(state, COAST);

    const result = resolveCyclone(state, 1.0); // below failureThreshold (1.25) — should absorb, not breach
    const dealt = result.tileDamage.get(axialKey(COAST))!;

    expect(dealt).toBeCloseTo(1.0 * (1 - 0.7), 5);
    expect(state.elements.has(axialKey(COAST))).toBe(true);
    expect(result.destroyedDefenses).not.toContain(axialKey(COAST));
  });

  it("catastrophically fails above failureThreshold, same engineered-structure model as Seawall", () => {
    const state = freshState();
    state.build(COAST, "breakwater");
    forceMature(state, COAST);

    const result = resolveCyclone(state, 2.0); // well past failureThreshold (1.25)

    expect(result.destroyedDefenses).toContain(axialKey(COAST));
    expect(state.elements.has(axialKey(COAST))).toBe(false);
  });
});

describe("resolveCyclone — seawall (engineered)", () => {
  it("catastrophically fails above threshold and redirects an amplified surge onward", () => {
    const withDefense = freshState();
    const seawallTile = neighbor(COAST, 0);
    const inlandTile = neighbor(seawallTile, 0);
    withDefense.debugForcePlace(seawallTile, "beach");
    withDefense.debugForcePlace(inlandTile, "beach");
    withDefense.build(seawallTile, "seawall");

    // Arrives at the seawall's tile decayed to 2.2*0.6=1.32, over failureThreshold 1.2
    // — this checks the resulting destroy + redirect, not a specific decayed arrival value.
    const resultWithDefense = resolveCyclone(withDefense, 2.2);
    const seawallKey = axialKey(seawallTile);
    const inlandKey = axialKey(inlandTile);

    expect(resultWithDefense.destroyedDefenses).toContain(seawallKey);
    expect(withDefense.elements.has(seawallKey)).toBe(false);

    const control = freshState();
    control.debugForcePlace(seawallTile, "beach");
    control.debugForcePlace(inlandTile, "beach");
    const resultControl = resolveCyclone(control, 2.2);

    expect(resultWithDefense.tileDamage.get(inlandKey)!).toBeGreaterThan(resultControl.tileDamage.get(inlandKey)!);
  });
});

describe("resolveCyclone — Trust loss from damaged buildings", () => {
  it("costs Trust when a building takes meaningful cyclone damage", () => {
    const state = freshState();
    const buildingTile = neighbor(COAST, 0);
    state.debugForcePlace(buildingTile, "beach");
    state.build(buildingTile, "beachside_resort");

    const before = state.trust;
    resolveCyclone(state, 1.0);
    expect(state.trust).toBeLessThan(before);
  });
});
