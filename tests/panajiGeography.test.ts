import { describe, expect, it } from "vitest";
import { GAME_MAPS, mapById } from "../src/levels/levelMap";
import { axialKey, axialToWorld, neighbors, worldToAxial, type AxialCoord } from "../src/core/hex";

/**
 * The Panaji board is real geography, read out of OpenStreetMap, and almost
 * everything that can go wrong with that goes wrong silently.
 *
 * A board with the landmarks in the wrong places still renders, still plays,
 * and still passes every other test in this suite. It just quietly puts
 * Fontainhas where Campal should be, which nobody outside Goa would notice and
 * nobody inside it would forgive — and that is exactly what the board this
 * replaced did, for months.
 *
 * `HEX_SIZE` is hardcoded rather than imported: `terrainMeshManager.ts` pulls
 * in Three.js, and this suite runs in Node with no browser. It is 1.0 there,
 * and `tests/hex.test.ts` holds the hex maths itself to account.
 */

const HEX_SIZE = 1.0;

describe("the Panaji map source", () => {
  const panaji = mapById("panaji")!;

  it("records where its geography came from", () => {
    expect(panaji.source, "Panaji lost its source block").toBeDefined();
    const source = panaji.source!;
    expect(source.bounds.north).toBeGreaterThan(source.bounds.south);
    expect(source.bounds.east).toBeGreaterThan(source.bounds.west);
    expect(source.metresPerUnit).toBeGreaterThan(0);
  });

  it("covers Panjim and not somewhere else", () => {
    // A transposed or sign-flipped bound would put the board in the Arabian
    // Sea or inland of the Ghats, and nothing downstream would complain.
    const { bounds } = panaji.source!;
    expect(bounds.south).toBeGreaterThan(15.4);
    expect(bounds.north).toBeLessThan(15.6);
    expect(bounds.west).toBeGreaterThan(73.7);
    expect(bounds.east).toBeLessThan(73.9);
  });

  it("credits OpenStreetMap", () => {
    /*
     * Not a style preference, and not made moot by the map imagery being
     * dropped from the build. The coastline, river, estuary, sand and sixteen
     * landmark positions are all derived from OpenStreetMap data, which makes
     * this board a derived database under the ODbL. `src/ui/attribution.ts`
     * puts this string on screen, and that is the condition of shipping it.
     */
    expect(panaji.source!.attribution).toMatch(/OpenStreetMap/i);
  });

  it("leaves the tutorial without a source", () => {
    // The tutorial is a diagram of a coastline that does not exist. Claiming a
    // real-world source for it would be inventing provenance.
    expect(mapById("tutorial")!.source).toBeUndefined();
  });

  it("never half-declares a source on any map", () => {
    // A source with bounds and no attribution is the kind of thing a
    // hand-edited JSON file produces, and it silently drops the credit.
    for (const map of GAME_MAPS) {
      if (!map.source) continue;
      expect(map.source.attribution, `${map.id} has a source with no attribution`).toBeTruthy();
      expect(map.source.bounds, `${map.id} has a source with no bounds`).toBeTruthy();
    }
  });
});

describe("the Panaji landmarks", () => {
  const panaji = mapById("panaji")!;
  const at = (id: string): { q: number; r: number } => {
    const monument = panaji.monuments.find((candidate) => candidate.id === id);
    if (!monument) throw new Error(`no monument "${id}"`);
    return { q: monument.q, r: monument.r };
  };
  /** World position, which is what "north of" and "west of" actually mean. +x is east, +z is south. */
  const world = (id: string): { x: number; z: number } => axialToWorld(at(id), HEX_SIZE);

  /*
   * These are relationships a person who lives in Panjim knows without
   * looking, and every one of them was WRONG on the board this replaced — the
   * old coordinates came out of an earlier build with no geography behind
   * them, and put Dhempe College nineteen columns inland of the church when it
   * is at Miramar, on the other side of the city and on the sea.
   *
   * Written as comparisons rather than as expected coordinates on purpose. The
   * exact hex a landmark lands on depends on the board rectangle and the hex
   * size, both of which are tuning; which side of the city it is on is not.
   */

  it("puts Dona Paula far to the south-west, past Miramar", () => {
    const dona = world("dona_paula_viewpoint");
    const miramar = world("miramar_beach");
    const church = world("panjim_church");

    expect(dona.z, "Dona Paula should be south of Miramar").toBeGreaterThan(miramar.z);
    expect(dona.x, "Dona Paula should be west of the old city").toBeLessThan(church.x);
    // It is about half as far again from the centre as Miramar is (5.2 km
    // against 3.3 km, a ratio of 1.55), which is the relationship the old
    // board flattened into "both are a bit west". 1.4 rather than 1.5 leaves
    // room for each end rounding to its nearest 234 m hex; the board that got
    // this wrong had the two at about the same distance.
    const toDona = Math.hypot(dona.x - church.x, dona.z - church.z);
    const toMiramar = Math.hypot(miramar.x - church.x, miramar.z - church.z);
    expect(toDona).toBeGreaterThan(toMiramar * 1.4);
  });

  it("puts Dhempe College at Miramar, not inland", () => {
    expect(world("dhempe_college").x).toBeLessThan(world("panjim_church").x);
    expect(world("dhempe_college").z).toBeGreaterThan(world("panjim_church").z);
  });

  it("keeps the old town core together", () => {
    // The church, the Adil Shah Palace, the Municipal Market and the Institute
    // Menezes Braganza are all within a few hundred metres of each other. At
    // this hex size that is a handful of tiles.
    const core = ["panjim_church", "idalcao_palace", "panjim_municipal_market", "institute_menezes_braganza"];
    const church = world("panjim_church");
    for (const id of core) {
      const here = world(id);
      expect(Math.hypot(here.x - church.x, here.z - church.z), `${id} is not in the old town core`).toBeLessThan(7);
    }
  });

  it("puts Campal on the river west of the centre and Patto east of it", () => {
    expect(world("kala_academy").x, "Kala Academy should be west of the church").toBeLessThan(world("panjim_church").x);
    expect(world("campal_garden").x, "Campal Garden should be west of the church").toBeLessThan(world("panjim_church").x);
    expect(world("goa_state_museum").x, "the Goa State Museum is at Patto, east of the church").toBeGreaterThan(
      world("panjim_church").x
    );
  });

  it("puts the Altinho institutions south of the waterfront", () => {
    // Altinho is the hill behind the old city. Anything on it is inland of the
    // palace, which stands on the Mandovi.
    expect(world("government_polytechnic_panaji").z).toBeGreaterThan(world("idalcao_palace").z);
    expect(world("mahalaxmi_temple").z).toBeGreaterThan(world("idalcao_palace").z);
  });
});

