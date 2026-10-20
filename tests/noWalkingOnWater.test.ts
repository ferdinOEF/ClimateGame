import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AmbientLife } from "../src/render/ambientLife";
import { bridgeSpans, townLayout, walkerLinks, WALKABLE_TERRAIN } from "../src/levels/townLayout";
import { mapById } from "../src/levels/levelMap";
import { axialKey, axialToWorld, neighbors, worldToAxial } from "../src/core/hex";
import { TERRAIN_BY_ID } from "../src/core/terrain";
import levels from "../src/data/levels.json";

/**
 * Section 23b: nobody walks on water, no boat runs aground. Roads meet water
 * only as bridges (one water tile, road on dry ground at both ends); the
 * walkers follow only links on dry ground or across a drawn bridge; boats
 * circle inside open water.
 */
const map = mapById("panaji")!;
const terrain = new Map(map.tiles.map((t) => [axialKey(t.coord), t.terrainId]));
const terrainOf = (key: string): string | undefined => terrain.get(key);
const WATER = ["river", "estuary", "coast"];
const dry = (key: string): boolean => WALKABLE_TERRAIN.includes(terrain.get(key) ?? "");
const adjacent = (a: string, b: string): boolean => {
  const [q, r] = a.split(",").map(Number);
  return neighbors({ q, r }).some((n) => axialKey(n) === b);
};
// The Panjim level that pre-builds its town (the one the walkers appear in).
const panjimLevels = (levels as { id: string; mapId?: string; houses?: { fillLand?: boolean } }[]).filter((l) => l.mapId === "panaji" && l.houses?.fillLand);
const seed = panjimLevels[0]?.id ?? "l01-first-rains";
const town = townLayout(map, seed);
const spans = bridgeSpans(town, terrainOf);

describe("roads meet water only as bridges (the map)", () => {
  it("every bridge is one water tile with road on dry ground at two ends that are not beside each other", () => {
    expect(map.bridges.length).toBeGreaterThan(0);
    for (const [q, r] of map.bridges) {
      const key = `${q},${r}`;
      expect(WATER, key).toContain(terrain.get(key));
      const linked = map.roadLinks.flatMap(([a, b, c, d]) => (`${a},${b}` === key ? [`${c},${d}`] : `${c},${d}` === key ? [`${a},${b}`] : []));
      for (const other of linked) expect(terrain.get(other), `${key} to ${other}`).toBe("land");
      expect(linked.some((a, i) => linked.slice(i + 1).some((b) => !adjacent(a, b))), key).toBe(true);
    }
  });

  it("every road tile is land, and no road link has a water end that is not a bridge", () => {
    for (const [q, r] of map.roads) expect(terrain.get(`${q},${r}`)).toBe("land");
    const bridges = new Set(map.bridges.map(([q, r]) => `${q},${r}`));
    for (const [a, b, c, d] of map.roadLinks) {
      for (const key of [`${a},${b}`, `${c},${d}`]) if (terrain.get(key) !== "land") expect(bridges.has(key), key).toBe(true);
      expect(bridges.has(`${a},${b}`) && bridges.has(`${c},${d}`)).toBe(false);
    }
  });

  it("draws a deck on every bridge, and the walkers' links never end on water without one", () => {
    expect([...spans.keys()].sort()).toEqual([...town.bridges].sort());
    for (const [a, b] of walkerLinks(town, terrainOf)) {
      for (const [key, other] of [[a, b], [b, a]]) if (!dry(key)) expect(spans.get(key), `${a} to ${b}`).toContain(other);
    }
  });
});

function heightAt(coord: { q: number; r: number }): number {
  return TERRAIN_BY_ID.get(terrain.get(axialKey(coord)) ?? "")?.height ?? 0;
}

/** Runs the life for `hours` of simulated time at 10 frames a second, a storm now and then, calling `check` every frame. */
function run(life: AmbientLife, hours: number, check: () => void): void {
  const frames = hours * 3600 * 10;
  for (let f = 1; f <= frames; f++) {
    // A storm (walkers indoors, boats pulled in) for 2 minutes in every 20.
    if (f % 12000 === 0) life.setPaused(true);
    if (f % 12000 === 1200) life.setPaused(false);
    life.tick(f * 100);
    check();
  }
}

