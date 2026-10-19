import { LEVELS } from "@levels/levels";
import {
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
import { menuModel, type MenuButtonSpec } from "./menuModel";
import { openSources } from "@ui/sourcesScreen";
import { menuTagline } from "./runWords";
import { SHOW_PARTNER_CREDITS } from "@services/features";

/**
 * The title screen — the first thing a player sees.
 *
 * By default it offers two things, "Tutorial" and "Play Panjim", under the
 * title. The rest of the old menu (Play/Continue, the Daily Challenge, the
 * Leaderboard, the stats tiles and the footer) is behind `SHOW_MENU_EXTRAS`;
 * which buttons appear is decided in `menuModel.ts`.
 */
export interface MenuActions {
  onPlay: (levelId: string) => void;
  onLevelSelect: () => void;
  onLeaderboard: () => void;
  onDaily: (levelId: string) => void;
  onSettings: () => void;
  onSignIn: () => void;
  /** Whether account features exist in this build (`REQUIRE_EMAIL`). Off, the sign-in link and "Signed in as" note are not drawn. */
  showAccount: boolean;
  /** `SHOW_MENU_EXTRAS`. Off, only "Tutorial" and "Play Panjim" are drawn. */
  showExtras: boolean;
}

export function renderMenuScreen(root: HTMLElement, progress: PlayerProgress, actions: MenuActions): void {
  const model = menuModel(progress, actions.showExtras);
  const completed = levelsCompleted(progress);
  const stars = totalStars(progress);
  const unlockedAchievements = progress.achievements.length;
  const account = getCurrentUser();
  // "Signed in" means a real provider is attached — an anonymous session
  // has a uid and a leaderboard row, but no way back to it from elsewhere.
  const signedIn = actions.showAccount && account?.hasProvider === true;

  const statsBlock = (): HTMLElement =>
    el("div", {
      className: "menu-stats",
      children: [
        statTile("Levels cleared", `${completed}/${LEVELS.length}`),
        statTile("Stars", `${stars}/${maxCampaignStars()}`),
        statTile("Best total", formatScore(totalScore(progress))),
        statTile("Badges", `${unlockedAchievements}/${ACHIEVEMENTS.length}`)
      ]
    });

  const footerBlock = (): HTMLElement =>
    el("div", {
      className: "menu-footer",
      children: [
        // Offered, never demanded — the guest session already saves and
        // already reaches the leaderboard. What an account buys is the
        // save following you to another device, so that is what the
        // button says.
        actions.showAccount && isCloudConfigured() && !signedIn
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
              : actions.showAccount
                ? "Playing as a guest — progress is saved on this device."
                : "Progress is saved on this device."
        })
      ]
    });

  const screen = el("div", {
    className: "screen menu-screen",
    children: [
      el("div", {
        className: "menu-hero",
        children: [
          el("div", { className: "menu-eyebrow", text: "A coast defence game set in Goa" }),
          el("h1", { className: "menu-title", text: "Riptide Rising" }),
          el("p", { className: "menu-tagline", text: menuTagline() })
        ]
      }),

      el("div", {
        className: "menu-actions",
        children: model.buttons.map((spec) => menuButton(spec, actions))
      }),

      model.showStatsAndFooter ? statsBlock() : null,
      model.showStatsAndFooter && stars > 0 ? el("div", { className: "menu-stars", children: [starRow(Math.min(3, Math.round(stars / Math.max(1, LEVELS.length))))] }) : null,

      model.showStatsAndFooter ? footerBlock() : null
    ]
  });

  // The header: the game's own Panjim board (a render, tools/shellArt.ts), fading into the page.
  root.appendChild(menuArt());
  root.appendChild(menuArtCredit());
  root.appendChild(screen);
  // The partner credits are behind `SHOW_PARTNER_CREDITS` (Section 17b, off by default); without them the way to
  // the Sources screen is a quiet text link in the bottom corner.
  if (SHOW_PARTNER_CREDITS) {
    const credits = creditsStrip();
    root.appendChild(credits);
    keepCreditsClear(screen, credits);
  } else root.appendChild(sourcesLink());
}

