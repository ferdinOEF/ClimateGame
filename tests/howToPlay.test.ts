import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  howToFoot, howToPlayHtml, howToPlayModel, howToPlayScale, howToStep, HOWTO_BACK, HOWTO_HEADINGS, HOWTO_NEXT, HOWTO_PLAY, HOWTO_SCREENS, HOWTO_SIZE
} from "../src/ui/panjim/howToPlay";
import { CARD_ICON, CARD_LINES, CARD_NAME, DEFENCE_ORDER } from "../src/ui/panjim/defenceCards";
import { POINT_VALUES } from "../src/core/resiliencePoints";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { ELEMENT_BY_ID } from "../src/core/elements";

/**
 * Section 39.3 (owner decision): How to play in place of Play Panjim's start popup. Its numbers come from the level and
 * the element data; "Let's Play!" is the popup's Begin (class `brief-cta`, the same handler).
 * Section 40.3 (owner decision): three screens in the one card; Next and Back move between them.
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

  it("Section 40.3: the seven defenses, their first lines and their chips come from the build cards' data", () => {
    expect(m.defences.map((d) => d.id)).toEqual([...DEFENCE_ORDER]);
    expect(m.defences).toHaveLength(7);
    for (const d of m.defences) {
      expect(d.name).toBe(CARD_NAME[d.id]);
      expect(d.line).toBe(CARD_LINES[d.id][0]);
      expect(d.bio).toBe(ELEMENT_BY_ID.get(d.id)!.effects.biodiversity);
    }
  });

  it("Section 40.3: the two point numbers come from the points config", () => {
    expect(m.homePoints).toBe(POINT_VALUES.home);
    expect(m.bioPoints).toBe(POINT_VALUES.biodiversity);
    expect([m.homePoints, m.bioPoints]).toEqual([10, 5]);
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
    expect(card).toContain('<button type="button" class="brief-cta howto-cta" hidden>${HOWTO_PLAY}</button>');
    expect(HOWTO_PLAY).toBe("Let's Play!");
  });

  it("Section 40.3: each open starts at screen 1 with its main button focused (after the name card too)", () => {
    expect(panel).toContain("if (this.howTo) openHowToPlay(this.howTo);");
    // Both ways in: the popup's first frame, and the name card closing.
    expect((panel.match(/this\.focusBrief\(\)/g) ?? []).length).toBe(2);
    expect(card).toMatch(/export function openHowToPlay\(card: HTMLElement\): void \{\s*showHowToScreen\(card, 1\);/);
    expect(card).toContain("if (focus) (next.hidden ? play : next).focus({ preventScroll: true });");
  });
});

describe("Section 40.3: How to play in three screens", () => {
  const m = howToPlayModel(panjim);
  const html = howToPlayHtml(m);
  /** One screen's HTML. */
  const screen = (n: number): string => {
    const start = html.indexOf(`data-screen="${n}"`);
    const end = n < HOWTO_SCREENS ? html.indexOf(`data-screen="${n + 1}"`) : html.indexOf('<div class="howto-foot">');
    expect(start, `screen ${n}`).toBeGreaterThan(-1);
    return html.slice(start, end);
  };
  /** What a player reads or hears: the text between the tags and the labels, no drawings. */
  const said = (part: string): string => {
    const labels = [...part.matchAll(/aria-label="([^"]*)"/g)].map((x) => x[1]).join(" ");
    return `${part.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ")} ${labels}`.replace(/&amp;/g, "&").replace(/\s+/g, " ");
  };

  it("has three screens, the first showing, each with its heading and the Game rules chip", () => {
    expect(HOWTO_SCREENS).toBe(3);
    expect((html.match(/<section class="howto-screen /g) ?? []).length).toBe(3);
    expect(screen(1)).not.toMatch(/^[^>]*\shidden/);
    for (const n of [2, 3]) expect(screen(n)).toMatch(/^[^>]*\shidden>/);
    HOWTO_HEADINGS.forEach((heading, i) => {
      expect(screen(i + 1)).toContain(`<h2 class="howto-title" id="howto-heading-${i + 1}">${heading}</h2><span class="howto-rules">Game rules</span>`);
    });
    expect([...HOWTO_HEADINGS]).toEqual(["Three disasters are coming", "Each year", "Know these icons"]);
    // The band: where the player is, and three marks.
    expect(html).toContain('<span class="howto-count">1 of 3</span><span class="howto-said" aria-live="polite"></span>');
    // Each screen's number and heading are read out as it opens; a held Enter presses one button only.
    const source = readFileSync("src/ui/panjim/howToPlay.ts", "utf8");
    expect(source).toContain('card.querySelector(".howto-said")!.textContent = `${n} of ${HOWTO_SCREENS}, ${HOWTO_HEADINGS[n - 1]}`;');
    expect(source).toContain('if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();');
    expect((html.match(/<i( class="on")?><\/i>/g) ?? []).length).toBe(3);
  });

  it("Next and Back move between them and stop at the ends", () => {
    expect(howToStep(1, "next")).toBe(2);
    expect(howToStep(2, "next")).toBe(3);
    expect(howToStep(3, "next")).toBe(3);
    expect(howToStep(3, "back")).toBe(2);
    expect(howToStep(2, "back")).toBe(1);
    expect(howToStep(1, "back")).toBe(1);
  });

  it("Back is on every screen but the first; the main button is Next, and Let's Play! only on screen 3", () => {
    expect(howToFoot(1)).toEqual({ back: false, main: HOWTO_NEXT });
    expect(howToFoot(2)).toEqual({ back: true, main: HOWTO_NEXT });
    expect(howToFoot(3)).toEqual({ back: true, main: HOWTO_PLAY });
    // One of each in the card, in the foot row, in the tab order Back then the main button.
    const foot = html.slice(html.indexOf('<div class="howto-foot">'));
    expect(foot.indexOf("howto-back")).toBeLessThan(foot.indexOf("howto-next"));
    expect(foot.indexOf("howto-next")).toBeLessThan(foot.indexOf("brief-cta howto-cta"));
    expect((html.match(/class="brief-cta/g) ?? []).length).toBe(1);
    expect(html.split(HOWTO_PLAY).length - 1).toBe(1);
    expect(foot).toContain(`<button type="button" class="howto-back" hidden>${HOWTO_BACK}</button>`);
    expect(foot).toContain(`<button type="button" class="brief-cta howto-cta" hidden>${HOWTO_PLAY}</button>`);
    expect([HOWTO_NEXT, HOWTO_BACK]).toEqual(["Next", "Back"]);
  });

  it("no longer has Read the map or its two pictures", () => {
    expect(html).not.toMatch(/Read the map/i);
    expect(html).not.toMatch(/<img|help-heat|help-cone|Red stripes|The storm's path/);
    // The picture files stay in public/art; the card no longer names them.
    expect(readFileSync("src/ui/panjim/howToPlay.ts", "utf8")).not.toMatch(/help-heat|help-cone|<img/);
  });

  it("screen 1: the line, the start and the three storm cards from the model", () => {
    const one = screen(1);
    expect(one).toContain(`It's ${m.startYear}. A cyclone, a flood, then both together! Keep Panjim standing till ${m.endYear}.`);
    expect(one).toContain(`<b>${m.startYear}</b><span>You start</span>`);
    m.storms.forEach((s, i) => {
      expect(one).toContain(`<span>${s.turns} turns</span>`);
      expect(one).toContain(`<b class="howto-storm-year">${s.year}</b><span class="howto-storm-n">Storm ${i + 1}</span>`);
      expect(one).toContain(`<span class="howto-storm-where">${s.where}</span>`);
    });
    expect([...one.matchAll(/<b class="howto-storm-title">([^<]+)<\/b>/g)].map((x) => x[1])).toEqual(["Cyclone", "Flood", "Both together!"]);
    expect([...one.matchAll(/<span class="howto-storm-line">([^<]+)<\/span>/g)].map((x) => x[1])).toEqual([
      "Waves and surge from the sea, with wind",
      "Monsoon water down the Mandovi",
      "A cyclone and a flood at the same time"
    ]);
    expect([...one.matchAll(/class="howto-storm howto-storm-([a-z]+)"/g)].map((x) => x[1])).toEqual(["cyclone", "flood", "compound"]);
  });

  it("screen 2: the year's three steps, the legend and the seven defenses with their chips, all from the data", () => {
    const two = screen(2);
    expect(two).toContain(`<span class="howto-head-note">${m.builds} turns or builds in ${m.builds} years</span>`);
    expect([...two.matchAll(/<figcaption>([^<]+)<\/figcaption>/g)].map((x) => x[1])).toEqual(["Click a Tile", "Build a Defense", "1 turn = 1 build = 1 year"]);
    expect(two).toContain("<h3>What you can build</h3>");
    // The legend's two numbers are the mangrove's and the seawall's.
    const legend = two.slice(two.indexOf('class="howto-legend"'), two.indexOf('<ul class="howto-builds">'));
    expect(legend).toMatch(new RegExp(`class="howto-chip up"[^>]*aria-label="Biodiversity plus ${m.mangroveBio}"[\\s\\S]*<span>\\+${m.mangroveBio}</span></span><span>adds to biodiversity</span>`));
    expect(legend).toMatch(new RegExp(`class="howto-chip down"[^>]*aria-label="Biodiversity minus ${-m.seawallBio}"[\\s\\S]*<span>−${-m.seawallBio}</span></span><span>takes from it</span>`));
    // Seven cells in the build menu's order, each with the card's own icon, name, chip and first line.
    const cells = [...two.matchAll(/<li class="howto-build" data-defence="([a-z_]+)">([\s\S]*?)<\/li>/g)];
    expect(cells.map((c) => c[1])).toEqual([...DEFENCE_ORDER]);
    for (const [, id, cell] of cells) {
      const bio = ELEMENT_BY_ID.get(id)!.effects.biodiversity;
      expect(cell).toContain(CARD_ICON[id]);
      expect(cell).toContain(`<b>${CARD_NAME[id]}</b>`);
      expect(cell).toContain(`<span>${CARD_LINES[id][0]}</span>`);
      expect(cell).toContain(`class="howto-chip ${bio > 0 ? "up" : "down"}"`);
      expect(cell).toContain(`<span>${bio > 0 ? `+${bio}` : `−${-bio}`}</span>`);
    }
    // The icons keep their own colours: the card's SVG is used as it is.
    expect(two).toContain(CARD_ICON.mangrove);
    expect(two).toContain('<li class="howto-build howto-build-note">Each one fits only some tiles. Click a tile to see what it takes.</li>');
  });

  it("screen 3: the three icons and the two ways to get points, with the points config's numbers", () => {
    const three = screen(3);
    expect([...three.matchAll(/class="howto-tile howto-tile-[a-z]+" role="group" aria-label="([^"]+)"/g)].map((x) => x[1])).toEqual([
      "Cyclone: waves and surge from the sea",
      "River flood: monsoon water down the Mandovi",
      "Wind: comes with every cyclone"
    ]);
    expect(three).toContain("<h3>Get points</h3>");
    expect(three).toContain(`<b>Save homes</b><p>Every home still standing after a storm scores.</p><span class="howto-point-chip">${POINT_VALUES.home} points a home</span>`);
    expect(three).toContain(
      `<b>Increase biodiversity</b><p>Nature based defenses like mangroves and khazans add Biodiversity Points. Dams and seawalls (concrete and metal) reduce them.</p><span class="howto-point-chip">${POINT_VALUES.biodiversity} points for each Biodiversity Point you add</span>`
    );
    expect(three).toContain("10 points a home");
    expect(three).toContain("5 points for each Biodiversity Point you add");
  });

  it("keeps the player text rules: no middle dot, no spaced dash, no hyphen joining words, and defense", () => {
    const text = said(html);
    expect(text).not.toMatch(/·/);
    expect(text).not.toMatch(/\s[-–—]\s/);
    expect(text).not.toMatch(/[A-Za-z]-[A-Za-z]/);
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/defence/i);
    expect(text).toMatch(/Build a Defense/);
    // Nothing about money.
    expect(text).not.toMatch(/fund|grant|money|budget|cost of/i);
  });
});
