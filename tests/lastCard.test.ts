import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGE_CODES, AGE_GROUPS, ageAfterTick, FEEDBACK_LINE, FEEDBACK_TITLE, FOOTER, homesLine, pointsRows, QUESTIONS, REMEMBER_LABEL, REMEMBER_MAX, rowsTotal, SCALE_HIGH, SCALE_LOW,
  starFilled, starsAfterTap, submitPlan, thanksLine, THANKS, RETURN_TO_CARD
} from "../src/core/lastCard";
import { checkName, NAME_REFUSED } from "../src/core/nameFilter";
import { endPoints, stormPoints } from "../src/core/resiliencePoints";
import { lastCardHtml, type LastCardView } from "../src/ui/panjim/lastCard";
import { punctuationProblems } from "./helpers/uiStrings";

/** Section 38.2: the last result card. */
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const s1 = stormPoints({ id: "c1-cyclone", year: 2030 }, { homesSaved: 42, places: ["Sharada Mandir School"], objectiveDone: true, coast: { standing: 3, protecting: 2 }, standing: ["a", "b"] });
const s2 = stormPoints({ id: "c2-flood", year: 2040 }, { homesSaved: 50, places: [], objectiveDone: false, coast: { standing: 0, protecting: 0 }, standing: ["a"] });
const s3 = stormPoints({ id: "c3-compound", year: 2050 }, { homesSaved: 41, places: [], objectiveDone: true, coast: { standing: 2, protecting: 1 }, standing: ["a", "c"] });
const end = endPoints(12, [s1.standing, s2.standing, s3.standing]);
const points = { storms: [s1, s2, s3], end, total: s1.total + s2.total + s3.total + end.total };
const storms = [
  { label: "Cyclone in 2030", stars: 3 },
  { label: "Monsoon flood in 2040", stars: 2 },
  { label: "Cyclone and flood in 2050", stars: 1 }
];
const view: LastCardView = { name: null, storm: { eyebrow: "Cyclone and flood in 2050", stars: 2, homesSaved: 41, homesTotal: 53, points: s3 }, points, storms, totalStars: 6, cleared: true };

describe("the four rows", () => {
  it("one a storm with its stars, then nature at the end of 2050 as one number; they add up to the total", () => {
    const rows = pointsRows(points, storms);
    expect(rows.map((r) => r.label)).toEqual(["Cyclone in 2030", "Monsoon flood in 2040", "Cyclone and flood in 2050", `Nature at the end of 2050: +12 biodiversity, 1 veteran`]);
    expect(rows.map((r) => r.stars)).toEqual([3, 2, 1, null]);
    expect(rows[3].points).toBe(end.biodiversity.points + end.veterans.points);
    expect(rowsTotal(rows)).toBe(points.total);
    // Two veterans, and a run with no end of 2050 (stopped early) has three rows.
    expect(pointsRows({ ...points, end: { ...end, veterans: { count: 2, points: 100 } } }, storms)[3].label).toContain("2 veterans");
    expect(pointsRows({ ...points, end: null }, storms)).toHaveLength(3);
  });

  it("the homes line", () => {
    expect(homesLine(41, 53)).toBe("41 of 53 homes saved; 12 lost.");
    expect(homesLine(53, 53)).toBe("53 of 53 homes saved.");
  });
});

describe("the stars control", () => {
  it("a tap on star 4 fills 1 to 4", () => {
    expect(starsAfterTap(4)).toBe(4);
    expect([1, 2, 3, 4, 5].map((i) => starFilled(4, i))).toEqual([true, true, true, true, false]);
    expect([1, 2, 3, 4, 5].map((i) => starFilled(null, i))).toEqual([false, false, false, false, false]);
    expect(starsAfterTap(9)).toBe(5);
    expect(starsAfterTap(0)).toBe(1);
  });
});

describe("the age boxes", () => {
  it("only one can be ticked; ticking another unticks the first; unticking leaves none", () => {
    expect(ageAfterTick(null, "u17", true)).toBe("u17");
    expect(ageAfterTick("u17", "18_30", true)).toBe("18_30");
    expect(ageAfterTick("18_30", "18_30", false)).toBeNull();
    expect(ageAfterTick("18_30", "u17", false)).toBe("18_30");
    expect(AGE_CODES).toEqual(["u17", "18_30", "31_plus"]);
    expect(AGE_GROUPS.map((g) => g.label)).toEqual(["17 and under", "18 to 30", "31 and over"]);
  });
});

describe("Submit feedback", () => {
  it("the no name path posts the typed name to the board; a named run posts nothing; an empty field posts nothing", () => {
    expect(submitPlan({ onBoard: false, field: " @rui_goa " }, checkName)).toEqual({ post: "@rui_goa", nameError: null });
    expect(submitPlan({ onBoard: true, field: "" }, checkName)).toEqual({ post: null, nameError: null });
    expect(submitPlan({ onBoard: false, field: "   " }, checkName)).toEqual({ post: null, nameError: null });
  });

  it("a refused name says why", () => {
    expect(submitPlan({ onBoard: false, field: "chutiya" }, checkName)).toEqual({ post: null, nameError: NAME_REFUSED });
    expect(submitPlan({ onBoard: false, field: "x" }, checkName).nameError).not.toBeNull();
  });

  it("the line in place of the button", () => {
    expect(thanksLine(null)).toBe("Thank you.");
    expect(thanksLine(4)).toBe("Thank you. You’re 4th on the board.");
    expect(THANKS).toBe("Thank you.");
  });
});

