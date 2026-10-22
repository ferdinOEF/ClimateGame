import { describe, expect, it } from "vitest";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID } from "../src/levels/levels";

/** Section 16: the flood's source is a river tile of Panaji's board. (Its saves test went with saves, Section 28.2.) */
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
