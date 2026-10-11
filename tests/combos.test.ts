import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { computeCombos, newComboMembers } from "../src/core/combos";
import { HAZARD_MODEL, ownMetres } from "../src/core/hazardModel";

function strip(terrain: string, n: number): GameState {
  const tiles = Array.from({ length: n }, (_, q) => ({ coord: { q, r: 0 }, terrainId: terrain }));
  return new GameState(tiles, [], 100000);
}

describe("perfect-fit combos", () => {
  it("forms a Mangrove Belt at three touching mangroves, not two", () => {
    const state = strip("estuary", 4);
    state.build({ q: 0, r: 0 }, "mangrove", false);
    state.build({ q: 1, r: 0 }, "mangrove", false);
    expect(computeCombos(state).members.get("mangrove_belt")!.size).toBe(0);
    const before = computeCombos(state);
    state.build({ q: 2, r: 0 }, "mangrove", false);
    const after = computeCombos(state);
    expect(after.members.get("mangrove_belt")!.size).toBe(3);
    expect(newComboMembers(before, after)).toEqual([{ combo: "mangrove_belt", tiles: ["0,0", "1,0", "2,0"], all: ["0,0", "1,0", "2,0"] }]);
  });

  it("forms a Living Bund and a Beach Shield from adjacent pairs", () => {
    const wet = strip("estuary", 2);
    wet.build({ q: 0, r: 0 }, "khazan", false);
    wet.build({ q: 1, r: 0 }, "mangrove", false);
    expect([...computeCombos(wet).members.get("living_bund")!].sort()).toEqual(["0,0", "1,0"]);
    const sand = strip("beach", 3);
    sand.build({ q: 0, r: 0 }, "dune", false);
    sand.build({ q: 2, r: 0 }, "sandy_vegetation", false);
    expect(computeCombos(sand).members.get("beach_shield")!.size).toBe(0); // not touching
    sand.build({ q: 1, r: 0 }, "sandy_vegetation", false);
    // The dune and the pandanus touching it; the far pandanus touches no dune.
    expect([...computeCombos(sand).members.get("beach_shield")!].sort()).toEqual(["0,0", "1,0"]);
  });

  it("adds a real defence bonus to each member", () => {
    const state = strip("estuary", 3);
    state.maturityField = "matureQuarters";
    state.turn = 0;
    for (let q = 0; q < 3; q++) state.build({ q, r: 0 }, "mangrove", false);
    state.turn = 40;
    const plain = ownMetres(state, "flood", new Set(), new Map(), undefined, HAZARD_MODEL);
    const bonus = computeCombos(state).bonus;
    const withBelt = ownMetres(state, "flood", new Set(), new Map(), bonus, HAZARD_MODEL);
    for (let q = 0; q < 3; q++) {
      const key = `${q},0`;
      expect(plain.get(key)).toBeCloseTo(5 * HAZARD_MODEL.defence.metresPerResilience);
      expect(withBelt.get(key)! - plain.get(key)!).toBeCloseTo((bonus.get(key) ?? 0) * HAZARD_MODEL.defence.comboMetresPerPoint);
      expect(bonus.get(key) ?? 0).toBeGreaterThan(0);
    }
  });
});
