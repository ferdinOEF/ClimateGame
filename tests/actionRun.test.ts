import { describe, expect, it } from "vitest";
import { ActionRun, SKIP_REFUSED, type TimelineConfig } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { defenceMetres, HAZARD_MODEL } from "../src/core/hazardModel";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { passYear } from "./helpers/passYear";

/**
 * Section 8: one build is one turn is one year, 2026 to 2050; a refused build
 * moves nothing; there is no other way to end a year except the "Skip this
 * year" fallback when nothing can be built anywhere. Coins and growth off on
 * Panaji (Section 5).
 */
const TIMELINE: TimelineConfig = { startYear: 2026, endYear: 2050 };

function board(coin = 1000): GameState {
  return new GameState(
    [
      { coord: { q: 0, r: 0 }, terrainId: "beach" },
      { coord: { q: 1, r: 0 }, terrainId: "beach" },
      { coord: { q: 2, r: 0 }, terrainId: "land" },
      { coord: { q: 3, r: 0 }, terrainId: "beach" },
      { coord: { q: 4, r: 0 }, terrainId: "beach" },
      { coord: { q: 5, r: 0 }, terrainId: "beach" }
    ],
    [],
    coin
  );
}

const BEACH = [0, 1, 3, 4, 5].map((q) => ({ q, r: 0 }));

describe("one build a year", () => {
  it("runs turn 1 = 2026 to turn 25 = 2050, each build advancing exactly one year", () => {
    const run = new ActionRun(board(), TIMELINE);
    expect(run.totalYears).toBe(25);
    expect(run.turnNumber).toBe(1);
    expect(run.year).toBe(2026);
    expect(run.label).toBe("2026");
    const outcome = run.build(BEACH[0], "dune");
    expect(outcome.ok).toBe(true);
    expect(run.turnNumber).toBe(2);
    expect(run.year).toBe(2027);
    expect(outcome.events.some((e) => e.type === "year" && e.turn === 2)).toBe(true);
    run.demolish(BEACH[0]);
    expect(run.turnNumber).toBe(3);
    run.build(BEACH[1], "dune");
    run.state.elements.get("1,0")!.degradeAmount = 0.3;
    run.repair(BEACH[1]);
    expect(run.turnNumber).toBe(5);
  });

  it("moves nothing on a refused build: the year, the board and the moment stay", () => {
    const run = new ActionRun(board(), TIMELINE);
    const moment = run.moment;
    const refused = run.build({ q: 2, r: 0 }, "breakwater");
    expect(refused.ok).toBe(false);
    expect(refused.events).toEqual([]);
    expect(run.turnNumber).toBe(1);
    expect(run.moment).toBe(moment);
    expect(run.state.elements.size).toBe(0);
    expect(run.demolish(BEACH[0]).ok).toBe(false);
    expect(run.repair(BEACH[0]).ok).toBe(false);
    expect(run.turnNumber).toBe(1);
  });

  it("allows Skip this year only when nothing can be built anywhere", () => {
    const run = new ActionRun(board(), TIMELINE);
    expect(run.canBuildAnywhere()).toBe(true);
    expect(run.skipYear()).toEqual({ ok: false, events: [], reason: SKIP_REFUSED });
    expect(run.turnNumber).toBe(1);
    const full = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "land" }], [], 0);
    full.excludedElements.add("house");
    for (const def of ELEMENT_BY_ID.values()) full.excludedElements.add(def.id);
    const stuck = new ActionRun(full, TIMELINE);
    expect(stuck.canBuildAnywhere()).toBe(false);
    expect(stuck.skipYear().ok).toBe(true);
    expect(stuck.turnNumber).toBe(2);
  });

  it("never demolishes the city's homes, so a home can't be taken out of a storm's path", () => {
    const state = board();
    state.excludedElements.add("house");
    state.elements.set("2,0", { elementId: "house", builtOnTurn: 0, degradeAmount: 0, floodBufferFilled: 0 });
    const run = new ActionRun(state, TIMELINE);
    expect(run.canDemolish({ q: 2, r: 0 })).toBe(false);
    expect(run.demolish({ q: 2, r: 0 }).ok).toBe(false);
    expect(run.state.elements.has("2,0")).toBe(true);
    expect(run.turnNumber).toBe(1);
  });

  it("is a per-level setting: Panaji runs on years, and so does the Tutorial (Section 15), on its own seven (Section 31)", () => {
    const panaji = LEVEL_BY_ID.get("l01-first-rains")!;
    expect(panaji.timeModel).toBe("years");
    expect(panaji.timeline).toEqual({ startYear: 2026, endYear: 2050 });
    const tutorial = LEVEL_BY_ID.get("l00-tutorial")!;
    expect(tutorial.timeModel).toBe("years");
    expect(tutorial.timeline).toEqual({ startYear: 2026, endYear: 2032 });
    expect(tutorial.economy?.enabled ?? false).toBe(false);
    expect(tutorial.growth?.enabled ?? false).toBe(false);
  });
});

