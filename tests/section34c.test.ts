/**
 * Section 34c (owner, 28 October 2026): the HUD card at half its size, top right; Maya bottom left; the street map's
 * credit bottom right; Kala Academy on the Mandovi bank; the Mandovi Riverfront zone on the bank. The browser half is
 * tools/section34cShots.ts and tools/section33bViews.ts (docs/qa/section34c/).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAYA } from "../src/core/mayaLines";

const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(readFileSync("src/ui/panjim/panjim.css", "utf8"));
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("34c.1: the HUD card at half its size", () => {
  it("is 300 px wide with the owner's sizes: the year 34 px, Year N of 25 and the chip at 13 px, the boxes' numbers 18 px", () => {
    expect(rule(".panjim-clock")).toMatch(/width: 300px;/);
    expect(rule(".panjim-clock .clock-year")).toMatch(/font-size: 34px;/);
    expect(rule(".panjim-clock .clock-turn")).toMatch(/font-size: 13px;/);
    expect(rule(".panjim-clock .outlook-countdown-chip")).toMatch(/font-size: 13px;/);
    expect(rule(".outlook-tick")).toMatch(/font-size: 11px;/);
    expect(rule(".outlook-track")).toMatch(/height: 26px;/);
    expect(rule(".outlook-bio-count,\n.outlook-risk-count")).toMatch(/font-size: 18px;/);
    expect(rule(".panjim-clock .get-ready-title")).toMatch(/font-size: 14px;/);
    expect(rule(".panjim-clock .get-ready-row")).toMatch(/font-size: 13px;/);
    // A row wraps to two lines at most.
    expect(rule(".panjim-clock .get-ready-label")).toMatch(/line-clamp: 2;/);
  });

  it("lays Year N of 25 and the chip on one line under the year, ? and ☰ beside the year", () => {
    const line = rule(".panjim-clock .hud-line-1");
    expect(line).toMatch(/"year \. chrome"/);
    expect(line).toMatch(/"turn chip chip"/);
  });

  it("fits the Tutorial's seven defences in the card's width", () => {
    expect(rule(".panjim-clock .tutorial-checks")).toMatch(/grid-template-columns: repeat\(7, auto\);/);
  });
});

describe("34c.2: the card top right, Maya bottom left, the street map's credit bottom right", () => {
  it("counts a point over the card at the screen's top edge as hidden by the card, not off the screen", () => {
    const scene = readFileSync("src/render/scene.ts", "utf8");
    const fn = scene.slice(scene.indexOf("  function keepClearOf("), scene.indexOf("  function fitTo("));
    expect(fn.indexOf("hidden++")).toBeLessThan(fn.indexOf("off++"));
  });

  it("puts ☰'s menu under ☰, hanging leftward so it stays inside the window", () => {
    const menu = rule(".has-panjim-clock .panjim-clock .hud-panel-settings .hud-panel-body");
    expect(menu).toMatch(/right: 0;/);
    expect(menu).toMatch(/left: auto;/);
  });

  it("puts the credit in the bottom right corner", () => {
    const corner = rule(".has-panjim-clock .map-corner");
    expect(corner).toMatch(/right: calc\(12px \+ env\(safe-area-inset-right\)\);/);
    expect(corner).toMatch(/left: auto;/);
  });

  it("has Maya say the card is top right", () => {
    const maya = readFileSync("src/data/maya.json", "utf8");
    expect(maya).not.toMatch(/top left/);
    expect(maya).toMatch(/in the card, top right\./);
    expect(JSON.stringify(MAYA)).not.toMatch(/top left/);
  });

  it("orders the keyboard as the screen reads: the card, then the map, then Maya", () => {
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    expect(session).toContain("if (card) container.insertBefore(card, canvas);");
  });

  it("slides the opening view to keep the objective's places and the main town names clear too, falling back step by step", () => {
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    expect(session).toContain("const towns = levelMap.localities.filter((l) => l.rank === 1)");
    expect(session).toContain("const tries = [[...keepClear, ...pins, ...towns], [...keepClear, ...pins], keepClear, arrows?.length && pins.length ? [...arrows, ...pins] : [], arrows ?? []];");
    // A try that fails leaves the view as it was: the first that clears wins.
    expect(session).toContain("lastKeepClear = keepClearOf(lift(points), obstacles);\n                if (lastKeepClear) break;");
    expect(readFileSync("src/app/panjimController.ts", "utf8")).toContain("}, [...along, ...points], along, places);");
  });
});
