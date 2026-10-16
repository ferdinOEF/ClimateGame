import { LEVELS } from "@levels/levels";
import { isLevelUnlocked, recordFor, type PlayerProgress } from "@levels/progression";
import { el, formatScore, starRow } from "./screenHelpers";
import { savedRunYear } from "@levels/savedRun";
import { mapById } from "@levels/levelMap";

/**
 * The campaign list (Section 15): a centred card per level, each with a
 * small render of its own board, what a run is (builds and storms, from the
 * level's own numbers), its best stars and how far a saved run has got
 * ("In progress · 2031").
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

          const progressInfo = progressLine(level, record, unlocked);
          const card = el("button", {
            className: `level-card${unlocked ? "" : " locked"}${record.completed ? " cleared" : ""}`,
            attrs: unlocked ? {} : { disabled: "true", "aria-disabled": "true" },
            on: unlocked ? { click: () => actions.onPlay(level.id) } : {},
            children: [
              el("div", {
                className: "level-card-thumb",
                attrs: { "aria-hidden": "true" },
                children: [el("img", { attrs: { src: `${import.meta.env.BASE_URL}art/level-${level.mapId}.jpg`, alt: "", decoding: "async", loading: "lazy", draggable: "false" } })]
              }),
              el("div", {
                className: "level-card-top",
                children: [
                  el("span", { className: "level-number", text: String(index + 1).padStart(2, "0") }),
                  unlocked ? starRow(record.stars) : el("span", { className: "level-lock", text: "🔒", attrs: { "aria-label": "Locked" } })
                ]
              }),
              el("div", { className: "level-card-name", text: level.name }),
              el("div", { className: "level-card-sub", text: runSummary(level) }),
              el("div", { className: `level-card-best${progressInfo.muted ? " muted" : ""}`, text: progressInfo.text }),
              // A board drawn from OpenStreetMap is credited wherever it is shown (src/ui/attribution.ts).
              mapCredit(level.mapId)
            ]
          });
          return card;
        })
      })
    ]
  });

  root.appendChild(screen);
}

/** The map data credit under a thumbnail of a board drawn from OpenStreetMap; nothing for the made-up Tutorial coast. */
function mapCredit(mapId: string): HTMLElement | null {
  const attribution = mapById(mapId)?.source?.attribution;
  return attribution ? el("div", { className: "level-card-credit", text: `Map data ${attribution}` }) : null;
}

/** What a run of the level is, from its own numbers: "3 builds · 1 cyclone" or "25 builds · 3 storms". */
export function runSummary(level: (typeof LEVELS)[number]): string {
  if (!level.timeline) return level.subtitle;
  const builds = level.timeline.endYear - level.timeline.startYear + 1;
  const storms = level.climate?.challenges ?? [];
  const stormText = storms.length === 1 ? `1 ${storms[0].name.toLowerCase()}` : `${storms.length} storms`;
  return `${builds} builds · ${stormText} · ${level.timeline.startYear} to ${level.timeline.endYear}`;
}

/**
 * The card's last line (Section 12): "In progress · 2031" while a saved run
 * waits, the best stars once a run has finished, else "Not yet played" (or
 * how to unlock it).
 */
export function progressLine(
  level: (typeof LEVELS)[number],
  record: { stars: number; bestScore: number; completed: boolean },
  unlocked: boolean,
  savedYear: number | null = level.timeline ? savedRunYear(level.id, level.timeline.startYear, level.timeline.endYear - level.timeline.startYear + 1) : null
): { text: string; muted: boolean } {
  if (!unlocked) return { text: `Clear ${LEVELS[LEVELS.indexOf(level) - 1]?.name ?? "the previous level"} to unlock`, muted: true };
  if (savedYear !== null) return { text: `In progress · ${savedYear}`, muted: false };
  if (record.stars > 0) return { text: `Best ${"★".repeat(record.stars)}${"☆".repeat(Math.max(0, 3 - record.stars))}`, muted: false };
  if (record.bestScore > 0) return { text: `Best ${formatScore(record.bestScore)}`, muted: false };
  return { text: "Not yet played", muted: true };
}
