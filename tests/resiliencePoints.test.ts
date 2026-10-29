import { describe, expect, it } from "vitest";
import { endPoints, LIVING_COAST, pointsForRun, POINT_VALUES, replayBuilds, runPoints, stormPoints, type BuildEntry, type RunPoints } from "../src/core/resiliencePoints";
import { housesLostWithout } from "../src/core/stormRecord";
import { ActionRun } from "../src/core/actionRun";
import { shelterOf } from "../src/core/climate";
import { computeCombos } from "../src/core/combos";
import { resolveChallenge } from "../src/core/zones";
import { newPanjimRun, PANJIM_POINTS_MODEL } from "../src/levels/panjimRun";
import { playedRun } from "../tools/panjimBots/bots";

/**
 * Section 35.1: the six sources of points, counted only as a storm resolves; a retried storm counts once; the
 * server's replay (`pointsForRun`) equals the tally the game kept while it was played.
 */
const SLOW = 240_000;

/** Plays a build list on a run, as the session does (each through the run's own build, repair or demolish). */
function play(run: ActionRun, builds: readonly BuildEntry[]): void {
  for (const b of builds) {
    const [q, r] = b.tile.split(",").map(Number);
    const outcome = b.element === "repair" ? run.repair({ q, r }) : b.element === "demolish" ? run.demolish({ q, r }) : run.build({ q, r }, b.element);
    expect(outcome.ok, `${b.year} ${b.element} at ${b.tile}: ${outcome.reason}`).toBe(true);
  }
}

describe("the sums (fixed facts)", () => {
  it("every source, at the starting values", () => {
    const s = stormPoints({ id: "c1", year: 2030 }, { homesSaved: 42, places: ["Sharada Mandir School"], objectiveDone: true, coast: { standing: 4, protecting: 2 }, standing: [] });
    expect(s.homes.points).toBe(42 * POINT_VALUES.home);
    expect(s.places.points).toBe(POINT_VALUES.place);
    expect(s.objective.points).toBe(POINT_VALUES.objective);
    expect(s.livingCoast.points).toBe(4 * POINT_VALUES.coastStanding + 2 * POINT_VALUES.coastProtecting);
    expect(s.total).toBe(s.homes.points + s.places.points + s.objective.points + s.livingCoast.points);
    const end = endPoints(12.4, [["a", "b", "c"], ["a", "c"], ["c", "a", "d"]]);
    expect(end.biodiversity).toEqual({ rise: 12, points: 12 * POINT_VALUES.biodiversity });
    expect(end.veterans).toEqual({ count: 2, points: 2 * POINT_VALUES.veteran });
    expect(end.total).toBe(end.biodiversity.points + end.veterans.points);
  });

  it("losses never take points away", () => {
    const s = stormPoints({ id: "c1", year: 2030 }, { homesSaved: 0, places: [], objectiveDone: false, coast: { standing: 0, protecting: 0 }, standing: [] });
    expect(s.total).toBe(0);
    expect(endPoints(-8, [[], [], []]).total).toBe(0);
  });

  it("a defence must stand after every storm to be a veteran", () => {
    expect(endPoints(0, [["a"], [], ["a"]]).veterans.count).toBe(0);
    expect(endPoints(0, []).veterans.count).toBe(0);
  });
});

