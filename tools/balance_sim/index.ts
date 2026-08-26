/**
 * STEP_PROMPT_balance_tuning_findings.md Section 5: a permanent balance-
 * testing harness, ported from the standalone sandbox script that produced
 * every finding in that document (Section 1's pacing retune, Section 2's
 * "every run mathematically ends at Resilience zero," Section 4's "Coin is
 * never the binding constraint"). Imports this repo's real, unmodified
 * `GameState`/`resolveMonsoonFlood`/`resolveCyclone` directly and mirrors
 * `main.ts`'s actual scheduling/severity formulas — a bot plays the real
 * 145-tile map across many seeded runs per configuration, so every number
 * this prints reflects what the live code does, not an estimate.
 *
 * Run via `npm run balance-sim` (plain `tsx`, not Vite) — this file uses
 * relative imports into `src/`, matching `tools/mapgen/generate.ts`'s own
 * convention, rather than the `@core/*`/`@data/*` path aliases `main.ts`
 * uses: those aliases are resolved by Vite's bundler, which nothing here
 * runs through. The original sandbox copy also had to rewrite its
 * `elements.ts` import to a relative path for the same underlying reason
 * (compiled standalone, outside any bundler) — inside this repo, with this
 * repo's own `tsx` invocation, `src/core/elements.ts`'s existing
 * `@data/*` import needs no such rewrite; nothing in this file touches it.
 */
import { GameState, type PlacedTile, type StartingElementSeed } from "../../src/core/gameState";
import { ELEMENT_BY_ID } from "../../src/core/elements";
import { resolveMonsoonFlood, resolveCyclone } from "../../src/core/hazard";

import mapData from "../../src/data/map.json";
import startingStateData from "../../src/data/startingState.json";

interface MapFile {
  tiles: { q: number; r: number; terrainId: string }[];
}
interface StartingStateFile {
  startingCoin: number;
  prebuiltHouses: { q: number; r: number }[];
}
const MAP = mapData as MapFile;
const STARTING = startingStateData as StartingStateFile;
const mapTiles: PlacedTile[] = MAP.tiles.map((t) => ({ coord: { q: t.q, r: t.r }, terrainId: t.terrainId }));
const startingElements: StartingElementSeed[] = STARTING.prebuiltHouses.map((c) => ({ coord: c, elementId: "house" }));

