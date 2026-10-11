import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { resolveChallenge, ZoneIndex } from "../src/core/zones";
import { computeWater, coneTiles, forecastCone, HAZARD_MODEL, LANDFALL_ZONE, landfallSite, siteAt, waterBoard } from "../src/core/hazardModel";
import { HEAT_LEAD_QUARTERS } from "../src/core/exposure";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID, LEVELS } from "../src/levels/levels";
import { boardSetup } from "../src/levels/balance";
import { BOT_LEVEL, newRun, SEEDS } from "../tools/panjimBots/bots";
import levelsJson from "../src/data/levels.json";

/**
 * Section 4's standing checks: one baseline (the easy-test preset is gone and
 * coin runs at its real rate), the finale is survivable, and the landfall
 * forecast narrows to a bounded jitter. The bot balance tables are in
 * tests/panjimBots.test.ts and docs/qa/section4/bots.md; preview equals
 * resolution in tests/exposure.test.ts; elevation in tests/zones.test.ts.
 */

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("one baseline: the easy-test preset is gone", () => {
  it("no source, tool or level file mentions it, or a coin multiplier", () => {
    const self = join("tests", "section4.test.ts");
    const sources = [...files("src"), ...files("tools").filter((p) => !p.includes(`${join("tools", "mapgen", "dem")}`)), ...files("tests")].filter(
      (p) => /\.(ts|json|tsx|js)$/.test(p) && p !== self
    );
    expect(sources.length).toBeGreaterThan(50);
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      expect(text, path).not.toMatch(/easy[-_ ]?test|easyTest|coin[-_ ]?multiplier|balance[-_ ]?preset|levelWithPreset|applyBalance/i);
    }
  });

  it("levels carry no presets, and the economy pays at its real rate", () => {
    // The keys the removed preset lived under (balancePreset on the level, balancePresets beside it).
    for (const level of levelsJson as Record<string, unknown>[]) for (const key of ["balancePreset", "balancePresets", "presets"]) expect(level).not.toHaveProperty(key);
    for (const level of LEVELS) for (const key of ["balancePreset", "balancePresets", "presets"]) expect(level).not.toHaveProperty(key);
    const run = newRun(SEEDS[0], BOT_LEVEL);
    expect(run.state.coin).toBe(BOT_LEVEL.startingCoin);
    // The jar fills at incomeScale x the board's money: the coin multiplier is 1.
    expect(run.state.income).toBeGreaterThan(0);
    expect(run.incomePerQuarter).toBeCloseTo(run.state.income * BOT_LEVEL.timeline!.economy!.incomeScale, 9);
  });

  it("can afford a first defence on day one, but not everything", () => {
    const level = LEVEL_BY_ID.get("l01-first-rains")!;
    const defences = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"].map((id) => ELEMENT_BY_ID.get(id)!.buildCost);
    expect(level.startingCoin).toBeGreaterThanOrEqual(Math.max(...defences));
    // One of every defence on every tile the first storm wets would cost many times the purse.
    const run = newRun(SEEDS[0], BOT_LEVEL);
    const wet = run.exposureFor(run.nextChallenge()!, true)!;
    let cost = 0;
    for (const key of wet.exposure.keys()) {
      const [q, r] = key.split(",").map(Number);
      const costs = ["dune", "mangrove", "seawall", "breakwater"].filter((id) => run.state.canBuild({ q, r }, id)).map((id) => ELEMENT_BY_ID.get(id)!.buildCost);
      if (costs.length > 0) cost += Math.min(...costs);
    }
    expect(cost).toBeGreaterThan(level.startingCoin * 2);
  });
});

/** Panaji with its town, as the level plays it. */
function panaji(): { state: GameState; zones: ZoneIndex } {
  const map = mapById("panaji")!;
  const state = new GameState(map.tiles, boardSetup(BOT_LEVEL, map).startingElements, 100000);
  state.maturityField = "matureQuarters";
  for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
  return { state, zones: new ZoneIndex(map.zones) };
}

