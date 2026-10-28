import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertLine, type Maya, type MayaLine } from "../src/ui/panjim/maya";
import { MayaDirector, phaseLine } from "../src/app/mayaDirector";
import { buildHoverLine, prepProgress, rowMissNote } from "../src/core/prep";
import { BUILDING_KINDS, CAMPAL_WIND_NOTE, campalWindNote, type PhaseResult } from "../src/core/phaseResult";
import { MAYA } from "../src/core/mayaLines";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { CARD_NAME } from "../src/ui/panjim/defenceCards";
import { defencesCard, homesHtml, otherKindNote, placeWord, resultCard, retryLabel } from "../src/ui/panjim/resultCards";
import { guideCounts, SPECIES, visitLine } from "../src/ui/panjim/fieldGuide";
import { TILE_NOTES } from "../src/ui/panjim/defenceCards";
import { COMBO_INFO, COMBO_SOURCE, comboNote } from "../src/core/combos";
import { factById } from "../src/core/facts";
import { LEVELS } from "../src/levels/levels";
import { GameState } from "../src/core/gameState";
import { goodTiles, suggestedDefence } from "../src/core/tutorialNudge";
import { sessionRun } from "./helpers/sessionRun";

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
  it("the banner sits beside the card (Section 34c.2: left of it, its right edge the card and 16 px in), above it (z-index 12), centred in that band", () => {
    const banner = rule("\n.has-panjim-clock .era-banner");
    const right = /right: calc\(([^)]*)\);/.exec(banner)?.[1] ?? "";
    const px = right.split("+").reduce((sum, part) => sum + Number(part.trim().replace("px", "")), 0);
    // Section 34c.1: the card is 300 px wide from 14 px (now from the right, Section 34c.2).
    expect(px).toBeGreaterThanOrEqual(14 + 300 + 16);
    expect(banner).toMatch(/z-index: 12;/);
    expect(banner).toMatch(/left: 12px;/);
    expect(banner).toMatch(/transform: none;/);
    expect(banner).toMatch(/top: calc\(14px \+ env\(safe-area-inset-top\)\);/);
    // The card it must clear: z-index 10, 300 px wide from 14 px (Section 34c.1).
    const card = rule("\n.panjim-clock");
    expect(card).toMatch(/z-index: 10;/);
    expect(card).toMatch(/width: 300px;/);
  });

  it("keeps beside the card at every width (Section 34c.2: no narrow window rule moves it to the bottom)", () => {
    const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
    expect(css).not.toMatch(/@media \(max-width: 899px\) \{\s*\.has-panjim-clock \.era-banner/);
  });
});

describe("34b.2: Maya's bubble, and tips one a year", () => {
  /** A Maya with just the queue the director uses (the real one needs a page). */
  function fakeMaya(): { maya: Maya; order: string[]; queue: MayaLine[]; dismissed: () => number } {
    const queue: MayaLine[] = [];
    const order: string[] = [];
    let dismissals = 0;
    let current: MayaLine | null = null;
    const maya = {
      isMuted: false,
      speaking: false,
      get currentLine() {
        return current;
      },
      say: (l: MayaLine) => insertLine(queue, l),
      get queued() {
        return queue;
      },
      withdraw: (p: (l: MayaLine) => boolean) => {
        for (let i = queue.length - 1; i >= 0; i--) if (p(queue[i])) queue.splice(i, 1);
      },
      dismiss: () => void dismissals++,
      next: (pick?: (l: MayaLine) => boolean) => {
        const at = pick ? queue.findIndex(pick) : 0;
        if (at < 0 || at >= queue.length) return false;
        current = queue.splice(at, 1)[0];
        order.push(current.id);
        return true;
      }
    } as unknown as Maya;
    return { maya, order, queue, dismissed: () => dismissals };
  }
  const fact = (id: string): MayaLine => ({ id, text: id, state: "tip", fact: { id, progress: () => "" } });
  const challenge = { id: "c2030", kind: "cyclone", turn: 5 };
  const runAt = (year: number, moment: number) => ({ year, moment, prep: [], nextChallenge: () => challenge, buildsUntil: () => 5 });

  it("a line with Got it has no hide timer; only a passing line closes by itself", () => {
    const maya = readFileSync("src/ui/panjim/maya.ts", "utf8");
    const armHide = maya.slice(maya.indexOf("  private armHide("), maya.indexOf("  private shield("));
    expect(armHide).toContain("if (!line.hint) return;");
    expect(maya).toContain("if (line.hint && !this.holdLines) this.armHide(line);");
    expect(maya).toContain("this.dismissEl.hidden = !!line.hint;");
    // The storm's calls, the calm and the replay are the passing lines.
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller.match(/hint: true/g)).toHaveLength(3);
  });

  it("says at most one fact or tip a year, and never the same one twice in a run", () => {
    const { maya, order } = fakeMaya();
    const run = runAt(2026, 1);
    const director = new MayaDirector(maya, { run, blocked: () => false, quiet: true } as never);
    maya.say(fact("f1"));
    maya.say(fact("f2"));
    director.pump();
    run.moment = 2;
    director.pump();
    expect(order).toEqual(["f1"]);
    // The next year, the next one.
    run.year = 2027;
    run.moment = 3;
    director.pump();
    expect(order).toEqual(["f1", "f2"]);
    // f1 again (offered again later in the run): dropped, never said twice.
    maya.say(fact("f1"));
    run.year = 2028;
    run.moment = 4;
    director.pump();
    expect(order).toEqual(["f1", "f2"]);
    expect(director.shownTips.has("f1")).toBe(true);
  });

  it("a line that is not a tip goes ahead of a tip held to its year", () => {
    const { maya, order } = fakeMaya();
    const run = runAt(2026, 1);
    const director = new MayaDirector(maya, { run, blocked: () => false, quiet: true } as never);
    maya.say(fact("f1"));
    director.pump();
    maya.say(fact("f2"));
    maya.say({ id: "objective-done:c2030", text: "x", state: "tip" });
    run.moment = 5;
    director.pump();
    expect(order).toEqual(["f1", "objective-done:c2030"]);
  });

  it("a retry empties the queue of tips, closes her line and says where the run is first", () => {
    const { maya, order, queue, dismissed } = fakeMaya();
    const run = runAt(2026, 1);
    const director = new MayaDirector(maya, { run, blocked: () => false, quiet: false, exposure: () => null } as never);
    queue.length = 0;
    maya.say(fact("f1"));
    maya.say(fact("f2"));
    director.phaseStart(true);
    expect(dismissed()).toBe(1);
    expect(queue.map((l) => l.text)).toEqual(["Back at 2026. 5 builds before the cyclone."]);
    director.pump();
    expect(order).toHaveLength(1);
    expect(order[0]).toMatch(/^phase:c2030:/);
    expect(phaseLine(false, 2031, 10, "flood")).toBe("On to 2031. 10 builds before the flood.");
  });
});

