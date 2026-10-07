import { describe, expect, it } from "vitest";
import { GAME_MAPS, mapById, terrainCounts } from "../src/levels/levelMap";
import { LEVELS } from "../src/levels/levels";
import { axialKey } from "../src/core/hex";

/**
 * Monuments are the sixteen real Panjim landmarks standing on the board.
 *
 * They are map data, which means every way they can be wrong is a data bug
 * that typechecks: a coordinate that is not a tile, two of them on the same
 * hex, a `kind` the renderer has never heard of. None of those throw — they
 * produce a building floating over nothing, a building inside another
 * building, or a silent fallback to a generic civic block. This is where that
 * gets caught.
 *
 * The renderer's own geometry module is deliberately not imported here: it
 * pulls in Three.js, and this suite runs in Node with no browser. The list of
 * kinds it knows is small, stable and checked against this literal instead —
 * which also means adding a kind to the data without teaching the renderer
 * fails here rather than at runtime.
 */

/** Must stay in step with `BUILDERS` in src/render/monumentGeometry.ts. */
const KNOWN_KINDS = new Set([
  "church",
  "temple",
  "mosque",
  "market",
  "palace",
  "institution",
  "park",
  "beach",
  "viewpoint"
]);

describe("monuments", () => {
  it("puts every monument on a tile that exists", () => {
    for (const map of GAME_MAPS) {
      const tileKeys = new Set(map.tiles.map((tile) => axialKey(tile.coord)));
      for (const monument of map.monuments) {
        expect(
          tileKeys.has(axialKey({ q: monument.q, r: monument.r })),
          `${map.id}: "${monument.name}" is at ${monument.q},${monument.r}, which is not a tile`
        ).toBe(true);
      }
    }
  });

  it("never stacks two monuments on one tile", () => {
    for (const map of GAME_MAPS) {
      const keys = map.monuments.map((monument) => axialKey({ q: monument.q, r: monument.r }));
      expect(new Set(keys).size, `${map.id} has two monuments on the same hex`).toBe(keys.length);
    }
  });

  it("only asks for buildings the renderer can draw", () => {
    for (const map of GAME_MAPS) {
      for (const monument of map.monuments) {
        expect(
          KNOWN_KINDS.has(monument.kind),
          `${map.id}: "${monument.name}" wants kind "${monument.kind}", which has no geometry`
        ).toBe(true);
      }
    }
  });

  it("gives every monument a name and a stable id", () => {
    for (const map of GAME_MAPS) {
      const ids = map.monuments.map((monument) => monument.id);
      expect(new Set(ids).size, `${map.id} has duplicate monument ids`).toBe(ids.length);
      for (const monument of map.monuments) {
        expect(monument.name.length, `${map.id}: a monument has no name`).toBeGreaterThan(2);
        expect(monument.id.length, `${map.id}: "${monument.name}" has no id`).toBeGreaterThan(2);
      }
    }
  });

  it("stands the Panjim landmarks on dry land", () => {
    // A church in the sea would be both wrong and unbuildable-around. Beach
    // and the Dona Paula headland are allowed — Miramar Beach IS a beach, and
    // the viewpoint is on the shoreline.
    const panaji = mapById("panaji")!;
    const terrainByKey = new Map(panaji.tiles.map((tile) => [axialKey(tile.coord), tile.terrainId]));
    for (const monument of panaji.monuments) {
      const terrain = terrainByKey.get(axialKey({ q: monument.q, r: monument.r }));
      expect(["land", "beach"], `"${monument.name}" stands on ${terrain}`).toContain(terrain);
    }
  });

  it("leaves Panjim enough buildable room after the monuments take their tiles", () => {
    // Sixteen reserved tiles out of 743 is not a lot, but the check that
    // matters is that they did not all land on the same scarce terrain — the
    // level asks for six nature-based defences, and estuary and beach are the
    // terrains that host them.
    const level = LEVELS.find((candidate) => candidate.mapId === "panaji")!;
    const map = mapById("panaji")!;
    const counts = terrainCounts(map.tiles);
    const terrainByKey = new Map(map.tiles.map((tile) => [axialKey(tile.coord), tile.terrainId]));

    const reservedByTerrain = new Map<string, number>();
    for (const monument of map.monuments) {
      const terrain = terrainByKey.get(axialKey({ q: monument.q, r: monument.r }))!;
      reservedByTerrain.set(terrain, (reservedByTerrain.get(terrain) ?? 0) + 1);
    }

    for (const terrainId of ["beach", "estuary", "land", "river", "coast"]) {
      const free = (counts.get(terrainId) ?? 0) - (reservedByTerrain.get(terrainId) ?? 0);
      expect(free, `${level.id} has only ${free} free ${terrainId} tiles after monuments`).toBeGreaterThan(4);
    }
  });

  it("gives the widened beach real room to build on", () => {
    // The brief for this map was explicitly that the beach needed space:
    // Dune, Pandanus, Seawall and Beachside Resort all need sand, and the
    // map's own beach polygons give about a dozen tiles at this hex size.
    const panaji = mapById("panaji")!;
    const counts = terrainCounts(panaji.tiles);
    expect(counts.get("beach") ?? 0).toBeGreaterThanOrEqual(45);
  });
});
