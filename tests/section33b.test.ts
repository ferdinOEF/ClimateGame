import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HUD_OBSTACLES } from "../src/ui/panjim/maya";

/**
 * Section 33b (owner decisions): one static HUD card in the top left holding every status and the objective; Maya in
 * the bottom right; the hint a pill at the bottom centre; the build menu with a pointer to its tile; the phase's
 * opening view slid clear of the card and Maya.
 */
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(readFileSync("src/ui/panjim/panjim.css", "utf8"));
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("Section 33b: the HUD card, top left", () => {
  it("sits 14 px from the left and 12 px from the top, 400 px wide, never collapsing", () => {
    const card = rule(".panjim-clock");
    expect(card).toMatch(/left: calc\(14px/);
    expect(card).toMatch(/top: calc\(12px/);
    expect(card).toMatch(/width: 400px;/);
    expect(card).toMatch(/border: 1px solid var\(--panel-edge\);/);
    expect(card).toMatch(/border-radius: 18px;/);
    // No header band, stitch or strips on it.
    expect(readFileSync("src/ui/harbour.css", "utf8")).not.toMatch(/\.panjim-clock::before/);
  });

  it("holds the objective, and the old bottom right panel is gone from the Panjim game", () => {
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).toContain("this.clock.objectiveSlot.appendChild(this.tutorialPanel?.el ?? this.getReady.el);");
    expect(controller).not.toMatch(/mountPanel/);
    expect(rule(".has-panjim-clock .objectives-panel")).toMatch(/display: none !important;/);
  });

  it("is what Maya's bubble keeps clear of, at its full size", () => {
    expect(HUD_OBSTACLES).toContain(".panjim-clock");
    expect(HUD_OBSTACLES).not.toContain(".objectives-panel");
  });
});

describe("Section 33b.5: the hint, the build menu and the opening views", () => {
  it("shows the hint as a 40 px pill at the bottom centre, kept on screen", () => {
    const pill = rule(".has-panjim-clock .empty-prompt");
    expect(pill).toMatch(/height: 40px;/);
    expect(pill).toMatch(/border-radius: 999px;/);
    expect(pill).toMatch(/max-width: calc\(100vw - 32px\);/);
  });

  it("gives the build menu a pointer on the side facing its tile, and keeps it off the hint and Maya", () => {
    expect(css).toMatch(/\.build-popover\.as-cards\.pointer-left::before \{[^}]*border-right-color: var\(--panel\);/);
    expect(css).toMatch(/\.build-popover\.as-cards\.pointer-right::before \{[^}]*border-left-color: var\(--panel\);/);
    const popover = readFileSync("src/ui/buildPopover.ts", "utf8");
    expect(popover).toMatch(/classList\.toggle\("pointer-left"/);
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    expect(session).toContain(`{ avoid: [".panjim-clock", ".get-ready", ".tutorial-panel", ".maya-bubble:not([hidden])", ".maya-figure-wrap", ".maya-badge:not([hidden])", ".map-corner", ".hud-chrome", ".empty-prompt"],`);
  });

  it("slides a phase's opening view clear of the card and Maya by moving only where the camera looks", () => {
    const scene = readFileSync("src/render/scene.ts", "utf8");
    const fn = scene.slice(scene.indexOf("  function keepClearOf("), scene.indexOf("  function fitTo("));
    expect(fn).toContain("desiredTarget = {");
    expect(fn).not.toMatch(/desiredDistance =|distance =|rad =/);
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).toMatch(/\}, \[\.\.\.along, \.\.\.points\], along\);/);
  });
});
