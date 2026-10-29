import { describe, expect, it } from "vitest";
import { sideBySideNote, sourceLine } from "../src/ui/panjim/fieldGuide";
import { keysLine } from "../src/ui/panjim/panjimHelp";
import { TILE_NOTES } from "../src/ui/panjim/defenceCards";
import { objectiveHtml } from "../src/ui/panjim/resultCards";
import { factById, SHOWN_FACTS } from "../src/core/facts";
import { punctuationProblems } from "./helpers/uiStrings";
import type { PhaseResult } from "../src/core/phaseResult";

/** Section 37.7: the text fixes (B1 to B10). */
describe("Section 37.7: text", () => {
  it("one Side by side rule in the Field Guide, and a source dated n.d. takes one stop", () => {
    expect(sideBySideNote()).toBe("In this game: three or more mangroves side by side protect each other; a khazan and mangroves side by side protect each other.");
    expect(sourceLine("Fact.", { publisher: "Sahapedia", year: "n.d." })).toBe("Fact. Source: Sahapedia, n.d.");
    expect(sourceLine("Fact.", { publisher: "IMD", year: 2021 })).toBe("Fact. Source: IMD, 2021.");
  });

  it("the Game rules list: no dune wear, and one of the two wind rules", () => {
    expect(factById("dune-shrinks")).toBeUndefined();
    expect(factById("wind-shelter")).toBeUndefined();
    expect(factById("wind-reach")!.text).toBe("A cyclone's wind reaches the homes near the beach; pandanus within two tiles halves the wind damage.");
    expect(SHOWN_FACTS.filter((f) => f.kind === "gameRule" && /wind damage/.test(f.text))).toHaveLength(1);
  });

  it("the objective's badge is Objective done, with three stars too", () => {
    const html = objectiveHtml({ objectiveComplete: true, stars: 3, shortOfThree: null } as unknown as PhaseResult);
    expect(html).toContain("Objective done");
    expect(html).not.toContain("Objective complete");
  });

  it("Help's keys line, and the river mouth's note", () => {
    expect(keysLine(true)).toBe(
      "By keyboard: Tab to the board (after the HUD), the arrow keys move between tiles, O jumps to the objective's tiles, Enter opens one, Up and Down pick a card. S: sound on or off. M: Maya's tips on or off. R: show risk."
    );
    expect(keysLine(false)).not.toContain("M: Maya");
    expect(TILE_NOTES.riverMouth).toBe("Open water at the river mouth. In this game a breakwater goes on the sea, up to four tiles from the shore, and a small dam on the narrow river upstream.");
    for (const text of [keysLine(true), TILE_NOTES.riverMouth, sideBySideNote()]) expect(punctuationProblems(text), text).toEqual([]);
  });
});

describe("Section 37.3: a run that did not beat its name's best", () => {
  it("says the best run stays on the board", async () => {
    const { rankHtml } = await import("../src/ui/panjim/resultCards");
    const html = rankHtml({ status: "ready", rank: { rank: 3, points: 4200, tenth: null, above: [], below: [], kept: true } }, "Ana");
    expect(html).toContain("Your best run under this name stays on the board, with 4200 points.");
    expect(html).toContain("3rd on the board");
  });
});

describe("Section 37.9: a rename onto a taken name", () => {
  it("the line the server's refusal shows (Section 38.2: renames are gone; the server keeps the endpoint)", async () => {
    const { NAME_TAKEN } = await import("../src/core/lastCard");
    expect(NAME_TAKEN).toBe("That name is already on the board.");
    expect(punctuationProblems(NAME_TAKEN)).toEqual([]);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/services/board.ts", "utf8")).toContain("taken: status === 409");
  });
});