describe("34b.3: the camera moves only at its set moments", () => {
  /** Maya, as far as the director's warnings need her: what she was asked to say. */
  function sayer(): { maya: Maya; said: MayaLine[] } {
    const said: MayaLine[] = [];
    const maya = { say: (l: MayaLine) => said.push(l), withdraw: () => undefined, dismiss: () => undefined } as unknown as Maya;
    return { maya, said };
  }
  const challenge = { id: "c2030", kind: "cyclone", turn: 5 };
  const exposure = { kind: "cyclone", intensity: new Map([["1,1", 2], ["2,1", 2]]), exposure: new Map(), housesAtRisk: ["1,1", "2,1"] };

  it("a build in a heat year moves nothing: the heat's warning has no camera move; Last call moves it once, with its tiles", () => {
    const focused: { coord: { q: number; r: number }; tiles: readonly { q: number; r: number }[] | undefined }[] = [];
    const { maya, said } = sayer();
    const run = { yearsUntil: () => 2, nextChallenge: () => challenge, state: { elements: new Map() }, prep: [], zones: null, objective: null };
    const director = new MayaDirector(maya, {
      run,
      exposure: () => exposure,
      blocked: () => false,
      project: () => null,
      focus: (coord: { q: number; r: number }, tiles?: readonly { q: number; r: number }[]) => focused.push({ coord, tiles }),
      landmarks: [{ name: "Miramar", q: 1, r: 1 }],
      quiet: false
    } as never);
    said.length = 0;
    // Two builds in the first heat year: one warning, no camera move.
    director.consider();
    director.consider();
    const warn = said.filter((l) => l.id === "warn:c2030");
    expect(warn).toHaveLength(1);
    expect(warn[0].onShow).toBeUndefined();
    for (const line of said) line.onShow?.();
    expect(focused).toHaveLength(0);
    // The storm's year: Last call, and its move when it shows, once, to the place and its homes at risk.
    run.yearsUntil = () => 1;
    director.consider();
    director.consider();
    const last = said.filter((l) => l.id === "last:c2030");
    expect(last).toHaveLength(1);
    last[0].onShow?.();
    expect(focused).toHaveLength(1);
    expect(focused[0].tiles?.length).toBeGreaterThan(1);
  });

  it("the controller moves the camera for the heat once a storm, the row click and Maya's Last call through the clear move", () => {
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    // Section 34c.4: the heat year's move also frames Get ahead's tiles (tests/section34c.test.ts).
    expect(controller).toContain("const framing = warning && !this.heatFramed.has(next.id) && !this.tutorial;");
    expect(controller).toContain("focus: (coord, tiles) => this.host.moveCamera(tiles ?? [coord], coord),");
    expect(controller).toContain("this.host.moveCamera((keys.length ? keys : [key]).map(coordOf), coordOf(key));");
    // focusCamera is left to the storms' replay and the test scenarios.
    const uses = controller.split("\n").filter((l) => l.includes("this.host.focusCamera(")).length;
    expect(uses).toBe(5);
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    // Held while a build menu or tile card is open, made as it closes.
    expect(session).toContain("if (buildPopover.isOpen) pendingCameraMove = move;");
    expect(session).toContain("if (pendingCameraMove && !buildPopover.isOpen) {");
    expect(session).toContain(`.panjim-clock, .maya-figure-wrap, .maya-badge:not([hidden]), .maya-bubble:not([hidden])`);
  });
});

