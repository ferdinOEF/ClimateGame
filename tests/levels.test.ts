import { describe, expect, it } from "vitest";
import { LEVELS, dailyChallengeLevel, isDailyLevel, nextLevel, resolveLevel } from "../src/levels/levels";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { mapById, terrainCounts, tilesForLevel } from "../src/levels/levelMap";
import { MAX_ELEMENT_INSTANCES_PER_TYPE, MAX_TERRAIN_INSTANCES_PER_TYPE } from "../src/render/instanceLimits";
import { dailyChallengeId, hashSeed, Rng } from "../src/core/rng";
import { describeObjective } from "../src/core/objectives";
import mapData from "../src/data/map.json";

/**
 * Level definitions are data, which means a typo in levels.json is a
 * runtime bug rather than a compile error. These tests are the guard rail:
 * they check that every level references things that exist, asks for
 * things the map can physically provide, and is ordered sensibly.
 *
 * The "can the map provide it" check is the one that earns its keep — an
 * objective asking for six Mangroves on a map with four estuary tiles
 * would be unwinnable, and no amount of playtesting level 1 would reveal
 * it.
 */

/**
 * Tiles in THIS LEVEL's window that could host `elementId`.
 *
 * Deliberately per-level rather than map-wide. Levels now play on a subset
 * of the authored map that grows through the campaign, so "the map has 52
 * estuary tiles" says nothing about whether level 2 — which only sees a
 * radius-4 window — can host the four Mangroves it asks for. Checking
 * against the full map would let an unwinnable level ship.
 */
function capacityFor(counts: Map<string, number>, elementId: string): number {
  const def = ELEMENT_BY_ID.get(elementId);
  if (!def) return 0;
  return def.validTerrainIds.reduce((sum, terrainId) => sum + (counts.get(terrainId) ?? 0), 0);
}

/** Best single-element capacity across a defence family — a category objective can be met with any mix, so the largest is the binding number. */
function capacityForCategory(counts: Map<string, number>, category: string): number {
  let best = 0;
  for (const def of ELEMENT_BY_ID.values()) {
    if (def.category !== category) continue;
    best = Math.max(best, capacityFor(counts, def.id));
  }
  return best;
}

