import { describe, expect, it } from "vitest";
import { passYear } from "./helpers/passYear";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { mapById } from "../src/levels/levelMap";
import { ELEMENT_BY_ID } from "../src/core/elements";

/**
 * Section 11.4: north of the Mandovi is on the board as scenery, not part of
 * the game. Nothing can be built there and its houses never count, in any
 * storm, cone, heat or result; storms still draw over it.
 */
const MAP = mapById("panaji")!;
const NORTH = new Set(MAP.unplayable.map(([q, r]) => `${q},${r}`));

describe("the north bank (scenery)", () => {
  it("is flagged on exactly the stored tiles, and has houses on it", () => {
    expect(MAP.tiles.filter((t) => t.scenery).map((t) => `${t.coord.q},${t.coord.r}`).sort()).toEqual([...NORTH].sort());
    const run = newRun("north", BOT_LEVEL);
    expect([...NORTH].filter((key) => run.state.elements.get(key)?.elementId === "house").length).toBeGreaterThan(50);
  });

  it("offers nothing to build", () => {
    const run = newRun("north", BOT_LEVEL);
    for (const key of NORTH) {
      const [q, r] = key.split(",").map(Number);
      expect(run.state.buildableAt({ q, r }), key).toEqual([]);
      for (const id of ELEMENT_BY_ID.keys()) expect(run.state.canBuild({ q, r }, id)).toBe(false);
    }
  });

  it("leaves the Mandovi and every river and sea tile playable", () => {
    for (const tile of MAP.tiles) if (tile.terrainId === "river" || tile.terrainId === "coast") expect(tile.scenery).toBeUndefined();
  });

  it("never counts in a storm, its cone, its heat or its area to protect", () => {
    const run = newRun("north", BOT_LEVEL);
    for (const challenge of [...run.schedule]) {
      while (run.turnNumber < run.phaseStart(challenge)) passYear(run);
      const cone = run.forecastCone(challenge)!;
      for (const key of cone.bands.keys()) expect(NORTH.has(key), `${challenge.id} cone ${key}`).toBe(false);
      for (const key of cone.area) expect(NORTH.has(key), `${challenge.id} area ${key}`).toBe(false);
      const exposure = run.exposureFor(challenge)!;
      for (const key of exposure.intensity.keys()) expect(NORTH.has(key), `${challenge.id} heat ${key}`).toBe(false);
      while (!run.landed.has(challenge.id)) passYear(run);
      const record = run.stormRecords.get(challenge.id)!;
      for (const key of record.outcome.damagedHouses) expect(NORTH.has(key), `${challenge.id} lost ${key}`).toBe(false);
    }
  });

  it("still gets wet on screen: the water drawn for each storm covers it where the model floods it (drawn, never counted)", () => {
    const run = newRun("north", BOT_LEVEL);
    for (const challenge of [...run.schedule]) {
      while (!run.landed.has(challenge.id)) passYear(run);
      const record = run.stormRecords.get(challenge.id)!;
      const wet = [...record.depth.keys()].filter((key) => NORTH.has(key) && run.state.placed.get(key)!.terrainId === "land");
      const drawn = wet.filter((key) => {
        const tile = record.field.tiles.get(key);
        return !!tile && tile.surgePeak + tile.floodPeak > 0;
      });
      // The drawn field is the storm animation's (core/hazard.ts); every flooded north-bank land tile is in it.
      expect(drawn.length, challenge.id).toBe(wet.length);
      if (challenge.kind !== "cyclone") expect(wet.length, challenge.id).toBeGreaterThan(0);
    }
  });

  it("is in no zone", () => {
    for (const zone of MAP.zones) for (const [q, r] of zone.tiles) expect(NORTH.has(`${q},${r}`), `${zone.id} ${q},${r}`).toBe(false);
  });
});
