import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { menuModel, TUTORIAL_LEVEL_ID } from "../src/ui/screens/menuModel";
import { LEVELS } from "../src/levels/levels";
import { emptyProgress, type PlayerProgress } from "../src/levels/progression";
import { SHOW_TUTORIAL_BUTTON } from "../src/services/features";
import menuQuote from "../src/data/menuQuote.json";

const freshProgress = (): PlayerProgress => emptyProgress();

/** A profile that has cleared every campaign level, so "resume" would point past the tutorial. */
function finishedProgress(): PlayerProgress {
  const progress = freshProgress();
  for (const level of LEVELS) {
    progress.levels[level.id] = { levelId: level.id, completed: true, stars: 3, bestScore: 1000, bestTurns: 10, attempts: 1 };
  }
  return progress;
}

/**
 * Section 39.2 (owner decision): the menu shows only Play Panjim. The Tutorial level stays in the code and by its
 * route (`#/play/l00-tutorial`); its button is hidden by `SHOW_TUTORIAL_BUTTON`.
 */
describe("main menu, extras OFF (the default build)", () => {
  it("hides the Tutorial button by default", () => {
    expect(SHOW_TUTORIAL_BUTTON).toBe(false);
  });

  it("offers exactly one button, Play Panjim, the primary", () => {
    for (const progress of [freshProgress(), finishedProgress()]) {
      const model = menuModel(progress, false);
      expect(model.buttons.map((button) => button.label)).toEqual(["Play Panjim"]);
      expect(model.buttons[0].primary).toBe(true);
      expect(model.showStatsAndFooter).toBe(false);
    }
  });

  it("starts the Panaji game from Play Panjim, never the level select (Section 16.3)", () => {
    for (const progress of [freshProgress(), finishedProgress()]) {
      const play = menuModel(progress, false).buttons[0];
      expect(play.id).toBe("panjim");
      expect(play.levelId).toBe("l01-first-rains");
      expect(LEVELS.find((level) => level.id === play.levelId)?.mapId).toBe("panaji");
    }
    expect(menuModel(freshProgress(), false).buttons.map((button) => button.id)).not.toContain("levels");
  });

  it("keeps the Tutorial level, reachable by its route", () => {
    expect(LEVELS.some((level) => level.id === TUTORIAL_LEVEL_ID && level.tutorial)).toBe(true);
    expect(readFileSync("tools/walkthrough.ts", "utf8")).toContain("#/play/l00-tutorial");
  });

  it("offers no route to the daily challenge or the leaderboard", () => {
    const ids = menuModel(finishedProgress(), false).buttons.map((button) => button.id);
    expect(ids).not.toContain("daily");
    expect(ids).not.toContain("leaderboard");
    expect(ids).not.toContain("resume");
  });
});

describe("the Tutorial button, with SHOW_TUTORIAL_BUTTON on", () => {
  it("comes first and is the primary, starting l00-tutorial whatever the progress", () => {
    for (const progress of [freshProgress(), finishedProgress()]) {
      const model = menuModel(progress, false, true);
      expect(model.buttons.map((button) => button.label)).toEqual(["Tutorial", "Play Panjim"]);
      expect(model.buttons[0].primary).toBe(true);
      expect(model.buttons[0].levelId).toBe(TUTORIAL_LEVEL_ID);
      expect(model.buttons[1].primary).toBe(false);
    }
  });
});

describe("main menu, extras ON", () => {
  it("brings back the old menu around the Tutorial button", () => {
    const model = menuModel(finishedProgress(), true, true);
    expect(model.buttons.map((button) => button.id)).toEqual(["tutorial", "resume", "panjim", "daily", "leaderboard"]);
    expect(model.buttons[0].levelId).toBe(TUTORIAL_LEVEL_ID);
    expect(model.buttons[1].label).toBe("Play again");
    expect(model.buttons.find((button) => button.id === "daily")?.levelId).toMatch(/^daily-/);
    expect(model.showStatsAndFooter).toBe(true);
  });

  it("drops the resume button while it would only repeat Tutorial", () => {
    const ids = menuModel(freshProgress(), true, true).buttons.map((button) => button.id);
    expect(ids).toEqual(["tutorial", "panjim", "daily", "leaderboard"]);
  });

  it("without the Tutorial button, starts with the resume button", () => {
    const ids = menuModel(finishedProgress(), true).buttons.map((button) => button.id);
    expect(ids).toEqual(["resume", "panjim", "daily", "leaderboard"]);
  });
});

describe("the quote band (Section 39.2)", () => {
  it("stores the owner's quote word for word, with its author and source", () => {
    expect(menuQuote.author).toBe("Haruki Murakami");
    expect(menuQuote.source).toBe("Kafka on the Shore");
    expect(menuQuote.text.startsWith("Once the storm is over, you won't remember how you made it through")).toBe(true);
    expect(menuQuote.text.endsWith("That's what this storm's all about.")).toBe(true);
  });
});
