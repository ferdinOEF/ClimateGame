import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { ageBroken, computeWater, crackedNote, defenceMetres, isCracked, waterBoard } from "../src/core/hazardModel";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { axialKey, neighbors } from "../src/core/hex";
import { resolveChallenge } from "../src/core/zones";
import type { ActionRun } from "../src/core/actionRun";

/**
 * Section 26.1 (owner decisions, game rules): engineered defences age. A breakwater breaks at 10 years, storm or
 * none; a seawall or small dam cracks at 10 years and breaks in the next storm of its kind (still in its second
 * storm of that kind before then). Played through the game's own run on Panaji.
 */
const probe = newRun("s26-probe", BOT_LEVEL);
const [cyclone, flood, compound] = probe.schedule;
const near = new Set<string>();
for (const c of probe.schedule) {
  for (const k of probe.exposureFor(c, true)?.exposure.keys() ?? []) {
    const [q, r] = k.split(",").map(Number);
    near.add(k);
    for (const n of neighbors({ q, r })) for (const m of neighbors(n)) near.add(axialKey(m));
  }
}

/** The year's build far from every storm: it changes nothing a storm does. */
function spend(run: ActionRun): void {
  for (const tile of run.state.placed.values()) {
    const options = near.has(axialKey(tile.coord)) ? [] : run.state.buildableAt(tile.coord);
    if (options.length > 0 && run.build(tile.coord, options[0].id).ok) return;
  }
  throw new Error("nowhere to build");
}
/** Plays spare builds until `year` is the year about to be built in. */
function until(run: ActionRun, year: number): void {
  while (run.year < year && !run.finished) spend(run);
}
const first = (id: string, filter: (key: string) => boolean = () => true) =>
  [...probe.state.placed.values()].find((t) => probe.state.canBuild(t.coord, id) && filter(axialKey(t.coord)))!.coord;

describe("engineered defences age (Section 26.1)", () => {
  it("has the owner's ages in the data", () => {
    expect(ELEMENT_BY_ID.get("breakwater")!.breaksAtAge).toBe(10);
    expect(ELEMENT_BY_ID.get("seawall")!.cracksAtAge).toBe(10);
    expect(ELEMENT_BY_ID.get("small_dam")!.cracksAtAge).toBe(10);
    // The breakwater no longer has a storm count.
    expect(ELEMENT_BY_ID.get("breakwater")!.survivesStorms).toBeUndefined();
  });

  it("a breakwater breaks when it is 10 years old, with no storm: built 2027, broken in 2037", () => {
    const run = newRun("s26-breakwater", BOT_LEVEL);
    until(run, 2027);
    // A tile near the storms, where the spare builds never go.
    const coord = first("breakwater", (k) => near.has(k));
    expect(run.build(coord, "breakwater").ok).toBe(true);
    const key = axialKey(coord);
    until(run, 2036);
    expect(run.state.elements.get(key)!.broken ?? false).toBe(false);
    // The year 2036's build ends it; 2037 begins with the breakwater broken.
    const events = run.build(firstFree(run), firstFreeId(run)).events;
    expect(run.year).toBe(2037);
    expect(run.state.elements.get(key)!.broken).toBe(true);
    expect(events).toContainEqual({ type: "aged", key, elementId: "breakwater" });
    expect(defenceMetres(run.state, key, "cyclone")).toBe(0);
    // Its tile takes a new build, which replaces it.
    expect(run.state.buildableAt(coord).map((d) => d.id)).toContain("breakwater");
  });

  it("a breakwater 10 years old by a storm protects nothing in it, in the preview too", () => {
    const def = ELEMENT_BY_ID.get("breakwater")!;
    expect(ageBroken(def, { builtOnTurn: 0 }, 9)).toBe(false);
    expect(ageBroken(def, { builtOnTurn: 0 }, 10)).toBe(true);
    const s = probe.state.clone();
    const coord = first("breakwater", (k) => probe.exposureFor(cyclone, true)!.exposure.has(k));
    s.elements.set(axialKey(coord), { elementId: "breakwater", builtOnTurn: 0, degradeAmount: 0, floodBufferFilled: 0 });
    const storm = { kind: compound.kind, strength: compound.strength, landfall: probe.landfallOf(compound) };
    expect(computeWater(s, { ...storm, turn: 9 }).aged).toEqual([]);
    expect(computeWater(s, { ...storm, turn: 10 }).aged).toEqual([axialKey(coord)]);
  });

  it("a seawall cracked at 10 years breaks in its first cyclone: built 2036, cracked from 2046, broken in the 2050 storm", () => {
    const run = newRun("s26-wall", BOT_LEVEL);
    until(run, 2036);
    const coord = first("seawall", (k) => probe.exposureFor(compound, true)!.exposure.has(k) && probe.state.placed.get(k)!.terrainId === "beach");
    expect(run.build(coord, "seawall").ok).toBe(true);
    const key = axialKey(coord);
    const def = ELEMENT_BY_ID.get("seawall")!;
    until(run, 2045);
    expect(isCracked(def, run.state.elements.get(key)!, run.state.turn)).toBe(false);
    until(run, 2046);
    expect(isCracked(def, run.state.elements.get(key)!, run.state.turn)).toBe(true);
    expect(run.state.elements.get(key)!.stormsSurvived ?? 0).toBe(0);
    while (!run.finished) spend(run);
    expect(run.state.elements.get(key)!.broken).toBe(true);
    expect(run.outcomes.get(compound.id)!.zones.flatMap((z) => z.failed)).toContain(key);
  });

  it("a seawall under 10 years old still breaks in its second cyclone", () => {
    const s = probe.state.clone();
    const coord = first("seawall", (k) => probe.state.placed.get(k)!.terrainId === "beach");
    const key = axialKey(coord);
    s.turn = 15;
    s.elements.set(key, { elementId: "seawall", builtOnTurn: 10, degradeAmount: 0, floodBufferFilled: 0, stormsSurvived: 1 });
    expect(isCracked(ELEMENT_BY_ID.get("seawall")!, s.elements.get(key)!, s.turn)).toBe(false);
    const outcome = resolveChallenge(s, probe.zones!, "cyclone", probe.intensityOf(cyclone), probe.climate!.intensityPerStrength, undefined, undefined, undefined, undefined, probe.landfallOf(cyclone));
    expect(outcome.zones.flatMap((z) => z.failed)).toContain(key);
    expect(s.elements.get(key)!.broken).toBe(true);
    // And one that has faced none comes through.
    const t = probe.state.clone();
    t.turn = 15;
    t.elements.set(key, { elementId: "seawall", builtOnTurn: 10, degradeAmount: 0, floodBufferFilled: 0 });
    resolveChallenge(t, probe.zones!, "cyclone", probe.intensityOf(cyclone), probe.climate!.intensityPerStrength, undefined, undefined, undefined, undefined, probe.landfallOf(cyclone));
    expect(t.elements.get(key)!.broken ?? false).toBe(false);
    expect(t.elements.get(key)!.stormsSurvived).toBe(1);
  });

  it("a small dam cracked at 10 years breaks in its first flood: built 2030, broken in the 2040 flood", () => {
    const run = newRun("s26-dam", BOT_LEVEL);
    until(run, 2030);
    const river = [...waterBoard(run.state).riverIndex.keys()].map((k) => ({ q: Number(k.split(",")[0]), r: Number(k.split(",")[1]) })).find((c) => run.state.canBuild(c, "small_dam"))!;
    expect(run.build(river, "small_dam").ok).toBe(true);
    const key = axialKey(river);
    expect(run.landed.has(cyclone.id)).toBe(true);
    // The 2030 cyclone brought no flood: it does not count.
    expect(run.state.elements.get(key)!.stormsSurvived ?? 0).toBe(0);
    while (!run.landed.has(flood.id)) spend(run);
    expect(run.state.elements.get(key)!.broken).toBe(true);
  });

  it("a small dam under 10 years old still breaks in its second flood", () => {
    const s = probe.state.clone();
    const key = [...waterBoard(s).riverIndex.keys()].find((k) => {
      const [q, r] = k.split(",").map(Number);
      return s.canBuild({ q, r }, "small_dam");
    })!;
    s.turn = 15;
    s.elements.set(key, { elementId: "small_dam", builtOnTurn: 10, degradeAmount: 0, floodBufferFilled: 0, stormsSurvived: 1 });
    const outcome = resolveChallenge(s, probe.zones!, "flood", probe.intensityOf(flood), probe.climate!.intensityPerStrength);
    expect(outcome.zones.flatMap((z) => z.failed)).toContain(key);
  });

  it("says the cracked note in the game's words", () => {
    expect(crackedNote(ELEMENT_BY_ID.get("seawall")!)).toBe("Cracked: breaks in the next cyclone");
    expect(crackedNote(ELEMENT_BY_ID.get("small_dam")!)).toBe("Cracked: breaks in the next flood");
  });
});

