import { describe, expect, it } from "vitest";
import { heatRamp, tileHeat, computeExposure, protectedTiles, buildHeatView, HEAT_LEAD_QUARTERS } from "../src/core/exposure";
import { resolveChallenge } from "../src/core/zones";
import { BOT_LEVELS, newRun, type Preset } from "../tools/panjimBots/bots";
import type { ActionRun } from "../src/core/actionRun";

/**
 * The warning heat is information only, and it has to be true. These tests
 * play the real Panaji run and compare what the heat previewed with what the
 * storm then did, on the same seed. The tolerance is zero: the preview runs
 * the same resolver on the board as it will stand on the day, so as long as
 * the player builds nothing in between, the houses it calls at risk are the
 * houses lost, exactly.
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
}

function land(run: ActionRun): ReturnType<typeof run.outcomes.get> {
  const next = run.nextChallenge()!;
  while (!run.landed.has(next.id)) run.fastForwardYear();
  return run.outcomes.get(next.id);
}

const PRESETS: Preset[] = ["easy-test", "strict"];
const SEEDS = ["panjim", "s1", "s7", "s13"];

describe("computeExposure matches the storm it previews", () => {
  for (const preset of PRESETS) {
    for (const seed of SEEDS) {
      it(`${preset} · ${seed}: undefended, every storm`, () => {
        const run = newRun(seed, BOT_LEVELS[preset]);
        for (let i = 0; i < 3; i++) {
          approach(run, 1);
          const next = run.nextChallenge()!;
          const preview = run.exposureFor(next)!;
          const outcome = land(run)!;
          expect([...preview.housesAtRisk].sort()).toEqual([...outcome.damagedHouses].sort());
          // A tile previewed at zero exposure takes no damage.
          const damaged = new Set(outcome.damagedHouses);
          for (const [key, value] of preview.exposure) if (value === 0) expect(damaged.has(key)).toBe(false);
          // Every lost house was previewed at full exposure.
          for (const key of outcome.damagedHouses) expect(preview.exposure.get(key)).toBe(1);
        }
      });

      it(`${preset} · ${seed}: with defences planted inside the warning window`, () => {
        const run = newRun(seed, BOT_LEVELS[preset]);
        approach(run, 5, [["z1", "dune"], ["z1", "sandy_vegetation"], ["z2", "mangrove"]]);
        const next = run.nextChallenge()!;
        const preview = run.exposureFor(next)!;
        const outcome = land(run)!;
        expect([...preview.housesAtRisk].sort()).toEqual([...outcome.damagedHouses].sort());
      });
    }
  }

  it("never changes the outcome: the probe only reads", () => {
    const a = newRun("panjim", BOT_LEVELS.strict);
    const b = newRun("panjim", BOT_LEVELS.strict);
    const next = a.nextChallenge()!;
    const intensity = a.intensityOf(next);
    const unit = a.climate!.intensityPerStrength;
    const withProbe = resolveChallenge(a.state.clone(), a.zones!, next.kind, intensity, unit, a.combos, a.houseStars, a.houseRule, () => {});
    const without = resolveChallenge(b.state.clone(), b.zones!, next.kind, intensity, unit, b.combos, b.houseStars, b.houseRule);
    expect(withProbe).toEqual(without);
  });

  it("leaves the real board untouched", () => {
    const run = newRun("panjim", BOT_LEVELS.strict);
    const before = JSON.stringify([...run.state.elements]);
    run.exposureFor(run.nextChallenge()!);
    run.exposureFor(run.nextChallenge()!, true);
    expect(JSON.stringify([...run.state.elements])).toBe(before);
  });

  it("marks tiles a defence protected, and only those", () => {
    const run = newRun("panjim", BOT_LEVELS.strict);
    approach(run, 5, [["z1", "dune"], ["z1", "dune"], ["z1", "sandy_vegetation"]]);
    const next = run.nextChallenge()!;
    const now = run.exposureFor(next)!;
    const bare = run.exposureFor(next, true)!;
    const shielded = protectedTiles(now, bare);
    for (const key of shielded) expect((bare.exposure.get(key) ?? 0) - (now.exposure.get(key) ?? 0)).toBeGreaterThanOrEqual(0.15);
    // With no defences built, nothing is protected.
    const fresh = newRun("panjim", BOT_LEVELS.strict);
    const c = fresh.nextChallenge()!;
    expect(protectedTiles(fresh.exposureFor(c)!, fresh.exposureFor(c, true)!)).toEqual([]);
  });

  it("covers only tiles on the storm's path", () => {
    const run = newRun("panjim", BOT_LEVELS.strict);
    const next = run.nextChallenge()!;
    const preview = computeExposure(run.state, run.zones!, "cyclone", 100, 50, { houseRule: run.houseRule });
    const path = new Set([...run.zones!.keys("z1"), ...run.zones!.keys("z2")]);
    for (const key of preview.exposure.keys()) expect(path.has(key)).toBe(true);
    expect(next.kind).toBe("cyclone");
  });
});

describe("buildHeatView", () => {
  it("heats only dry tiles, hatches above 30%, pulses at most 24 falling houses, and shields defences", () => {
    const run = newRun("s7", BOT_LEVELS.strict);
    approach(run, 1, [["z1", "dune"], ["z1", "dune"]]);
    const next = run.nextChallenge()!;
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
