import { describe, expect, it } from "vitest";
import {
  DAMAGE_DEPTH,
  STORM_TIMING,
  arrivalTime,
  backwaterShare,
  combinedDepth,
  floodDepth,
  hitTime,
  peakDepth,
  surgeDepth,
  waterEnvelope,
  type DepthField
} from "../src/core/hazard";
import { BOT_LEVELS, newRun, type Preset } from "../tools/panjimBots/bots";
import type { ActionRun } from "../src/core/actionRun";
import type { StormRecord } from "../src/core/stormRecord";
import { buildStormScript, LIGHTNING_GAP } from "../src/core/stormScript";

/**
 * The water the hazard visuals draw is the storm the resolver decided. These
 * tests play the real Panaji run and check, storm by storm, that the depth
 * field built from the resolution puts water above the damage line on
 * exactly the houses the storm took, and nowhere else.
 */

/** Plays to the next storm, planting `plant` (zone, element) pairs on the way, and returns its record. */
function nextStorm(run: ActionRun, plant: [string, string][] = []): StormRecord {
  const next = run.nextChallenge()!;
  for (const [zoneId, elementId] of plant) {
    run.collectJar();
    for (const key of run.zones!.keys(zoneId)) {
      const [q, r] = key.split(",").map(Number);
      if (run.state.canBuild({ q, r }, elementId) && run.state.coin >= 100) {
        run.build({ q, r }, elementId);
        break;
      }
    }
  }
  while (!run.landed.has(next.id)) run.fastForwardYear();
  return run.stormRecords.get(next.id)!;
}

/** The deepest the drawn water gets on a tile, sampled the way a renderer would see it (every 50 ms). */
function drawnPeak(field: DepthField, key: string): number {
  let best = 0;
  for (let t = 0; t <= field.duration; t += 0.05) best = Math.max(best, combinedDepth(field, key, t));
  return best;
}

function checkRecord(record: StormRecord): void {
  const { field, outcome } = record;
  const damaged = new Set(outcome.damagedHouses);
  const houses = [...field.tiles.values()].filter((tile) => tile.house);
  expect(houses.length).toBeGreaterThan(0);
  for (const tile of houses) {
    const hit = damaged.has(tile.key);
    // Houses hit are exactly those with depth above the damage line.
    expect(peakDepth(field, tile.key) > DAMAGE_DEPTH, `${tile.key} peak ${peakDepth(field, tile.key)} hit ${hit}`).toBe(hit);
    // What a renderer samples reaches the same peak (to sampling precision).
    expect(drawnPeak(field, tile.key)).toBeCloseTo(peakDepth(field, tile.key), 6);
    expect(hitTime(field, tile.key) !== null).toBe(hit);
  }
  // No house stands on water.
  for (const tile of field.tiles.values()) if (tile.terrainId === "coast" || tile.terrainId === "river") expect(tile.house).toBe(false);
  // Before anything arrives and after the storm, the land is dry.
  for (const tile of houses) {
    expect(combinedDepth(field, tile.key, -1)).toBe(0);
    expect(combinedDepth(field, tile.key, field.duration + 1)).toBe(0);
  }
  // The undefended comparison is a real resolution too, and its field agrees with it.
  const undefendedHit = new Set(record.undefended.outcome.damagedHouses);
  for (const tile of record.undefended.field.tiles.values()) {
    if (tile.house) expect(peakDepth(record.undefended.field, tile.key) > DAMAGE_DEPTH).toBe(undefendedHit.has(tile.key));
  }
  for (const save of record.savedBy) expect(save.houses).toBeGreaterThan(0);
}

const PRESETS: Preset[] = ["easy-test", "strict"];
const SEEDS = ["panjim", "s1", "s7"];