describe("the buttons' choices", () => {
  it("View map, Restart, Exit across the bottom; Restart is Play again, Exit the menu, View map closes and comes back", () => {
    expect(FOOTER).toEqual({ map: "View map", restart: "Restart", exit: "Exit" });
    expect(RETURN_TO_CARD).toBe("Back to your result");
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).toContain('if (action === "restart" || action === "exit") {');
    expect(controller).toContain('return action === "restart" ? "again" : "menu";');
    expect(controller).toMatch(/await this\.viewMap\(\);\s*\}\s*return "menu";/);
    // The board post happens as the card opens, before the player taps anything.
    const finale = controller.slice(controller.indexOf("private async finale("), controller.indexOf("private async lastCardFlow("));
    expect(finale.indexOf("this.boardPlace(points.total, name)")).toBeGreaterThan(-1);
    expect(finale.indexOf("this.boardPlace(points.total, name)")).toBeLessThan(finale.indexOf("await this.lastCardFlow(card)"));
    // Esc does nothing on the cards (Section 34 decision 3); a hosted card closes only through its handle.
    const cards = readFileSync("src/ui/panjim/resultCards.ts", "utf8");
    expect(cards).toContain("if (cards[index].bare) return;");
    expect(cards).toMatch(/if \(event\.key === "Escape"\) \{[\s\S]{0,300}event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\);\s*return;/);
    // Nothing posts a name with the answers.
    expect(controller).toContain("void postFeedback(this.runId, { ...answers, nudge: this.nudge.outcome(submitted), cardSeconds }, testTag());");
    expect(controller).toContain("this.sendFeedback(submit.answers, true);");
    expect(readFileSync("src/ui/panjim/lastCard.ts", "utf8")).not.toMatch(/answers\(\)[^\n]*name/);
  });
});

describe("the card", () => {
  it("has the storm, the link to card 2, the points box, the run, the board box, the feedback and the footer", () => {
    const html = lastCardHtml(view, { status: "loading" });
    const t = text(html);
    for (const words of [
      "Cyclone and flood in 2050",
      "The last storm",
      "Most of your city held.",
      "41 of 53 homes saved; 12 lost. What protected your homes",
      `Points this storm ${s3.total}`,
      "Panjim, 2026 to 2050",
      `${points.total} points`,
      "6 of 9 stars",
      "Panjim cleared",
      "Checking the board.",
      FEEDBACK_TITLE,
      FEEDBACK_LINE,
      "Your name or Instagram handle",
      "Add a name and this run goes on the board.",
      ...QUESTIONS,
      SCALE_LOW,
      SCALE_HIGH,
      REMEMBER_LABEL,
      "Age group",
      "17 and under 18 to 30 31 and over",
      "Submit feedback",
      "View map Restart Exit"
    ]) {
      expect(t).toContain(words);
    }
    expect(FEEDBACK_LINE).toBe("Five taps help OneEarth Foundation show what people learn from this game. Skip any of it.");
    expect(html.match(/class="fb-star"/g)?.length).toBe(20);
    expect(html.match(/type="checkbox" name="age"/g)?.length).toBe(3);
    expect(html).toContain(`maxlength="${REMEMBER_MAX}"`);
    expect(REMEMBER_MAX).toBe(140);
    expect(html).not.toMatch(/\brequired\b/);
    // The points box on the last card has no chips, only the number.
    expect(html).not.toContain("result-points-chip");
    // The link is inline with the homes line, so ResultCards wires the card's own rather than making one.
    expect(html).toContain('<button type="button" class="result-detail-link">What protected your homes</button>');
  });

  it("a named run has no name field", () => {
    const html = lastCardHtml({ ...view, name: "Ana" }, { status: "loading" });
    expect(html).not.toContain("fb-name-field");
    expect(text(html)).not.toContain("Your name or Instagram handle");
  });

  it("says nothing of funding, grants or money, and has no dots, spaced dashes or hyphens between words", () => {
    const t = text(lastCardHtml(view, { status: "ready", rank: { rank: 4, points: 4000, tenth: null, above: [], below: [] } }));
    expect(t).not.toMatch(/fund|grant|money|donat/i);
    expect(punctuationProblems(t)).toEqual([]);
  });

  it("buttons are 44 px or more, the stars 28 px square, the right column lighter", () => {
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    expect(css).toMatch(/\.fb-submit \{[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.last-card \.last-action \{[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.result-return \{[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.fb-star \{[^}]*width: 28px;[^}]*height: 28px;/);
    expect(css).toMatch(/\.last-right \{[^}]*color: var\(--ink-soft\);/);
    expect(css).toMatch(/\.fb-title \{[^}]*font-size: 18px;[^}]*font-weight: 400;/);
    expect(readFileSync("src/ui/theme.css", "utf8")).toContain("--ink-soft: #3f4f49;");
  });
});
