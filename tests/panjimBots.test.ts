import { describe, expect, it } from "vitest";
import { BOT_LEVEL, SEEDS, replaySmartWithout, runBot, runSmartOnly, savedShare, smartRun, type BotResult } from "../tools/panjimBots/bots";

/**
 * The Section 4 balance contract, played out by bots on the real rules. The
 * full tables run 20 seeds per archetype (`npm run bots`, kept in
 * docs/qa/section4/bots.md); this unit test plays a few seeds so it stays
 * quick, with bands wide enough for a few seeds' spread round the 20-seed
 * means. Smart is the slow one (it simulates every candidate build), so it
 * plays one seed here.
 */
const FAST = SEEDS.slice(0, 10);
const mean = (rows: BotResult[]): number => rows.reduce((s, r) => s + savedShare(r), 0) / rows.length;
const casual = FAST.map((seed) => runBot("casual", seed));
const greedy = FAST.map((seed) => runBot("greedy", seed));
const rusher = FAST.map((seed) => runBot("rusher", seed));

describe("Panjim bots (Section 4 targets)", () => {
  it("does nothing and saves nothing: the do-nothing player sits at the floor", () => {
    for (const run of rusher) expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.05);
  });

  it("Casual saves roughly a quarter to a third of the houses in the storms' paths", () => {
    expect(mean(casual)).toBeGreaterThanOrEqual(0.18);
    expect(mean(casual)).toBeLessThanOrEqual(0.4);
  });

  it("Greedy swings: sometimes beats Casual on the same seed, sometimes far behind", () => {
    const share = greedy.map(savedShare);
    expect(Math.max(...share) - Math.min(...share)).toBeGreaterThan(0.1);
    expect(greedy.some((g, i) => savedShare(g) >= savedShare(casual[i]))).toBe(true);
  });

  it(
    "Smart saves most of them, but not all; every defence it builds pulls its weight; mangroves alone cannot match it",
    () => {
      const { result: smart, log } = smartRun(SEEDS[0]);
      expect(savedShare(smart)).toBeGreaterThanOrEqual(0.65);
      expect(savedShare(smart)).toBeLessThan(0.95);
      expect(savedShare(smart)).toBeGreaterThan(savedShare(casual[0]));
      // Smart's own run replayed without each defence it built: never better without it.
      for (const id of Object.keys(smart.built).filter((id) => id !== "house")) expect(savedShare(replaySmartWithout(id, SEEDS[0], log)), id).toBeLessThanOrEqual(savedShare(smart) + 1e-9);
      // The strongest single kind (mangroves, docs/qa/section4/bots.md) stays well behind the mix.
      expect(savedShare(runSmartOnly("mangrove", SEEDS[0]))).toBeLessThan(savedShare(smart) - 0.1);
    },
    600_000
  );

  it("gives identical results for the same seed", () => {
    expect(runBot("casual", FAST[2])).toEqual(casual[2]);
    expect(runBot("greedy", FAST[1])).toEqual(greedy[1]);
  });

  it("plays the one real level, at the real coin rate", () => {
    expect(BOT_LEVEL.id).toBe("l01-first-rains");
    for (const run of casual) expect(run.houses).toHaveLength(3);
  });
});
