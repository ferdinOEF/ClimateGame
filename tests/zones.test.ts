import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveChallenge, ZoneIndex, zoneDefence, type ZoneDef } from "../src/core/zones";
import { ActionRun } from "../src/core/actionRun";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { boardSetup } from "../src/levels/balance";
import { computeWater, LANDFALL_ZONE, waterBoard } from "../src/core/hazardModel";

/** A tiny board: Z1 beach, Z2 estuary, Z3 river + land, Z4 land. Four tiles a zone. */
function fixture(): { state: GameState; zones: ZoneIndex } {
  const tiles: { coord: { q: number; r: number }; terrainId: string }[] = [];
  const zones: ZoneDef[] = [];
  const kinds: [string, string[]][] = [
    ["z1", ["beach", "beach", "beach", "land"]],
    ["z2", ["estuary", "estuary", "estuary", "land"]],
    ["z3", ["river", "river", "land", "land"]],
    ["z4", ["land", "land", "land", "land"]]
  ];
  kinds.forEach(([id, terrains], row) => {
    const zone: ZoneDef = { id, name: id, tiles: [] };
    terrains.forEach((terrainId, q) => {
      tiles.push({ coord: { q, r: row }, terrainId });
      zone.tiles.push([q, row]);
    });
    zones.push(zone);
  });
  const state = new GameState(tiles, [], 100000);
  state.maturityField = "matureQuarters";
  return { state, zones: new ZoneIndex(zones) };
}

const UNIT = 20;

describe("zone defence bookkeeping", () => {
  it("counts a defence only in its own zone and only against the hazards it answers", () => {
    const { state, zones } = fixture();
    state.build({ q: 0, r: 0 }, "seawall", false);
    expect(zoneDefence(state, zones, "z1", "cyclone")).toBe(16);
    expect(zoneDefence(state, zones, "z1", "flood")).toBe(0);
    expect(zoneDefence(state, zones, "z2", "cyclone")).toBe(0);
  });

  it("grows a nature defence linearly with maturity", () => {
    const { state, zones } = fixture();
    state.build({ q: 0, r: 1 }, "mangrove", false); // 20 quarters to mature
    expect(zoneDefence(state, zones, "z2", "flood")).toBe(0);
    state.turn = 10;
    expect(zoneDefence(state, zones, "z2", "flood")).toBeCloseTo(2.5);
    state.turn = 40;
    expect(zoneDefence(state, zones, "z2", "flood")).toBe(5);
  });
});

/** Panaji with its town, as the level plays it. */
function panaji(): { state: GameState; zones: ZoneIndex; landfallTiles: string[] } {
  const map = mapById("panaji")!;
  const level = LEVEL_BY_ID.get("l01-first-rains")!;
  const setup = boardSetup(level, map);
  const state = new GameState(map.tiles, setup.startingElements, 100000);
  state.maturityField = "matureQuarters";
  for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
  const zones = new ZoneIndex(map.zones);
  return { state, zones, landfallTiles: zones.keys(LANDFALL_ZONE) };
}

