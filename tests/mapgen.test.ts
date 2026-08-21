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
  rRange: [number, number];
  estuary: { q: number; r: number };
  startingClaim: { q: number; r: number }[];
  tiles: MapTile[];
}
const MAP = mapData as unknown as MapFile;

const byKey = new Map(MAP.tiles.map((t) => [axialKey({ q: t.q, r: t.r }), t.terrainId]));
const [R_MIN, R_MAX] = MAP.rRange;

/** True world-space X for a hex — used to independently re-verify the map reads as an actual rectangle, not a parallelogram, regardless of how mapgen internally banded terrain. */
function worldX(c: { q: number; r: number }): number {
  return Math.sqrt(3) * (c.q + c.r / 2);
}

describe("Generated map (Section 4, v2.4: Sea -> Beach -> Land -> Estuary/River) — independent re-verification", () => {
  it("uses only the five terrain ids", () => {
    for (const t of MAP.tiles) {
      expect(TERRAIN_BY_ID.has(t.terrainId), `unknown terrain id ${t.terrainId}`).toBe(true);
      expect(["coast", "beach", "land", "river", "estuary"]).toContain(t.terrainId);
    }
  });

  it("is an actual rectangle in world space, not a parallelogram — every row's west edge aligns within one half-hex stagger", () => {
    // A plain axial rectangle (q in a fixed range for every r) renders as a
    // parallelogram once axialToWorld's r/2 shear is applied, which is
    // exactly the bug this test guards against: a "diagonal" coastline
    // that a live playtest reported as Sea "wrapping" the map. The fix
    // shifts each row's q-range to cancel that shear, so this checks the
    // actual rendered geometry, not just the terrain-assignment logic.
    const westEdgeXs: number[] = [];
    for (let r = R_MIN; r <= R_MAX; r++) {
      const row = MAP.tiles.filter((t) => t.r === r);
      const westmostQ = Math.min(...row.map((t) => t.q));
      westEdgeXs.push(worldX({ q: westmostQ, r }));
    }
    const drift = Math.max(...westEdgeXs) - Math.min(...westEdgeXs);
    const halfHex = Math.sqrt(3) / 2;
    expect(drift, "west edge should align within one half-hex stagger across all rows, not several hex-widths of diagonal drift").toBeLessThanOrEqual(halfHex + 0.01);
  });

  it("confines Coast to a single column on the west edge, present in every row", () => {
    for (let r = R_MIN; r <= R_MAX; r++) {
      const row = MAP.tiles.filter((t) => t.r === r);
      const westmostQ = Math.min(...row.map((t) => t.q));
      const rowCoastTiles = row.filter((t) => t.terrainId === "coast");
      expect(rowCoastTiles, `row r=${r} should have exactly one Coast tile`).toHaveLength(1);
      expect(rowCoastTiles[0].q, `row r=${r}'s Coast tile should be that row's westmost hex`).toBe(westmostQ);
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

  it("has a wide, branching Estuary (multiple connected tiles) feeding from a continuous River, confined to the eastern portion of each row", () => {
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

    // Every estuary/river tile should sit in the eastern ~38% of its own row.
    for (const t of [...MAP.tiles.filter((x) => x.terrainId === "river"), ...estuaryTiles]) {
      const row = MAP.tiles.filter((x) => x.r === t.r);
      const westmostQ = Math.min(...row.map((x) => x.q));
      const colIndex = t.q - westmostQ;
      const eastBoundary = Math.floor(row.length * 0.62);
      expect(colIndex, `estuary/river tile (${t.q},${t.r}) should be east of the Land interior`).toBeGreaterThanOrEqual(eastBoundary);
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
      const row = MAP.tiles.filter((t) => t.r === coord.r);
      const westmostQ = Math.min(...row.map((t) => t.q));
      expect(coord.q - westmostQ, "starting claim should be near the coast (low column index), not the eastern estuary").toBeLessThan(5);
    }
  });
});
