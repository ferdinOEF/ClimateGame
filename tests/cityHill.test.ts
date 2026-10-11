import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as THREE from "three";
import panajiFile from "../src/data/maps/panaji.json";
import facts from "../src/data/facts.json";
import { mapById } from "../src/levels/levelMap";
import { townLayout } from "../src/levels/townLayout";
import { axialDistance, axialKey } from "../src/core/hex";
import { nearestHouse } from "../src/levels/townLayout";
import { RELIEF, contoursBetween, reliefLift } from "../src/core/relief";
import { buildingGeometry } from "../src/render/townGeometry";
import { createMonumentGeometryFor, monumentGeometryKey, MONUMENT_BUILDING_KINDS } from "../src/render/monumentGeometry";
import { monumentRatios, monumentScale } from "../src/render/monumentScale";

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
  it("every tile's position and terrain is byte-for-byte the board before Section 3", () => {
    // sha256 of [[q, r, terrainId], ...] from panaji.json at e728e90 (before elevation was added).
    const tiles = (panajiFile as { tiles: { q: number; r: number; terrainId: string }[] }).tiles.map((t) => [t.q, t.r, t.terrainId]);
    expect(createHash("sha256").update(JSON.stringify(tiles)).digest("hex")).toBe("e98ea0f38cc5cad9252a83fb419880cf433ba90e43825b1832e4601db1b4e3db");
  });
});

describe("elevation from the DEM", () => {
  it("is on land tiles only, and on every one of them", () => {
    for (const tile of panaji.tiles) {
      if (tile.terrainId === "land") expect(tile.elevationM).toBeTypeOf("number");
      else expect(tile.elevationM).toBeUndefined();
    }
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

  it("sizes each building against the largest House next to it: footprint 1.5-1.7x, height 1.3-1.8x", () => {
    const rows: string[] = [];
    for (const m of panaji.monuments.filter((x) => MONUMENT_BUILDING_KINDS.includes(x.kind))) {
      let neighbour: { w: number; d: number; h: number } | null = null;
      for (const plot of nearestHouse(town, { q: m.q, r: m.r })) {
        const size = sizeOf(buildingGeometry(plot.kind), plot.scale);
        if (!neighbour || size.w * size.d * size.h > neighbour.w * neighbour.d * neighbour.h) neighbour = size;
      }
      expect(neighbour, `${m.name} has a House beside it`).not.toBeNull();
      const size = sizeOf(createMonumentGeometryFor(m.id, m.kind));
      const scale = monumentScale(size, neighbour!);
      const ratios = monumentRatios(size, neighbour!, scale);
      rows.push(`${m.name}: footprint ${ratios.footprint.toFixed(2)}x, height ${ratios.height.toFixed(2)}x`);
      expect(ratios.footprint, m.name).toBeGreaterThanOrEqual(1.5);
      expect(ratios.footprint, m.name).toBeLessThanOrEqual(1.7);
      expect(ratios.height, m.name).toBeGreaterThanOrEqual(1.3);
      expect(ratios.height, m.name).toBeLessThanOrEqual(1.8);
      // And it stays inside its hex.
      expect(Math.hypot(size.w, size.d) * scale.sx / 2).toBeLessThan(0.866);
    }
    console.log(rows.join("\n"));
  });

  it("gives every civic building its own geometry", () => {
    const civic = panaji.monuments.filter((m) => m.kind === "institution");
    const keys = new Set(civic.map((m) => monumentGeometryKey(m.id, m.kind)));
    expect(keys.size).toBe(civic.length);
    const shapes = new Set(civic.map((m) => createHash("sha256").update(Buffer.from((createMonumentGeometryFor(m.id, m.kind).getAttribute("position").array as Float32Array).buffer)).digest("hex")));
    expect(shapes.size).toBe(civic.length);
  });

  it("shows no date that is not in a cited fact", () => {
    const cited = JSON.stringify(facts);
    for (const m of panaji.monuments) {
      for (const year of `${m.name} ${m.category}`.match(/\b1\d{3}s?\b|\b20\d{2}\b/g) ?? []) {
        expect(cited.includes(year), `${m.name}: "${year}" is not in facts.json`).toBe(true);
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
