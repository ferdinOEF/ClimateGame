import { describe, expect, it } from "vitest";
import { GameState, type PlacedTile } from "../src/core/gameState";
import { computeLevelScore, scoreRows } from "../src/core/levelScore";
import { RunTracker } from "../src/core/runStats";
import { LEVELS } from "../src/levels/levels";

function makeState(): GameState {
  const tiles: PlacedTile[] = [];
  for (let i = 0; i < 10; i++) tiles.push({ coord: { q: i, r: 0 }, terrainId: "estuary" });
  return new GameState(tiles, [], 1000);
}

const thresholds: [number, number, number] = [400, 700, 1000];

describe("computeLevelScore", () => {
  it("awards no stars for a failed run, however well it scored", () => {
    const state = makeState();
    const tracker = new RunTracker();
    tracker.recordHazard({ totalDamage: 0, damagedTiles: 0, destroyed: 0, overwhelmed: 0 });
    tracker.recordHazard({ totalDamage: 0, damagedTiles: 0, destroyed: 0, overwhelmed: 0 });

    const score = computeLevelScore({
      state,
      stats: tracker.snapshot(),
      parTurns: 20,
      starThresholds: thresholds,
      completed: false
    });

    expect(score.stars).toBe(0);
    expect(score.completion).toBe(0);
    expect(score.noLosses).toBe(0);
    // A loss still scores — the number is what gives a retry a target.
    expect(score.total).toBeGreaterThan(0);
  });

  it("gives at least one star for clearing a level, even on a low score", () => {
    const state = makeState();
    // Drain the meters so the era score contributes almost nothing.
    state.trust = 0;
    state.resilience = 0;

    const score = computeLevelScore({
      state,
      stats: new RunTracker().snapshot(),
      parTurns: 20,
      starThresholds: [99999, 99999, 99999],
      completed: true
    });

    expect(score.stars).toBe(1);
  });

  it("scales stars with the thresholds", () => {
    const state = makeState();
    const base = {
      state,
      stats: new RunTracker().snapshot(),
      parTurns: 20,
      completed: true
    };

    const low = computeLevelScore({ ...base, starThresholds: [0, 99999, 99999] });
    const mid = computeLevelScore({ ...base, starThresholds: [0, 0, 99999] });
    const high = computeLevelScore({ ...base, starThresholds: [0, 0, 0] });

    expect(low.stars).toBe(1);
    expect(mid.stars).toBe(2);
    expect(high.stars).toBe(3);
  });

  it("rewards a clean run and a fast one", () => {
    const state = makeState();
    for (let i = 0; i < 5; i++) state.advanceTurn(); // turn 5, well under a par of 20

    const clean = new RunTracker();
    clean.recordHazard({ totalDamage: 0, damagedTiles: 0, destroyed: 0, overwhelmed: 0 }); // perfect

    const messy = new RunTracker();
    messy.recordHazard({ totalDamage: 30, damagedTiles: 1, destroyed: 2, overwhelmed: 1 }); // breached

    const cleanScore = computeLevelScore({
      state,
      stats: clean.snapshot(),
      parTurns: 20,
      starThresholds: thresholds,
      completed: true
    });
    const messyScore = computeLevelScore({
      state,
      stats: messy.snapshot(),
      parTurns: 20,
      starThresholds: thresholds,
      completed: true
    });

    expect(cleanScore.perfectDefense).toBeGreaterThan(0);
    expect(cleanScore.noLosses).toBeGreaterThan(0);
    expect(messyScore.noLosses).toBe(0);
    expect(cleanScore.total).toBeGreaterThan(messyScore.total);
    expect(cleanScore.underPar).toBeGreaterThan(0);
  });

  it("does not hand an abandoned run the maximum speed bonus", () => {
    // A run that quit on turn 0 has spent no turns, which without the
    // `completed` guard would look like the fastest possible clear.
    const score = computeLevelScore({
      state: makeState(),
      stats: new RunTracker().snapshot(),
      parTurns: 40,
      starThresholds: thresholds,
      completed: false
    });
    expect(score.underPar).toBe(0);
  });

  it("never returns a negative total", () => {
    const state = makeState();
    state.trust = 0;
    state.resilience = 0;
    const score = computeLevelScore({
      state,
      stats: new RunTracker().snapshot(),
      parTurns: 1,
      starThresholds: thresholds,
      completed: false
    });
    expect(score.total).toBeGreaterThanOrEqual(0);
  });

  it("stays under the ceiling firestore.rules enforces, even on a maximal run", () => {
    // Every term is bounded, which is what lets the rules reject anything
    // above 100000 as definitionally impossible rather than merely odd.
    const state = makeState();
    state.trust = 100;
    state.resilience = 100;
    for (let i = 0; i < 500; i++) state.advanceTurn();

    const tracker = new RunTracker();
    for (let i = 0; i < 100; i++) tracker.recordHazard({ totalDamage: 0, damagedTiles: 0, destroyed: 0, overwhelmed: 0 });

    const score = computeLevelScore({
      state,
      stats: tracker.snapshot(),
      parTurns: 1000,
      starThresholds: thresholds,
      completed: true
    });

    expect(score.total).toBeLessThan(100000);
  });
});

describe("scoreRows", () => {
  it("lists bonus rows only when they were actually earned", () => {
    const state = makeState();
    const plain = scoreRows(
      computeLevelScore({
        state,
        stats: new RunTracker().snapshot(),
        parTurns: 0,
        starThresholds: thresholds,
        completed: false
      })
    );
    expect(plain.some((row) => row.label === "Level cleared")).toBe(false);
    expect(plain.some((row) => row.label === "Coast held")).toBe(false);

    const tracker = new RunTracker();
    tracker.recordHazard({ totalDamage: 0, damagedTiles: 0, destroyed: 0, overwhelmed: 0 });
    const full = scoreRows(
      computeLevelScore({
        state,
        stats: tracker.snapshot(),
        parTurns: 50,
        starThresholds: thresholds,
        completed: true
      })
    );
    expect(full.some((row) => row.label === "Level cleared")).toBe(true);
    expect(full.some((row) => row.label === "Coast held")).toBe(true);
    expect(full.some((row) => row.label === "Under par")).toBe(true);
  });
});

describe("campaign star thresholds", () => {
  it("are reachable in principle for every level", () => {
    // A sanity bound rather than a balance assertion: a 3-star bar above
    // what the formula can produce would make the level's top rating
    // unobtainable no matter how well it is played.
    for (const level of LEVELS) {
      expect(level.starThresholds[2], `${level.id} 3-star bar`).toBeLessThan(4000);
    }
  });
});
