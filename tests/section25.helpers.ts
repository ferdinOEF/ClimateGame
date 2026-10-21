import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { computeWater, LANDFALL_ZONE } from "../src/core/hazardModel";
import { computeCombos } from "../src/core/combos";
import { shelterOf } from "../src/core/climate";
import { axialKey, neighbors } from "../src/core/hex";
import type { GameState } from "../src/core/gameState";

/** Section 25.1's measuring tools, shared by tests/section25.test.ts and its tuning. */
export const run = newRun("section25", BOT_LEVEL);
export const [cyclone, flood, compound] = run.schedule;
export const landfallTiles = run.zones!.keys(LANDFALL_ZONE);

export function depths(state: GameState, storm: (typeof run.schedule)[number]): Map<string, number> {
  return computeWater(state, { kind: storm.kind, strength: storm.strength, landfall: run.landfallOf(storm), sheltered: shelterOf(storm) }, { combos: computeCombos(state).bonus, landfallZoneTiles: landfallTiles }).depth;
}

export function place(state: GameState, key: string, elementId: string, extra: Partial<{ stormsSurvived: number }> = {}): void {
  state.elements.set(key, { elementId, builtOnTurn: 0, degradeAmount: 0, floodBufferFilled: 0, ...extra });
}

/** The land within two hexes of either tile: the tiles behind a pair. */
function behind(a: string, b: string): string[] {
  const out = new Set<string>();
  for (const key of [a, b]) {
    const [q, r] = key.split(",").map(Number);
    for (const n of neighbors({ q, r })) {
      out.add(axialKey(n));
      for (const m of neighbors(n)) out.add(axialKey(m));
    }
  }
  return [...out].filter((key) => run.state.placed.get(key)?.terrainId === "land" && key !== a && key !== b);
}

/**
 * For neighbouring pairs of `terrain` tiles the storm's water reaches: the water two of `pairId` take off the land
 * behind them, over what one `singleId` on the first of them takes off. (The elements are placed straight on the
 * tiles: this is the protection rule, not where each may be built.)
 */
export function pairRatios(storm: (typeof run.schedule)[number], terrain: string, pairId: string, singleId: string, count = 8): number[] {
  const bare = depths(run.state, storm);
  const ratios: number[] = [];
  for (const [key, tile] of run.state.placed) {
    if (ratios.length >= count) break;
    if (tile.terrainId !== terrain || run.state.elements.has(key) || run.state.isScenery(key) || !bare.has(key)) continue;
    const partner = neighbors(tile.coord).map(axialKey).find((n) => n > key && run.state.placed.get(n)?.terrainId === terrain && !run.state.elements.has(n) && bare.has(n));
    if (!partner) continue;
    const tiles = behind(key, partner).filter((k) => (bare.get(k) ?? 0) > 0);
    if (tiles.length < 3) continue;
    const one = run.state.clone();
    place(one, key, singleId);
    const two = run.state.clone();
    place(two, key, pairId);
    place(two, partner, pairId);
    const d1 = depths(one, storm);
    const d2 = depths(two, storm);
    const p1 = tiles.reduce((s, k) => s + (bare.get(k) ?? 0) - (d1.get(k) ?? 0), 0);
    const p2 = tiles.reduce((s, k) => s + (bare.get(k) ?? 0) - (d2.get(k) ?? 0), 0);
    if (p1 > 0.01) ratios.push(p2 / p1);
  }
  return ratios;
}


/** The four comparisons the test makes. */
export const CASES: [string, (typeof run.schedule)[number], string, string, string][] = [
  ["dune pair vs seawall, 2030", cyclone, "beach", "dune", "seawall"],
  ["dune pair vs seawall, 2050", compound, "beach", "dune", "seawall"],
  ["khazan pair vs dam, 2040", flood, "estuary", "khazan", "small_dam"],
  ["khazan pair vs dam, 2050", compound, "estuary", "khazan", "small_dam"]
];
