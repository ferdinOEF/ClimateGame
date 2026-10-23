import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { computeWater, LANDFALL_ZONE } from "../src/core/hazardModel";
import { shelterOf } from "../src/core/climate";

/** Section 30 (owner decisions, game rules): festival clarity. */
const DROPPED = ["24,6","25,6","26,6","24,7","25,7","26,7","24,8","25,8","26,8","24,9","25,9","26,9","27,9","24,10","25,10","24,11","24,12","28,9","26,10","27,10","28,10","29,10","25,11","26,11","27,11","28,11","25,12","26,12","27,12","28,12","25,13","26,13","27,13"];

describe("30.1 the creek corner east of Merces leaves the game", () => {
  const run = newRun("s30-1", BOT_LEVEL);
  it("makes all 33 tiles scenery and dry, with nothing to build", () => {
    for (const key of DROPPED) {
      const t = run.state.placed.get(key)!;
      expect(t, key).toBeDefined();
      expect(t.scenery && t.dry, key).toBe(true);
      const [q, r] = key.split(",").map(Number);
      expect(run.state.buildableAt({ q, r }), key).toEqual([]);
    }
  });

  it("lets no storm water reach or pass through them, in any storm, at any strength", () => {
    const lz = run.zones!.keys(LANDFALL_ZONE);
    for (const c of run.schedule) {
      for (const strength of [c.strength, c.strength * 2]) {
        const f = computeWater(run.state, { kind: c.kind, strength, landfall: run.landfallOf(c), sheltered: shelterOf(c), wind: c.wind, turn: c.turn - 1 }, { landfallZoneTiles: lz });
        for (const key of DROPPED) {
          expect(f.depth.get(key) ?? 0, `${c.id} ${key}`).toBe(0);
          expect(f.surge.get(key) ?? 0, `${c.id} ${key} surge`).toBe(0);
          expect(f.flood.get(key) ?? 0, `${c.id} ${key} flood`).toBe(0);
        }
      }
    }
  });

  it("counts none of their homes in any storm or in Homes at risk", () => {
    for (const c of run.schedule) {
      const e = run.exposureFor(c, true)!;
      for (const key of e.housesAtRisk) expect(DROPPED.includes(key), `${c.id} ${key}`).toBe(false);
    }
  });

  it("keeps the flood's source and its reach into Taleigao, Merces and St Cruz", () => {
    expect(BOT_LEVEL.climate!.floodSource).toEqual(["33,1", "33,2", "32,3"]);
    const own = run.ownAreaFor(run.schedule[1].id)!;
    const e = run.exposureFor(run.schedule[1], true)!;
    expect(e.housesAtRisk.filter((k) => own.tiles.has(k)).length).toBeGreaterThan(20);
  });
});

describe("30.2 a river tile takes only a small dam", () => {
  const run = newRun("s30-2", BOT_LEVEL);
  it("offers only Small dam on every free river tile", () => {
    for (const t of run.state.placed.values()) {
      if (t.terrainId !== "river" || t.scenery || run.state.elements.has(`${t.coord.q},${t.coord.r}`)) continue;
      expect(run.state.buildableAt(t.coord).map((d) => d.id), `${t.coord.q},${t.coord.r}`).toEqual(["small_dam"]);
    }
  });

  it("never asks for a mangrove on a river tile in any phase's objective", () => {
    const r = newRun("s30-2b", BOT_LEVEL);
    while (!r.finished) {
      for (const job of r.prep) if (job.elementId === "mangrove") for (const key of job.tiles ?? []) expect(r.state.placed.get(key)?.terrainId, `${job.challengeId} ${key}`).not.toBe("river");
      const t = [...r.state.placed.values()].find((tile) => r.state.buildableAt(tile.coord).length > 0 && tile.coord.r < 4)!;
      r.build(t.coord, r.state.buildableAt(t.coord)[0].id);
    }
  });
});

describe("30.3 pandanus lowers a cyclone's waves and surge, less than a dune", () => {
  it("lowers the 2030 cyclone's water on the land behind it, by less than a dune on the same tile", () => {
    const run = newRun("s30-3", BOT_LEVEL);
    const c = run.schedule[0];
    const lz = run.zones!.keys(LANDFALL_ZONE);
    const water = (id: string | null): number => {
      const s = run.state.clone();
      if (id) s.build({ q: -4, r: 18 }, id, false);
      const f = computeWater(s, { kind: c.kind, strength: c.strength, landfall: run.landfallOf(c), sheltered: shelterOf(c), turn: c.turn - 1 }, { landfallZoneTiles: lz });
      return ["-3,18", "-3,19", "-4,19", "-2,18"].reduce((sum, k) => sum + (f.depth.get(k) ?? 0), 0);
    };
    const bare = water(null);
    const pandanus = water("sandy_vegetation");
    const dune = water("dune");
    expect(pandanus).toBeLessThan(bare);
    expect(dune).toBeLessThan(pandanus);
  });
});
