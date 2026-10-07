import { LEVELS, dailyChallengeLevel, type LevelDef } from "@levels/levels";
import { currentLevelId, levelsCompleted, type PlayerProgress } from "@levels/progression";

/**
 * What the main menu offers, decided without a DOM so the tests can check it
 * in Node. `renderMenuScreen` draws exactly this.
 */

/** The menu's first button always starts this level, whatever the player's progress. */
export const TUTORIAL_LEVEL_ID = "l00-tutorial";

export type MenuButtonId = "tutorial" | "resume" | "levels" | "daily" | "leaderboard";

export interface MenuButtonSpec {
  id: MenuButtonId;
  label: string;
  /** Second line, used by the daily button for the day's subtitle. */
  sub?: string;
  primary: boolean;
  /** The level the button starts, for the ones that start a level. */
  levelId?: string;
}

export interface MenuModel {
  buttons: MenuButtonSpec[];
  /** The stats tiles, the star row and the footer (settings, sign-in, progress note). */
  showStatsAndFooter: boolean;
}

/**
 * The buttons, in order.
 *
 * With the extras off (the default build) there are two: "Tutorial" and
 * "Choose a level". With them on, the old menu comes back around them: the
 * Play/Continue/Play again button, the Daily Challenge, the Leaderboard, and
 * the stats and footer. "Tutorial" stays first either way, so the first button
 * always means the same thing.
 */
export function menuModel(progress: PlayerProgress, showExtras: boolean): MenuModel {
  const buttons: MenuButtonSpec[] = [{ id: "tutorial", label: "Tutorial", primary: true, levelId: TUTORIAL_LEVEL_ID }];

  if (showExtras) {
    const resumeId = currentLevelId(progress);
    const resumeLevel = LEVELS.find((level) => level.id === resumeId) ?? LEVELS[0];
    // Pointing at the tutorial it would only repeat the button above it.
    if (resumeLevel.id !== TUTORIAL_LEVEL_ID) {
      const completed = levelsCompleted(progress);
      buttons.push({
        id: "resume",
        label: primaryActionLabel(resumeLevel, completed, completed >= LEVELS.length),
        primary: false,
        levelId: resumeLevel.id
      });
    }
  }

  buttons.push({ id: "levels", label: "Choose a level", primary: false });

  if (showExtras) {
    const daily = dailyChallengeLevel();
    buttons.push({ id: "daily", label: "Daily Challenge", sub: daily.subtitle, primary: false, levelId: daily.id });
    buttons.push({ id: "leaderboard", label: "Leaderboard", primary: false });
  }

  return { buttons, showStatsAndFooter: showExtras };
}

/**
 * What the resume button says: "Play" for a brand-new player and "Continue"
 * once there is something to continue, so the label tells them which
 * situation they are in without their having to work it out.
 */
function primaryActionLabel(resumeLevel: LevelDef, completed: number, campaignDone: boolean): string {
  if (resumeLevel.tutorial) return resumeLevel.name;
  if (campaignDone) return "Play again";
  return completed === 0 ? `Play — ${resumeLevel.name}` : `Continue — ${resumeLevel.name}`;
}
