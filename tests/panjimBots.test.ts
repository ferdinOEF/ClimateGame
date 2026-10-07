import { describe, expect, it } from "vitest";
import { MONOCULTURES, PERSONAS, SEEDS, runBot, type BotResult, type Persona, type Preset } from "../tools/panjimBots/bots";

/**
 * The Panjim 2050 balance contract, played out by bots on the real rules,
 * under both balance presets. If tuning breaks any of these, the build
 * fails. `npm run bots` prints the full tables (docs/PROGRESS.md).
 */
const ALL: Persona[] = [...PERSONAS, ...MONOCULTURES];
function play(preset: Preset): Map<Persona, BotResult[]> {
  return new Map(ALL.map((persona) => [persona, SEEDS.map((seed) => runBot(persona, seed, preset))]));
}
const strict = play("strict");
const easy = play("easy-test");

const threeStarShare = (rows: BotResult[]) => {
  const stars = rows.flatMap((r) => r.stars);
  return stars.filter((s) => s === 3).length / stars.length;
};
const mean = (rows: BotResult[], pick: (r: BotResult) => number) => rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;

describe("Panjim 2050 bots, strict preset (20 seeds per persona)", () => {
  const all = (p: Persona) => strict.get(p)!;

  it("Casual always reaches 2050 with at least one star per challenge", () => {
    for (const run of all("casual")) {
      expect(run.stars).toHaveLength(3);
      for (const s of run.stars) expect(s).toBeGreaterThanOrEqual(1);
    }
  });

  it("Greedy gets three stars in no more than 25% of challenges", () => {
    expect(threeStarShare(all("greedy"))).toBeLessThanOrEqual(0.25);
  });

  it("Smart gets three stars in at least 70% of challenges", () => {
    expect(threeStarShare(all("smart"))).toBeGreaterThanOrEqual(0.7);
  });

  it("Rusher gets at most one star in at least two of the three challenges", () => {
    for (const run of all("rusher")) expect(run.stars.filter((s) => s <= 1).length).toBeGreaterThanOrEqual(2);
  });

  it("Banker never beats Smart's index on the same seed", () => {
    all("banker").forEach((banker, i) => expect(banker.index, banker.seed).toBeLessThanOrEqual(all("smart")[i].index));
  });

  it("gives identical results for the same seed", () => {
    for (const persona of PERSONAS) expect(runBot(persona, SEEDS[3], "strict")).toEqual(all(persona)[3]);
  });

  it("lets no single strategy dominate", () => {
    // Neither one-trick build beats the balanced plan on the index or on
    // total stars; and the money-maker really does out-earn the planner.
    for (const mono of MONOCULTURES) {
      expect(mean(all(mono), (r) => r.index), mono).toBeLessThan(mean(all("smart"), (r) => r.index));
      expect(mean(all(mono), (r) => r.stars.reduce((a, b) => a + b, 0)), mono).toBeLessThanOrEqual(mean(all("smart"), (r) => r.stars.reduce((a, b) => a + b, 0)));
    }
    expect(mean(all("greedy"), (r) => r.components.livelihoods)).toBeGreaterThan(mean(all("smart"), (r) => r.components.livelihoods));
  });

  it("sizes the economy so a careful player makes 40 to 70 meaningful decisions", () => {
    const decisions = all("smart").map((r) => r.decisions).sort((a, b) => a - b);
    const median = decisions[Math.floor(decisions.length / 2)];
    expect(median).toBeGreaterThanOrEqual(40);
    expect(median).toBeLessThanOrEqual(70);
  });
});

describe("Panjim 2050 bots, easy-test preset (20 seeds per persona)", () => {
  const all = (p: Persona) => easy.get(p)!;

  it("Casual gets at least two stars on the first two storms", () => {
    for (const run of all("casual")) {
      expect(run.stars[0], run.seed).toBeGreaterThanOrEqual(2);
      expect(run.stars[1], run.seed).toBeGreaterThanOrEqual(2);
    }
  });

  it("Smart gets three stars on all three storms", () => {
    for (const run of all("smart")) expect(run.stars, run.seed).toEqual([3, 3, 3]);
  });

  it("nobody loses every house in the first two storms", () => {
    for (const persona of ALL) {
      for (const run of all(persona)) {
        expect(run.houses[0].saved, `${persona} ${run.seed}`).toBeGreaterThan(0);
        expect(run.houses[1].saved, `${persona} ${run.seed}`).toBeGreaterThan(0);
      }
    }
  });
});
