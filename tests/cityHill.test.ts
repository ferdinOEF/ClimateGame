import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as THREE from "three";
import panajiFile from "../src/data/maps/panaji.json";
import handEdits from "../tools/mapgen/panaji-hand-edits.json";
import facts from "../src/data/facts.json";
import { mapById } from "../src/levels/levelMap";
import { townLayout } from "../src/levels/townLayout";
import { axialDistance, axialKey } from "../src/core/hex";
import { nearestHouse } from "../src/levels/townLayout";
import { RELIEF, contoursBetween, reliefLift } from "../src/core/relief";
import { buildingGeometry } from "../src/render/townGeometry";
import { createMonumentGeometryFor, monumentGeometryKey, MONUMENT_BUILDING_KINDS } from "../src/render/monumentGeometry";
import { HEIGHT_RATIO, MAX_STRETCH, MIN_STRETCH, monumentRatios, monumentScale, planReach } from "../src/render/monumentScale";
import { LANDMARK_IDS } from "../src/render/landmarkModels";

/**
 * Section 3: Panjim as a city, Altinho as a hill.
 */
const panaji = mapById("panaji")!;
const elevation = new Map(panaji.tiles.map((t) => [axialKey(t.coord), t.elevationM]));
const terrain = new Map(panaji.tiles.map((t) => [axialKey(t.coord), t.terrainId]));
const locality = (name: string): string => {
  const l = panaji.localities.find((x) => x.name === name)!;
  return `${l.q},${l.r}`;
};

describe("the board's tiles are what they were", () => {
  it("every tile's position and terrain is byte-for-byte the board before Section 3, but for the owner's hand edits", () => {
    // sha256 of [[q, r, terrainId], ...] from panaji.json at e728e90 (before elevation was added).
    // Section 11: undo the hand edits (tools/mapgen/panaji-hand-edits.json) and the board must be exactly that one.
    // Section 16: the edits are applied in order, so a tile goes back to what its first edit found there.
    const undo = new Map<string, string>();
    for (const entry of handEdits.tiles) {
      const [q, r, change] = entry.split(",");
      if (!undo.has(`${q},${r}`)) undo.set(`${q},${r}`, change.split(">")[0]);
    }
    const tiles = (panajiFile as { tiles: { q: number; r: number; terrainId: string }[] }).tiles
      .filter((t) => undo.get(`${t.q},${t.r}`) !== "none")
      .map((t) => [t.q, t.r, undo.get(`${t.q},${t.r}`) ?? t.terrainId]);
    expect(createHash("sha256").update(JSON.stringify(tiles)).digest("hex")).toBe("e98ea0f38cc5cad9252a83fb419880cf433ba90e43825b1832e4601db1b4e3db");
  });
});

describe("elevation from the DEM", () => {
  it("is on every tile", () => {
    for (const tile of panaji.tiles) expect(tile.elevationM).toBeTypeOf("number");
    expect(panaji.elevation?.elevationSource).toBe("dem");
    expect(panaji.elevation?.licence).toMatch(/Copernicus/);
  });

  it("makes Altinho a hill over the old city and the low ground round it", () => {
    const altinho = elevation.get(locality("Altinho"))!;
    expect(altinho).toBeGreaterThan(30);
    for (const low of ["Campal", "Fontainhas", "Patto", "São Tomé"]) expect(elevation.get(locality(low))!).toBeLessThan(altinho / 3);
    // The summit is within two tiles of the name, over 40 m.
    const [q, r] = locality("Altinho").split(",").map(Number);
    const near = panaji.tiles.filter((t) => axialDistance(t.coord, { q, r }) <= 2).map((t) => t.elevationM ?? 0);
    expect(Math.max(...near)).toBeGreaterThan(40);
    // The khazan fields and creek margins (wetland) lie low: most within a few metres of the sea.
    const wet = panaji.tiles.filter((t) => t.terrainId === "estuary").map((t) => t.elevationM!).sort((a, b) => a - b);
    expect(wet[Math.floor(wet.length / 2)]).toBeLessThanOrEqual(5);
  });

  it("draws height as a capped lift, with contours every interval", () => {
    expect(reliefLift(undefined)).toBe(0);
    expect(reliefLift(0)).toBe(0);
    expect(reliefLift(10)).toBeCloseTo(10 * RELIEF.worldUnitsPerMetre);
    expect(reliefLift(1000)).toBe(RELIEF.maxLiftWorld);
    expect(contoursBetween(8, 12)).toBe(1);
    expect(contoursBetween(12, 18)).toBe(0);
    expect(contoursBetween(5, 42)).toBe(4);
  });
});

