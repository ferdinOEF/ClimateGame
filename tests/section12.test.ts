import { describe, expect, it } from "vitest";
import { passYear } from "./helpers/passYear";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { describe as describeStorm } from "../src/ui/panjim/outlookBar";
import { isPhaseLine, MAYA } from "../src/core/mayaLines";
import { prepProgress } from "../src/core/prep";
import { savedRunYear, panjimSaveKey } from "../src/levels/savedRun";
import { progressLine } from "../src/ui/screens/levelSelectScreen";
import { MONEY_ONLY } from "../src/levels/balance";

/** Section 12.1's bugs, where a test can catch them (the rest are in tools/section12Checks.ts, in the browser). */
describe("Section 12 bugs", () => {
  it("1: with the economy off, the resort and the yacht are not in the build menu", () => {
    const run = newRun("s12", BOT_LEVEL);
    expect(BOT_LEVEL.economy?.enabled).toBe(false);
    for (const tile of run.state.placed.values()) {
      const offered = run.state.buildableAt(tile.coord).map((d) => d.id);
      for (const id of MONEY_ONLY) expect(offered).not.toContain(id);
    }
  });

  it("2: at the start of 2031 the flood is 10 builds away; with the countdown held the Outlook names it without one", () => {
    const run = newRun("s12", BOT_LEVEL);
    const [cyclone, flood] = run.schedule;
    while (!run.landed.has(cyclone.id)) passYear(run);
    expect(run.year).toBe(2031);
    expect(run.buildsUntil(flood)).toBe(10);
    const storm = { challenge: flood, yearsUntil: 11, past: false };
    expect(describeStorm(storm)).toMatch(/11 years$/);
    expect(describeStorm(storm, true)).toBe("Monsoon flood · 2040 · strong");
  });

  it("3: an objective row is ticked only at its target, from the same count as its counter (after a demolish too)", () => {
    const run = newRun("s12", BOT_LEVEL);
    const zones = run.zones!;
    const job = { id: "t", challengeId: run.schedule[0].id, templateId: "t", elementId: "dune", zone: "z1", count: 2, baseline: 0, reward: 0, label: "Add 2 dunes", done: false, tiles: ["-4,18", "-4,19"] };
    expect(prepProgress(job, run.state, zones)).toEqual({ current: 0, target: 2, done: false });
    run.state.build({ q: -4, r: 18 }, "dune", false);
    run.state.build({ q: -4, r: 19 }, "dune", false);
    expect(prepProgress(job, run.state, zones)).toEqual({ current: 2, target: 2, done: true });
    // The flag a completed job once set does not tick the row once a dune is gone.
    job.done = true;
    run.state.elements.delete("-4,19");
    expect(prepProgress(job, run.state, zones)).toEqual({ current: 1, target: 2, done: false });
  });

  it("4: Maya's lines about a phase are recognised, so they are withdrawn when it ends", () => {
    for (const id of ["storm:c1-cyclone:Landfall", "replay:c1-cyclone:x", "calm:c3-compound", "warn:c2-flood", "last:c2-flood", "fixed:c1-cyclone", MAYA.opening.id]) expect(isPhaseLine(id), id).toBe(true);
    for (const id of [MAYA.greeting.id, "get-ready", "fact:mangroves"]) expect(isPhaseLine(id), id).toBe(false);
  });

  it("7: the level card says 'In progress · 2031' while a run is saved, best stars once one has finished", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null };
    expect(savedRunYear("l01-first-rains", 2026, 25, storage)).toBeNull();
    store.set(panjimSaveKey("l01-first-rains"), JSON.stringify({ snapshot: { version: 3, turn: 5 } }));
    expect(savedRunYear("l01-first-rains", 2026, 25, storage)).toBe(2031);
    const record = { stars: 0, bestScore: 0, completed: false };
    expect(progressLine(BOT_LEVEL, record, true, 2031)).toEqual({ text: "In progress · 2031", muted: false });
    expect(progressLine(BOT_LEVEL, record, true, null).text).toBe("Not yet played");
    expect(progressLine(BOT_LEVEL, { stars: 2, bestScore: 0, completed: true }, true, null).text).toBe("Best ★★☆");
    // A finished run's save is not "in progress".
    store.set(panjimSaveKey("l01-first-rains"), JSON.stringify({ snapshot: { version: 3, turn: 25 } }));
    expect(savedRunYear("l01-first-rains", 2026, 25, storage)).toBeNull();
  });
});

describe("protectsHere (the outside-the-area line, and Section 13's build cards)", () => {
  it("is the homes the storm takes now less those it takes with the build, by a real resolution", () => {
    const run = newRun("s12", BOT_LEVEL);
    const cyclone = run.schedule[0];
    const coord = { q: 2, r: 12 };
    const n = run.protectsHere(cyclone, coord, "breakwater");
    expect(n).toBeGreaterThan(0);
    const before = run.exposureFor(cyclone)!.housesAtRisk.length;
    run.build(coord, "breakwater");
    expect(run.exposureFor(cyclone)!.housesAtRisk.length).toBe(before - n);
    expect(run.protectsHere(cyclone, coord, "breakwater")).toBe(0);
  });
});