describe("the Panaji board, Miramar to Merces", () => {
  const panaji = mapById("panaji")!;
  const source = panaji.source!;
  const METRES_PER_DEG_LAT = 110_574;
  const METRES_PER_DEG_LON = 111_320 * Math.cos((15.48 * Math.PI) / 180);
  /** The generator's projection: the board's north-west corner is world (0,0), +x east, +z south. */
  const tileAt = (lat: number, lon: number): AxialCoord =>
    worldToAxial(
      ((lon - source.bounds.west) * METRES_PER_DEG_LON) / source.metresPerUnit,
      ((source.bounds.north - lat) * METRES_PER_DEG_LAT) / source.metresPerUnit,
      HEX_SIZE
    );
  const terrain = new Map(panaji.tiles.map((tile) => [axialKey(tile.coord), tile.terrainId]));
  const isWet = (coord: AxialCoord): boolean => {
    const id = terrain.get(axialKey(coord));
    return id === "river" || id === "estuary";
  };

  it("stays small enough for a phone", () => {
    expect(panaji.tiles.length).toBeLessThanOrEqual(1500);
    // And large enough to have reached Merces at all.
    expect(panaji.tiles.length).toBeGreaterThan(1000);
  });

  it("reaches Merces and St Cruz on the east and the Dona Paula headland on the south", () => {
    expect(source.bounds.east).toBeGreaterThanOrEqual(73.86);
    expect(source.bounds.south).toBeLessThanOrEqual(15.45);
    for (const name of ["Merces", "St Cruz", "Taleigao", "Caranzalem"]) {
      const label = panaji.landmarks.find((landmark) => landmark.name === name);
      expect(label, `no "${name}" label`).toBeDefined();
      expect(terrain.has(axialKey(label!)), `"${name}" is off the board`).toBe(true);
    }
  });

  it("has all five terrain types", () => {
    const present = new Set(panaji.tiles.map((tile) => tile.terrainId));
    for (const id of ["coast", "beach", "land", "river", "estuary"]) expect(present.has(id), `no ${id}`).toBe(true);
  });

  it("stands every monument on dry ground, and Miramar on the beach", () => {
    for (const monument of panaji.monuments) {
      const id = terrain.get(axialKey(monument));
      expect(["land", "beach"], `${monument.name} is on ${id}`).toContain(id);
    }
    const miramar = panaji.monuments.find((monument) => monument.id === "miramar_beach")!;
    expect(terrain.get(axialKey(miramar))).toBe("beach");
  });

  it("keeps the Mandovi and its creeks as one connected waterway", () => {
    /*
     * The creeks are the reason the board was extended, and the easy way to
     * lose them is for a narrow channel to come out as a string of land tiles
     * with a few wet ones between. So: flood-fill the river and estuary from
     * the middle of the Mandovi, and require the Ourem creek's southern reach,
     * the channel down to St Agostinho Road and the Ribandar salt pans to all
     * be in that one body of water.
     */
    const start = tileAt(15.505, 73.8375);
    const seed = [start, ...neighbors(start)].find(isWet);
    expect(seed, "the middle of the Mandovi is not river").toBeDefined();
    const reached = new Set<string>([axialKey(seed!)]);
    const queue = [seed!];
    while (queue.length > 0) {
      for (const next of neighbors(queue.pop()!)) {
        if (!isWet(next) || reached.has(axialKey(next))) continue;
        reached.add(axialKey(next));
        queue.push(next);
      }
    }
    const places = {
      "Ourem creek, south reach": [15.4836, 73.833],
      "creek at St Agostinho Road": [15.4736, 73.8357],
      "Ribandar salt pans": [15.5003, 73.8474]
    } as const;
    for (const [name, [lat, lon]] of Object.entries(places)) {
      const centre = tileAt(lat, lon);
      const near = [centre, ...neighbors(centre)].some((coord) => reached.has(axialKey(coord)));
      expect(near, `${name} is not connected to the Mandovi`).toBe(true);
    }
    const wet = panaji.tiles.filter((tile) => tile.terrainId === "river" || tile.terrainId === "estuary").length;
    // Nearly all of it: a few ponds inland are allowed to stand alone.
    expect(reached.size / wet).toBeGreaterThan(0.85);
  });
});
