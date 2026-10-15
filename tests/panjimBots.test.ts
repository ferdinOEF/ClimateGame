import { describe, expect, it } from "vitest";
import { BOT_LEVEL, SEEDS, replaySmartWithout, runBot, savedShare, smartRun } from "../tools/panjimBots/bots";

/**
 * The bots on the real rules: one build a year (Section 8), each archetype
 * seeing only what the screen shows. Section 8 changes the number of builds
 * from 100 to 25, which moves every number; Section 10 re-tunes for it and
 * restores the balance bands. Until then this keeps what must hold whatever
 * the tuning: building only far from the storms saves nothing, reading the
 * forecast beats guessing, every defence Smart builds pulls its weight, no
 * year is ever skipped, and runs are deterministic.
 */
const FAST = SEEDS.slice(0, 10);
const casual = FAST.map((seed) => runBot("casual", seed));
const greedy = FAST.map((seed) => runBot("greedy", seed));
const rusher = FAST.map((seed) => runBot("rusher", seed));

describe("Panjim bots, one build a year", () => {
  it("building only far from every storm saves nothing", () => {
    for (const run of rusher) expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.05);
  });

  it("builds every year: no year is ever skipped, 25 builds a run", () => {
    for (const run of [...casual, ...greedy, ...rusher]) {
      expect(run.yearsSkipped, `${run.persona} ${run.seed}`).toBe(0);
      expect(run.decisions, `${run.persona} ${run.seed}`).toBe(25);
    }
  });

  it(
    "Smart beats doing it by eye, and every defence it builds pulls its weight",
    () => {
      const { result: smart, log } = smartRun(SEEDS[0]);
      expect(savedShare(smart)).toBeGreaterThan(savedShare(rusher[0]));
      const mean = casual.reduce((s, r) => s + savedShare(r), 0) / casual.length;
      expect(savedShare(smart)).toBeGreaterThanOrEqual(mean);
      for (const id of Object.keys(smart.built)) expect(savedShare(replaySmartWithout(id, SEEDS[0], log)), id).toBeLessThanOrEqual(savedShare(smart) + 1e-9);
    },
    600_000
  );

  it("gives identical results for the same seed", () => {
    expect(runBot("casual", FAST[2])).toEqual(casual[2]);
    expect(runBot("greedy", FAST[1])).toEqual(greedy[1]);
  });

  it("plays the one real level, three storms a run", () => {
    expect(BOT_LEVEL.id).toBe("l01-first-rains");
    for (const run of casual) expect(run.houses).toHaveLength(3);
  });
});