describe("the storms on Panaji's board, one build a year", () => {
  it("hit straight after build 5, build 15 and build 25, in 2030, 2040 and 2050, and the next phase starts the year after", async () => {
    const { BOT_LEVEL, newRun } = await import("../tools/panjimBots/bots");
    const run = newRun("timing", BOT_LEVEL);
    // Builds far from every storm, so nothing here changes what they do.
    const away = [...run.state.placed.values()].map((t) => t.coord).filter((c) => run.state.buildableAt(c).length > 0).reverse();
    const hits: { build: number; year: number; storm: string }[] = [];
    for (let build = 1; build <= 25; build++) {
      const year = run.year;
      const coord = away.find((c) => run.state.buildableAt(c).length > 0)!;
      const outcome = run.build(coord, run.state.buildableAt(coord)[0].id);
      expect(outcome.ok).toBe(true);
      for (const e of outcome.events) if (e.type === "challenge") hits.push({ build, year, storm: e.challenge.id });
      if (build === 5) expect(run.year).toBe(2031);
      if (build === 15) expect(run.year).toBe(2041);
    }
    expect(hits).toEqual([
      { build: 5, year: 2030, storm: "c1-cyclone" },
      { build: 15, year: 2040, storm: "c2-flood" },
      { build: 25, year: 2050, storm: "c3-compound" }
    ]);
    expect(run.finished).toBe(true);
    expect(run.build(away[0], "dune").ok).toBe(false);
  });

  it("never leaves the player with nothing to build: hundreds of free places before the first build and after the last", async () => {
    const { BOT_LEVEL, newRun } = await import("../tools/panjimBots/bots");
    const run = newRun("room", BOT_LEVEL);
    const free = (): number => [...run.state.placed.values()].filter((t) => run.state.buildableAt(t.coord).length > 0).length;
    const before = free();
    expect(before).toBeGreaterThan(200);
    for (let build = 0; build < 25; build++) {
      expect(run.canBuildAnywhere()).toBe(true);
      const tile = [...run.state.placed.values()].find((t) => run.state.buildableAt(t.coord).length > 0)!;
      run.build(tile.coord, run.state.buildableAt(tile.coord)[0].id);
    }
    // 25 builds take at most 25 places, and storms only ever free more.
    expect(free()).toBeGreaterThanOrEqual(before - 25);
  });
});