describe("34b.4: rows count the place they name", () => {
  const coordOf = (key: string): { q: number; r: number } => ({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) });

  it("a build of the row's defence anywhere in its place counts when it takes a home out of the storm's risk; one that takes none says so and does not count", async () => {
    const { newRun, BOT_LEVEL } = await import("../tools/panjimBots/bots");
    const { passYear } = await import("./helpers/passYear");
    const run = newRun("rows-place", BOT_LEVEL, true);
    // Phase 2 (the 2040 flood): its rows name localities ("in Merces").
    while (run.landed.size === 0) passYear(run);
    const next = run.nextChallenge()!;
    let counted = false;
    let missed = false;
    for (const row of run.prep) {
      expect(row.credited, row.label).toBeDefined();
      expect(row.placeTiles!.length).toBeGreaterThanOrEqual(row.tiles!.length);
      // A tile of the place that is not one of the row's own (pulsing) tiles.
      for (const key of row.placeTiles!) {
        if (row.tiles!.includes(key) || !run.state.canBuild(coordOf(key), row.elementId)) continue;
        const saves = (run.riskChangeBy(next, coordOf(key), row.elementId)?.saved.length ?? 0) > 0;
        if ((saves && counted) || (!saves && missed)) continue;
        const before = prepProgress(row, run.state, run.zones!).current;
        const outcome = run.build(coordOf(key), row.elementId);
        expect(outcome.ok).toBe(true);
        const after = prepProgress(row, run.state, run.zones!).current;
        if (saves) {
          expect(after, `${row.label}: ${key} takes a home out of risk`).toBe(Math.min(row.count, before + 1));
          expect(outcome.rowMiss).toBeUndefined();
          counted = true;
        } else {
          expect(after, `${row.label}: ${key} takes none`).toBe(before);
          expect(outcome.rowMiss).toBe(row.place);
          expect(rowMissNote(outcome.rowMiss!)).toBe(`Built ${row.place}, but no home there was still at risk from this storm.`);
          missed = true;
        }
        if (counted && missed) break;
      }
      if (counted && missed) break;
    }
    expect(counted, "a build off the row's own tiles that counted").toBe(true);
    expect(missed, "a build in the place that took no home out of risk").toBe(true);
  }, 120_000);

  it("a phase's rows start with the builds already standing in their place that help (a Get ahead khazan)", async () => {
    const { newRun, BOT_LEVEL } = await import("../tools/panjimBots/bots");
    const { passYear } = await import("./helpers/passYear");
    const run = newRun("rows-ahead", BOT_LEVEL, true);
    const ahead = run.aheadObjective()!;
    expect(ahead).not.toBeNull();
    const pick = ahead.objective.picks.find((p) => p.elementId === "khazan") ?? ahead.objective.picks[0];
    expect(run.build(coordOf(pick.key), pick.elementId).ok).toBe(true);
    while (run.landed.size === 0) passYear(run);
    const row = run.prep.find((r) => r.elementId === pick.elementId && r.placeTiles!.includes(pick.key));
    expect(row, `a phase 2 row for ${pick.elementId} whose place holds ${pick.key}`).toBeDefined();
    expect(row!.credited).toContain(pick.key);
    expect(prepProgress(row!, run.state, run.zones!).current).toBeGreaterThanOrEqual(1);
    // The review's MAJOR: the target counts the credited builds too, so no row starts done.
    for (const r of run.prep) {
      expect(r.count, r.label).toBe(new Set(r.credited).size + (run.objective?.picks.filter((p) => p.elementId === r.elementId && r.placeTiles!.includes(p.key)).length ?? 0));
      expect(prepProgress(r, run.state, run.zones!).done, `${r.label} starts done`).toBe(false);
    }
  }, 120_000);

  it("no phase's row starts done, on any of four bot runs that follow the objective and Get ahead", async () => {
    const { newRun, BOT_LEVEL } = await import("../tools/panjimBots/bots");
    const { passYear } = await import("./helpers/passYear");
    for (const seed of ["rows-a", "rows-b", "rows-c", "rows-d"]) {
      const run = newRun(seed, BOT_LEVEL, true);
      let checked = run.nextChallenge()?.id;
      for (const row of run.prep) expect(prepProgress(row, run.state, run.zones!).done, `${seed} ${row.label}`).toBe(false);
      while (!run.finished) {
        // Build a pick still open (the objective's, then Get ahead's), else let the year pass.
        const picks = [...(run.objective?.picks ?? []), ...(run.aheadObjective()?.objective.picks ?? [])];
        const pick = picks.find((p) => run.state.canBuild(coordOf(p.key), p.elementId));
        if (pick) run.build(coordOf(pick.key), pick.elementId);
        else passYear(run);
        const next = run.nextChallenge()?.id;
        if (next && next !== checked) {
          checked = next;
          for (const row of run.prep) expect(prepProgress(row, run.state, run.zones!).done, `${seed} ${next} ${row.label}`).toBe(false);
        }
      }
    }
  }, 600_000);

  it("the hover line: every card that takes no home out of the next storm's risk says so, and only those", () => {
    expect(buildHoverLine({ saved: [], added: [] })).toBe("This doesn't change the next storm");
    expect(buildHoverLine({ saved: ["1,1"], added: [] })).toBeNull();
    expect(buildHoverLine({ saved: ["1,1"], added: ["2,2"] })).toBeNull();
    expect(buildHoverLine({ saved: [], added: ["2,2"] })).toBe("This saves no home from the next storm, and puts some at risk");
  });
});

