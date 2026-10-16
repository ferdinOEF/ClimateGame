import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { computeWater, HAZARD_MODEL, waterBoard, windField } from "../src/core/hazardModel";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";

/**
 * Section 12: the cyclone's wind. A game rule (hazardModel.json `wind`), in
 * the same deterministic model as the water: in off the sea at the landfall,
 * weaker each hex inland, not blocked by high ground; rows of pandanus and
 * mangroves slow it downwind, with diminishing returns; nothing else does.
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

  it("is strongest at the shore and weakens with every hex inland", () => {
    const state = coast();
    const { board, storm: s } = storm(state);
    const wind = windField(state, board, s);
    const along = [2, 3, 4, 5, 7, 8].map((q) => wind.get(`${q},3`) ?? 0);
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeLessThan(along[i - 1]);
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

  it("drops behind a row of pandanus for a few tiles downwind, and nowhere else", () => {
    const bare = coast();
    const sheltered = coast();
    sheltered.build({ q: 3, r: 3 }, "sandy_vegetation", false);
    const a = windField(bare, storm(bare).board, storm(bare).storm);
    const b = windField(sheltered, storm(sheltered).board, storm(sheltered).storm);
    for (const q of [4, 5]) expect(b.get(`${q},3`)!).toBeLessThan(a.get(`${q},3`)!);
    // Upwind and far downwind: untouched.
    expect(b.get("2,3")).toBeCloseTo(a.get("2,3")!, 9);
    expect(b.get("9,3")).toBeCloseTo(a.get("9,3")!, 9);
  });

  it("drops behind mangroves too, but not behind dunes or seawalls", () => {
    const bare = coast();
    const a = windField(bare, storm(bare).board, storm(bare).storm);
    const mangrove = coast();
    mangrove.build({ q: 6, r: 3 }, "mangrove", false);
    expect(windField(mangrove, storm(mangrove).board, storm(mangrove).storm).get("7,3")!).toBeLessThan(a.get("7,3")!);
    for (const id of ["dune", "seawall"]) {
      const other = coast();
      expect(other.build({ q: 3, r: 3 }, id, false)).toBe(true);
      expect(windField(other, storm(other).board, storm(other).storm).get("4,3")).toBeCloseTo(a.get("4,3")!, 9);
    }
  });

  it("stacks rows with diminishing returns, and always lets some through", () => {
    const bare = coast();
    const one = coast();
    one.build({ q: 3, r: 3 }, "sandy_vegetation", false);
    const two = coast();
    two.build({ q: 3, r: 3 }, "sandy_vegetation", false);
    two.build({ q: 2, r: 3 }, "sandy_vegetation", false);
    const at = (s: GameState) => windField(s, storm(s).board, storm(s).storm).get("4,3")!;
    const first = at(bare) - at(one);
    const second = at(one) - at(two);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
    expect(at(two)).toBeGreaterThanOrEqual(at(bare) * HAZARD_MODEL.wind!.minKeep - 1e-9);
  });

  it("is in every computeWater result the resolver judges houses by", () => {
    const run = newRun("wind", BOT_LEVEL);
    const c = run.schedule[0];
    const water = computeWater(run.state, { kind: c.kind, strength: c.strength, landfall: run.landfallOf(c) });
    expect(water.wind.size).toBeGreaterThan(0);
  });
});
