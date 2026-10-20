import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { replay, type PlanAction } from "../tools/bestPlan/plan";

/**
 * Section 24: the best plan the solver found (docs/qa/section24/best_plan.json,
 * from `npm run bestplan`), replayed through the game's own run with nothing
 * but its actions, gives the stars and homes the plan file says, storm by storm.
 * If the rules or the map change, this fails until the plan is searched again.
 */
interface PlanFile {
  goal1: { stars: number; storms: { id: string; stars: number; saved: number; total: number }[]; actions: { action: string; elementId: string; q: number; r: number }[] };
  goal2: { sameAsGoal1: boolean; stars: number; storms: { id: string; stars: number; saved: number; total: number }[]; actions: { action: string; elementId: string; q: number; r: number }[] };
}
const plan = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../docs/qa/section24/best_plan.json"), "utf8")) as PlanFile;
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
    });
  }
});
