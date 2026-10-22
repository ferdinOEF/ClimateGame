import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flagOr, SHOW_MAYA } from "../src/services/features";
import { MAYA_PALETTE } from "../src/ui/panjim/mayaArt";

/**
 * Section 29 (owner decision): Maya is visible again, by default; Section 17c's switch stays, so
 * `VITE_SHOW_MAYA=false` hides her as before. Her skin is 50% fairer (a palette change only: she is not redrawn).
 */
const controller = readFileSync("src/app/panjimController.ts", "utf8");
const css = readFileSync("src/ui/panjim/panjim.css", "utf8");

/** CIELAB L* of a hex colour. */
function lightness(hex: string): number {
  const lin = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const y = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

describe("Maya shown (Section 29)", () => {
  it("is on by default, and the build flag can still hide her", () => {
    expect(SHOW_MAYA).toBe(true);
    expect(flagOr(undefined, true)).toBe(true);
    expect(flagOr("", true)).toBe(true);
    expect(flagOr("false", true)).toBe(false);
    expect(flagOr(" FALSE ", true)).toBe(false);
    expect(flagOr("true", false)).toBe(true);
    expect(flagOr("typo", true)).toBe(true);
  });

  it("keeps Section 17c's gates, so hiding her still removes her everywhere", () => {
    expect(controller).toContain("muted: !SHOW_MAYA || !this.mayaToggle.value");
    expect(controller).toContain('host.container.classList.toggle("no-maya", !SHOW_MAYA);');
    expect(css).toMatch(/\.no-maya \.maya,\s*\.no-maya \.maya-full-figure \{\s*display: none !important;/);
    expect(controller).toContain("if (!SHOW_MAYA) this.mayaToggle.el.remove();");
    expect(controller).toContain('if (SHOW_MAYA && (event.key === "m" || event.key === "M")) this.mayaToggle.toggle();');
    expect(controller).toContain("defencesCard(result, SHOW_MAYA && top ?");
    expect(controller).toContain("SHOW_MAYA ? results.comingUp[next.kind] ?? null : null");
  });

  it("makes her skin 50% fairer: the base halfway to white in lightness, the shading steps kept", () => {
    const before = { skin: "#c98f68", "skin-shadow": "#ab7551", "skin-deep": "#92603f" } as const;
    const L0 = lightness(before.skin);
    expect(lightness(MAYA_PALETTE.skin)).toBeCloseTo(L0 + 0.5 * (100 - L0), 0);
    for (const token of ["skin-shadow", "skin-deep"] as const) {
      const stepBefore = L0 - lightness(before[token]);
      const stepNow = lightness(MAYA_PALETTE.skin) - lightness(MAYA_PALETTE[token]);
      expect(Math.abs(stepNow - stepBefore), token).toBeLessThan(1.5);
    }
    expect(lightness(MAYA_PALETTE.hands)).toBeGreaterThan(lightness(MAYA_PALETTE.skin));
  });
});
