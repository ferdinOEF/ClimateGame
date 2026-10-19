import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { passYear } from "./helpers/passYear";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { mapById } from "../src/levels/levelMap";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { labelsForMap } from "../src/ui/mapLabels";
import panajiFile from "../src/data/maps/panaji.json";

/**
 * Section 11.4: north of the Mandovi is on the board as scenery, not part of
 * the game (and, since Section 19.2, the east edge: SCENERY holds both). Nothing can be built there and its houses never count, in any
 * storm, cone, heat or result; storms still draw over it.
 */
const MAP = mapById("panaji")!;
const SCENERY = new Set(MAP.unplayable.map(([q, r]) => `${q},${r}`));

describe("the north bank (scenery)", () => {
  it("is flagged on exactly the stored tiles, and has houses on it", () => {
    expect(MAP.tiles.filter((t) => t.scenery).map((t) => `${t.coord.q},${t.coord.r}`).sort()).toEqual([...SCENERY].sort());
    const run = newRun("north", BOT_LEVEL);
    expect([...SCENERY].filter((key) => run.state.elements.get(key)?.elementId === "house").length).toBeGreaterThan(50);
  });

  it("offers nothing to build", () => {
    const run = newRun("north", BOT_LEVEL);
    for (const key of SCENERY) {
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
      for (const key of cone.bands.keys()) expect(SCENERY.has(key), `${challenge.id} cone ${key}`).toBe(false);
      for (const key of cone.area) expect(SCENERY.has(key), `${challenge.id} area ${key}`).toBe(false);
      const exposure = run.exposureFor(challenge)!;
      for (const key of exposure.intensity.keys()) expect(SCENERY.has(key), `${challenge.id} heat ${key}`).toBe(false);
      while (!run.landed.has(challenge.id)) passYear(run);
      const record = run.stormRecords.get(challenge.id)!;
      for (const key of record.outcome.damagedHouses) expect(SCENERY.has(key), `${challenge.id} lost ${key}`).toBe(false);
    }
  });

  it("still gets wet on screen: the water drawn for each storm covers it where the model floods it (drawn, never counted)", () => {
    const run = newRun("north", BOT_LEVEL);
    for (const challenge of [...run.schedule]) {
      while (!run.landed.has(challenge.id)) passYear(run);
      const record = run.stormRecords.get(challenge.id)!;
      const wet = [...record.depth.keys()].filter((key) => SCENERY.has(key) && run.state.placed.get(key)!.terrainId === "land");
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
    for (const zone of MAP.zones) for (const [q, r] of zone.tiles) expect(SCENERY.has(`${q},${r}`), `${zone.id} ${q},${r}`).toBe(false);
  });
});

/**
 * Section 19.2 (owner decision): the east edge, east of world x = 52.3 (q + r/2 >= 30.2), is out of Panjim the
 * same way. Its land, beach and estuary are scenery (the rules above run over every stored tile, so they cover it);
 * its river and sea stay playable water. Merces and St Cruz stay in the game; Ribandar does not.
 */
describe("the east edge (scenery)", () => {
  const EAST = MAP.tiles.filter((t) => t.coord.q + t.coord.r / 2 >= 30.2);
  it("is scenery on all its land, beach and estuary, and nowhere else east of the line", () => {
    for (const t of EAST) {
      const dry = ["land", "beach", "estuary"].includes(t.terrainId);
      expect(!!t.scenery, `${t.coord.q},${t.coord.r} ${t.terrainId}`).toBe(dry);
    }
    expect(EAST.filter((t) => t.scenery && t.coord.r >= 4)).toHaveLength(121);
    expect(MAP.unplayableEastFrom).toBe(30.2);
  });

  it("takes Ribandar out and keeps Merces and St Cruz, their homes and the flood's source in the game", () => {
    // Ribandar's label stands on scenery, so the game drops it (levelMap.ts): no label, no home or row named after it.
    const raw = (panajiFile as { localities: { name: string; q: number; r: number }[] }).localities;
    for (const [name, out] of [["Ribandar", true], ["Merces", false], ["St Cruz", false]] as const) {
      const { q, r } = raw.find((l) => l.name === name)!;
      expect(SCENERY.has(`${q},${r}`), name).toBe(out);
      expect(MAP.localities.some((l) => l.name === name), name).toBe(!out);
    }
    expect(labelsForMap(MAP).some((l) => l.name === "Ribandar")).toBe(false);
    const sources = (BOT_LEVEL.climate as { floodSource?: string[] }).floodSource ?? [];
    expect(sources.length).toBeGreaterThan(0);
    for (const key of sources) {
      const tile = MAP.tiles.find((t) => `${t.coord.q},${t.coord.r}` === key)!;
      expect(tile.terrainId, key).toBe("river");
      expect(tile.scenery, key).toBeUndefined();
    }
  });

  it("says so on a click, in words with no dots or hyphens between them", () => {
    const source = readFileSync("src/app/gameSession.ts", "utf8");
    expect(source).toContain('"Outside Panjim, not part of this game"');
  });
});