describe("34b.5: the result cards tell the whole story", () => {
  /** The cards build their HTML with `document`; here a stand-in hands back the markup they wrote. */
  const realDocument = (globalThis as { document?: unknown }).document;
  beforeAll(() => {
    (globalThis as { document?: unknown }).document = {
      createElement: () => {
        let html = "";
        return {
          set innerHTML(value: string) {
            html = value;
          },
          get firstElementChild() {
            return { outerHTML: html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
          }
        };
      }
    };
  });
  afterAll(() => {
    (globalThis as { document?: unknown }).document = realDocument;
  });
  const card = (el: unknown): { outerHTML: string; text: string } => el as { outerHTML: string; text: string };
  const result = (extra: Partial<PhaseResult> = {}): PhaseResult => ({
    challengeId: "c2-flood",
    eyebrow: "2040, Flood",
    stars: 2,
    homesSaved: 40,
    homesTotal: 50,
    homesLostBefore: 0,
    places: [],
    defences: [
      { elementId: "mangrove", name: "Mangrove", homes: 6 },
      { elementId: "sandy_vegetation", name: "Pandanus", homes: 0 }
    ],
    windLost: 0,
    ...extra
  });
  const targets = (id: string): readonly string[] => ELEMENT_BY_ID.get(id)?.targetsHazards ?? [];

  it("card 2 has a row for each defence that broke in this storm, and says when it had cracked with age", () => {
    const html = card(defencesCard(result({ broken: [{ elementId: "small_dam", name: "Small dam", cracked: true }] }), null, targets, "flood")).text;
    expect(html).toContain("Small dam Broke in this flood Cracked with age");
    const cyclone = card(defencesCard(result({ broken: [{ elementId: "seawall", name: "Seawall", cracked: false }] }), null, targets, "cyclone")).text;
    expect(cyclone).toContain("Seawall Broke in this cyclone");
    // The 2050 storm is a cyclone and a flood: "this storm".
    expect(card(defencesCard(result({ broken: [{ elementId: "seawall", name: "Seawall", cracked: true }] }), null, targets, "compound")).text).toContain("Seawall Broke in this storm Cracked with age");
    expect(cyclone).not.toContain("Cracked with age");
  });

  it("names each defence as its build card does: Small dam, never Small Dam", () => {
    expect(CARD_NAME.small_dam).toBe("Small dam");
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).toContain("defences: phase.defences.map((d) => ({ ...d, name: CARD_NAME[d.elementId] ?? d.name })),");
    expect(readFileSync("src/app/gameSession.ts", "utf8")).toContain("name: panjim ? (CARD_NAME[def.id] ?? def.name) : def.name,");
  });

  it("a row of the other storm's kind carries the Tutorial's note", () => {
    const flood = card(defencesCard(result(), null, targets, "flood")).text;
    expect(flood).toContain("Pandanus 0 A cyclone defence; this was a river flood");
    expect(flood).not.toMatch(/Mangrove 6 A /);
    expect(otherKindNote(targets("khazan"), "cyclone")).toBe("A flood defence; this was a cyclone");
    expect(otherKindNote(targets("small_dam"), "cyclone")).toBe("A flood defence; this was a cyclone");
    // The 2050 storm is both: no row is the wrong kind.
    expect(otherKindNote(targets("khazan"), "compound")).toBeNull();
  });

  it("the final card counts every storm's path", () => {
    expect(homesHtml(105, 125, 0, "the storms'")).toContain("125 homes stood in the storms' paths; 20 were lost");
    expect(homesHtml(46, 57)).toContain("57 homes stood in its path; 11 were lost");
  });

  it("a place that is not a building reads Flooded", () => {
    expect(placeWord({ stood: false, building: false })).toBe("Flooded");
    expect(placeWord({ stood: false, building: true })).toBe("Damaged");
    expect(placeWord({ stood: true, building: false })).toBe("Stood");
    expect(BUILDING_KINDS.has("beach")).toBe(false);
    expect(BUILDING_KINDS.has("institution")).toBe(true);
    const html = card(resultCard(result({ places: [{ name: "Miramar Beach", stood: false, building: false }, { name: "Kala Academy", stood: false, building: true }] }))).text;
    expect(html).toContain("Miramar Beach Flooded");
    expect(html).toContain("Kala Academy Damaged");
  });

  it("Back on the cards reads Previous card; Speed up's words are a tooltip, not a label", () => {
    const cards = readFileSync("src/ui/panjim/resultCards.ts", "utf8");
    expect(cards).toContain(`back.textContent = "Previous card";`);
    expect(cards).not.toContain(`back.textContent = "Back";`);
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).toContain("button.title = SPEED_UP_WHY;");
    expect(controller).toContain(`button.setAttribute("aria-describedby", why.id);`);
    expect(controller).not.toContain("dataset.hint");
    expect(css).not.toContain("data-hint");
  });
});

