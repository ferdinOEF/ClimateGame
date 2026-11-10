import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { axialDistance, axialKey } from "../src/core/hex";
import { newPanjimRun } from "../src/levels/panjimRun";
import { answersHazard, computeWater, defenceMetres, LANDFALL_ZONE, type WaterField } from "../src/core/hazardModel";
import { computeCombos } from "../src/core/combos";
import { shelterOf, type ScheduledChallenge } from "../src/core/climate";
import type { ActionRun } from "../src/core/actionRun";
import { tutorialRun } from "../tools/tutorial/sim";
import { previewLost } from "../tools/bestPlan/plan";
import { HAZARD_MODEL } from "../src/core/hazardModel";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { mapById } from "../src/levels/levelMap";
import { townLayout } from "../src/levels/townLayout";
import { PANJIM_LEVEL_ID, PANJIM_POINTS_MODEL } from "../src/levels/panjimRun";
import { replayBuilds, runPoints, standingDefences } from "../src/core/resiliencePoints";
import { playedRun } from "../tools/panjimBots/bots";
import { postBoard, type Ctx } from "../server/handlers";
import { memoryDb } from "./helpers/memoryDb";
import { sessionRun } from "./helpers/sessionRun";

/**
 * Section 41 (owner decisions after the playtest of 10 November 2026): shore defenses, Campal in 2050, and a perfect
 * build that saves every home. Game rules, each pinned here.
 */

const board = (cells: [number, number, string][]): GameState => new GameState(cells.map(([q, r, terrainId]) => ({ coord: { q, r }, terrainId })), [], 100000);
const keysWhere = (state: GameState, fits: (coord: { q: number; r: number }) => boolean): string[] => [...state.placed.values()].filter((t) => fits(t.coord)).map((t) => axialKey(t.coord));