describe("coins off (ECONOMY_DISABLED_V1)", () => {
  const panaji = LEVEL_BY_ID.get("l01-first-rains")!;

  it("is off on Panaji, with the starting Coin kept in the data for later", () => {
    expect(panaji.economy?.enabled).toBe(false);
    expect(panaji.startingCoin).toBe(10000);
  });

  it("never checks or spends Coin: building at 0 Coin works, and Coin never moves", () => {
    const run = new ActionRun(board(0), TIMELINE, { economy: panaji.economy });
    expect(run.economyEnabled).toBe(false);
    expect(run.build(BEACH[0], "seawall").ok).toBe(true);
    expect(run.build(BEACH[1], "dune").ok).toBe(true);
    run.build(BEACH[2], "sandy_vegetation");
    run.state.elements.get("0,0")!.degradeAmount = 0.5;
    run.repair(BEACH[0]);
    expect(run.state.coin).toBe(0);
    expect(run.collectJar()).toBe(0);
    expect(run.jar).toBe(0);
    expect(run.repairCoin(BEACH[0])).toBe(0);
  });

  it("keeps the coin code for a future version: with coins on, building spends and the jar fills", () => {
    const run = new ActionRun(board(1000), TIMELINE, { economy: { enabled: true, incomeScale: 0.5, jarStart: 40 } });
    run.build({ q: 2, r: 0 }, "house");
    expect(run.state.coin).toBe(1000 - ELEMENT_BY_ID.get("house")!.buildCost);
    expect(run.jar).toBeGreaterThan(40);
    expect(run.collectJar()).toBeGreaterThan(0);
  });
});

describe("growth off (GROWTH_DISABLED_V1)", () => {
  const panaji = LEVEL_BY_ID.get("l01-first-rains")!;

  it("is off on Panaji: a defence is at full strength the moment it is built", () => {
    expect(panaji.growth?.enabled).toBe(false);
    const run = new ActionRun(board(), TIMELINE, { economy: panaji.economy, growth: panaji.growth });
    for (const id of ["dune", "sandy_vegetation"]) {
      const coord = id === "dune" ? BEACH[0] : BEACH[1];
      run.build(coord, id);
      const inst = run.state.elements.get(`${coord.q},${coord.r}`)!;
      const def = ELEMENT_BY_ID.get(id)!;
      expect(run.state.maturityFraction(inst, def), id).toBe(1);
      expect(defenceMetres(run.state, `${coord.q},${coord.r}`, "cyclone")).toBeCloseTo((def.effects.resilience ?? 0) * HAZARD_MODEL.defence.metresPerResilience);
    }
  });

  it("keeps the growth code: with growth on, a young defence gives a share of its effect", () => {
    const run = new ActionRun(board(), TIMELINE, { growth: { enabled: true } });
    run.build(BEACH[0], "dune");
    const inst = run.state.elements.get("0,0")!;
    expect(run.state.maturityFraction(inst, ELEMENT_BY_ID.get("dune")!)).toBeLessThan(1);
  });
});

describe("a defence built in the storm's own year", () => {
  it("protects at full strength in that storm: the 5th build, in 2030, does what the 1st did in 2026", async () => {
    const { BOT_LEVEL, newRun } = await import("../tools/panjimBots/bots");
    const play = (duneOnBuild: number | null): number => {
      const run = newRun("full-strength", BOT_LEVEL);
      const cyclone = run.schedule[0];
      const reach = [...run.exposureFor(cyclone, true)!.exposure.keys()].map((key) => key.split(",").map(Number));
      const dune = reach.map(([q, r]) => ({ q, r })).find((c) => run.state.canBuild(c, "dune"))!;
      const away = [...run.state.placed.values()].map((t) => t.coord).filter((c) => !reach.some(([q, r]) => Math.abs(q - c.q) + Math.abs(r - c.r) < 12)).filter((c) => run.state.buildableAt(c).length > 0);
      for (let build = 1; !run.landed.has(cyclone.id); build++) {
        if (build === duneOnBuild) expect(run.build(dune, "dune").ok).toBe(true);
        else {
          const c = away.find((x) => run.state.buildableAt(x).length > 0)!;
          expect(run.build(c, run.state.buildableAt(c)[0].id).ok).toBe(true);
        }
      }
      return run.outcomes.get(cyclone.id)!.housesDamaged;
    };
    const none = play(null);
    const early = play(1);
    const late = play(5);
    expect(early).toBeLessThan(none);
    expect(late).toBe(early);
  });

  it("the helper used by other tests ends a year without a build", () => {
    const run = new ActionRun(board(), TIMELINE);
    passYear(run);
    expect(run.turnNumber).toBe(2);
    expect(run.state.elements.size).toBe(0);
  });
});
