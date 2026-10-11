import { describe, expect, it } from "vitest";
import { heatRamp, tileHeat, computeExposure, protectedTiles, buildHeatView, HEAT_LEAD_QUARTERS } from "../src/core/exposure";
import { resolveChallenge } from "../src/core/zones";
import { computeWater, landfallSite } from "../src/core/hazardModel";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import type { ActionRun } from "../src/core/actionRun";

/**
 * The warning heat is information only, and it has to be true. These tests
 * play the real Panaji run and compare what the heat previewed with what the
 * storm then did, on the same seed (see "preview equals resolution" below
 * for the rule and its tolerance).
 */
describe("heat ramp", () => {
  it("ramps linearly from 5% five quarters out to 50% on the last quarter", () => {
    expect([5, 4, 3, 2, 1].map((q) => Number(heatRamp(q).toFixed(4)))).toEqual([0.05, 0.1625, 0.275, 0.3875, 0.5]);
    expect(heatRamp(6)).toBe(0);
    expect(heatRamp(0)).toBe(0);
    expect(HEAT_LEAD_QUARTERS).toBe(5);
  });

  it("scales by exposure and never exceeds 50%", () => {
    expect(tileHeat(1, 1)).toBe(0.5);
    expect(tileHeat(1, 0.5)).toBe(0.25);
    expect(tileHeat(1, 0.01)).toBe(0);
    for (let q = 0; q <= 8; q++) for (const e of [0, 0.3, 1]) expect(tileHeat(q, e)).toBeLessThanOrEqual(0.5);
  });
});

/** Plays to `quartersBefore` the next storm, building `plant` (zone, element) pairs on the way if given. */
function approach(run: ActionRun, quartersBefore: number, plant: [string, string][] = []): void {
  const next = run.nextChallenge()!;
  while (run.quartersUntil(next) - 4 >= Math.max(quartersBefore, 1) + plant.length * 2) run.fastForwardYear();
  for (const [zoneId, elementId] of plant) {
    run.collectJar();
    for (const key of run.zones!.keys(zoneId)) {
      const [q, r] = key.split(",").map(Number);
      if (run.state.canBuild({ q, r }, elementId) && run.state.coin >= 100) {
        run.build({ q, r }, elementId);
        break;
      }
    }
  }
  // Then wait out the rest, to exactly `quartersBefore` (the warning's last quarter when 1).
  const left = run.quartersUntil(next);
  if (left > quartersBefore) run.waitQuarters(left - quartersBefore);
}

function land(run: ActionRun): ReturnType<typeof run.outcomes.get> {
  const next = run.nextChallenge()!;
  while (!run.landed.has(next.id)) run.fastForwardYear();
  return run.outcomes.get(next.id);
}

const SEEDS = ["panjim", "s1", "s7", "s13", "s21", "s34"];
/**
 * PREVIEW EQUALS RESOLUTION (Section 4.5). The heat on the last quarter
 * before a storm is the worst case over the forecast cone, which by then is
 * the real landfall site ± `jitterSites`. The rule:
 *   - no miss: every house the storm takes was shown at risk;
 *   - bounded over-call: at most OVERCALL of the houses shown at risk stand
 *     (the cone's width; a player who defends the whole red is never caught
 *     out, and is not asked to defend much more than the storm takes);
 *   - exact at the real site: the same preview, at the real landfall, is
 *     exactly the houses lost.
 */
const OVERCALL = 0.5;

/** The board as it will stand when `next` lands (defences grown to that date), as the resolver sees it. */
function onTheDay(run: ActionRun, next: NonNullable<ReturnType<ActionRun["nextChallenge"]>>) {
  const board = run.state.clone();
  board.turn = Math.max(run.quarter, next.quarter);
  return board;
}

function realSite(run: ActionRun, next: NonNullable<ReturnType<ActionRun["nextChallenge"]>>): number[] | null {
  return next.kind === "flood" ? null : [landfallSite(run.board(), next)];
}

