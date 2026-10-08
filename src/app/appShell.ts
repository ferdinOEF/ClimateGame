import { startGameSession, type GameSessionHandle, type SessionResult } from "./gameSession";
import { resolveLevel, type LevelDef } from "@levels/levels";
import { newlyUnlocked } from "@levels/achievements";
import { syncWithCloud } from "@services/profileStore";
import {
  getProgress,
  onProgressChanged,
  recordRunResult,
  resetLocalProgress,
  setDisplayName,
  startProfileSync,
  unlockAchievements
} from "@services/profileStore";
import { ensureSignedIn, setStoredDisplayName } from "@services/auth";
import { isCloudConfigured } from "@services/env";
import { submitScore, type SubmitResult } from "@services/leaderboard";
import { renderMenuScreen } from "@ui/screens/menuScreen";
import { renderLevelSelectScreen } from "@ui/screens/levelSelectScreen";
import { renderResultsScreen } from "@ui/screens/resultsScreen";
import { renderLeaderboardScreen } from "@ui/screens/leaderboardScreen";
import { renderSettingsScreen } from "@ui/screens/settingsScreen";
import { renderAuthScreen } from "@ui/screens/authScreen";
import { renderPlayerSetupScreen } from "@ui/screens/playerSetupScreen";
import { isRegistered, restoreFromCloud } from "@services/playerRegistry";
import { clear } from "@ui/screens/screenHelpers";
import { REQUIRE_EMAIL, SHOW_MENU_EXTRAS } from "@services/features";
import { gateRoute, hashToRoute, routeToHash, type Route } from "./routeGate";
import { closeSources } from "@ui/sourcesScreen";

/**
 * The app shell: what screen is showing, and the lifecycle of the game
 * underneath it.
 *
 * Two DOM layers, kept strictly apart:
 *
 *   - `#game` is the session's world. `startGameSession` owns everything
 *     inside it and is the only thing that writes there.
 *   - `#screens` is the menu layer, drawn over the top. Screens are torn
 *     down and rebuilt wholesale on every navigation rather than diffed —
 *     there are five of them and they are cheap, so a diffing layer would
 *     be complexity bought for nothing.
 *
 * The shell also owns the ORDER of things after a run ends, which is the
 * part with real constraints: score the run, fold it into progress, work
 * out which badges that unlocked, and only then draw the results screen —
 * so the screen renders once, with everything on it, rather than
 * appearing and then mutating under the player.
 */

/**
 * How a navigation should affect browser history.
 *
 *   - `push`    a new entry. The default, and what makes Back meaningful.
 *   - `replace` swap the current entry. For screens that should not be a
 *               place Back returns to — the registration sheet once it has
 *               been filled in, and the results screen, which sits on top of
 *               a run that no longer exists.
 *   - `none`    the browser already moved; do not touch history. Used by the
 *               popstate handler, which would otherwise push an entry for the
 *               entry it was told to go back to.
 */
type HistoryMode = "push" | "replace" | "none";

/** What we store in `history.state`. The index is how `goBack` knows whether there is anywhere to go back TO. */
interface HistoryEntry {
  index: number;
}

export class AppShell {
  private readonly gameLayer: HTMLElement;
  private readonly screenLayer: HTMLElement;
  private session: GameSessionHandle | null = null;
  private route: Route = { name: "menu" };
  /**
   * How deep into this app's own history we are.
   *
   * Mirrors the `index` written into `history.state`, and exists for one
   * question `goBack` has to answer: is there an entry of OURS behind this
   * one? At index 0 there is not — the previous entry belongs to whatever
   * site the player came from — so Back has to become "go to the menu"
   * rather than leaving the game entirely, which is exactly the complaint
   * this whole mechanism was added to fix.
   */
  private historyIndex = 0;