describe("41.1: seawalls and breakwaters at the shore", () => {
  it("the first sea tile is a sea tile beside sand or land; a river tile never, a sea tile touching only wetland never", () => {
    const b = board([
      [0, 0, "coast"], [1, 0, "beach"], // sand beside it
      [0, 3, "coast"], [1, 3, "land"], // land beside it
      [0, 6, "coast"], [1, 6, "estuary"], // only wetland beside it
      [0, 9, "coast"], [1, 9, "river"], // only river beside it
      [0, 12, "river"], [1, 12, "land"], // a river tile beside land
      [0, 15, "coast"], [1, 15, "coast"] // open sea
    ]);
    expect(b.isFirstSea({ q: 0, r: 0 })).toBe(true);
    expect(b.isFirstSea({ q: 0, r: 3 })).toBe(true);
    expect(b.isFirstSea({ q: 0, r: 6 })).toBe(false);
    expect(b.isFirstSea({ q: 0, r: 9 })).toBe(false);
    expect(b.isFirstSea({ q: 0, r: 12 })).toBe(false);
    expect(b.isFirstSea({ q: 0, r: 15 })).toBe(false);
    // The shore tiles themselves are not sea.
    expect(b.isFirstSea({ q: 1, r: 0 })).toBe(false);
    for (const [q, r, first] of [[0, 0, true], [0, 3, true], [0, 6, false], [0, 9, false], [0, 12, false], [0, 15, false]] as const) {
      expect(b.canBuild({ q, r }, "breakwater"), `breakwater ${q},${r}`).toBe(first);
      expect(b.canBuild({ q, r }, "seawall"), `seawall ${q},${r}`).toBe(first);
    }
  });

  it("the data says so: a breakwater on the first sea tile only, a seawall on its shore tiles and the first sea tile", () => {
    expect(ELEMENT_BY_ID.get("breakwater")).toMatchObject({ validTerrainIds: ["coast"], placement: "firstSea" });
    expect(ELEMENT_BY_ID.get("seawall")).toMatchObject({ validTerrainIds: ["beach", "land", "estuary", "coast"], placement: "shoreline" });
  });

  it("a seawall keeps its shore tiles exactly as before: sand, land or wetland with a sea neighbour", () => {
    const b = board([[0, 0, "coast"], [1, 0, "beach"], [2, 0, "beach"], [1, -1, "land"], [0, 1, "estuary"], [3, 0, "land"]]);
    expect(b.canBuild({ q: 1, r: 0 }, "seawall")).toBe(true);
    expect(b.canBuild({ q: 1, r: -1 }, "seawall")).toBe(true);
    expect(b.canBuild({ q: 0, r: 1 }, "seawall")).toBe(true);
    expect(b.canBuild({ q: 2, r: 0 }, "seawall")).toBe(false);
    expect(b.canBuild({ q: 3, r: 0 }, "seawall")).toBe(false);
  });

  it("one defense per tile: a sand tile takes a seawall or a dune or a pandanus, a first sea tile a seawall or a breakwater", () => {
    const b = board([[0, 0, "coast"], [1, 0, "beach"]]);
    expect(b.buildableAt({ q: 1, r: 0 }).map((d) => d.id).filter((id) => ["seawall", "dune", "sandy_vegetation"].includes(id)).sort()).toEqual(["dune", "sandy_vegetation", "seawall"]);
    expect(b.build({ q: 1, r: 0 }, "dune")).toBe(true);
    expect(b.buildableAt({ q: 1, r: 0 })).toEqual([]);
    expect(b.build({ q: 0, r: 0 }, "seawall")).toBe(true);
    expect(b.canBuild({ q: 0, r: 0 }, "breakwater")).toBe(false);
  });

  describe("on Panjim", () => {
    const state = newPanjimRun({ objectives: false, points: false }).state;
    const firstSea = keysWhere(state, (c) => state.isFirstSea(c));

    it("has 83 first sea tiles, 17 of them within 6 tiles of Campal", () => {
      expect(firstSea).toHaveLength(83);
      expect(firstSea.filter((key) => axialDistance({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) }, { q: 6, r: 10 }) <= 6)).toHaveLength(17);
    });

    it("a breakwater fits those 83 tiles and no other; every one of them takes a seawall too", () => {
      expect(keysWhere(state, (c) => state.canBuild(c, "breakwater")).sort()).toEqual([...firstSea].sort());
      for (const key of firstSea) expect(state.canBuild({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) }, "seawall"), key).toBe(true);
    });

    it("a seawall fits its shore tiles as before and the first sea tiles, and nothing else at sea", () => {
      const seawall = keysWhere(state, (c) => state.canBuild(c, "seawall"));
      const atSea = seawall.filter((key) => state.placed.get(key)!.terrainId === "coast");
      expect(atSea.sort()).toEqual([...firstSea].sort());
      for (const key of seawall) {
        if (state.placed.get(key)!.terrainId === "coast") continue;
        expect(state.placementFits(state.placed.get(key)!.coord, "shoreline"), key).toBe(true);
        expect(["beach", "land", "estuary"]).toContain(state.placed.get(key)!.terrainId);
      }
    });

    it("the sea beyond the first tile takes no defense at all", () => {
      for (const tile of state.placed.values()) {
        if (tile.terrainId !== "coast" || state.isFirstSea(tile.coord)) continue;
        expect(state.buildableAt(tile.coord).map((d) => d.id), axialKey(tile.coord)).toEqual([]);
      }
    });
  });

  it("the Tutorial's map follows the same rule: its 11 first sea tiles take a breakwater or a seawall", () => {
    const state = tutorialRun().state;
    const firstSea = keysWhere(state, (c) => state.isFirstSea(c));
    expect(firstSea).toHaveLength(11);
    expect(keysWhere(state, (c) => state.canBuild(c, "breakwater")).sort()).toEqual([...firstSea].sort());
    for (const key of firstSea) expect(state.canBuild(state.placed.get(key)!.coord, "seawall"), key).toBe(true);
  });
});

/** The water of `challenge` on `state`, asked exactly as the run asks it when the storm lands. */
function waterOf(run: ActionRun, state: GameState, challenge: ScheduledChallenge): WaterField {
  return computeWater(
    state,
    { kind: challenge.kind, strength: challenge.strength, landfall: run.landfallOf(challenge), sheltered: shelterOf(challenge), wind: challenge.wind, turn: challenge.turn - 1 },
    { combos: computeCombos(state).bonus, landfallZoneTiles: run.zones!.keys(LANDFALL_ZONE) }
  );
}

/** The board a year before `challenge`, with a seawall just built at `coord` (young: not cracked when the storm comes). */
function withSeawall(run: ActionRun, challenge: ScheduledChallenge, coord: { q: number; r: number } | null): GameState {
  const state = run.state.clone();
  state.turn = challenge.turn - 2;
  if (coord) expect(state.build(coord, "seawall", false), "the seawall goes down").toBe(true);
  return state;
}

