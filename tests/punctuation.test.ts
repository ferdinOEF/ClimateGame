import { describe, expect, it } from "vitest";
import { isProse, punctuationProblems, uiStrings } from "./helpers/uiStrings";
import { BROKEN_RULE, CARD_LINE, defenceRules } from "../src/ui/panjim/defenceCards";
import { natureReason } from "../src/core/phaseResult";
import { numberWord, menuTagline, panajiRunPhrase } from "../src/ui/screens/runWords";
import { countdownText } from "../src/ui/panjim/clockHud";
import { comingUpTitle } from "../src/app/panjimController";
import { panjimHelpHtml } from "../src/ui/panjim/panjimHelp";
import { shortCredit } from "../src/core/facts";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";

/**
 * Section 17b, part B (owner decision): no dots or hyphens between words or phrases in any text a player sees.
 * Every UI string (the data files, the maps' visible text, index.html and every string and template literal in the
 * source, read with the TypeScript parser) is scanned for a middle dot, an inline bullet, a spaced dash, a dash
 * between words, a number range written with a dash, and a hyphen joining words. Full stops, decimals, minus signs,
 * code (ids, classes, selectors, CSS), URLs, file names and citations are not touched.
 */

/** The exceptions, each with its reason. */
const ALLOWED: { file: string; text: string; why: string }[] = [
  {
    file: "src/data/fieldGuide.json",
    text: "White-throated Kingfisher",
    why: "a real species' common name (Halcyon smyrnensis), kept in its own spelling"
  },
  {
    file: "src/data/maps/tutorial.json",
    text: "A made-up river mouth, drawn simply: open sea, a bar of sand, an estuary, the river behind it, and a village on the land, so you can see all of it at once.",
    why: "never shown: the Tutorial's start popup hides the board blurb and Sources lists real places only; the map is hash-locked (tests/tutorialLocked.test.ts)"
  }
];

describe("no dots or hyphens between words (Section 17b)", () => {
  const strings = uiStrings();

  it("reads a real body of text", () => {
    expect(strings.length).toBeGreaterThan(1000);
    expect(strings.some((s) => s.file === "src/data/maya.json")).toBe(true);
    expect(strings.some((s) => s.file === "src/ui/panjim/panjimHelp.ts")).toBe(true);
  });

  it("finds none in any UI string, apart from the allow-list", () => {
    const found = strings
      .map((s) => ({ ...s, problems: punctuationProblems(s.text) }))
      .filter((s) => s.problems.length > 0 && !ALLOWED.some((a) => a.file === s.file && a.text === s.text))
      .map((s) => `${s.file} ${s.where} [${s.problems.join(", ")}] ${s.text.slice(0, 120)}`);
    expect(found).toEqual([]);
  });

  it("keeps every allow-list entry needed (none stale)", () => {
    for (const a of ALLOWED) expect(strings.some((s) => s.file === a.file && s.text === a.text), a.text).toBe(true);
  });

  it("catches what it should, and leaves alone what it should", () => {
    for (const bad of ["Monsoon flood · 2040", "a • b", "wait — then", "2026–2050", "Nature-based ones come first", "Board render · map data"]) {
      expect(punctuationProblems(bad).length, bad).toBeGreaterThan(0);
    }
    for (const ok of ["Year 1 of 25", "-2 homes", "0.5 m", "10:30", "Saved as panjim-storm-card.png.", "https://www.openstreetmap.org/copyright", "• A bullet at the start of a line", "Monsoon flood in 2040, 10 years away"]) {
      expect(punctuationProblems(ok), ok).toEqual([]);
    }
    expect(isProse("build-card disabled")).toBe(false);
    expect(isProse("mangrove-waves")).toBe(false);
  });

  it("holds for text made at run time: number words, the countdown, the coming-up heading, Help, credits", () => {
    expect(numberWord(25)).toBe("twenty five");
    expect(menuTagline()).toBe("Twenty five years of Panjim. Three storms. One build a year.");
    expect(punctuationProblems(panajiRunPhrase())).toEqual([]);
    expect(countdownText({ builds: 5, storm: "Cyclone" })).toBe("Cyclone in 5 builds");
    expect(countdownText({ builds: 1, storm: "Cyclone" })).toBe("Cyclone in 1 build");
    expect(comingUpTitle("Monsoon flood", 2040, 10)).toBe("Monsoon flood in 2040, 10 years away");
    expect(comingUpTitle("Cyclone and flood", 2050, 1)).toBe("Cyclone and flood in 2050, 1 year away");
    expect(shortCredit({ authors: "McIvor, A.", year: 2012, publisher: "The Nature Conservancy" } as never)).not.toMatch(/·/);
    for (const level of [BOT_LEVEL, LEVEL_BY_ID.get("l00-tutorial")!]) {
      const run = newRun("punctuation", level);
      const help = panjimHelpHtml({ startYear: run.config.startYear, endYear: run.config.endYear, storms: run.schedule, houseStars: run.houseStars });
      const prose = help.replace(/<[^>]*>/g, "\n").split("\n").filter((t) => t.trim());
      for (const line of prose) expect(punctuationProblems(line), `${level.id}: ${line}`).toEqual([]);
    }
  });

  it("keeps Section 25's words clean: the defence rules, the broken rule, the card lines and every reason on a result card", () => {
    const lines = [...defenceRules().map((r) => r.text), BROKEN_RULE, ...Object.values(CARD_LINE)];
    for (const change of [-12, 0, 3, 9]) {
      for (const kinds of [new Map([["seawall", -10]]), new Map([["mangrove", 6]]), new Map<string, number>()]) lines.push(natureReason(change, 6, kinds));
    }
    for (const line of lines) expect(punctuationProblems(line), line).toEqual([]);
  });
});
