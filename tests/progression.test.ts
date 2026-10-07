import { describe, expect, it } from "vitest";
import {
  currentLevelId,
  emptyProgress,
  ALL_LEVELS_UNLOCKED,
  isLevelUnlocked,
  levelsCompleted,
  mergeProgress,
  recordFor,
  recordRun,
  totalStars,
  type PlayerProgress
} from "../src/levels/progression";
import { LEVELS } from "../src/levels/levels";

/**
 * Progression decides what a player can play and what they keep. The rules
 * that matter most are the ones that protect earned progress — a worse run
 * must never take anything away, and a cloud merge must never lose a
 * device's work.
 */

function clear(progress: PlayerProgress, levelId: string, score = 500, stars = 2): PlayerProgress {
  return recordRun(progress, { levelId, score, stars, turns: 20, completed: true }).progress;
}

describe("unlocking", () => {
  /**
   * The campaign is currently open for playtesting (`ALL_LEVELS_UNLOCKED`), so
   * the sequential-gate cases below are expressed as "this is what happens in
   * whichever mode is on" rather than being deleted.
   *
   * Deleting them was the alternative and it is the wrong one: the gate is
   * still the shipping behaviour, the flag is meant to be flipped back, and a
   * rule with no test is a rule that quietly stops working while nobody is
   * looking at it.
   */
  it("opens the first level to a new player", () => {
    expect(isLevelUnlocked(emptyProgress(), LEVELS[0].id)).toBe(true);
  });

  it("gates later levels on the previous clear, unless the campaign is open", () => {
    // Indexes past the end are skipped rather than assumed: the campaign has
    // been as long as nine levels and is currently two, and a test that reads
    // LEVELS[2] fails with a null dereference rather than a useful message
    // the next time it is trimmed.
    const fresh = emptyProgress();
    for (let index = 1; index < LEVELS.length; index++) {
      expect(isLevelUnlocked(fresh, LEVELS[index].id)).toBe(ALL_LEVELS_UNLOCKED);
    }

    // Clearing one always opens the next, in either mode.
    const cleared = clear(fresh, LEVELS[0].id);
    expect(isLevelUnlocked(cleared, LEVELS[1].id)).toBe(true);
  });

  it("does not gate on stars — a one-star clear still opens the next level", () => {
    const progress = recordRun(emptyProgress(), {
      levelId: LEVELS[0].id,
      score: 1,
      stars: 1,
      turns: 40,
      completed: true
    }).progress;
    expect(isLevelUnlocked(progress, LEVELS[1].id)).toBe(true);
  });

  it("always allows the daily challenge, regardless of campaign progress", () => {
    expect(isLevelUnlocked(emptyProgress(), "daily-2026-09-07")).toBe(true);
  });

  it("reports an unknown level as locked even with the campaign open", () => {
    // An id that is not a real level is a stale bookmark or a hand-edited URL.
    // Opening the campaign must not turn those into somewhere to send a player.
    expect(isLevelUnlocked(emptyProgress(), "not-a-level")).toBe(false);
  });
});

