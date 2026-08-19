import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveMonsoonFlood, resolveCyclone } from "../src/core/hazard";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Category = "nbs" | "engineered" | "hybrid";

const CATEGORY_DEFENSE_IDS: Record<Category, string[]> = {
  nbs: ["mangrove_buffer", "riparian_forest_buffer", "coastal_dune_windbreak"],
  engineered: ["river_embankment", "seawall"],
  hybrid: ["khazan"]
};

const HAZARD_SCHEDULE = [
  { turn: 10, kind: "flood" as const, severity: 1.3 },
  { turn: 18, kind: "cyclone" as const, severity: 1.3 },
  { turn: 28, kind: "flood" as const, severity: 1.5 },
  { turn: 36, kind: "cyclone" as const, severity: 1.5 },
  { turn: 46, kind: "flood" as const, severity: 1.4 }
];

interface PlaythroughResult {
  trust: number;
  coinRemaining: number;
  totalDamage: number;
  defensesBuilt: number;
}

/**
 * Same seed -> identical tile layout and hand draws across all three runs
 * (defense choices never consume the RNG), so the only thing that varies is
 * which defense category gets built. A fair, controlled comparison.
 */
function runScriptedPlaythrough(category: Category, seed: number): PlaythroughResult {
  const rng = mulberry32(seed);
  const state = new GameState({ coord: { q: 0, r: 0 }, terrainId: "estuary" }, rng);
  state.coin = 2000; // ample budget so category choice, not affordability, drives the outcome

  const preferredIds = new Set(CATEGORY_DEFENSE_IDS[category]);
  let totalDamage = 0;
  let hazardIndex = 0;
  let defensesBuilt = 0;

  for (let i = 0; i < 55; i++) {
    const handIdx = state.hand.findIndex((t) => state.legalFrontierFor(t).length > 0);
    if (handIdx === -1) break;
    const coord = state.legalFrontierFor(state.hand[handIdx])[0];
    state.placeFromHand(handIdx, coord);

    const options = state.buildableDefensesAt(coord).filter((d) => preferredIds.has(d.id));
    const affordable = options.find((d) => d.buildCost <= state.coin);
    if (affordable && state.buildDefense(coord, affordable.id)) defensesBuilt++;

    while (hazardIndex < HAZARD_SCHEDULE.length && state.turn >= HAZARD_SCHEDULE[hazardIndex].turn) {
      const h = HAZARD_SCHEDULE[hazardIndex++];
      const result = h.kind === "flood" ? resolveMonsoonFlood(state, h.severity) : resolveCyclone(state, h.severity);
      for (const d of result.tileDamage.values()) totalDamage += d;
    }
  }

  return { trust: state.trust, coinRemaining: state.coin, totalDamage, defensesBuilt };
}

describe("Defense category balance (Phase 4 DoD: no landslide winner)", () => {
  it("NBS, engineered, and khazan-heavy playthroughs all survive with broadly comparable outcomes", () => {
    const seed = 2024;
    const results: Record<Category, PlaythroughResult> = {
      nbs: runScriptedPlaythrough("nbs", seed),
      engineered: runScriptedPlaythrough("engineered", seed),
      hybrid: runScriptedPlaythrough("hybrid", seed)
    };

    // eslint-disable-next-line no-console
    console.log("Balance check (same seed, same hazard schedule):", results);

    for (const [category, r] of Object.entries(results)) {
      expect(r.defensesBuilt, `${category} run should have actually built defenses`).toBeGreaterThan(0);
    }

    // This harness builds no town buildings, so Trust (which only reacts to
    // *damaged buildings*, per Cyclone Shelter's design) never actually
    // engages here — all three land on the starting value. The real signal
    // in this test is cumulative tile damage taken, which is what's asserted.
    const damageValues = Object.values(results).map((r) => r.totalDamage);
    const spread = Math.max(...damageValues) - Math.min(...damageValues);
    const min = Math.min(...damageValues);
    // A landslide would look like one category taking a small fraction of
    // another's damage. Requiring the spread stay under the smallest run's
    // own total is a loose "same order of magnitude" bar, not "identical."
    expect(spread, `Damage spread across categories was ${spread} (values: ${damageValues}) — investigate if this looks like a landslide`).toBeLessThan(min);
  });
});
