import { describe, expect, it } from "vitest";
import { passYear } from "./helpers/passYear";
import { ActionRun } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { boardSetup } from "../src/levels/balance";
import { mapById } from "../src/levels/levelMap";
import { BOT_LEVEL, smartRun } from "../tools/panjimBots/bots";

/**
 * Section 12.3: each phase's objective is chosen by the hazard model, at the
 * phase's start, on the board as it stands. Every row saves at least one home
 * in the model, and following the objective (its builds, one a year) saves at
 * least as many homes as any row is credited with: in fact exactly what the
 * model said, because the storm runs the same model (preview = resolution).
 */
const MAP = mapById("panaji")!;

/** The session's run, objectives on (the bots' newRun turns them off). */
function run(): ActionRun {
  const setup = boardSetup(BOT_LEVEL, MAP);
  const state = new GameState(MAP.tiles, setup.startingElements, BOT_LEVEL.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  for (const m of MAP.monuments) state.reserved.add(`${m.q},${m.r}`);
  return new ActionRun(state, BOT_LEVEL.timeline!, {
    climate: BOT_LEVEL.climate,
    zones: MAP.zones,
    houseStars: BOT_LEVEL.houseStars,
    houseRule: BOT_LEVEL.houses?.rule,
    prep: BOT_LEVEL.prep,
    economy: BOT_LEVEL.economy,
    growth: BOT_LEVEL.growth,
    landmarks: MAP.landmarks,
    localities: MAP.localities
  });
}

/** Follows the phase's objective: its picks in order, one a year, then the clock to the storm. Returns the storm's homes lost. */
function follow(r: ActionRun): number {
  const challenge = r.nextChallenge()!;
  for (const pick of r.objective!.picks) {
    const [q, rr] = pick.key.split(",").map(Number);
    expect(r.build({ q, r: rr }, pick.elementId).ok, `${challenge.id} ${pick.elementId} at ${pick.key}`).toBe(true);
  }
  while (!r.landed.has(challenge.id)) passYear(r);
  // Every row done when the storm came: result card 1's badge.
  expect(r.objectivesComplete.has(challenge.id), `${challenge.id} objective complete`).toBe(true);
  return r.outcomes.get(challenge.id)!.housesDamaged;
}

/** The storm's homes lost if nothing more is built from here. */
function idle(r: ActionRun): number {
  const challenge = r.nextChallenge()!;
  const copy = run();
  copy.restore(r.snapshot());
  while (!copy.landed.has(challenge.id)) passYear(copy);
  return copy.outcomes.get(challenge.id)!.housesDamaged;
}

describe("objectives chosen by the model", () => {
  it("every row saves a home; following them saves at least what any row is credited with, and exactly what the model said, in every phase", () => {
    const r = run();
    for (let phase = 0; phase < 3; phase++) {
      const objective = r.objective!;
      expect(objective.rows.length, `phase ${phase + 1}`).toBeGreaterThan(0);
      for (const row of r.prep) {
        expect(row.homes!, row.label).toBeGreaterThanOrEqual(1);
        expect(row.count).toBeGreaterThanOrEqual(1);
        for (const pick of objective.picks.filter((p) => p.elementId === row.elementId && row.tiles!.includes(p.key))) expect(row.tiles).toContain(pick.key);
      }
      expect(objective.picks.length).toBeLessThanOrEqual(r.buildsUntil(r.nextChallenge()!));
      const without = idle(r);
      expect(without, `phase ${phase + 1}: the area as the model counts it`).toBe(objective.lostBefore);
      const lost = follow(r);
      const saved = without - lost;
      expect(lost, `phase ${phase + 1}: the storm takes what the model said`).toBe(objective.lostAfter);
      for (const row of objective.rows) expect(saved, row.label).toBeGreaterThanOrEqual(row.homes!);
    }
  }, 600_000);

  it("chooses from the board as the player left it (after a Smart bot's first phase)", () => {
    const { log } = smartRun("bot-seed-1");
    const r = run();
    const first = r.nextChallenge()!;
    // Replay the bot's builds until the first storm has passed, then check phase two's objective the same way.
    for (const action of log) {
      if (r.landed.has(first.id)) break;
      if (action.type === "build") expect(r.build(action.coord, action.elementId).ok).toBe(true);
    }
    while (!r.landed.has(first.id)) passYear(r);
    const objective = r.objective!;
    expect(objective.rows.length).toBeGreaterThan(0);
    for (const row of objective.rows) expect(row.homes!).toBeGreaterThanOrEqual(1);
    const without = idle(r);
    const lost = follow(r);
    expect(lost).toBe(objective.lostAfter);
    for (const row of objective.rows) expect(without - lost).toBeGreaterThanOrEqual(row.homes!);
  }, 600_000);

  it("words each row as a build and a place, with the first cyclone's in front of Sharada Mandir School", () => {
    const r = run();
    for (const row of r.prep) expect(row.label).toMatch(/^(Build|Plant) \d+ [a-z ]+ (between|at|near|in front of|in) /);
    expect(r.prep.length).toBeGreaterThan(0);
    for (const row of r.prep) expect(row.label).toMatch(/ in front of Sharada Mandir School$/);
  });

  // Section 16.4 (owner decision): the first objective is "Protect Sharada Mandir School", its rows from the
  // model on the tiles round the school only, with the school pinned.
  it("phase 1: Protect Sharada Mandir School, every pick round the school, the school pinned, all 8 homes saved", () => {
    const r = run();
    const school = MAP.landmarks.find((l) => l.name === "Sharada Mandir School")!;
    expect(r.objective!.rows.every((row) => row.heading === "Protect Sharada Mandir School")).toBe(true);
    for (const pick of r.objective!.picks) {
      const [q, rr] = pick.key.split(",").map(Number);
      expect(Math.max(Math.abs(q - school.q), Math.abs(rr - school.r), Math.abs(q + rr - school.q - school.r)), pick.key).toBeLessThanOrEqual(3);
    }
    for (const row of r.objective!.rows) expect(row.pins).toEqual([{ name: "Sharada Mandir School", q: school.q, r: school.r }]);
    // Section 19: 8, not 9: the Caranzalem home at -7,24 went with the owner's edit to beach.
    expect(r.objective!.lostBefore).toBe(8);
    // Section 17.2 (owner decision): the objective suggests nature-based defences only. Section 19: with the home
    // at -7,24 gone (beach now), the dunes in front of the school save all 8.
    expect(r.objective!.lostAfter).toBe(0);
    expect(r.objective!.picks.every((pick) => pick.elementId === "dune" || pick.elementId === "sandy_vegetation")).toBe(true);
  });

  // Section 16.5 (owner decision): the second is "Protect Taleigao, Merces and St Cruz", its rows from the model
  // inside those three localities (each tile belonging to its nearest locality label), the three names pinned.
  it("phase 2: Protect Taleigao, Merces and St Cruz, every pick inside the three, the three pinned", () => {
    const r = run();
    const flood = r.schedule[1];
    while (r.turnNumber < r.phaseStart(flood)) passYear(r);
    const own = r.ownAreaFor(flood.id)!;
    expect(own.title).toBe("Protect Taleigao, Merces and St Cruz");
    expect(r.objective!.rows.length).toBeGreaterThan(0);
    for (const row of r.objective!.rows) {
      expect(row.heading).toBe("Protect Taleigao, Merces and St Cruz");
      expect(row.label).toMatch(/ in (Taleigao|Merces|St Cruz)$/);
      expect(row.pins!.map((p) => p.name)).toEqual(["Taleigao", "Merces", "St Cruz"]);
    }
    for (const pick of r.objective!.picks) expect(own.tiles.has(pick.key), pick.key).toBe(true);
    expect(r.objective!.lostAfter).toBeLessThan(r.objective!.lostBefore);
  });
});
