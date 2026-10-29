import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARD_OFFLINE, nameCardHtml, topTenHtml } from "../src/ui/panjim/nameCard";
import { punctuationProblems } from "./helpers/uiStrings";

/** Section 35.3: the name card at the start of Play Panjim. */
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const rows = Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, name: i === 0 ? "<b>@goa</b>" : `Player ${i + 1}`, points: 5000 - i * 100, stars: 7, season: "Festival 2026" }));

describe("the name card", () => {
  it("says what the board is, asks for a name, and offers Play and Play without a name", () => {
    const t = text(nameCardHtml(null));
    for (const words of [
      "PLAY PANJIM, 2026 TO 2050",
      "Save Panjim. Get your name on the board.",
      "Save Panjim and your name goes up on the board. Points come in after each storm.",
      "Your name or Instagram handle",
      "2 to 30 letters or numbers. Shown only on the board.",
      "Play Play without a name"
    ]) {
      expect(t).toContain(words);
    }
    expect(nameCardHtml(null)).toContain('placeholder="@yourhandle"');
    expect(t).not.toMatch(/new board in|days/);
  });

  it("goes field, Play, Play without a name, then the list, by Tab; Enter in the field is Play", () => {
    const html = nameCardHtml(null);
    const at = (s: string): number => html.indexOf(s);
    expect(at('class="name-card-field"')).toBeLessThan(at('class="name-card-play'));
    expect(at('class="name-card-play')).toBeLessThan(at('class="name-card-skip'));
    expect(at('class="name-card-skip')).toBeLessThan(at('class="name-card-top"'));
    // A form: Enter in its one field submits it, and Play is its submit button.
    expect(html).toMatch(/<form class="name-card-main"/);
    expect(html).toContain('<button type="submit" class="name-card-play');
    expect(topTenHtml({ status: "ready", rows, season: "Festival 2026" })).toContain('tabindex="0"');
  });

  it("Section 35.8: Play full width in the main style, Play without a name a plain underlined text button under it, 44 px", () => {
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    expect(nameCardHtml(null)).toContain('<button type="submit" class="name-card-play btn-primary">Play</button>');
    expect(nameCardHtml(null)).toContain('<button type="button" class="name-card-skip">Play without a name</button>');
    expect(css).toMatch(/\.name-card-actions \{[^}]*flex-direction: column;/);
    expect(css).toMatch(/\.name-card-actions \.name-card-play \{[^}]*width: 100%;/);
    const skip = css.slice(css.indexOf(".name-card-actions .name-card-skip {"), css.indexOf("}", css.indexOf(".name-card-actions .name-card-skip {")));
    expect(skip).toMatch(/min-height: 44px;/);
    expect(skip).toMatch(/text-decoration: underline;/);
    expect(skip).toMatch(/background: none;/);
  });

  it("preloads the run's name (Play again keeps it), escaped", () => {
    expect(nameCardHtml('@a"b')).toContain('value="@a&quot;b"');
  });

  it("shows the top 10: rank, name, points and season", () => {
    const html = topTenHtml({ status: "ready", rows, season: "Festival 2026" });
    expect(html.match(/<li>/g)?.length).toBe(10);
    expect(text(html)).toContain("Top 10");
    expect(text(html)).toContain("2 Player 2 4900 Festival 2026");
    expect(html).toContain("&lt;b&gt;@goa&lt;/b&gt;");
    expect(text(topTenHtml({ status: "ready", rows: [], season: "Festival 2026" }))).toContain("No one is on the board yet.");
  });

  it("offline: Board offline, and the game plays the same", () => {
    const t = text(topTenHtml({ status: "offline" }));
    expect(t).toContain("Board offline");
    expect(t).toContain("The board can't be reached right now. You can still play, and your points show at the end.");
    expect(BOARD_OFFLINE).toBe("The board can't be reached right now. You can still play, and your points show at the end.");
  });

  it("has no dots, spaced dashes or hyphens between words", () => {
    for (const s of [text(nameCardHtml(null)), text(topTenHtml({ status: "offline" })), text(topTenHtml({ status: "loading" }))]) expect(punctuationProblems(s), s).toEqual([]);
  });
});

describe("the name lives in memory for this run only", () => {
  it("is never written to storage", () => {
    for (const file of ["src/services/playerName.ts", "src/ui/panjim/nameCard.ts", "src/services/board.ts"]) expect(readFileSync(file, "utf8")).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });

  it("is cleared at the menu (Exit, Leave, the idle reset) and kept by Play again", () => {
    const shell = readFileSync("src/app/appShell.ts", "utf8");
    const menu = shell.slice(shell.indexOf('case "menu":'), shell.indexOf("renderMenuScreen("));
    expect(menu).toContain("clearPlayerName();");
    expect(shell).not.toMatch(/requestLevel\([^)]*\)[^;]*clearPlayerName/);
  });

  it("shows only in Play Panjim, before its start popup", () => {
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    expect(session).toContain('const skipNameCard = qaHooks && new URLSearchParams(window.location.search).has("noname");');
    expect(session).toMatch(/if \(level\.timeModel === "years" && !level\.tutorial && !skipNameCard\) \{\s*const nameCard = new NameCard\(getPlayerName\(\), fetchTop\(\)\);\s*const showPopup = objectivesPanel\.showFirst\(nameCard\.el\);/);
  });
});
