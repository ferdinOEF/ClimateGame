import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assess, replay, trialBoard, type PlanAction } from "../tools/bestPlan/plan";

/**
 * Section 24: the best plan the solver found (docs/qa/section26/best_plan.json,
 * from `npm run bestplan` on Section 26's rules), replayed through the game's own run with nothing
 * but its actions, gives the stars and homes the plan file says, storm by storm.
 * If the rules or the map change, this fails until the plan is searched again.
 */
interface PlanFile {
  goal1: { stars: number; lost: number; nineOfNine: boolean; storms: { id: string; stars: number; saved: number; total: number }[]; actions: { action: string; elementId: string; q: number; r: number }[] };
  goal2: { sameAsGoal1: boolean; stars: number; lost: number; everyHomeSaved: boolean; storms: { id: string; stars: number; saved: number; total: number }[]; actions: { action: string; elementId: string; q: number; r: number }[] };
}
const plan = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../docs/qa/section26/best_plan.json"), "utf8")) as PlanFile;
const actionsOf = (rows: PlanFile["goal1"]["actions"]): PlanAction[] =>
  rows.map((r) => (r.action === "repair" ? { type: "repair", q: r.q, r: r.r } : { type: "build", q: r.q, r: r.r, elementId: r.elementId }));

describe("the best plan, replayed headless", () => {
  for (const goal of ["goal1", "goal2"] as const) {
    it(`${goal}: 25 actions, the same stars and homes saved in every storm`, () => {
      const p = plan[goal];
      expect(p.actions).toHaveLength(25);
      const run = replay(actionsOf(p.actions));
      expect(run.finished).toBe(true);
      const got = run.schedule.map((c) => {
        const o = run.outcomes.get(c.id)!;
        return { id: c.id, stars: o.stars, saved: o.housesSaved, total: o.housesTotal };
      });
      expect(got).toEqual(p.storms.map(({ id, stars, saved, total }) => ({ id, stars, saved, total })));
      expect(got.reduce((s, x) => s + x.stars, 0)).toBe(p.stars);
      expect(got.reduce((s, x) => s + x.total - x.saved, 0)).toBe(p.lost);
    });
  }

  it("states the goals as the replay has them", () => {
    expect(plan.goal1.nineOfNine).toBe(plan.goal1.stars === 9);
    expect(plan.goal2.everyHomeSaved).toBe(plan.goal2.lost === 0);
  });

  it("scores a board exactly as the run then goes: the solver's assessment before the last build equals the real run after it", () => {
    const actions = actionsOf(plan.goal1.actions);
    const before = replay(actions.slice(0, 24));
    const predicted = assess(before, trialBoard(before, actions[24]));
    const real = replay(actions);
    expect(predicted.storms.map(({ id, stars, saved, total }) => ({ id, stars, saved, total }))).toEqual(
      real.schedule.map((c) => ({ id: c.id, stars: real.outcomes.get(c.id)!.stars, saved: real.outcomes.get(c.id)!.housesSaved, total: real.outcomes.get(c.id)!.housesTotal }))
    );
    // And from the end of the first phase, with the rest of the plan's builds left out: the 2040 and 2050 storms as the resolver has them.
    const phase1 = replay(actions.slice(0, 5));
    const ahead = assess(phase1, phase1.state);
    expect(ahead.storms).toHaveLength(3);
    expect(ahead.storms[0]).toMatchObject({ stars: real.outcomes.get("c1-cyclone")!.stars });
  });

  it("needs its builds after 2040 to reach the 2050 storm's three star biodiversity (Section 26.2)", () => {
    const actions = actionsOf(plan.goal1.actions);
    const real = replay(actions);
    const last = real.schedule[real.schedule.length - 1];
    const target = real.houseStarsFor(last)!.bioThree!;
    expect(real.outcomes.get(last.id)!.biodiversityChange!).toBeGreaterThanOrEqual(target);
    // The board after the 2040 flood, nothing more built: short of the target.
    const at2040 = replay(actions.slice(0, 15));
    expect(assess(at2040, at2040.state).endBio).toBeLessThan(target);
  });
});
