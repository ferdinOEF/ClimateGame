import { describe, expect, it } from "vitest";
import { tagChipText, tagFromSearch, TAG_PATTERN } from "../src/services/testTag";
import { nameCardHtml } from "../src/ui/panjim/nameCard";
import { punctuationProblems } from "./helpers/uiStrings";

/** Section 38.4b: the test tag from the address, and the chip on the name card. */
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the URL filter", () => {
  it("takes 2 to 30 letters, digits or underscores, and ignores anything else", () => {
    expect(tagFromSearch("?qa=1&tag=FestTesters")).toBe("FestTesters");
    expect(tagFromSearch("?tag=ab")).toBe("ab");
    expect(tagFromSearch("?tag=Team_2026")).toBe("Team_2026");
    expect(tagFromSearch("?tag=a")).toBeNull();
    expect(tagFromSearch(`?tag=${"a".repeat(31)}`)).toBeNull();
    expect(tagFromSearch("?tag=no%20spaces")).toBeNull();
    expect(tagFromSearch("?tag=semi;colon")).toBeNull();
    expect(tagFromSearch("?tag=")).toBeNull();
    expect(tagFromSearch("?qa=1")).toBeNull();
    expect(TAG_PATTERN.source).toBe("^[A-Za-z0-9_]{2,30}$");
  });

  it("is never written to storage: the module keeps it in memory only", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/services/testTag.ts", "utf8");
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    expect(readFileSync("src/services/storagePolicy.ts", "utf8")).not.toMatch(/tag/i);
  });
});

describe("the chip on the name card", () => {
  it("shows under the title with a tag, and nowhere without one", () => {
    expect(tagChipText("FestTesters")).toBe("Test session: FestTesters. Not on the board.");
    const html = nameCardHtml(null, "FestTesters");
    expect(html.indexOf('class="name-card-title"')).toBeLessThan(html.indexOf('class="name-card-tag"'));
    expect(html.indexOf('class="name-card-tag"')).toBeLessThan(html.indexOf('class="name-card-line"'));
    expect(text(html)).toContain("Test session: FestTesters. Not on the board.");
    expect(nameCardHtml(null)).not.toContain("name-card-tag");
    expect(nameCardHtml(null, "<b>")).toContain("Test session: &lt;b&gt;.");
    expect(punctuationProblems(tagChipText("FestTesters"))).toEqual([]);
  });
});
