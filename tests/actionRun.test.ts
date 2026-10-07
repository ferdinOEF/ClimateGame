import { describe, expect, it } from "vitest";
import { ActionRun, quarterLabel } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { LEVEL_BY_ID } from "../src/levels/levels";

const TIMELINE = { startYear: 2025, endYear: 2050, costs: { build: 1, repair: 1, demolish: 1, fastForwardYear: 4 } };

function board(): GameState {
  const state = new GameState(
    [
      { coord: { q: 0, r: 0 }, terrainId: "beach" },
      { coord: { q: 1, r: 0 }, terrainId: "beach" },
      { coord: { q: 2, r: 0 }, terrainId: "land" }
    ],
    [],
    1000
  );
  return state;
}

describe("action clock", () => {
  it("labels quarters from Q1 2025 to Q4 2049", () => {
    expect(quarterLabel(0, 2025)).toBe("Q1 2025");
    expect(quarterLabel(5, 2025)).toBe("Q2 2026");
    expect(quarterLabel(99, 2025)).toBe("Q4 2049");
  });

  it("charges one quarter per build and two for heavy engineering", () => {
    const run = new ActionRun(board(), TIMELINE);
    expect(run.build({ q: 0, r: 0 }, "dune").quarters).toBe(1);
    expect(run.quarter).toBe(1);
    expect(run.build({ q: 1, r: 0 }, "seawall").quarters).toBe(2);
    expect(run.quarter).toBe(3);
    expect(run.label).toBe("Q4 2025");
  });

  it("charges demolition one quarter and refuses an empty tile for free", () => {
    const run = new ActionRun(board(), TIMELINE);
    expect(run.demolish({ q: 2, r: 0 }).ok).toBe(false);
    expect(run.quarter).toBe(0);
    run.build({ q: 2, r: 0 }, "house");
    expect(run.demolish({ q: 2, r: 0 })).toMatchObject({ ok: true, quarters: 1 });
  });

  it("fast-forwards a year as four quarter ticks and stops at 2050", () => {
    const run = new ActionRun(board(), TIMELINE);
    const outcome = run.fastForwardYear();
    expect(outcome.events.map((e) => e.type)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
    for (let i = 0; i < 30; i++) run.fastForwardYear();
    expect(run.finished).toBe(true);
    expect(run.quarter).toBe(100);
    expect(run.label).toBe("2050");
    expect(run.fastForwardYear().ok).toBe(false);
  });

  it("is a per-level setting: Panaji runs on actions, the tutorial keeps turns", () => {
    expect(LEVEL_BY_ID.get("l01-first-rains")?.timeModel).toBe("actions");
    expect(LEVEL_BY_ID.get("l00-tutorial")?.timeModel ?? "turns").toBe("turns");
  });
});

describe("maturation in quarters", () => {
  it("uses the brief's placeholder growth times", async () => {
    const { ELEMENT_BY_ID } = await import("../src/core/elements");
    const expected: Record<string, number> = { dune: 8, sandy_vegetation: 8, mangrove: 20, khazan: 12, seawall: 0, small_dam: 0, sand_mining: 0, beachside_resort: 0, house: 0 };
    for (const [id, quarters] of Object.entries(expected)) expect(ELEMENT_BY_ID.get(id)?.matureQuarters, id).toBe(quarters);
  });

  it("gives an immature element a linear fraction of its effects", () => {
    const run = new ActionRun(board(), TIMELINE);
    run.build({ q: 0, r: 0 }, "sandy_vegetation"); // biodiversity +2 at maturity, 8 quarters
    expect(run.state.biodiversity).toBeCloseTo(2 * (1 / 8));
    run.fastForwardYear();
    expect(run.state.biodiversity).toBeCloseTo(2 * (5 / 8));
    run.fastForwardYear();
    expect(run.state.biodiversity).toBeCloseTo(2);
  });
});

describe("coin jar economy", () => {
  const ECON = { ...TIMELINE, economy: { incomeScale: 0.5, jarStart: 40 } };

  it("pays income into the jar each quarter, not into Coin", () => {
    const run = new ActionRun(board(), ECON);
    const coin0 = run.state.coin;
    run.build({ q: 2, r: 0 }, "house"); // money +5 a quarter
    expect(run.state.coin).toBe(coin0 - 25);
    // A house needs no time to mature, so it earns in the quarter it is built.
    expect(run.jar).toBe(40 + 5 * 0.5);
    run.fastForwardYear();
    expect(run.jar).toBe(40 + 5 * 5 * 0.5);
  });

  it("banks the jar for free: Coin goes up, the clock does not move", () => {
    const run = new ActionRun(board(), ECON);
    const quarter = run.quarter;
    const coin0 = run.state.coin;
    expect(run.collectJar()).toBe(40);
    expect(run.state.coin).toBe(coin0 + 40);
    expect(run.quarter).toBe(quarter);
    expect(run.collectJar()).toBe(0);
  });
});
