import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { axialDistance, axialKey } from "../src/core/hex";
import { newPanjimRun } from "../src/levels/panjimRun";
import { tutorialRun } from "../tools/tutorial/sim";

/**
 * Section 41 (owner decisions after the playtest of 10 November 2026): shore defenses, Campal in 2050, and a perfect
 * build that saves every home. Game rules, each pinned here.
 */

const board = (cells: [number, number, string][]): GameState => new GameState(cells.map(([q, r, terrainId]) => ({ coord: { q, r }, terrainId })), [], 100000);
const keysWhere = (state: GameState, fits: (coord: { q: number; r: number }) => boolean): string[] => [...state.placed.values()].filter((t) => fits(t.coord)).map((t) => axialKey(t.coord));

describe("41.1: seawalls and breakwaters at the shore", () => {
  it("the first sea tile is a sea tile beside sand or land; a river tile never, a sea tile touching only wetland never", () => {
    const b = board([
      [0, 0, "coast"], [1, 0, "beach"], // sand beside it
      [0, 3, "coast"], [1, 3, "land"], // land beside it
      [0, 6, "coast"], [1, 6, "estuary"], // only wetland beside it
      [0, 9, "coast"], [1, 9, "river"], // only river beside it
      [0, 12, "river"], [1, 12, "land"], // a river tile beside land
      [0, 15, "coast"], [1, 15, "coast"] // open sea
    ]);
    expect(b.isFirstSea({ q: 0, r: 0 })).toBe(true);
    expect(b.isFirstSea({ q: 0, r: 3 })).toBe(true);
    expect(b.isFirstSea({ q: 0, r: 6 })).toBe(false);
    expect(b.isFirstSea({ q: 0, r: 9 })).toBe(false);
    expect(b.isFirstSea({ q: 0, r: 12 })).toBe(false);
    expect(b.isFirstSea({ q: 0, r: 15 })).toBe(false);
    // The shore tiles themselves are not sea.
    expect(b.isFirstSea({ q: 1, r: 0 })).toBe(false);
    for (const [q, r, first] of [[0, 0, true], [0, 3, true], [0, 6, false], [0, 9, false], [0, 12, false], [0, 15, false]] as const) {
      expect(b.canBuild({ q, r }, "breakwater"), `breakwater ${q},${r}`).toBe(first);
      expect(b.canBuild({ q, r }, "seawall"), `seawall ${q},${r}`).toBe(first);
    }
  });

  it("the data says so: a breakwater on the first sea tile only, a seawall on its shore tiles and the first sea tile", () => {
    expect(ELEMENT_BY_ID.get("breakwater")).toMatchObject({ validTerrainIds: ["coast"], placement: "firstSea" });
    expect(ELEMENT_BY_ID.get("seawall")).toMatchObject({ validTerrainIds: ["beach", "land", "estuary", "coast"], placement: "shoreline" });
  });

  it("a seawall keeps its shore tiles exactly as before: sand, land or wetland with a sea neighbour", () => {
    const b = board([[0, 0, "coast"], [1, 0, "beach"], [2, 0, "beach"], [1, -1, "land"], [0, 1, "estuary"], [3, 0, "land"]]);
    expect(b.canBuild({ q: 1, r: 0 }, "seawall")).toBe(true);
    expect(b.canBuild({ q: 1, r: -1 }, "seawall")).toBe(true);
    expect(b.canBuild({ q: 0, r: 1 }, "seawall")).toBe(true);
    expect(b.canBuild({ q: 2, r: 0 }, "seawall")).toBe(false);
    expect(b.canBuild({ q: 3, r: 0 }, "seawall")).toBe(false);
  });

  it("one defense per tile: a sand tile takes a seawall or a dune or a pandanus, a first sea tile a seawall or a breakwater", () => {
    const b = board([[0, 0, "coast"], [1, 0, "beach"]]);
    expect(b.buildableAt({ q: 1, r: 0 }).map((d) => d.id).filter((id) => ["seawall", "dune", "sandy_vegetation"].includes(id)).sort()).toEqual(["dune", "sandy_vegetation", "seawall"]);
    expect(b.build({ q: 1, r: 0 }, "dune")).toBe(true);
    expect(b.buildableAt({ q: 1, r: 0 })).toEqual([]);
    expect(b.build({ q: 0, r: 0 }, "seawall")).toBe(true);
    expect(b.canBuild({ q: 0, r: 0 }, "breakwater")).toBe(false);
  });

  describe("on Panjim", () => {
    const state = newPanjimRun({ objectives: false, points: false }).state;
    const firstSea = keysWhere(state, (c) => state.isFirstSea(c));

    it("has 83 first sea tiles, 17 of them within 6 tiles of Campal", () => {
      expect(firstSea).toHaveLength(83);
      expect(firstSea.filter((key) => axialDistance({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) }, { q: 6, r: 10 }) <= 6)).toHaveLength(17);
    });

    it("a breakwater fits those 83 tiles and no other; every one of them takes a seawall too", () => {
      expect(keysWhere(state, (c) => state.canBuild(c, "breakwater")).sort()).toEqual([...firstSea].sort());
      for (const key of firstSea) expect(state.canBuild({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) }, "seawall"), key).toBe(true);
    });

    it("a seawall fits its shore tiles as before and the first sea tiles, and nothing else at sea", () => {
      const seawall = keysWhere(state, (c) => state.canBuild(c, "seawall"));
      const atSea = seawall.filter((key) => state.placed.get(key)!.terrainId === "coast");
      expect(atSea.sort()).toEqual([...firstSea].sort());
      for (const key of seawall) {
        if (state.placed.get(key)!.terrainId === "coast") continue;
        expect(state.placementFits(state.placed.get(key)!.coord, "shoreline"), key).toBe(true);
        expect(["beach", "land", "estuary"]).toContain(state.placed.get(key)!.terrainId);
      }
    });

    it("the sea beyond the first tile takes no defense at all", () => {
      for (const tile of state.placed.values()) {
        if (tile.terrainId !== "coast" || state.isFirstSea(tile.coord)) continue;
        expect(state.buildableAt(tile.coord).map((d) => d.id), axialKey(tile.coord)).toEqual([]);
      }
    });
  });

  it("the Tutorial's map follows the same rule: its 11 first sea tiles take a breakwater or a seawall", () => {
    const state = tutorialRun().state;
    const firstSea = keysWhere(state, (c) => state.isFirstSea(c));
    expect(firstSea).toHaveLength(11);
    expect(keysWhere(state, (c) => state.canBuild(c, "breakwater")).sort()).toEqual([...firstSea].sort());
    for (const key of firstSea) expect(state.canBuild(state.placed.get(key)!.coord, "seawall"), key).toBe(true);
  });
});