/** "Facts & sources", a small text link in the menu's bottom corner (Section 17b): the Sources screen as before. */
function sourcesLink(): HTMLElement {
  return el("button", { className: "menu-sources-link", text: "Facts & sources", on: { click: () => openSources() } });
}


function menuArt(): HTMLElement {
  const base = import.meta.env.BASE_URL;
  return el("div", {
    className: "menu-art",
    attrs: { "aria-hidden": "true" },
    children: [el("img", { attrs: { src: `${base}art/menu-header.jpg`, alt: "", decoding: "async", draggable: "false" } })]
  });
}

/** The header is a render of the Panjim board, whose streets and shore come from OpenStreetMap: credited as in the game. */
function menuArtCredit(): HTMLElement {
  return el("a", {
    className: "menu-art-credit",
    text: "Board render · map data © OpenStreetMap contributors",
    attrs: { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener noreferrer" }
  });
}

function menuButton(spec: MenuButtonSpec, actions: MenuActions): HTMLElement {
  const className = spec.id === "daily" ? "btn btn-daily" : spec.primary ? "btn btn-primary" : "btn";
  const run = (): void => {
    switch (spec.id) {
      case "tutorial":
      case "resume":
      case "panjim":
        actions.onPlay(spec.levelId!);
        break;
      case "daily":
        actions.onDaily(spec.levelId!);
        break;
      case "levels":
        actions.onLevelSelect();
        break;
      case "leaderboard":
        actions.onLeaderboard();
        break;
    }
  };
  return spec.sub
    ? el("button", {
        className,
        children: [el("span", { className: "btn-daily-label", text: spec.label }), el("span", { className: "btn-daily-sub", text: spec.sub })],
        on: { click: run }
      })
    : el("button", { className, text: spec.label, on: { click: run } });
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

/**
 * The cream strip at the foot of the landing page: who brings the game,
 * and the way to the Sources screen. Shown only with `SHOW_PARTNER_CREDITS`
 * (Section 17b). The logos are the supplied files
 * (public/branding/), shown at their own proportions and never as links.
 * Only on this screen: never in a level.
 */
function creditsStrip(): HTMLElement {
  const base = import.meta.env.BASE_URL;
  const logo = (src: string, alt: string, className: string, srcset?: string): HTMLImageElement => {
    const img = el("img", { className: `menu-credit-logo ${className}`, attrs: { src: `${base}${src}`, alt, decoding: "async", draggable: "false" } });
    if (srcset) img.srcset = srcset;
    return img;
  };
  return el("footer", {
    className: "menu-credits",
    children: [
      el("div", {
        className: "menu-credits-plate",
        children: [
          el("span", { className: "menu-credits-label", text: "Brought to you by" }),
          el("div", {
            className: "menu-credits-logos",
            children: [
              logo("branding/oneearth-foundation-256.webp", "OneEarth Foundation logo", "oneearth", undefined),
              logo("branding/gokhush-charitable-trust.svg", "Gokhush Charitable Trust logo", "gokhush")
            ]
          }),
          el("button", { className: "menu-credits-sources", text: "Facts & sources", on: { click: () => openSources() } })
        ]
      })
    ]
  });
}

/**
 * The plate is pinned to the foot of the window while that leaves it clear
 * of the menu (the usual case on desktop). If the menu would reach it (more
 * buttons, a short or narrow window where the plate wraps), the plate moves
 * into the flow below the menu instead. Checked again on every resize.
 */
function keepCreditsClear(screen: HTMLElement, credits: HTMLElement): void {
  const check = (): void => {
    if (!credits.isConnected) return;
    credits.classList.remove("in-flow");
    const plate = credits.getBoundingClientRect();
    if (getComputedStyle(credits).position !== "absolute") return;
    let bottom = 0;
    for (const child of screen.children) bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
    if (bottom + 12 > plate.top) credits.classList.add("in-flow");
  };
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      if (!credits.isConnected) observer.disconnect();
      else check();
    });
    observer.observe(screen);
    observer.observe(credits);
  }
  requestAnimationFrame(check);
}
