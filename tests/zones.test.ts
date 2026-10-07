import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveChallenge, ZoneIndex, zoneDefence, type ZoneDef } from "../src/core/zones";
import { ActionRun } from "../src/core/actionRun";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID } from "../src/levels/levels";

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

describe("zone-local resolution", () => {
  it("lets an undefended cyclone run through both zones: one star, houses damaged", () => {
    const { state, zones } = fixture();
    state.build({ q: 3, r: 0 }, "house", false);
    state.build({ q: 3, r: 1 }, "house", false);
    const outcome = resolveChallenge(state, zones, "cyclone", 1.4 * UNIT, UNIT);
    expect(outcome.zones.map((z) => z.zoneId)).toEqual(["z1", "z2"]);
    expect(outcome.protection).toBe(0);
    expect(outcome.stars).toBe(1);
    expect(outcome.housesDamaged).toBe(2);
    expect(state.income).toBe(0); // damaged houses earn nothing until repaired
  });

  it("stops a cyclone at the beach when Z1 is defended, and spares Z2 entirely", () => {
    const { state, zones } = fixture();
    for (let q = 0; q < 3; q++) state.build({ q, r: 0 }, "seawall", false);
    state.build({ q: 3, r: 1 }, "house", false);
    const outcome = resolveChallenge(state, zones, "cyclone", 1.4 * UNIT, UNIT);
    expect(outcome.zones[0].held).toBe(true);
    expect(outcome.stars).toBe(3);
    expect(outcome.housesDamaged).toBe(0);
    expect(outcome.housesSaved).toBe(1);
  });

  it("counts a defence only in its own zone and only against the hazards it answers", () => {
    const { state, zones } = fixture();
    state.build({ q: 0, r: 0 }, "seawall", false);
    expect(zoneDefence(state, zones, "z1", "cyclone")).toBe(9);
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

  it("makes the Small Dam hold in a monsoon flood and fail in the compound storm", () => {
    const flood = fixture();
    flood.state.build({ q: 0, r: 2 }, "small_dam", false);
    const ii = resolveChallenge(flood.state, flood.zones, "flood", 2.34 * UNIT, UNIT);
    expect(ii.zones.flatMap((z) => z.failed)).toEqual([]);
    expect(flood.state.elements.has("0,2")).toBe(true);

    const compound = fixture();
    compound.state.build({ q: 0, r: 2 }, "small_dam", false);
    compound.state.build({ q: 1, r: 2 }, "small_dam", false);
    const iii = resolveChallenge(compound.state, compound.zones, "compound", 3.8 * UNIT, UNIT);
    // A dam carries its whole catchment's rain, so the compound storm's rain
    // front breaks it wherever it stands, and it dumps what it held.
    expect(iii.zones.flatMap((z) => z.failed).sort()).toEqual(["0,2", "1,2"]);
  });

  it("is deterministic", () => {
    const a = fixture();
    const b = fixture();
    for (const f of [a, b]) {
      f.state.build({ q: 0, r: 1 }, "mangrove", false);
      f.state.build({ q: 3, r: 3 }, "house", false);
      f.state.turn = 12;
    }
    expect(resolveChallenge(a.state, a.zones, "compound", 70, UNIT)).toEqual(resolveChallenge(b.state, b.zones, "compound", 70, UNIT));
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
    const state = new GameState(map.tiles, [], 100000);
    const run = new ActionRun(state, level.timeline!, { climate: level.climate, seed: level.id, zones: map.zones });
    const before = run.readiness()!;
    expect(before.challenge.kind).toBe("cyclone");
    expect(before.level).toBe("red");
    const beach = map.zones.find((z) => z.id === "z1")!.tiles.filter(([q, r]) => state.placed.get(`${q},${r}`)?.terrainId === "beach");
    for (const [q, r] of beach.slice(0, 8)) run.build({ q, r }, "dune");
    const after = run.readiness()!;
    expect(after.outcome.protection).toBeGreaterThan(before.outcome.protection);
  });
});
