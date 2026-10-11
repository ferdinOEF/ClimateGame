import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { ActionRun } from "../src/core/actionRun";
import { aftermathLine } from "../src/core/aftermath";
import { resolveChallenge, ZoneIndex } from "../src/core/zones";
import { boardSetup } from "../src/levels/balance";
import { computeWater, LANDFALL_ZONE } from "../src/core/hazardModel";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { mapById } from "../src/levels/levelMap";

/** Panaji with its town, as the level plays it. */
function panaji(): { state: GameState; zones: ZoneIndex; landfallTiles: string[] } {
  const map = mapById("panaji")!;
  const level = LEVEL_BY_ID.get("l01-first-rains")!;
  const state = new GameState(map.tiles, boardSetup(level, map).startingElements, 100000);
  state.maturityField = "matureQuarters";
  for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
  const zones = new ZoneIndex(map.zones);
  return { state, zones, landfallTiles: zones.keys(LANDFALL_ZONE) };
}

/** Panaji with `elementId` built, mature, on every tile a strength-1.2 cyclone at site 10 wets. */
function defended(elementId: string): { state: GameState; zones: ZoneIndex } {
  const { state, zones, landfallTiles } = panaji();
  const water = computeWater(state, { kind: "cyclone", strength: 1.2, landfall: 10 }, { landfallZoneTiles: landfallTiles });
  for (const key of water.depth.keys()) {
    const [q, r] = key.split(",").map(Number);
    if (state.canBuild({ q, r }, elementId)) state.build({ q, r }, elementId, false);
  }
  state.turn = 40;
  return { state, zones };
}

const storm = (state: GameState, zones: ZoneIndex) => resolveChallenge(state, zones, "cyclone", 24, 20, undefined, undefined, undefined, undefined, 10);

describe("aftermath line", () => {
  it("credits the defence that held, by place", () => {
    const { state, zones } = defended("seawall");
    const outcome = storm(state, zones);
    expect(outcome.housesSaved).toBe(outcome.housesTotal);
    expect(aftermathLine("cyclone", outcome, state, zones, [])).toBe(`The seawalls at Miramar took it: ${outcome.housesSaved} houses stayed standing.`);
  });

  it("credits the main defence when it took some but not all of a storm", () => {
    const { state, zones } = defended("mangrove");
    const outcome = storm(state, zones);
    expect(outcome.housesDamaged).toBeGreaterThan(0);
    expect(outcome.housesSaved).toBeGreaterThan(0);
    expect(aftermathLine("cyclone", outcome, state, zones, [])).toMatch(new RegExp(`^The mangroves at (Taleigao|the waterfront|the Ourem creek) took it: ${outcome.housesSaved} houses stayed standing\\.$`));
  });

  it("says plainly when the first zone was bare", () => {
    const { state, zones } = panaji();
    const outcome = storm(state, zones);
    expect(aftermathLine("cyclone", outcome, state, zones, [])).toBe("Nothing stood in the way at Miramar, so the storm ran on into Taleigao.");
  });

  it("names a failed dam first", () => {
    // A storm far beyond the game's overtops a dam on the deep reach of the river.
    let line: string | null = null;
    for (const key of panaji().zones.keys("z3").concat(panaji().zones.keys("z4"))) {
      const { state, zones } = panaji();
      const [q, r] = key.split(",").map(Number);
      if (!state.canBuild({ q, r }, "small_dam")) continue;
      state.build({ q, r }, "small_dam", false);
      const before = new Map([...state.elements].map(([k, v]) => [k, v.elementId]));
      const outcome = resolveChallenge(state, zones, "compound", 120, 20, undefined, undefined, undefined, undefined, 10);
      const failedIds = outcome.zones.flatMap((z) => z.failed).map((k) => before.get(k)!);
      if (failedIds.includes("small_dam")) {
        line = aftermathLine("compound", outcome, state, zones, failedIds);
        break;
      }
    }
    expect(line).toMatch(/^The dam at (the Ourem creek|the waterfront) was overwhelmed and let the water through all at once\.$/);
  });
});

describe("snapshots", () => {
  it("rewinds to the forecast lock exactly, and replaying is deterministic", () => {
    const level = LEVEL_BY_ID.get("l01-first-rains")!;
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
  it("names the defence that saved the most houses, counting the town behind it", async () => {
    const { topDefenceLine } = await import("../src/core/aftermath");
    const { state, zones } = defended("seawall");
    const outcome = storm(state, zones);
    expect(topDefenceLine(outcome, state, zones)).toBe(`The seawalls saved the most homes: about ${outcome.housesSaved} of ${outcome.housesSaved}.`);
    const bare = panaji();
    expect(topDefenceLine(storm(bare.state, bare.zones), bare.state, bare.zones)).toBe(null);
  });
});
