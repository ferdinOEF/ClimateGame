import { describe, expect, it } from "vitest";
import { BOT_LEVEL, SEEDS, newRun, replaySmartWithout, runBot, runSmartOnly, savedShare, smartRun, type BotResult } from "../tools/panjimBots/bots";
import type { LevelDef } from "../src/levels/levels";

/**
 * The bots on the real rules (Section 10: 25 builds, one a year). Each
 * archetype sees only what the screen shows and builds every year. These pin
 * the measured balance over the 20 bot seeds (docs/qa/section11/bots.md, on
 * the owner's edited board), with some room. How a run is "won" is the owner's to define later, so no
 * win rate is pinned here.
 */
const casual = SEEDS.map((seed) => runBot("casual", seed));
const greedy = SEEDS.map((seed) => runBot("greedy", seed));
const far = SEEDS.map((seed) => runBot("far", seed));
const mean = (runs: BotResult[]): number => runs.reduce((s, r) => s + savedShare(r), 0) / runs.length;

describe("Panjim bots, 25 builds", () => {
  // Section 41.3 (owner decision): two khazans and a mangrove stand on the board from the first turn and protect as
  // built ones do. A player who builds only far from the risk saves what they save and no more: the same share on
  // every seed (20%: 14 of 56 homes in 2040, 4 of 24 in 2050), and nothing at all on the same board without them.
  it("building only far from the risk saves nothing beyond what the nature standing at the start saves", () => {
    const bare: LevelDef = { ...BOT_LEVEL, standingDefences: [] };
    for (const seed of SEEDS.slice(0, 5)) expect(savedShare(runBot("far", seed, bare)), seed).toBeLessThanOrEqual(0.02);
    for (const run of far) {
      expect(savedShare(run), run.seed).toBe(savedShare(far[0]));
      expect(run.houses[0].saved, run.seed).toBe(0);
    }
    expect(savedShare(far[0])).toBeGreaterThan(0.1);
    expect(savedShare(far[0])).toBeLessThan(0.3);
  });

  // Section 19: with the east edge out of Panjim (owner decision) fewer homes are in the storms' paths.
  // Section 21.2: the flood (2.35) and the 2050 storm (3.8) are stronger, so building by eye on the forecast saved
  // 29-55% of the homes over a run (mean 41%). Section 22.4 (owner decisions): a storm counts against the homes still
  // standing when it hit, and the 2050 storm is 3.0: Casual saves 54-76% (mean 62%): the band is 50-80%.
  // Section 25.1: dunes and khazans pair up (two side by side hold like a seawall or a small dam), so a player building
  // by eye beside the red homes saves a little more: one seed of twenty reaches 81%. The ceiling is 85%.
  // Section 41 (owner decisions: a milder first cyclone, seawalls that hold the river in 2050, nature standing at the
  // start, so that a perfect plan saves every home): Casual saves 68-85% (mean 74%). The band is 60-92%.
  it("building by eye on what the forecast shows saves more than half the homes (Casual 60-92%)", () => {
    for (const run of casual) {
      expect(savedShare(run), run.seed).toBeGreaterThanOrEqual(0.6);
      expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.92);
    }
  });

  // Section 21.2: with the stronger flood and 2050 storm both save fewer homes; Casual's lead is 20 points (from
  // more), so the bar is 15.
  it("ignoring the forecast is a gamble: Greedy swings at least 25 points and always does worse than Casual on average", () => {
    const shares = greedy.map(savedShare);
    expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThanOrEqual(0.25);
    expect(mean(greedy)).toBeLessThan(mean(casual) - 0.15);
  });

  it("builds every year: no year is ever skipped, 25 builds a run", () => {
    for (const run of [...casual, ...greedy, ...far]) {
      expect(run.yearsSkipped, `${run.persona} ${run.seed}`).toBe(0);
      expect(run.decisions, `${run.persona} ${run.seed}`).toBe(25);
    }
  });

  it(
    "choosing the right tiles pays (Smart at least 5 points ahead of Casual), every defence pulls its weight, and none comes near the mix alone",
    () => {
      const seeds = SEEDS.slice(0, 6);
      const runs = seeds.map((seed) => smartRun(seed));
      const smart = runs.map((r) => r.result);
      expect(mean(smart)).toBeGreaterThanOrEqual(mean(casual.slice(0, 6)) + 0.05);
      // Smart's own runs replayed without each defence it built: never better without it, and over six seeds every one counts.
      // The beach plantings (dune, pandanus) meet only the first cyclone, which other defences can also clear alone,
      // so their margin is small (1-2 points); the rest must give at least 2 points on average.
      const beach = new Set(["dune", "sandy_vegetation"]);
      const ids = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"];
      for (const id of ids) {
        let margin = 0;
        for (const [i, seed] of seeds.entries()) {
          const without = savedShare(replaySmartWithout(id, seed, runs[i].log));
          // Section 41: a seawall may cost a home at its end (Section 25.1's rule: it pushes water onto the land beside
          // each end, and at Campal's shore the 2050 wind does the rest). On one seed of six Smart's late seawall there
          // does: one home (under 0.01 of the run). Every other defence is never better left out.
          expect(without, `${id} ${seed}`).toBeLessThanOrEqual(savedShare(smart[i]) + (id === "seawall" ? 0.01 : 1e-9));
          margin += savedShare(smart[i]) - without;
        }
        // Section 30: since mangroves left the river tiles (30.2), Smart opens 2030 with seawalls and breakwaters, and
        // the dunes it adds after them hold nothing more; a dune's own weight is checked below, on the board.
        if (id === "dune") expect(margin, id).toBeGreaterThanOrEqual(0);
        else expect(margin, id).toBeGreaterThan(0);
        if (!beach.has(id)) expect(margin / seeds.length, id).toBeGreaterThanOrEqual(0.02);
      }
      // A dune in front of Sharada Mandir School, first: it takes homes out of the 2030 cyclone's way.
      const bare = newRun("dune-weight", BOT_LEVEL);
      expect(bare.homesSavedBy(bare.nextChallenge()!, { q: -4, r: 18 }, "dune")!).toBeGreaterThan(0);
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
