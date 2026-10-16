import { describe, expect, it } from "vitest";
import { untilText } from "../src/ui/panjim/clockHud";
import { floatText } from "../src/app/panjimController";
import { cardPill } from "../src/ui/panjim/defenceCards";
import { MAYA, noteIdsFor, notesProgress, refreshSavedNotes } from "../src/core/mayaLines";
import { discoveryFacts } from "../src/core/facts";
import { MONEY_ONLY } from "../src/levels/balance";

/** Section 13's wording and the Field Guide's one count, where a unit test can reach them (the rest: tools/section13Checks.ts). */
describe("Section 13", () => {
  it("one countdown, on the clock: 'Cyclone in 5 builds'", () => {
    expect(untilText({ builds: 5, storm: "Cyclone" })).toBe("Cyclone in 5 builds");
    expect(untilText({ builds: 1, storm: "Flood" })).toBe("Flood in 1 build");
  });

  it("the float and the card pill say the model's number plainly", () => {
    expect(floatText(3)).toBe("+3 homes safe");
    expect(floatText(1)).toBe("+1 home safe");
    expect(floatText(0)).toBe("+0 homes safe");
    expect(floatText(-2)).toBe("2 more homes at risk");
    expect(cardPill(8).pill).toBe("Protects 8 homes here");
    expect(cardPill(0).pill).toBe("Protects 0 homes here");
    expect(cardPill(0, false).pill).toBe("Saves no homes here");
    expect(cardPill(-1, false)).toEqual({ pill: "Puts 1 more home at risk", tone: "bad" });
    expect(cardPill(null).pill).toBeNull();
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