describe("walkers stay on land and bridges", () => {
  it("over three simulated hours, no walker is ever on water without a bridge", () => {
    const life = new AmbientLife(town, map.tiles, heightAt, TERRAIN_BY_ID.get("land")!.height, false, map.focus);
    const people = life.group.getObjectByName("ambient-people") as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const visited = new Set<string>();
    let onBridge = 0;
    const wet: string[] = [];
    run(life, 3, () => {
      for (let i = 0; i < people.count; i++) {
        people.getMatrixAt(i, matrix);
        at.setFromMatrixPosition(matrix);
        const key = axialKey(worldToAxial(at.x, at.z, 1));
        visited.add(key);
        if (dry(key)) continue;
        // On water: only on a drawn bridge, on its deck between the centre and a bank.
        const banks = spans.get(key);
        if (!banks) {
          wet.push(`walker ${i} on ${terrain.get(key) ?? "nothing"} at ${key}`);
          continue;
        }
        const c = axialToWorld(worldToAxial(at.x, at.z, 1), 1);
        const lateral = Math.min(
          ...banks.map((bank) => {
            const [q, r] = bank.split(",").map(Number);
            const e = axialToWorld({ q, r }, 1);
            const len = Math.hypot(e.x - c.x, e.z - c.z);
            return Math.abs(((at.x - c.x) * (e.z - c.z) - (at.z - c.z) * (e.x - c.x)) / len);
          })
        );
        if (lateral > 0.14) wet.push(`walker ${i} off the deck at ${key}`);
        onBridge++;
      }
    });
    expect(wet.slice(0, 5)).toEqual([]);
    // The run means something: the walkers covered the town, and crossed bridges.
    expect(people.count).toBeGreaterThan(10);
    expect(visited.size).toBeGreaterThan(40);
    expect(onBridge).toBeGreaterThan(0);
  }, 120_000);
});

describe("boats stay on water", () => {
  for (const [mapId, levelId] of [["panaji", seed], ["tutorial", "l00-tutorial"]]) {
    it(`over three simulated hours, no part of a boat is ever over land or a bridge (${mapId})`, () => {
      const boatMap = mapById(mapId)!;
      const ground = new Map(boatMap.tiles.map((t) => [axialKey(t.coord), t.terrainId]));
      const boatTown = townLayout(boatMap, levelId);
      const height = (coord: { q: number; r: number }): number => TERRAIN_BY_ID.get(ground.get(axialKey(coord)) ?? "")?.height ?? 0;
      const life = new AmbientLife(boatTown, boatMap.tiles, height, TERRAIN_BY_ID.get("land")!.height, false, boatMap.focus);
      const boats = life.group.getObjectByName("ambient-boats") as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4();
      // The hull's corners (boatGeometry, scaled 1.3): bow, stern and both beams.
      const hull = [new THREE.Vector3(0.24 * 1.3, 0, 0), new THREE.Vector3(-0.2 * 1.3, 0, 0), new THREE.Vector3(0, 0, 0.07 * 1.3), new THREE.Vector3(0, 0, -0.07 * 1.3)];
      const point = new THREE.Vector3();
      if (mapId === "panaji") expect(boats.count).toBeGreaterThan(0);
      const aground: string[] = [];
      run(life, 3, () => {
        for (let i = 0; i < boats.count; i++) {
          boats.getMatrixAt(i, matrix);
          for (const corner of hull) {
            point.copy(corner).applyMatrix4(matrix);
            const key = axialKey(worldToAxial(point.x, point.z, 1));
            const t = ground.get(key);
            if ((t !== "river" && t !== "coast") || boatTown.bridges.has(key)) aground.push(`boat ${i} over ${t ?? "nothing"}${boatTown.bridges.has(key) ? " (a bridge)" : ""} at ${key}`);
          }
        }
      });
      expect(aground.slice(0, 5)).toEqual([]);
    }, 120_000);
  }
});