describe("level definitions", () => {
  it("has unique ids", () => {
    const ids = LEVELS.map((level) => level.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every level the content the UI needs", () => {
    for (const level of LEVELS) {
      expect(level.name, `${level.id} name`).toBeTruthy();
      expect(level.subtitle, `${level.id} subtitle`).toBeTruthy();
      expect(level.brief.length, `${level.id} brief`).toBeGreaterThan(20);
      expect(level.objectives.length, `${level.id} objectives`).toBeGreaterThan(0);
      expect(level.startingCoin, `${level.id} coin`).toBeGreaterThan(0);
      expect(level.parTurns, `${level.id} par`).toBeGreaterThan(0);
    }
  });

  it("references only real elements, and only ones its own map window can host", () => {
    for (const level of LEVELS) {
      const counts = terrainCounts(tilesForLevel(level));
      for (const objective of level.objectives) {
        if (objective.type === "build_element") {
          const def = ELEMENT_BY_ID.get(objective.elementId);
          expect(def, `${level.id} references unknown element "${objective.elementId}"`).toBeDefined();
          expect(
            capacityFor(counts, objective.elementId),
            `${level.id} (radius ${level.mapRadius}) wants ${objective.count}x ${objective.elementId} but its window has fewer valid tiles`
          ).toBeGreaterThanOrEqual(objective.count);
        }
        if (objective.type === "build_category") {
          expect(
            capacityForCategory(counts, objective.category),
            `${level.id} (radius ${level.mapRadius}) wants ${objective.count} ${objective.category} defences but its window cannot host that many`
          ).toBeGreaterThanOrEqual(objective.count);
        }
      }
    }
  });

  it("plays every level on a map that exists", () => {
    // `mapId` is a string in JSON, so a typo is a runtime fallback to the
    // generated coast rather than a compile error — a level would silently
    // play on the wrong place. This is the only thing that catches it.
    for (const level of LEVELS) {
      expect(level.mapId, `${level.id} has no mapId`).toBeTruthy();
      expect(mapById(level.mapId), `${level.id} names unknown map "${level.mapId}"`).not.toBeNull();
    }
  });

  it("gives every level a map containing every terrain type", () => {
    // A map missing a terrain silently removes a whole branch of the build
    // menu, and can make a level unwinnable. `buildCityMaps.ts` refuses to
    // call a map finished without all five, but a level could still be
    // pointed at a map that lacks what IT needs, and `mapRadius` could crop
    // one away — so the check belongs here too, against the tiles the level
    // actually plays on.
    for (const level of LEVELS) {
      const counts = terrainCounts(tilesForLevel(level));
      for (const terrainId of ["beach", "estuary", "land", "river", "coast"]) {
        expect(counts.get(terrainId) ?? 0, `${level.id} (map ${level.mapId}) has no ${terrainId}`).toBeGreaterThan(0);
      }
    }
  });

  it("opens with a compact tutorial and gives every other level a full board", () => {
    // What matters is the onboarding shape: the first board has to be small
    // enough to take in at once, and no later board so small it feels like a
    // regression.
    const tutorial = LEVELS[0];
    expect(tutorial.tutorial, "the first level should be the guided tutorial").toBe(true);
    expect(tilesForLevel(tutorial).length, "the tutorial board should read at a glance").toBeLessThan(80);

    for (const level of LEVELS.slice(1)) {
      expect(tilesForLevel(level).length, `${level.id} is barely larger than the tutorial`).toBeGreaterThan(150);
    }
  });

  it("keeps every map inside the renderer's per-terrain instance pools", () => {
    // `TerrainMeshManager` allocates one instanced-mesh pool PER TERRAIN TYPE
    // and throws outright when a map overruns one. An earlier version of this
    // test compared a map's TOTAL tile count against that per-type cap, which
    // is the wrong comparison in both directions: it failed the Panaji board,
    // whose largest single terrain is well under the cap, and it would have
    // passed a 500-tile board that was 500 tiles of land.
    for (const level of LEVELS) {
      const counts = terrainCounts(tilesForLevel(level));
      for (const [terrainId, count] of counts) {
        expect(
          count,
          `${level.id} has ${count} ${terrainId} tiles, past the ${MAX_TERRAIN_INSTANCES_PER_TYPE} the renderer can hold`
        ).toBeLessThanOrEqual(MAX_TERRAIN_INSTANCES_PER_TYPE);
      }
    }
  });

  it("leaves room to build on every tile of the largest terrain class", () => {
    /*
     * A player can legitimately fill every valid tile with the same element —
     * a House on every land tile is an ordinary thing to do on a city map, and
     * the dev autobuild does exactly that. `ElementMeshManager` throws when its
     * pool runs out, from inside session setup, so the symptom is the game
     * hanging on the loading splash with nothing on screen that suggests a
     * full buffer.
     *
     * This caught it for real: Panaji grew from 445 land tiles to 457 while the
     * element cap was 400.
     */
    for (const level of LEVELS) {
      const counts = terrainCounts(tilesForLevel(level));
      for (const [terrainId, count] of counts) {
        expect(
          count,
          `${level.id} has ${count} ${terrainId} tiles, more than the ${MAX_ELEMENT_INSTANCES_PER_TYPE} elements of one kind the renderer can hold`
        ).toBeLessThanOrEqual(MAX_ELEMENT_INSTANCES_PER_TYPE);
      }
    }
  });

  it("marks exactly one level as the tutorial", () => {
    const tutorials = LEVELS.filter((level) => level.tutorial === true);
    expect(tutorials.map((level) => level.id)).toEqual([LEVELS[0].id]);
  });

  it("names every campaign level after the place it is played on", () => {
    // The level name IS the place now — the menu button, the level card and
    // the in-game header all lead with it. The two live in different files, so
    // this is what stops a map being re-pointed or renamed without the level
    // that uses it following, which would have the board announce one place
    // while the HUD announces another.
    for (const level of LEVELS) {
      if (level.tutorial) continue;
      const map = mapById(level.mapId)!;
      expect(level.name, `${level.id} is named "${level.name}" but plays on "${map.name}"`).toBe(map.name);
    }
  });

  it("has enough population capacity for any population objective", () => {
    // Population comes from Houses, which need `land`. A window with four
    // land tiles cannot reach a 90-population goal however well it is played.
    for (const level of LEVELS) {
      const objective = level.objectives.find((o) => o.type === "meter_at_least" && o.meter === "population");
      if (!objective || objective.type !== "meter_at_least") continue;
      const counts = terrainCounts(tilesForLevel(level));
      const house = ELEMENT_BY_ID.get("house")!;
      const perHouse = house.effects.population ?? 0;
      const needed = Math.ceil((objective.value - 50) / perHouse); // 50 = STARTING_POPULATION
      expect(
        capacityFor(counts, "house"),
        `${level.id} needs ${needed} Houses for ${objective.value} population but its window has fewer land tiles`
      ).toBeGreaterThanOrEqual(needed);
    }
  });

  it("only asks for meters some element can actually produce", () => {
    // Guards the exact gap that made Carbon unreachable before this pass:
    // a meter wired through the HUD and the score with no element granting
    // it. An objective on a dead meter is unwinnable.
    const producible = new Set<string>();
    for (const def of ELEMENT_BY_ID.values()) {
      for (const [key, delta] of Object.entries(def.effects)) {
        if (delta > 0) producible.add(key);
      }
    }
    // Trust and Resilience are engine-managed rather than element-granted.
    const engineManaged = new Set(["trust", "resilience"]);

    for (const level of LEVELS) {
      for (const objective of level.objectives) {
        if (objective.type !== "meter_at_least") continue;
        if (engineManaged.has(objective.meter)) continue;
        expect(
          producible.has(objective.meter),
          `${level.id} needs ${objective.value} ${objective.meter}, but no element grants ${objective.meter}`
        ).toBe(true);
      }
    }
  });

  it("orders star thresholds ascending", () => {
    for (const level of LEVELS) {
      const [one, two, three] = level.starThresholds;
      expect(one, `${level.id}`).toBeLessThan(two);
      expect(two, `${level.id}`).toBeLessThan(three);
    }
  });

  it("keeps every star threshold under the ceiling firestore.rules enforces", () => {
    // The rules reject any score above 100000 outright. A level whose
    // 3-star bar sat above that would be uncompletable on the leaderboard.
    for (const level of LEVELS) {
      expect(level.starThresholds[2], `${level.id}`).toBeLessThan(100000);
    }
  });

  it("gets harder as the campaign goes on", () => {
    // Measured from the first REAL level, not the tutorial. The tutorial sits
    // outside the difficulty curve on purpose: its storm arrives on a short
    // clock so a player actually sees one inside a twelve-turn lesson, but at
    // a severity nothing can lose to. Comparing against it would make the
    // curve look broken when it is not.
    //
    // Skipped while the campaign is a single level, where there is no curve to
    // check rather than a flat one — asserting anything here would be
    // asserting that a level is harder than itself.
    const campaign = LEVELS.filter((level) => !level.tutorial);
    if (campaign.length < 2) return;

    const first = campaign[0].hazards;
    const last = campaign[campaign.length - 1].hazards;
    expect(last.severityBase).toBeGreaterThan(first.severityBase);
    expect(last.cycloneIntervalTurns).toBeLessThanOrEqual(first.cycloneIntervalTurns);
  });

  it("keeps the tutorial survivable", () => {
    // A tutorial a player can lose is not a tutorial. The strongest storm it
    // can roll must stay below the weakest defence's overwhelm threshold, so
    // following the prompts cannot end in a failed run.
    const tutorial = LEVELS.find((level) => level.tutorial)!;
    const worstSeverity = tutorial.hazards.severityBase + tutorial.hazards.severitySpread;
    expect(worstSeverity, "the tutorial's worst storm should be mild").toBeLessThan(0.6);
    expect(tutorial.hazards.floodEnabled, "the tutorial should teach one hazard, not two").toBe(false);
    expect(tutorial.hazards.severityCreepPerHazard, "the tutorial should not escalate").toBe(0);
  });

  it("describes every objective without leaking a raw id", () => {
    for (const level of LEVELS) {
      for (const objective of level.objectives) {
        const label = describeObjective(objective);
        expect(label).not.toContain("undefined");
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("nextLevel", () => {
  it("walks the campaign and stops at the end", () => {
    expect(nextLevel(LEVELS[0].id)?.id).toBe(LEVELS[1].id);
    expect(nextLevel(LEVELS[LEVELS.length - 1].id)).toBeNull();
    expect(nextLevel("not-a-level")).toBeNull();
  });
});

describe("daily challenge", () => {
  it("is identical for the same date and different across dates", () => {
    const a = dailyChallengeLevel("2026-09-07");
    const b = dailyChallengeLevel("2026-09-07");
    const c = dailyChallengeLevel("2026-09-08");

    // Same day, same challenge — this is what makes a shared daily board
    // meaningful at all.
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("is recognisable as a daily level", () => {
    expect(isDailyLevel(dailyChallengeLevel("2026-09-07").id)).toBe(true);
    expect(isDailyLevel(LEVELS[0].id)).toBe(false);
  });

  it("stays inside sane difficulty bounds on every day of a year", () => {
    const start = Date.UTC(2026, 0, 1);
    for (let day = 0; day < 365; day++) {
      const level = dailyChallengeLevel(dailyChallengeId(new Date(start + day * 86400000)));
      expect(level.startingCoin).toBeGreaterThan(0);
      expect(level.hazards.cycloneIntervalTurns).toBeGreaterThan(0);
      expect(level.hazards.severityBase).toBeGreaterThan(0);
      expect(level.objectives.length).toBeGreaterThan(0);
    }
  });

  it("resolves only today's challenge, never an older seed", () => {
    const today = dailyChallengeId();
    expect(resolveLevel(`daily-${today}`)?.id).toBe(`daily-${today}`);
    // Replaying an easier past day would let a player cherry-pick a seed.
    expect(resolveLevel("daily-2020-01-01")).toBeNull();
  });
});

describe("resolveLevel", () => {
  it("returns null for an unknown id instead of throwing", () => {
    expect(resolveLevel("nope")).toBeNull();
    expect(resolveLevel(LEVELS[0].id)?.id).toBe(LEVELS[0].id);
  });
});

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(hashSeed("level-01"));
    const b = new Rng(hashSeed("level-01"));
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new Rng(hashSeed("level-01"));
    const b = new Rng(hashSeed("level-02"));
    expect(a.next()).not.toBe(b.next());
  });

  it("stays within [0, 1) over a long run", () => {
    const rng = new Rng(12345);
    for (let i = 0; i < 10000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("does not collapse to a fixed point on a zero seed", () => {
    // mulberry32 has a degenerate zero state; the constructor folds it away.
    const rng = new Rng(0);
    expect(rng.next()).not.toBe(rng.next());
  });

  it("respects int bounds inclusively", () => {
    const rng = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("hashes similar short ids to different seeds", () => {
    // A naive char-sum hash collides badly on these; FNV-1a does not.
    expect(hashSeed("l01-first-rains")).not.toBe(hashSeed("l02-green-wall"));
    expect(hashSeed("daily-2026-09-07")).not.toBe(hashSeed("daily-2026-09-08"));
  });
});