describe("on the Panaji board", () => {
  // A player who follows the objective card: every source shows up.
  const guided = playedRun("guided", "points-1");
  const builds = guided.buildLog;
  const live = newPanjimRun();
  let livePoints: RunPoints;

  it("the build log holds one action a year, 2026 to 2050", () => {
    expect(builds.map((b) => b.year)).toEqual(Array.from({ length: 25 }, (_, i) => 2026 + i));
  }, SLOW);

  it("counts every source, only as each storm resolves", () => {
    play(live, builds.slice(0, 4));
    expect(runPoints(live).total).toBe(0);
    play(live, builds.slice(4));
    livePoints = runPoints(live);
    expect(livePoints.storms.map((s) => s.year)).toEqual([2030, 2040, 2050]);
    for (const [i, c] of live.schedule.entries()) {
      const s = livePoints.storms[i];
      const outcome = live.outcomes.get(c.id)!;
      expect(s.homes.saved).toBe(outcome.housesSaved);
      expect(s.homes.points).toBe(outcome.housesSaved * POINT_VALUES.home);
      expect(s.objective.done).toBe(live.objectivesComplete.has(c.id));
      expect(s.livingCoast.protecting).toBeLessThanOrEqual(s.livingCoast.standing);
    }
    expect(livePoints.storms.some((s) => s.objective.done)).toBe(true);
    expect(livePoints.storms.some((s) => s.places.points > 0)).toBe(true);
    expect(livePoints.storms.some((s) => s.livingCoast.protecting > 0)).toBe(true);
    expect(livePoints.end).not.toBeNull();
    expect(livePoints.end!.veterans.count).toBeGreaterThan(0);
    expect(livePoints.total).toBe(livePoints.storms.reduce((a, s) => a + s.total, 0) + livePoints.end!.total);
    // Stars are the game's own, untouched by points: the same as the bot's run without points.
    expect([...live.outcomes.values()].map((o) => o.stars)).toEqual([...guided.outcomes.values()].map((o) => o.stars));
  }, SLOW);

  it("a living coast defence protects a home when the same storm without it takes more", () => {
    // The 2030 storm on the board as it came: the guided plan's first five builds.
    const board = newPanjimRun({ points: false, objectives: false });
    play(board, builds.slice(0, 4));
    const last = builds[4];
    const [q, r] = last.tile.split(",").map(Number);
    board.state.build({ q, r }, last.element, false);
    const c = board.schedule[0];
    const args = { zones: board.zones!, kind: c.kind, intensity: board.intensityOf(c), strengthUnit: board.climate!.intensityPerStrength, houseStars: board.houseStarsFor(c), houseRule: board.houseRule, landfall: board.landfallOf(c), sheltered: shelterOf(c), wind: c.wind, combos: computeCombos(board.state).bonus };
    const lost = housesLostWithout(board.state, args, null).housesDamaged;
    const coast = [...board.state.elements.keys()].filter((key) => LIVING_COAST.includes(board.state.elements.get(key)!.elementId));
    const protecting = coast.filter((key) => {
      const copy = board.state.clone();
      copy.elements.delete(key);
      return resolveChallenge(copy, args.zones, args.kind, args.intensity, args.strengthUnit, computeCombos(copy).bonus, args.houseStars, args.houseRule, undefined, args.landfall, args.sheltered, args.wind).housesDamaged > lost;
    }).length;
    expect(livePoints.storms[0].livingCoast.standing).toBe(coast.length);
    expect(livePoints.storms[0].livingCoast.protecting).toBe(protecting);
  }, SLOW);

  it("pointsForRun (the server's replay) equals the live tally", () => {
    const replay = replayBuilds(builds, PANJIM_POINTS_MODEL);
    expect(replay.error).toBeNull();
    expect(replay.points).toEqual(livePoints);
    expect(pointsForRun(builds, PANJIM_POINTS_MODEL).total).toBe(livePoints.total);
  }, SLOW);

  it("a list with a build out of its year, or an illegal build, is refused", () => {
    const wrongYear = builds.map((b, i) => (i === 3 ? { ...b, year: 2031 } : b));
    expect(replayBuilds(wrongYear, PANJIM_POINTS_MODEL).error).toMatch(/action 4/);
    const onSea = [{ year: 2026, tile: "-40,0", element: "dune" }];
    expect(replayBuilds(onSea, PANJIM_POINTS_MODEL).error).toMatch(/action 1/);
  }, SLOW);

  it("a retried storm counts once, as played the second time", () => {
    const far = playedRun("far", "points-1").buildLog;
    const run = newPanjimRun();
    play(run, builds.slice(0, 5));
    const first = runPoints(run).storms[0];
    expect(run.retry("c1-cyclone")).toBe(true);
    expect(run.stormPoints.size).toBe(0);
    expect(run.buildLog).toEqual([]);
    // Played again with the far player's five builds, then the guided plan from 2031 on.
    play(run, far.slice(0, 5));
    play(run, builds.slice(5));
    const after = runPoints(run);
    expect(after.storms.length).toBe(3);
    expect(after.storms[0].total).not.toBe(first.total);
    const expected = [...far.slice(0, 5), ...builds.slice(5)];
    expect(run.buildLog).toEqual(expected);
    expect(pointsForRun(run.buildLog, PANJIM_POINTS_MODEL)).toEqual(after);
  }, SLOW);
});
