import { describe, expect, it } from "vitest";
import edits from "../tools/mapgen/panaji-hand-edits.json";
import panaji from "../src/data/maps/panaji.json";

/**
 * Section 11, 16 and 19: the owner's hand edits to the Panaji board are a
 * layer the generator applies after reading OpenStreetMap
 * (tools/mapgen/buildPanajiMap.ts), in order, so regenerating can never lose
 * them. Two rounds of 85, Section 11's then Section 16's (which changes 15,7
 * and 9,22 again), then Section 19's 34 (13 of them on tiles an earlier round
 * changed), then Section 22's 7 (3 of them on tiles an earlier round changed).
 * Every edit must be in the shipped map: a tile's last edit.
 */
const tiles = new Map(panaji.tiles.map((t) => [`${t.q},${t.r}`, t]));
const keyOf = (entry: string): string => entry.split(",").slice(0, 2).join(",");
const ROUND_1 = edits.tiles.slice(0, 85);
const ROUND_2 = edits.tiles.slice(85, 170);
const ROUND_3 = edits.tiles.slice(170, 204);
const ROUND_4 = edits.tiles.slice(204);

describe("the Panaji hand edits", () => {
  it("holds the owner's rounds of tile edits (85, 85, 34 and 7), each tile once in each round", () => {
    expect(edits.tiles).toHaveLength(211);
    // Section 22.1: the owner's fourth round, exactly these seven.
    expect(ROUND_4).toEqual(["16,4,land>river", "25,6,land>estuary", "26,6,land>estuary", "14,7,land>estuary", "16,7,land>estuary", "15,8,land>estuary", "21,8,estuary>river"]);
    expect(ROUND_3).toHaveLength(34);
    expect(new Set(ROUND_3.map(keyOf)).size).toBe(34);
    // Section 19's round as the owner's map editor gave it (docs/reference/panaji_owner_edits.json).
    expect(ROUND_3[0]).toBe("22,1,estuary>river");
    expect(ROUND_3[33]).toBe("9,26,river>estuary");
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
    // Round 3 starts from what the first two left.
    const after2 = new Map([...ROUND_1, ...ROUND_2].map((entry) => [keyOf(entry), entry.split(",")[2].split(">")[1]]));
    const again3 = ROUND_3.filter((entry) => after2.has(keyOf(entry)));
    expect(again3).toHaveLength(13);
    for (const entry of again3) expect(entry.split(",")[2].split(">")[0], entry).toBe(after2.get(keyOf(entry)));
    // Round 4 starts from what the first three left.
    const after3 = new Map([...ROUND_1, ...ROUND_2, ...ROUND_3].map((entry) => [keyOf(entry), entry.split(",")[2].split(">")[1]]));
    const again4 = ROUND_4.filter((entry) => after3.has(keyOf(entry)));
    expect(again4.sort()).toEqual(["14,7,land>estuary", "16,7,land>estuary", "25,6,land>estuary"]);
    for (const entry of again4) expect(entry.split(",")[2].split(">")[0], entry).toBe(after3.get(keyOf(entry)));
  });

  it("every tile edit is in panaji.json (a tile's last edit)", () => {
    const last = new Map(edits.tiles.map((entry) => [keyOf(entry), entry.split(",")[2].split(">")[1]]));
    expect(last.size).toBe(193);
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

  // Section 19.2 (owner decision): the east edge, Ribandar with it, is out of Panjim too. The north bank lost 14
  // tiles to the owner's new river and gained 23,1 (now estuary): 135, 4 of them on row 0 east of the line; the east
  // edge adds 121 more on rows 5 to 36: 256. Merces and St Cruz stay in the game; river and sea stay water.
  // Section 22.1: 16,4 is river now (the owner's fourth round), and water stays playable: 255.
  // Section 30.1 (owner decision): the creek corner east of Merces (33 tiles) leaves the game: 20 of them were
  // playable (17 land, wetland and creek tiles, and 3 river tiles), so 275; all 33 are dry for the storms.
  it("keeps the north bank, the east edge and the dropped corner as the stored unplayable tiles: 275, Ribandar among them", () => {
    const dropped = new Set((edits.dropped ?? []).map(([q, r]: number[]) => `${q},${r}`));
    expect(dropped.size).toBe(33);
    expect(panaji.unplayable).toEqual(edits.unplayable);
    expect(edits.unplayable).toHaveLength(275);
    for (const key of dropped) expect(edits.unplayable.some(([q, r]: number[]) => `${q},${r}` === key), key).toBe(true);
    expect((panaji.dry ?? []).map(([q, r]: number[]) => `${q},${r}`).sort()).toEqual([...dropped].sort());
    const kept = edits.unplayable.filter(([q, r]: number[]) => !dropped.has(`${q},${r}`));
    // 13 of the 33 were already scenery (the corner's wetland east of the line): 255 - 13 = 242 outside the corner.
    expect(kept).toHaveLength(242);
    expect(edits.unplayable.some(([q, r]) => q === 16 && r === 4)).toBe(false);
    const east = kept.filter(([q, r]: number[]) => q + r / 2 >= 30.2);
    // Section 30.1: 13 of the east edge's 125 are in the dropped corner now: 112 outside it, 108 of them from row 4.
    expect(east).toHaveLength(112);
    expect(east.filter(([, r]: number[]) => r >= 4)).toHaveLength(108);
    expect(edits.unplayable.some(([q, r]) => q === 30 && r === 5)).toBe(true);
    expect(edits.unplayable.some(([q, r]) => (q === 19 && r === 16) || (q === 13 && r === 22))).toBe(false);
    for (const t of panaji.tiles) if (t.q + t.r / 2 >= 30.2 && ["land", "beach", "estuary"].includes(t.terrainId)) expect(edits.unplayable.some(([q, r]) => q === t.q && r === t.r), `${t.q},${t.r}`).toBe(true);
    for (const [q, r] of [[30, 4], [31, 4], [32, 4]]) expect(tiles.get(`${q},${r}`)?.terrainId).toBe("river");
    for (const [q, r] of kept) expect(["land", "beach", "estuary"]).toContain(tiles.get(`${q},${r}`)?.terrainId);
  });

  it("credits OpenStreetMap exactly as before, and says the board was adjusted by hand", () => {
    expect(panaji.source.attribution).toBe("© OpenStreetMap contributors");
    expect(panaji.overlay.attribution).toBe("© OpenStreetMap contributors");
    expect(panaji.blurb).toContain("drawn from OpenStreetMap and adjusted by hand");
  });
});
