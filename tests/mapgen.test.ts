import { describe, expect, it } from "vitest";
import { axialKey, axialToWorld, neighbor } from "../src/core/hex";
import { edgesCompatible, type EdgeType } from "../src/core/edgeTypes";
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

function edgeTypeOf(terrainId: string): EdgeType {
  return TERRAIN_BY_ID.get(terrainId)!.edgeTypes[0];
}

describe("Generated map (Section 4: fixed, authored, checked in) — independent re-verification", () => {
  it("has no incompatible adjacent terrain edges anywhere on the map", () => {
    let violations = 0;
    for (const [key, terrainId] of byKey) {
      const [q, r] = key.split(",").map(Number);
      for (let dir = 0; dir < 3; dir++) {
        const nKey = axialKey(neighbor({ q, r }, dir));
        const nTerrain = byKey.get(nKey);
        if (!nTerrain) continue;
        if (!edgesCompatible(edgeTypeOf(terrainId), edgeTypeOf(nTerrain))) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it("keeps coast/estuary confined to the west band and plateau/forest to the east band", () => {
    const xs = MAP.tiles.map((t) => axialToWorld({ q: t.q, r: t.r }, 1.0).x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const band1 = xMin + (xMax - xMin) / 3;
    const band2 = xMin + (2 * (xMax - xMin)) / 3;

    for (const t of MAP.tiles) {
      const x = axialToWorld({ q: t.q, r: t.r }, 1.0).x;
      if (x < band1) {
        expect(["coast", "estuary", "river"]).toContain(t.terrainId);
      } else if (x >= band2) {
        expect(["laterite_plateau", "forest", "river"]).toContain(t.terrainId);
      }
    }
  });

  it("has a substantial, continuous river network reaching the declared estuary", () => {
    const estuaryKey = axialKey(MAP.estuary);
    expect(byKey.get(estuaryKey)).toBe("estuary");

    // Flood-fill the river+estuary network from the estuary tile.
    const visited = new Set<string>([estuaryKey]);
    const queue = [MAP.estuary];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(cur, dir);
        const nKey = axialKey(n);
        if (visited.has(nKey)) continue;
        const terrainId = byKey.get(nKey);
        if (terrainId !== "river") continue;
        visited.add(nKey);
        queue.push(n);
      }
    }

    // visited includes the estuary tile itself + every connected river tile.
    expect(visited.size).toBeGreaterThanOrEqual(20);
  });

  it("gives the player a small (2-3 hex) starting claim, all part of the fixed map", () => {
    expect(MAP.startingClaim.length).toBeGreaterThanOrEqual(2);
    expect(MAP.startingClaim.length).toBeLessThanOrEqual(3);
    for (const coord of MAP.startingClaim) {
      expect(byKey.has(axialKey(coord))).toBe(true);
    }
  });
});
