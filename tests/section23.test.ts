import { describe, expect, it } from "vitest";
import { passYear } from "./helpers/passYear";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { shelterOf } from "../src/core/climate";
import { panjimHelpHtml } from "../src/ui/panjim/panjimHelp";
import MAP from "../src/data/maps/panaji.json";

/** Section 23.1 (owner decision): the 2050 storm does not reach the sheltered middle of Taleigao, a game rule. */
const ROWS: Record<number, number[]> = {
  16: [0, 1, 2, 4, 5, 6, 7],
  17: [-1, 0, 1, 3, 4, 5, 6],
  18: [-2, -1, 2, 3, 4, 5, 6],
  19: [-2, 0, 1, 2, 3, 4, 5, 6],
  20: [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6],
  21: [-3, -2, -1, 0, 1, 2, 3, 4, 5],
  22: [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
  23: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
  24: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
  25: [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
  26: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
  27: [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6],
  28: [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
};
const OWNER = new Set(Object.entries(ROWS).flatMap(([r, qs]) => qs.map((q) => `${q},${r}`)));

describe("Section 23.1, the sheltered centre in the 2050 storm", () => {
  const run = newRun("s23-shelter", BOT_LEVEL, true);
  const [c1, c2, c3] = run.schedule;
  const shelter = shelterOf(c3)!;

  it("is the owner's 134 land tiles, on the 2050 storm only", () => {
    expect(c3.id).toBe("c3-compound");
    expect(OWNER.size).toBe(134);
    expect(shelter).toEqual(OWNER);
    const terrain = new Map((MAP as { tiles: { q: number; r: number; terrainId: string }[] }).tiles.map((t) => [`${t.q},${t.r}`, t.terrainId]));
    for (const key of shelter) expect(terrain.get(key), key).toBe("land");
    expect(shelterOf(c1)).toBeUndefined();
    expect(shelterOf(c2)).toBeUndefined();
  });

  it("keeps the 2050 heat, area, cone and Homes at risk off it, from the start of the run", () => {
    const homes = [...run.state.elements].filter(([key, inst]) => inst.elementId === "house" && !run.state.isScenery(key) && shelter.has(key));
    expect(homes.length).toBeGreaterThan(50);
    const exposure = run.exposureFor(c3)!;
    for (const key of exposure.exposure.keys()) expect(shelter.has(key), key).toBe(false);
    for (const key of exposure.housesAtRisk) expect(shelter.has(key), key).toBe(false);
    expect(run.homesAtRisk(c3)).toBe(exposure.housesAtRisk.length);
    const cone = run.forecastCone(c3)!;
    for (const key of [...cone.bands.keys(), ...cone.area, ...cone.meet]) expect(shelter.has(key), key).toBe(false);
    // The first two storms still reach it.
    expect(run.exposureFor(c1)!.housesAtRisk.some((key) => shelter.has(key))).toBe(true);
    expect(run.exposureFor(c2)!.housesAtRisk.some((key) => shelter.has(key))).toBe(true);
  });

  it("never names it in the 2050 objective, never loses a home there, and draws no water on it", () => {
    while (!run.landed.has(c2.id)) passYear(run);
    expect(run.nextChallenge()?.id).toBe(c3.id);
    for (const pick of run.objective?.picks ?? []) expect(shelter.has(pick.key), pick.key).toBe(false);
    const standing = [...run.state.elements].filter(([key, inst]) => inst.elementId === "house" && shelter.has(key) && inst.degradeAmount < 1).map(([key]) => key);
    expect(standing.length).toBeGreaterThan(0);
    while (!run.landed.has(c3.id)) passYear(run);
    const outcome = run.outcomes.get(c3.id)!;
    for (const key of outcome.damagedHouses) expect(shelter.has(key), key).toBe(false);
    for (const key of standing) expect(run.state.elements.get(key)?.degradeAmount, key).toBeLessThan(1);
    const record = run.stormRecords.get(c3.id)!;
    for (const key of shelter) {
      expect(record.depth.get(key) ?? 0, key).toBe(0);
      expect(record.wind.get(key) ?? 0, key).toBe(0);
      const tile = record.field.tiles.get(key);
      if (tile) {
        expect(tile.surgePeak + tile.floodPeak + tile.windPeak, key).toBe(0);
      }
    }
  });

  it("chooses the 2050 objective afresh when a save from before Section 23 names a sheltered tile", () => {
    const old = newRun("s23-restore", BOT_LEVEL, true);
    while (!old.landed.has(c2.id)) passYear(old);
    const snapshot = old.snapshot();
    const inside = [...shelter][0];
    const stale = { ...snapshot.prep![0], challengeId: c3.id, templateId: "model:stale", elementId: "mangrove", tiles: [inside] };
    const restored = newRun("s23-restore", BOT_LEVEL, true);
    restored.restore({ ...snapshot, prep: [stale], areas: [[c3.id, [inside, ...(snapshot.areas?.find(([id]) => id === c3.id)?.[1] ?? [])]]] });
    for (const job of restored.prep) for (const key of job.tiles ?? []) expect(shelter.has(key), key).toBe(false);
    expect(restored.prep.some((job) => job.templateId === "model:stale")).toBe(false);
  });

  it("never has sheltered tiles without the place Help names them by", () => {
    for (const level of [BOT_LEVEL]) for (const challenge of level.climate?.challenges ?? []) {
      if (challenge.shelteredTiles?.length) expect(challenge.shelteredPlace, challenge.id).toBeTruthy();
    }
  });

  it("is said in How to play as a game rule", () => {
    const html = panjimHelpHtml({ startYear: 2026, endYear: 2050, storms: run.schedule });
    expect(html).toContain("In this game, the 2050 storm does not reach the sheltered middle of Taleigao.");
    expect(panjimHelpHtml({ startYear: 2026, endYear: 2040, storms: [c1, c2] })).not.toContain("does not reach");
  });
});
