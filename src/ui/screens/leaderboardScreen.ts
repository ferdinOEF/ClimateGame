import { LEVELS, dailyChallengeLevel, isDailyLevel } from "@levels/levels";
import { isCloudConfigured } from "@services/env";
import { fetchGlobalBoard, fetchLevelBoard } from "@services/leaderboard";
import { el, formatScore, starRow, clear } from "./screenHelpers";

/**
 * The scoreboard.
 *
 * Three boards behind one set of tabs: overall (summed campaign bests),
 * per-level, and today's daily challenge. Each is a single bounded query —
 * see the note in leaderboard.ts about why every read here is capped.
 *
 * The offline case is a first-class state, not an error. A build with no
 * Firebase config, a player in a privacy mode that blocks auth, a dropped
 * connection — all land on the same honest message rather than a spinner
 * that never resolves.
 */
export interface LeaderboardActions {
  onBack: () => void;
}

type Tab = { kind: "global" } | { kind: "level"; levelId: string } | { kind: "daily" };

export function renderLeaderboardScreen(root: HTMLElement, actions: LeaderboardActions, initialLevelId?: string): void {
  let tab: Tab = initialLevelId
    ? isDailyLevel(initialLevelId)
      ? { kind: "daily" }
      : { kind: "level", levelId: initialLevelId }
    : { kind: "global" };

  const body = el("div", { className: "board-body" });

  const levelPicker = el("select", {
    className: "board-level-picker",
    on: {
      change: (event) => {
        tab = { kind: "level", levelId: (event.target as HTMLSelectElement).value };
        paintTabs();
        void load();
      }
    },
    children: LEVELS.map((level) =>
      el("option", { text: level.name, attrs: { value: level.id } })
    )
  }) as HTMLSelectElement;

  const tabs = el("div", { className: "board-tabs" });

  function paintTabs(): void {
    clear(tabs);
    tabs.appendChild(tabButton("Overall", tab.kind === "global", () => {
      tab = { kind: "global" };
      paintTabs();
      void load();
    }));
    tabs.appendChild(tabButton("By level", tab.kind === "level", () => {
      tab = { kind: "level", levelId: levelPicker.value || LEVELS[0].id };
      paintTabs();
      void load();
    }));
    tabs.appendChild(tabButton("Daily", tab.kind === "daily", () => {
      tab = { kind: "daily" };
      paintTabs();
      void load();
    }));
    levelPicker.hidden = tab.kind !== "level";
    if (tab.kind === "level") levelPicker.value = tab.levelId;
  }

  async function load(): Promise<void> {
    clear(body);

    if (!isCloudConfigured()) {
      body.appendChild(
        emptyState(
          "Leaderboards are offline",
          "This build has no Firebase project configured, so scores stay on this device. See docs/DEPLOY.md to connect one."
        )
      );
      return;
    }

    body.appendChild(el("div", { className: "board-loading", text: "Loading…" }));

    if (tab.kind === "global") {
      const rows = await fetchGlobalBoard();
      clear(body);
      if (rows.length === 0) {
        body.appendChild(emptyState("No scores yet", "Clear a level to put the first name on the board."));
        return;
      }
      body.appendChild(
        boardTable(["#", "Player", "Levels", "Stars", "Total"], rows.map((row) => ({
          isSelf: row.isSelf,
          cells: [
            String(row.rank),
            row.displayName,
            String(row.levelsCompleted),
            String(row.totalStars),
            formatScore(row.totalScore)
          ]
        })))
      );
      return;
    }

    const levelId = tab.kind === "daily" ? dailyChallengeLevel().id : tab.levelId;
    const rows = await fetchLevelBoard(levelId);
    clear(body);
    if (rows.length === 0) {
      body.appendChild(
        emptyState(
          "No scores yet",
          tab.kind === "daily"
            ? "Today's challenge is fresh. Be the first to post a time."
            : "Nobody has posted a score for this level yet."
        )
      );
      return;
    }
    body.appendChild(
      boardTable(["#", "Player", "Stars", "Turns", "Score"], rows.map((row) => ({
        isSelf: row.isSelf,
        cells: [String(row.rank), row.displayName, "", String(row.turns), formatScore(row.score)],
        // Stars render as a glyph row rather than a number, so column 3 is
        // supplied as a node instead of text.
        starsAt: { index: 2, stars: row.stars }
      })))
    );
  }

  const screen = el("div", {
    className: "screen leaderboard-screen",
    children: [
      el("div", {
        className: "screen-header",
        children: [
          el("button", { className: "link-button", text: "← Back", on: { click: () => actions.onBack() } }),
          el("h2", { className: "screen-title", text: "Leaderboard" })
        ]
      }),
      tabs,
      levelPicker,
      body
    ]
  });

  root.appendChild(screen);
  paintTabs();
  void load();
}

function tabButton(label: string, active: boolean, onClick: () => void): HTMLElement {
  return el("button", {
    className: `board-tab${active ? " active" : ""}`,
    text: label,
    attrs: active ? { "aria-current": "true" } : {},
    on: { click: onClick }
  });
}

interface BoardRow {
  cells: string[];
  isSelf: boolean;
  starsAt?: { index: number; stars: number };
}

function boardTable(headers: string[], rows: BoardRow[]): HTMLElement {
  return el("table", {
    className: "board-table",
    children: [
      el("thead", {
        children: [el("tr", { children: headers.map((h) => el("th", { text: h })) })]
      }),
      el("tbody", {
        children: rows.map((row) =>
          el("tr", {
            className: row.isSelf ? "is-self" : "",
            children: row.cells.map((cell, index) =>
              row.starsAt && row.starsAt.index === index
                ? el("td", { children: [starRow(row.starsAt.stars)] })
                // Player-supplied display names land here. `text` sets
                // textContent, so a name can never be parsed as markup.
                : el("td", { text: cell })
            )
          })
        )
      })
    ]
  });
}

function emptyState(title: string, body: string): HTMLElement {
  return el("div", {
    className: "board-empty",
    children: [
      el("div", { className: "board-empty-title", text: title }),
      el("p", { className: "board-empty-body", text: body })
    ]
  });
}