describe("34b.7: text and small interface fixes", () => {
  it("1. an unseen creature's line names its home as the build cards do", () => {
    expect(visitLine("sandy_vegetation")).toBe("Not seen yet. Something visits pandanus.");
    expect(visitLine("mangrove")).toBe("Not seen yet. Something visits mangrove.");
    expect(visitLine("dune")).toBe("Not seen yet. Something visits a dune.");
    expect(visitLine("small_dam")).toBe("Not seen yet. Something visits a small dam.");
    expect(visitLine("water")).toBe("Not seen yet. Something swims in the open water.");
    for (const species of SPECIES) expect(visitLine(species.home)).not.toMatch(/_|sandy vegetation/);
  });

  it("2. the menu's Field Guide line counts notes and creatures apart", () => {
    expect(guideCounts("1 of 22", 0, 11)).toBe("1 of 22 notes, 0 of 11 creatures");
    expect(guideCounts(null, 3, 11)).toBe("3 of 11 creatures");
  });

  it("3. How to play: the heat marks the homes a storm would take, by water or wind", () => {
    expect(readFileSync("src/ui/panjim/panjimHelp.ts", "utf8")).toContain("striped red tiles mark the homes it would take, by water or wind.");
  });

  it("4. the Tutorial's timeline ticks its own storm years; the last line goes when no builds remain; the caption holds through the storm", () => {
    const outlook = readFileSync("src/ui/panjim/outlookBar.ts", "utf8");
    expect(outlook).toContain("const years = span <= 10 ? [...stormYears].sort((a, b) => a - b) :");
    expect(outlook).toContain("view.year < view.endYear ? `<b>Every storm is behind you.</b> Finish the city by ${view.endYear}.` : \"\"");
    // The Tutorial runs 2026 to 2032 with storms in 2029 and 2032; Panjim's 25 years keep the five year marks.
    const tutorial = LEVELS.find((l) => l.tutorial)!;
    expect(tutorial).toBeDefined();
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    const render = controller.slice(controller.indexOf("  private renderTutorial("), controller.indexOf("  private tutorialSuggestion("));
    expect(render).toContain("if (this.stagingYearEnd) return;");
  });

  it("5. a home's card, the line under Demolish and the open sea say what they are", () => {
    // The review: a rule is said as the game's (CLAUDE.md), beyond the brief's own words.
    expect(TILE_NOTES.home).toBe("Homes stand here. In this game nothing can be built on a home.");
    expect(TILE_NOTES.oneBuild).toBe("In this game a tile holds one build; demolish to build another here.");
    expect(TILE_NOTES.sea).toBe("Nothing can be built out here.");
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    expect(session).toContain("removeNote: panjim && def.kind !== \"building\" ? TILE_NOTES.oneBuild : undefined,");
    expect(session).toContain(": panjim && def.kind === \"building\"\n              ? TILE_NOTES.home");
    expect(session).toContain("terrainId === \"coast\" ? TILE_NOTES.sea : TILE_NOTES.nothing");
  });

  it("6. the combo notes are game rules, and the Field Guide's combo rules carry the Sahapedia fact", () => {
    expect(comboNote(COMBO_INFO.living_bund)).toBe("In this game: a khazan and mangroves side by side protect each other.");
    expect(comboNote(COMBO_INFO.mangrove_belt)).toBe("In this game: three or more mangroves side by side protect each other.");
    const fact = factById(COMBO_SOURCE);
    expect(fact?.citation?.publisher).toBe("Sahapedia");
    expect(fact?.kind).toBe("fact");
    expect(readFileSync("src/app/panjimController.ts", "utf8")).toContain("this.host.showBanner(comboNote(info), 3800);");
  });

  it("7. the main menu's map credit comes after its buttons in the tab order", () => {
    const menu = readFileSync("src/ui/screens/menuScreen.ts", "utf8");
    expect(menu.indexOf("root.appendChild(screen);")).toBeGreaterThan(-1);
    expect(menu.indexOf("root.appendChild(menuArtCredit());")).toBeGreaterThan(menu.indexOf("root.appendChild(screen);"));
    expect(menu).toContain(`text: "Best played in a window 1366 by 768 or larger."`);
  });
});

describe("34b.8: Esc only closes what is open", () => {
  it("with nothing open on Panjim or the Tutorial, Esc closes Maya's line or does nothing; Leave is in ☰ only", () => {
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    const at = session.indexOf("if (modals.escape() !== \"none\") return;");
    const handler = session.slice(at, session.indexOf("{ signal: keydownAbort.signal }", at));
    expect(handler).toContain("if (panjim.maya.speaking) panjim.maya.dismiss();");
    expect(handler).not.toContain("askLeave(");
    // ☰'s Leave still asks.
    expect(session).toContain("requestLeave: () => askLeave(true),");
  });
});

