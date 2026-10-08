import { describe, expect, it } from "vitest";
import { BOT_LEVELS, newRun } from "../tools/panjimBots/bots";
import { MAYA, refreshSavedNotes } from "../src/core/mayaLines";
import type { RunSnapshot } from "../src/core/actionRun";

/** Things saved on a player's device by earlier builds must still load, in today's words. */
describe("saves from earlier builds", () => {
  it("an autosave that still carries the old requests' status restores", () => {
    const run = newRun("panjim", BOT_LEVELS["easy-test"]);
    const snap = run.snapshot();
    const old = { ...snap, voiceStatus: [["voice-anthony-dunes", "active"]] } as unknown as RunSnapshot;
    const again = newRun("panjim", BOT_LEVELS["easy-test"]);
    expect(() => again.restore(old)).not.toThrow();
    expect(again.snapshot().quarter).toBe(snap.quarter);
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
    expect(notes[0].text.startsWith("In this game, ")).toBe(true);
  });
});