  constructor(root: HTMLElement) {
    this.gameLayer = document.createElement("div");
    this.gameLayer.id = "game";
    this.gameLayer.className = "game-layer";

    this.screenLayer = document.createElement("div");
    this.screenLayer.id = "screens";
    this.screenLayer.className = "screen-layer";

    root.appendChild(this.gameLayer);
    root.appendChild(this.screenLayer);

    // Anonymous sign-in and the first cloud pull happen in the background.
    // Neither blocks the menu: a player should be able to start playing
    // while the network is still deciding whether it exists.
    if (isCloudConfigured()) void ensureSignedIn();
    startProfileSync();

    // A cloud sync landing after the menu is already drawn changes the
    // star counts and unlock state, so repaint when progress moves — but
    // only on a menu-ish screen. Repainting mid-run would tear down the
    // board the player is looking at.
    onProgressChanged(() => {
      if (this.route.name === "menu" || this.route.name === "levels" || this.route.name === "settings") {
        this.paint();
      }
    });

    // The browser's Back button used to leave the site, because the shell
    // kept its route in a field and never told the browser anything had
    // happened. Every navigation now writes an entry, and this restores
    // whichever one Back lands on.
    window.addEventListener("popstate", (event) => {
      const state = event.state as HistoryEntry | null;
      this.historyIndex = state?.index ?? 0;
      const route = hashToRoute(location.hash) ?? { name: "menu" };
      this.enter(route, "none");
    });

    // The entry the player arrives on. `replace`, not `push`: pushing here
    // would put a second entry on top of theirs, so the first Back press
    // would appear to do nothing.
    const initial = hashToRoute(location.hash) ?? { name: "menu" };
    this.enter(initial, "replace");
  }

  // ---- navigation ----------------------------------------------------

  /**
   * The single way into any route, from a click, a Back press or a pasted
   * link.
   *
   * Everything that has to happen on a route change happens here, in one
   * place: the gate on an unregistered player, starting or disposing the game
   * session, syncing history and painting. A second path that skipped any of
   * those is how a Back press ends up showing the menu over a still-running
   * WebGL context.
   */
  private enter(route: Route, mode: HistoryMode = "push"): void {
    closeSources();
    // The registration gate has to hold here too, not only on the menu
    // button. Otherwise a pasted `#/play/...` link walks straight past it.
    // With the email requirement off (the default, see features.ts) there is
    // no gate, and the sign-in and registration screens send people to the
    // menu instead.
    // `isRegistered()` reads the stored registration, so it is only asked when
    // the requirement is on: with it off, an earlier registration is never read.
    // The same goes for the leaderboard, settings and daily challenge while
    // the menu extras are off (also the default).
    const decision = gateRoute(route, {
      requireEmail: REQUIRE_EMAIL,
      registered: REQUIRE_EMAIL && isRegistered(),
      showMenuExtras: SHOW_MENU_EXTRAS
    });
    if (decision === "menu") {
      // Always rewrite the URL, even on a Back/forward or a hash typed into an
      // open tab (mode "none"), so the address bar does not keep showing a
      // screen that was never drawn.
      this.go({ name: "menu" }, mode === "push" ? "push" : "replace");
      return;
    }
    if (decision === "register" && route.name === "playing") {
      this.enter({ name: "player-setup", then: { levelId: route.level.id } }, mode);
      return;
    }

    if (route.name === "playing") {
      this.startLevel(route.level, mode);
      return;
    }
    this.go(route, mode);
  }

  /**
   * Back, as the player means it: return to wherever they came from.
   *
   * Delegates to the browser rather than guessing a destination, so the
   * in-app button and the hardware/browser Back button behave identically —
   * which is the only way the two can avoid contradicting each other.
   *
   * At the start of our own history there is nothing of ours behind us, so
   * calling `history.back()` would leave the site. The menu is the right
   * destination then: that is the case where somebody opened a level link
   * directly.
   */
  private goBack(): void {
    if (this.historyIndex > 0) window.history.back();
    else this.enter({ name: "menu" }, "replace");
  }

  private syncHistory(route: Route, mode: HistoryMode): void {
    if (mode === "none") return;
    // The menu gets a bare URL rather than a "#/" suffix. This is the address
    // being handed round for playtesting, and the first thing it does on load
    // should not be to rewrite itself into something uglier than what was
    // shared. `hashToRoute` already reads an empty hash as the menu, so
    // nothing downstream needs to care.
    const hash = route.name === "menu" ? `${location.pathname}${location.search}` : routeToHash(route);
    if (mode === "push") {
      this.historyIndex += 1;
      window.history.pushState({ index: this.historyIndex } satisfies HistoryEntry, "", hash);
    } else {
      window.history.replaceState({ index: this.historyIndex } satisfies HistoryEntry, "", hash);
    }
  }

