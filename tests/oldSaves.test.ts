import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { MAYA, refreshSavedNotes } from "../src/core/mayaLines";
import type { RunSnapshot } from "../src/core/actionRun";

/** Things saved on a player's device by earlier builds must still load, in today's words. */
describe("saves from earlier builds", () => {
  it("an autosave that still carries the old requests' status restores", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const snap = run.snapshot();
    const old = { ...snap, voiceStatus: [["voice-anthony-dunes", "active"]] } as unknown as RunSnapshot;
    const again = newRun("panjim", BOT_LEVEL);
    expect(() => again.restore(old)).not.toThrow();
    expect(again.snapshot().turn).toBe(snap.turn);
    expect(JSON.stringify(again.snapshot())).not.toContain("voice");
  });

  it("saved Field Guide notes take today's wording, and removed lines are dropped", () => {
    const saved = [
      { id: "dunes", title: "Dunes and pandanus", text: "Dunes and sandy vegetation shield the beach. Pandanus roots hold the sand when the wind gets up." },
      { id: "voice-anthony", title: "Anthony, Miramar", text: "an old line" },
      { id: "gone-tip", title: "x", text: "y" },
      { id: "dunes", title: "dup", text: "dup" }
    ];
    const notes = refreshSavedNotes(saved);
    expect(notes.map((n) => n.id)).toEqual(["dunes"]);
    expect(notes[0].text).toBe(MAYA.tips.find((t) => t.id === "dunes")!.text);
    expect(notes[0].text).not.toMatch(/^In this game/);
  });

  it("a saved discovery takes today's wording and its element's name for a title", () => {
    const notes = refreshSavedNotes([{ id: "pandanus-cheap", title: "old", text: "Pandanus is the cheapest defence you can build. It softens a surge a little, on sand where mangroves can't grow." }]);
    expect(notes).toEqual([{ id: "pandanus-cheap", title: "Pandanus", text: "Pandanus softens a surge a little, on sand where mangroves can't grow." }]);
  });

  it("a saved note about a feature this version has switched off (growth, coins) is dropped", () => {
    const notes = refreshSavedNotes([
      { id: "mangrove-grow", title: "Mangrove", text: "Mangroves take a few years to reach full strength, so plant them early." },
      { id: "dam-coin", title: "Small Dam", text: "A small dam earns Coin and protects against floods, but it lowers biodiversity." }
    ]);
    expect(notes).toEqual([]);
  });
});
