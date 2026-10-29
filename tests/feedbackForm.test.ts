import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIONS, AGES, checkAnswers, FEELINGS, planSubmit, STATUSES, TEXT_LIMITS } from "../src/core/feedbackForm";
import { checkName, NAME_REFUSED } from "../src/core/nameFilter";
import { ADD_NAME_HINT, FEEDBACK_LINE, FEEDBACK_TITLE, feedbackFormHtml } from "../src/ui/panjim/feedbackForm";
import { punctuationProblems } from "./helpers/uiStrings";

/** Section 35.5: the feedback form after Play Panjim. */
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const plan = (runName: string | null, field: string, answers: unknown = {}, onBoard = runName !== null) => planSubmit({ runName, field, answers, onBoard }, checkName);

describe("the allowed values", () => {
  it("are exactly the brief's", () => {
    expect(FEELINGS).toEqual(["Hopeful", "Worried", "Curious", "Ready to help", "No different"]);
    expect(ACTIONS).toEqual(["Talk about it with someone", "Look up Goa's mangroves or khazans", "Visit a mangrove or a khazan", "Join a planting or a cleanup"]);
    expect(AGES).toEqual(["17 and under", "18 to 30", "31 and over"]);
    expect(STATUSES).toEqual(["A student", "A teacher", "Working", "Other"]);
    expect(TEXT_LIMITS).toEqual({ s2_why: 280, s3_change: 280, s6_remember: 140 });
  });

  it("drops anything off the list and cuts text to its limit", () => {
    const out = checkAnswers({ s1_before: 0, s1_now: 5, s2_feeling: "Angry", s4_enjoy: "5", s5_actions: ["Visit a mangrove or a khazan", "x"], s6_remember: "y".repeat(200), s7_age: "18 to 30", s7_status: "Retired", extra: 1 });
    expect(out).toEqual({ s1_now: 5, s5_actions: ["Visit a mangrove or a khazan"], s6_remember: "y".repeat(140), s7_age: "18 to 30" });
  });
});

describe("what Submit feedback sends", () => {
  it("only the answered items", () => {
    const p = plan(null, "", { s1_before: 3, s2_why: "  ", s3_change: undefined, s5_actions: [] });
    expect(p.answers).toEqual({ s1_before: 3 });
    expect(plan(null, "", {}).answers).toBeNull();
  });

  it("renames only when the name changed", () => {
    expect(plan("Ana", "Ana").rename).toBeNull();
    expect(plan("Ana", "  Ana ").rename).toBeNull();
    expect(plan("Ana", "").rename).toBeNull();
    expect(plan("Ana", "Ana B").rename).toBe("Ana B");
    // Not on the board (it could not be reached): nothing to rename.
    expect(plan("Ana", "Ana B", {}, false).rename).toBeNull();
    expect(plan("Ana", "Ana B").post).toBeNull();
  });

  it("a named run the board could not take at the finale is posted from the form", () => {
    expect(plan("Ana", "Ana", {}, false).post).toBe("Ana");
    expect(plan("Ana", "Ana B", {}, false)).toMatchObject({ post: "Ana B", rename: null });
  });

  it("a run without a name goes on the board only when the field is filled", () => {
    expect(plan(null, "").post).toBeNull();
    expect(plan(null, "   ").post).toBeNull();
    expect(plan(null, "@rui_goa").post).toBe("@rui_goa");
    expect(plan(null, "@rui_goa").rename).toBeNull();
  });

  it("a refused name says why, and the rest still goes", () => {
    const p = plan(null, "chutiya", { s4_enjoy: 4 });
    expect(p.nameError).toBe(NAME_REFUSED);
    expect(p.post).toBeNull();
    expect(p.answers).toEqual({ s4_enjoy: 4 });
    expect(plan("Ana", "x").nameError).not.toBeNull();
  });
});

describe("the form", () => {
  it("has the title, the line, the name field and S1 to S7, every item optional", () => {
    const html = feedbackFormHtml(null);
    const t = text(html);
    expect(FEEDBACK_TITLE).toBe("Your feedback");
    expect(FEEDBACK_LINE).toBe("Your answers help OneEarth Foundation improve this game. You can skip any question.");
    for (const words of [
      FEEDBACK_TITLE,
      FEEDBACK_LINE,
      "Your name or Instagram handle",
      ADD_NAME_HINT,
      "Your understanding of how Panjim can be protected from cyclones and floods",
      "Before playing",
      "Now",
      "How do you feel about Panjim's future?",
      "Why? (optional)",
      "Did the game change how you see Goa's coast? (optional)",
      "How much did you enjoy playing?",
      "Will you do any of these? (optional)",
      "One thing you'll remember (optional)",
      "About you",
      "Age",
      "You are"
    ]) {
      expect(t).toContain(words);
    }
    for (const v of [...FEELINGS, ...ACTIONS, ...AGES, ...STATUSES]) expect(t).toContain(v.replace("'", "'"));
    expect(html).not.toMatch(/\brequired\b/);
    expect(html.match(/type="radio" name="s1_before"/g)?.length).toBe(5);
    expect(html.match(/type="checkbox" name="s5_actions"/g)?.length).toBe(4);
    // Real labels round every input.
    expect(html.match(/<input/g)!.length).toBe(html.match(/<label[^>]*>(?:(?!<\/label>)[\s\S])*<input/g)!.length);
  });

  it("preloads the run's name with its usual hint", () => {
    const html = feedbackFormHtml("Ana");
    expect(html).toContain('value="Ana"');
    expect(text(html)).not.toContain(ADD_NAME_HINT);
  });

  it("has no dots, spaced dashes or hyphens between words", () => {
    expect(punctuationProblems(text(feedbackFormHtml(null)))).toEqual([]);
  });
});

describe("the flow", () => {
  const controller = readFileSync("src/app/panjimController.ts", "utf8");

  it("Submit feedback and Skip; then Play again and Exit, with Thank you on the finale's buttons row", () => {
    expect(controller).toContain('button: "Submit feedback", alt: "Skip"');
    expect(controller).toContain('button: "Play again", link: "Exit", wide: true, ...(note ? { note } : {})');
    expect(controller).toContain('let note = "Thank you.";');
    expect(controller).toContain("return `Thank you. You\\u2019re ${ordinal(posted.rank)} on the board.`;");
    expect(controller).toContain('note = "Thank you. Putting this run on the board.";');
  });

  it("a named run is posted as the finale opens, before the form, so Skip never stops it", () => {
    const finale = controller.slice(controller.indexOf("private async finale("), controller.indexOf("private async finaleAndFeedback("));
    expect(finale.indexOf("this.boardPlace(points.total, name)")).toBeGreaterThan(-1);
    expect(finale.indexOf("this.boardPlace(points.total, name)")).toBeLessThan(finale.indexOf("await this.finaleAndFeedback("));
  });

  it("buttons are 44 px or more", () => {
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    expect(css).toMatch(/\.result-actions button \{[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.result-card\.wide \.result-link \{ min-height: 44px; \}/);
  });
});
