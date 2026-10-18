import { describe, expect, it } from "vitest";
import { menuModel, TUTORIAL_LEVEL_ID } from "../src/ui/screens/menuModel";
import { LEVELS } from "../src/levels/levels";
import { emptyProgress, type PlayerProgress } from "../src/levels/progression";

const freshProgress = (): PlayerProgress => emptyProgress();

/** A profile that has cleared every campaign level, so "resume" would point past the tutorial. */
function finishedProgress(): PlayerProgress {
  const progress = freshProgress();
  for (const level of LEVELS) {
    progress.levels[level.id] = { levelId: level.id, completed: true, stars: 3, bestScore: 1000, bestTurns: 10, attempts: 1 };
  }
  return progress;
}

describe("main menu, extras OFF (the default build)", () => {
  it("offers exactly two buttons: Tutorial and Play Panjim", () => {
    const model = menuModel(freshProgress(), false);
    expect(model.buttons.map((button) => button.label)).toEqual(["Tutorial", "Play Panjim"]);
    expect(model.showStatsAndFooter).toBe(false);
  });

  it("starts the Panaji game from Play Panjim, never the level select (Section 16.3)", () => {
    for (const progress of [freshProgress(), finishedProgress()]) {
      const play = menuModel(progress, false).buttons[1];
      expect(play.id).toBe("panjim");
      expect(play.levelId).toBe("l01-first-rains");
      expect(LEVELS.find((level) => level.id === play.levelId)?.mapId).toBe("panaji");
    }
    expect(menuModel(freshProgress(), false).buttons.map((button) => button.id)).not.toContain("levels");
  });

  it("starts l00-tutorial from the first button, whatever the progress", () => {
    for (const progress of [freshProgress(), finishedProgress()]) {
      const first = menuModel(progress, false).buttons[0];
      expect(first.id).toBe("tutorial");
      expect(first.primary).toBe(true);
      expect(first.levelId).toBe("l00-tutorial");
    }
    expect(LEVELS.some((level) => level.id === TUTORIAL_LEVEL_ID && level.tutorial)).toBe(true);
  });

  it("offers no route to the daily challenge or the leaderboard", () => {
    const ids = menuModel(finishedProgress(), false).buttons.map((button) => button.id);
    expect(ids).not.toContain("daily");
    expect(ids).not.toContain("leaderboard");
    expect(ids).not.toContain("resume");
  });
});

describe("main menu, extras ON", () => {
  it("brings back the old menu around the Tutorial button", () => {
    const model = menuModel(finishedProgress(), true);
    expect(model.buttons.map((button) => button.id)).toEqual(["tutorial", "resume", "panjim", "daily", "leaderboard"]);
    expect(model.buttons[0].levelId).toBe(TUTORIAL_LEVEL_ID);
    expect(model.buttons[1].label).toBe("Play again");
    expect(model.buttons.find((button) => button.id === "daily")?.levelId).toMatch(/^daily-/);
    expect(model.showStatsAndFooter).toBe(true);
  });

  it("drops the resume button while it would only repeat Tutorial", () => {
    const ids = menuModel(freshProgress(), true).buttons.map((button) => button.id);
    expect(ids).toEqual(["tutorial", "panjim", "daily", "leaderboard"]);
  });
});