describe("monuments", () => {
  const town = townLayout(panaji, "l01-first-rains");
  const sizeOf = (g: THREE.BufferGeometry, s = 1): { w: number; d: number; h: number } => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    return { w: (b.max.x - b.min.x) * s, d: (b.max.z - b.min.z) * s, h: b.max.y * s };
  };

  // Section 18: each landmark has its own model and fills its hex; its height aims at twice the tallest House
  // beside it, capped so the model keeps its drawn proportions (see monumentScale.ts). The old rule (1.5-1.7x a
  // House's footprint, 1.3-1.8x its height) sized the generic blocks it replaced.
  it("fills each building's hex without leaving it, and stands up to about twice the tallest House beside it", () => {
    const rows: string[] = [];
    for (const m of panaji.monuments.filter((x) => MONUMENT_BUILDING_KINDS.includes(x.kind))) {
      let neighbour: { w: number; d: number; h: number } | null = null;
      for (const { plot } of nearestHouse(town, { q: m.q, r: m.r })) {
        const size = sizeOf(buildingGeometry(plot.kind), plot.scale);
        if (!neighbour || size.h > neighbour.h) neighbour = size;
      }
      expect(neighbour, `${m.name} has a House beside it`).not.toBeNull();
      const geometry = createMonumentGeometryFor(m.id, m.kind);
      const size = { ...sizeOf(geometry), reach: planReach(geometry.getAttribute("position").array) };
      const scale = monumentScale(size, neighbour!);
      const ratios = monumentRatios(size, neighbour!, scale);
      rows.push(`${m.name}: height ${ratios.height.toFixed(2)}x, reach ${ratios.reach.toFixed(2)}`);
      // Inside its hex (inner radius 0.866), whichever way it is turned, and filling most of it.
      expect(ratios.reach, m.name).toBeLessThan(0.866);
      expect(ratios.reach, m.name).toBeGreaterThan(0.75);
      // Never taller than about twice the tallest House, and never stretched or squashed out of its drawing.
      expect(ratios.height, m.name).toBeLessThanOrEqual(HEIGHT_RATIO + 0.05);
      expect(scale.sy / scale.sx, m.name).toBeGreaterThanOrEqual(MIN_STRETCH - 1e-9);
      expect(scale.sy / scale.sx, m.name).toBeLessThanOrEqual(MAX_STRETCH + 1e-9);
    }
    console.log(rows.join("\n"));
  });

  it("gives every landmark its own model", () => {
    const keys = new Set(panaji.monuments.map((m) => monumentGeometryKey(m.id, m.kind)));
    expect(keys.size).toBe(panaji.monuments.length);
    for (const m of panaji.monuments) expect(LANDMARK_IDS, m.name).toContain(m.id);
    const shapes = new Set(panaji.monuments.map((m) => createHash("sha256").update(Buffer.from((createMonumentGeometryFor(m.id, m.kind).getAttribute("position").array as Float32Array).buffer)).digest("hex")));
    expect(shapes.size).toBe(panaji.monuments.length);
  });

  it("shows no date that is not in a cited fact", () => {
    // A year may appear only if a cited fact about that very place carries it.
    const list = (facts as unknown as { facts?: unknown[] }).facts ?? (facts as unknown as unknown[]);
    const texts = (Array.isArray(list) ? list : []).map((f) => JSON.stringify(f));
    for (const m of panaji.monuments) {
      for (const year of `${m.name} ${m.category}`.match(/\b1\d{3}s?\b|\b20\d{2}\b/g) ?? []) {
        const backed = texts.some((t) => t.includes(m.name) && t.includes(year));
        expect(backed, `${m.name}: "${year}" is not in a cited fact about it`).toBe(true);
      }
    }
  });
});

describe("the city fabric", () => {
  it("never stands on anything but land", () => {
    const town = townLayout(panaji, "l01-first-rains");
    for (const key of town.buildings.keys()) expect(terrain.get(key)).toBe("land");
  });
});
