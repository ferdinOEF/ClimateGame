import { describe, expect, it } from "vitest";
import edits from "../tools/mapgen/panaji-hand-edits.json";
import panaji from "../src/data/maps/panaji.json";

/**
 * Section 11: the owner's hand edits to the Panaji board are a layer the
 * generator applies after reading OpenStreetMap (tools/mapgen/buildPanajiMap.ts),
 * so regenerating can never lose them. Every edit must be in the shipped map.
 */
const tiles = new Map(panaji.tiles.map((t) => [`${t.q},${t.r}`, t]));

describe("the Panaji hand edits", () => {
  it("holds the owner's 85 tile edits, each tile once", () => {
    expect(edits.tiles).toHaveLength(85);
    expect(new Set(edits.tiles.map((e) => e.split(",").slice(0, 2).join(","))).size).toBe(85);
  });

  it("every tile edit is in panaji.json", () => {
    for (const entry of edits.tiles) {
      const [q, r, change] = entry.split(",");
      const to = change.split(">")[1];
      expect(tiles.get(`${q},${r}`)?.terrainId, entry).toBe(to);
    }
  });

  it("every added and changed tile has a height from the DEM", () => {
    for (const entry of edits.tiles) {
      const [q, r] = entry.split(",");
      expect(typeof tiles.get(`${q},${r}`)?.elevationM, entry).toBe("number");
    }
  });

  it("every moved monument, landmark and area name is where the edit puts it", () => {
    for (const move of edits.monuments) {
      const monument = panaji.monuments.find((m) => m.id === move.id)!;
      expect([monument.q, monument.r], move.id).toEqual(move.to);
      const landmark = panaji.landmarks.find((l) => l.name === monument.name)!;
      expect([landmark.q, landmark.r], move.id).toEqual(move.to);
    }
    for (const move of edits.localities) {
      const place = panaji.localities.find((l) => l.name === move.name)!;
      expect([place.q, place.r], move.name).toEqual(move.to);
      expect(tiles.get(move.to.join(","))?.terrainId, move.name).toBe("land");
    }
  });

  it("keeps the north bank as the stored unplayable tiles: 148, Ribandar not among them", () => {
    expect(panaji.unplayable).toEqual(edits.unplayable);
    expect(edits.unplayable).toHaveLength(148);
    expect(edits.unplayable.some(([q, r]) => q === 30 && r === 5)).toBe(false);
    for (const [q, r] of edits.unplayable) expect(["land", "beach", "estuary"]).toContain(tiles.get(`${q},${r}`)?.terrainId);
  });

  it("credits OpenStreetMap exactly as before, and says the board was adjusted by hand", () => {
    expect(panaji.source.attribution).toBe("© OpenStreetMap contributors");
    expect(panaji.overlay.attribution).toBe("© OpenStreetMap contributors");
    expect(panaji.blurb).toContain("drawn from OpenStreetMap and adjusted by hand");
  });
});
