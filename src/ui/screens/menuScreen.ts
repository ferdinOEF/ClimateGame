import { LEVELS, dailyChallengeLevel, type LevelDef } from "@levels/levels";
import {
  currentLevelId,
  levelsCompleted,
  maxCampaignStars,
  totalScore,
  totalStars,
  type PlayerProgress
} from "@levels/progression";
import { ACHIEVEMENTS } from "@levels/achievements";
import { isCloudConfigured } from "@services/env";
import { getCurrentUser } from "@services/auth";
import { el, formatScore, starRow } from "./screenHelpers";

/**
 * The title screen — the first thing a player sees.
 *
 * Takes over the role the old `WelcomeModal` played (a title moment on
 * every load), but with somewhere to go from it. The primary button is
 * always "continue where you left off" rather than a level list, because
 * the overwhelming majority of visits want exactly one thing: to keep
 * playing. The list is one tap away for the minority who want to replay.
 */
export interface MenuActions {
  onPlay: (levelId: string) => void;
  onLevelSelect: () => void;
  onLeaderboard: () => void;
  onDaily: (levelId: string) => void;
  onSettings: () => void;
  onSignIn: () => void;
}

export function renderMenuScreen(root: HTMLElement, progress: PlayerProgress, actions: MenuActions): void {
  const resumeId = currentLevelId(progress);
  const resumeLevel = LEVELS.find((level) => level.id === resumeId) ?? LEVELS[0];
  const completed = levelsCompleted(progress);
  const stars = totalStars(progress);
  const campaignDone = completed >= LEVELS.length;
  const daily = dailyChallengeLevel();
  const unlockedAchievements = progress.achievements.length;
  const account = getCurrentUser();
  // "Signed in" means a real provider is attached — an anonymous session
  // has a uid and a leaderboard row, but no way back to it from elsewhere.
  const signedIn = account?.hasProvider === true;

  const screen = el("div", {
    className: "screen menu-screen",
    children: [
      el("div", {
        className: "menu-hero",
        children: [
          el("div", { className: "menu-eyebrow", text: "A coast defence game set in Goa" }),
          el("h1", { className: "menu-title", text: "Riptide Rising" }),
          el("p", {
            className: "menu-tagline",
            text: "Nature's coming. Grow your coast, plant your defences, and see if your slice of Goa can survive the sea."
          })
        ]
      }),

      el("div", {
        className: "menu-actions",
        children: [
          el("button", {
            className: "btn btn-primary",
            text: primaryActionLabel(resumeLevel, completed, campaignDone),
            on: { click: () => actions.onPlay(resumeId) }
          }),
          el("button", {
            className: "btn",
            text: "Choose a level",
            on: { click: () => actions.onLevelSelect() }
          }),
          el("button", {
            className: "btn btn-daily",
            children: [
              el("span", { className: "btn-daily-label", text: "Daily Challenge" }),
              el("span", { className: "btn-daily-sub", text: daily.subtitle })
            ],
            on: { click: () => actions.onDaily(daily.id) }
          }),
          el("button", {
            className: "btn",
            text: "Leaderboard",
            on: { click: () => actions.onLeaderboard() }
          })
        ]
      }),

      el("div", {
        className: "menu-stats",
        children: [
          statTile("Levels cleared", `${completed}/${LEVELS.length}`),
          statTile("Stars", `${stars}/${maxCampaignStars()}`),
          statTile("Best total", formatScore(totalScore(progress))),
          statTile("Badges", `${unlockedAchievements}/${ACHIEVEMENTS.length}`)
        ]
      }),

      stars > 0 ? el("div", { className: "menu-stars", children: [starRow(Math.min(3, Math.round(stars / Math.max(1, LEVELS.length))))] }) : null,

      el("div", {
        className: "menu-footer",
        children: [
          // Offered, never demanded — the guest session already saves and
          // already reaches the leaderboard. What an account buys is the
          // save following you to another device, so that is what the
          // button says.
          isCloudConfigured() && !signedIn
            ? el("button", { className: "link-button", text: "Sign in or create an account", on: { click: () => actions.onSignIn() } })
            : null,
          el("button", { className: "link-button", text: "Settings & profile", on: { click: () => actions.onSettings() } }),
          // Say plainly where progress is actually kept. A player who never
          // sees their name on a board should know why, rather than
          // assuming the leaderboard is broken.
          el("span", {
            className: "menu-cloud-note",
            text: !isCloudConfigured()
              ? "Running offline — progress is saved on this device only."
              : signedIn
                ? `Signed in${account?.email ? ` as ${account.email}` : ""} — progress syncs across devices.`
                : "Playing as a guest — progress is saved on this device."
          })
        ]
      })
    ]
  });

  root.appendChild(screen);
}

/**
 * What the big button says.
 *
 * "Play" for a brand-new player and "Continue" once there is something to
 * continue, so the label tells them which situation they are in without their
 * having to work it out.
 *
 * The tutorial is the exception and just says "Tutorial". Prefixing it reads
 * oddly in both directions — "Play - Tutorial" is noise, and "Continue -
 * Tutorial" is wrong in the common case where nobody has started one. The
 * name alone is the clearest thing the button can say.
 */
function primaryActionLabel(resumeLevel: LevelDef, completed: number, campaignDone: boolean): string {
  if (resumeLevel.tutorial) return resumeLevel.name;
  if (campaignDone) return "Play again";
  return completed === 0 ? `Play — ${resumeLevel.name}` : `Continue — ${resumeLevel.name}`;
}

function statTile(label: string, value: string): HTMLElement {
  return el("div", {
    className: "stat-tile",
    children: [
      el("div", { className: "stat-value", text: value }),
      el("div", { className: "stat-label", text: label })
    ]
  });
}
