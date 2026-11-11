import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assess, replay, trialBoard, type PlanAction } from "../tools/bestPlan/plan";

/**
 * Section 24: the best plan the solver found, replayed through the game's own run with nothing but its actions, gives
 * the stars and homes the plan file says, storm by storm. If the rules or the map change, this fails until the plan is
 * searched again.
 *
 * Section 41.5: the plan is docs/qa/section41/best_plan.json, from `npm run bestplan -- beam=20 keep=16 jobs=4
 * out=docs/qa/section41 seed=tools/bestPlan/seed41.json` on Section 41's rules (seawalls and breakwaters at the shore,
 * a seawall holding the river in 2050, the first cyclone at 1.15, the 2050 wind share 0.9, Campal's water edge open,
 * two khazans and a mangrove standing from the start). It loses no home in any storm.
 */
interface PlanFile {
  goal1: { stars: number; lost: number; nineOfNine: boolean; storms: { id: string; stars: number; saved: number; total: number }[]; actions: { action: string; elementId: string; q: number; r: number }[] };
  goal2: { sameAsGoal1: boolean; stars: number; lost: number; everyHomeSaved: boolean; storms: { id: string; stars: number; saved: number; total: number }[]; actions: { action: string; elementId: string; q: number; r: number }[] };
}
const plan = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../docs/qa/section41/best_plan.json"), "utf8")) as PlanFile;
const actionsOf = (rows: PlanFile["goal1"]["actions"]): PlanAction[] =>
  rows.map((r) => (r.action === "repair" ? { type: "repair", q: r.q, r: r.r } : { type: "build", q: r.q, r: r.r, elementId: r.elementId }));

describe("the best plan, replayed headless", () => {
  for (const goal of ["goal1", "goal2"] as const) {
    it(`${goal}: 25 actions, the same stars and homes lost in every storm`, () => {
      const p = plan[goal];
      expect(p.actions).toHaveLength(25);
      const run = replay(actionsOf(p.actions));
      expect(run.finished).toBe(true);
      const got = run.schedule.map((c) => {
        const o = run.outcomes.get(c.id)!;
        return { id: c.id, stars: o.stars, saved: o.housesSaved, total: o.housesTotal };
      });
      // Section 41.6.1 (owner decision 4): a storm's path is counted with the standing nature in place, so the plan
      // file's totals (Section 41's count) are larger than the replay's; its stars and its homes lost are the same.
      // Step 41.6.2 searches the plan again and pins the new file in full.
      expect(got.map(({ id, stars, saved, total }) => ({ id, stars, lost: total - saved }))).toEqual(p.storms.map(({ id, stars, saved, total }) => ({ id, stars, lost: total - saved })));
      expect(got.reduce((s, x) => s + x.stars, 0)).toBe(p.stars);
      expect(got.reduce((s, x) => s + x.total - x.saved, 0)).toBe(p.lost);
    });
  }

  it("states the goals as the replay has them", () => {
    expect(plan.goal1.nineOfNine).toBe(plan.goal1.stars === 9);
    expect(plan.goal2.everyHomeSaved).toBe(plan.goal2.lost === 0);
  });

  // Section 41.5 (owner's target): a perfect plan saves every home in all three storms.
  for (const goal of ["goal1", "goal2"] as const) {
    it(`${goal}: the committed plan, replayed through the game's own run, loses no home in any storm and takes 9 of 9 stars`, () => {
      const run = replay(actionsOf(plan[goal].actions));
      expect(run.finished).toBe(true);
      expect(run.schedule).toHaveLength(3);
      for (const c of run.schedule) {
        const o = run.outcomes.get(c.id)!;
        expect(o.housesDamaged, c.id).toBe(0);
        expect(o.housesSaved, c.id).toBe(o.housesTotal);
        expect(o.housesTotal, c.id).toBeGreaterThan(0);
        expect(o.stars, c.id).toBe(3);
      }
      // Its builds are the player's own 25: none is one of the three defenses standing from the start.
      expect(run.buildLog).toHaveLength(25);
      expect([...run.state.elements.values()].filter((inst) => inst.fromStart)).toHaveLength(3);
    });
  }

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

  it("needs its builds after 2040 for the 2050 storm's three stars (Section 26.2)", () => {
    const actions = actionsOf(plan.goal1.actions);
    const real = replay(actions);
    const last = real.schedule[real.schedule.length - 1];
    const target = real.houseStarsFor(last)!.bioThree!;
    expect(real.outcomes.get(last.id)!.biodiversityChange!).toBeGreaterThanOrEqual(target);
    expect(real.outcomes.get(last.id)!.stars).toBe(3);
    // The board after the 2040 flood, nothing more built: the 2050 storm short of three stars. Section 30: on this
    // plan's board that is its homes (37 of 57 saved), as its biodiversity is past the +40 already (+42).
    const at2040 = replay(actions.slice(0, 15));
    expect(assess(at2040, at2040.state).storms[2].stars).toBeLessThan(3);
  });
});
