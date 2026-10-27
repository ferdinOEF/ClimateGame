import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Section 34b: the fixes from the owner's two live play tests (24 and 27 October). Each step's unit checks; the browser
 * checks are in tools/section34bChecks.ts.
 */
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(readFileSync("src/ui/panjim/panjim.css", "utf8"));
/** The first rule for `selector` at the top level of panjim.css (or, with `media`, the one inside that media query). */
const rule = (selector: string, media?: string): string => {
  const from = media ? css.indexOf(`@media ${media}`) : 0;
  expect(from, media).toBeGreaterThan(-1);
  const at = css.indexOf(`${selector} {`, from);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("34b.1: notes clear of the HUD card", () => {
  it("the banner sits right of the card (left at least 430 px), above it (z-index 12), centred in that band", () => {
    const banner = rule("\n.has-panjim-clock .era-banner");
    const left = /left: calc\(([^)]*)\);/.exec(banner)?.[1] ?? "";
    const px = left.split("+").reduce((sum, part) => sum + Number(part.trim().replace("px", "")), 0);
    expect(px).toBeGreaterThanOrEqual(430);
    expect(banner).toMatch(/z-index: 12;/);
    expect(banner).toMatch(/right: 12px;/);
    expect(banner).toMatch(/transform: none;/);
    expect(banner).toMatch(/top: calc\(14px \+ env\(safe-area-inset-top\)\);/);
    // The card it must clear: z-index 10, 400 px wide from 14 px.
    const card = rule("\n.panjim-clock");
    expect(card).toMatch(/z-index: 10;/);
    expect(card).toMatch(/width: 400px;/);
  });

  it("below 900 px wide the banner goes to the bottom, across the window", () => {
    const narrow = rule(".has-panjim-clock .era-banner", "(max-width: 899px)");
    expect(narrow).toMatch(/left: 12px;/);
    expect(narrow).toMatch(/right: 12px;/);
    expect(narrow).toMatch(/top: auto;/);
    expect(narrow).toMatch(/bottom: 96px;/);
  });
});
