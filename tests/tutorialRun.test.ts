import { describe, expect, it } from "vitest";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { NUDGE_ORDER, goodTiles, suggestedDefence, triedDefences } from "../src/core/tutorialNudge";
import { bestTile, playNothing, playNudges, playNudgesWeakest, tutorialRun } from "../tools/tutorial/sim";

/**
 * The Tutorial (Section 31, owner decision): the Panaji game on its own small map. Seven builds, one a year, 2026 to
 * 2032: a cyclone after the fourth (from the sea onto the beach and the village), a river flood after the seventh
 * (down the map's river from upstream). Following the nudges gives three stars in both; building nothing gives none;
 * each defence, built in the nudge's order on a pulsing tile, saves at least one home in the storm it is meant for.
 * A tutorial a player can lose by doing what it says is not a tutorial.
 */
const level = LEVEL_BY_ID.get("l00-tutorial")!;

describe("the Tutorial", () => {
  it("plays the Panaji game: one build a year, seven years, a cyclone after the fourth build and a river flood after the seventh, no coins", () => {
    expect(level.tutorial).toBe(true);
    expect(level.timeModel).toBe("years");
    const run = tutorialRun();
    expect(run.totalYears).toBe(7);
    expect(run.economyEnabled).toBe(false);
    expect(run.schedule.map((c) => c.kind)).toEqual(["cyclone", "flood"]);
    expect(run.buildsUntil(run.schedule[0])).toBe(4);
    expect(run.buildsUntil(run.schedule[1])).toBe(7);
    expect(level.climate!.floodSource).toEqual(["5,0"]);
    // Stars count homes saved only (Section 25 kept the Tutorial so); below 30% of them, none.
    expect(level.houseStars!.bioThree).toBeUndefined();
    expect(level.houseStars!.one).toBe(0.3);
  });

  it("lets all seven defences be built on its map", () => {
    const run = tutorialRun();
    for (const id of NUDGE_ORDER) expect(bestTile(run, id), id).not.toBeNull();
  });

  it("following the nudges gives three stars in both storms, each defence saving a home in its own storm", () => {
    const { storms, builds } = playNudges();
    expect(storms.map((s) => s.stars)).toEqual([3, 3]);
    expect(builds.map((b) => b.elementId)).toEqual([...NUDGE_ORDER]);
    for (const b of builds) expect(b.saves, `${b.elementId} at ${b.key}`).toBeGreaterThanOrEqual(1);
  });

  it("gives three stars in both even on the weakest of the pulsing tiles each year", () => {
    expect(playNudgesWeakest().map((s) => s.stars)).toEqual([3, 3]);
  });

  it("gives no star in either storm when nothing that helps is built", () => {
    expect(playNothing().map((s) => s.stars)).toEqual([0, 0]);
  });

  it("each defence alone saves homes in the storm it is meant for", () => {
    const run = tutorialRun();
    const [cyclone, flood] = run.schedule;
    const most = (id: string, storm: typeof cyclone): number => {
      let m = 0;
      for (const t of run.state.placed.values()) if (run.state.canBuild(t.coord, id)) m = Math.max(m, run.homesSavedBy(storm, t.coord, id) ?? 0);
      return m;
    };
    for (const id of ["dune", "sandy_vegetation", "breakwater", "seawall"]) expect(most(id, cyclone), id).toBeGreaterThan(0);
    for (const id of ["mangrove", "khazan", "small_dam"]) expect(most(id, flood), id).toBeGreaterThan(0);
  });
});

describe("the nudge (Section 31.2)", () => {
  it("suggests the seven in order, and moves on to the first not yet tried whatever is built", () => {
    expect(suggestedDefence(new Set())).toBe("dune");
    expect(suggestedDefence(triedDefences(["dune", "sandy_vegetation"]))).toBe("breakwater");
    // The player built a mangrove instead of the breakwater: it is ticked, and the breakwater is still suggested.
    expect(suggestedDefence(triedDefences(["dune", "sandy_vegetation", "mangrove"]))).toBe("breakwater");
    expect(suggestedDefence(triedDefences([...NUDGE_ORDER]))).toBeNull();
    expect(triedDefences(["house", "dune"]).size).toBe(1);
  });

  it("pulses 2 or 3 tiles where the suggested defence saves homes, every year of the nudged path", () => {
    const run = tutorialRun();
    for (const id of NUDGE_ORDER) {
      const tiles = goodTiles(run, id);
      expect(tiles.length, id).toBeGreaterThanOrEqual(2);
      expect(tiles.length, id).toBeLessThanOrEqual(3);
      for (const t of tiles) expect(t.saves, id).toBeGreaterThan(0);
      expect(run.build(tiles[0].coord, id).ok).toBe(true);
    }
    expect(goodTiles(run, "dune")).toEqual([]);
  });
});