describe("recordRun", () => {
  it("keeps the better of two runs and never regresses", () => {
    let progress = clear(emptyProgress(), LEVELS[0].id, 800, 3);
    progress = recordRun(progress, { levelId: LEVELS[0].id, score: 100, stars: 1, turns: 60, completed: true }).progress;

    const record = recordFor(progress, LEVELS[0].id);
    expect(record.bestScore).toBe(800);
    expect(record.stars).toBe(3);
    expect(record.attempts).toBe(2);
  });

  it("cannot un-complete a level with a later failed run", () => {
    let progress = clear(emptyProgress(), LEVELS[0].id);
    progress = recordRun(progress, { levelId: LEVELS[0].id, score: 40, stars: 0, turns: 3, completed: false }).progress;
    expect(recordFor(progress, LEVELS[0].id).completed).toBe(true);
    expect(isLevelUnlocked(progress, LEVELS[1].id)).toBe(true);
  });

  it("records best turns only from runs that actually cleared", () => {
    // A fast failure must not become the speed record.
    let progress = recordRun(emptyProgress(), {
      levelId: LEVELS[0].id,
      score: 10,
      stars: 0,
      turns: 2,
      completed: false
    }).progress;
    expect(recordFor(progress, LEVELS[0].id).bestTurns).toBe(0);

    progress = recordRun(progress, { levelId: LEVELS[0].id, score: 500, stars: 2, turns: 25, completed: true }).progress;
    expect(recordFor(progress, LEVELS[0].id).bestTurns).toBe(25);

    progress = recordRun(progress, { levelId: LEVELS[0].id, score: 520, stars: 2, turns: 18, completed: true }).progress;
    expect(recordFor(progress, LEVELS[0].id).bestTurns).toBe(18);
  });

  it("reports the level a first completion unlocked", () => {
    const delta = recordRun(emptyProgress(), {
      levelId: LEVELS[0].id,
      score: 500,
      stars: 2,
      turns: 20,
      completed: true
    });
    expect(delta.isFirstCompletion).toBe(true);
    expect(delta.unlockedLevelId).toBe(LEVELS[1].id);

    // Clearing it a second time unlocks nothing new.
    const second = recordRun(delta.progress, {
      levelId: LEVELS[0].id,
      score: 900,
      stars: 3,
      turns: 15,
      completed: true
    });
    expect(second.isFirstCompletion).toBe(false);
    expect(second.unlockedLevelId).toBeNull();
  });

  it("does not let a daily challenge unlock a campaign level", () => {
    const delta = recordRun(emptyProgress(), {
      levelId: "daily-2026-09-07",
      score: 900,
      stars: 3,
      turns: 20,
      completed: true
    });
    expect(delta.unlockedLevelId).toBeNull();
    expect(levelsCompleted(delta.progress)).toBe(0);
  });

  it("returns a new object rather than mutating the input", () => {
    const before = emptyProgress();
    const delta = recordRun(before, { levelId: LEVELS[0].id, score: 500, stars: 2, turns: 20, completed: true });
    expect(before.levels[LEVELS[0].id]).toBeUndefined();
    expect(delta.progress).not.toBe(before);
  });
});

describe("currentLevelId", () => {
  it("points at the first uncleared level", () => {
    const progress = clear(emptyProgress(), LEVELS[0].id);
    expect(currentLevelId(progress)).toBe(LEVELS[1].id);
  });

  it("stays on the last level once the campaign is finished", () => {
    let progress = emptyProgress();
    for (const level of LEVELS) progress = clear(progress, level.id);
    expect(currentLevelId(progress)).toBe(LEVELS[LEVELS.length - 1].id);
  });
});

describe("mergeProgress", () => {
  it("takes the best of each level from both devices", () => {
    // Laptop cleared level 1 well; phone cleared level 2.
    const laptop = clear(emptyProgress("Laptop"), LEVELS[0].id, 900, 3);
    const phone = clear(emptyProgress("Phone"), LEVELS[1].id, 400, 1);

    const merged = mergeProgress(laptop, phone);

    expect(recordFor(merged, LEVELS[0].id).bestScore).toBe(900);
    expect(recordFor(merged, LEVELS[0].id).stars).toBe(3);
    expect(recordFor(merged, LEVELS[1].id).completed).toBe(true);
    expect(levelsCompleted(merged)).toBe(2);
    expect(totalStars(merged)).toBe(4);
  });

  it("never loses a completion held by only one side", () => {
    const local = clear(emptyProgress(), LEVELS[0].id, 100, 1);
    const remote = recordRun(emptyProgress(), {
      levelId: LEVELS[0].id,
      score: 999,
      stars: 3,
      turns: 12,
      completed: false // remote played it but never cleared it
    }).progress;

    const merged = mergeProgress(local, remote);
    expect(recordFor(merged, LEVELS[0].id).completed).toBe(true);
    expect(recordFor(merged, LEVELS[0].id).bestScore).toBe(999);
  });

  it("unions achievements and keeps a locally chosen name", () => {
    const local: PlayerProgress = { ...emptyProgress("Fiona"), achievements: ["first-coast"] };
    const remote: PlayerProgress = { ...emptyProgress("Old Name"), achievements: ["unbroken"] };

    const merged = mergeProgress(local, remote);
    expect(merged.displayName).toBe("Fiona");
    expect([...merged.achievements].sort()).toEqual(["first-coast", "unbroken"]);
  });

  it("falls back to the remote name when the local one is blank", () => {
    const local: PlayerProgress = { ...emptyProgress(""), achievements: [] };
    local.displayName = "";
    const remote = emptyProgress("Cloud Name");
    expect(mergeProgress(local, remote).displayName).toBe("Cloud Name");
  });
});
