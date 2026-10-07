import { describe, expect, it } from "vitest";
import { MONOCULTURES, PERSONAS, SEEDS, runBot, type BotResult, type Persona } from "../tools/panjimBots/bots";

/**
 * The Panjim 2050 balance contract, played out by bots on the real rules.
 * If tuning breaks any of these, the build fails. `npm run bots` prints the
 * full tables (docs/PROGRESS.md, P9).
 */
const results = new Map<Persona, BotResult[]>([...PERSONAS, ...MONOCULTURES].map((persona) => [persona, SEEDS.map((seed) => runBot(persona, seed))]));
const all = (persona: Persona) => results.get(persona)!;
const threeStarShare = (persona: Persona) => {
  const stars = all(persona).flatMap((r) => r.stars);
  return stars.filter((s) => s === 3).length / stars.length;
};

describe("Panjim 2050 bots (20 seeds per persona)", () => {
  it("Casual always reaches 2050 with at least one star per challenge", () => {
    for (const run of all("casual")) {
      expect(run.stars).toHaveLength(3);
      for (const s of run.stars) expect(s).toBeGreaterThanOrEqual(1);
    }
  });

  it("Greedy gets three stars in no more than 25% of challenges", () => {
    expect(threeStarShare("greedy")).toBeLessThanOrEqual(0.25);
  });

  it("Smart gets three stars in at least 70% of challenges", () => {
    expect(threeStarShare("smart")).toBeGreaterThanOrEqual(0.7);
  });

  it("Rusher gets at most one star in at least two of the three challenges", () => {
    for (const run of all("rusher")) expect(run.stars.filter((s) => s <= 1).length).toBeGreaterThanOrEqual(2);
  });

  it("Banker never beats Smart's index on the same seed", () => {
    const smart = all("smart");
    all("banker").forEach((banker, i) => expect(banker.index, banker.seed).toBeLessThanOrEqual(smart[i].index));
  });

  it("gives identical results for the same seed", () => {
    for (const persona of PERSONAS) expect(runBot(persona, SEEDS[3])).toEqual(all(persona)[3]);
  });

  it("lets no single strategy dominate", () => {
    // No one-trick build matches the balanced plan: walls-only and
    // mangroves-only both score below Smart, while each still earns some
    // three-star storms, so neither is a dead end either.
    const meanIndex = (persona: Persona) => all(persona).reduce((sum, r) => sum + r.index, 0) / SEEDS.length;
    for (const mono of MONOCULTURES) {
      expect(meanIndex(mono), mono).toBeLessThan(meanIndex("smart"));
      expect(threeStarShare(mono), mono).toBeLessThan(threeStarShare("smart"));
      expect(threeStarShare(mono), mono).toBeGreaterThan(0);
    }
    // And the money-maker really does make more money than the planner.
    const livelihoods = (persona: Persona) => all(persona).reduce((sum, r) => sum + r.components.livelihoods, 0) / SEEDS.length;
    expect(livelihoods("greedy")).toBeGreaterThan(livelihoods("smart"));
  });

  it("sizes the economy so a careful player makes 40 to 70 meaningful decisions", () => {
    const decisions = all("smart").map((r) => r.decisions).sort((a, b) => a - b);
    const median = decisions[Math.floor(decisions.length / 2)];
    expect(median).toBeGreaterThanOrEqual(40);
    expect(median).toBeLessThanOrEqual(70);
  });
});