describe("computeExposure matches the storm it previews (preview equals resolution)", () => {
  for (const seed of SEEDS) {
    it(`${seed}: undefended, every storm`, () => {
      const run = newRun(seed, BOT_LEVEL);
      for (let i = 0; i < 3; i++) {
        approach(run, 1);
        const next = run.nextChallenge()!;
        const preview = run.exposureFor(next)!;
        const exact = computeExposure(onTheDay(run, next), run.zones!, next.kind, run.intensityOf(next), run.climate!.intensityPerStrength, {
          combos: run.combos,
          houseRule: run.houseRule,
          houseStars: run.houseStars,
          landfallSites: realSite(run, next)
        });
        const outcome = land(run)!;
        const shown = new Set(preview.housesAtRisk);
        for (const key of outcome.damagedHouses) expect(shown.has(key), `${seed} storm ${i + 1}: ${key} lost but not warned of`).toBe(true);
        expect(shown.size === 0 ? 0 : 1 - outcome.damagedHouses.length / shown.size).toBeLessThanOrEqual(OVERCALL);
        expect([...exact.housesAtRisk].sort()).toEqual([...outcome.damagedHouses].sort());
        // Every lost house was previewed at full exposure.
        for (const key of outcome.damagedHouses) expect(preview.exposure.get(key)).toBe(1);
      }
    });

    it(`${seed}: with defences planted inside the warning window`, () => {
      const run = newRun(seed, BOT_LEVEL);
      approach(run, 5, [["z1", "dune"], ["z1", "sandy_vegetation"], ["z2", "mangrove"]]);
      approach(run, 1);
      const next = run.nextChallenge()!;
      const preview = run.exposureFor(next)!;
      const exact = computeExposure(onTheDay(run, next), run.zones!, next.kind, run.intensityOf(next), run.climate!.intensityPerStrength, {
        combos: run.combos,
        houseRule: run.houseRule,
        houseStars: run.houseStars,
        landfallSites: realSite(run, next)
      });
      const outcome = land(run)!;
      const shown = new Set(preview.housesAtRisk);
      for (const key of outcome.damagedHouses) expect(shown.has(key)).toBe(true);
      expect([...exact.housesAtRisk].sort()).toEqual([...outcome.damagedHouses].sort());
    });
  }
});

describe("computeExposure", () => {
  it("never changes the outcome: the probe only reads", () => {
    const a = newRun("panjim", BOT_LEVEL);
    const b = newRun("panjim", BOT_LEVEL);
    const next = a.nextChallenge()!;
    const intensity = a.intensityOf(next);
    const unit = a.climate!.intensityPerStrength;
    const withProbe = resolveChallenge(a.state.clone(), a.zones!, next.kind, intensity, unit, a.combos, a.houseStars, a.houseRule, () => {});
    const without = resolveChallenge(b.state.clone(), b.zones!, next.kind, intensity, unit, b.combos, b.houseStars, b.houseRule);
    expect(withProbe).toEqual(without);
  });

  it("leaves the real board untouched", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const before = JSON.stringify([...run.state.elements]);
    run.exposureFor(run.nextChallenge()!);
    run.exposureFor(run.nextChallenge()!, true);
    expect(JSON.stringify([...run.state.elements])).toBe(before);
  });

  it("marks tiles a defence protected, and only those", () => {
    const run = newRun("panjim", BOT_LEVEL);
    approach(run, 5, [["z1", "dune"], ["z1", "dune"], ["z1", "sandy_vegetation"]]);
    const next = run.nextChallenge()!;
    const now = run.exposureFor(next)!;
    const bare = run.exposureFor(next, true)!;
    const shielded = protectedTiles(now, bare);
    for (const key of shielded) expect((bare.exposure.get(key) ?? 0) - (now.exposure.get(key) ?? 0)).toBeGreaterThanOrEqual(0.15);
    // With no defences built, nothing is protected.
    const fresh = newRun("panjim", BOT_LEVEL);
    const c = fresh.nextChallenge()!;
    expect(protectedTiles(fresh.exposureFor(c)!, fresh.exposureFor(c, true)!)).toEqual([]);
  });

  it("covers only tiles the water reaches", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const next = run.nextChallenge()!;
    const preview = computeExposure(run.state, run.zones!, "cyclone", 100, 50, { houseRule: run.houseRule, landfallSites: [3] });
    const water = computeWater(run.state, { kind: "cyclone", strength: 2, landfall: 3 }, { landfallZoneTiles: run.zones!.keys("z1") });
    for (const key of preview.exposure.keys()) expect(water.depth.has(key)).toBe(true);
    expect(next.kind).toBe("cyclone");
  });
});

