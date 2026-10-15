import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveChallenge, ZoneIndex } from "../src/core/zones";
import { computeWater, LANDFALL_ZONE, landfallSite, siteAt, waterBoard } from "../src/core/hazardModel";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID, LEVELS } from "../src/levels/levels";
import { boardSetup } from "../src/levels/balance";
import { BOT_LEVEL, newRun, SEEDS } from "../tools/panjimBots/bots";
import levelsJson from "../src/data/levels.json";

/**
 * Section 4's standing checks, as they stand after Section 5: one baseline
 * (the easy-test preset is gone), the finale is survivable, and the landfall
 * is fixed (Section 5 removed the seeded jitter and the narrowing cone). The bot balance tables are in
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

  it("levels carry no presets, and the economy (kept for later) pays at its real rate", () => {
    // The keys the removed preset lived under (balancePreset on the level, balancePresets beside it).
    for (const level of levelsJson as Record<string, unknown>[]) for (const key of ["balancePreset", "balancePresets", "presets"]) expect(level).not.toHaveProperty(key);
    for (const level of LEVELS) for (const key of ["balancePreset", "balancePresets", "presets"]) expect(level).not.toHaveProperty(key);
    const run = newRun(SEEDS[0], BOT_LEVEL);
    expect(run.state.coin).toBe(BOT_LEVEL.startingCoin);
    // The jar fills at incomeScale x the board's money: the coin multiplier is 1.
    expect(run.state.income).toBeGreaterThan(0);
    expect(run.income).toBeCloseTo(run.state.income * BOT_LEVEL.economy!.incomeScale!, 9);
  });

  it("with coins off, the builds per year still keep the player from doing everything", () => {
    const level = LEVEL_BY_ID.get("l01-first-rains")!;
    // A defence on every tile the first storm wets takes more builds than the years before it allow.
    const run = newRun(SEEDS[0], BOT_LEVEL);
    const first = run.nextChallenge()!;
    const wet = run.exposureFor(first, true)!;
    let buildable = 0;
    for (const key of wet.exposure.keys()) {
      const [q, r] = key.split(",").map(Number);
      if (["dune", "mangrove", "seawall", "breakwater"].some((id) => run.state.canBuild({ q, r }, id))) buildable++;
    }
    expect(buildable).toBeGreaterThan(first.turn);
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
   * points along the coast, met first by nothing and then by a plain plan of
   * 20 builds (five years at the level's 4 a year; coins are off since
   * Section 5): working out from the homes the storm would take, a dune on
   * sand, a mangrove on wetland, a dam on the river, a khazan. No simulation,
   * no search. The brief asks for about 40% fewer houses lost.
   */
  const STRENGTH = 2.6;
  const BUILDS = 20;
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
    let builds = 0;
    for (const key of [...water.depth.keys()].sort((a, b) => distance(a) - distance(b) || (a < b ? -1 : 1))) {
      const [q, r] = key.split(",").map(Number);
      for (const id of ["dune", "mangrove", "small_dam", "khazan"]) {
        if (builds < BUILDS && plan.state.canBuild({ q, r }, id)) {
          plan.state.build({ q, r }, id, false);
          builds++;
          break;
        }
      }
    }
    plan.state.turn = 40;
    const defended = resolveChallenge(plan.state, plan.zones, "compound", STRENGTH * unit, unit, undefined, undefined, undefined, undefined, site);
    return { fraction, site, undefended: undefended.housesDamaged, defended: defended.housesDamaged, builds };
  });

  it("loses about 40% fewer houses when defended (30-50% at each landfall, 35-45% on average)", () => {
    for (const row of rows) {
      expect(row.undefended, `${row.fraction}`).toBeGreaterThan(20);
      expect(row.builds).toBe(BUILDS);
      const fewer = 1 - row.defended / row.undefended;
      expect(fewer, JSON.stringify(row)).toBeGreaterThanOrEqual(0.3);
      expect(fewer, JSON.stringify(row)).toBeLessThanOrEqual(0.5);
    }
    const mean = rows.reduce((s, r) => s + (1 - r.defended / r.undefended), 0) / rows.length;
    expect(mean).toBeGreaterThanOrEqual(0.35);
    expect(mean).toBeLessThanOrEqual(0.45);
  });
});

describe("the storms (Section 5: fixed, no suspense from chance)", () => {
  it("come ashore at their fixed landfall: a real landfall site on the open coast, the same on every seed", () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const run = newRun(seed, BOT_LEVEL);
      const board = run.board();
      for (const storm of run.schedule.filter((c) => c.kind !== "flood")) {
        const site = landfallSite(board, storm);
        expect(board.sites[site], storm.id).toBe(storm.landfall);
        expect(board.tiles.get(board.sites[site])!.terrainId).toBe("coast");
        expect(run.landfallOf(storm)).toBe(site);
      }
    }
  });

  it("escalates: each storm is stronger than the one before, the finale strongest", () => {
    const run = newRun(SEEDS[0], BOT_LEVEL);
    const strengths = run.schedule.map((c) => run.intensityOf(c));
    for (let i = 1; i < strengths.length; i++) expect(strengths[i]).toBeGreaterThan(strengths[i - 1]);
  });
});
