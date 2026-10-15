import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import levels from "../src/data/levels.json";

/**
 * The Tutorial must never change (CLAUDE.md). Sections 5 to 7 change only
 * Panaji, so the Tutorial's level entry and its map are pinned here by their
 * exact content: any edit to either fails this test, and has to be made on
 * purpose, with this fingerprint updated in the same change.
 */
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("the Tutorial is locked", () => {
  it("its level entry is exactly as it was", () => {
    const tutorial = (levels as { id: string }[]).find((level) => level.id === "l00-tutorial")!;
    expect(sha(JSON.stringify(tutorial))).toBe("80f9fb7924aa61ae35cb2730f8476340debae5946f60b202df6470f96e7483e1");
  });

  it("its map is exactly as it was", () => {
    expect(sha(readFileSync("src/data/maps/tutorial.json", "utf8"))).toBe("faf8259c731b01e60ed0041d0884b204cce2c49a369af530326bd4b0c54e782b");
  });
});
