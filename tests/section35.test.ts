import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { finaleHtml, finaleTitle, ordinal, rankHtml, stormPointsHtml, VETERANS_LINE, type FinaleView } from "../src/ui/panjim/resultCards";
import { stormPoints, endPoints, POINT_VALUES } from "../src/core/resiliencePoints";
import { POINTS_HELP } from "../src/ui/panjim/panjimHelp";
import { punctuationProblems } from "./helpers/uiStrings";
import { HUD_OBSTACLES } from "../src/ui/panjim/maya";

/** Section 35.2: where points show (the HUD card, result card 1, the finale card), from fixed records. */
const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
const clock = readFileSync("src/ui/panjim/clockHud.ts", "utf8");
const controller = readFileSync("src/app/panjimController.ts", "utf8");

const storm2030 = stormPoints({ id: "c1-cyclone", year: 2030 }, { homesSaved: 42, places: ["Sharada Mandir School"], objectiveDone: true, coast: { standing: 3, protecting: 4 / 2 }, standing: ["a", "b"] });
const storm2040 = stormPoints({ id: "c2-flood", year: 2040 }, { homesSaved: 50, places: [], objectiveDone: false, coast: { standing: 0, protecting: 0 }, standing: ["a"] });
const storm2050 = stormPoints({ id: "c3-compound", year: 2050 }, { homesSaved: 40, places: [], objectiveDone: false, coast: { standing: 2, protecting: 0 }, standing: ["a"] });
const end = endPoints(9, [storm2030.standing, storm2040.standing, storm2050.standing]);
const points = { storms: [storm2030, storm2040, storm2050], end, total: storm2030.total + storm2040.total + storm2050.total + end.total };
const view: FinaleView = {
  name: "@maya_goa",
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

describe("the finale card", () => {
  it("with a name: the title, the total, a row per storm with its stars and points, Biodiversity, Veterans and the line", () => {
    const html = finaleHtml(view, { status: "loading" });
    const t = text(html);
    expect(t).toContain("Panjim held, @maya_goa.");
    expect(t).toContain(`${points.total} points`);
    for (const [i, s] of view.storms.entries()) expect(t).toContain(`${s.label} ${"★".repeat(s.stars)}`);
    for (const [i, s] of view.storms.entries()) expect(html).toContain(`aria-label="${s.stars} of 3 stars"`);
    for (const s of points.storms) expect(html).toContain(`<b>${s.total}</b>`);
    expect(t).toContain(`Biodiversity, end of 2050 +9 ${9 * 5}`);
    expect(t).toContain(`Veterans 1 50`);
    expect(t).toContain(VETERANS_LINE);
    expect(VETERANS_LINE).toBe("In this game, veterans are defences that stood through all three storms. Losses never take points away.");
    expect(t).toContain("6 of 9 stars");
    expect(t).toContain("Panjim cleared");
    // The Panjim 2050 index is not on it.
    expect(t).not.toMatch(/index/i);
  });

  it("not cleared: Panjim made it to 2050, with or without a name", () => {
    expect(finaleTitle("@maya_goa", false)).toBe("Panjim made it to 2050, @maya_goa.");
    expect(finaleTitle(null, false)).toBe("Panjim made it to 2050.");
    const t = text(finaleHtml({ ...view, cleared: false }, { status: "loading" }));
    expect(t).toContain("Panjim made it to 2050, @maya_goa.");
    expect(t).not.toContain("Panjim held");
    expect(t).toContain("Not cleared yet");
    expect(punctuationProblems(t)).toEqual([]);
  });

  it("without a name: Panjim held.", () => {
    expect(finaleTitle(null, true)).toBe("Panjim held.");
    expect(text(finaleHtml({ ...view, name: null }, { status: "loading" }))).toContain("Panjim held.");
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

  it("its rank box: the place, the gap to the rank above, the rows round it with the player's highlighted", () => {
    const html = rankHtml({ status: "ready", rank }, "@maya_goa");
    const t = text(html);
    expect(t).toContain("4th on the board");
    expect(t).toContain("100 points behind 3rd");
    expect(t).toMatch(/2 Ana 4300 3 Rui 4100 4 @maya_goa 4000 5 Zoe 3900/);
    expect(html.match(/class="me"/g)?.length).toBe(1);
    expect(html).toContain('aria-current="true"');
  });

  it("outside the top 10: how far short of it", () => {
    const t = text(rankHtml({ status: "ready", rank: { ...rank, rank: 14, points: 2380 } }, "Sam"));
    expect(t).toContain("120 points short of the top 10");
  });

  it("without a name: where it would be, and the next screen", () => {
    expect(text(rankHtml({ status: "ready", rank }, null))).toContain("With a name, this run would be 4th on the board. Add one on the next screen.");
  });

  it("offline, it says so", () => {
    expect(text(rankHtml({ status: "offline" }, "Sam"))).toContain("Board offline");
  });

  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
  });

  it("offers Play again and Exit", () => {
    expect(controller).toMatch(/button: "Play again", link: "Exit", wide: true/);
    expect(controller).toMatch(/alt: "Play again", link: "Exit", wide: true/);
  });

  it("has no dots, spaced dashes or hyphens between words", () => {
    for (const s of [text(finaleHtml(view, { status: "ready", rank })), text(rankHtml({ status: "offline" }, null)), text(stormPointsHtml(storm2030)), POINTS_HELP]) {
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
