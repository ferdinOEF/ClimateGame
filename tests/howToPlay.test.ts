import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { howToPlayModel, howToPlayScale, HOWTO_SIZE } from "../src/ui/panjim/howToPlay";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { ELEMENT_BY_ID } from "../src/core/elements";

/**
 * Section 39.3 (owner decision): How to play in place of Play Panjim's start popup. Its numbers come from the level and
 * the element data; "Let's Play!" is the popup's Begin (class `brief-cta`, the same handler).
 */
const panjim = LEVEL_BY_ID.get("l01-first-rains")!;

describe("How to play's numbers", () => {
  const m = howToPlayModel(panjim);

  it("takes the years and the builds from the level", () => {
    expect(m.startYear).toBe(panjim.timeline!.startYear);
    expect(m.endYear).toBe(panjim.timeline!.endYear);
    expect(m.builds).toBe(25);
  });

  it("lists the three storms with their years, kinds, places and the turns between them", () => {
    expect(m.storms.map((s) => `${s.year} ${s.label}`)).toEqual(["2030 Cyclone", "2040 Flood", "2050 Both"]);
    expect(m.storms.map((s) => s.where)).toEqual(["Miramar beach", "down the Mandovi", "cyclone and flood, Campal"]);
    expect(m.storms.map((s) => s.turns)).toEqual([5, 10, 10]);
    // The turns add up to the run's builds: the last storm comes at the end of the last year.
    expect(m.storms.reduce((n, s) => n + s.turns, 0)).toBe(m.builds);
  });

  it("takes the chips from the element data: the dune's, mangrove's and seawall's biodiversity", () => {
    expect(m.duneBio).toBe(ELEMENT_BY_ID.get("dune")!.effects.biodiversity);
    expect(m.mangroveBio).toBe(ELEMENT_BY_ID.get("mangrove")!.effects.biodiversity);
    expect(m.seawallBio).toBe(ELEMENT_BY_ID.get("seawall")!.effects.biodiversity);
    expect([m.duneBio, m.mangroveBio, m.seawallBio]).toEqual([2, 3, -5]);
  });
});

describe("How to play's size", () => {
  it("is 1286 x 708 at 1366x768 and fits 1280x720 without scrolling", () => {
    expect(howToPlayScale(1366, 768)).toBeCloseTo(1, 5);
    const s = howToPlayScale(1280, 720);
    expect(HOWTO_SIZE.width * s).toBeLessThanOrEqual(1280 - 80 + 0.01);
    expect(HOWTO_SIZE.height * s).toBeLessThanOrEqual(720 - 60 + 0.01);
    expect(howToPlayScale(1920, 1080)).toBeGreaterThan(1);
  });
});

describe("How to play in the start popup's place", () => {
  const panel = readFileSync("src/ui/objectivesPanel.ts", "utf8");
  const card = readFileSync("src/ui/panjim/howToPlay.ts", "utf8");

  it("is Play Panjim's only (the Tutorial keeps its brief), and Let's Play! is the brief-cta with Begin's handler", () => {
    expect(panel).toContain('const howTo = level.timeModel === "years" && !level.tutorial ? howToPlayCard(level) : null;');
    expect(panel).toContain('shown.querySelector(".brief-cta")!.addEventListener("click", () => this.hideBrief());');
    expect(card).toContain('<button type="button" class="brief-cta howto-cta">Let\'s Play!</button>');
  });

  it("gives every icon tile an aria label and every picture alt text", () => {
    expect((card.match(/class="howto-tile[^"]*" role="group" aria-label="[^"]+"/g) ?? []).length).toBe(4);
    for (const img of card.match(/<img [^>]+>/g) ?? []) expect(img).toMatch(/alt="[^"]+"/);
  });
});