describe("34b.9: seawalls on the shore, small dams on the upstream river", () => {
  const strip = (cells: [number, number, string][]): GameState => new GameState(cells.map(([q, r, terrainId]) => ({ coord: { q, r }, terrainId })), [], 100000);

  it("a seawall needs land (beach, shore or wetland edge) with a sea neighbour; never the sea", () => {
    const board = strip([[0, 0, "coast"], [1, 0, "beach"], [2, 0, "beach"], [1, -1, "land"], [0, 1, "estuary"], [3, 0, "land"]]);
    expect(board.canBuild({ q: 1, r: 0 }, "seawall")).toBe(true);
    expect(board.canBuild({ q: 1, r: -1 }, "seawall")).toBe(true);
    expect(board.canBuild({ q: 0, r: 1 }, "seawall")).toBe(true);
    expect(board.canBuild({ q: 0, r: 0 }, "seawall")).toBe(false);
    expect(board.canBuild({ q: 2, r: 0 }, "seawall")).toBe(false);
    expect(board.canBuild({ q: 3, r: 0 }, "seawall")).toBe(false);
    // The breakwater keeps the sea.
    expect(board.canBuild({ q: 0, r: 0 }, "breakwater")).toBe(true);
  });

  it("a small dam needs a river tile with no sea neighbour and at most two river neighbours", () => {
    const narrow = strip([[0, 0, "river"], [1, 0, "river"], [2, 0, "river"], [1, 1, "land"]]);
    expect(narrow.canBuild({ q: 1, r: 0 }, "small_dam")).toBe(true);
    const mouth = strip([[0, 0, "river"], [1, 0, "river"], [2, 0, "coast"]]);
    expect(mouth.canBuild({ q: 1, r: 0 }, "small_dam")).toBe(false);
    const wide = strip([[1, 0, "river"], [0, 0, "river"], [2, 0, "river"], [1, -1, "river"], [2, -1, "river"]]);
    expect(wide.canBuild({ q: 1, r: 0 }, "small_dam")).toBe(false);
  });

  it("the Tutorial's river keeps its dam tiles, and its seawall nudge is on land beside the sea", () => {
    const tutorial = LEVELS.find((l) => l.tutorial)!;
    const run = sessionRun(tutorial);
    const rivers = [...run.state.placed.values()].filter((t) => t.terrainId === "river" && run.state.buildableAt(t.coord).length > 0);
    expect(rivers.length).toBeGreaterThan(0);
    for (const t of rivers) expect(run.state.canBuild(t.coord, "small_dam"), `${t.coord.q},${t.coord.r}`).toBe(true);
    // Play the nudge's order to the seawall, each at its best tile.
    const tried = new Set<string>();
    for (;;) {
      const id = suggestedDefence(tried, run.nextChallenge()?.kind ?? null);
      expect(id).not.toBeNull();
      const tiles = goodTiles(run, id!);
      if (id === "seawall") {
        expect(tiles.length, "the seawall nudge has a tile").toBeGreaterThan(0);
        for (const { coord } of tiles) expect(run.state.placed.get(`${coord.q},${coord.r}`)!.terrainId, "a seawall nudge tile").not.toBe("coast");
        break;
      }
      expect(tiles.length, `${id} has a tile`).toBeGreaterThan(0);
      expect(run.build(tiles[0].coord, id!).ok).toBe(true);
      tried.add(id!);
    }
  });
});

describe("34b.11 and 34b.12: Esc on the result cards; Try again says where it goes", () => {
  it("Esc on a result card does nothing (it jumped to the last card)", () => {
    const cards = readFileSync("src/ui/panjim/resultCards.ts", "utf8");
    const esc = cards.slice(cards.indexOf(`if (event.key === "Escape") {`), cards.indexOf(`if (event.key === "Enter") {`));
    expect(esc).toContain("event.stopImmediatePropagation();");
    expect(esc).not.toMatch(/index =|render\(\)/);
  });

  it("the retry button reads Try again from the phase's first year: 2026, 2031, 2041", async () => {
    const { newRun, BOT_LEVEL } = await import("../tools/panjimBots/bots");
    const run = newRun("retry-label", BOT_LEVEL);
    expect(run.schedule.map((c) => retryLabel(run.phaseStartYear(c)))).toEqual(["Try again from 2026", "Try again from 2031", "Try again from 2041"]);
  });
});

describe("34b.13: a word about the wind before 2050 and after", () => {
  it("Maya's 2050 warning says the cyclone brings wind onto Campal, and that only pandanus shelters homes from it (a game rule)", () => {
    expect(MAYA.warning.wind).toBe("The cyclone brings wind onto Campal. In this game only pandanus shelters homes from the wind.");
    const director = readFileSync("src/app/mayaDirector.ts", "utf8");
    expect(director).toContain("(next.kind === \"compound\" ? ` ${MAYA.warning.wind}` : \"\")");
  });

  it("card 2 after 2050 says so when most of the homes lost stood in the wind at Campal, and only then", () => {
    const places = [{ name: "Campal", q: 6, r: 10 }, { name: "Miramar", q: -2, r: 17 }];
    const campal = ["6,3", "4,4", "5,4", "2,5"];
    expect(campalWindNote("compound", 6, campal, places)).toBe(CAMPAL_WIND_NOTE);
    // Not most of the homes lost; not at Campal; not the 2050 storm.
    expect(campalWindNote("compound", 10, campal, places)).toBeNull();
    expect(campalWindNote("compound", 4, ["-2,17", "-3,18", "-2,18"], places)).toBeNull();
    expect(campalWindNote("cyclone", 6, campal, places)).toBeNull();
  });

  it("the wind row asks for pandanus only where a beach tile can shelter the homes in the wind; at Campal none can (the gap for the owner)", async () => {
    const { newRun, BOT_LEVEL } = await import("../tools/panjimBots/bots");
    const { passYear } = await import("./helpers/passYear");
    const run = newRun("wind-row", BOT_LEVEL, true);
    while (run.landed.size < 2) passYear(run);
    expect(run.nextChallenge()!.kind).toBe("compound");
    // Since the owner's decision of 28 October the wind reaches only homes within two tiles of a beach for pandanus;
    // on this board the 2050 water alone takes every one of them, so no home falls to the wind alone, pandanus saves
    // none, and the still helps rule offers no pandanus row (reported to the owner).
    const pandanus = run.prep.filter((row) => row.elementId === "sandy_vegetation");
    for (const row of pandanus) expect(row.label).toMatch(/^Plant [12] pandanus on (the Campal beach|the beach near .+|the beach)$/);
    expect(pandanus).toHaveLength(0);
  }, 120_000);
});

