import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { computeCombos, newComboMembers } from "../src/core/combos";
import { ActionRun } from "../src/core/actionRun";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { ZoneIndex, zoneDefence } from "../src/core/zones";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { mapById } from "../src/levels/levelMap";

function strip(terrain: string, n: number): GameState {
  const tiles = Array.from({ length: n }, (_, q) => ({ coord: { q, r: 0 }, terrainId: terrain }));
  return new GameState(tiles, [], 100000);
}

describe("perfect-fit combos", () => {
  it("forms a Mangrove Belt at three touching mangroves, not two", () => {
    const state = strip("estuary", 4);
    state.build({ q: 0, r: 0 }, "mangrove", false);
    state.build({ q: 1, r: 0 }, "mangrove", false);
    expect(computeCombos(state).members.get("mangrove_belt")!.size).toBe(0);
    const before = computeCombos(state);
    state.build({ q: 2, r: 0 }, "mangrove", false);
    const after = computeCombos(state);
    expect(after.members.get("mangrove_belt")!.size).toBe(3);
    expect(newComboMembers(before, after)).toEqual([{ combo: "mangrove_belt", tiles: ["0,0", "1,0", "2,0"], all: ["0,0", "1,0", "2,0"] }]);
  });

  it("forms a Living Bund and a Beach Shield from adjacent pairs", () => {
    const wet = strip("estuary", 2);
    wet.build({ q: 0, r: 0 }, "khazan", false);
    wet.build({ q: 1, r: 0 }, "mangrove", false);
    expect([...computeCombos(wet).members.get("living_bund")!].sort()).toEqual(["0,0", "1,0"]);
    const sand = strip("beach", 3);
    sand.build({ q: 0, r: 0 }, "dune", false);
    sand.build({ q: 2, r: 0 }, "sandy_vegetation", false);
    expect(computeCombos(sand).members.get("beach_shield")!.size).toBe(0); // not touching
    sand.build({ q: 1, r: 0 }, "sandy_vegetation", false);
    // The dune and the pandanus touching it; the far pandanus touches no dune.
    expect([...computeCombos(sand).members.get("beach_shield")!].sort()).toEqual(["0,0", "1,0"]);
  });

  it("adds a real defence bonus in the zone", () => {
    const state = strip("estuary", 3);
    state.maturityField = "matureQuarters";
    state.turn = 0;
    for (let q = 0; q < 3; q++) state.build({ q, r: 0 }, "mangrove", false);
    state.turn = 40;
    const zones = new ZoneIndex([{ id: "z2", name: "z2", tiles: [[0, 0], [1, 0], [2, 0]] }]);
    const plain = zoneDefence(state, zones, "z2", "flood");
    const withBelt = zoneDefence(state, zones, "z2", "flood", computeCombos(state).bonus);
    expect(plain).toBe(15);
    expect(withBelt).toBe(21);
  });
});

describe("Voices of Panjim", () => {
  const level = LEVEL_BY_ID.get("l01-first-rains")!;
  const map = mapById("panaji")!;

  it("has two or three requests per era, each asking for something the map can host", () => {
    const voices = level.voices!;
    for (const era of [1, 2, 3]) {
      const count = voices.filter((v) => v.era === era).length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }
    const zones = new ZoneIndex(map.zones);
    const terrain = new Map(map.tiles.map((t) => [`${t.coord.q},${t.coord.r}`, t.terrainId]));
    const reserved = new Set(map.monuments.map((m) => `${m.q},${m.r}`));
    for (const voice of voices) {
      expect(voice.text.length, voice.id).toBeLessThanOrEqual(140);
      if (voice.goal.type !== "standing") continue;
      const goal = voice.goal;
      const def = ELEMENT_BY_ID.get(goal.elementId)!;
      const tiles = (goal.zone ? zones.keys(goal.zone) : [...terrain.keys()]).filter(
        (key) => def.validTerrainIds.includes(terrain.get(key)!) && !reserved.has(key)
      );
      expect(tiles.length, voice.id).toBeGreaterThanOrEqual(goal.count);
    }
  });

  it("pays out the moment a request is met, and lapses unmet ones when the era ends", () => {
    const state = new GameState(map.tiles, [], 100000);
    const run = new ActionRun(state, level.timeline!, { climate: level.climate, seed: level.id, zones: map.zones, voices: level.voices });
    expect(run.activeVoices().map((v) => v.era)).toEqual([1, 1, 1]);
    const zones = new ZoneIndex(map.zones);
    const beach = zones.keys("z1").filter((key) => state.placed.get(key)?.terrainId === "beach");
    const coin = state.coin;
    const [q0, r0] = beach[0].split(",").map(Number);
    const first = run.build({ q: q0, r: r0 }, "dune");
    expect(first.events.some((e) => e.type === "voice_complete")).toBe(false);
    const [q1, r1] = beach[1].split(",").map(Number);
    const second = run.build({ q: q1, r: r1 }, "dune");
    const done = second.events.find((e) => e.type === "voice_complete");
    expect(done && done.type === "voice_complete" && done.voice.id).toBe("v1-miramar-dunes");
    expect(state.coin).toBe(coin - 30 + 40);
    // To the first challenge: the other two era-1 requests lapse, era 2 arrives.
    while (run.landed.size === 0) run.fastForwardYear();
    expect(run.voiceStatus.get("v1-taleigao-khazan")).toBe("lapsed");
    expect(run.activeVoices().map((v) => v.era)).toEqual([2, 2, 2]);
  });
});
