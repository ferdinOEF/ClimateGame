import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HUD_OBSTACLES, MOVE_GAP_MS, SETTLE_MS } from "../src/ui/panjim/maya";

/**
 * Section 30b (owner bug): Maya's bubble flickered and Got it missed. The cause: "Got it" carries a HUD tooltip
 * ("Closes Maya's tip.", panjimController.attachTooltips), and `.hud-tooltip` is one of her obstacles. Hovering
 * Got it showed the tooltip over the bubble's lower edge, the bubble moved away, the pointer was off Got it, the
 * tooltip hid, the bubble moved back: a loop about once a second. The browser test is tools/section30bBubble.ts.
 */
const maya = readFileSync("src/ui/panjim/maya.ts", "utf8");
const css = readFileSync("src/ui/panjim/panjim.css", "utf8");

describe("Maya's bubble holds still (Section 30b)", () => {
  it("is frozen while the pointer is on her or her bubble", () => {
    expect(maya).toMatch(/for \(const part of \[this\.bubble, this\.figure\]\) \{\s*part\.addEventListener\("pointerenter", \(\) => \(this\.pointerOver = true\)\);/);
    expect(maya).toMatch(/if \(this\.pointerOver && this\.bubbleAt !== ""\) \{\s*this\.layoutDirty = true;\s*return;/);
  });

  it("never counts a tooltip on her own controls as an obstacle", () => {
    expect(HUD_OBSTACLES).toContain(".hud-tooltip");
    expect(maya).toContain('if (el.matches(".hud-tooltip") && el.id && ownTips.has(el.id)) continue;');
  });

  it("moves a placed bubble only to a spot that held, at most once a second, fading in", () => {
    expect(MOVE_GAP_MS).toBeGreaterThanOrEqual(1000);
    expect(SETTLE_MS).toBeGreaterThan(16 * 2);
    expect(maya).toMatch(/now - this\.pendingSpot\.since < SETTLE_MS \|\| now - this\.lastMoveMs < MOVE_GAP_MS/);
    expect(css).toMatch(/\.maya-bubble\.moved \{\s*animation: maya-bubble-moved 220ms ease-out;/);
  });

  it("places a new line at once (only a bubble already up waits)", () => {
    expect(maya).toMatch(/const placed = this\.bubbleAt !== "";/);
    expect(maya).toMatch(/this\.bubbleAt = "";\s*this\.pendingSpot = null;/);
  });
});
