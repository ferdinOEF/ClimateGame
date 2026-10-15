import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { prepProgress } from "../src/core/prep";
import { ELEMENT_BY_ID } from "../src/core/elements";
import type { ActionRun } from "../src/core/actionRun";

/**
 * "Get ready" on Panaji. These check that the jobs are written for the storm
 * that is coming (its exposure, defences that answer it, buildable where they
 * point), and that they complete when the matching builds are made; with
 * coins off they pay nothing.
 */
const ANSWERS: Record<string, string[]> = { cyclone: ["dune", "sandy_vegetation", "mangrove", "seawall"], flood: ["khazan", "mangrove"], compound: ["dune", "sandy_vegetation", "mangrove", "khazan"] };

function build(run: ActionRun, zone: string, elementId: string, times: number): number {
  let built = 0;
  for (const key of run.zones!.keys(zone)) {
    if (built >= times) break;
    const [q, r] = key.split(",").map(Number);
    if (run.state.canBuild({ q, r }, elementId)) {
      if (run.buildsLeft <= 0) run.nextYear();
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
        while (!run.landed.has(next.id)) run.nextYear();
      }
    });
  }

  it("completes when the matching builds are made; with coins off it pays nothing", () => {
    const run = newRun("panjim", BOT_LEVEL);
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
    while (!run.landed.has(c1.id)) run.nextYear();
    const second = run.prep.map((job) => job.id);
    expect(second.every((id) => !first.includes(id))).toBe(true);
    expect(run.prep.every((job) => job.challengeId === run.nextChallenge()!.id)).toBe(true);
  });

  it("survives a snapshot and restore", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const snap = run.snapshot();
    const ids = run.prep.map((job) => job.id);
    run.nextYear();
    run.restore(snap);
    expect(run.prep.map((job) => job.id)).toEqual(ids);
  });
});