describe("the finale is survivable", () => {
  /**
   * The compound finale at the level's strength (2.6), landing at three
   * points along the coast, met first by nothing and then by a plain plan a
   * player could make with the starting purse (500 coin): working out from
   * the homes the storm would take, a dune on sand, a mangrove on wetland, a
   * dam on the river, cheapest first, grown. No simulation, no search.
   * Section 4 asks for about 40% fewer houses lost.
   */
  const STRENGTH = 2.6;
  const BUDGET = 500;
  const unit = BOT_LEVEL.climate!.intensityPerStrength;
  const rows = [0.3, 0.5, 0.7].map((fraction) => {
    const probe = panaji();
    const site = siteAt(waterBoard(probe.state, probe.zones.keys(LANDFALL_ZONE)), fraction);
    const bare = panaji();
    const undefended = resolveChallenge(bare.state, bare.zones, "compound", STRENGTH * unit, unit, undefined, undefined, undefined, undefined, site);
    const plan = panaji();
    const water = computeWater(plan.state, { kind: "compound", strength: STRENGTH, landfall: site }, { landfallZoneTiles: plan.zones.keys(LANDFALL_ZONE) });
    const homes = undefended.damagedHouses.map((k) => k.split(",").map(Number));
    const distance = (key: string): number => {
      const [q, r] = key.split(",").map(Number);
      return Math.min(...homes.map(([a, b]) => (Math.abs(q - a) + Math.abs(r - b) + Math.abs(q + r - a - b)) / 2));
    };
    let spent = 0;
    for (const key of [...water.depth.keys()].sort((a, b) => distance(a) - distance(b) || (a < b ? -1 : 1))) {
      const [q, r] = key.split(",").map(Number);
      for (const id of ["dune", "mangrove", "small_dam", "khazan"]) {
        const cost = ELEMENT_BY_ID.get(id)!.buildCost;
        if (spent + cost <= BUDGET && plan.state.canBuild({ q, r }, id)) {
          plan.state.build({ q, r }, id, false);
          spent += cost;
          break;
        }
      }
    }
    plan.state.turn = 40;
    const defended = resolveChallenge(plan.state, plan.zones, "compound", STRENGTH * unit, unit, undefined, undefined, undefined, undefined, site);
    return { fraction, site, undefended: undefended.housesDamaged, defended: defended.housesDamaged, spent };
  });

  it("loses about 40% fewer houses when defended (30-50% at each landfall, 35-45% on average)", () => {
    for (const row of rows) {
      expect(row.undefended, `${row.fraction}`).toBeGreaterThan(20);
      expect(row.spent).toBeLessThanOrEqual(BUDGET);
      const fewer = 1 - row.defended / row.undefended;
      expect(fewer, JSON.stringify(row)).toBeGreaterThanOrEqual(0.3);
      expect(fewer, JSON.stringify(row)).toBeLessThanOrEqual(0.5);
    }
    const mean = rows.reduce((s, r) => s + (1 - r.defended / r.undefended), 0) / rows.length;
    expect(mean).toBeGreaterThanOrEqual(0.35);
    expect(mean).toBeLessThanOrEqual(0.45);
  });
});

describe("suspense: the forecast cone", () => {
  it("narrows over the warning to the bounded jitter, and always holds the real landfall", () => {
    const { jitterSites, coneFarSites } = HAZARD_MODEL.landfall;
    expect(jitterSites).toBe(1);
    expect(coneFarSites).toBeGreaterThan(jitterSites);
    for (const seed of SEEDS.slice(0, 10)) {
      const run = newRun(seed, BOT_LEVEL);
      const board = run.board();
      for (const storm of run.schedule.filter((c) => c.kind !== "flood")) {
        const real = landfallSite(board, storm);
        // The real site is within the jitter of the forecast centre.
        expect(storm.landfallOffset!).toBeGreaterThanOrEqual(-jitterSites);
        expect(storm.landfallOffset!).toBeLessThanOrEqual(jitterSites);
        let previous = Infinity;
        for (let q = HEAT_LEAD_QUARTERS; q >= 1; q--) {
          const cone = forecastCone(board, storm, q, HEAT_LEAD_QUARTERS);
          expect(cone.length, `${seed} ${storm.id} at ${q}`).toBeLessThanOrEqual(previous);
          expect(cone).toContain(real);
          previous = cone.length;
        }
        expect(forecastCone(board, storm, 1, HEAT_LEAD_QUARTERS).length).toBeLessThanOrEqual(2 * jitterSites + 1);
        // What the player sees at sea narrows with it, and is open sea round the real landfall.
        const far = coneTiles(board, forecastCone(board, storm, HEAT_LEAD_QUARTERS, HEAT_LEAD_QUARTERS));
        const near = coneTiles(board, forecastCone(board, storm, 1, HEAT_LEAD_QUARTERS));
        expect(near.length).toBeLessThan(far.length);
        expect(near).toContain(board.sites[real]);
        for (const key of far) expect(board.tiles.get(key)!.terrainId).toBe("coast");
        expect(forecastCone(board, storm, 0, HEAT_LEAD_QUARTERS)).toEqual([real]);
      }
    }
  });

  it("escalates: each storm is stronger than the one before, the finale strongest", () => {
    const run = newRun(SEEDS[0], BOT_LEVEL);
    const strengths = run.schedule.map((c) => run.intensityOf(c));
    for (let i = 1; i < strengths.length; i++) expect(strengths[i]).toBeGreaterThan(strengths[i - 1]);
  });
});
