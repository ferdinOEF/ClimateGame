import { describe, expect, it } from "vitest";
import { MAYA, mayaAftermath, placeName, riskHotspot, warningLine } from "../src/core/mayaLines";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { mapById } from "../src/levels/levelMap";
import { GameState } from "../src/core/gameState";
import { resolveChallenge, ZoneIndex } from "../src/core/zones";
import { boardSetup } from "../src/levels/balance";
import { computeWater, LANDFALL_ZONE } from "../src/core/hazardModel";

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
    // Rules of this game (src/data/facts.json, docs/FACTS_AUDIT.md): Maya tags them "Game rule" in her bubble.
    expect(text).toMatch(/Mangroves slow the surge before it reaches the houses/);
    expect(text).toMatch(/A khazan holds floodwater, so nearby homes stay drier/);
    expect(text).toMatch(/Dunes and pandanus shield the beach/);
    expect(text).toMatch(/A seawall holds no water/);
  });

  it("fills the warning templates", () => {
    expect(warningLine("exposed", "Taleigao", "cyclone")).toBe("The red shows where the cyclone will hit. Taleigao is most at risk: strengthen it now.");
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
    const bare = newRun("s7", BOT_LEVEL);
    while (bare.landed.size < 2) bare.nextYear();
    const lost = bare.outcomes.get("c2-flood")!;
    expect(lost.housesDamaged).toBeGreaterThan(0);
    const worried = mayaAftermath(lost, bare.state, bare.zones!);
    expect(worried.mood).toBe("worried");
    expect(worried.text).not.toMatch(/\b1 homes\b/);

    // A cyclone met by seawalls on every tile it wets: nothing lost.
    const map = mapById("panaji")!;
    const state = new GameState(map.tiles, boardSetup(BOT_LEVEL, map).startingElements, 100000);
    state.maturityField = "matureQuarters";
    for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
    const zones = new ZoneIndex(map.zones);
    const water = computeWater(state, { kind: "cyclone", strength: 1.2, landfall: 10 }, { landfallZoneTiles: zones.keys(LANDFALL_ZONE) });
    for (const key of water.depth.keys()) {
      const [q, r] = key.split(",").map(Number);
      if (state.canBuild({ q, r }, "seawall")) state.build({ q, r }, "seawall", false);
    }
    const saved = resolveChallenge(state, zones, "cyclone", 24, 20, undefined, undefined, undefined, undefined, 10);
    expect(saved.housesTotal).toBeGreaterThan(0);
    expect(saved.housesDamaged).toBe(0);
    const happy = mayaAftermath(saved, state, zones);
    expect(happy.mood).toBe("celebrates");
    expect(happy.text).toMatch(/seawall|Every home/);
  });
});

describe("Maya's Aftermath line with the storm's real comparisons", () => {
  it("quotes what a kind of defence really saved, and claims nothing when none did", () => {
    const run = newRun("panjim", BOT_LEVEL);
    for (let i = 0; i < 3; i++) {
      for (const key of run.zones!.keys("z1")) {
        const [q, r] = key.split(",").map(Number);
        if (run.state.canBuild({ q, r }, "dune")) {
          run.build({ q, r }, "dune");
          break;
        }
      }
    }
    while (run.landed.size < 1) run.nextYear();
    const record = run.stormRecords.get("c1-cyclone")!;
    const told = mayaAftermath(record.outcome, run.state, run.zones!, record.savedBy);
    if (record.savedBy.length > 0) expect(told.text).toContain(`${record.savedBy[0].houses}`);
    else expect(told.text).not.toMatch(/held|saved|would have/);
    // With no saves at all, no claim of a save.
    const none = mayaAftermath(record.outcome, run.state, run.zones!, []);
    expect(none.text).not.toMatch(/held \d|would have been hit/);
  });
});