describe("water depth matches the resolution", () => {
  for (const preset of PRESETS) {
    for (const seed of SEEDS) {
      it(`${preset} · ${seed}: undefended, every storm`, () => {
        const run = newRun(seed, BOT_LEVELS[preset]);
        for (let i = 0; i < 3; i++) checkRecord(nextStorm(run));
      });

      it(`${preset} · ${seed}: with defences`, () => {
        const run = newRun(seed, BOT_LEVELS[preset]);
        checkRecord(nextStorm(run, [["z1", "dune"], ["z1", "sandy_vegetation"], ["z2", "mangrove"]]));
        checkRecord(nextStorm(run, [["z2", "khazan"], ["z2", "khazan"], ["z3", "mangrove"]]));
        checkRecord(nextStorm(run, [["z4", "mangrove"], ["z2", "khazan"]]));
      });
    }
  }
});

describe("the storm's script", () => {
  const run = newRun("panjim", BOT_LEVELS["easy-test"]);
  const records = [nextStorm(run), nextStorm(run), nextStorm(run)];
  const [cyclone, flood, compound] = records;

  it("plays the three kinds in order", () => {
    expect(records.map((r) => r.kind)).toEqual(["cyclone", "flood", "compound"]);
  });

  it("rises, holds at exactly the peak, then drains", () => {
    expect(waterEnvelope(-0.1, 2, 3, 5)).toBe(0);
    expect(waterEnvelope(1, 2, 3, 5)).toBeGreaterThan(0);
    expect(waterEnvelope(1, 2, 3, 5)).toBeLessThan(1);
    expect(waterEnvelope(3.5, 2, 3, 5)).toBe(1);
    expect(waterEnvelope(10.1, 2, 3, 5)).toBe(0);
  });

  it("brings the cyclone's surge ashore at landfall, nearest the sea first", () => {
    expect(cyclone.field.landfall).toBe(STORM_TIMING.cyclone.landfall);
    const land = [...cyclone.field.tiles.values()].filter((t) => t.terrainId !== "coast" && t.surgePeak > 0);
    expect(land.length).toBeGreaterThan(0);
    for (const tile of land) expect(tile.surgeArrival).toBeGreaterThanOrEqual(STORM_TIMING.cyclone.landfall + STORM_TIMING.cyclone.surgeLead);
    // A cyclone brings no river flood.
    for (const tile of cyclone.field.tiles.values()) expect(floodDepth(cyclone.field, tile.key, 20)).toBe(0);
  });

  it("draws the sea back before the hit", () => {
    const sea = [...cyclone.field.tiles.values()].find((t) => t.shallows && t.surgePeak > 0)!;
    const offshore = [...cyclone.field.tiles.values()].find((t) => t.terrainId === "coast" && !t.shallows && t.surgePeak > 0)!;
    expect(surgeDepth(cyclone.field, offshore.key, cyclone.field.landfall! - 3)).toBeGreaterThanOrEqual(0);
    const landfall = cyclone.field.landfall!;
    expect(surgeDepth(cyclone.field, sea.key, landfall - 3)).toBeLessThan(0);
    expect(surgeDepth(cyclone.field, sea.key, landfall + 2)).toBeGreaterThan(0);
  });

  it("sends the flood's swell downriver, one channel tile at a time", () => {
    const river = [...flood.field.tiles.values()].filter((t) => t.terrainId === "river" && t.riverIndex !== null).sort((a, b) => a.riverIndex! - b.riverIndex!);
    expect(river.length).toBeGreaterThan(10);
    expect(flood.field.mouthIndex).toBeGreaterThan(10);
    for (let i = 1; i < river.length; i++) expect(river[i].floodArrival).toBeGreaterThanOrEqual(river[i - 1].floodArrival);
    const first = river[0];
    const last = river[river.length - 1];
    expect(last.floodArrival - first.floodArrival).toBeCloseTo((last.riverIndex! - first.riverIndex!) * flood.field.perRiverIndex, 6);
    expect(flood.field.perRiverIndex).toBeLessThanOrEqual(STORM_TIMING.flood.perRiverIndex);
    // The banks flood after the channel beside them.
    for (const tile of flood.field.tiles.values()) {
      if (tile.terrainId === "land" && tile.floodPeak > 0) expect(tile.floodArrival).toBeGreaterThan(STORM_TIMING.flood.rainLead);
    }
    // No surge in a river flood.
    for (const tile of flood.field.tiles.values()) expect(tile.surgePeak).toBe(0);
  });

  it("backs the surge up the river in the finale, strongest at the mouth", () => {
    expect(compound.field.landfall).toBe(STORM_TIMING.compound.landfall);
    const river = [...compound.field.tiles.values()].filter((t) => t.terrainId === "river" && t.backwaterPeak > 0);
    expect(river.length).toBeGreaterThan(0);
    const seaSurge = Math.max(...[...compound.field.tiles.values()].filter((t) => t.terrainId === "coast").map((t) => t.surgePeak));
    for (const tile of river) expect(tile.backwaterPeak).toBeCloseTo(seaSurge * STORM_TIMING.compound.backwaterScale * backwaterShare(tile.riverIndex!, compound.field.mouthIndex), 9);
    expect(backwaterShare(compound.field.mouthIndex, compound.field.mouthIndex)).toBe(1);
    expect(backwaterShare(compound.field.mouthIndex / 2, compound.field.mouthIndex)).toBeCloseTo(Math.pow(0.5, 1.6), 9);
    // The surge meets the swollen river between about 12 s and 28 s.
    const meets = river.filter((t) => t.floodPeak > 0).map((t) => Math.max(t.floodArrival, t.backwaterArrival));
    expect(Math.min(...meets)).toBeGreaterThanOrEqual(11);
    expect(Math.min(...meets)).toBeLessThanOrEqual(28);
  });

  it("only cyclones and the finale have a landfall; a flood has none", () => {
    expect(flood.field.landfall).toBeNull();
    for (const record of records) {
      for (const tile of record.field.tiles.values()) {
        const at = arrivalTime(record.field, tile.key);
        if (at !== null) expect(at).toBeLessThan(record.field.duration);
      }
    }
  });
});

