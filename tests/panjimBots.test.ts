import { describe, expect, it } from "vitest";
import { BOT_LEVEL, SEEDS, replaySmartWithout, runBot, savedShare, smartRun, won } from "../tools/panjimBots/bots";

/**
 * The bots on the real rules (Section 7: yearly turns, coins off). Each
 * archetype uses every build of every year it plays; a run is won when the
 * level ends on three stars. These pin the balance over the 20 bot seeds,
 * with some room round the measured numbers (docs/qa/section7/bots.md):
 * Casual wins about a quarter of its runs, Smart nearly all, Greedy (builds
 * near houses, ignores the forecast) swings widely and never wins, and doing
 * nothing saves nothing.
 */
const casual = SEEDS.map((seed) => runBot("casual", seed));
const greedy = SEEDS.map((seed) => runBot("greedy", seed));
const rusher = SEEDS.map((seed) => runBot("rusher", seed));
const rate = (runs: { stars: number[] }[]): number => runs.filter((r) => won(r as never)).length / runs.length;

describe("Panjim bots", () => {
  it("does nothing and saves nothing: the do-nothing player sits at the floor and never wins", () => {
    for (const run of rusher) expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.05);
    expect(rate(rusher)).toBe(0);
  });

  it("Casual, building by eye, wins about a quarter of its runs (15-40%)", () => {
    expect(rate(casual)).toBeGreaterThanOrEqual(0.15);
    expect(rate(casual)).toBeLessThanOrEqual(0.4);
  });

  it("Greedy, ignoring the forecast, swings widely: at least 30 points between its worst and best run", () => {
    const shares = greedy.map(savedShare);
    expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThanOrEqual(0.3);
    expect(Math.min(...shares)).toBeGreaterThan(0);
  });

  it(
    "Smart wins most of its runs (at least 75%), does at least as well as Casual on every seed, and every defence it builds pulls its weight",
    () => {
      const runs = SEEDS.map((seed) => smartRun(seed));
      expect(rate(runs.map((r) => r.result))).toBeGreaterThanOrEqual(0.75);
      runs.forEach(({ result }, i) => expect(savedShare(result), result.seed).toBeGreaterThanOrEqual(savedShare(casual[i])));
      const { result: smart, log } = runs[0];
      // Smart's own run replayed without each defence it built: never better without it.
      for (const id of Object.keys(smart.built)) expect(savedShare(replaySmartWithout(id, SEEDS[0], log)), id).toBeLessThanOrEqual(savedShare(smart) + 1e-9);
    },
    900_000
  );

  it("uses every build of the years it plays", () => {
    for (const run of [...greedy]) expect(run.yearsWithBuildsLeft, run.seed).toBe(0);
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
