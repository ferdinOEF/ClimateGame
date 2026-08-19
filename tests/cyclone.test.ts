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
  const inst = state.defenses.get(axialKey(coord));
  if (inst) inst.builtOnTurn = -1000;
}

describe("resolveCyclone — spread", () => {
  it("damages the coast source tile itself (unlike flood's river source)", () => {
    const state = freshState();
    const result = resolveCyclone(state, 1.0);
    expect(result.tileDamage.get(axialKey(COAST))).toBeCloseTo(1.0, 5);
  });

  it("reaches a highland neighbor with no elevation gating", () => {
    const state = freshState();
    const highland = neighbor(COAST, 0);
    state.debugForcePlace(highland, "laterite_plateau");

    const result = resolveCyclone(state, 1.0);
    expect(result.tileDamage.has(axialKey(highland))).toBe(true);
  });
});

describe("resolveCyclone — coastal dune (NBS)", () => {
  it("reduces damage when not overwhelmed and survives", () => {
    const state = freshState();
    // Every coast/estuary tile is independently a cyclone source (the storm
    // hits the whole coastline, not one point that propagates along it), so
    // this tile takes the full baseSeverity directly, same as the seed.
    const target = neighbor(COAST, 0);
    state.debugForcePlace(target, "coast");
    state.buildDefense(target, "coastal_dune_windbreak");
    forceMature(state, target);

    const result = resolveCyclone(state, 1.0); // direct hit at 1.0, under overwhelmSeverity 1.3
    const dealt = result.tileDamage.get(axialKey(target))!;

    expect(dealt).toBeCloseTo(1.0 * (1 - 0.35), 5);
    expect(state.defenses.has(axialKey(target))).toBe(true);
  });
});

describe("resolveCyclone — seawall (engineered)", () => {
  it("catastrophically fails above threshold and redirects an amplified surge onward", () => {
    const withDefense = freshState();
    const seawallTile = neighbor(COAST, 0);
    const inlandTile = neighbor(seawallTile, 0);
    withDefense.debugForcePlace(seawallTile, "coast");
    withDefense.debugForcePlace(inlandTile, "khazan_flatland");
    withDefense.buildDefense(seawallTile, "seawall");

    // The seawall's own tile is coast, so it's a direct source hit (2.2),
    // well over failureThreshold 1.2 — this checks the resulting destroy +
    // redirect, not a specific decayed arrival value.
    const resultWithDefense = resolveCyclone(withDefense, 2.2);
    const seawallKey = axialKey(seawallTile);
    const inlandKey = axialKey(inlandTile);

    expect(resultWithDefense.destroyedDefenses).toContain(seawallKey);
    expect(withDefense.defenses.has(seawallKey)).toBe(false);

    const control = freshState();
    control.debugForcePlace(seawallTile, "coast");
    control.debugForcePlace(inlandTile, "khazan_flatland");
    const resultControl = resolveCyclone(control, 2.2);

    expect(resultWithDefense.tileDamage.get(inlandKey)!).toBeGreaterThan(resultControl.tileDamage.get(inlandKey)!);
  });
});

describe("resolveCyclone — Cyclone Shelter (protects Trust, not land)", () => {
  it("provides zero physical damage reduction to its own tile", () => {
    const state = freshState();
    const target = neighbor(COAST, 0);
    state.debugForcePlace(target, "village_plains");
    state.buildDefense(target, "cyclone_shelter");

    const result = resolveCyclone(state, 1.0);
    // Undefended-equivalent damage at this tile is severity*decay = 0.6; the
    // shelter must not have touched tileDamage at all.
    expect(result.tileDamage.get(axialKey(target))).toBeCloseTo(0.6, 5);
  });

  it("substantially reduces Trust lost for a damaged building within its radius", () => {
    const sheltered = freshState();
    const buildingTile = neighbor(COAST, 0);
    const shelterTile = neighbor(buildingTile, 1);
    sheltered.debugForcePlace(buildingTile, "village_plains");
    sheltered.debugForcePlace(shelterTile, "village_plains");
    sheltered.build(buildingTile, "village_hut");
    sheltered.buildDefense(shelterTile, "cyclone_shelter");

    const shelteredResult = resolveCyclone(sheltered, 1.0);

    const unsheltered = freshState();
    unsheltered.debugForcePlace(buildingTile, "village_plains");
    unsheltered.build(buildingTile, "village_hut");
    const unshelteredResult = resolveCyclone(unsheltered, 1.0);

    expect(shelteredResult.shelteredBuildings).toContain(axialKey(buildingTile));
    expect(shelteredResult.trustLost).toBeLessThan(unshelteredResult.trustLost);
    expect(sheltered.trust).toBeGreaterThan(unsheltered.trust);
  });
});
