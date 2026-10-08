import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { computeCombos, newComboMembers } from "../src/core/combos";
import { ZoneIndex, zoneDefence } from "../src/core/zones";

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

  it("adds a real defence bonus in the zone", () => {
    const state = strip("estuary", 3);
    state.maturityField = "matureQuarters";
    state.turn = 0;
    for (let q = 0; q < 3; q++) state.build({ q, r: 0 }, "mangrove", false);
    state.turn = 40;
    const zones = new ZoneIndex([{ id: "z2", name: "z2", tiles: [[0, 0], [1, 0], [2, 0]] }]);
    const plain = zoneDefence(state, zones, "z2", "flood");
    const withBelt = zoneDefence(state, zones, "z2", "flood", computeCombos(state).bonus);
    expect(plain).toBe(15);
    expect(withBelt).toBe(21);
  });
});
