import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHOW_MAYA } from "../src/services/features";

/** Section 17c (owner decision): Maya is hidden everywhere; her code and art stay, behind SHOW_MAYA. */
const controller = readFileSync("src/app/panjimController.ts", "utf8");
const css = readFileSync("src/ui/panjim/panjim.css", "utf8");

describe("Maya hidden", () => {
  it("is off by default", () => {
    expect(SHOW_MAYA).toBe(false);
  });

  it("is muted for good, never drawn, and not in the start popup", () => {
    expect(controller).toContain("muted: !SHOW_MAYA || !this.mayaToggle.value");
    expect(controller).toContain('host.container.classList.toggle("no-maya", !SHOW_MAYA);');
    expect(css).toMatch(/\.no-maya \.maya,\s*\.no-maya \.maya-full-figure \{\s*display: none !important;/);
  });

  it("has no item in ☰ and no M shortcut", () => {
    expect(controller).toContain("if (!SHOW_MAYA) this.mayaToggle.el.remove();");
    expect(controller).toContain('if (SHOW_MAYA && (event.key === "m" || event.key === "M")) this.mayaToggle.toggle();');
  });

  it("puts none of her lines on the result cards", () => {
    expect(controller).toContain("defencesCard(result, SHOW_MAYA && top ?");
    expect(controller).toContain("SHOW_MAYA ? results.comingUp[next.kind] ?? null : null");
  });

  it("is not named in Help or Sources", () => {
    expect(readFileSync("src/ui/panjim/panjimHelp.ts", "utf8")).not.toMatch(/What Maya/);
    expect(readFileSync("src/ui/sourcesScreen.ts", "utf8")).not.toMatch(/Maya tags/);
  });
});
