import { describe, expect, it } from "vitest";
import { BOT_LEVEL, SEEDS, replaySmartWithout, runBot, savedShare, smartRun } from "../tools/panjimBots/bots";

/**
 * The bots on the real rules. Section 5 replaced the quarterly clock and its
 * economy with yearly turns, coins off and instant defences, which moves
 * every number; Section 7 re-tunes for it and restores the balance bands
 * (Casual, Smart, Greedy, the finale). Until then this keeps what must hold
 * whatever the tuning: doing nothing saves nothing, reading the warning beats
 * guessing, every defence Smart builds pulls its weight, and runs are
 * deterministic. Smart plays one seed here (it simulates every candidate).
 */
const FAST = SEEDS.slice(0, 10);
const casual = FAST.map((seed) => runBot("casual", seed));
const greedy = FAST.map((seed) => runBot("greedy", seed));
const rusher = FAST.map((seed) => runBot("rusher", seed));

describe("Panjim bots", () => {
  it("does nothing and saves nothing: the do-nothing player sits at the floor", () => {
    for (const run of rusher) expect(savedShare(run), run.seed).toBeLessThanOrEqual(0.05);
  });

  it("everyone else saves some houses", () => {
    for (const run of [...casual, ...greedy]) expect(savedShare(run), `${run.persona} ${run.seed}`).toBeGreaterThan(0);
  });

  it(
    "Smart beats Casual, and every defence it builds pulls its weight",
    () => {
      const { result: smart, log } = smartRun(SEEDS[0]);
      expect(savedShare(smart)).toBeGreaterThan(savedShare(casual[0]));
      // Smart's own run replayed without each defence it built: never better without it.
      for (const id of Object.keys(smart.built).filter((id) => id !== "house")) expect(savedShare(replaySmartWithout(id, SEEDS[0], log)), id).toBeLessThanOrEqual(savedShare(smart) + 1e-9);
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
