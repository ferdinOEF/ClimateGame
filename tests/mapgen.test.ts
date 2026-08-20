import { describe, expect, it } from "vitest";
import { axialKey, axialToWorld, axialDistance, neighbor } from "../src/core/hex";
import { TERRAIN_BY_ID } from "../src/core/terrain";
import mapData from "../src/data/map.json";

interface MapTile {
  q: number;
  r: number;
  terrainId: string;
}
interface MapFile {
  estuary: { q: number; r: number };
  startingClaim: { q: number; r: number }[];
  tiles: MapTile[];
}
const MAP = mapData as MapFile;

const byKey = new Map(MAP.tiles.map((t) => [axialKey({ q: t.q, r: t.r }), t.terrainId]));

describe("Generated map (Section 4, v2.2: coastal-only, fixed, authored, checked in) — independent re-verification", () => {
  it("uses only the four coastal terrain ids", () => {
    for (const t of MAP.tiles) {
      expect(TERRAIN_BY_ID.has(t.terrainId), `unknown terrain id ${t.terrainId}`).toBe(true);
      expect(["coast", "beach", "river", "estuary"]).toContain(t.terrainId);
    }
  });

  it("confines Coast to a single sea-facing edge (a narrow west band)", () => {
    const xs = MAP.tiles.map((t) => axialToWorld({ q: t.q, r: t.r }, 1.0).x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const coastDepth = (xMax - xMin) * 0.1; // coast should only occupy a thin slice of the map's width

    for (const t of MAP.tiles) {
      if (t.terrainId !== "coast") continue;
      const x = axialToWorld({ q: t.q, r: t.r }, 1.0).x;
      expect(x - xMin).toBeLessThan(coastDepth);
    }
  });

  it("has exactly one Estuary tile, adjacent to Coast, at the mouth of a single continuous River", () => {
    const estuaryTiles = MAP.tiles.filter((t) => t.terrainId === "estuary");
    expect(estuaryTiles).toHaveLength(1);

    const estuaryKey = axialKey(MAP.estuary);
    expect(byKey.get(estuaryKey)).toBe("estuary");

    let coastAdjacent = false;
    for (let dir = 0; dir < 6; dir++) {
      if (byKey.get(axialKey(neighbor(MAP.estuary, dir))) === "coast") coastAdjacent = true;
    }
    expect(coastAdjacent, "the estuary should sit right where the river reaches the sea").toBe(true);

    // Flood-fill the river+estuary network from the estuary tile — it should
    // all be one connected path, not several disjoint river fragments.
    const visited = new Set<string>([estuaryKey]);
    const queue = [MAP.estuary];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(cur, dir);
        const nKey = axialKey(n);
        if (visited.has(nKey)) continue;
        if (byKey.get(nKey) !== "river") continue;
        visited.add(nKey);
        queue.push(n);
      }
    }
    const riverTileCount = MAP.tiles.filter((t) => t.terrainId === "river").length;
    expect(visited.size).toBe(riverTileCount + 1); // every river tile is reachable from the estuary, none isolated
  });

  it("fills every non-Coast, non-River, non-Estuary tile with Beach — no other terrain remains", () => {
    for (const t of MAP.tiles) {
      if (t.terrainId === "coast" || t.terrainId === "river" || t.terrainId === "estuary") continue;
      expect(t.terrainId).toBe("beach");
    }
  });

  it("gives the player a small (2-3 hex) starting claim, all part of the fixed map, near the estuary", () => {
    expect(MAP.startingClaim.length).toBeGreaterThanOrEqual(2);
    expect(MAP.startingClaim.length).toBeLessThanOrEqual(3);
    for (const coord of MAP.startingClaim) {
      expect(byKey.has(axialKey(coord))).toBe(true);
      expect(axialDistance(coord, MAP.estuary)).toBeLessThanOrEqual(1);
    }
  });
});
