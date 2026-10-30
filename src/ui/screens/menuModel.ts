import { LEVELS, dailyChallengeLevel, type LevelDef } from "@levels/levels";
import { currentLevelId, levelsCompleted, type PlayerProgress } from "@levels/progression";
import { PANAJI_LEVEL_ID } from "./runWords";
import { SHOW_TUTORIAL_BUTTON } from "@services/features";

/**
 * What the main menu offers, decided without a DOM so the tests can check it
 * in Node. `renderMenuScreen` draws exactly this.
 */

/** The level the "Tutorial" button starts, whatever the player's progress (the button shows with `SHOW_TUTORIAL_BUTTON`). */
export const TUTORIAL_LEVEL_ID = "l00-tutorial";

export type MenuButtonId = "tutorial" | "resume" | "panjim" | "levels" | "daily" | "leaderboard";

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
 * With the extras off (the default build) there is one, "Play Panjim"
 * (Section 39.2, owner decision), the primary button, which starts the Panaji
 * game; the "Tutorial" button comes first only with `showTutorial`
 * (`SHOW_TUTORIAL_BUTTON`, off by default). The level select is still reachable
 * at its own address (#/levels), but no button leads there. With the extras
 * on, the old menu comes back around them: the
 * Play/Continue/Play again button, the Daily Challenge, the Leaderboard, and
 * the stats and footer. "Tutorial", when shown, stays first either way.
 */
export function menuModel(progress: PlayerProgress, showExtras: boolean, showTutorial: boolean = SHOW_TUTORIAL_BUTTON): MenuModel {
  const buttons: MenuButtonSpec[] = showTutorial ? [{ id: "tutorial", label: "Tutorial", primary: true, levelId: TUTORIAL_LEVEL_ID }] : [];

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

  buttons.push({ id: "panjim", label: "Play Panjim", primary: !showTutorial, levelId: PANAJI_LEVEL_ID });

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
  return completed === 0 ? `Play ${resumeLevel.name}` : `Continue ${resumeLevel.name}`;
}
