import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HUD_OBSTACLES } from "../src/ui/panjim/maya";
import { LABEL_OBSTACLES } from "../src/ui/mapLabels";

/**
 * Section 1f: the minimal HUD. The DOM behaviour is checked in a browser
 * (tools/section1fChecks.ts); these hold the contracts that can be read from
 * the source, so they cannot drift.
 */
const css = readFileSync("src/ui/panjim/panjim.css", "utf8");
const panels = readFileSync("src/ui/panjim/hudPanels.ts", "utf8");
const controller = readFileSync("src/app/panjimController.ts", "utf8");

describe("the two HUD panels", () => {
  it("stand for what is in them in Maya's and the labels' obstacle lists", () => {
    expect(HUD_OBSTACLES).toContain(".hud-panel");
    for (const swallowed of [".instrument-cluster", ".coin-jar", ".field-guide-button", ".panjim-toggles", ".sound-toggle", ".quality-control"]) {
      expect(HUD_OBSTACLES, swallowed).not.toContain(swallowed);
    }
    expect(LABEL_OBSTACLES).toContain(".hud-panel");
    // What is not in a panel stays where it was.
    // Section 8 removed the Houses standing box and the cone's chip from the game screen.
    for (const gone of [".houses-counter", ".forecast-cone-card"]) expect(HUD_OBSTACLES, gone).not.toContain(gone);
    // Section 33b: the objective lives in the HUD card (.panjim-clock), so the old panel is no obstacle of hers.
    expect(HUD_OBSTACLES).not.toContain(".objectives-panel");
    for (const stays of [".panjim-clock", ".map-corner", ".build-popover", ".hud-tooltip", ".era-banner"]) expect(HUD_OBSTACLES, stays).toContain(stays);
  });

  it("Section 35.2: the HUD card holds a third box, Points, and its rectangle is the obstacle, unchanged", () => {
    const clock = readFileSync("src/ui/panjim/clockHud.ts", "utf8");
    // Inside the card's own markup, so the card's rectangle (300 px, top right) covers it.
    const card = clock.slice(clock.indexOf('this.el.className = "hud-card panjim-clock"'), clock.indexOf("container.appendChild(this.el)"));
    expect(card).toContain('class="clock-points"');
    expect(css).toMatch(/\.panjim-clock \{[^}]*width: 300px;/);
    expect(HUD_OBSTACLES).toContain(".panjim-clock");
    expect(HUD_OBSTACLES).not.toContain(".clock-points");
  });

  it("moves the existing elements into the panels, never rebuilding them", () => {
    // Section 13: the Status panel holds the Field Guide (and the coin jar, coins on only, Section 5). The meters
    // and the copy of the objectives are taken out of the page on Panaji.
    expect(controller).toMatch(/querySelector<HTMLElement>\("\.instrument-cluster"\)\?\.remove\(\)/);
    // Section 16 B3: the Status panel exists only with coins on (the jar); the Field Guide, the street map, the
    // switches and Start again / Leave are moved into the one ☰ menu.
    expect(controller).toMatch(/if \(this\.panels\.status\) this\.panels\.status\.adopt\(this\.jar\?\.el \?\? null\)/);
    expect(controller).toMatch(/panels\.settings\.adopt\(this\.fieldGuide\.buttonEl, this\.menuStreetSlot, togglesRow\(host\.container\), this\.menuActions\(\)\)/);
    expect(panels).toContain("this.body.appendChild(el)");
  });

  it("is one small plain button each: 36 px, round, no text or number, a neutral glyph", () => {
    expect(css).toMatch(/\.hud-panel-button \{[^}]*width: 36px;[^}]*height: 36px;[^}]*border-radius: 50%;/);
    // The glyphs are drawings only: no text in them, and the button's own text is empty.
    const glyphs = panels.slice(panels.indexOf("const GLYPHS"), panels.indexOf("const LABELS"));
    expect(glyphs).not.toContain("<text");
    expect(panels).toContain("this.button.innerHTML = GLYPHS[id]");
    // Section 16 B3: the settings panel is the ☰ menu, named for what it is.
    expect(panels).toContain('status: "Status", settings: "Menu"');
  });

  it("has accessible names, aria-expanded, a tooltip on hover and focus only, and a focus ring", () => {
    expect(panels).toContain('setAttribute("aria-label", LABELS[id])');
    expect(panels).toContain('setAttribute("aria-expanded"');
    expect(css).toMatch(/\.hud-panel-button::before \{[^}]*opacity: 0;/);
    expect(css).toMatch(/\.hud-panel-button:hover::before,\s*\.hud-panel-button:focus-visible::before \{\s*opacity: 1;/);
    expect(css).toMatch(/\.hud-panel-button:focus-visible \{\s*outline: 3px solid/);
  });

  it("opens in 180 ms with transform and opacity only, and at once with reduced or calm motion", () => {
    expect(css).toMatch(/\.hud-panel-body \{[^}]*animation: hud-panel-open 180ms ease-out;/);
    const open = css.slice(css.indexOf("@keyframes hud-panel-open"), css.indexOf("}\n", css.indexOf("@keyframes hud-panel-open") + 60));
    expect(open).toMatch(/opacity: 0; transform: scale\(0\.92\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.hud-panel-body \{ animation: none; \}/);
    expect(css).toContain(".calm-motion .hud-panel-body { animation: none; }");
  });

  it("closes with the button, Esc (Maya's own Esc first) or a press outside, one at a time, and remembers nothing", () => {
    // Section 16 B5: only while the menu is the topmost layer (modalStack.ts); Help or a confirm over it takes the key.
    expect(panels).toContain('event.key !== "Escape" || event.defaultPrevented || !this.isTopmost()');
    expect(panels).toContain('"pointerdown"');
    expect(panels).toContain("if (open) for (const other of this.all) if (other !== panel) other.close();");
    expect(panels).not.toMatch(/localStorage|sessionStorage|writePref|readPref/);
    // Every load starts shut.
    expect(panels).toContain("this.body.hidden = true;");
  });

  it("marks danger without a number, in a shape and a ring as well as a colour", () => {
    expect(panels).toContain("setDanger(on: boolean)");
    // Section 33.5e: its light ring is the token --panel-raised now (Harbour Morning).
    expect(css).toMatch(/\.hud-panel-danger \{[^}]*border: 2px solid var\(--panel-raised\);[^}]*transform: rotate\(45deg\);/);
    expect(css).toMatch(/\.hud-panel\.danger \.hud-panel-button \{[^}]*border-width: 2px;/);
    // On the Status panel only. Section 13: never set on Panaji (Maya says the warning; Status holds no meters).
    expect(panels).toContain('if (id === "status")');
    // Section 16 B3: the Status panel may not exist (coins off), hence the "?.".
    expect(controller).toContain("this.panels.status?.setDanger(false)");
  });

  it("floats the coin jar's gain beside the Status button while it is shut", () => {
    expect(controller).toContain("this.jar.onGain = (text) => status.floatText(text)");
    expect(panels).toContain("if (this.isOpen) return;");
    expect(css).toMatch(/\.hud-panel-pop \{[^}]*left: 46px;/);
  });
});
