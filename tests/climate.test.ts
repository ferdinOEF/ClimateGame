import { describe, expect, it } from "vitest";
import { buildSchedule, outlookFor, challengeStrength, strengthIcons, baselineMultiplier } from "../src/core/climate";
import { ActionRun } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { LEVEL_BY_ID, dailyChallengeLevel } from "../src/levels/levels";

const level = LEVEL_BY_ID.get("l01-first-rains")!;
const climate = level.climate!;
const START = 2025;
const END = 2050;
const SEEDS = Array.from({ length: 200 }, (_, i) => `seed-${i}`);

describe("challenge schedule", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = buildSchedule(climate, "l01-first-rains", START, END).map((c) => c.quarter);
    const b = buildSchedule(climate, "l01-first-rains", START, END).map((c) => c.quarter);
    expect(a).toEqual(b);
    const distinct = new Set(SEEDS.map((seed) => buildSchedule(climate, seed, START, END).map((c) => c.quarter).join(",")));
    expect(distinct.size).toBeGreaterThan(20);
  });

  it("keeps each challenge near its year, in season, in order and inside the run", () => {
    for (const seed of SEEDS) {
      const schedule = buildSchedule(climate, seed, START, END);
      expect(schedule.map((c) => c.id)).toEqual(["c1-cyclone", "c2-flood", "c3-compound"]);
      schedule.forEach((challenge, i) => {
        const year = START + challenge.quarter / 4;
        expect(Math.abs(year - challenge.year)).toBeLessThanOrEqual(challenge.jitterYears + 0.75);
        expect(challenge.quarter).toBeLessThan((END - START) * 4);
        if (i > 0) expect(challenge.quarter - schedule[i - 1].quarter).toBeGreaterThanOrEqual(8);
      });
      expect([1, 3]).toContain(schedule[0].quarter % 4); // cyclone: Q2 or Q4
      expect(schedule[1].quarter % 4).toBe(2); // monsoon flood: Q3
    }
  });

  it("gives the daily challenge its own calendar", () => {
    const daily = dailyChallengeLevel("2026-10-07");
    expect(daily.timeModel).toBe("actions");
    const campaign = buildSchedule(climate, level.id, START, END).map((c) => c.quarter);
    const days = ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"].map((d) =>
      buildSchedule(climate, `daily-${d}`, START, END).map((c) => c.quarter).join(",")
    );
    expect(days.some((d) => d !== campaign.join(","))).toBe(true);
  });
});

describe("climate outlook", () => {
  it("shows a season far out, narrows around the true date, then locks two years before", () => {
    for (const seed of SEEDS) {
      for (const challenge of buildSchedule(climate, seed, START, END)) {
        const trueYear = START + challenge.quarter / 4;
        const far = outlookFor(climate, challenge, Math.max(0, challenge.quarter - 30), START);
        if (challenge.quarter >= 30) {
          expect(far.phase).toBe("far");
          expect(far.exactQuarter).toBeUndefined();
          // Centred on the nominal year: no hint of the jitter.
          expect((far.windowStart + far.windowEnd) / 2).toBe(challenge.year);
        }
        let previousWidth = Infinity;
        for (let until = climate.narrowFromQuarters; until > climate.forecastLockQuarters; until--) {
          const near = outlookFor(climate, challenge, challenge.quarter - until, START);
          expect(near.phase).toBe("near");
          expect(near.windowStart).toBeLessThanOrEqual(trueYear);
          expect(near.windowEnd).toBeGreaterThanOrEqual(trueYear + 0.25);
          const width = near.windowEnd - near.windowStart;
          expect(width).toBeLessThanOrEqual(previousWidth + 1e-9);
          previousWidth = width;
        }
        const locked = outlookFor(climate, challenge, challenge.quarter - climate.forecastLockQuarters, START);
        expect(locked.phase).toBe("locked");
        expect(locked.exactQuarter).toBe(challenge.quarter);
        expect([1, 2, 3]).toContain(locked.icons);
      }
    }
  });

  it("raises the baseline every year, so later challenges are stronger", () => {
    expect(baselineMultiplier(climate, 40)).toBeGreaterThan(baselineMultiplier(climate, 0));
    const [c1, c2, c3] = buildSchedule(climate, level.id, START, END);
    expect(strengthIcons(challengeStrength(climate, c1))).toBe(1);
    expect(strengthIcons(challengeStrength(climate, c2))).toBe(2);
    expect(strengthIcons(challengeStrength(climate, c3))).toBe(3);
  });
});

describe("action run with a schedule", () => {
  function run(): ActionRun {
    return new ActionRun(new GameState([{ coord: { q: 0, r: 0 }, terrainId: "land" }], [], 1000), level.timeline!, { climate, seed: level.id });
  }

  it("locks each forecast and lands each challenge exactly once, stopping a fast-forward on it", () => {
    const r = run();
    const seen: string[] = [];
    while (!r.finished) {
      const outcome = r.fastForwardYear();
      for (const event of outcome.events) if (event.type === "forecast_lock" || event.type === "challenge") seen.push(`${event.type}:${event.challenge.id}@${r.quarter}`);
      const landedHere = outcome.events.find((e) => e.type === "challenge");
      if (landedHere && landedHere.type === "challenge") expect(r.quarter).toBe(landedHere.challenge.quarter);
    }
    expect(seen.filter((s) => s.startsWith("challenge")).length).toBe(3);
    expect(seen.filter((s) => s.startsWith("forecast_lock")).length).toBe(3);
  });

  it("'Next event' stops one quarter before the next challenge", () => {
    const r = run();
    const next = r.nextChallenge()!;
    r.fastForwardToNextEvent();
    expect(r.quarter).toBe(next.quarter - 1);
    expect(r.fastForwardToNextEvent().ok).toBe(false);
  });
});
