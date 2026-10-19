import { passYear } from "./helpers/passYear";
import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { coneBands, forecastLine } from "../src/core/forecastCone";
import { axialDistance, axialToWorld, worldToAxial } from "../src/core/hex";
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

  // Section 16.4 (owner decision): the first cyclone comes in from the open sea to the west and makes landfall on
  // Miramar beach directly in front of Sharada Mandir School; its track ends at the school.
  it("draws the cyclone's track from the open sea to the west, ashore in front of Sharada Mandir School, ending at the school", () => {
    const run = newRun("cone", BOT_LEVEL);
    const cone = run.forecastCone(run.schedule[0])!;
    expect(cone.tracks.map((t) => t.kind)).toEqual(["cyclone"]);
    const site = run.board().sites[run.landfallOf(run.schedule[0])!];
    expect(site).toBe("-5,18");
    const school = place("Sharada Mandir School");
    expect([school.q, school.r]).toEqual([-3, 18]);
    const points = cone.tracks[0].points;
    const end = axialToWorld(school, 1);
    expect(points[points.length - 1].x).toBeCloseTo(end.x, 6);
    expect(points[points.length - 1].z).toBeCloseTo(end.z, 6);
    // From the sea to the west: the track starts further west than the school, over open sea.
    expect(points[0].x).toBeLessThan(end.x - 5);
    expect(cone.meet).toEqual([]);
  });

  it("draws the flood's track from the upstream (eastern) Mandovi into the wetlands, and the compound storm's both, with where they meet", () => {
    const run = newRun("cone", BOT_LEVEL);
    const flood = run.forecastCone(run.schedule[1])!;
    const track = flood.tracks.find((t) => t.kind === "flood")!;
    expect(track.points.length).toBeGreaterThan(3);
    // Upstream is east: the track starts further east than it ends.
    expect(track.points[0].x).toBeGreaterThan(track.points[track.points.length - 1].x);
    // Section 16.5: it starts at the level's source, the upstream Mandovi at the east edge, comes through the new
    // channel by Ribandar (25,5 to 28,5) and ends in Taleigao, Merces or St Cruz, at a home at risk there.
    const keys = track.points.map((p) => { const a = worldToAxial(p.x, p.z, 1); return `${a.q},${a.r}`; });
    expect(BOT_LEVEL.climate!.floodSource).toContain(keys[0]);
    expect(keys.some((key) => ["25,5", "26,5", "27,5", "28,5"].includes(key))).toBe(true);
    const own = run.ownAreaFor(run.schedule[1].id)!;
    expect(own.title).toBe("Protect Taleigao, Merces and St Cruz");
    expect(own.tiles.has(keys[keys.length - 1])).toBe(true);
    expect(flood.area).toContain(keys[keys.length - 1]);
    const compound = run.forecastCone(run.schedule[2])!;
    expect(compound.tracks.map((t) => t.kind).sort()).toEqual(["cyclone", "flood"]);
    expect(compound.meet.length).toBeGreaterThan(0);
    // Where they meet: mostly the river mouth and the Mandovi waterfront, not the open beach. Section 21.2: the
    // stronger 2050 storm (3.8) also meets the flood on more of the beach: 53% waterfront, from over 60%.
    const zones = run.zones!;
    const onWaterfront = compound.meet.filter((key) => zones.zoneOf(key) === "z4" || zones.zoneOf(key) === null).length;
    expect(onWaterfront / compound.meet.length).toBeGreaterThan(0.5);
  });

  // Section 16.4: undefended, the first cyclone takes the home beside Sharada Mandir School (-3,19) and the low
  // land the owner added on either side of the school's beach: the creek behind it to the east and Caranzalem's
  // shore to the south. Landfall and strength cannot keep it to the school's ground: the homes round the school
  // stand on a ridge (6.5-8.5 m) and the added land is at 0-1.5 m (see docs/QA_REPORT.md, Section 16). Building
  // in front of the school saves every one of them, since all the surge comes ashore there.
  // Section 19: -7,24 is beach now (owner edit), so it has no home to lose: 8.
  const FIRST_CYCLONE = ["-3,19", "-5,22", "-6,23", "0,19", "0,20", "1,19", "2,18", "2,19"];
  it("keeps the first cyclone at the school: undefended, it takes the home beside it and the low land either side of its beach, and nothing at Kala Academy", () => {
    const run = newRun("cone", BOT_LEVEL);
    const cyclone = run.schedule[0];
    while (!run.landed.has(cyclone.id)) passYear(run);
    const lost = run.outcomes.get(cyclone.id)!.damagedHouses;
    expect([...lost].sort()).toEqual([...FIRST_CYCLONE].sort());
    const school = place("Sharada Mandir School");
    for (const key of lost) {
      const [q, r] = key.split(",").map(Number);
      expect(axialDistance({ q, r }, school), key).toBeLessThanOrEqual(6);
    }
    const kala = place("Kala Academy");
    for (const key of lost) {
      const [q, r] = key.split(",").map(Number);
      expect(axialDistance({ q, r }, kala), key).toBeGreaterThan(4);
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
