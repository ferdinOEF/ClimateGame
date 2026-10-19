import { describe, expect, it } from "vitest";
import { menuTagline, numberWord, panajiRunPhrase } from "../src/ui/screens/runWords";

describe("Panaji's run in words (from levels.json, never hard-coded)", () => {
  it("spells numbers", () => {
    expect(numberWord(3)).toBe("three");
    // Section 17b (owner decision): no dots or hyphens between words in player-facing text.
    expect(numberWord(25)).toBe("twenty five");
    expect(numberWord(40)).toBe("forty");
  });
  it("says the menu's tagline and the Tutorial card's phrase from the level's own timeline and storms", () => {
    expect(menuTagline()).toBe("Twenty five years of Panjim. Three storms. One build a year.");
    expect(panajiRunPhrase()).toBe("twenty five builds and three storms");
  });
});
