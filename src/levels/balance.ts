import type { LevelDef } from "./levels";
import type { GameMap } from "./levelMap";
import type { StartingElementSeed } from "@core/gameState";
import { axialKey, neighbor } from "@core/hex";
import type { HouseRule } from "@core/zones";

/**
 * Balance presets: named groups of difficulty settings, kept in levels.json.
 *
 * A level names its active preset (`balancePreset`) and lists the presets it
 * offers (`balancePresets`). Switching between "easy-test" and "strict" is
 * one value in the data. `applyBalance` folds the preset into the level
 * when the levels load, so the engine only ever sees plain numbers: a
 * starting Coin, an income scale, a challenge's severity. Nothing downstream
 * needs to know a preset exists.
 */
export interface BalancePreset {
  /** Multiplies every source of Coin: starting Coin, jar income, the jar's opening gift, Voice rewards. Never build costs. */
  coinMultiplier: number;
  /** Per-challenge severity scale, by challenge id. Missing ids are 1. */
  severityScale: Record<string, number>;
  /** Stars per storm from the share of houses in its path that were saved: at least `three` is 3 stars, at least `two` is 2, else 1. */
  houseStars: { three: number; two: number };
  /** Overrides the level's house rule: how much a house withstands before it is lost. */
  houseRule?: HouseRule;
}

/** Panjim's settlement: houses pre-built on every land tile, and how much they count. */
export interface HouseFill {
  /** Pre-build a House on every land tile without a monument. */
  fillLand: boolean;
  /** Scales every House effect (money, food, population), so hundreds of houses add up to about what ten did. */
  houseEconomyScale: number;
  /** Elements the player cannot build on this level (House, once the land is full). */
  excludeFromBuild: string[];
  /** Coast tiles further than this many hexes from any non-coast tile are open sea and cannot be built on. */
  coastBuildRange?: number;
  /** How a house stands up to a storm, house by house (core/zones.ts `HouseRule`). */
  rule?: HouseRule;
}

export function applyBalance(level: LevelDef, presetName: string | undefined = level.balancePreset): LevelDef {
  const preset = presetName ? level.balancePresets?.[presetName] : undefined;
  if (!preset) return level;
  const m = preset.coinMultiplier;
  return {
    ...level,
    balancePreset: presetName,
    startingCoin: level.startingCoin * m,
    timeline: level.timeline && {
      ...level.timeline,
      economy: level.timeline.economy && {
        ...level.timeline.economy,
        incomeScale: level.timeline.economy.incomeScale * m,
        jarStart: level.timeline.economy.jarStart * m,
        coinMultiplier: m
      }
    },
    climate: level.climate && {
      ...level.climate,
      challenges: level.climate.challenges.map((challenge) => ({
        ...challenge,
        severityScale: (challenge.severityScale ?? 1) * (preset.severityScale[challenge.id] ?? 1)
      }))
    },
    voices: level.voices?.map((voice) => ({ ...voice, reward: voice.reward * m })),
    houseStars: preset.houseStars,
    houses: level.houses && preset.houseRule ? { ...level.houses, rule: preset.houseRule } : level.houses
  };
}

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
  const monuments = new Set(map.monuments.map((m) => `${m.q},${m.r}`));
  if (fill.fillLand) {
    for (const tile of map.tiles) {
      if (tile.terrainId !== "land" || monuments.has(axialKey(tile.coord))) continue;
      setup.startingElements.push({ coord: tile.coord, elementId: "house" });
    }
  }
  setup.effectScale.set("house", fill.houseEconomyScale);
  for (const id of fill.excludeFromBuild) setup.excluded.add(id);
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
