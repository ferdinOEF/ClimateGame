import { scoreRows, type SessionResult } from "@core/levelScore";
import { ACHIEVEMENT_BY_ID } from "@levels/achievements";
import { nextLevel, type LevelDef } from "@levels/levels";
import type { ProgressDelta } from "@levels/progression";
import type { SubmitResult } from "@services/leaderboard";
import { el, formatScore, starRow } from "./screenHelpers";

/**
 * The end-of-run screen: cleared or failed.
 *
 * Replaces `EraEndScreen`, which only ever had one story to tell ("you ran
 * out of Resilience, here is a number"). This one has to do considerably
 * more work, because it is the moment that decides whether the player
 * starts another run:
 *
 *   - Say clearly which of the two things happened.
 *   - Show the stars earned, and what the next star was worth, so a
 *     two-star clear carries an obvious reason to replay.
 *   - Break the score down, so the number feels earned rather than issued.
 *   - Surface any badge unlocked on this run.
 *   - Lead with the single most likely next action: next level on a clear,
 *     retry on a loss.
 *
 * A failed run still shows its full score breakdown. Hiding it would waste
 * the one moment the player is most receptive to learning what actually
 * scores.
 */
export interface ResultsActions {
  onNext: (levelId: string) => void;
  onRetry: (levelId: string) => void;
  onLevelSelect: () => void;
  onMenu: () => void;
  onLeaderboard: (levelId: string) => void;
}

export interface ResultsContext {
  level: LevelDef;
  result: SessionResult;
  delta: ProgressDelta;
  newAchievements: readonly string[];
  /** Resolves when the leaderboard write settles, so the screen can report where the score went without blocking on it. */
  submission: Promise<SubmitResult>;
}

export function renderResultsScreen(root: HTMLElement, ctx: ResultsContext, actions: ResultsActions): void {
  const { level, result, delta } = ctx;
  const cleared = result.completed;
  const follow = nextLevel(level.id);

  const submissionNote = el("div", { className: "results-submission", text: "" });

  const screen = el("div", {
    className: `screen results-screen${cleared ? " cleared" : " failed"}`,
    children: [
      el("div", {
        className: "results-card",
        children: [
          el("div", { className: "results-eyebrow", text: level.name }),
          el("h2", {
            className: "results-title",
            text: cleared ? "Coast held" : "The sea took it"
          }),
          el("p", {
            className: "results-subtitle",
            text: cleared
              ? `Every objective met in ${result.turns} turns.`
              : `Resilience hit zero after ${result.turns} turns. ${unmetSummary(ctx)}`
          }),

          el("div", { className: "results-stars", children: [starRow(result.score.stars)] }),
          nextStarHint(ctx),

          el("div", { className: "results-score", text: formatScore(result.score.total) }),
          delta.isNewBestScore && cleared
            ? el("div", { className: "results-best-flag", text: "New personal best" })
            : null,

          el("div", {
            className: "results-breakdown",
            children: scoreRows(result.score).map((row) =>
              el("div", {
                className: "results-row",
                children: [
                  el("span", { text: row.label }),
                  el("span", { text: `${row.value >= 0 ? "+" : ""}${Math.round(row.value)}` })
                ]
              })
            )
          }),

          achievementBlock(ctx),
          submissionNote,

          el("div", {
            className: "results-actions",
            children: [
              // The primary action is whichever one the player is most
              // likely to want: forward on a clear, another go on a loss.
              cleared && follow
                ? el("button", {
                    className: "btn btn-primary",
                    text: `Next — ${follow.name}`,
                    on: { click: () => actions.onNext(follow.id) }
                  })
                : el("button", {
                    className: "btn btn-primary",
                    text: cleared ? "Play again" : "Try again",
                    on: { click: () => actions.onRetry(level.id) }
                  }),
              cleared && follow
                ? el("button", { className: "btn", text: "Replay this level", on: { click: () => actions.onRetry(level.id) } })
                : null,
              el("button", {
                className: "btn",
                text: "Leaderboard",
                on: { click: () => actions.onLeaderboard(level.id) }
              }),
              el("button", { className: "btn", text: "Level select", on: { click: () => actions.onLevelSelect() } }),
              el("button", { className: "link-button", text: "Main menu", on: { click: () => actions.onMenu() } })
            ]
          })
        ]
      })
    ]
  });

  root.appendChild(screen);

  // Report where the score ended up once the write settles. Deliberately
  // after render: the player should never wait on the network to see how
  // they did.
  void ctx.submission.then((outcome) => {
    submissionNote.textContent = describeSubmission(outcome, cleared);
  });
}

/** Names the objectives that were still outstanding, so a loss says what was actually missing. */
function unmetSummary(ctx: ResultsContext): string {
  // The run failed, so by definition at least one objective was unmet; the
  // session already evaluated them, but the results screen only receives
  // the score. Re-deriving here would need the game state, which is gone
  // by now — so keep this to a nudge rather than a false specific.
  return ctx.result.stats.defensesDestroyed > 0
    ? `${ctx.result.stats.defensesDestroyed} defence${ctx.result.stats.defensesDestroyed === 1 ? "" : "s"} were lost along the way.`
    : "Try a deeper belt of defences before the next storm lands.";
}

/** Tells a 1- or 2-star player exactly what the next star costs. Nothing pulls a replay like a number that is nearly reached. */
function nextStarHint(ctx: ResultsContext): HTMLElement | null {
  const { score } = ctx.result;
  if (!ctx.result.completed || score.stars >= 3) return null;
  const target = ctx.level.starThresholds[score.stars];
  if (target === undefined) return null;
  const gap = Math.max(0, Math.round(target - score.total));
  return el("div", {
    className: "results-next-star",
    text: `${formatScore(gap)} more for ${score.stars + 1} stars`
  });
}

function achievementBlock(ctx: ResultsContext): HTMLElement | null {
  if (ctx.newAchievements.length === 0) return null;
  return el("div", {
    className: "results-achievements",
    children: [
      el("div", { className: "results-achievements-label", text: ctx.newAchievements.length === 1 ? "Badge unlocked" : "Badges unlocked" }),
      ...ctx.newAchievements.map((id) => {
        const achievement = ACHIEVEMENT_BY_ID.get(id);
        if (!achievement) return el("div", { className: "achievement-chip", text: id });
        return el("div", {
          className: "achievement-chip",
          children: [
            el("span", { className: "achievement-icon", text: achievement.icon, attrs: { "aria-hidden": "true" } }),
            el("span", {
              className: "achievement-text",
              children: [
                el("b", { text: achievement.name }),
                el("span", { text: achievement.description })
              ]
            })
          ]
        });
      })
    ]
  });
}

function describeSubmission(outcome: SubmitResult, cleared: boolean): string {
  if (!cleared) return "";
  switch (outcome.status) {
    case "submitted":
      return "Score posted to the leaderboard.";
    case "not-a-personal-best":
      return "Your best score for this level still stands.";
    case "offline":
      return "Saved on this device. Sign in to post to the leaderboard.";
    case "error":
      return outcome.message;
  }
}