function mulberry32(seed: number) {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mirrors main.ts's own STORM_SURGE_COMPOUND_WINDOW_TURNS exactly — see
// that constant's own comment in src/main.ts for the reasoning.
const STORM_SURGE_COMPOUND_WINDOW_TURNS = 2;

interface RunParams {
  startingCoin: number;
  floodIntervalTurns: number;
  cycloneIntervalTurns: number;
  cycloneTelegraphTurns: number;
  severityBase: number;
  severitySpread: number;
  turnCap: number;
  botStrategy: "balanced" | "defense_first";
  label: string;
}

const TERRAIN_PRIORITY: Record<string, string[]> = {
  beach: ["seawall", "dune", "sandy_vegetation"],
  estuary: ["mangrove", "khazan", "beachside_resort"],
  river: ["small_dam", "sand_mining"],
  land: ["house"],
  // STEP_PROMPT_balance_tuning_findings.md Section 3: Coast now has a real
  // defense (Breakwater), not just the cosmetic Yacht — a defense-focused
  // bot should reach for it first, same as every other hazard-facing terrain.
  coast: ["breakwater", "yacht"]
};
const ESTUARY_ECONOMY_FRACTION = 0.3;
const RIVER_ECONOMY_FRACTION = 0.35;

function pickElementForTerrain(terrainId: string, rng: () => number): string | null {
  if (terrainId === "estuary") return rng() < ESTUARY_ECONOMY_FRACTION ? "beachside_resort" : rng() < 0.5 ? "mangrove" : "khazan";
  if (terrainId === "river") return rng() < RIVER_ECONOMY_FRACTION ? "sand_mining" : "small_dam";
  if (terrainId === "coast") return "yacht";
  const options = TERRAIN_PRIORITY[terrainId];
  return options ? options[0] : null;
}

function shuffle(arr: { q: number; r: number }[], rng: () => number): { q: number; r: number }[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeBot(state: GameState, rng: () => number, strategy: RunParams["botStrategy"]) {
  const hazardFacing = { beach: true, estuary: true, river: true, land: false, coast: true } as Record<string, boolean>;
  const allTiles = [...state.placed.values()].map((t) => t.coord);
  let tileOrder: { q: number; r: number }[];
  if (strategy === "defense_first") {
    const defenseTiles = allTiles.filter((c) => {
      const t = state.placed.get(`${c.q},${c.r}`)!;
      return hazardFacing[t.terrainId];
    });
    const restTiles = allTiles.filter((c) => {
      const t = state.placed.get(`${c.q},${c.r}`)!;
      return !hazardFacing[t.terrainId];
    });
    tileOrder = [...shuffle(defenseTiles, rng), ...shuffle(restTiles, rng)];
  } else {
    tileOrder = shuffle(allTiles, rng);
  }
  let yachtOrBreakwaterBuilt = false;
  return function chooseNextBuild(): { coord: { q: number; r: number }; elementId: string } | null {
    for (const coord of tileOrder) {
      const key = `${coord.q},${coord.r}`;
      if (state.elements.has(key)) continue;
      const tile = state.placed.get(key);
      if (!tile) continue;
      if (tile.terrainId === "coast") {
        // One Yacht is the savings-goal flavor; beyond that, Breakwater if defending, otherwise skip (matches the harness's original "one yacht, then move on" shape).
        if (!yachtOrBreakwaterBuilt) {
          const yachtCost = ELEMENT_BY_ID.get("yacht")!.buildCost;
          if (strategy === "defense_first") {
            yachtOrBreakwaterBuilt = true;
            return { coord, elementId: "breakwater" };
          }
          if (state.coin < yachtCost * 2) continue;
          yachtOrBreakwaterBuilt = true;
          return { coord, elementId: "yacht" };
        }
        if (strategy === "defense_first") return { coord, elementId: "breakwater" };
        continue;
      }
      const elementId = strategy === "defense_first" && tile.terrainId === "beach" ? "seawall" : pickElementForTerrain(tile.terrainId, rng);
      if (!elementId) continue;
      const def = ELEMENT_BY_ID.get(elementId)!;
      if (state.coin < def.buildCost) {
        const options = TERRAIN_PRIORITY[tile.terrainId] ?? [];
        const cheaper = options.find((id) => ELEMENT_BY_ID.get(id)!.buildCost <= state.coin);
        if (!cheaper) continue;
        return { coord, elementId: cheaper };
      }
      return { coord, elementId };
    }
    return null;
  };
}

interface RunResult {
  seed: number;
  turnsSurvived: number;
  stopCause: string;
  finalResilience: number;
  finalCoin: number;
  eventsCount: number;
  deathBySecondHazard: boolean;
}

function runOne(params: RunParams, seed: number): RunResult {
  const rng = mulberry32(seed);
  const state = new GameState(mapTiles, startingElements, params.startingCoin);
  const chooseNextBuild = makeBot(state, rng, params.botStrategy);
  let nextFloodAtTurn = params.floodIntervalTurns;
  let nextCycloneAtTurn = params.cycloneIntervalTurns;
  let lastStormSurgeResolvedTurn = -Infinity;
  const rolledSeverity = () => params.severityBase + rng() * params.severitySpread + state.severityBaseline;
  let eventsCount = 0;
  let stopCause = "turn_cap";

  while (true) {
    if (state.turn > params.turnCap) {
      stopCause = "turn_cap";
      break;
    }
    if (state.turn >= nextFloodAtTurn) {
      const severity = rolledSeverity();
      const cycloneTelegraphing = nextCycloneAtTurn - state.turn > 0 && nextCycloneAtTurn - state.turn <= params.cycloneTelegraphTurns;
      const stormSurgeActive = cycloneTelegraphing || state.turn - lastStormSurgeResolvedTurn <= STORM_SURGE_COMPOUND_WINDOW_TURNS;
      resolveMonsoonFlood(state, severity, stormSurgeActive);
      eventsCount++;
      nextFloodAtTurn = state.turn + params.floodIntervalTurns;
    }
    if (state.turn >= nextCycloneAtTurn) {
      const severity = rolledSeverity();
      resolveCyclone(state, severity);
      eventsCount++;
      lastStormSurgeResolvedTurn = state.turn;
      nextCycloneAtTurn = state.turn + params.cycloneIntervalTurns;
    }
    if (state.isEraOver) {
      stopCause = "resilience_zero";
      break;
    }
    const next = chooseNextBuild();
    if (!next) {
      stopCause = "build_exhausted";
      break;
    }
    state.build(next.coord, next.elementId);
  }

  return {
    seed,
    turnsSurvived: state.turn,
    stopCause,
    finalResilience: Math.round(state.resilience),
    finalCoin: Math.round(state.coin),
    eventsCount,
    deathBySecondHazard: stopCause === "resilience_zero" && eventsCount <= 3
  };
}

function summarize(label: string, results: RunResult[]): void {
  const n = results.length;
  const turns = results.map((r) => r.turnsSurvived).sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const causeCounts: Record<string, number> = {};
  for (const r of results) causeCounts[r.stopCause] = (causeCounts[r.stopCause] ?? 0) + 1;
  const events = results.map((r) => r.eventsCount);
  console.log(
    `${label.padEnd(60)} turns[min/median/max]=${turns[0]}/${turns[Math.floor(n / 2)]}/${turns[n - 1]}  mean=${mean(turns).toFixed(0)}  events[mean]=${mean(events).toFixed(1)}  causes=${JSON.stringify(causeCounts)}`
  );
}

function runBatch(params: RunParams, seeds: number): RunResult[] {
  const out: RunResult[] = [];
  for (let s = 1; s <= seeds; s++) out.push(runOne(params, s));
  return out;
}

/**
 * Reusable diagnostic (surfaced Section 2's "the map's own defendable
 * coverage is what actually kills every run" framing, and is what this
 * pass's own Section 3 decision — Breakwater — responds to): how much of
 * the Storm-Surge/Flood-exposed perimeter a bot has actually defended by
 * a given turn.
 */
export function coverageAtTurn(strategy: RunParams["botStrategy"], targetTurn: number, seed: number): { built: number; total: number } {
  const rng = mulberry32(seed);
  const state = new GameState(mapTiles, startingElements, STARTING.startingCoin);
  const chooseNextBuild = makeBot(state, rng, strategy);
  const exposed = [...state.placed.values()].filter((t) => t.terrainId === "coast" || t.terrainId === "estuary");
  while (state.turn < targetTurn) {
    const next = chooseNextBuild();
    if (!next) break;
    state.build(next.coord, next.elementId);
  }
  let built = 0;
  for (const t of exposed) if (state.elements.has(`${t.coord.q},${t.coord.r}`)) built++;
  return { built, total: exposed.length };
}

/** Reusable diagnostic that surfaced Section 4's "Coin is never the binding constraint" finding — final leftover Coin across many seeds at a given config. */
export function finalCoinStats(params: RunParams, seeds: number): { min: number; median: number; max: number } {
  const coins: number[] = [];
  for (let s = 1; s <= seeds; s++) coins.push(runOne(params, s).finalCoin);
  coins.sort((a, b) => a - b);
  return { min: coins[0], median: coins[Math.floor(coins.length / 2)], max: coins[coins.length - 1] };
}

function main(): void {
  const SEEDS = 40;
  // Matches the live, current main.ts constants after Section 1's retune
  // (FLOOD_INTERVAL_TURNS/CYCLONE_INTERVAL_TURNS/rolledSeverity's base) —
  // update this alongside those if they're ever nudged again from feel.
  const base: Omit<RunParams, "label"> = {
    startingCoin: STARTING.startingCoin,
    floodIntervalTurns: 45,
    cycloneIntervalTurns: 33,
    cycloneTelegraphTurns: 1,
    severityBase: 0.5,
    severitySpread: 0.6,
    turnCap: 250,
    botStrategy: "balanced"
  };
  summarize("balanced, current live config", runBatch({ ...base, label: "x" }, SEEDS));
  summarize("defense-first, current live config", runBatch({ ...base, botStrategy: "defense_first", label: "x" }, SEEDS));

  const coverage = coverageAtTurn("defense_first", 33, 1);
  console.log(`Coast+Estuary coverage by turn 33 (defense-first, seed 1): ${coverage.built}/${coverage.total}`);

  const coinStats = finalCoinStats({ ...base, label: "x" }, SEEDS);
  console.log(`Final Coin (balanced, ${SEEDS} seeds): min=${coinStats.min} median=${coinStats.median} max=${coinStats.max}`);
}

main();
