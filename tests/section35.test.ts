import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARD_LIST_LABEL, BOARD_ROWS_SHOWN, BOARD_SCROLL_HINT, ordinal, rankHtml, stormPointsHtml } from "../src/ui/panjim/resultCards";
import { lastCardHtml, type LastCardView } from "../src/ui/panjim/lastCard";
import { stormPoints, endPoints, POINT_VALUES } from "../src/core/resiliencePoints";
import { POINTS_HELP } from "../src/ui/panjim/panjimHelp";
import { punctuationProblems } from "./helpers/uiStrings";
import { HUD_OBSTACLES } from "../src/ui/panjim/maya";

/** Section 35.2: where points show (the HUD card, result card 1, the last card since Section 38.2), from fixed records. */
const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
const clock = readFileSync("src/ui/panjim/clockHud.ts", "utf8");
const controller = readFileSync("src/app/panjimController.ts", "utf8");

const storm2030 = stormPoints({ id: "c1-cyclone", year: 2030 }, { homesSaved: 42, places: ["Sharada Mandir School"], objectiveDone: true, coast: { standing: 3, protecting: 4 / 2 }, standing: ["a", "b"] });
const storm2040 = stormPoints({ id: "c2-flood", year: 2040 }, { homesSaved: 50, places: [], objectiveDone: false, coast: { standing: 0, protecting: 0 }, standing: ["a"] });
const storm2050 = stormPoints({ id: "c3-compound", year: 2050 }, { homesSaved: 40, places: [], objectiveDone: false, coast: { standing: 2, protecting: 0 }, standing: ["a"] });
const end = endPoints(9, [storm2030.standing, storm2040.standing, storm2050.standing]);
const points = { storms: [storm2030, storm2040, storm2050], end, total: storm2030.total + storm2040.total + storm2050.total + end.total };
const view: LastCardView = {
  name: "@maya_goa",
  storm: { eyebrow: "Cyclone and flood in 2050", stars: 1, homesSaved: 40, homesTotal: 53, points: storm2050 },
  points,
  storms: [
    { label: "Cyclone in 2030", stars: 3 },
    { label: "Monsoon flood in 2040", stars: 2 },
    { label: "Cyclone and flood in 2050", stars: 1 }
  ],
  totalStars: 6,
  cleared: true
};
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("result card 1: Points this storm", () => {
  it("its total, then one chip per source that earned any, no dots between", () => {
    const html = stormPointsHtml(storm2030);
    expect(text(html)).toContain(`Points this storm ${storm2030.total}`);
    expect(html.match(/class="result-points-chip"/g)?.length).toBe(4);
    expect(text(html)).toContain("Homes +420");
    expect(text(html)).toContain(`Places +${POINT_VALUES.place}`);
    expect(text(html)).toContain("Objective +300");
    expect(text(html)).toContain(`Living coast +${3 * 20 + 2 * 30}`);
    expect(html).not.toMatch(/·|•/);
    // A storm that earned only homes shows one chip.
    expect(stormPointsHtml(storm2040).match(/class="result-points-chip"/g)?.length).toBe(1);
  });

  it("is shown on card 1 only when the run counts points", () => {
    expect(controller).toMatch(/resultCard\(result, points\)/);
    expect(controller).toMatch(/this\.tutorial \? \{\} : \{ points: pointsConfig\(host\) \}/);
  });
});

