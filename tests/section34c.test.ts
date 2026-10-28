/**
 * Section 34c (owner, 28 October 2026): the HUD card at half its size, top right; Maya bottom left; the street map's
 * credit bottom right; Kala Academy on the Mandovi bank (the Riverfront zone's redraw was dropped by the owner: the
 * zone is part of the hazard model). The browser half is tools/section34cShots.ts and tools/section33bViews.ts
 * (docs/qa/section34c/).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAYA } from "../src/core/mayaLines";
import { neighbors } from "../src/core/hex";

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
    expect(session).toContain("= [[keepClear, [...pins, ...towns]], [keepClear, pins], [keepClear, []], [arrows ?? [], pins], [arrows ?? [], []]];");
    // A try that fails leaves the view as it was: the first that clears wins. The places and names are secondary.
    expect(session).toContain("lastKeepClear = keepClearOf(lift(points), obstacles, undefined, undefined, lift(secondary));\n                if (lastKeepClear) break;");
    // keepClearOf: a secondary point never counts as off the screen, and never trades a forecast point's place.
    const scene = readFileSync("src/render/scene.ts", "utf8");
    expect(scene).toContain("else if (i < points.length && (x < margin || y < margin || x > w - margin || y > h - margin)) off++;");
    expect(scene).toContain("for (const allowed of secondary.length ? [start.off] : [start.off, start.off + start.hidden]) {");
    expect(readFileSync("src/app/panjimController.ts", "utf8")).toContain("}, [...along, ...points], along, places);");
  });
});

describe("34c.3: Kala Academy on the Mandovi bank at Campal", () => {
  const map = JSON.parse(readFileSync("src/data/maps/panaji.json", "utf8")) as { monuments: { id: string; q: number; r: number }[]; tiles: { q: number; r: number; terrainId: string }[] };
  const terrain = new Map(map.tiles.map((t) => [`${t.q},${t.r}`, t.terrainId]));
  const waterAround = (q: number, r: number): string[] =>
    neighbors({ q, r }).map((n) => terrain.get(`${n.q},${n.r}`) ?? "").filter((t) => t === "coast" || t === "river" || t === "estuary");

  it("stands on 5,10, a land tile with the Mandovi mouth beside it (its old tile 5,11 looked only onto the creek)", () => {
    const kala = map.monuments.find((m) => m.id === "kala_academy")!;
    expect([kala.q, kala.r]).toEqual([5, 10]);
    expect(terrain.get("5,10")).toBe("land");
    expect(waterAround(5, 10)).toContain("coast");
    expect(waterAround(5, 11)).toEqual(["river", "river"]);
  });

  it("is moved by the generator's hand edits, not by hand in the generated map", () => {
    const edits = JSON.parse(readFileSync("tools/mapgen/panaji-hand-edits.json", "utf8")) as { monuments: { id: string; from: number[]; to: number[] }[] };
    expect(edits.monuments.at(-1)).toEqual({ id: "kala_academy", from: [5, 11], to: [5, 10] });
  });
});

describe("34c.4: the heat year's camera move frames Get ahead's tiles too", () => {
  it("works out Get ahead before the move (renderHeat runs before the panels) and centres between the two sets", () => {
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    const heat = controller.slice(controller.indexOf("  renderHeat(): void {"), controller.indexOf("  /** Section 34b.3: the storms whose heat has had its camera move"));
    expect(heat).toContain("const ahead = framing && this.refreshAhead().complete ? this.aheadRows.flatMap((job) => this.pulseKeys(job)) : [];");
    expect(heat).toContain("if (framing && (hot.length > 0 || (ahead.length > 0 && !this.aheadFramed.has(next.id)))) {");
    // A move to Get ahead alone does not use up the heat's own.
    expect(heat).toContain("if (hot.length > 0) this.heatFramed.add(next.id);");
    expect(heat).toContain("if (ahead.length === 0) this.host.moveCamera(hot.map(coordOf));");
    // With the objective done nothing may be hot: Get ahead's tiles alone.
    expect(heat).toContain("else if (hot.length === 0) this.host.moveCamera(ahead.map(coordOf));");
    expect(heat).toContain("this.host.moveCamera(all, { q: (h.q + g.q) / 2, r: (h.r + g.r) / 2 });");
    expect(controller).toContain("const { rows, complete, ahead } = this.refreshAhead();");
  });
});