describe("34b.14: the art pass (render only, no change to what a storm takes)", () => {
  it("a browser without the canvas blur (older Safari) gets the same rings, baked once, pre-blurred", () => {
    const sky = readFileSync("src/render/storm/stormSky.ts", "utf8");
    expect(sky).toContain("if (!canvasBlurWorks()) {");
    expect(sky).toContain("paintRing(canvas.getContext(\"2d\")!, seed, RING_TEXTURE_SIZE, RING_AT);");
    const seeds = [...sky.matchAll(/\{ radius: [\d.]+, strength: [\d.]+, spin: [\d.]+, seed: (\d+) \}/g)].map((m) => m[1]);
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      // One file per ring (tools/bakeStormRings.ts), a PNG at the painted size.
      const png = readFileSync(`public/art/storm-ring-${seed}.png`);
      expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
    }
    expect(readFileSync("src/render/storm/ringPaint.ts", "utf8")).toContain("export const RING_TEXTURE_SIZE = 256;");
  });

  it("the cyclone is soft rings, not puffs; the rain leans with the wind; a river flood is never drawn on the sea", () => {
    const sky = readFileSync("src/render/storm/stormSky.ts", "utf8");
    expect(sky).toContain("function ringTexture(");
    expect(sky).not.toMatch(/buildSpiral\(|spiralMaterial/);
    // Three to five rings, each 0.35 to 0.5 at most.
    const rings = [...sky.matchAll(/\{ radius: [\d.]+, strength: ([\d.]+), spin: [\d.]+, seed: \d+ \}/g)].map((m) => Number(m[1]));
    expect(rings.length).toBeGreaterThanOrEqual(3);
    expect(rings.length).toBeLessThanOrEqual(5);
    for (const s of rings) expect(s >= 0.35 && s <= 0.5, String(s)).toBe(true);
    expect(readFileSync("src/render/stormManager.ts", "utf8")).toContain("uniform vec2 uSlant;");
    expect(readFileSync("src/app/gameSession.ts", "utf8")).toContain("storm.setWindDirection(stormDirector?.windDirection);");
    const water = readFileSync("src/render/storm/stormWater.ts", "utf8");
    expect(water).toContain("look[i4 + 1] = slot.sea ? 0 : Math.max(flood, stored);");
    expect(water).not.toContain("vec3(0.13, 0.38, 0.54)");
  });

  it("the storm sea is the board's own sea, a little greyer, and 20% darker where deep", async () => {
    const { stormSea } = await import("../src/render/storm/stormWater");
    const { PALETTE } = await import("../src/render/palette");
    const hsl = (c: { getHSL: (t: { h: number; s: number; l: number }) => unknown }) => {
      const out = { h: 0, s: 0, l: 0 };
      c.getHSL(out);
      return out;
    };
    const sea = hsl(PALETTE.seaTurquoise);
    const deep = hsl(stormSea(0.8, 0.7));
    expect(deep.h).toBeCloseTo(sea.h, 3);
    expect(deep.l).toBeCloseTo(sea.l * 0.8, 3);
    expect(deep.s).toBeCloseTo(sea.s * 0.7, 3);
  });

  it("the seawall and the breakwater keep their footprints on the tile", async () => {
    const { createDefenceGeometry } = await import("../src/render/defenceGeometry");
    for (const id of ["seawall", "breakwater"]) {
      const g = createDefenceGeometry(id)!;
      g.computeBoundingBox();
      const box = g.boundingBox!;
      // The same footprint as before the pass (its tile ring included: x -0.78 to 0.86 at most, z within 0.9), low.
      expect(box.min.x, id).toBeGreaterThanOrEqual(-0.79);
      expect(box.max.x, id).toBeLessThanOrEqual(0.87);
      expect(Math.max(-box.min.z, box.max.z), id).toBeLessThanOrEqual(0.91);
      expect(box.max.y, id).toBeLessThanOrEqual(0.65);
    }
  });
});

