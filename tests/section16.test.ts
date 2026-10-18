import { describe, expect, it } from "vitest";
import { boardFingerprint, panjimSaveKey, saveFits, savedRunYear } from "../src/levels/savedRun";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID } from "../src/levels/levels";

/**
 * Section 16: runs saved on the board before the owner's second round of map
 * edits are not offered (their defences would stand on changed ground, and
 * their objective rows name the old first area); and the flood's source is a
 * river tile of Panaji's board.
 */
describe("saves and the board they were made on", () => {
  const id = "l01-first-rains";
  it("offers a save made on this board, and not one made on another or before boards were recorded", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null };
    store.set(panjimSaveKey(id), JSON.stringify({ snapshot: { version: 3, turn: 5 } }));
    expect(savedRunYear(id, 2026, 25, storage)).toBeNull();
    store.set(panjimSaveKey(id), JSON.stringify({ snapshot: { version: 3, turn: 5 }, board: "00000000" }));
    expect(savedRunYear(id, 2026, 25, storage)).toBeNull();
    store.set(panjimSaveKey(id), JSON.stringify({ snapshot: { version: 3, turn: 5 }, board: boardFingerprint(id) }));
    expect(savedRunYear(id, 2026, 25, storage)).toBe(2031);
    expect(saveFits(id, { snapshot: { version: 2 }, board: boardFingerprint(id) })).toBe(false);
  });

  it("fingerprints the board's tiles and monuments, so a changed tile changes it", () => {
    expect(boardFingerprint(id)).toMatch(/^[0-9a-f]{8}$/);
    expect(boardFingerprint(id)).toBe(boardFingerprint(id));
    expect(boardFingerprint("l00-tutorial")).not.toBe(boardFingerprint(id));
  });
});

describe("the flood's source", () => {
  it("is Panaji's upstream Mandovi at the east edge: river tiles on the board's last columns", () => {
    const level = LEVEL_BY_ID.get("l01-first-rains")!;
    const map = mapById(level.mapId)!;
    const sources = level.climate!.floodSource!;
    expect(sources.length).toBeGreaterThan(0);
    for (const key of sources) {
      const [q, r] = key.split(",").map(Number);
      const tile = map.tiles.find((t) => t.coord.q === q && t.coord.r === r)!;
      expect(tile.terrainId, key).toBe("river");
      expect(tile.floodSource, key).toBe(true);
      const eastmost = Math.max(...map.tiles.filter((t) => t.coord.r === r).map((t) => t.coord.q));
      expect(eastmost - q, key).toBeLessThanOrEqual(1);
    }
    expect(map.tiles.filter((t) => t.floodSource).length).toBe(sources.length);
  });
});
