import { passYear } from "./helpers/passYear";
import { describe, expect, it } from "vitest";
import { BOT_LEVEL as PANAJI, newRun } from "../tools/panjimBots/bots";

/**
 * Section 12: Panaji's objectives are now chosen by the hazard model
 * (tests/phaseObjectives.test.ts). These tests keep covering the template
 * jobs and the named opening objective, which any level without the model
 * flag still uses: on a copy of Panaji with the flag off.
 */
const BOT_LEVEL = { ...PANAJI, prep: { ...PANAJI.prep!, model: false } };
import { prepProgress } from "../src/core/prep";
import { ELEMENT_BY_ID } from "../src/core/elements";
import type { ActionRun } from "../src/core/actionRun";

/**
 * "Get ready" on Panaji. These check that the jobs are written for the storm
 * that is coming (its exposure, defences that answer it, buildable where they
 * point), and that they complete when the matching builds are made; with
 * coins off they pay nothing.
 */
const ANSWERS: Record<string, string[]> = { cyclone: ["dune", "sandy_vegetation", "mangrove", "seawall", "breakwater"], flood: ["khazan", "mangrove"], compound: ["dune", "sandy_vegetation", "mangrove", "khazan"] };

function build(run: ActionRun, zone: string, elementId: string, times: number): number {
  let built = 0;
  for (const key of run.zones!.keys(zone)) {
    if (built >= times) break;
    const [q, r] = key.split(",").map(Number);
    if (run.state.canBuild({ q, r }, elementId)) {
      if (run.build({ q, r }, elementId).ok) built++;
    }
  }
  return built;
}

describe("Get ready jobs", () => {
  {
    it(`2-3 jobs per storm, each a defence against it, buildable where it points`, () => {
      const run = newRun("panjim", BOT_LEVEL);
      for (let storm = 0; storm < 3; storm++) {
        const next = run.nextChallenge()!;
        expect(run.prep.length).toBeGreaterThanOrEqual(2);
        expect(run.prep.length).toBeLessThanOrEqual(3);
        for (const job of run.prep) {
          expect(job.challengeId).toBe(next.id);
          expect(ANSWERS[next.kind]).toContain(job.elementId);
          expect(ELEMENT_BY_ID.get(job.elementId)?.targetsHazards?.length).toBeGreaterThan(0);
          expect(job.done).toBe(false);
          expect(prepProgress(job, run.state, run.zones!).current).toBe(0);
        }
        while (!run.landed.has(next.id)) passYear(run);
      }
    });
  }

  it("completes when the matching builds are made; with coins off it pays nothing", () => {
    // The second storm's generated jobs (the first storm has the opening objective).
    const run = newRun("panjim", BOT_LEVEL);
    while (run.landed.size < 1) passYear(run);
    const job = run.prep[0];
    const template = BOT_LEVEL.prep!.templates.find((t) => t.id === job.templateId)!;
    expect(job.reward).toBe(template.reward);
    const coin = run.state.coin;
    for (let i = 0; i < job.count; i++) build(run, job.zone, job.elementId, 1);
    expect(job.done).toBe(true);
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    expect(run.state.coin).toBe(coin);
  });

  it("refreshes when the next storm is announced, dropping the old jobs", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const first = run.prep.map((job) => job.id);
    const c1 = run.nextChallenge()!;
    while (!run.landed.has(c1.id)) passYear(run);
    const second = run.prep.map((job) => job.id);
    expect(second.every((id) => !first.includes(id))).toBe(true);
    expect(run.prep.every((job) => job.challengeId === run.nextChallenge()!.id)).toBe(true);
  });

  it("survives a snapshot and restore", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const snap = run.snapshot();
    const ids = run.prep.map((job) => job.id);
    passYear(run);
    run.restore(snap);
    expect(run.prep.map((job) => job.id)).toEqual(ids);
  });
});

describe("the first storm's objective (Section 6.3)", () => {
  // Section 16.4: the first objective is the ground round Sharada Mandir School.
  it("is set at the start: Protect Sharada Mandir School, in three steps round the school, 5 builds in all", () => {
    const run = newRun("panjim", BOT_LEVEL);
    expect(run.prep.map((job) => [job.heading, job.elementId, job.count])).toEqual([
      ["Protect Sharada Mandir School", "sandy_vegetation", 2],
      ["Protect Sharada Mandir School", "dune", 2],
      ["Protect Sharada Mandir School", "breakwater", 1]
    ]);
    for (const job of run.prep) expect(job.reward).toBe(0);
  });

  it("fits the stretch and the builds before the storm", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const tiles = run.openingTiles!;
    const buildable = (id: string): number => [...tiles].filter((key) => {
      const [q, r] = key.split(",").map(Number);
      return run.state.canBuild({ q, r }, id);
    }).length;
    // Pandanus and dunes share the stretch's beach: both steps fit on it together.
    expect(buildable("dune")).toBeGreaterThanOrEqual(2 + 2);
    expect(buildable("breakwater")).toBeGreaterThanOrEqual(1);
    const steps = run.prep.reduce((sum, job) => sum + job.count, 0);
    const cyclone = run.nextChallenge()!;
    // One build a year: the whole objective fits in the builds before the cyclone.
    expect(steps).toBeLessThanOrEqual(cyclone.turn);
  });

  it("counts only what stands on the stretch, and is done when every step is", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const tiles = run.openingTiles!;
    // Its five builds are the five before the cyclone: the fifth brings it, and the jobs then give way.
    const completed: string[] = [];
    for (const job of [...run.prep]) {
      let placed = 0;
      for (const key of tiles) {
        if (placed >= job.count) break;
        const [q, r] = key.split(",").map(Number);
        if (!run.state.canBuild({ q, r }, job.elementId)) continue;
        const outcome = run.build({ q, r }, job.elementId);
        if (!outcome.ok) continue;
        placed++;
        for (const e of outcome.events) if (e.type === "prep_complete") completed.push(e.objective.elementId);
      }
    }
    expect(completed.sort()).toEqual(["breakwater", "dune", "sandy_vegetation"]);
    expect(run.landed.has("c1-cyclone")).toBe(true);
    // A dune off the stretch counts for nothing.
    const fresh = newRun("panjim", BOT_LEVEL);
    const away = [...fresh.state.placed.values()].find((t) => !tiles.has(`${t.coord.q},${t.coord.r}`) && fresh.state.canBuild(t.coord, "dune"))!;
    fresh.build(away.coord, "dune");
    expect(prepProgress(fresh.prep[1], fresh.state, fresh.zones!).current).toBe(0);
  });

  it("then gives way to the usual jobs for the next storm", () => {
    const run = newRun("panjim", BOT_LEVEL);
    while (run.landed.size < 1) passYear(run);
    expect(run.prep.every((job) => !job.heading)).toBe(true);
  });
});
