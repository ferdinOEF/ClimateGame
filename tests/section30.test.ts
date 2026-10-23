import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { computeWater, LANDFALL_ZONE } from "../src/core/hazardModel";
import { shelterOf } from "../src/core/climate";

/** Section 30 (owner decisions, game rules): festival clarity. */
const DROPPED = ["26,7","24,8","25,8","26,8","24,9","25,9","26,9","27,9","24,10","25,10","24,11","24,12","28,9","26,10","27,10","28,10","29,10","25,11","26,11","27,11","28,11","25,12","26,12","27,12","28,12","25,13","26,13","27,13"];

describe("30.1 the creek corner east of Merces leaves the game", () => {
  const run = newRun("s30-1", BOT_LEVEL);
  it("makes all 28 tiles scenery and dry, with nothing to build", () => {
    expect(DROPPED).toHaveLength(28);
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

  it("keeps the estuary at 24,6 25,6 26,6 and the homes behind it in play, and its defences still protect them", () => {
    for (const key of ["24,6", "25,6", "26,6", "24,7", "25,7"]) {
      const t = run.state.placed.get(key)!;
      expect(!t.scenery && !t.dry, key).toBe(true);
    }
    for (const key of ["24,6", "25,6", "26,6"]) {
      const [q, r] = key.split(",").map(Number);
      expect(run.state.buildableAt({ q, r }).map((d) => d.id), key).toEqual(["mangrove", "khazan"]);
    }
    // 25,7 is the home (24,7 is land with none): the floods take it on the bare board, and the defences in front of
    // it keep it: two in 2040, three in 2050 (the compound storm comes in deeper).
    const flood = run.schedule[1];
    const storm = run.schedule[2];
    expect(run.exposureFor(flood)!.housesAtRisk).toContain("25,7");
    expect(run.exposureFor(storm)!.housesAtRisk).toContain("25,7");
    const guarded = newRun("s30-1-guard", BOT_LEVEL);
    for (const [q, r, id] of [[25, 6, "khazan"], [26, 6, "khazan"]] as const) expect(guarded.build({ q, r }, id).ok).toBe(true);
    expect(guarded.exposureFor(flood)!.housesAtRisk).not.toContain("25,7");
    expect(guarded.build({ q: 24, r: 6 }, "mangrove").ok).toBe(true);
    expect(guarded.exposureFor(storm)!.housesAtRisk).not.toContain("25,7");
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

describe("Section 30.8: a card's hover glow", () => {
  it("the homes a build takes out of risk and puts at risk match Homes at risk before and after it", async () => {
    const { newRun } = await import("../tools/panjimBots/bots");
    const run = newRun("hover-1", (await import("../tools/panjimBots/bots")).BOT_LEVEL, true);
    const next = run.nextChallenge()!;
    const before = run.homesAtRisk(next);
    let checked = 0;
    for (const pick of run.objective!.picks) {
      const [q, r] = pick.key.split(",").map(Number);
      const change = run.riskChangeBy(next, { q, r }, pick.elementId)!;
      expect(change).not.toBeNull();
      expect(before - change.saved.length + change.added.length).toBe(before - run.homesSavedBy(next, { q, r }, pick.elementId)!);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // A defence far from the storm changes nothing (the card then says so).
    const far = [...run.state.placed.values()].find((tile) => run.state.canBuild(tile.coord, "small_dam") && tile.coord.r < 2);
    if (far) {
      const change = run.riskChangeBy(next, far.coord, "small_dam")!;
      expect(change.saved).toHaveLength(0);
      expect(change.added).toHaveLength(0);
    }
  });
});

describe("Section 30.9: objectives point at the board", () => {
  it("what stopped three stars, in one line", async () => {
    const { shortOfThree } = await import("../src/core/phaseResult");
    const lines = { three: 0.9, bioThree: 6 };
    expect(shortOfThree(3, 9, 9, lines, 8)).toBeNull();
    expect(shortOfThree(2, 8, 9, lines, 8)).toBe("In this game 1 home was lost; three stars allow none.");
    expect(shortOfThree(2, 9, 9, lines, 3)).toBe("In this game biodiversity was +3; three stars need +6.");
    expect(shortOfThree(1, 40, 54, lines, -2)).toBe("In this game 14 homes were lost; three stars allow 5 at most, and biodiversity was −2; three stars need +6.");
  });

  it("Get ahead: once a phase's objective is done, the storm after it has its own objective", async () => {
    const { newRun, BOT_LEVEL } = await import("../tools/panjimBots/bots");
    const run = newRun("ahead-1", BOT_LEVEL, true);
    expect(run.aheadObjective()).not.toBeNull();
    const ahead = run.aheadObjective()!;
    expect(ahead.challenge.id).toBe(run.schedule[1].id);
    expect(ahead.objective.rows.length).toBeGreaterThan(0);
    expect(ahead.objective.rows.length).toBeLessThanOrEqual(4);
  });
});

describe("Section 30.9 (review fix): Get ahead keeps its rows while the player builds on them", () => {
  it("a build on a Get ahead pick counts on its row, and the row stays the same", async () => {
    const { newRun, BOT_LEVEL } = await import("../tools/panjimBots/bots");
    const { prepProgress } = await import("../src/core/prep");
    const run = newRun("ahead-2", BOT_LEVEL, true);
    const ahead = run.aheadObjective()!;
    const pick = ahead.objective.picks[0];
    const row = ahead.objective.rows.find((r) => r.elementId === pick.elementId && r.tiles!.includes(pick.key))!;
    const before = prepProgress(row, run.state, run.zones!).current;
    const [q, r] = pick.key.split(",").map(Number);
    expect(run.build({ q, r }, pick.elementId).ok).toBe(true);
    const again = run.aheadObjective()!;
    expect(again.objective).toBe(ahead.objective);
    expect(prepProgress(row, run.state, run.zones!).current).toBe(before + 1);
  });
});
