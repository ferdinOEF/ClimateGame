import { passYear } from "./helpers/passYear";
import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { coneBands, forecastLine } from "../src/core/forecastCone";
import { placeOnLine } from "../src/core/stretch";
import { mapById } from "../src/levels/levelMap";

/**
 * Section 6.1: the forecast cone comes from the hazard model. These pin what
 * it promises: the area to protect is exactly what the storm would take, every
 * house that could be lost is inside Possible, the tracks run where the spec
 * says, and the first cyclone is small.
 */
const MAP = mapById("panaji")!;
const place = (name: string) => MAP.landmarks.find((l) => l.name === name)!;

describe("the forecast cone", () => {
  it("shows at the start of each storm's phase: turns 1, 6 and 16", () => {
    const run = newRun("cone", BOT_LEVEL);
    expect(run.schedule.map((c) => run.phaseStart(c))).toEqual([1, 6, 16]);
  });

  it("names the storm and when, as the spec words it", () => {
    expect(forecastLine("cyclone", 5, true)).toBe("The first cyclone lands in 5 years");
    expect(forecastLine("flood", 10, false)).toBe("The flood comes in 10 years");
    expect(forecastLine("compound", 10, false)).toBe("The cyclone and flood arrive together in 10 years");
  });

  it("marks exactly the houses the storm would take as the area to protect, and they, and every house it could take, lie in Possible", () => {
    const run = newRun("cone", BOT_LEVEL);
    for (const challenge of [...run.schedule]) {
      while (run.turnNumber < run.phaseStart(challenge)) passYear(run);
      const cone = run.forecastCone(challenge)!;
      // The area to protect: what the storm takes if nothing more is built.
      const probe = newRun("cone", BOT_LEVEL);
      probe.restore(run.snapshot());
      while (!probe.landed.has(challenge.id)) passYear(probe);
      expect([...cone.area].sort(), challenge.id).toEqual([...probe.outcomes.get(challenge.id)!.damagedHouses].sort());
      // With no defences at all: every house lost is inside the bands.
      const bare = newRun("cone", BOT_LEVEL);
      while (!bare.landed.has(challenge.id)) passYear(bare);
      for (const key of bare.outcomes.get(challenge.id)!.damagedHouses) expect(cone.bands.has(key), `${challenge.id} ${key}`).toBe(true);
      // Three real bands: each holds at least a tenth of the cone, so none is the whole of it.
      for (const band of [1, 2, 3]) expect([...cone.bands.values()].filter((b) => b === band).length, `${challenge.id} band ${band}`).toBeGreaterThanOrEqual(cone.bands.size / 10);
    }
  });

  it("draws the cyclone's track from the sea onto the beach between Kala Academy and Sharada Mandir", () => {
    const run = newRun("cone", BOT_LEVEL);
    const cone = run.forecastCone(run.schedule[0])!;
    expect(cone.tracks.map((t) => t.kind)).toEqual(["cyclone"]);
    const site = run.board().sites[run.landfallOf(run.schedule[0])!];
    const [q, r] = site.split(",").map(Number);
    const at = placeOnLine({ q, r }, place("Kala Academy"), place("Sharada Mandir School"));
    expect(at.along).toBeGreaterThan(0);
    expect(at.along).toBeLessThan(1);
    expect(cone.meet).toEqual([]);
  });

  it("draws the flood's track from the upstream (eastern) Mandovi into the wetlands, and the compound storm's both, with where they meet", () => {
    const run = newRun("cone", BOT_LEVEL);
    const flood = run.forecastCone(run.schedule[1])!;
    const track = flood.tracks.find((t) => t.kind === "flood")!;
    expect(track.points.length).toBeGreaterThan(3);
    // Upstream is east: the track starts further east than it ends.
    expect(track.points[0].x).toBeGreaterThan(track.points[track.points.length - 1].x);
    const compound = run.forecastCone(run.schedule[2])!;
    expect(compound.tracks.map((t) => t.kind).sort()).toEqual(["cyclone", "flood"]);
    expect(compound.meet.length).toBeGreaterThan(0);
    // Where they meet: the river mouth and the Mandovi waterfront, not the open beach.
    const zones = run.zones!;
    const onWaterfront = compound.meet.filter((key) => zones.zoneOf(key) === "z4" || zones.zoneOf(key) === null).length;
    expect(onWaterfront / compound.meet.length).toBeGreaterThan(0.6);
  });

  // Section 11 (owner decision): the new 0 m land at the river mouth just north of Kala Academy, 5,10 and
  // 6,9, floods in any cyclone that reaches the mouth; it is the only damage outside the stretch.
  // Section 12: the cyclone's wind tips 8,7, one more home on the same river-mouth shore.
  const RIVER_MOUTH = ["5,10", "6,9", "8,7"];
  it("keeps the first cyclone small: undefended, everything it takes is on the beach and land between Kala Academy and Sharada Mandir, but for the river mouth", () => {
    const run = newRun("cone", BOT_LEVEL);
    const cyclone = run.schedule[0];
    while (!run.landed.has(cyclone.id)) passYear(run);
    const lost = run.outcomes.get(cyclone.id)!.damagedHouses;
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.filter((key) => RIVER_MOUTH.includes(key)).sort()).toEqual(RIVER_MOUTH);
    for (const key of lost.filter((k) => !RIVER_MOUTH.includes(k))) {
      const [q, r] = key.split(",").map(Number);
      const terrain = run.state.placed.get(key)!.terrainId;
      expect(["beach", "land"], key).toContain(terrain);
      const at = placeOnLine({ q, r }, place("Kala Academy"), place("Sharada Mandir School"));
      expect(at.along, key).toBeGreaterThanOrEqual(0);
      expect(at.along, key).toBeLessThanOrEqual(1);
      expect(run.openingTiles!.has(key), key).toBe(true);
    }
  });
});

describe("the cone's bands", () => {
  it("rank the reached tiles by depth into thirds, equal depths sharing the darker band", () => {
    const bands = coneBands([["a", 3], ["b", 2.5], ["c", 2], ["d", 1], ["e", 1], ["f", 0.2]]);
    expect([...bands.entries()].sort()).toEqual([["a", 3], ["b", 3], ["c", 2], ["d", 2], ["e", 2], ["f", 1]]);
    expect(coneBands([]).size).toBe(0);
  });
});
