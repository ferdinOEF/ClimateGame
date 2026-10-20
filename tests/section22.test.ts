import { describe, expect, it } from "vitest";
import { passYear } from "./helpers/passYear";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { clearsLevel, CLEAR_TOTAL_STARS } from "../src/core/panjimIndex";
import { starsForHouses } from "../src/core/zones";
import { panjimHelpHtml } from "../src/ui/panjim/panjimHelp";

/** Section 22.4: the owner's answers to Section 21's open decisions, as game rules. */
describe("Section 22.4, the owner's decisions", () => {
  // 2: a home a storm ruined stays ruined for the rest of the run; repair is for defences only.
  it("never offers or allows Repair on a ruined home", () => {
    const run = newRun("s22-repair", BOT_LEVEL);
    const cyclone = run.schedule[0];
    while (!run.landed.has(cyclone.id)) passYear(run);
    const ruined = [...run.outcomes.get(cyclone.id)!.damagedHouses];
    expect(ruined.length).toBeGreaterThan(0);
    for (const key of ruined) {
      const [q, r] = key.split(",").map(Number);
      expect(run.state.elements.get(key)?.degradeAmount).toBe(1);
      expect(run.needsRepair({ q, r }), key).toBe(false);
      const outcome = run.repair({ q, r });
      expect(outcome.ok).toBe(false);
      expect(run.state.elements.get(key)?.degradeAmount, key).toBe(1);
    }
  });

  // 6: clear = at least one star in every storm and at least five of the nine in all.
  it("clears the level only with a star in every storm and five in all", () => {
    expect(CLEAR_TOTAL_STARS).toBe(5);
    expect(clearsLevel([3, 1, 1])).toBe(true);
    expect(clearsLevel([2, 2, 1])).toBe(true);
    // One storm's three stars alone no longer clear it.
    expect(clearsLevel([3, 0, 2])).toBe(false);
    expect(clearsLevel([3, 2, 0])).toBe(false);
    expect(clearsLevel([1, 1, 1])).toBe(false);
    expect(clearsLevel([3, 3, 3])).toBe(true);
  });

  // 7: a level with a one-star line gives no star below it; one without (the Tutorial) never gives 0.
  it("gives no star below the one-star line, and the Tutorial's rule never gives 0", () => {
    const stars = BOT_LEVEL.houseStars!;
    expect(stars.one).toBeDefined();
    expect(starsForHouses(0, 10, stars)).toBe(0);
    expect(starsForHouses(10, 10, stars)).toBe(3);
    expect(starsForHouses(0, 10, { three: 0.79, two: 0.5 })).toBe(1);
  });

  it("says the clear rule in How to play, as a game rule, for Panjim's three storms only", () => {
    const run = newRun("s22-help", BOT_LEVEL);
    const html = panjimHelpHtml({ startYear: 2026, endYear: 2050, storms: run.schedule });
    expect(html).toContain("You clear Panjim with at least one star in every storm and five of the nine stars in all.");
    const one = panjimHelpHtml({ startYear: 2026, endYear: 2028, storms: run.schedule.slice(0, 1) });
    expect(one).not.toContain("You clear Panjim");
  });
});
