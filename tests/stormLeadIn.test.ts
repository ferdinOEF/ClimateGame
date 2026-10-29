import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { passYear } from "./helpers/passYear";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import type { StormRecord } from "../src/core/stormRecord";
import { STORM_LEAD, buildStormScript, firstWaterTime, stormStartTime } from "../src/core/stormScript";
import { REPLAY_MAX_MS, replayStepMs } from "../src/ui/panjim/replayCard";
import { MUSIC_FADE } from "../src/ui/music";

/**
 * Section 37.1: a shorter storm lead in. The clock starts two seconds before the first water, the replay is on screen
 * at most 8 s, and the music's fade out ends before the first wave. When the clock starts is all that changed: the
 * depth field and the outcome are the resolver's.
 */
function allStorms(): StormRecord[] {
  const run = newRun("panjim", BOT_LEVEL);
  const records: StormRecord[] = [];
  for (const challenge of run.schedule) {
    while (!run.landed.has(challenge.id)) passYear(run);
    records.push(run.stormRecords.get(challenge.id)!);
  }
  return records;
}

describe("Section 37.1: the storm's lead in", () => {
  const records = allStorms();

  it("the clock starts STORM_LEAD (2 s) before the first water on land or in the river, for each of the three storms", () => {
    expect(records.map((r) => r.kind)).toEqual(["cyclone", "flood", "compound"]);
    expect(STORM_LEAD).toBe(2);
    for (const record of records) {
      const first = firstWaterTime(record.field)!;
      expect(first).toBeGreaterThan(STORM_LEAD);
      expect(stormStartTime(record.field)).toBeCloseTo(first - STORM_LEAD, 9);
      // Every moment the script marks but the lightning comes at or after the start: nothing is skipped.
      const script = buildStormScript(record, new Map(), () => null);
      for (const event of script.events) if (event.type !== "lightning") expect(event.t).toBeGreaterThanOrEqual(stormStartTime(record.field));
    }
  });

  it("the music's fade out (1.5 s) ends before the first wave", () => {
    expect(MUSIC_FADE.out).toBe(1.5);
    expect(MUSIC_FADE.out).toBeLessThan(STORM_LEAD);
  });

  it("the replay is on screen at most 8 s on its own: 2.6 s a step, shorter past three", () => {
    expect(REPLAY_MAX_MS).toBe(8000);
    expect(replayStepMs(1)).toBe(2600);
    expect(replayStepMs(3)).toBe(2600);
    for (let n = 1; n <= 8; n++) expect(n * replayStepMs(n)).toBeLessThanOrEqual(8000);
  });

  it("the director starts its clock there, and the weather and water come in from it; Speed up shows from the build", () => {
    const director = readFileSync("src/app/stormDirector.ts", "utf8");
    expect(director).toContain("this.start = stormStartTime(record.field);");
    expect(director).toContain("this.t = this.start;");
    expect(director).toContain("const fadeIn = smooth((t - this.start) / LEAD_RAMP);");
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).toContain("if (pending.length > 0 && !this.leadIn) this.leadIn = this.armHurry();");
  });
});
