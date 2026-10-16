import { passYear } from "./helpers/passYear";
import { describe, expect, it } from "vitest";
import { heatRamp, tileHeat, computeExposure, protectedTiles, buildHeatView, HATCH_THRESHOLD, HEAT_LEAD_YEARS } from "../src/core/exposure";
import { resolveChallenge } from "../src/core/zones";
import { computeWater } from "../src/core/hazardModel";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import type { ActionRun } from "../src/core/actionRun";

/**
 * The warning heat is information only, and it has to be true. These tests
 * play the real Panaji run and compare what the heat previewed with what the
 * storm then did (see "preview equals resolution" below).
 */
describe("heat ramp", () => {
  it("shows in the last two years before a storm: 35% two years out, 50% in its own year", () => {
    expect([3, 2, 1, 0].map((y) => Number(heatRamp(y).toFixed(4)))).toEqual([0, 0.35, 0.5, 0]);
    // A house that will be lost is hatched from the first warning year.
    expect(tileHeat(2, 1)).toBeGreaterThan(HATCH_THRESHOLD);
    expect(HEAT_LEAD_YEARS).toBe(2);
  });

  it("scales by exposure and never exceeds 50%", () => {
    expect(tileHeat(1, 1)).toBe(0.5);
    expect(tileHeat(1, 0.5)).toBe(0.25);
    expect(tileHeat(1, 0.01)).toBe(0);
    for (let y = 0; y <= 8; y++) for (const e of [0, 0.3, 1]) expect(tileHeat(y, e)).toBeLessThanOrEqual(0.5);
  });
});

/**
 * Plays to `yearsBefore` the next storm (1 = its own year), building `plant`
 * (zone, element) pairs on the way, one a year, in the years just before it
 * gets there; the years before those pass with nothing built.
 */
function approach(run: ActionRun, yearsBefore: number, plant: [string, string][] = []): void {
  const next = run.nextChallenge()!;
  while (run.yearsUntil(next) > yearsBefore + plant.length) passYear(run);
  for (const [zoneId, elementId] of plant) {
    const key = run.zones!.keys(zoneId).find((k) => {
      const [q, r] = k.split(",").map(Number);
      return run.state.canBuild({ q, r }, elementId);
    });
    if (!key) throw new Error(`approach: nowhere for ${elementId} in ${zoneId}`);
    const [q, r] = key.split(",").map(Number);
    run.build({ q, r }, elementId);
  }
}

/** Moves the clock without a build until the next storm has resolved; its outcome. */
function land(run: ActionRun): ReturnType<typeof run.outcomes.get> {
  const next = run.nextChallenge()!;
  while (!run.landed.has(next.id)) passYear(run);
  return run.outcomes.get(next.id);
}

/**
 * PREVIEW EQUALS RESOLUTION (Section 4.5, kept for one build a year in
 * Section 8). The calendar, strength and landfall are fixed, so the heat is
 * not a worst case over a cone any more: the houses it shows at risk are
 * exactly the houses the storm takes if nothing more is built. No miss and no
 * over-call, in either warning year, with or without defences.
 */
const RUNS = ["panjim", "s1", "s7"];

describe("the heat equals the loss (preview equals resolution)", () => {
  for (const seed of RUNS) {
    it(`${seed}: undefended, every storm, from both warning years`, () => {
      const run = newRun(seed, BOT_LEVEL);
      for (let i = 0; i < 3; i++) {
        approach(run, 2);
        const next = run.nextChallenge()!;
        const twoOut = [...run.exposureFor(next)!.housesAtRisk].sort();
        passYear(run);
        const ownYear = run.exposureFor(next)!;
        expect([...ownYear.housesAtRisk].sort()).toEqual(twoOut);
        const outcome = land(run)!;
        expect([...outcome.damagedHouses].sort(), `${seed} storm ${i + 1}`).toEqual(twoOut);
        // Every lost house was previewed at full exposure.
        for (const key of outcome.damagedHouses) expect(ownYear.exposure.get(key)).toBe(1);
      }
    });
  }

  it("with defences built in each warning year, the heat drops to exactly what is still lost", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const plans: [string, string][][] = [
      [["z1", "dune"], ["z1", "sandy_vegetation"], ["z1", "dune"]],
      [["z2", "khazan"], ["z2", "mangrove"], ["z3", "mangrove"]],
      // Section 11: z4's wetland is gone (the owner's edits made it river, and the north bank's is scenery), so the
      // third storm's first mangrove goes to the Taleigao wetlands instead; what is tested, preview = loss, is the same.
      [["z2", "mangrove"], ["z2", "khazan"], ["z3", "mangrove"]]
    ];
    for (const plan of plans) {
      // One build three years out, then one in each warning year, the heat recomputed after each.
      approach(run, 3, plan.slice(0, 1));
      const next = run.nextChallenge()!;
      const before = run.exposureFor(next)!.housesAtRisk.length;
      approach(run, 1, plan.slice(1));
      const preview = [...run.exposureFor(next)!.housesAtRisk].sort();
      expect(preview.length).toBeLessThanOrEqual(before);
      const outcome = land(run)!;
      expect([...outcome.damagedHouses].sort()).toEqual(preview);
    }
  });
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
    approach(run, 2, [["z1", "dune"], ["z1", "dune"], ["z1", "sandy_vegetation"]]);
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

  it("covers only tiles the storm reaches (its water or, in a cyclone, its wind)", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const next = run.nextChallenge()!;
    const preview = computeExposure(run.state, run.zones!, "cyclone", 100, 50, { houseRule: run.houseRule, landfallSites: [3] });
    const water = computeWater(run.state, { kind: "cyclone", strength: 2, landfall: 3 }, { landfallZoneTiles: run.zones!.keys("z1") });
    for (const key of preview.exposure.keys()) expect(water.depth.has(key) || water.wind.has(key)).toBe(true);
    expect(next.kind).toBe("cyclone");
  });
});

describe("buildHeatView", () => {
  it("heats only dry tiles, hatches above 30%, pulses at most 24 falling houses, and shields defences", () => {
    const run = newRun("s7", BOT_LEVEL);
    approach(run, 3);
    const next = run.nextChallenge()!;
    // Two dunes on beach the storm would reach, one a year: into the storm's own year.
    const reach = run.exposureFor(next, true)!;
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
    const years = run.yearsUntil(next);
    const view = buildHeatView(now, bare, years, defences, (key) => terrain.get(key));
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
    // Outside the two-year window there is no heat at all, only shields.
    expect(buildHeatView(now, bare, 3, defences, (key) => terrain.get(key)).every((t) => t.heat === 0)).toBe(true);
  });
});

describe("the heat is information only", () => {
  it("a run that computes the heat, the shields and Get ready at every step ends exactly like one that never looks", () => {
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
            buildHeatView(now, bare, run.yearsUntil(next), [...run.state.elements.keys()], (key) => terrain.get(key));
            run.readiness();
          }
        }
        // A few builds on the way, the same in both runs.
        if (step % 3 === 0) {
          for (const [zone, element] of [["z1", "dune"], ["z2", "mangrove"], ["z2", "khazan"]] as const) {
            const key = run.zones!.keys(zone).find((k) => {
              const [q, r] = k.split(",").map(Number);
              return run.state.canBuild({ q, r }, element);
            });
            if (key) {
              const [q, r] = key.split(",").map(Number);
              run.build({ q, r }, element);
              break;
            }
          }
        } else {
          passYear(run);
        }
      }
      return JSON.stringify({ snapshot: run.snapshot(), outcomes: [...run.outcomes] });
    };
    expect(play(true)).toBe(play(false));
  });
});
