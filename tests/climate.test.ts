import { passYear } from "./helpers/passYear";
import { describe, expect, it } from "vitest";
import { buildSchedule, challengeStrength, strengthIcons, yearsUntil } from "../src/core/climate";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { BOT_LEVEL, newRun, SEEDS } from "../tools/panjimBots/bots";
import { landfallSite } from "../src/core/hazardModel";

/**
 * Section 5: three storms on a fixed calendar. Nothing about when, how hard
 * or where may depend on a seed.
 */
const level = LEVEL_BY_ID.get("l01-first-rains")!;
const climate = level.climate!;
const START = level.timeline!.startYear;
const END = level.timeline!.endYear;

describe("the storm calendar", () => {
  // Section 16.4: the first cyclone is 1.2 (still "mild"), tuned so its surge, coming ashore in front of Sharada
  // Mandir School, tops the ridge the homes beside the school stand on.
  it("puts each storm at the end of its year: turns 5, 15 and 25, at 1.2, 1.8 and 2.6", () => {
    const schedule = buildSchedule(climate, START, END);
    expect(schedule.map((c) => [c.id, c.kind, c.year, c.turn, c.strength])).toEqual([
      ["c1-cyclone", "cyclone", 2030, 5, 1.2],
      ["c2-flood", "flood", 2040, 15, 1.8],
      ["c3-compound", "compound", 2050, 25, 2.6]
    ]);
    for (const c of schedule) expect(challengeStrength(climate, c)).toBe(c.strength);
    expect(schedule.map((c) => strengthIcons(c.strength))).toEqual([1, 2, 3]);
  });

  it("has nothing that could move a storm: no jitter, no lock, no narrowing, no seeded landfall", () => {
    const text = JSON.stringify(climate);
    for (const key of ["jitterYears", "forecastLockQuarters", "narrowFromQuarters", "baselinePerYear", "landfallCentre", "landfallOffset"]) expect(text).not.toContain(key);
    expect(climate.challenges.filter((c) => c.kind !== "flood").every((c) => typeof c.landfall === "string")).toBe(true);
  });

  it("counts years until a storm including this one", () => {
    const [cyclone] = buildSchedule(climate, START, END);
    expect(yearsUntil(cyclone, 1)).toBe(5);
    expect(yearsUntil(cyclone, 4)).toBe(2);
    expect(yearsUntil(cyclone, 5)).toBe(1);
  });
});

describe("every seed meets the same storms", () => {
  it("resolves the three storms when the year ends on turns 5, 15 and 25, at the stated strengths and landfall", () => {
    const seen = new Set<string>();
    for (const seed of [...SEEDS, "l01-first-rains", "daily-2026-10-15", "replay-x"]) {
      const run = newRun(seed, BOT_LEVEL);
      const resolved: string[] = [];
      while (!run.finished) {
        const turn = run.turnNumber;
        const before = new Map(run.schedule.map((c) => [c.id, run.landed.has(c.id)]));
        const events = passYear(run);
        for (const event of events) {
          if (event.type !== "challenge") continue;
          expect(before.get(event.challenge.id)).toBe(false);
          expect(event.outcome!.intensity).toBe(event.challenge.strength * climate.intensityPerStrength);
          const record = run.stormRecords.get(event.challenge.id)!;
          const expectedSite = event.challenge.kind === "flood" ? null : run.board().sites[landfallSite(run.board(), event.challenge)];
          expect(record.landfallKey ?? null).toBe(expectedSite);
          resolved.push(`${event.challenge.id}@${turn}:${event.challenge.strength}:${expectedSite}`);
        }
      }
      expect(resolved.map((r) => r.split(":")[0])).toEqual(["c1-cyclone@5", "c2-flood@15", "c3-compound@25"]);
      seen.add(resolved.join("|"));
    }
    // One calendar, one set of strengths and landfalls for every seed.
    expect(seen.size).toBe(1);
  });

  it("gives the calendar no seed to read: neither the schedule nor the run takes one", async () => {
    // newRun above passes no seed to the run, so the check above holds by construction; this pins why.
    expect(buildSchedule.length).toBe(3);
    const { readFileSync } = await import("node:fs");
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    const runOptions = controller.slice(controller.indexOf("new ActionRun("), controller.indexOf("});", controller.indexOf("new ActionRun(")));
    expect(runOptions).not.toMatch(/seed/);
    expect(readFileSync("src/core/actionRun.ts", "utf8")).not.toMatch(/seed\??:/);
  });

  it("gives the daily challenge the same fixed calendar", async () => {
    const { dailyChallengeLevel } = await import("../src/levels/levels");
    const daily = dailyChallengeLevel("2026-10-07");
    expect(daily.timeModel).toBe("years");
    expect(buildSchedule(daily.climate!, START, END)).toEqual(buildSchedule(climate, START, END));
  });
});
