import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";

/**
 * Section 10: the first cyclone's area can be fully protected by the opening
 * objective's own five builds (2 pandanus, 2 dunes, 1 breakwater), one a year,
 * each on the objective's stretch where the forecast says it saves the most.
 */
describe("the first objective", () => {
  it("asks for 2 pandanus, 2 dunes and 1 breakwater: five builds, one per year before the first cyclone", () => {
    const opening = BOT_LEVEL.prep!.opening!;
    expect(opening.steps.map((s) => [s.elementId, s.count])).toEqual([["sandy_vegetation", 2], ["dune", 2], ["breakwater", 1]]);
    const run = newRun("s10", BOT_LEVEL);
    expect(run.buildsUntil(run.schedule[0])).toBe(5);
  });

  // Section 11: the owner's new land at the river mouth (5,10 and 6,9, 0 m on the DEM, beside the new sea
  // tiles) is in the cyclone's area but outside the stretch; the owner accepted that. The five builds save
  // every home in the stretch and 5,10; 6,9 needs a breakwater offshore of the stretch.
  it("protects every home in the stretch when built where the forecast shows; only 6,9 at the river mouth still falls", () => {
    const run = newRun("s10", BOT_LEVEL);
    const cyclone = run.schedule[0];
    expect(run.forecastCone(cyclone)!.area.length).toBeGreaterThan(0);
    const lostAfter = (key: string, id: string): number => {
      const [q, r] = key.split(",").map(Number);
      const probe = newRun("s10", BOT_LEVEL);
      probe.restore(run.snapshot());
      probe.build({ q, r }, id);
      return probe.landed.has(cyclone.id) ? probe.outcomes.get(cyclone.id)!.damagedHouses.length : probe.forecastCone(cyclone)!.area.length;
    };
    for (const id of ["breakwater", "dune", "dune", "sandy_vegetation", "sandy_vegetation"]) {
      const options = [...run.openingTiles!].sort().filter((key) => {
        const [q, r] = key.split(",").map(Number);
        return run.state.canBuild({ q, r }, id);
      });
      expect(options.length, id).toBeGreaterThan(0);
      const best = options.reduce((a, b) => (lostAfter(b, id) < lostAfter(a, id) ? b : a));
      const [q, r] = best.split(",").map(Number);
      expect(run.build({ q, r }, id).ok, `${id} at ${best}`).toBe(true);
    }
    expect(run.landed.has(cyclone.id)).toBe(true);
    expect(run.outcomes.get(cyclone.id)!.damagedHouses).toEqual(["6,9"]);
    expect(run.openingTiles!.has("6,9")).toBe(false);
  });
});
