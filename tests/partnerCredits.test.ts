import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHOW_PARTNER_CREDITS } from "../src/services/features";

/**
 * Section 17b (owner decision): the landing page's "Brought to you by" plate is hidden behind
 * `SHOW_PARTNER_CREDITS`, off by default. "Facts & sources" stays on the menu as a small text link, and the board
 * render's OpenStreetMap credit is unchanged. The browser checks: tools/section15Checks.ts, tools/creditsCheck.ts.
 */
const menu = readFileSync("src/ui/screens/menuScreen.ts", "utf8");

describe("the partner credits on the landing page", () => {
  it("are off by default", () => {
    expect(SHOW_PARTNER_CREDITS).toBe(false);
  });

  it("draw the plate only behind the switch, and the Facts & sources link (in the quote band, Section 39.2) otherwise", () => {
    expect(menu).toMatch(/if \(SHOW_PARTNER_CREDITS\) \{\s*const credits = creditsStrip\(\);\s*root\.appendChild\(credits\);\s*keepCreditsClear\(screen, credits\);\s*\} else band\.appendChild\(sourcesLink\(\)\);/);
    expect(menu).toContain('el("button", { className: "menu-sources-link", text: "Facts & sources", on: { click: () => openSources() } })');
  });

  it("keep the plate's code and the logo files, so one setting brings them back", () => {
    expect(menu).toContain("function creditsStrip(): HTMLElement");
    expect(menu).toContain('"branding/oneearth-foundation-256.webp"');
    expect(menu).toContain('"branding/gokhush-charitable-trust.svg"');
    for (const file of ["public/branding/oneearth-foundation-256.webp", "public/branding/gokhush-charitable-trust.svg"]) expect(() => readFileSync(file), file).not.toThrow();
  });

  // Part B's one change to it: the dot became a comma (no dots between words). Otherwise as it was.
  it("leave the board render's OpenStreetMap credit visible, its dot now a comma", () => {
    expect(menu).toContain('text: "Board render, map data © OpenStreetMap contributors"');
    expect(menu).toContain('href: "https://www.openstreetmap.org/copyright"');
    expect(menu).toMatch(/root\.appendChild\(menuArtCredit\(\)\);/);
  });
});