describe("tile-by-tile resolution (Section 4)", () => {
  it("lets an undefended cyclone take the low homes near its landfall: one star", () => {
    const { state, zones } = panaji();
    const outcome = resolveChallenge(state, zones, "cyclone", 1.4 * UNIT, UNIT, undefined, { three: 0.9, two: 0.6 }, undefined, undefined, 10);
    expect(outcome.housesDamaged).toBeGreaterThan(10);
    expect(outcome.protection).toBe(0);
    expect(outcome.stars).toBe(1);
    expect(outcome.housesTotal).toBe(outcome.housesDamaged);
  });

  it("saves homes behind defences on the beach the storm comes in on", () => {
    const bare = panaji();
    const before = resolveChallenge(bare.state.clone(), bare.zones, "cyclone", 1.4 * UNIT, UNIT, undefined, undefined, undefined, undefined, 10);
    const { state, zones, landfallTiles } = panaji();
    const water = computeWater(state, { kind: "cyclone", strength: 1.4, landfall: 10 }, { landfallZoneTiles: landfallTiles });
    for (const key of water.depth.keys()) {
      const [q, r] = key.split(",").map(Number);
      if (state.canBuild({ q, r }, "dune")) state.build({ q, r }, "dune", false);
      else if (state.canBuild({ q, r }, "mangrove")) state.build({ q, r }, "mangrove", false);
    }
    state.turn = 40;
    const after = resolveChallenge(state, zones, "cyclone", 1.4 * UNIT, UNIT, undefined, undefined, undefined, undefined, 10);
    expect(after.housesDamaged).toBeLessThan(before.housesDamaged);
    expect(after.protection).toBeGreaterThan(0.2);
  });

  it("makes the Small Dam hold in the game's floods and fail only when the water overtops it", () => {
    // Every river tile a dam can stand on. In the level's monsoon (strength
    // 1.8) and its compound finale (2.6) the dam holds; a storm far beyond the
    // game's (strength 6) overtops it on the deep reaches and it fails.
    const probe = panaji();
    const board = waterBoard(probe.state);
    const sites = [...board.riverIndex.keys()].filter((key) => {
      const [q, r] = key.split(",").map(Number);
      return probe.state.canBuild({ q, r }, "small_dam");
    });
    expect(sites.length).toBeGreaterThan(5);
    const failsAt = (key: string, kind: "flood" | "compound", strength: number): boolean => {
      const [q, r] = key.split(",").map(Number);
      const { state, zones } = panaji();
      state.build({ q, r }, "small_dam", false);
      return resolveChallenge(state, zones, kind, strength * UNIT, UNIT, undefined, undefined, undefined, undefined, kind === "flood" ? undefined : 10).zones.flatMap((z) => z.failed).includes(key);
    };
    for (const key of sites) {
      expect(failsAt(key, "flood", 1.8), `dam at ${key} in the monsoon`).toBe(false);
      expect(failsAt(key, "compound", 2.6), `dam at ${key} in the finale`).toBe(false);
    }
    expect(sites.some((key) => failsAt(key, "compound", 6))).toBe(true);
  });

  it("floods a low khazan field and never Altinho, at the same strength (elevation)", () => {
    const { state, landfallTiles } = panaji();
    const map = mapById("panaji")!;
    const altinho = map.localities.find((l) => l.name === "Altinho")!;
    for (const kind of ["flood", "cyclone", "compound"] as const) {
      const water = computeWater(state, { kind, strength: 3.8, landfall: 10 }, { landfallZoneTiles: landfallTiles });
      // Altinho and every tile within two hexes of its name stay dry.
      for (const t of map.tiles) if (Math.max(Math.abs(t.coord.q - altinho.q), Math.abs(t.coord.r - altinho.r), Math.abs(t.coord.q + t.coord.r - altinho.q - altinho.r)) <= 1) expect(water.depth.get(`${t.coord.q},${t.coord.r}`) ?? 0, `${kind} at Altinho`).toBe(0);
    }
    // The flood stands on the low wetland (khazan) fields beside the river.
    const flood = computeWater(state, { kind: "flood", strength: 2.34, landfall: null });
    const wet = map.tiles.filter((t) => t.terrainId === "estuary" && (t.elevationM ?? 0) <= 2);
    expect(wet.filter((t) => (flood.depth.get(`${t.coord.q},${t.coord.r}`) ?? 0) > 0).length).toBeGreaterThan(wet.length * 0.5);
  });

  it("is deterministic", () => {
    const a = panaji();
    const b = panaji();
    expect(resolveChallenge(a.state, a.zones, "compound", 70, UNIT, undefined, undefined, undefined, undefined, 12)).toEqual(
      resolveChallenge(b.state, b.zones, "compound", 70, UNIT, undefined, undefined, undefined, undefined, 12)
    );
  });
});

describe("Panaji zones", () => {
  const map = mapById("panaji")!;

  it("has four disjoint zones, with the beach in Z1, wetlands in Z2 and the river in Z3 and Z4", () => {
    expect(map.zones.map((z) => z.id)).toEqual(["z1", "z2", "z3", "z4"]);
    const seen = new Set<string>();
    const terrain = new Map(map.tiles.map((t) => [`${t.coord.q},${t.coord.r}`, t.terrainId]));
    const count = (zoneId: string, id: string) => map.zones.find((z) => z.id === zoneId)!.tiles.filter(([q, r]) => terrain.get(`${q},${r}`) === id).length;
    for (const zone of map.zones) {
      for (const [q, r] of zone.tiles) {
        const key = `${q},${r}`;
        expect(seen.has(key), `${key} is in two zones`).toBe(false);
        expect(terrain.has(key)).toBe(true);
        seen.add(key);
      }
    }
    expect(count("z1", "beach")).toBeGreaterThanOrEqual(15);
    expect(count("z2", "estuary")).toBeGreaterThanOrEqual(40);
    expect(count("z3", "river") + count("z4", "river")).toBeGreaterThanOrEqual(10);
  });

  it("updates the readiness gauge as the player builds", () => {
    const level = LEVEL_BY_ID.get("l01-first-rains")!;
    const state = new GameState(map.tiles, boardSetup(level, map).startingElements, 100000);
    for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
    const run = new ActionRun(state, level.timeline!, { climate: level.climate, seed: level.id, zones: map.zones });
    const before = run.readiness()!;
    expect(before.challenge.kind).toBe("cyclone");
    expect(before.level).toBe("red");
    // Dunes and mangroves where the warning says the storm will come in.
    const reach = run.exposureFor(before.challenge, true)!;
    let built = 0;
    for (const key of reach.exposure.keys()) {
      const [q, r] = key.split(",").map(Number);
      for (const id of ["dune", "mangrove"]) if (built < 10 && state.canBuild({ q, r }, id) && run.build({ q, r }, id).ok) built++;
    }
    expect(built).toBeGreaterThan(3);
    const after = run.readiness()!;
    expect(after.outcome.protection).toBeGreaterThan(before.outcome.protection);
  });
});