/** A free tile far from the storms, and what fits on it. */
function firstFree(run: ActionRun): { q: number; r: number } {
  return [...run.state.placed.values()].find((t) => !near.has(axialKey(t.coord)) && run.state.buildableAt(t.coord).length > 0)!.coord;
}
function firstFreeId(run: ActionRun): string {
  return run.state.buildableAt(firstFree(run))[0].id;
}

describe("biodiversity at the end of 2050 (Section 26.2)", () => {
  it("gives the 2050 storm its own, higher three star rise, measured at the end of the year; 2030 and 2040 keep +6", () => {
    const stars = probe.houseStars!;
    expect(probe.houseStarsFor(cyclone)!.bioThree).toBe(6);
    expect(probe.houseStarsFor(flood)!.bioThree).toBe(6);
    expect(probe.houseStarsFor(compound)!.bioThree).toBeGreaterThan(6);
    expect(probe.houseStarsFor(compound)!.bioAtEnd).toBe(true);
    expect(probe.houseStarsFor(cyclone)!.bioAtEnd).toBe(false);
    expect(stars.bioThree).toBe(6);
  });

  it("judges the 2050 storm's stars by the biodiversity after the last build and the storm", () => {
    const run = newRun("s26-end", BOT_LEVEL);
    while (!run.finished) spend(run);
    const o = run.outcomes.get(compound.id)!;
    expect(o.biodiversityChange).toBe(run.state.biodiversity - run.houseStars!.bioStart!);
  });

  it("says the 2050 rise in How to play", async () => {
    const { panjimHelpHtml, starRule } = await import("../src/ui/panjim/panjimHelp");
    const rule = starRule(probe.houseStars!, probe.schedule);
    expect(rule).toContain(`(up ${compound.bioThree} by the end of 2050)`);
    expect(panjimHelpHtml({ startYear: 2026, endYear: 2050, storms: probe.schedule, houseStars: probe.houseStars })).toContain(rule.replace(/^A/, "a"));
  });
});
