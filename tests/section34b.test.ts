import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { insertLine, type Maya, type MayaLine } from "../src/ui/panjim/maya";
import { MayaDirector, phaseLine } from "../src/app/mayaDirector";

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

describe("34b.2: Maya's bubble, and tips one a year", () => {
  /** A Maya with just the queue the director uses (the real one needs a page). */
  function fakeMaya(): { maya: Maya; order: string[]; queue: MayaLine[]; dismissed: () => number } {
    const queue: MayaLine[] = [];
    const order: string[] = [];
    let dismissals = 0;
    const maya = {
      isMuted: false,
      speaking: false,
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
        order.push(queue.splice(at, 1)[0].id);
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
    expect(controller).toContain("if (hot.length > 0 && !this.heatFramed.has(next.id) && !this.tutorial) {");
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
