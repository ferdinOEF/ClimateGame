import { describe, expect, it } from "vitest";
import { MAYA, mayaAftermath, placeName, riskHotspot, warningLine } from "../src/core/mayaLines";
import { BOT_LEVELS, newRun } from "../tools/panjimBots/bots";
import { mapById } from "../src/levels/levelMap";

/**
 * Maya's lines are worked out from the game's own numbers. These check the
 * wording rules (her greeting, no "Namaskar"), that the warning goes where
 * the most houses are at risk, and that the Aftermath line describes the
 * storm that was actually resolved.
 */
describe("Maya's words", () => {
  it("greets with Hello, never Namaskar", () => {
    expect(MAYA.greeting.text).toBe("Hello! I am Maya. Let us keep Panjim dry.");
    expect(JSON.stringify(MAYA)).not.toMatch(/namaskar/i);
  });

  it("covers the four tips the brief asks for", () => {
    const text = MAYA.tips.map((tip) => tip.text).join(" ");
    expect(text).toMatch(/Mangroves slow the surge before it reaches the houses/);
    expect(text).toMatch(/khazan stores floodwater/);
    expect(text).toMatch(/Dunes and sandy vegetation shield the beach/);
    expect(text).toMatch(/seawall helps, but it costs more and does not absorb water/);
  });

  it("fills the warning templates", () => {
    expect(warningLine("exposed", "Taleigao", "cyclone")).toBe("Taleigao is exposed! Strengthen it before the cyclone.");
    expect(warningLine("lastCall", "Merces", "flood", 12)).toBe("Last call! 12 homes are still in danger, most of them around Merces.");
  });
});

describe("where Maya goes", () => {
  it("picks the cluster with the most houses at risk, not the hottest tile", () => {
    const intensity = new Map([["0,0", 200], ["10,0", 90], ["10,1", 90], ["11,0", 90]]);
    const hotspot = riskHotspot(["0,0", "10,0", "10,1", "11,0"], intensity);
    expect(hotspot?.count).toBe(3);
    expect(["10,0", "10,1", "11,0"]).toContain(hotspot?.key);
    expect(riskHotspot([], intensity)).toBeNull();
  });

  it("names a place by its nearest neighbourhood, else its zone", () => {
    const map = mapById("panaji")!;
    const miramar = map.landmarks.find((l) => l.name === "Miramar Beach")!;
    expect(placeName({ q: miramar.q, r: miramar.r }, map.landmarks, "z1")).toBe("Miramar");
    expect(placeName({ q: 500, r: 500 }, map.landmarks, "z2")).toBe("Taleigao");
  });
});

describe("Maya's Aftermath line", () => {
  it("describes the resolved storm: celebrates a clean save, is worried about losses, never says '1 homes'", () => {
    // Strict flood with nothing built: houses are lost.
    const bare = newRun("s7", BOT_LEVELS.strict);
    while (bare.landed.size < 2) bare.fastForwardYear();
    const lost = bare.outcomes.get("c2-flood")!;
    expect(lost.housesDamaged).toBeGreaterThan(0);
    const worried = mayaAftermath(lost, bare.state, bare.zones!);
    expect(worried.mood).toBe("worried");
    expect(worried.text).not.toMatch(/\b1 homes\b/);

    // Easy cyclone with dunes on the beach: nothing lost.
    const run = newRun("panjim", BOT_LEVELS["easy-test"]);
    for (let i = 0; i < 3; i++) {
      for (const key of run.zones!.keys("z1")) {
        const [q, r] = key.split(",").map(Number);
        if (run.state.canBuild({ q, r }, "dune")) {
          run.build({ q, r }, "dune");
          break;
        }
      }
    }
    while (run.landed.size < 1) run.fastForwardYear();
    const saved = run.outcomes.get("c1-cyclone")!;
    expect(saved.housesDamaged).toBe(0);
    const happy = mayaAftermath(saved, run.state, run.zones!);
    expect(happy.mood).toBe("celebrates");
    expect(happy.text).toMatch(/dune|Every home/);
  });
});

describe("Maya's Aftermath line with the storm's real comparisons", () => {
  it("quotes what a kind of defence really saved, and claims nothing when none did", () => {
    const run = newRun("panjim", BOT_LEVELS.strict);
    for (let i = 0; i < 3; i++) {
      for (const key of run.zones!.keys("z1")) {
        const [q, r] = key.split(",").map(Number);
        if (run.state.canBuild({ q, r }, "dune")) {
          run.build({ q, r }, "dune");
          break;
        }
      }
    }
    while (run.landed.size < 1) run.fastForwardYear();
    const record = run.stormRecords.get("c1-cyclone")!;
    const told = mayaAftermath(record.outcome, run.state, run.zones!, record.savedBy);
    if (record.savedBy.length > 0) expect(told.text).toContain(`${record.savedBy[0].houses}`);
    else expect(told.text).not.toMatch(/held|saved|would have/);
    // With no saves at all, no claim of a save.
    const none = mayaAftermath(record.outcome, run.state, run.zones!, []);
    expect(none.text).not.toMatch(/held \d|would have been hit/);
  });
});
