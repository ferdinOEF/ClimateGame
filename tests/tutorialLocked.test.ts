import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import levels from "../src/data/levels.json";

/**
 * The Tutorial must never break (CLAUDE.md). Its level entry and its map are
 * pinned here by their exact content: any edit to either fails this test, and
 * has to be made on purpose, with this fingerprint updated in the same change.
 *
 * Section 15 rebuilt the Tutorial on purpose (the Panjim game on a small
 * coast: three builds, one cyclone) and re-locked it with these fingerprints.
 * tests/tutorialRun.test.ts and the walkthrough check that it plays.
 */
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("the Tutorial is locked", () => {
  it("its level entry is exactly as it was", () => {
    const tutorial = (levels as { id: string }[]).find((level) => level.id === "l00-tutorial")!;
    expect(sha(JSON.stringify(tutorial))).toBe("39ac180f2b760c90394cfda4d9f5f3c30caca548cecacd36258c793c2b78a5b1");
  });

  it("its map is exactly as it was", () => {
    expect(sha(readFileSync("src/data/maps/tutorial.json", "utf8"))).toBe("8a9dfa2a6b0ec5e19bfb39f3fe66aee1f0a481f375376a7c43be4bcdd74e58e4");
  });
});
