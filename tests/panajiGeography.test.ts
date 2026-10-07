import { describe, expect, it } from "vitest";
import { GAME_MAPS, mapById } from "../src/levels/levelMap";
import { axialToWorld } from "../src/core/hex";

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
    // It is roughly twice as far from the centre as Miramar is, which is the
    // relationship the old board flattened into "both are a bit west".
    const toDona = Math.hypot(dona.x - church.x, dona.z - church.z);
    const toMiramar = Math.hypot(miramar.x - church.x, miramar.z - church.z);
    expect(toDona).toBeGreaterThan(toMiramar * 1.5);
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
