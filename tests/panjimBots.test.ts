import { describe, expect, it } from "vitest";
import { BOT_LEVEL, SEEDS, replaySmartWithout, runBot, runSmartOnly, savedShare, smartRun, won, type BotResult } from "../tools/panjimBots/bots";

/**
 * The bots on the real rules (Section 7: yearly turns, coins off). Each
 * archetype sees only what the screen shows (the forecast cone at the start
 * of a storm's phase, remembered; the heat in the last two years) and uses
 * every build of every year. A run is won when the level ends on three stars.
 * These pin the measured balance over the 20 bot seeds (docs/qa/section7/
 * bots.md), with a little room: Smart wins most runs, Casual (by eye) almost
 * never, Greedy (near houses, ignoring the forecast) swings widely and never
 * wins, doing nothing saves nothing.
 */
const casual = SEEDS.map((seed) => runBot("casual", seed));
const greedy = SEEDS.map((seed) => runBot("greedy", seed));
const rusher = SEEDS.map((seed) => runBot("rusher", seed));
const rate = (runs: BotResult[]): number => runs.filter(won).length / runs.length;

describe("Panjim bots", () => {
  it("does nothing and saves nothing: the do-nothing player sits at the floor and never wins", () => {
    for (const run of rusher) expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.05);
    expect(rate(rusher)).toBe(0);
  });

  it("Casual, building by eye, keeps most homes (75-90%) but rarely ends on three stars (at most 15%)", () => {
    for (const run of casual) expect(savedShare(run), run.seed).toBeGreaterThanOrEqual(0.75);
    for (const run of casual) expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.9);
    expect(rate(casual)).toBeLessThanOrEqual(0.15);
  });

  it("Greedy, ignoring the forecast, swings widely (at least 25 points between its worst and best run) and never wins", () => {
    const shares = greedy.map(savedShare);
    expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThanOrEqual(0.25);
    expect(Math.min(...shares)).toBeGreaterThan(0);
    expect(rate(greedy)).toBe(0);
  });

  it(
    "Smart wins 70-90% of its runs, does at least as well as Casual on every seed, and every defence it builds pulls its weight; none comes near the mix alone",
    () => {
      const runs = SEEDS.map((seed) => smartRun(seed));
      const smart = runs.map((r) => r.result);
      expect(rate(smart)).toBeGreaterThanOrEqual(0.7);
      expect(rate(smart)).toBeLessThanOrEqual(0.9);
      smart.forEach((result, i) => expect(savedShare(result), result.seed).toBeGreaterThanOrEqual(savedShare(casual[i])));
      for (const run of smart) expect(run.yearsWithBuildsLeft, run.seed).toBe(0);
      // Smart's own runs replayed without each defence it built: never better without it, and over three seeds every one counts.
      const ids = Object.keys(smart[0].built);
      for (const id of ids) {
        let margin = 0;
        for (const [i, seed] of SEEDS.slice(0, 3).entries()) {
          const without = savedShare(replaySmartWithout(id, seed, runs[i].log));
          expect(without, `${id} ${seed}`).toBeLessThanOrEqual(savedShare(smart[i]) + 1e-9);
          margin += savedShare(smart[i]) - without;
        }
        expect(margin, id).toBeGreaterThan(0);
      }
      // One kind only: at least 30 points behind the mix.
      for (const id of ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"]) expect(savedShare(runSmartOnly(id, SEEDS[0])), id).toBeLessThanOrEqual(savedShare(smart[0]) - 0.3);
    },
    900_000
  );

  it("Casual and Greedy use every build of every year", () => {
    for (const run of [...casual, ...greedy]) expect(run.yearsWithBuildsLeft, `${run.persona} ${run.seed}`).toBe(0);
  });

  it("gives identical results for the same seed", () => {
    expect(runBot("casual", SEEDS[2])).toEqual(casual[2]);
    expect(runBot("greedy", SEEDS[1])).toEqual(greedy[1]);
  });

  it("plays the one real level, three storms a run", () => {
    expect(BOT_LEVEL.id).toBe("l01-first-rains");
    for (const run of casual) expect(run.houses).toHaveLength(3);
  });
});