describe("34b.15: the flood is muddy water, not night (the owner's mock up, Option B)", () => {
  it("a river tile's flood is a radial gradient brown to grey to the river's blue, 0.92 to 0.70; flooded land flat grey at 0.60; foam lines on river tiles only; never on the sea", async () => {
    const { FLOOD } = await import("../src/render/storm/stormWater");
    expect(FLOOD).toEqual({ centre: "#7E6A48", mid: "#5D6260", rim: "#3F7F9E", land: "#5D6260", foam: "#DDE3D2" });
    const water = readFileSync("src/render/storm/stormWater.ts", "utf8");
    expect(water).toContain("mud = mix(uFloodCentre, uFloodMid, smoothstep(0.0, 0.55, e));");
    expect(water).toContain("mud = mix(mud, uFloodRim, smoothstep(0.55, 1.0, e));");
    expect(water).toContain("alpha = mix(alpha, alpha / 0.86 * mix(0.92, 0.70, e), flood);");
    expect(water).toContain("mud = mix(mud, uFloodFoam, lines * 0.45);");
    expect(water).toContain("alpha = mix(alpha, alpha / 0.82 * 0.6, flood);");
    expect(water).toContain("look[i4 + 1] = slot.sea ? 0 : Math.max(flood, stored);");
  });
});

describe("34b, the owner's decision of 28 October: the wind reaches the homes near the beach", () => {
  it("in the 2030 cyclone and the 2050 storm, wind falls only on tiles within two of a beach tile that can take pandanus", async () => {
    const { newRun, BOT_LEVEL } = await import("../tools/panjimBots/bots");
    const { passYear } = await import("./helpers/passYear");
    const { computeWater, LANDFALL_ZONE, sandForPandanus, HAZARD_MODEL } = await import("../src/core/hazardModel");
    const { shelterOf } = await import("../src/core/climate");
    const { computeCombos } = await import("../src/core/combos");
    const { axialDistance } = await import("../src/core/hex");
    expect(HAZARD_MODEL.wind!.sandReachHex).toBe(2);
    const run = newRun("wind-reach", BOT_LEVEL);
    const sand = sandForPandanus(run.state);
    expect(sand.length).toBeGreaterThan(0);
    for (const storm of run.schedule.filter((c) => c.kind !== "flood")) {
      while (run.nextChallenge()?.id !== storm.id) passYear(run);
      const input = { kind: storm.kind, strength: storm.strength, landfall: run.landfallOf(storm), sheltered: shelterOf(storm), wind: storm.wind, turn: storm.turn - 1 };
      const water = computeWater(run.state, input as never, { combos: computeCombos(run.state).bonus, landfallZoneTiles: run.zones!.keys(LANDFALL_ZONE) });
      expect(water.wind!.size, storm.id).toBeGreaterThan(0);
      for (const key of water.wind!.keys()) {
        const [q, r] = key.split(",").map(Number);
        expect(sand.some((b) => axialDistance(b, { q, r }) <= 2), `${storm.id} ${key}`).toBe(true);
      }
      // The Campal front, three to six tiles from the beach, takes no wind (it took the most in 2050 before).
      for (const key of ["6,3", "4,4", "2,5", "4,6"]) expect(water.wind!.has(key), `${storm.id} ${key}`).toBe(false);
      for (const key of shelterOf(storm) ?? []) expect(water.wind!.has(key), `${storm.id} sheltered ${key}`).toBe(false);
      while (!run.landed.has(storm.id)) passYear(run);
    }
    const rule = factById("wind-reach");
    expect(rule?.kind).toBe("gameRule");
    expect(rule?.text).toBe("A cyclone's wind reaches the homes near the beach; pandanus within two tiles halves the wind damage.");
    expect(readFileSync("src/ui/panjim/fieldGuide.ts", "utf8")).toContain(`text: \`In this game \${windReach.charAt(0).toLowerCase()}\${windReach.slice(1)}\``);
  }, 120_000);
});

describe("owner decision 7 (28 October): the red comes on by itself once the list is done", () => {
  it("Show risk turns on once a phase when the objective is done; R still turns it off; Maya's Press R line is gone", () => {
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).toContain("if (done && !this.riskAfterObjective && next && !warning) {\n        this.riskAfterObjective = true;\n        this.riskToggle.set(true);");
    expect(controller).not.toContain("Press R to see the homes");
    expect(controller).toContain(`if (event.key === "r" || event.key === "R") this.riskToggle.toggle();`);
  });
});

describe("owner, 28 October: Maya's bubble steps aside for an open build menu or tile card", () => {
  it("the bubble hides while a menu is open and comes back as it was (unless Got it was pressed); no new line starts meanwhile", () => {
    const maya = readFileSync("src/ui/panjim/maya.ts", "utf8");
    expect(maya).toContain("setTucked(on: boolean): void {");
    expect(maya).toContain("if (this.current || this.muted || this.minimised || this.tucked) return false;");
    expect(maya).toContain("if (this.minimised || this.tucked || !this.current) return;");
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    expect(session).toContain('panjim?.maya.setTucked(buildPopover.isOpen && !panjim.maya.currentLine?.id.startsWith("tutorial:"));');
    // The Tutorial's coaching lines are about the open menu: they speak over it (review, MAJOR).
    expect(readFileSync("src/app/panjimController.ts", "utf8")).toContain("    this.maya.setTucked(false);\n    this.maya.next();");
    expect(session).not.toContain("if (panjim?.maya.speaking) panjim.maya.dismiss();\n    openTilePopover(coord);");
  });
});