describe("the last card's points (Section 38.2, where the finale card was)", () => {
  it("with a name: the total, a row per storm with its stars and points, the nature row, the stars and the chip", () => {
    const html = lastCardHtml(view, { status: "loading" });
    const t = text(html);
    expect(t).toContain(`${points.total} points`);
    for (const s of view.storms) expect(t).toContain(`${s.label} ${"★".repeat(s.stars)}`);
    for (const s of view.storms) expect(html).toContain(`aria-label="${s.stars} of 3 stars"`);
    for (const s of points.storms) expect(html).toContain(`<b>${s.total}</b>`);
    expect(t).toContain(`Nature at the end of 2050: +9 biodiversity, 1 veteran ${9 * 5 + 50}`);
    expect(t).toContain("6 of 9 stars");
    expect(t).toContain("Panjim cleared");
    // The Panjim 2050 index is not on it.
    expect(t).not.toMatch(/index/i);
  });

  it("not cleared: the chip says so", () => {
    const t = text(lastCardHtml({ ...view, cleared: false }, { status: "loading" }));
    expect(t).toContain("Not cleared yet");
    expect(punctuationProblems(t)).toEqual([]);
  });

  const rank = {
    rank: 4,
    points: 4000,
    tenth: 2500,
    above: [
      { rank: 2, name: "Ana", points: 4300, season: "Festival 2026" },
      { rank: 3, name: "Rui", points: 4100, season: "Festival 2026" }
    ],
    below: [{ rank: 5, name: "Zoe", points: 3900, season: "Festival 2026" }]
  };

  it("its rank box: the place, the gap to the rank above, the rows above it and the player's own, highlighted", () => {
    const html = rankHtml({ status: "ready", rank }, "@maya_goa");
    const t = text(html);
    expect(t).toContain("4th on the board");
    expect(t).toContain("100 points behind 3rd");
    // Section 40.5: a reply without `top` (an older one) draws the two rows above as before; none below the player.
    expect(t).toMatch(/2 Ana 4300 3 Rui 4100 4 @maya_goa 4000$/);
    expect(t).not.toContain("Zoe");
    expect(html.match(/class="me"/g)?.length).toBe(1);
    expect(html).toContain('aria-current="true"');
  });

  describe("Section 40.5: the board from 1st place down to the player", () => {
    const top = [
      { rank: 1, name: "Ash", points: 4600, season: "Festival 2026" },
      { rank: 1, name: "Bea", points: 4600, season: "Festival 2026" },
      ...rank.above
    ];
    const rowsOf = (html: string): string[] => [...html.matchAll(/<li class="(me)?"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => `${m[1] ? "me:" : ""}${text(m[2])}`);

    it("draws `top`, then the player's own row last and marked; no row below it", () => {
      const html = rankHtml({ status: "ready", rank: { ...rank, top } }, "@maya_goa");
      expect(rowsOf(html)).toEqual(["1 Ash 4600", "1 Bea 4600", "2 Ana 4300", "3 Rui 4100", "me:4 @maya_goa 4000"]);
      expect(html).toMatch(/<li class="me" aria-current="true">[\s\S]*<\/li><\/ol>/);
      expect(html).not.toContain("Zoe");
      // The head line and the gap to the row above are as before.
      expect(text(html)).toContain("4th on the board");
      expect(text(html)).toContain("100 points behind 3rd");
    });

    it("the list takes focus and says what it is; with more than three rows a line says where 1st place is", () => {
      expect([BOARD_LIST_LABEL, BOARD_SCROLL_HINT, BOARD_ROWS_SHOWN]).toEqual(["The board from 1st place down to you", "Scroll up to see 1st place", 3]);
      const long = rankHtml({ status: "ready", rank: { ...rank, top } }, "@maya_goa");
      // Not a live region of its own: the box reads out its head line and note, never a long board row by row.
      expect(long).toContain('<ol class="finale-rank-rows" tabindex="0" aria-label="The board from 1st place down to you" aria-live="off">');
      expect(long).toContain('<p class="finale-rank-hint">Scroll up to see 1st place</p>');
      // Three rows or fewer (two above and the player's): no line.
      const short = rankHtml({ status: "ready", rank: { ...rank, top: rank.above } }, "@maya_goa");
      expect(rowsOf(short)).toHaveLength(3);
      expect(short).not.toContain("finale-rank-hint");
      // Three above and the player's makes four: the line shows.
      expect(rankHtml({ status: "ready", rank: { ...rank, top: top.slice(1) } }, "@maya_goa")).toContain("finale-rank-hint");
    });

    it("1st place: the player's row alone, Top of the board", () => {
      const html = rankHtml({ status: "ready", rank: { rank: 1, points: 5000, tenth: null, top: [], above: [], below: rank.above } }, "@maya_goa");
      expect(rowsOf(html)).toEqual(["me:1 @maya_goa 5000"]);
      expect(text(html)).toContain("Top of the board");
      expect(html).not.toContain("finale-rank-hint");
    });

    it("the other states are as before: offline, no name, a test session, not posted", () => {
      const withTop = { ...rank, top };
      expect(text(rankHtml({ status: "offline" }, "Sam"))).toBe("Board offline The board can't be reached right now. Your points are above.");
      expect(text(rankHtml({ status: "ready", rank: withTop }, null))).toBe("The board With a name, this run would be 4th on the board. Add one on the right.");
      expect(text(rankHtml({ status: "tagged" }, "Sam"))).toBe("The board Test session: not on the board.");
      expect(text(rankHtml({ status: "unposted", rank: withTop }, "Sam"))).toBe("Not on the board yet The board could not take this run just now. With these points it would be 4th.");
      for (const state of [{ status: "offline" } as const, { status: "tagged" } as const, { status: "unposted", rank: withTop } as const]) expect(rankHtml(state, "Sam")).not.toContain("finale-rank-rows");
      expect(rankHtml({ status: "ready", rank: withTop }, null)).not.toContain("finale-rank-rows");
    });

    it("the list is three rows high, scrolls, and opens at the player's row", () => {
      const sheet = css.slice(css.indexOf(".last-rank .finale-rank-rows {"), css.indexOf(".last-rank .finale-rank-hint {"));
      expect(sheet).toMatch(/max-height: calc\(3 \* 22px \+ 2 \* 3px\);\s*overflow-y: auto;/);
      expect(sheet).toMatch(/\.last-rank \.finale-rank-rows li \{[^}]*min-height: 22px;/);
      const five = readFileSync("src/ui/fiveColours.css", "utf8");
      expect(five).toMatch(/\.result-cards \.finale-rank-rows \{\s*scrollbar-color: var\(--star\) var\(--band-rule\);/);
      expect(five).toMatch(/\.result-cards \.finale-rank-note,\s*\.result-cards \.finale-rank-hint \{\s*color: var\(--band-ink-2\);/);
      const card = readFileSync("src/ui/panjim/lastCard.ts", "utf8");
      expect(card).toContain("if (list) list.scrollTop = list.scrollHeight;");
      expect(card).toMatch(/setRank\(rank: RankState\): void \{[\s\S]*?this\.showPlayerRow\(\);/);
    });

    it("has no dots, spaced dashes or hyphens between words", () => {
      expect(punctuationProblems(text(rankHtml({ status: "ready", rank: { ...rank, top } }, "Sam")))).toEqual([]);
      expect(punctuationProblems(BOARD_LIST_LABEL)).toEqual([]);
    });
  });

  it("outside the top 10: how far short of it", () => {
    const t = text(rankHtml({ status: "ready", rank: { ...rank, rank: 14, points: 2380 } }, "Sam"));
    expect(t).toContain("120 points short of the top 10");
  });

  it("without a name: where it would be, and the field on the right", () => {
    expect(text(rankHtml({ status: "ready", rank }, null))).toContain("With a name, this run would be 4th on the board. Add one on the right.");
  });

  it("offline, it says so", () => {
    expect(text(rankHtml({ status: "offline" }, "Sam"))).toContain("Board offline");
  });

  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
  });

  it("Section 38.2: Restart is Play again and Exit the menu", () => {
    expect(controller).toContain('if (action === "restart" || action === "exit") {');
    expect(controller).toContain('return action === "restart" ? "again" : "menu";');
  });

  it("has no dots, spaced dashes or hyphens between words", () => {
    for (const s of [text(lastCardHtml(view, { status: "ready", rank })), text(rankHtml({ status: "offline" }, null)), text(stormPointsHtml(storm2030)), POINTS_HELP]) {
      expect(punctuationProblems(s), s).toEqual([]);
    }
  });
});

describe("the HUD card's Points box", () => {
  it("is in the card, with the same icon, label and number sizes as the other two boxes and a gold border", () => {
    expect(clock).toContain('<div class="clock-points" role="status" hidden>');
    expect(clock).toContain('<span class="clock-points-label">Points</span>');
    const box = css.slice(css.indexOf(".panjim-clock .clock-points {"), css.indexOf("}", css.indexOf(".panjim-clock .clock-points {")));
    expect(box).toMatch(/height: 32px;/);
    expect(box).toMatch(/font-size: 12px;/);
    expect(box).toMatch(/border: 1px solid var\(--gold\);/);
    expect(css).toMatch(/\.clock-points-count \{[^}]*font-size: 18px;/);
    expect(readFileSync("src/ui/theme.css", "utf8")).toMatch(/--gold: #[0-9a-f]{6};/);
  });

  it("does not grow the card: 300 px wide, the box on line 1 in the space beside the year", () => {
    expect(css).toMatch(/\.panjim-clock \{[^}]*width: 300px;/);
    expect(css).toContain('"year pts chrome"');
    expect(HUD_OBSTACLES).toContain(".panjim-clock");
  });

  it("counts up with the star sound and +N for 4 s; the Tutorial has none", () => {
    expect(clock).toMatch(/export const GAIN_MS = 4000;/);
    expect(clock).toMatch(/playSound\("star"\)/);
    expect(controller).toMatch(/this\.clock\.setPoints\(this\.tutorial \? null : 0\)/);
    expect(controller).toMatch(/this\.clock\.setPoints\(runPoints\(this\.run\)\.total, points\.total/);
  });

  it("no points on build cards, the build menu or tooltips", () => {
    for (const file of ["src/ui/buildPopover.ts", "src/ui/panjim/defenceCards.ts", "src/ui/tooltip.ts"]) expect(readFileSync(file, "utf8")).not.toMatch(/stormPoints|runPoints|resiliencePoints|clock-points/);
  });
});

describe("Help", () => {
  it("has one short paragraph on points, as a game rule", () => {
    expect(POINTS_HELP.startsWith("In this game, points")).toBe(true);
    expect(readFileSync("src/ui/panjim/panjimHelp.ts", "utf8")).toContain('${input.tutorial ? "" : `<p>${POINTS_HELP}</p>`}');
  });
});
