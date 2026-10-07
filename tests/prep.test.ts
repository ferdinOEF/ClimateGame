import { describe, expect, it } from "vitest";
import { BOT_LEVELS, newRun } from "../tools/panjimBots/bots";
import { prepProgress } from "../src/core/prep";
import { activeVoices, levelWithPreset } from "../src/levels/levels";
import { ELEMENT_BY_ID } from "../src/core/elements";
import type { ActionRun } from "../src/core/actionRun";

/**
 * "Get ready" replaced the Voices of Panjim panel on Panaji. These check that
 * the jobs are written for the storm that is coming (its exposure, defences
 * that answer it, buildable where they point), that they complete when the
 * matching builds are made and pay their reward, and that the old Voices are
 * dormant rather than deleted.
 */
const ANSWERS: Record<string, string[]> = { cyclone: ["dune", "sandy_vegetation", "mangrove", "seawall"], flood: ["khazan", "mangrove"], compound: ["dune", "sandy_vegetation", "mangrove", "khazan"] };

function build(run: ActionRun, zone: string, elementId: string, times: number): number {
  let built = 0;
  for (const key of run.zones!.keys(zone)) {
    if (built >= times) break;
    const [q, r] = key.split(",").map(Number);
    if (run.state.canBuild({ q, r }, elementId)) {
      run.state.coin += 1000;
      if (run.build({ q, r }, elementId).ok) built++;
    }
  }
  return built;
}

describe("Get ready jobs", () => {
  it("Voices are dormant on Panaji: still in the data, switched off", () => {
    const level = levelWithPreset("l01-first-rains", "easy-test")!;
    expect(level.showVoicesPanel).toBe(false);
    expect((level.voices ?? []).length).toBeGreaterThan(0);
    expect(activeVoices(level)).toEqual([]);
    const tutorial = levelWithPreset("l00-tutorial", "easy-test") ?? undefined;
    expect(tutorial?.showVoicesPanel).not.toBe(false);
  });

  for (const preset of ["easy-test", "strict"] as const) {
    it(`${preset}: 2-3 jobs per storm, each a defence against it, buildable where it points`, () => {
      const run = newRun("panjim", BOT_LEVELS[preset]);
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
        while (!run.landed.has(next.id)) run.fastForwardYear();
      }
    });
  }

  it("completes when the matching builds are made, and pays its reward once", () => {
    const run = newRun("panjim", BOT_LEVELS["easy-test"]);
    const job = run.prep[0];
    const level = BOT_LEVELS["easy-test"];
    const template = level.prep!.templates.find((t) => t.id === job.templateId)!;
    expect(job.reward).toBe(template.reward);
    const before = run.state.coin;
    let paid = 0;
    for (let i = 0; i < job.count; i++) {
      const coinBefore = run.state.coin + 1000;
      build(run, job.zone, job.elementId, 1);
      paid += Math.max(0, run.state.coin - (coinBefore - ELEMENT_BY_ID.get(job.elementId)!.buildCost));
    }
    expect(job.done).toBe(true);
    expect(paid).toBeGreaterThanOrEqual(job.reward);
    // Building more of the same pays nothing more.
    const coinBefore = run.state.coin + 1000;
    build(run, job.zone, job.elementId, 1);
    expect(run.state.coin).toBeLessThanOrEqual(coinBefore);
    expect(before).toBeGreaterThan(0);
  });

  it("rewards follow the coin preset (x10 on easy-test)", () => {
    const easy = BOT_LEVELS["easy-test"].prep!.templates.map((t) => t.reward);
    const strict = BOT_LEVELS.strict.prep!.templates.map((t) => t.reward);
    expect(easy).toEqual(strict.map((r) => r * 10));
  });

  it("refreshes when the next storm is announced, dropping the old jobs", () => {
    const run = newRun("panjim", BOT_LEVELS.strict);
    const first = run.prep.map((job) => job.id);
    const c1 = run.nextChallenge()!;
    while (!run.landed.has(c1.id)) run.fastForwardYear();
    const second = run.prep.map((job) => job.id);
    expect(second.every((id) => !first.includes(id))).toBe(true);
    expect(run.prep.every((job) => job.challengeId === run.nextChallenge()!.id)).toBe(true);
  });

  it("survives a snapshot and restore", () => {
    const run = newRun("panjim", BOT_LEVELS.strict);
    const snap = run.snapshot();
    const ids = run.prep.map((job) => job.id);
    run.fastForwardYear();
    run.restore(snap);
    expect(run.prep.map((job) => job.id)).toEqual(ids);
  });
});