describe("buildHeatView", () => {
  it("heats only dry tiles, hatches above 30%, pulses at most 24 falling houses, and shields defences", () => {
    const run = newRun("s7", BOT_LEVEL);
    approach(run, 3);
    const next = run.nextChallenge()!;
    // Two dunes on beach the storm would reach.
    const reach = run.exposureFor(next, true)!;
    run.collectJar();
    let planted = 0;
    for (const key of reach.exposure.keys()) {
      const [q, r] = key.split(",").map(Number);
      if (planted < 2 && run.state.canBuild({ q, r }, "dune") && run.build({ q, r }, "dune").ok) planted++;
    }
    expect(planted).toBe(2);
    const now = run.exposureFor(next)!;
    const bare = run.exposureFor(next, true)!;
    const terrain = new Map([...run.state.placed.values()].map((t) => [`${t.coord.q},${t.coord.r}`, t.terrainId]));
    const defences = [...run.state.elements].filter(([, inst]) => inst.elementId === "dune").map(([key]) => key);
    const quarters = run.quartersUntil(next);
    const view = buildHeatView(now, bare, quarters, defences, (key) => terrain.get(key));
    expect(view.length).toBeGreaterThan(0);
    for (const tile of view) {
      if (tile.heat > 0) expect(["land", "beach", "estuary"]).toContain(terrain.get(tile.key));
      expect(tile.heat).toBeLessThanOrEqual(0.5);
      expect(tile.hatch).toBe(tile.heat > 0.3);
    }
    expect(view.filter((t) => t.pulse).length).toBeLessThanOrEqual(24);
    const atRisk = new Set(now.housesAtRisk);
    for (const tile of view.filter((t) => t.pulse)) expect(atRisk.has(tile.key)).toBe(true);
    for (const key of defences) expect(view.find((t) => t.key === key)?.shield).toBe(true);
    // Outside the five-quarter window there is no heat at all, only shields.
    expect(buildHeatView(now, bare, 7, defences, (key) => terrain.get(key)).every((t) => t.heat === 0)).toBe(true);
  });
});

describe("the heat is information only", () => {
  it("a run that computes the heat, the shields and Get ready every quarter ends exactly like one that never looks", () => {
    const play = (look: boolean): string => {
      const run = newRun("s13", BOT_LEVEL);
      const terrain = new Map([...run.state.placed.values()].map((t) => [`${t.coord.q},${t.coord.r}`, t.terrainId]));
      let step = 0;
      while (!run.finished && step < 200) {
        step++;
        if (look) {
          const next = run.nextChallenge();
          if (next) {
            const now = run.exposureFor(next)!;
            const bare = run.exposureFor(next, true)!;
            buildHeatView(now, bare, run.quartersUntil(next), [...run.state.elements.keys()], (key) => terrain.get(key));
            run.readiness();
          }
        }
        run.collectJar();
        // A few builds on the way, the same in both runs.
        if (step % 3 === 0) {
          for (const [zone, element] of [["z1", "dune"], ["z2", "mangrove"], ["z2", "khazan"]] as const) {
            const key = run.zones!.keys(zone).find((k) => {
              const [q, r] = k.split(",").map(Number);
              return run.state.canBuild({ q, r }, element);
            });
            if (key && run.state.coin > 200) {
              const [q, r] = key.split(",").map(Number);
              run.build({ q, r }, element);
              break;
            }
          }
        } else {
          run.fastForwardYear();
        }
      }
      return JSON.stringify({ snapshot: run.snapshot(), outcomes: [...run.outcomes] });
    };
    expect(play(true)).toBe(play(false));
  });
});