describe("41.2: in the 2050 storm a seawall holds back the river too", () => {
  const run = newPanjimRun({ objectives: false, points: false });
  const flood = run.schedule.find((c) => c.kind === "flood")!;
  const compound = run.schedule.find((c) => c.kind === "compound")!;
  // A first sea tile on the Mandovi side of Campal, and the water edge land beside it.
  const WALL = { q: 6, r: 8 };
  const BESIDE = "6,9";
  const seawall = ELEMENT_BY_ID.get("seawall")!;

  it("the rule is the seawall's alone, and only in the storm that brings both", () => {
    expect(seawall.holdsRiverInCompound).toBe(true);
    for (const def of ELEMENT_BY_ID.values()) if (def.id !== "seawall") expect(def.holdsRiverInCompound, def.id).toBeUndefined();
    expect(answersHazard(seawall, "cyclone", "cyclone")).toBe(true);
    expect(answersHazard(seawall, "cyclone", "compound")).toBe(true);
    expect(answersHazard(seawall, "flood", "compound")).toBe(true);
    expect(answersHazard(seawall, "flood", "flood")).toBe(false);
    expect(answersHazard(seawall, "flood")).toBe(false);
    // A breakwater answers the cyclone only, in every storm.
    expect(answersHazard(ELEMENT_BY_ID.get("breakwater")!, "flood", "compound")).toBe(false);
  });

  it("against the river it has the metres it has against the cyclone", () => {
    const state = withSeawall(run, compound, WALL);
    const key = axialKey(WALL);
    const againstSea = defenceMetres(state, key, "cyclone", undefined, "compound");
    expect(againstSea).toBeGreaterThan(0);
    expect(defenceMetres(state, key, "flood", undefined, "compound")).toBe(againstSea);
    expect(defenceMetres(state, key, "flood", undefined, "flood")).toBe(0);
    // A broken wall holds back neither.
    state.elements.get(key)!.broken = true;
    expect(defenceMetres(state, key, "flood", undefined, "compound")).toBe(0);
  });

  it("in the compound storm a seawall lowers the flood depth beside it", () => {
    const bare = waterOf(run, withSeawall(run, compound, null), compound);
    const walled = waterOf(run, withSeawall(run, compound, WALL), compound);
    expect(bare.flood.get(BESIDE) ?? 0).toBeGreaterThan(1);
    expect(walled.flood.get(BESIDE) ?? 0).toBeLessThan((bare.flood.get(BESIDE) ?? 0) - 1);
    // And that is this rule, not only the lower surge at the river mouth: with the rule off the river stands higher there.
    seawall.holdsRiverInCompound = false;
    try {
      const without = waterOf(run, withSeawall(run, compound, WALL), compound);
      expect(walled.flood.get(BESIDE) ?? 0).toBeLessThan((without.flood.get(BESIDE) ?? 0) - 1);
      // The surge is the same either way: the rule adds to the flood side only.
      expect([...walled.surge]).toEqual([...without.surge]);
    } finally {
      seawall.holdsRiverInCompound = true;
    }
  });

  it("a seawall cracked with age holds back neither water in the 2050 storm", () => {
    const old = run.state.clone();
    old.turn = compound.turn - 1 - seawall.cracksAtAge!;
    expect(old.build(WALL, "seawall", false)).toBe(true);
    const bare = waterOf(run, withSeawall(run, compound, null), compound);
    const cracked = waterOf(run, old, compound);
    expect(cracked.failed).toContain(axialKey(WALL));
    expect(cracked.flood.get(BESIDE)).toBe(bare.flood.get(BESIDE));
    expect(cracked.surge.get(BESIDE)).toBe(bare.surge.get(BESIDE));
  });

  it("in a flood on its own (2040) a seawall changes nothing, wherever it stands", () => {
    const bare = waterOf(run, withSeawall(run, flood, null), flood);
    const tiles = [...run.state.placed.values()].filter((t) => run.state.canBuild(t.coord, "seawall")).map((t) => t.coord);
    expect(tiles.length).toBeGreaterThan(83);
    for (const coord of tiles) {
      const walled = waterOf(run, withSeawall(run, flood, coord), flood);
      expect([...walled.flood], axialKey(coord)).toEqual([...bare.flood]);
      expect([...walled.depth], axialKey(coord)).toEqual([...bare.depth]);
    }
  });

  it("the preview follows: the homes at risk in 2050 (the heat, the build cards) fall by the same rule", () => {
    const bare = previewLost(run, withSeawall(run, compound, null), compound);
    const walled = previewLost(run, withSeawall(run, compound, WALL), compound);
    expect(walled.length).toBeLessThan(bare.length);
    seawall.holdsRiverInCompound = false;
    try {
      // With the rule off the same wall takes fewer homes out of the storm's risk.
      expect(previewLost(run, withSeawall(run, compound, WALL), compound).length).toBeGreaterThan(walled.length);
    } finally {
      seawall.holdsRiverInCompound = true;
    }
  });
});

