import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Section 1e: Maya never moves. Her travelling behaviour is gone from the
 * code, not just switched off, so it cannot come back by accident.
 */
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("Maya is locked in place", () => {
  it("has no goTo, goHome, anchor, away or hopping, and no jump state", () => {
    for (const file of ["src/ui/panjim/maya.ts", "src/ui/panjim/mayaLayout.ts", "src/app/mayaDirector.ts", "src/app/panjimController.ts"]) {
      const text = strip(readFileSync(file, "utf8"));
      expect(text, file).not.toMatch(/\bgoTo\b|\bgoHome\b|\banchor\b|"away"|\bhopping\b|"jump"|state-jump/);
    }
    const css = strip(readFileSync("src/ui/panjim/panjim.css", "utf8"));
    expect(css).not.toMatch(/\.away\b|\.hopping\b|state-jump|maya-hop|maya-arrive|maya-fade|maya-nod/);
  });

  it("places her figure by one CSS rule, never from script", () => {
    const maya = strip(readFileSync("src/ui/panjim/maya.ts", "utf8"));
    expect(maya).not.toMatch(/figure\.style\.(left|top|bottom|right|transform|visibility)/);
    expect(maya).not.toMatch(/badge\.style\.(left|top)/);
  });

  it("stands in the bottom right corner (Section 33b): her figure and badge are placed from the right and the bottom", () => {
    const css = strip(readFileSync("src/ui/panjim/panjim.css", "utf8"));
    for (const sel of [".maya-figure-wrap", ".maya-badge"]) {
      const rule = css.match(new RegExp(`\\n\\${sel} \\{([^}]*)\\}`))?.[1] ?? "";
      expect(rule, sel).toMatch(/\bright: var\(--maya-home\);/);
      expect(rule, sel).toMatch(/\bbottom: var\(--maya-home\);/);
      expect(rule, sel).not.toMatch(/\bleft:/);
    }
  });

  it("watches only the HUD elements her bubble must clear, not the whole page", () => {
    const maya = strip(readFileSync("src/ui/panjim/maya.ts", "utf8"));
    // The observer is pointed at obstacles one by one (and the container's own children), never at the container's subtree.
    expect(maya).not.toMatch(/observer\.observe\(container, \{[^}]*subtree/);
    expect(maya).toMatch(/observer\.observe\(el, \{ subtree: true/);
  });

  it("lays out at most once a frame, only when something changed, and only while a line is up", () => {
    const maya = readFileSync("src/ui/panjim/maya.ts", "utf8");
    const frame = maya.slice(maya.indexOf("  frame(nowMs: number): void {"));
    // No fixed-interval relayout: the only timer is the poll while a line is up.
    expect(frame).toContain("if (!this.layoutDirty) return;");
    expect(frame).toContain("const waiting = this.current !== null || this.heldBack;");
    expect(maya).not.toMatch(/nowMs - this\.lastLayoutMs > 250/);
  });
});
