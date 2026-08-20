import { describe, expect, it } from "vitest";
import { axialKey, neighbor } from "../src/core/hex";
import { TERRAIN_BY_ID } from "../src/core/terrain";
import mapData from "../src/data/map.json";

interface MapTile {
  q: number;
  r: number;
  terrainId: string;
}
interface MapFile {
  qRange: [number, number];
  rRange: [number, number];
  estuary: { q: number; r: number };
  startingClaim: { q: number; r: number }[];
  tiles: MapTile[];
}
const MAP = mapData as unknown as MapFile;

const byKey = new Map(MAP.tiles.map((t) => [axialKey({ q: t.q, r: t.r }), t.terrainId]));
const [Q_MIN, Q_MAX] = MAP.qRange;
const [R_MIN, R_MAX] = MAP.rRange;

describe("Generated map (Section 4, v2.4: Sea -> Beach -> Land -> Estuary/River) — independent re-verification", () => {
  it("uses only the five terrain ids", () => {
    for (const t of MAP.tiles) {
      expect(TERRAIN_BY_ID.has(t.terrainId), `unknown terrain id ${t.terrainId}`).toBe(true);
      expect(["coast", "beach", "land", "river", "estuary"]).toContain(t.terrainId);
    }
  });

  it("confines Coast to a single column on the west edge, present in every row", () => {
    for (let r = R_MIN; r <= R_MAX; r++) {
      const rowCoastTiles = MAP.tiles.filter((t) => t.r === r && t.terrainId === "coast");
      expect(rowCoastTiles, `row r=${r} should have exactly one Coast tile`).toHaveLength(1);
      expect(rowCoastTiles[0].q).toBe(Q_MIN);
    }
  });

  it("every row reads Coast, then Beach, then Land, before any Estuary/River tile — the explicit left-to-right layout", () => {
    for (let r = R_MIN; r <= R_MAX; r++) {
      const row = MAP.tiles.filter((t) => t.r === r).sort((a, b) => a.q - b.q);
      const order: string[] = [];
      for (const t of row) {
        if (order[order.length - 1] !== t.terrainId) order.push(t.terrainId);
      }
      const macro = order.filter((id, i) => id !== order[i - 1]);
      expect(macro[0], `row r=${r}`).toBe("coast");
      expect(macro[1], `row r=${r}`).toBe("beach");
      const landIdx = macro.indexOf("land");
      expect(landIdx, `row r=${r} should have Land after Beach`).toBeGreaterThan(0);
      const waterIndices = ["estuary", "river"].map((id) => macro.indexOf(id)).filter((i) => i >= 0);
      for (const wi of waterIndices) {
        expect(wi, `row r=${r}: Land should come before any Estuary/River`).toBeGreaterThan(landIdx);
      }
    }
  });

  it("has a wide, branching Estuary (multiple connected tiles) feeding from a continuous River, confined to the eastern portion of the map", () => {
    const estuaryTiles = MAP.tiles.filter((t) => t.terrainId === "estuary");
    expect(estuaryTiles.length, "estuary should be a multi-tile blob, not a single tile").toBeGreaterThanOrEqual(3);

    const estuaryKey = axialKey(MAP.estuary);
    expect(byKey.get(estuaryKey)).toBe("estuary");

    // Flood-fill the whole estuary+river network from the estuary center.
    const visited = new Set<string>([estuaryKey]);
    const queue = [MAP.estuary];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(cur, dir);
        const nKey = axialKey(n);
        if (visited.has(nKey)) continue;
        const terrainId = byKey.get(nKey);
        if (terrainId !== "river" && terrainId !== "estuary") continue;
        visited.add(nKey);
        queue.push(n);
      }
    }
    const riverTileCount = MAP.tiles.filter((t) => t.terrainId === "river").length;
    expect(visited.size).toBe(riverTileCount + estuaryTiles.length); // every river/estuary tile reachable from the estuary center, none isolated

    // Every estuary/river tile should sit in the eastern portion of the map.
    const eastBoundary = Q_MIN + Math.floor((Q_MAX - Q_MIN + 1) * 0.62);
    for (const t of [...MAP.tiles.filter((x) => x.terrainId === "river"), ...estuaryTiles]) {
      expect(t.q, `estuary/river tile (${t.q},${t.r}) should be east of the Land interior`).toBeGreaterThanOrEqual(eastBoundary);
    }
  });

  it("fills every non-Coast/Beach/River/Estuary tile with Land", () => {
    for (const t of MAP.tiles) {
      if (["coast", "beach", "river", "estuary"].includes(t.terrainId)) continue;
      expect(t.terrainId).toBe("land");
    }
  });

  it("gives the player a small (2-3 hex) starting claim on the coast, not at the (now-inland) estuary", () => {
    expect(MAP.startingClaim.length).toBeGreaterThanOrEqual(2);
    expect(MAP.startingClaim.length).toBeLessThanOrEqual(3);
    for (const coord of MAP.startingClaim) {
      expect(byKey.has(axialKey(coord))).toBe(true);
      expect(coord.q, "starting claim should be near the coast (low q), not the eastern estuary").toBeLessThan(Q_MIN + 5);
    }
  });
});
