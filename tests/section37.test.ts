import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Section 37: the playtest fixes, where a source check is the test (the browser checks are in tools/section37Shots.ts). */
const read = (path: string): string => readFileSync(path, "utf8");

describe("Section 37.2: the build menu clear of the bottom banner", () => {
  it("the cards avoid the banner, and the banner hides while a menu is open", () => {
    expect(read("src/app/gameSession.ts")).toMatch(/avoid: \[[^\]]*"\.empty-prompt"/);
    const popover = read("src/ui/buildPopover.ts");
    expect(popover).toContain('this.backdrop.parentElement?.classList.add("build-menu-open");');
    expect(popover).toContain('this.backdrop.parentElement?.classList.remove("build-menu-open");');
    expect(read("src/ui/panjim/panjim.css")).toMatch(/\.has-panjim-clock\.build-menu-open \.empty-prompt \{\s*opacity: 0;\s*visibility: hidden;/);
  });
});
