import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DETAIL_BACK, DETAIL_LINK, stormCardPlan } from "../src/core/resultFlow";
import { newPanjimRun } from "../src/levels/panjimRun";
import { punctuationProblems } from "./helpers/uiStrings";

/** Section 38: the last result card with the feedback on it. The browser checks are in tools/section38Shots.ts. */
const read = (path: string): string => readFileSync(path, "utf8");

describe("Section 38.1: card 2 behind a link", () => {
  const run = newPanjimRun();
  const [c2030, c2040, c2050] = run.schedule;

  it("after the 2030 storm: card 1 (its button the flood in 2040, card 2 behind its link), then the outlook", () => {
    const plan = stormCardPlan(c2040, 2031);
    expect(plan.cards).toEqual(["result", "outlook"]);
    expect(plan.resultButton).toBe("Next: the flood in 2040");
    expect(plan.detailLink).toBe("What protected your homes");
    expect(plan.outlookButton).toBe("On to 2031");
    expect(c2030.year).toBe(2030);
  });

  it("after the 2040 storm: card 1 (its button cyclone and flood in 2050), then the outlook", () => {
    const plan = stormCardPlan(c2050, 2041);
    expect(plan.cards).toEqual(["result", "outlook"]);
    expect(plan.resultButton).toBe("Next: cyclone and flood in 2050");
    expect(plan.outlookButton).toBe("On to 2041");
  });

  it("after the 2050 storm there are no storm cards: the last card takes their place", () => {
    expect(stormCardPlan(null, 2051).cards).toEqual([]);
  });

  it("the link sits under the homes saved bar, card 2's only button is Back, and Enter on card 2 is Back", () => {
    const cards = read("src/ui/panjim/resultCards.ts");
    expect(cards).toContain('const homes = spec.body.querySelector(".result-homes");');
    expect(cards).toContain("if (homes) homes.after(link);");
    expect(cards).toMatch(/back\.textContent = DETAIL_BACK;[\s\S]{0,80}actions\.appendChild\(back\);\s*this\.cardEl\.appendChild\(actions\);/);
    expect(cards).toMatch(/const advance = \(\): void => \{\s*if \(detailOpen\) \{\s*render\(\);\s*return;/);
    expect(DETAIL_BACK).toBe("Back");
    const controller = read("src/app/panjimController.ts");
    expect(controller).toContain("detail: { link: plan.detailLink, body: defences }");
    expect(controller).toContain("if (next && plan.outlookButton) {");
    // The Tutorial's cards are unchanged.
    expect(controller).toContain('const card = { body: tutorialResultCard(result, this.tutorialRows(challenge), last), button: last ? "See what you tried" : `On to ${this.run.year}` };');
    expect(punctuationProblems(`${DETAIL_LINK} ${DETAIL_BACK}`)).toEqual([]);
  });
});
