import type { LevelDef } from "./levels";
import type { GameMap } from "./levelMap";
import type { StartingElementSeed } from "@core/gameState";
import { axialKey, neighbor } from "@core/hex";
import type { HouseRule } from "@core/zones";
import { townLayout } from "./townLayout";

/** Panjim's settlement: houses pre-built across the land, and how much they count. */
export interface HouseFill {
  /**
   * Pre-build the town: a House on every building plot of the town plan
   * (levels/townLayout.ts), which leaves road tiles, gardens and monuments
   * empty.
   */
  fillLand: boolean;
  /**
   * The whole town's money, food and population add up to this many houses'
   * worth (each House's effects are scaled by houses / count), so the economy
   * stays where it was tuned however many plots the plan holds.
   */
  houseEconomyHouses: number;
  /** Elements the player cannot build on this level (House, once the land is full). */
  excludeFromBuild: string[];
  /** Coast tiles further than this many hexes from any non-coast tile are open sea and cannot be built on. */
  coastBuildRange?: number;
  /** How a house stands up to a storm, house by house (core/zones.ts `HouseRule`). */
  rule?: HouseRule;
}

/** Elements whose only purpose is money: hidden from the build menu while a level's economy is off. */
export const MONEY_ONLY = ["beachside_resort", "yacht"] as const;

export interface BoardSetup {
  startingElements: StartingElementSeed[];
  effectScale: Map<string, number>;
  excluded: Set<string>;
  unbuildable: Set<string>;
}

/**
 * What a level does to its board before play: the pre-built houses, the
 * house economy scale, what may not be built, and which far-sea tiles are
 * out of bounds. One function, used by the session and the bots alike.
 */
export function boardSetup(level: LevelDef, map: GameMap): BoardSetup {
  const fill = level.houses;
  const setup: BoardSetup = { startingElements: [], effectScale: new Map(), excluded: new Set(), unbuildable: new Set() };
  if (!fill) return setup;
  if (fill.fillLand) {
    const town = townLayout(map, level.id);
    for (const tile of map.tiles) {
      if (town.buildings.has(axialKey(tile.coord))) setup.startingElements.push({ coord: tile.coord, elementId: "house" });
    }
  }
  // Only the houses that are part of the game share the town's economy (the north bank and the east edge are scenery).
  const scenery = new Set(map.unplayable.map(([q, r]) => `${q},${r}`));
  const counted = setup.startingElements.filter((seed) => !scenery.has(axialKey(seed.coord))).length;
  setup.effectScale.set("house", fill.houseEconomyHouses / Math.max(1, counted));
  for (const id of fill.excludeFromBuild) setup.excluded.add(id);
  // With the economy off, the things that only earn money have no place in the build menu (Section 12).
  if (level.economy && !level.economy.enabled) for (const id of MONEY_ONLY) setup.excluded.add(id);
  if (fill.coastBuildRange !== undefined) {
    // Distance from the nearest non-coast tile, walked over the coast only.
    const terrain = new Map(map.tiles.map((tile) => [axialKey(tile.coord), tile.terrainId]));
    const distance = new Map<string, number>();
    const queue: string[] = [];
    for (const [key, id] of terrain) {
      if (id !== "coast") {
        distance.set(key, 0);
        queue.push(key);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i];
      const [q, r] = key.split(",").map(Number);
      for (let dir = 0; dir < 6; dir++) {
        const next = axialKey(neighbor({ q, r }, dir));
        if (!terrain.has(next) || distance.has(next)) continue;
        distance.set(next, distance.get(key)! + 1);
        queue.push(next);
      }
    }
    for (const [key, id] of terrain) {
      if (id === "coast" && (distance.get(key) ?? Infinity) > fill.coastBuildRange) setup.unbuildable.add(key);
    }
  }
  return setup;
}