  private go(route: Route, mode: HistoryMode = "push"): void {
    // Leaving the board always disposes the session. Doing it here, in one
    // place, is what guarantees a level transition cannot leak a WebGL
    // context or leave a stale timer running (see gameSession's dispose).
    if (route.name !== "playing" && this.session) {
      this.session.dispose();
      this.session = null;
      clear(this.gameLayer);
    }
    this.route = route;
    this.syncHistory(route, mode);
    this.paint();
  }

  private paint(): void {
    clear(this.screenLayer);
    const progress = getProgress();

    switch (this.route.name) {
      case "menu":
        this.screenLayer.hidden = false;
        renderMenuScreen(this.screenLayer, progress, {
          onPlay: (levelId) => this.requestLevel(levelId),
          onDaily: (levelId) => this.requestLevel(levelId),
          onLevelSelect: () => this.go({ name: "levels" }),
          onLeaderboard: () => this.enter({ name: "leaderboard" }),
          onSettings: () => this.enter({ name: "settings" }),
          onSignIn: () => this.enter({ name: "auth", mode: "signin" }),
          showAccount: REQUIRE_EMAIL,
          showExtras: SHOW_MENU_EXTRAS
        });
        break;

      case "levels":
        this.screenLayer.hidden = false;
        renderLevelSelectScreen(this.screenLayer, progress, {
          onPlay: (levelId) => this.requestLevel(levelId),
          onBack: () => this.goBack()
        });
        break;

      case "playing":
        // The screen layer is emptied and hidden so it cannot intercept
        // pointer events meant for the board.
        this.screenLayer.hidden = true;
        break;

      case "results":
        this.screenLayer.hidden = false;
        renderResultsScreen(this.screenLayer, this.route.context, {
          onNext: (levelId) => this.requestLevel(levelId),
          onRetry: (levelId) => this.requestLevel(levelId),
          onLevelSelect: () => this.go({ name: "levels" }),
          onMenu: () => this.go({ name: "menu" }),
          onLeaderboard: (levelId) => this.enter({ name: "leaderboard", levelId }),
          showAccount: REQUIRE_EMAIL,
          showLeaderboard: SHOW_MENU_EXTRAS
        });
        break;

      case "leaderboard": {
        this.screenLayer.hidden = false;
        const levelId = this.route.levelId;
        renderLeaderboardScreen(this.screenLayer, { onBack: () => this.goBack() }, levelId);
        break;
      }

      case "player-setup": {
        this.screenLayer.hidden = false;
        const then = this.route.then;
        renderPlayerSetupScreen(this.screenLayer, {
          onRegistered: () => {
            // Repaint rather than navigate when there is nowhere to go: the
            // menu reads the registration to greet the player by name, so it
            // has to be rebuilt either way.
            // The sheet has served its purpose, so the level REPLACES it:
            // a Back press from the board should reach the menu, not put the
            // player back in front of a form they just filled in.
            if (then) this.requestLevel(then.levelId, "replace");
            else this.goBack();
          },
          onCancel: () => this.goBack()
        });
        break;
      }

      case "auth":
        this.screenLayer.hidden = false;
        renderAuthScreen(
          this.screenLayer,
          {
            // A successful sign-in changes uid, so pull the account's save
            // and merge this device's play into it before showing anything.
            // syncWithCloud is best-of per level, so neither side is lost.
            onAuthenticated: () => {
              // Two independent pulls, because they answer different
              // questions: `syncWithCloud` merges stars and scores, while
              // `restoreFromCloud` recovers the name/age/email sheet so an
              // account used on a second browser is not asked to fill it in
              // again. Neither blocks the navigation below.
              void syncWithCloud().then(() => this.paint());
              void restoreFromCloud().then(() => this.paint());
              this.go({ name: "menu" });
            },
            onGuest: () => this.go({ name: "menu" }),
            onBack: () => this.goBack()
          },
          this.route.mode
        );
        break;

      case "settings":
        this.screenLayer.hidden = false;
        renderSettingsScreen(this.screenLayer, progress, {
          onBack: () => this.goBack(),
          onNameChange: (name) => {
            // Two stores, deliberately: the auth layer owns the name used
            // on leaderboard writes, the profile store owns the one shown
            // locally. Both are set here so they cannot drift.
            setStoredDisplayName(name);
            setDisplayName(name);
          },
          onResetProgress: () => {
            resetLocalProgress();
            this.go({ name: "menu" });
          },
          onSignIn: () => this.enter({ name: "auth", mode: "signin" }),
          onRefresh: () => this.paint(),
          // `then: null` — reached from Settings rather than from a blocked
          // Start, so saving returns to the menu instead of launching a level.
          onEditDetails: () => this.enter({ name: "player-setup", then: null }),
          showAccount: REQUIRE_EMAIL
        });
        break;
    }
  }

