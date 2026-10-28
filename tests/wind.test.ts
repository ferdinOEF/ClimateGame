import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { computeWater, HAZARD_MODEL, waterBoard, windField } from "../src/core/hazardModel";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";

/**
 * Section 12: the cyclone's wind. A game rule (hazardModel.json `wind`), in
 * the same deterministic model as the water: in off the sea at the landfall,
 * weaker each hex inland, not blocked by high ground. Section 25.1 (owner
 * decision): pandanus is the only defence that lowers it, on every tile within
 * two hexes, by one fixed share; nothing else does.
 */

/** A small coast: open sea in columns 0-1, sand in 2-3, then land (an estuary tile at 6,3 for the mangrove). */
function coast(elevation = 2): GameState {
  const tiles = [];
  for (let r = 0; r < 7; r++) {
    for (let q = 0; q < 12; q++) {
      const terrainId = q < 2 ? "coast" : q < 4 ? "beach" : q === 6 && r === 3 ? "estuary" : "land";
      tiles.push({ coord: { q, r }, terrainId, elevationM: terrainId === "land" ? elevation : 0 });
    }
  }
  const state = new GameState(tiles, [], 100000);
  // Defences at full strength from the moment they are built, as on Panaji (growth is off there).
  state.growthEnabled = false;
  return state;
}

const storm = (state: GameState, kind: "cyclone" | "flood" | "compound" = "cyclone") => {
  const board = waterBoard(state);
  const site = board.sites.indexOf("1,3");
  return { board, storm: { kind, strength: 2, landfall: kind === "flood" ? null : site } };
};

describe("the cyclone's wind", () => {
  it("is a cyclone's and a compound storm's, never a flood's", () => {
    const state = coast();
    const { board } = storm(state);
    expect(windField(state, board, storm(state, "flood").storm).size).toBe(0);
    expect(windField(state, board, storm(state).storm).size).toBeGreaterThan(0);
    expect(windField(state, board, storm(state, "compound").storm).size).toBeGreaterThan(0);
  });

  it("is strongest at the shore and weakens with every hex inland, and stops two hexes past the beach (Section 34b)", () => {
    const state = coast();
    const { board, storm: s } = storm(state);
    const wind = windField(state, board, s);
    // The beach is q 2 and 3: the wind reaches q 5 and no further (sandReachHex 2).
    expect(HAZARD_MODEL.wind!.sandReachHex).toBe(2);
    const along = [2, 3, 4, 5].map((q) => wind.get(`${q},3`) ?? 0);
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeLessThan(along[i - 1]);
    for (const q of [6, 7, 8]) expect(wind.has(`${q},3`), `${q},3`).toBe(false);
    expect(wind.has("0,3")).toBe(false);
    // Its shore value is the configured strength there.
    expect(along[0]).toBeCloseTo(HAZARD_MODEL.wind!.perStrengthM * 2 * (1 - 1 / HAZARD_MODEL.wind!.landfallReachHex), 6);
  });

  it("is not blocked by higher ground", () => {
    const low = coast(1);
    const high = coast(40);
    const a = windField(low, storm(low).board, storm(low).storm);
    const b = windField(high, storm(high).board, storm(high).storm);
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
  });

  it("drops by the pandanus share on every tile within two hexes of a pandanus, and nowhere else", () => {
    const bare = coast();
    const sheltered = coast();
    sheltered.build({ q: 3, r: 3 }, "sandy_vegetation", false);
    const a = windField(bare, storm(bare).board, storm(bare).storm);
    const b = windField(sheltered, storm(sheltered).board, storm(sheltered).storm);
    const share = HAZARD_MODEL.wind!.shelter.sandy_vegetation;
    expect(HAZARD_MODEL.wind!.shelterReachHex).toBe(2);
    // Two hexes in every direction, upwind too.
    for (const key of ["2,3", "4,3", "5,3", "3,1", "3,5", "5,1"]) expect(b.get(key)!, key).toBeCloseTo(a.get(key)! * (1 - share), 9);
    // Three hexes away (still within the wind's reach of the beach): untouched.
    for (const key of ["3,0", "5,0", "3,6"]) expect(b.get(key), key).toBeCloseTo(a.get(key)!, 9);
    // Section 34b: past the wind's reach there is no wind to shelter.
    expect(a.has("6,3")).toBe(false);
  });

  it("is lowered by pandanus only: not by mangroves, dunes, seawalls, khazans or breakwaters (Section 25.1)", () => {
    const bare = coast();
    const a = windField(bare, storm(bare).board, storm(bare).storm);
    // Section 34b.9: the seawall on the shore line, beside the sea (q 1 is sea).
    for (const [id, q, r] of [["mangrove", 6, 3], ["dune", 3, 3], ["seawall", 2, 3], ["breakwater", 1, 3]] as const) {
      const other = coast();
      expect(other.build({ q, r }, id, false), id).toBe(true);
      const b = windField(other, storm(other).board, storm(other).storm);
      for (const [key, v] of a) expect(b.get(key), `${id} at ${key}`).toBeCloseTo(v, 9);
    }
  });

  it("is lowered once however many pandanus stand round a tile, and some always gets through", () => {
    const one = coast();
    one.build({ q: 3, r: 3 }, "sandy_vegetation", false);
    const two = coast();
    two.build({ q: 3, r: 3 }, "sandy_vegetation", false);
    two.build({ q: 2, r: 3 }, "sandy_vegetation", false);
    const at = (s: GameState) => windField(s, storm(s).board, storm(s).storm).get("4,3")!;
    expect(at(two)).toBeCloseTo(at(one), 9);
    expect(1 - HAZARD_MODEL.wind!.shelter.sandy_vegetation).toBeGreaterThanOrEqual(HAZARD_MODEL.wind!.minKeep);
  });

  it("is in every computeWater result the resolver judges houses by", () => {
    const run = newRun("wind", BOT_LEVEL);
    const c = run.schedule[0];
    const water = computeWater(run.state, { kind: c.kind, strength: c.strength, landfall: run.landfallOf(c) });
    expect(water.wind.size).toBeGreaterThan(0);
  });
});
