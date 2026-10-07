import { describe, expect, it } from "vitest";
import { GameState, type PlacedTile } from "../src/core/gameState";
import { allComplete, describeObjective, evaluateObjective, type Objective } from "../src/core/objectives";
import { RunTracker } from "../src/core/runStats";

/**
 * The objective engine is what decides whether a player cleared a level,
 * so it gets tested against hand-built fixtures rather than only through
 * play. Everything here is pure — no renderer, no DOM, no Firebase.
 */

/** A tiny board with one tile of each terrain the elements roster needs. */
function makeState(): GameState {
  const tiles: PlacedTile[] = [];
  // Enough of each terrain to build several of anything.
  const layout: [string, number][] = [
    ["beach", 6],
    ["estuary", 6],
    ["land", 6],
    ["river", 4],
    ["coast", 4]
  ];
  let q = 0;
  for (const [terrainId, count] of layout) {
    for (let i = 0; i < count; i++) tiles.push({ coord: { q: q++, r: 0 }, terrainId });
  }
  return new GameState(tiles, [], 10000);
}

/** Builds `count` of `elementId` on whichever tiles accept it. */
function buildSome(state: GameState, elementId: string, count: number): void {
  let built = 0;
  for (const tile of state.placed.values()) {
    if (built >= count) break;
    if (state.build(tile.coord, elementId)) built++;
  }
  expect(built, `could not build ${count}x ${elementId}`).toBe(count);
}

describe("evaluateObjective", () => {
  it("counts standing elements, not elements ever built", () => {
    const state = makeState();
    const stats = new RunTracker().snapshot();
    const objective: Objective = { type: "build_element", elementId: "mangrove", count: 3 };

    buildSome(state, "mangrove", 3);
    expect(evaluateObjective(objective, state, stats).complete).toBe(true);

    // Losing one to a storm should un-complete it: the objective is about
    // what is standing, and a destroyed defence is not standing.
    const firstKey = [...state.elements.keys()][0];
    const [q, r] = firstKey.split(",").map(Number);
    state.destroyDefense({ q, r });
    expect(evaluateObjective(objective, state, stats).complete).toBe(false);
  });

  it("counts defences by category", () => {
    const state = makeState();
    const stats = new RunTracker().snapshot();
    // dune and sandy_vegetation are both nbs; seawall is engineered.
    buildSome(state, "dune", 2);
    buildSome(state, "seawall", 1);

    expect(evaluateObjective({ type: "build_category", category: "nbs", count: 2 }, state, stats).complete).toBe(true);
    expect(evaluateObjective({ type: "build_category", category: "nbs", count: 3 }, state, stats).complete).toBe(false);
    expect(evaluateObjective({ type: "build_category", category: "engineered", count: 1 }, state, stats).complete).toBe(true);
  });

  it("reads a meter's run peak, so a completed objective cannot un-complete", () => {
    const state = makeState();
    const tracker = new RunTracker();
    const objective: Objective = { type: "meter_at_least", meter: "biodiversity", value: 5 };

    buildSome(state, "mangrove", 3);
    // Mangroves mature over several turns; advance so they are contributing.
    for (let i = 0; i < 10; i++) state.advanceTurn();

    tracker.sampleMeters({ resilience: state.resilience, biodiversity: state.biodiversity, carbon: state.carbon });
    expect(evaluateObjective(objective, state, tracker.snapshot()).complete).toBe(true);

    // Wipe every mangrove out. The live meter collapses, but the peak the
    // player actually reached stands — see the note in objectives.ts.
    for (const key of [...state.elements.keys()]) {
      const [q, r] = key.split(",").map(Number);
      state.destroyDefense({ q, r });
    }
    expect(state.biodiversity).toBeLessThan(5);
    expect(evaluateObjective(objective, state, tracker.snapshot()).complete).toBe(true);
  });

  it("tracks hazards survived and perfect defences from the run log", () => {
    const state = makeState();
    const tracker = new RunTracker();

    tracker.recordHazard({ totalDamage: 0, damagedTiles: 0, destroyed: 0, overwhelmed: 0 }); // a clean hold
    tracker.recordHazard({ totalDamage: 12, damagedTiles: 1, destroyed: 1, overwhelmed: 0 }); // a breach

    const stats = tracker.snapshot();
    expect(evaluateObjective({ type: "survive_hazards", count: 2 }, state, stats).complete).toBe(true);
    expect(evaluateObjective({ type: "survive_hazards", count: 3 }, state, stats).complete).toBe(false);
    expect(evaluateObjective({ type: "perfect_defense", count: 1 }, state, stats).complete).toBe(true);
    expect(evaluateObjective({ type: "perfect_defense", count: 2 }, state, stats).complete).toBe(false);
  });

  it("treats no_defenses_lost as a streak that can only be broken", () => {
    const state = makeState();
    const tracker = new RunTracker();
    const objective: Objective = { type: "no_defenses_lost" };

    // Holds from turn one.
    expect(evaluateObjective(objective, state, tracker.snapshot()).complete).toBe(true);

    tracker.recordHazard({ totalDamage: 20, damagedTiles: 1, destroyed: 1, overwhelmed: 0 });
    expect(evaluateObjective(objective, state, tracker.snapshot()).complete).toBe(false);
  });

  it("never reports a target of zero, so a progress bar cannot divide by zero", () => {
    const state = makeState();
    const stats = new RunTracker().snapshot();
    const objectives: Objective[] = [
      { type: "survive_hazards", count: 1 },
      { type: "no_defenses_lost" },
      { type: "reach_turn", turn: 5 },
      { type: "coin_at_least", value: 100 }
    ];
    for (const objective of objectives) {
      expect(evaluateObjective(objective, state, stats).target).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("describeObjective", () => {
  it("produces a non-empty sentence for every objective type", () => {
    const objectives: Objective[] = [
      { type: "survive_hazards", count: 2 },
      { type: "meter_at_least", meter: "carbon", value: 10 },
      { type: "resilience_at_least", value: 40 },
      { type: "build_element", elementId: "khazan", count: 2 },
      { type: "build_category", category: "hybrid", count: 1 },
      { type: "reach_turn", turn: 20 },
      { type: "no_defenses_lost" },
      { type: "perfect_defense", count: 3 },
      { type: "coin_at_least", value: 500 }
    ];
    for (const objective of objectives) {
      const label = describeObjective(objective);
      expect(label.length, `empty label for ${objective.type}`).toBeGreaterThan(0);
      // A missing element name would leak a raw id into the UI.
      expect(label).not.toContain("undefined");
    }
  });
});

describe("allComplete", () => {
  it("requires every objective, and is false for an empty list", () => {
    const state = makeState();
    const stats = new RunTracker().snapshot();
    const done = evaluateObjective({ type: "reach_turn", turn: 0 }, state, stats);
    const notDone = evaluateObjective({ type: "reach_turn", turn: 99 }, state, stats);

    expect(allComplete([done])).toBe(true);
    expect(allComplete([done, notDone])).toBe(false);
    // An empty objective list must not read as "instantly cleared" — that
    // would make a mis-authored level win itself on turn one.
    expect(allComplete([])).toBe(false);
  });
});
