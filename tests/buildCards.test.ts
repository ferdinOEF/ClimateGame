import { describe, expect, it } from "vitest";
import { passYear } from "./helpers/passYear";
import { axialDistance } from "../src/core/hex";
import type { ActionRun } from "../src/core/actionRun";
import { BOT_LEVEL, newRun, smartRun } from "../tools/panjimBots/bots";

/**
 * Section 13.1: the model's number for a build (once the build menu's "Protects N homes here"; Section 17.1 took it
 * off the card, and the float after a build and the objectives still use it) is exact. For 20
 * tiles across 3 boards (a Smart bot's run, stopped in each of the three
 * phases), the number on the card equals what the storm then does: the homes
 * it takes if nothing is built there, minus the homes it takes with that
 * defence built there and nothing else changed.
 */
const DEFENCES = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"];

/** A small seeded generator, so the tiles are random but the test is repeatable. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A Smart bot's board at `turn`. */
function boardAt(seed: string, turn: number): ActionRun {
  const { log } = smartRun(seed);
  const run = newRun(seed, BOT_LEVEL);
  for (const action of log) {
    if (run.turnNumber >= turn) break;
    if (action.type === "build") expect(run.build(action.coord, action.elementId).ok).toBe(true);
    else passYear(run);
  }
  while (run.turnNumber < turn) passYear(run);
  return run;
}

/** Homes the next storm takes from this board, after `act` (or nothing) this year. */
function stormToll(from: ActionRun, act: ((run: ActionRun) => void) | null): number {
  const run = newRun("copy", BOT_LEVEL);
  run.restore(from.snapshot());
  const storm = run.nextChallenge()!;
  if (act) act(run);
  else passYear(run);
  while (!run.landed.has(storm.id)) passYear(run);
  return run.outcomes.get(storm.id)!.housesDamaged;
}

describe("build cards: the number is the counterfactual", () => {
  const cases: [string, number, number][] = [
    // Section 16.4: phase 1's board before Smart's first build. After it (turn 2) only the creek homes behind the
    // school are at risk, which only a build at the landfall saves, so random tiles near them all read 0.
    ["bot-seed-1", 1, 7],
    ["bot-seed-2", 8, 7],
    ["bot-seed-3", 19, 6]
  ];
  for (const [seed, turn, count] of cases) {
    it(`${seed}, turn ${turn}: ${count} random tiles near the homes at risk`, () => {
      const run = boardAt(seed, turn);
      const storm = run.nextChallenge()!;
      const atRisk = (run.exposureFor(storm)?.housesAtRisk ?? []).map((key) => {
        const [q, r] = key.split(",").map(Number);
        return { q, r };
      });
      const options: { q: number; r: number; elementId: string }[] = [];
      for (const tile of run.state.placed.values()) {
        const near = atRisk.some((h) => axialDistance(h, tile.coord) <= 3);
        if (!near) continue;
        for (const elementId of DEFENCES) if (run.state.canBuild(tile.coord, elementId)) options.push({ ...tile.coord, elementId });
      }
      const pick = rng(turn * 7919);
      const chosen = new Set<number>();
      while (chosen.size < Math.min(count, options.length)) chosen.add(Math.floor(pick() * options.length));
      const without = stormToll(run, null);
      let nonZero = 0;
      const timed: { label: string; ms: number }[] = [];
      for (const index of chosen) {
        const { q, r, elementId } = options[index];
        const started = performance.now();
        const card = run.homesSavedBy(storm, { q, r }, elementId)!;
        timed.push({ label: `${elementId} at ${q},${r}`, ms: performance.now() - started });
        const withIt = stormToll(run, (copy) => expect(copy.build({ q, r }, elementId).ok).toBe(true));
        expect(card, `${elementId} at ${q},${r}`).toBe(without - withIt);
        if (card !== 0) nonZero++;
      }
      // A run of zeros would prove little.
      expect(nonZero).toBeGreaterThan(0);
      // A coarse guard on the model's speed, on the median card rather than each one: alone a card takes 4 to 33 ms, but
      // with the whole suite sharing the cores a single card can stall past 200 ms (seen at 231), which is noise, not
      // the model. The first card also fills the board's own cache.
      const median = timed.map((t) => t.ms).sort((a, b) => a - b)[Math.floor(timed.length / 2)];
      expect(median, `the median card's number (${timed.map((t) => `${t.label} ${t.ms.toFixed(0)} ms`).join(", ")})`).toBeLessThan(100);
    }, 300_000);
  }
});
