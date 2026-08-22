import { describe, expect, it } from "vitest";
import { axialKey, axialDistance, neighbor } from "../src/core/hex";
import { TERRAIN_BY_ID } from "../src/core/terrain";
import mapData from "../src/data/map.json";
import startingStateData from "../src/data/startingState.json";

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
const STARTING_STATE = startingStateData as unknown as { prebuiltHouses: { q: number; r: number }[] };

const byKey = new Map(MAP.tiles.map((t) => [axialKey({ q: t.q, r: t.r }), t.terrainId]));
const [R_MIN, R_MAX] = MAP.rRange;

/** True world-space X for a hex — used to independently re-verify the map reads as an actual rectangle, not a parallelogram, regardless of how mapgen internally banded terrain. */
function worldX(c: { q: number; r: number }): number {
  return Math.sqrt(3) * (c.q + c.r / 2);
}

describe("Generated map (Section 4, v2.4: Sea -> Beach -> Land, winding River/Estuary) — independent re-verification", () => {
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

  it("every row reads Coast then Beach at its west edge", () => {
    // STEP_PROMPT_map_reshape_veg_icons.md: the River now winds across the
    // full width of the interior instead of staying confined to an eastern
    // band, so it can legitimately appear immediately after Beach on rows
    // near its entry column — there's no "Land always precedes water"
    // invariant left to check per-row. Coast-then-Beach at the west edge is
    // the one ordering guarantee the reshape doesn't touch.
    for (let r = R_MIN; r <= R_MAX; r++) {
      const row = MAP.tiles.filter((t) => t.r === r).sort((a, b) => a.q - b.q);
      const order: string[] = [];
      for (const t of row) {
        if (order[order.length - 1] !== t.terrainId) order.push(t.terrainId);
      }
      const macro = order.filter((id, i) => id !== order[i - 1]);
      expect(macro[0], `row r=${r}`).toBe("coast");
      expect(macro[1], `row r=${r}`).toBe("beach");
    }
  });

  it("never lets River or Estuary touch the Coast/Beach columns", () => {
    for (const t of MAP.tiles) {
      if (t.terrainId !== "river" && t.terrainId !== "estuary") continue;
      const row = MAP.tiles.filter((x) => x.r === t.r);
      const westmostQ = Math.min(...row.map((x) => x.q));
      const colIndex = t.q - westmostQ;
      expect(colIndex, `River/Estuary tile (${t.q},${t.r}) should be in the interior, past Beach`).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives the Estuary as several distinct patches strung along the River, not one blob", () => {
    const estuaryTiles = MAP.tiles.filter((t) => t.terrainId === "estuary");
    expect(estuaryTiles.length, "estuary tile count should land in the 6-9 range").toBeGreaterThanOrEqual(6);
    expect(estuaryTiles.length).toBeLessThanOrEqual(9);

    // Flood-fill Estuary-only tiles (not River) and count connected
    // components — the whole point of the reshape is several separate
    // patches, not one contiguous region.
    const estuaryKeys = new Set(estuaryTiles.map((t) => axialKey({ q: t.q, r: t.r })));
    const seen = new Set<string>();
    let components = 0;
    for (const t of estuaryTiles) {
      const key = axialKey({ q: t.q, r: t.r });
      if (seen.has(key)) continue;
      components++;
      const queue = [{ q: t.q, r: t.r }];
      seen.add(key);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (let dir = 0; dir < 6; dir++) {
          const n = neighbor(cur, dir);
          const nKey = axialKey(n);
          if (!estuaryKeys.has(nKey) || seen.has(nKey)) continue;
          seen.add(nKey);
          queue.push(n);
        }
      }
    }
    expect(components, "Estuary should form several distinct patches, not one contiguous blob").toBeGreaterThanOrEqual(3);
  });

  it("has a continuous River/Estuary network reachable from a single point, with a real River connecting the patches", () => {
    const riverTileCount = MAP.tiles.filter((t) => t.terrainId === "river").length;
    expect(riverTileCount, "river should be a real, multi-tile watercourse").toBeGreaterThan(0);

    const estuaryKey = axialKey(MAP.estuary);
    expect(byKey.get(estuaryKey)).toBe("estuary");

    // Flood-fill the whole river+estuary network from the recorded estuary
    // anchor — every patch should be reachable via the winding River, since
    // that's what strings the distinct patches together into one system.
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
    const estuaryTileCount = MAP.tiles.filter((t) => t.terrainId === "estuary").length;
    expect(visited.size, "every River/Estuary tile should be reachable from the estuary anchor — no isolated patch").toBe(riverTileCount + estuaryTileCount);
  });

  it("fills every non-Coast/Beach/River/Estuary tile with Land", () => {
    for (const t of MAP.tiles) {
      if (["coast", "beach", "river", "estuary"].includes(t.terrainId)) continue;
      expect(t.terrainId).toBe("land");
    }
  });

  it("gives the player a small (2-3 hex) starting claim on the coast, not at the (interior) river/estuary", () => {
    expect(MAP.startingClaim.length).toBeGreaterThanOrEqual(2);
    expect(MAP.startingClaim.length).toBeLessThanOrEqual(3);
    for (const coord of MAP.startingClaim) {
      expect(byKey.has(axialKey(coord))).toBe(true);
      const row = MAP.tiles.filter((t) => t.r === coord.r);
      const westmostQ = Math.min(...row.map((t) => t.q));
      expect(coord.q - westmostQ, "starting claim should be near the coast (low column index)").toBeLessThan(5);
    }
  });

  it("places the pre-built Houses (the main Residential cluster) clearly apart from the River/Estuary network, on Land", () => {
    const waterCoords = MAP.tiles.filter((t) => t.terrainId === "river" || t.terrainId === "estuary");
    expect(STARTING_STATE.prebuiltHouses.length).toBe(10);
    for (const house of STARTING_STATE.prebuiltHouses) {
      expect(byKey.get(axialKey(house)), `House at (${house.q},${house.r}) should sit on Land`).toBe("land");
      const minDist = Math.min(...waterCoords.map((w) => axialDistance(house, { q: w.q, r: w.r })));
      expect(minDist, `House at (${house.q},${house.r}) should read as set apart from the river, not adjacent to it`).toBeGreaterThanOrEqual(2);
    }
  });
});