describe("41.3: storm numbers, Campal's water edge, nature standing at the start", () => {
  const level = LEVEL_BY_ID.get(PANJIM_LEVEL_ID)!;
  const map = mapById("panaji")!;
  const OPEN = ["6,9", "8,7", "4,11", "3,12"];
  const STANDING: [string, string][] = [["26,6", "khazan"], ["16,15", "khazan"], ["7,21", "mangrove"]];
  const coordOf = (key: string): { q: number; r: number } => ({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) });

  it("the first cyclone is 1.15 and the 2050 storm's wind share 0.9; its landfall, its strength and the 2040 flood are as they were", () => {
    const [cyclone, flood, compound] = level.climate!.challenges;
    expect(cyclone).toMatchObject({ id: "c1-cyclone", strength: 1.15, landfall: "-5,18" });
    expect(flood).toMatchObject({ id: "c2-flood", strength: 2.35 });
    expect(compound).toMatchObject({ id: "c3-compound", strength: 3.0, landfall: "2,12" });
    expect(compound.wind).toEqual({ perStrengthM: 0.6, inlandKeep: 0.8, compoundShare: 0.9 });
    expect(cyclone.wind).toEqual({ perStrengthM: 1.0, inlandKeep: 0.8 });
  });

  it("the four tiles on Campal's water edge hold no home: ordinary land, a garden in the town plan, and as shore land they take a seawall", () => {
    const state = newPanjimRun({ objectives: false, points: false }).state;
    expect(level.houses!.openLand!.map(([q, r]) => `${q},${r}`).sort()).toEqual([...OPEN].sort());
    const town = townLayout(map, level.id, level.houses!.openLand);
    const before = townLayout(map, level.id);
    for (const key of OPEN) {
      expect(state.placed.get(key), key).toMatchObject({ terrainId: "land" });
      expect(state.isScenery(key), key).toBe(false);
      expect(state.elements.has(key), key).toBe(false);
      expect(state.reserved.has(key), key).toBe(false);
      expect(state.buildableAt(coordOf(key)).map((d) => d.id), key).toEqual(["seawall"]);
      expect(town.buildings.has(key), key).toBe(false);
      expect(town.gardens.has(key), key).toBe(true);
      // They were homes: the plan without the level's list still builds on them.
      expect(before.buildings.has(key), key).toBe(true);
    }
    // Nothing else in the plan moved: the same plots everywhere else (the map, its terrain and its zones are untouched).
    expect([...town.buildings.keys()].sort()).toEqual([...before.buildings.keys()].filter((key) => !OPEN.includes(key)).sort());
    expect([...town.gardens].sort()).toEqual([...before.gardens, ...OPEN].sort());
    const homes = [...state.elements].filter(([key, inst]) => inst.elementId === "house" && !state.isScenery(key)).length;
    expect(homes).toBe(332);
  });

  it("no home takes more wind than pandanus can shelter, in the 2030 cyclone or the 2050 storm", () => {
    const run = newPanjimRun({ objectives: false, points: false });
    const keep = Math.max(HAZARD_MODEL.wind!.minKeep, 1 - HAZARD_MODEL.wind!.shelter.sandy_vegetation);
    for (const c of run.schedule) {
      if (c.kind === "flood") continue;
      const field = waterOf(run, run.state, c);
      for (const [key, inst] of run.state.elements) {
        if (inst.elementId !== "house" || run.state.isScenery(key)) continue;
        expect((field.wind.get(key) ?? 0) * keep, `${c.id} ${key}`).toBeLessThan(HAZARD_MODEL.houseLossDepthM);
      }
    }
  });

  it("two khazans at Merces and a mangrove at Taleigao stand from the first turn, mature and at full strength", () => {
    expect(level.standingDefences!.map((d) => [`${d.q},${d.r}`, d.elementId])).toEqual(STANDING);
    const run = newPanjimRun({ objectives: false, points: false });
    expect(run.turnNumber).toBe(1);
    for (const [key, elementId] of STANDING) {
      const inst = run.state.elements.get(key)!;
      expect(inst, key).toMatchObject({ elementId, fromStart: true, degradeAmount: 0 });
      expect(run.state.isScenery(key), key).toBe(false);
      const def = ELEMENT_BY_ID.get(elementId)!;
      expect(run.state.maturityFraction(inst, def), key).toBe(1);
      expect(defenceMetres(run.state, key, "flood"), key).toBe(def.effects.resilience! * HAZARD_MODEL.defence.metresPerResilience);
      // Mature even where a level grows its defences (a khazan takes two years to grow).
      const grown = run.state.clone();
      grown.growthEnabled = true;
      expect(grown.maturityFraction(grown.elements.get(key)!, def), key).toBe(1);
    }
    // Nothing else stands that the player did not build, and nothing is in the build log; all 25 builds are still to make.
    expect([...run.state.elements.values()].filter((inst) => inst.fromStart)).toHaveLength(3);
    expect([...run.state.elements.values()].filter((inst) => inst.elementId !== "house" && !inst.fromStart)).toHaveLength(0);
    expect(run.buildLog).toEqual([]);
    expect(run.totalYears).toBe(25);
    expect(run.buildsUntil(run.schedule[2])).toBe(25);
  });

  it("they protect exactly as built ones do: the same homes at risk as on a board where the player built the same three", () => {
    const standing = newPanjimRun({ objectives: false, points: false });
    const built = newPanjimRun({ level: { ...level, standingDefences: [] }, objectives: false, points: false });
    for (const [key, elementId] of STANDING) expect(built.state.build(coordOf(key), elementId, false), key).toBe(true);
    const bare = newPanjimRun({ level: { ...level, standingDefences: [] }, objectives: false, points: false });
    for (const [i, c] of standing.schedule.entries()) {
      const withStanding = [...previewLost(standing, standing.state, c)].sort();
      expect(withStanding, c.id).toEqual([...previewLost(built, built.state, built.schedule[i])].sort());
      // And they do protect: without them the flood and the 2050 storm take more homes.
      if (c.kind !== "cyclone") expect(previewLost(bare, bare.state, bare.schedule[i]).length, c.id).toBeGreaterThan(withStanding.length);
    }
  });

  it("they are in the starting biodiversity: the change the stars and the points read is 0 until the player builds", () => {
    const run = newPanjimRun({ objectives: false });
    expect(run.state.biodiversity).toBe(2 + 2 + 3);
    expect(run.houseStars!.bioStart).toBe(7);
    expect(run.build({ q: 24, r: 6 }, "mangrove").ok).toBe(true);
    expect(run.state.biodiversity - run.houseStars!.bioStart!).toBe(ELEMENT_BY_ID.get("mangrove")!.effects.biodiversity);
  });

  it("they earn no living coast points and are no veterans, though they stand and protect; the player's own count as ever", () => {
    const run = newPanjimRun({ objectives: false });
    expect(standingDefences(run.state)).toEqual([]);
    // One build of the player's own (a mangrove beside the standing khazan), then builds that are no living coast, to 2040.
    expect(run.build({ q: 24, r: 6 }, "mangrove").ok).toBe(true);
    const flood = run.schedule[1];
    while (!run.landed.has(flood.id)) {
      const tile = [...run.state.placed.values()].find((t) => run.state.canBuild(t.coord, "breakwater"))!;
      expect(run.build(tile.coord, "breakwater").ok).toBe(true);
    }
    const points = run.stormPoints.get(flood.id)!;
    expect(points.livingCoast.standing).toBe(1);
    expect(points.standing.filter((id) => id.includes("khazan") || id.startsWith("7,21|"))).toEqual([]);
    expect(points.standing).toContain("24,6|mangrove|0");
    // The standing khazans did protect in that flood: taken away, the same storm on the same board takes more homes.
    expect(run.stormRecords.get(flood.id)!.withoutEach.get("khazan") ?? 0).toBeGreaterThan(0);
  });

  it("the player may remove one at the usual cost of a year, and a build on its tile afterwards is the player's own", () => {
    const run = newPanjimRun({ objectives: false });
    expect(run.canDemolish({ q: 26, r: 6 })).toBe(true);
    expect(run.demolish({ q: 26, r: 6 }).ok).toBe(true);
    expect(run.year).toBe(2027);
    expect(run.buildLog).toEqual([{ year: 2026, tile: "26,6", element: "demolish" }]);
    expect(run.state.elements.has("26,6")).toBe(false);
    expect(run.state.biodiversity - run.houseStars!.bioStart!).toBe(-2);
    expect(run.state.buildableAt({ q: 26, r: 6 }).map((d) => d.id)).toEqual(["mangrove", "khazan"]);
    expect(run.build({ q: 26, r: 6 }, "khazan").ok).toBe(true);
    expect(run.state.elements.get("26,6")!.fromStart).toBeUndefined();
    expect(standingDefences(run.state)).toEqual(["26,6|khazan|1"]);
    // A home is still not the player's to remove.
    const home = [...run.state.elements].find(([, inst]) => inst.elementId === "house")![0];
    expect(run.canDemolish(coordOf(home))).toBe(false);
  });

  it("an objective's row never counts one of them", () => {
    const run = sessionRun(level);
    let rows = 0;
    while (!run.finished) {
      for (const row of run.prep) {
        rows++;
        for (const key of row.credited ?? []) expect(run.state.elements.get(key)?.fromStart, `${row.label} ${key}`).toBeFalsy();
      }
      const tile = [...run.state.placed.values()].find((t) => run.state.canBuild(t.coord, "breakwater"))!;
      expect(run.build(tile.coord, "breakwater").ok).toBe(true);
    }
    expect(rows).toBeGreaterThan(0);
  });

  it("a retry brings them back as they were", () => {
    const run = newPanjimRun({ objectives: false });
    expect(run.demolish({ q: 7, r: 21 }).ok).toBe(true);
    expect(run.retry("c1-cyclone")).toBe(true);
    expect(run.state.elements.get("7,21")).toMatchObject({ elementId: "mangrove", fromStart: true });
    expect(run.buildLog).toEqual([]);
  });

  describe("the server's replay starts from the same board", () => {
    const byKey = <T,>(entries: [string, T][]): [string, T][] => [...entries].sort(([a], [b]) => (a < b ? -1 : 1));

    it("the session's board and the server model's are the same, element for element", () => {
      const client = sessionRun(level);
      const server = PANJIM_POINTS_MODEL.newRun();
      expect(byKey([...server.state.elements])).toEqual(byKey([...client.state.elements]));
      for (const [key] of STANDING) expect(server.state.elements.get(key)?.fromStart, key).toBe(true);
      for (const key of OPEN) expect(server.state.elements.has(key), key).toBe(false);
      expect([...server.state.unbuildable].sort()).toEqual([...client.state.unbuildable].sort());
      expect([...server.state.reserved].sort()).toEqual([...client.state.reserved].sort());
      expect(server.schedule.map((c) => [c.id, c.strength, c.landfall])).toEqual(client.schedule.map((c) => [c.id, c.strength, c.landfall]));
    });

    it("client and server points agree for a run that removes a standing khazan, builds on the first sea tile and on Campal's water edge", async () => {
      const live = newPanjimRun();
      expect(live.demolish({ q: 26, r: 6 }).ok).toBe(true);
      expect(live.build({ q: 26, r: 6 }, "khazan").ok).toBe(true);
      expect(live.build({ q: 3, r: 12 }, "seawall").ok).toBe(true);
      expect(live.build({ q: 6, r: 8 }, "breakwater").ok).toBe(true);
      const guided = playedRun("guided", "section41").buildLog;
      for (const entry of guided.slice(live.buildLog.length)) {
        const coord = coordOf(entry.tile);
        // The guided player's own list from here; where an action no longer applies, a mangrove on any free tile.
        const outcome = entry.element === "repair" ? live.repair(coord) : entry.element === "demolish" ? live.demolish(coord) : live.build(coord, entry.element);
        if (outcome.ok) continue;
        const free = [...live.state.placed.values()].find((t) => live.state.canBuild(t.coord, "mangrove"))!;
        expect(live.build(free.coord, "mangrove").ok).toBe(true);
      }
      expect(live.finished).toBe(true);
      const client = runPoints(live);
      expect(client.total).toBeGreaterThan(0);
      const replay = replayBuilds(live.buildLog, PANJIM_POINTS_MODEL);
      expect(replay.error).toBeNull();
      expect(replay.points).toEqual(client);
      // And through the real handler, on an in memory database: the points it stores are the client's.
      const db = memoryDb();
      await db.apply();
      const ctx: Ctx = { sql: db, env:{ BOARD_SEASON: "Section 41", RATE_SALT: "salt" }, ip: "10.41.0.1", now: new Date("2026-11-10T10:00:00Z"), model: PANJIM_POINTS_MODEL };
      const reply = await postBoard(ctx, { runId: "41414141-4141-4141-8141-414141414141", name: "Shore", builds: live.buildLog });
      expect(reply.status).toBe(200);
      expect(reply.body.points).toBe(client.total);
    }, 240_000);
  });
});
