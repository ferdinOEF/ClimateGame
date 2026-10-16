import { describe, expect, it } from "vitest";
import { BOT_LEVEL, SEEDS, replaySmartWithout, runBot, runSmartOnly, savedShare, smartRun, type BotResult } from "../tools/panjimBots/bots";

/**
 * The bots on the real rules (Section 10: 25 builds, one a year). Each
 * archetype sees only what the screen shows and builds every year. These pin
 * the measured balance over the 20 bot seeds (docs/qa/section10/bots.md),
 * with some room. How a run is "won" is the owner's to define later, so no
 * win rate is pinned here.
 */
const casual = SEEDS.map((seed) => runBot("casual", seed));
const greedy = SEEDS.map((seed) => runBot("greedy", seed));
const far = SEEDS.slice(0, 5).map((seed) => runBot("far", seed));
const mean = (runs: BotResult[]): number => runs.reduce((s, r) => s + savedShare(r), 0) / runs.length;

describe("Panjim bots, 25 builds", () => {
  it("building only far from the risk saves nothing", () => {
    for (const run of far) expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.02);
  });

  it("building by eye on what the forecast shows saves more than half the homes (Casual 45-70%)", () => {
    for (const run of casual) {
      expect(savedShare(run), run.seed).toBeGreaterThanOrEqual(0.45);
      expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.7);
    }
  });

  it("ignoring the forecast is a gamble: Greedy swings at least 25 points and always does worse than Casual on average", () => {
    const shares = greedy.map(savedShare);
    expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThanOrEqual(0.25);
    expect(mean(greedy)).toBeLessThan(mean(casual) - 0.2);
  });

  it("builds every year: no year is ever skipped, 25 builds a run", () => {
    for (const run of [...casual, ...greedy, ...far]) {
      expect(run.yearsSkipped, `${run.persona} ${run.seed}`).toBe(0);
      expect(run.decisions, `${run.persona} ${run.seed}`).toBe(25);
    }
  });

  it(
    "choosing the right tiles pays (Smart beats Casual on average), every defence pulls its weight, and none comes near the mix alone",
    () => {
      const seeds = SEEDS.slice(0, 6);
      const runs = seeds.map((seed) => smartRun(seed));
      const smart = runs.map((r) => r.result);
      expect(mean(smart)).toBeGreaterThan(mean(casual.slice(0, 6)));
      // Smart's own runs replayed without each defence it built: never better without it, and over three seeds every one counts.
      const ids = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"];
      for (const id of ids) {
        let margin = 0;
        for (const [i, seed] of seeds.slice(0, 3).entries()) {
          const without = savedShare(replaySmartWithout(id, seed, runs[i].log));
          expect(without, `${id} ${seed}`).toBeLessThanOrEqual(savedShare(smart[i]) + 1e-9);
          margin += savedShare(smart[i]) - without;
        }
        expect(margin, id).toBeGreaterThan(0);
      }
      // One kind only: clearly behind the mix.
      for (const id of ids) expect(savedShare(runSmartOnly(id, SEEDS[0])), id).toBeLessThanOrEqual(savedShare(smart[0]) - 0.08);
    },
    900_000
  );

  it("gives identical results for the same seed", () => {
    expect(runBot("casual", SEEDS[2])).toEqual(casual[2]);
    expect(runBot("greedy", SEEDS[1])).toEqual(greedy[1]);
  });

  it("plays the one real level, three storms a run", () => {
    expect(BOT_LEVEL.id).toBe("l01-first-rains");
    for (const run of casual) expect(run.houses).toHaveLength(3);
  });
});
