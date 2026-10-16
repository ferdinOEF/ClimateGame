import { describe, expect, it } from "vitest";
import { skirtTiles } from "../src/render/boardSkirtManager";
import { GAME_MAPS, mapById } from "../src/levels/levelMap";
import { axialKey, neighbors } from "../src/core/hex";

/**
 * The skirt is decoration past the edge of play. The one rule that matters:
 * it never sits on, replaces or hides a playable tile.
 */
describe("the board skirt", () => {
  for (const map of GAME_MAPS) {
    it(`never covers a playable tile on ${map.id}`, () => {
      const board = new Set(map.tiles.map((tile) => axialKey(tile.coord)));
      const skirt = skirtTiles(map.tiles);
      expect(skirt.length).toBeGreaterThan(0);
      for (const tile of skirt) expect(board.has(axialKey(tile.coord)), `skirt hex ${axialKey(tile.coord)} is a board tile`).toBe(false);
      // And no skirt hex appears twice.
      expect(new Set(skirt.map((tile) => axialKey(tile.coord))).size).toBe(skirt.length);
    });
  }

  it("starts right at the board edge and grows outward one ring at a time", () => {
    const panaji = mapById("panaji")!;
    const board = new Set(panaji.tiles.map((tile) => axialKey(tile.coord)));
    const skirt = skirtTiles(panaji.tiles);
    const ringOf = new Map(skirt.map((tile) => [axialKey(tile.coord), tile.ring]));
    for (const tile of skirt) {
      const touches = neighbors(tile.coord).map((coord) => axialKey(coord));
      if (tile.ring === 1) expect(touches.some((key) => board.has(key))).toBe(true);
      else expect(touches.some((key) => ringOf.get(key) === tile.ring - 1)).toBe(true);
    }
  });

  it("continues the terrain it touches: sea off the west coast, land off the east, and land beside the Dona Paula headland's new land", () => {
    const panaji = mapById("panaji")!;
    const skirt = skirtTiles(panaji.tiles, undefined, panaji.skirtOpenSeaWestFromRow);
    // World x is sqrt(3) * (q + r/2); the board spans 0 to 34 in q + r/2.
    const column = (tile: { coord: { q: number; r: number } }): number => tile.coord.q + tile.coord.r / 2;
    // Rows 26-29: the owner's Section 11 edits added land west of the board's edge there (-17..-15, 27..29).
    const west = skirt.filter((tile) => tile.ring === 1 && column(tile) < 0 && tile.coord.r > 10 && tile.coord.r < 26);
    const headland = skirt.filter((tile) => tile.ring === 1 && column(tile) < 0 && tile.coord.r >= 26 && tile.coord.r <= 29);
    expect(headland.some((tile) => tile.terrainId === "land")).toBe(true);
    // ...only its tip: further west it is the open sea again.
    const beyond = skirt.filter((tile) => tile.ring >= 2 && column(tile) < 0 && tile.coord.r >= 10);
    expect(beyond.length).toBeGreaterThan(0);
    expect(beyond.every((tile) => tile.terrainId === "coast")).toBe(true);
    const east = skirt.filter((tile) => tile.ring === 1 && column(tile) > 34 && tile.coord.r > 16 && tile.coord.r < 32);
    expect(west.length).toBeGreaterThan(0);
    expect(east.length).toBeGreaterThan(0);
    expect(west.every((tile) => tile.terrainId === "coast")).toBe(true);
    expect(east.filter((tile) => tile.terrainId === "land").length / east.length).toBeGreaterThan(0.6);
  });
});