describe("the storm script marks only what the resolution decided", () => {
  for (const preset of PRESETS) {
    it(`${preset}: houses, defences and lightning`, () => {
      const run = newRun("s7", BOT_LEVELS[preset]);
      for (let i = 0; i < 3; i++) {
        const before = new Map([...run.state.elements].map(([key, inst]) => [key, inst.elementId]));
        const plant: [string, string][] = i === 0 ? [["z1", "dune"], ["z1", "sandy_vegetation"]] : i === 1 ? [["z2", "khazan"], ["z3", "mangrove"]] : [["z4", "mangrove"]];
        const record = nextStorm(run, plant);
        const defences = new Map(before);
        for (const [key, inst] of run.state.elements) if (!defences.has(key)) defences.set(key, inst.elementId);
        for (const zone of record.outcome.zones) for (const key of zone.failed) if (!defences.has(key)) defences.set(key, "seawall");
        const script = buildStormScript(record, defences);
        const houseEvents = script.events.filter((e) => e.type === "house").map((e) => (e as { key: string }).key);
        expect(houseEvents.sort()).toEqual([...record.outcome.damagedHouses].sort());
        for (const event of script.events) {
          if (event.type === "defence") expect(defences.has(event.key)).toBe(true);
          expect(event.t).toBeGreaterThanOrEqual(0);
          expect(event.t).toBeLessThanOrEqual(script.duration);
        }
        const firsts = script.events.filter((e) => e.type === "defence" && e.first);
        expect(firsts.length).toBe(script.firstContact === null ? 0 : 1);
        const strikes = script.events.filter((e) => e.type === "lightning").map((e) => e.t);
        if (record.kind === "flood") expect(strikes.length).toBe(0);
        for (let k = 1; k < strikes.length; k++) expect(strikes[k] - strikes[k - 1]).toBeGreaterThanOrEqual(LIGHTNING_GAP);
      }
    });
  }
});
