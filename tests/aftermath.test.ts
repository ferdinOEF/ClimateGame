import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { ActionRun } from "../src/core/actionRun";
import { aftermathLine } from "../src/core/aftermath";
import { resolveChallenge, ZoneIndex, type ZoneDef } from "../src/core/zones";
import { levelWithPreset } from "../src/levels/levels";
import { mapById } from "../src/levels/levelMap";

function fixture(): { state: GameState; zones: ZoneIndex } {
  const tiles: { coord: { q: number; r: number }; terrainId: string }[] = [];
  const zones: ZoneDef[] = [];
  (["beach", "estuary", "river", "land"] as const).forEach((terrainId, row) => {
    const zone: ZoneDef = { id: `z${row + 1}`, name: `z${row + 1}`, tiles: [] };
    for (let q = 0; q < 4; q++) {
      tiles.push({ coord: { q, r: row }, terrainId: q === 3 ? "land" : terrainId });
      zone.tiles.push([q, row]);
    }
    zones.push(zone);
  });
  const state = new GameState(tiles, [], 100000);
  state.maturityField = "matureQuarters";
  return { state, zones: new ZoneIndex(zones) };
}

describe("aftermath line", () => {
  it("credits the defence that held, by place", () => {
    const { state, zones } = fixture();
    for (let q = 0; q < 3; q++) state.build({ q, r: 0 }, "seawall", false);
    state.build({ q: 3, r: 0 }, "house", false);
    const outcome = resolveChallenge(state, zones, "cyclone", 28, 20);
    expect(aftermathLine("cyclone", outcome, state, zones, [])).toBe("The seawalls at Miramar took it: 1 house never got wet.");
  });

  it("credits the main defence when it took most but not all of a storm", () => {
    const { state, zones } = fixture();
    for (let q = 0; q < 3; q++) state.build({ q, r: 0 }, "dune", false);
    state.turn = 40;
    const outcome = resolveChallenge(state, zones, "cyclone", 14, 20);
    expect(outcome.zones[0].held).toBe(false);
    expect(outcome.stars).toBe(3);
    expect(aftermathLine("cyclone", outcome, state, zones, [])).toBe("The dunes at Miramar took most of it.");
  });

  it("says plainly when the first zone was bare", () => {
    const { state, zones } = fixture();
    const outcome = resolveChallenge(state, zones, "cyclone", 28, 20);
    expect(aftermathLine("cyclone", outcome, state, zones, [])).toBe("Nothing stood in the way at Miramar, so the storm ran on into Taleigao.");
  });

  it("names a failed dam first", () => {
    const { state, zones } = fixture();
    state.build({ q: 0, r: 2 }, "small_dam", false);
    const before = new Map([...state.elements].map(([k, v]) => [k, v.elementId]));
    const outcome = resolveChallenge(state, zones, "compound", 76, 20);
    const failedIds = outcome.zones.flatMap((z) => z.failed).map((key) => before.get(key)!);
    expect(aftermathLine("compound", outcome, state, zones, failedIds)).toBe("The dam at the Ourem creek gave way and let everything it held through at once.");
  });
});

describe("snapshots", () => {
  it("rewinds to the forecast lock exactly, and replaying is deterministic", () => {
    const level = levelWithPreset("l01-first-rains", "strict")!;
    const map = mapById("panaji")!;
    const make = () =>
      new ActionRun(new GameState(map.tiles, [], level.startingCoin), level.timeline!, { climate: level.climate, seed: level.id, zones: map.zones });
    const run = make();
    const first = run.schedule[0];
    while (!run.locked.has(first.id)) run.fastForwardYear();
    const lockQuarter = run.lockSnapshots.get(first.id)!.quarter;
    const beach = map.zones[0].tiles.find(([q, r]) => run.state.placed.get(`${q},${r}`)?.terrainId === "beach")!;
    run.build({ q: beach[0], r: beach[1] }, "dune");
    while (!run.landed.has(first.id)) run.fastForwardYear();
    const snapshot = run.lockSnapshots.get(first.id)!;
    run.restore(snapshot);
    expect(run.quarter).toBe(lockQuarter);
    expect(run.landed.has(first.id)).toBe(false);
    expect(run.state.elements.has(`${beach[0]},${beach[1]}`)).toBe(false); // built after the lock, so undone
    const replay = (): string => {
      run.restore(snapshot);
      run.build({ q: beach[0], r: beach[1] }, "dune");
      while (!run.landed.has(first.id)) run.fastForwardYear();
      return JSON.stringify(run.outcomes.get(first.id));
    };
    expect(replay()).toBe(replay());
  });
});

describe("top defence line", () => {
  it("names the defence that saved the most houses", async () => {
    const { topDefenceLine } = await import("../src/core/aftermath");
    const { state, zones } = fixture();
    for (let q = 0; q < 3; q++) state.build({ q, r: 0 }, "seawall", false);
    state.build({ q: 3, r: 0 }, "house", false);
    state.build({ q: 3, r: 1 }, "house", false);
    const outcome = resolveChallenge(state, zones, "cyclone", 28, 20);
    expect(topDefenceLine(outcome, state, zones)).toBe("The seawalls saved the most homes: about 2 of 2.");
  });
});
