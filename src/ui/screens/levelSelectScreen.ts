import { LEVELS } from "@levels/levels";
import { isLevelUnlocked, recordFor, type PlayerProgress } from "@levels/progression";
import { describeObjective } from "@core/objectives";
import { el, formatScore, starRow } from "./screenHelpers";

/**
 * The campaign list.
 *
 * Every level shows its stars, its personal best and — crucially — its
 * objectives, even before it is unlocked. Showing a locked level's goals
 * is the point rather than a leak: knowing that level 5 is about Khazan
 * fields is exactly what makes finishing level 4 feel worth doing. A row
 * of anonymous padlocks motivates nobody.
 */
export interface LevelSelectActions {
  onPlay: (levelId: string) => void;
  onBack: () => void;
}

export function renderLevelSelectScreen(root: HTMLElement, progress: PlayerProgress, actions: LevelSelectActions): void {
  const screen = el("div", {
    className: "screen level-select-screen",
    children: [
      el("div", {
        className: "screen-header",
        children: [
          el("button", { className: "link-button", text: "← Back", on: { click: () => actions.onBack() } }),
          el("h2", { className: "screen-title", text: "Choose a level" })
        ]
      }),
      el("div", {
        className: "level-grid",
        children: LEVELS.map((level, index) => {
          const record = recordFor(progress, level.id);
          const unlocked = isLevelUnlocked(progress, level.id);

          const card = el("button", {
            className: `level-card${unlocked ? "" : " locked"}${record.completed ? " cleared" : ""}`,
            attrs: unlocked ? {} : { disabled: "true", "aria-disabled": "true" },
            on: unlocked ? { click: () => actions.onPlay(level.id) } : {},
            children: [
              el("div", {
                className: "level-card-top",
                children: [
                  el("span", { className: "level-number", text: String(index + 1).padStart(2, "0") }),
                  unlocked ? starRow(record.stars) : el("span", { className: "level-lock", text: "🔒", attrs: { "aria-label": "Locked" } })
                ]
              }),
              el("div", { className: "level-card-name", text: level.name }),
              el("div", { className: "level-card-sub", text: level.subtitle }),
              el("ul", {
                className: "level-card-goals",
                children: level.objectives.map((objective) =>
                  el("li", { text: describeObjective(objective) })
                )
              }),
              record.bestScore > 0
                ? el("div", { className: "level-card-best", text: `Best ${formatScore(record.bestScore)}` })
                : el("div", {
                    className: "level-card-best muted",
                    text: unlocked ? "Not yet played" : `Clear ${LEVELS[index - 1]?.name ?? "the previous level"} to unlock`
                  })
            ]
          });
          return card;
        })
      })
    ]
  });

  root.appendChild(screen);
}