  // ---- running a level -----------------------------------------------

  /**
   * Every route into a level goes through here, which is what makes the
   * registration gate a gate rather than a suggestion.
   *
   * Three places can start a level — the menu's primary button, the daily
   * challenge button and the level list — plus the results screen's Next and
   * Retry. The results screen is deliberately NOT routed through this check:
   * by the time a player is looking at a score they have already registered,
   * and re-checking would only add a branch that can never be true.
   */
  private requestLevel(levelId: string, mode: HistoryMode = "push"): void {
    const level = resolveLevel(levelId);
    if (!level) {
      // A stale bookmark, an expired daily id, or a hand-edited URL. The
      // menu is a better landing place than a crash.
      this.enter({ name: "menu" });
      return;
    }
    this.enter({ name: "playing", level }, mode);
  }

  /**
   * `mode` is threaded through because of one case: arriving here straight
   * from the registration sheet. That sheet should not be somewhere Back
   * returns to once it has been filled in — the player answered it, and
   * being shown it again on a Back press reads as the game having lost the
   * answer — so the level REPLACES it in history rather than stacking on top.
   */
  private startLevel(level: LevelDef, mode: HistoryMode = "push"): void {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    clear(this.gameLayer);

    this.route = { name: "playing", level };
    this.syncHistory(this.route, mode);
    this.paint();

    this.session = startGameSession({
      container: this.gameLayer,
      level,
      onFinished: (result) => this.finishRun(level, result),
      // The in-game Back control and Escape both land here, and both defer to
      // the browser so they cannot disagree with its own Back button.
      onExit: () => this.goBack()
    });
  }

  /**
   * Everything that happens between "the run ended" and "the player sees
   * how they did", in the order it has to happen.
   */
  private finishRun(level: LevelDef, result: SessionResult): void {
    // 1. Fold the run into progress FIRST, because the achievement
    //    predicates need the post-run picture — "clear every level" can
    //    only be true once this run's clear is recorded.
    const provisional = recordRunResult({
      levelId: level.id,
      score: result.score.total,
      stars: result.score.stars,
      turns: result.turns,
      completed: result.completed
    });

    // 2. Work out which badges that unlocked.
    const unlocked = newlyUnlocked(
      {
        levelId: level.id,
        stats: result.stats,
        score: result.score,
        completed: result.completed,
        progress: provisional.progress,
        standingByElement: result.standingByElement,
        standingByCategory: result.standingByCategory
      },
      provisional.progress.achievements
    );

    // 3. Store the badges through their own path, not a second
    //    `recordRunResult` — that would count another attempt against the
    //    level and corrupt the tally the "Persistent" badge reads.
    unlockAchievements(unlocked);
    const delta = provisional;

    // 4. Publish. Daily runs go to the daily board; campaign runs were
    //    already submitted by recordRunResult when they were a personal
    //    best, so this only covers the daily case.
    const submission: Promise<SubmitResult> = level.id.startsWith("daily-") && result.completed
      ? submitScore({ levelId: level.id, score: result.score.total, stars: result.score.stars, turns: result.turns })
      : delta.cloudWrite.then<SubmitResult>(() =>
          isCloudConfigured()
            ? provisional.isNewBestScore && result.completed
              ? { status: "submitted" }
              : { status: "not-a-personal-best" }
            : { status: "offline" }
        );

    // `replace`: the results screen stands in for the run that just ended, so
    // Back from a score returns to wherever the player started the level
    // from rather than re-entering a level that is already over.
    this.go(
      {
        name: "results",
        context: {
          level,
          result,
          delta,
          newAchievements: unlocked,
          submission
        }
      },
      "replace"
    );
  }
}
