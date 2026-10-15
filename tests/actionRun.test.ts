import { describe, expect, it } from "vitest";
import { ActionRun, NO_BUILDS_LEFT, type TimelineConfig } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { defenceMetres, HAZARD_MODEL } from "../src/core/hazardModel";
import { LEVEL_BY_ID } from "../src/levels/levels";

/**
 * Section 5: the yearly clock. One turn a year from 2026 to 2050, a cap on
 * builds per year, Next year at any point; coins and growth off on Panaji.
 */
const TIMELINE: TimelineConfig = { startYear: 2026, endYear: 2050, buildsPerYear: 4 };

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

describe("the yearly clock", () => {
  it("runs turn 1 = 2026 to turn 25 = 2050, one Next year a turn", () => {
    const run = new ActionRun(board(), TIMELINE);
    expect(run.totalYears).toBe(25);
    expect(run.turnNumber).toBe(1);
    expect(run.year).toBe(2026);
    expect(run.label).toBe("2026");
    for (let turn = 1; turn < 25; turn++) run.nextYear();
    expect(run.turnNumber).toBe(25);
    expect(run.year).toBe(2050);
    expect(run.finished).toBe(false);
    run.nextYear();
    expect(run.finished).toBe(true);
    expect(run.label).toBe("2050");
    expect(run.nextYear().ok).toBe(false);
  });

  it("caps builds per year at the level's buildsPerYear, and says why", () => {
    const run = new ActionRun(board(), TIMELINE);
    for (let i = 0; i < 4; i++) expect(run.build(BEACH[i], "dune").ok).toBe(true);
    expect(run.buildsLeft).toBe(0);
    const refused = run.build(BEACH[4], "dune");
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe(NO_BUILDS_LEFT);
    expect(run.state.elements.has("5,0")).toBe(false);
    run.nextYear();
    expect(run.buildsLeft).toBe(4);
    expect(run.build(BEACH[4], "dune").ok).toBe(true);
  });

  it("ends a year early: Next year works after 0, 1 and every build", () => {
    for (const builds of [0, 1, 4]) {
      const run = new ActionRun(board(), TIMELINE);
      for (let i = 0; i < builds; i++) run.build(BEACH[i], "dune");
      expect(run.buildsLeft).toBe(4 - builds);
      const outcome = run.nextYear();
      expect(outcome.ok).toBe(true);
      expect(run.turnNumber).toBe(2);
      expect(run.buildsLeft).toBe(4);
      expect(outcome.events.some((e) => e.type === "year")).toBe(true);
    }
  });

  it("demolishing and repairing each use one of the year's builds", () => {
    const run = new ActionRun(board(), TIMELINE);
    expect(run.demolish({ q: 2, r: 0 }).ok).toBe(false);
    run.build(BEACH[0], "dune");
    expect(run.demolish(BEACH[0]).ok).toBe(true);
    expect(run.buildsLeft).toBe(2);
    run.build(BEACH[1], "dune");
    run.state.elements.get("1,0")!.degradeAmount = 0.3;
    expect(run.repair(BEACH[1]).ok).toBe(true);
    expect(run.buildsLeft).toBe(0);
    expect(run.demolish(BEACH[1]).reason).toBe(NO_BUILDS_LEFT);
  });

  it("never demolishes the city's homes, so a home can't be taken out of a storm's path", () => {
    const state = board();
    state.excludedElements.add("house");
    state.elements.set("2,0", { elementId: "house", builtOnTurn: 0, degradeAmount: 0, floodBufferFilled: 0 });
    const run = new ActionRun(state, TIMELINE);
    expect(run.canDemolish({ q: 2, r: 0 })).toBe(false);
    expect(run.demolish({ q: 2, r: 0 }).ok).toBe(false);
    expect(run.state.elements.has("2,0")).toBe(true);
    expect(run.buildsLeft).toBe(4);
  });

  it("is a per-level setting: Panaji runs on years, the tutorial keeps turns", () => {
    const panaji = LEVEL_BY_ID.get("l01-first-rains")!;
    expect(panaji.timeModel).toBe("years");
    expect(panaji.timeline).toEqual({ startYear: 2026, endYear: 2050, buildsPerYear: 4 });
    const tutorial = LEVEL_BY_ID.get("l00-tutorial")!;
    expect(tutorial.timeModel ?? "turns").toBe("turns");
    expect(tutorial.timeline).toBeUndefined();
    expect(tutorial.economy).toBeUndefined();
    expect(tutorial.growth).toBeUndefined();
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
    run.nextYear();
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
    run.nextYear();
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

describe("a defence built in the storm's own year (Section 5)", () => {
  it("protects at full strength in that storm: the same as if built in 2026", async () => {
    const { BOT_LEVEL, newRun } = await import("../tools/panjimBots/bots");
    const plant = (run: ActionRun): number => {
      // Four dunes on the beach the cyclone reaches.
      const next = run.nextChallenge()!;
      const reach = run.exposureFor(next, true)!;
      let built = 0;
      for (const key of reach.exposure.keys()) {
        const [q, r] = key.split(",").map(Number);
        if (built < 4 && run.state.canBuild({ q, r }, "dune") && run.build({ q, r }, "dune").ok) built++;
      }
      return built;
    };
    const play = (buildOnTurn: number | null): number => {
      const run = newRun("full-strength", BOT_LEVEL);
      const cyclone = run.schedule[0];
      while (!run.landed.has(cyclone.id)) {
        if (run.turnNumber === buildOnTurn) expect(plant(run)).toBe(4);
        run.nextYear();
      }
      return run.outcomes.get(cyclone.id)!.housesDamaged;
    };
    const none = play(null);
    const early = play(1);
    const late = play(5);
    expect(early).toBeLessThan(none);
    expect(late).toBe(early);
  });
});
