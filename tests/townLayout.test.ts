import { describe, expect, it } from "vitest";
import { townLayout, WALL_COLOURS, BUILDING_KINDS } from "../src/levels/townLayout";
import { mapById } from "../src/levels/levelMap";
import { axialDistance, axialKey, neighbors } from "../src/core/hex";

const map = mapById("panaji")!;

describe("the town plan", () => {
  const town = townLayout(map, "l01-first-rains");

  it("is deterministic for a given seed, and differs for another", () => {
    const again = townLayout(map, "l01-first-rains");
    expect([...again.buildings]).toEqual([...town.buildings]);
    expect([...again.gardens]).toEqual([...town.gardens]);
    const other = townLayout(map, "another-seed");
    expect(JSON.stringify([...other.buildings])).not.toBe(JSON.stringify([...town.buildings]));
  });

  it("leaves 10-20% of the buildable land as gardens", () => {
    const share = town.gardens.size / (town.gardens.size + town.buildings.size);
    expect(share).toBeGreaterThanOrEqual(0.1);
    expect(share).toBeLessThanOrEqual(0.2);
  });

  it("puts no building on a road tile, and roads are land", () => {
    expect(town.roads.size).toBeGreaterThan(50);
    for (const key of town.roads) {
      expect(town.buildings.has(key)).toBe(false);
      expect(town.gardens.has(key)).toBe(false);
    }
    const terrain = new Map(map.tiles.map((t) => [axialKey(t.coord), t.terrainId]));
    for (const key of town.roads) expect(terrain.get(key)).toBe("land");
    for (const key of town.bridges) expect(["river", "estuary"]).toContain(terrain.get(key));
  });

  it("uses every kind, small houses the commonest, with scale and turn in range", () => {
    const counts = new Map<string, number>();
    for (const plot of town.buildings.values()) {
      counts.set(plot.kind, (counts.get(plot.kind) ?? 0) + 1);
      expect(plot.scale).toBeGreaterThanOrEqual(0.88);
      expect(plot.scale).toBeLessThanOrEqual(1.12);
      expect([0, 1, 2, 3]).toContain(plot.turns);
      expect(plot.wall).toBeLessThan(WALL_COLOURS.length);
    }
    for (const kind of BUILDING_KINDS) expect(counts.get(kind) ?? 0, kind).toBeGreaterThan(0);
    const most = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    expect(most).toBe("small_house");
  });

  it("rarely gives two neighbouring buildings the same wall colour", () => {
    let pairs = 0;
    let same = 0;
    for (const [key, plot] of town.buildings) {
      const [q, r] = key.split(",").map(Number);
      for (const n of neighbors({ q, r })) {
        const other = town.buildings.get(axialKey(n));
        if (!other) continue;
        pairs++;
        if (other.wall === plot.wall) same++;
      }
    }
    expect(same / pairs).toBeLessThan(0.02);
  });

  it("is denser in the old city than at the edges", () => {
    const church = map.landmarks.find((l) => l.name === "Our Lady of the Immaculate Conception")!;
    const share = (near: boolean): number => {
      let built = 0;
      let all = 0;
      for (const key of [...town.buildings.keys(), ...town.gardens]) {
        const [q, r] = key.split(",").map(Number);
        const d = axialDistance({ q, r }, { q: church.q, r: church.r });
        if (near ? d <= 8 : d >= 20) {
          all++;
          if (town.buildings.has(key)) built++;
        }
      }
      return built / all;
    };
    expect(share(true)).toBeGreaterThan(0.95);
    expect(share(false)).toBeLessThan(0.85);
  });
});
