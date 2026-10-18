import { describe, expect, it } from "vitest";
import edits from "../tools/mapgen/panaji-hand-edits.json";
import panaji from "../src/data/maps/panaji.json";

/**
 * Section 11 and Section 16: the owner's hand edits to the Panaji board are a
 * layer the generator applies after reading OpenStreetMap
 * (tools/mapgen/buildPanajiMap.ts), in order, so regenerating can never lose
 * them. Two rounds of 85: Section 11's, then Section 16's (which changes 15,7
 * and 9,22 again). Every edit must be in the shipped map: a tile's last edit.
 */
const tiles = new Map(panaji.tiles.map((t) => [`${t.q},${t.r}`, t]));
const keyOf = (entry: string): string => entry.split(",").slice(0, 2).join(",");
const ROUND_1 = edits.tiles.slice(0, 85);
const ROUND_2 = edits.tiles.slice(85);

describe("the Panaji hand edits", () => {
  it("holds the owner's two rounds of 85 tile edits, each tile once in each round", () => {
    expect(edits.tiles).toHaveLength(170);
    expect(new Set(ROUND_1.map(keyOf)).size).toBe(85);
    expect(new Set(ROUND_2.map(keyOf)).size).toBe(85);
    // The second round's first and last edits, as the owner gave them.
    expect(ROUND_2[0]).toBe("30,3,estuary>river");
    expect(ROUND_2[84]).toBe("13,31,estuary>land");
  });

  it("chains: a tile edited in both rounds starts round 2 from what round 1 left", () => {
    const after1 = new Map(ROUND_1.map((entry) => [keyOf(entry), entry.split(",")[2].split(">")[1]]));
    const again = ROUND_2.filter((entry) => after1.has(keyOf(entry)));
    expect(again.sort()).toEqual(["15,7,land>river", "9,22,river>estuary"]);
    for (const entry of again) expect(entry.split(",")[2].split(">")[0], entry).toBe(after1.get(keyOf(entry)));
  });

  it("every tile edit is in panaji.json (a tile's last edit)", () => {
    const last = new Map(edits.tiles.map((entry) => [keyOf(entry), entry.split(",")[2].split(">")[1]]));
    expect(last.size).toBe(168);
    for (const [key, to] of last) expect(tiles.get(key)?.terrainId, key).toBe(to);
  });

  it("every added and changed tile has a height from the DEM", () => {
    for (const entry of edits.tiles) {
      const [q, r] = entry.split(",");
      expect(typeof tiles.get(`${q},${r}`)?.elevationM, entry).toBe("number");
    }
  });

  it("every moved monument, landmark and area name is where the edit puts it (a monument's last move)", () => {
    const last = new Map(edits.monuments.map((move) => [move.id, move.to]));
    for (const [id, to] of last) {
      const monument = panaji.monuments.find((m) => m.id === id)!;
      expect([monument.q, monument.r], id).toEqual(to);
      const landmark = panaji.landmarks.find((l) => l.name === monument.name)!;
      expect([landmark.q, landmark.r], id).toEqual(to);
    }
    // Section 16 (owner decision): Miramar Beach one tile north; Sharada Mandir School and Dhempe College back
    // where OpenStreetMap put them; Campal and Santa Inez stay where Section 11 put them.
    const at = (id: string) => panaji.monuments.find((m) => m.id === id)!;
    expect([at("miramar_beach").q, at("miramar_beach").r]).toEqual([-4, 19]);
    expect([at("sharada_mandir_school").q, at("sharada_mandir_school").r]).toEqual([-3, 18]);
    expect([at("dhempe_college").q, at("dhempe_college").r]).toEqual([-2, 17]);
    const locality = (name: string) => panaji.localities.find((l) => l.name === name)!;
    expect([locality("Campal").q, locality("Campal").r]).toEqual([6, 10]);
    expect([locality("Santa Inez").q, locality("Santa Inez").r]).toEqual([4, 14]);
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
