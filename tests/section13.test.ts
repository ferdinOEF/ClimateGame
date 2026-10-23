import { describe, expect, it } from "vitest";
import { untilText } from "../src/ui/panjim/clockHud";
import fs from "node:fs";
import { MAYA, noteIdsFor, notesProgress, refreshSavedNotes } from "../src/core/mayaLines";
import { discoveryFacts } from "../src/core/facts";
import { MONEY_ONLY } from "../src/levels/balance";

/** Section 13's wording and the Field Guide's one count, where a unit test can reach them (the rest: tools/section13Checks.ts). */
describe("Section 13", () => {
  it("one countdown, on the clock: 'Cyclone in 5 builds'", () => {
    expect(untilText({ builds: 5, storm: "Cyclone" })).toBe("Cyclone in 5 builds");
    expect(untilText({ builds: 1, storm: "Flood" })).toBe("Flood in 1 build");
  });

  // Section 23.2 (owner decision): no "+N homes safe" rises from a tile after a build; the build just goes down.
  it("shows no pop-up over a tile after a build", () => {
    const controller = fs.readFileSync("src/app/panjimController.ts", "utf8");
    const session = fs.readFileSync("src/app/gameSession.ts", "utf8");
    const css = fs.readFileSync("src/ui/panjim/panjim.css", "utf8");
    expect(controller).not.toMatch(/floatAt|floatText\(saved|homes safe/);
    // Nor a note beside it (Section 32, owner decision: the "outside the area" note is gone).
    expect(controller).not.toMatch(/outsideNote|outside the area|count for the objective/);
    expect(controller).not.toMatch(/This protects \$\{homes\}|This protects no homes/);
    expect(session).not.toMatch(/BuildFloat|buildFloat/);
    expect(css).not.toContain(".build-float");
    expect(fs.existsSync("src/ui/panjim/buildFloat.ts")).toBe(false);
  });

  it("the Field Guide's total counts only notes the level can give", () => {
    const panaji = noteIdsFor({ opening: true, excluded: new Set(MONEY_ONLY) });
    expect(panaji.has(MAYA.opening.id)).toBe(true);
    expect(panaji.has(MAYA.greeting.id)).toBe(false);
    expect(panaji.has("shields")).toBe(false);
    for (const id of MONEY_ONLY) for (const fact of discoveryFacts(id)) {
      // A fact that also belongs to something buildable still counts.
      const elsewhere = fact.elements.some((el) => !(MONEY_ONLY as readonly string[]).includes(el));
      expect(panaji.has(fact.id), fact.id).toBe(elsewhere);
    }
    expect(notesProgress([MAYA.opening.id, "not-a-note"], panaji)).toBe(`1 of ${panaji.size}`);
    expect(notesProgress([MAYA.opening.id], panaji, "heat")).toBe(`2 of ${panaji.size}`);
  });

  it("her first-job note survives a reload", () => {
    const kept = refreshSavedNotes([{ id: MAYA.opening.id, title: "x", text: "Hello! I am Maya. Before the cyclone…" }]);
    expect(kept).toEqual([{ id: MAYA.opening.id, title: MAYA.opening.title, text: "Hello! I am Maya. Before the cyclone…" }]);
  });
});
