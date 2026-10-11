import { describe, expect, it } from "vitest";
import { buildingGeometry } from "../src/render/townGeometry";
import { townLayout, FABRIC_MAX, FABRIC_MIN } from "../src/levels/townLayout";
import { mapById } from "../src/levels/levelMap";
import { axialKey } from "../src/core/hex";

const panaji = mapById("panaji")!;
const town = townLayout(panaji, "l01-first-rains");

describe("city fabric (Section 3)", () => {
  it("puts 1 to 7 structures on every built tile, seeded", () => {
    const counts = [...town.buildings.values()].map((plot) => 1 + plot.fabric.length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(FABRIC_MIN);
    expect(Math.max(...counts)).toBeLessThanOrEqual(FABRIC_MAX);
    // Dense somewhere, sparse somewhere.
    expect(counts.filter((n) => n >= 6).length).toBeGreaterThan(20);
    expect(counts.filter((n) => n <= 2).length).toBeGreaterThan(20);
    const again = townLayout(panaji, "l01-first-rains");
    expect(JSON.stringify([...again.buildings])).toBe(JSON.stringify([...town.buildings]));
    const triangles = (kind: Parameters<typeof buildingGeometry>[0]): number => buildingGeometry(kind).getAttribute("position").count / 3;
    const total = [...town.buildings.values()].reduce((sum, plot) => sum + triangles(plot.kind) + plot.fabric.reduce((s, part) => s + triangles(part.kind), 0), 0);
    console.log(`structures: ${counts.reduce((a, b) => a + b, 0)} on ${counts.length} tiles; about ${Math.round(total / 1000)}k triangles`);
  });

  it("never stands on a road, a bridge, a monument or a non-land tile", () => {
    const terrain = new Map(panaji.tiles.map((t) => [axialKey(t.coord), t.terrainId]));
    const monuments = new Set(panaji.monuments.map((m) => `${m.q},${m.r}`));
    for (const [key, plot] of town.buildings) {
      expect(terrain.get(key)).toBe("land");
      expect(town.roads.has(key)).toBe(false);
      expect(town.bridges.has(key)).toBe(false);
      expect(monuments.has(key)).toBe(false);
      // Inside its own hex (inner radius 0.866), with room for the shape.
      for (const part of plot.fabric) expect(Math.hypot(part.dx, part.dz) + 0.3 * part.scale * 1.12).toBeLessThan(0.866);
    }
  });
});
