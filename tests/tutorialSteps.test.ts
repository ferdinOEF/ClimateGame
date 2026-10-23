import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { NUDGE_ORDER } from "../src/core/tutorialNudge";
import { factById } from "../src/core/facts";
import { STEP_BY_ID, TUTORIAL_STEPS, breaksIn, tutorialStepStrings } from "../src/ui/panjim/tutorialSteps";
import { punctuationProblems } from "./helpers/uiStrings";
import maya from "../src/data/maya.json";
import tooltips from "../src/data/tooltips.json";

/** Section 31.3 (owner decision): the Tutorial's captions. */
const bio = (id: string): number => ELEMENT_BY_ID.get(id)!.effects.biodiversity ?? 0;

describe("the Tutorial's captions (Section 31.3)", () => {
  it("has one for each of the seven defences, in the nudge's order, each with chips, two lines on how it works and its trade off", () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([...NUDGE_ORDER]);
    for (const s of TUTORIAL_STEPS) {
      expect(s.protects.length, s.id).toBeGreaterThan(0);
      for (const p of s.protects) expect(["Cyclone waves", "Surge", "Wind", "River flood"]).toContain(p);
      expect(s.how).toHaveLength(2);
      expect(s.inGame, s.id).toMatch(/^In this game: /);
      expect(s.maya.split(/\s+/).length, s.id).toBeLessThanOrEqual(12);
    }
  });

  it("reads every number from the game's data, never typed by hand", () => {
    expect(STEP_BY_ID.get("dune")!.inGame).toContain(`adds ${bio("dune")} biodiversity`);
    expect(STEP_BY_ID.get("khazan")!.inGame).toContain(`adds ${bio("khazan")} biodiversity`);
    expect(STEP_BY_ID.get("mangrove")!.inGame).toContain(`adds ${bio("mangrove")} biodiversity`);
    expect(STEP_BY_ID.get("breakwater")!.inGame).toContain(`costs ${-bio("breakwater")} biodiversity, breaks at ${ELEMENT_BY_ID.get("breakwater")!.breaksAtAge} years old`);
    const seawall = ELEMENT_BY_ID.get("seawall")!;
    expect(STEP_BY_ID.get("seawall")!.inGame).toContain(`costs ${-bio("seawall")} biodiversity`);
    expect(breaksIn("seawall")).toBe(["", "1st", "2nd", "3rd"][seawall.survivesStorms! + 1]);
    expect(STEP_BY_ID.get("seawall")!.inGame).toContain(`breaks in its ${breaksIn("seawall")} cyclone or once ${seawall.cracksAtAge} years old`);
    const dam = ELEMENT_BY_ID.get("small_dam")!;
    expect(STEP_BY_ID.get("small_dam")!.inGame).toContain(`costs ${-bio("small_dam")} biodiversity, breaks in its ${breaksIn("small_dam")} flood or once ${dam.cracksAtAge} years old`);
    // And in the source, no digit is typed into an "In this game" line (each comes through ${...} from the data).
    const source = fs.readFileSync("src/ui/panjim/tutorialSteps.ts", "utf8");
    for (const line of source.split("\n").filter((l) => /inGame: `|return `In this game/.test(l))) expect(line.replace(/\$\{[^}]*\}/g, ""), line).not.toMatch(/\d/);
  });

  it("backs every 'How it works' line with a cited fact on the Sources screen", () => {
    for (const s of TUTORIAL_STEPS) {
      expect(s.sources.length, s.id).toBeGreaterThan(0);
      for (const id of s.sources) {
        const fact = factById(id);
        expect(fact, `${s.id}: ${id}`).toBeDefined();
        expect(fact!.citation?.url, `${s.id}: ${id}`).toMatch(/^https:\/\//);
      }
    }
  });

  it("has no dots or hyphens between words in any of its strings, Maya's Tutorial lines and the Tutorial's tooltip (Section 17b)", () => {
    const strings = [...tutorialStepStrings(), ...Object.values(maya.tutorial), tooltips.biodiversityCounterTutorial];
    // The result cards' lines (Section 31.4), as the controller writes them.
    for (const storm of ["cyclone", "river flood"]) for (const kind of ["flood", "cyclone"]) strings.push(`A ${kind} defence; this was a ${storm}`);
    strings.push("Broken before this storm", "Taken down before this storm", "Too far from the homes in this storm's path", "You tried 3 of 7", "Pandanus will not help in the river flood, but you can still try it.", "Its homes were already safe when you built it", "Each number is the homes it took out of this storm's way when you built it.", "Next, a river flood. Its defences go on the estuary and the river.", "You tried 7 of 7 defences", "Try every defence", "Every defence tried", "Watch what each one does in the storm.", "It hurries the storm");
    for (const s of strings) {
      expect(punctuationProblems(s), s).toEqual([]);
      expect(s, s).not.toMatch(/·|\s[-–—]\s|\be\.g\.|\betc\.|\b\w+-\w+\b/);
    }
  });
});
