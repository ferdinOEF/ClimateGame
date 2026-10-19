import { describe, expect, it } from "vitest";
import { ActionRun } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { boardSetup } from "../src/levels/balance";
import { mapById } from "../src/levels/levelMap";

/**
 * The Tutorial (Section 15): the Panaji game on a small coast. Three builds,
 * one cyclone straight after the third, and an objective that, followed,
 * saves every home in the cyclone's path. A tutorial a player can lose by
 * doing what it says is not a tutorial.
 */
const level = LEVEL_BY_ID.get("l00-tutorial")!;
const map = mapById("tutorial")!;

function newRun(): ActionRun {
  const setup = boardSetup(level, map);
  const state = new GameState(map.tiles, setup.startingElements, level.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  return new ActionRun(state, level.timeline!, {
    climate: level.climate,
    zones: map.zones,
    houseStars: level.houseStars,
    houseRule: level.houses?.rule,
    prep: level.prep,
    economy: level.economy,
    growth: level.growth,
    landmarks: map.landmarks
  });
}

/** A year's build that saves no home from the cyclone (its card would read 0), so it changes nothing the storm does. */
function passYear(run: ActionRun): void {
  const cyclone = run.schedule[0];
  for (const tile of run.state.placed.values()) {
    for (const def of run.state.buildableAt(tile.coord)) {
      if ((run.homesSavedBy(cyclone, tile.coord, def.id) ?? 0) !== 0) continue;
      if (run.build(tile.coord, def.id).ok) return;
    }
  }
  throw new Error("nowhere to pass the year");
}

function finish(run: ActionRun): void {
  for (let i = 0; i < 5 && !run.finished; i++) passYear(run);
  expect(run.finished).toBe(true);
}

describe("the Tutorial", () => {
  it("plays the Panaji game: one build a year, three years, one cyclone after the third build, no coins", () => {
    expect(level.tutorial).toBe(true);
    expect(level.timeModel).toBe("years");
    const run = newRun();
    expect(run.totalYears).toBe(3);
    expect(run.economyEnabled).toBe(false);
    expect(run.schedule.map((c) => c.kind)).toEqual(["cyclone"]);
    expect(run.buildsUntil(run.schedule[0])).toBe(3);
  });

  it("has homes at risk, and its objective, followed, saves every one of them", () => {
    const run = newRun();
    const cyclone = run.schedule[0];
    const atRisk = run.exposureFor(cyclone)?.housesAtRisk.length ?? 0;
    expect(atRisk).toBeGreaterThan(5);
    const rows = run.prep.filter((job) => job.challengeId === cyclone.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((n, job) => n + job.count, 0)).toBeLessThanOrEqual(3);
    for (const job of rows) {
      for (let i = 0; i < job.count; i++) {
        // The model's best tile in the row. Section 17.1 took the number off the cards, so a player no longer sees which
        // tile that is: the row's other tiles save fewer (a player on the worst ones saves 5 of 18, the next test).
        let key: string | undefined;
        let best = -Infinity;
        for (const k of job.tiles ?? []) {
          const [q, r] = k.split(",").map(Number);
          if (!run.state.canBuild({ q, r }, job.elementId)) continue;
          const homes = run.homesSavedBy(cyclone, { q, r }, job.elementId) ?? 0;
          if (homes > best) {
            best = homes;
            key = k;
          }
        }
        expect(key, `${job.label}: a tile to build on`).toBeTruthy();
        const [q, r] = key!.split(",").map(Number);
        expect(run.build({ q, r }, job.elementId).ok).toBe(true);
      }
    }
    finish(run);
    const outcome = run.outcomes.get(cyclone.id)!;
    expect(outcome.housesTotal).toBeGreaterThan(0);
    expect(outcome.housesSaved).toBe(outcome.housesTotal);
    expect(outcome.stars).toBe(3);
  });

  // Section 17 review: with no number on the cards a player may follow the rows on any of their tiles. The Tutorial
  // still plays to its end and its result, however few homes stand (the owner's call: docs/PROGRESS.md, Section 17).
  it("plays to its end when its rows are followed on their worst tiles", () => {
    const run = newRun();
    const cyclone = run.schedule[0];
    for (const job of run.prep.filter((j) => j.challengeId === cyclone.id)) {
      for (let i = 0; i < job.count; i++) {
        let key: string | undefined;
        let worst = Infinity;
        for (const k of job.tiles ?? []) {
          const [q, r] = k.split(",").map(Number);
          if (!run.state.canBuild({ q, r }, job.elementId)) continue;
          const homes = run.homesSavedBy(cyclone, { q, r }, job.elementId) ?? 0;
          if (homes < worst) {
            worst = homes;
            key = k;
          }
        }
        const [q, r] = key!.split(",").map(Number);
        expect(run.build({ q, r }, job.elementId).ok).toBe(true);
      }
    }
    finish(run);
    expect(run.finished).toBe(true);
    expect(run.outcomes.get(cyclone.id)!.stars).toBeGreaterThanOrEqual(1);
  });

  it("loses homes when nothing is built", () => {
    const run = newRun();
    finish(run);
    const outcome = run.outcomes.get(run.schedule[0].id)!;
    expect(outcome.housesSaved).toBeLessThan(outcome.housesTotal);
  });
});
