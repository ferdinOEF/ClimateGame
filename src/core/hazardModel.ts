import MODEL_DATA from "@data/hazardModel.json";
import { axialDistance, axialKey, axialToWorld, neighbor } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ChallengeKind, WindOverride } from "./climate";

/**
 * The hazard model: where the water goes, tile by tile. Section 4.
 *
 * ONE SOURCE OF TRUTH
 *
 * Everything that says anything about a storm reads `computeWater`: the
 * resolver that decides which houses are lost (core/zones.ts), the warning
 * heat and the readiness gauge (core/exposure.ts, core/actionRun.ts), the
 * storm's animation (its depth field, core/stormRecord.ts), and the Aftermath.
 * There is no second implementation, so what the player is shown is what
 * happens.
 *
 * THE RULE
 *
 * Water has a level, in game metres, and stands on a tile where its level is
 * above the tile's real ground height (the DEM, Section 3). It spreads from
 * its sources hex by hex, losing height as it goes:
 *   - a cyclone's surge starts at its landfall site on the open coast and
 *     spreads along the sea, up the river and creeks (where it loses little,
 *     so it funnels far inland) and over sand and land (where it loses more);
 *   - a monsoon flood starts in the upper river and runs down the channels,
 *     out into the low wetland (khazan) fields and up the banks;
 *   - the compound storm does both, and the surge holds the river back at the
 *     mouth, so the flood backs up behind it.
 * Each tile keeps the highest level that reaches it. Because the ground
 * rises, high ground (Altinho) stays dry however hard the storm, and the low
 * wetland edges are the first to go.
 *
 * Defences take height off water entering their own tile, and some off water
 * entering the tiles next to them, scaled by how mature and how worn they
 * are. Engineered structures fail when the water on them is too deep, and
 * then do nothing; nature defences in water too deep for them still help,
 * less, and are worn.
 *
 * Every number lives in src/data/hazardModel.json and is a game rule, not a
 * measurement. Pure: no DOM, no renderer.
 */
export interface HazardModelConfig {
  surge: {
    baseM: number;
    perStrengthM: number;
    lossPerHex: { sea: number; channel: number; beach: number; land: number };
    /** A storm weaker than `refStrength` loses more per hex at sea and up the channels: × (refStrength / strength) ^ exponent. */
    weakStorm?: { refStrength: number; seaExponent: number; channelExponent: number };
  };
  flood: { baseM: number; perStrengthM: number; sourceShare: number; lossPerHex: { sea: number; channel: number; wetland: number; beach: number; land: number } };
  compound: { surgeShare: number; floodShare: number; backwaterShare: number; backwaterExponent: number };
  defence: {
    metresPerResilience: number;
    radiusHex: number;
    falloff: number[];
    stackCap: number;
    /** However many defences stand round a tile, together they hold back at most this much water there. */
    maxProtectionM: number;
    /** The ceiling where an engineered structure is among the defences (defaults to maxProtectionM). */
    engineeredMaxProtectionM?: number;
    pathShare: number;
    neighbourShare: number;
    comboMetresPerPoint: number;
    failDepthPerUnit: number;
    overwhelmDepthPerUnit: number;
  };
  houseLossDepthM: number;
  /** Cyclone wind (Section 12): see `windField`. Absent: no wind. */
  wind?: {
    /** Wind damage on the shore at landfall, game metres of water-equivalent per unit of storm strength. */
    perStrengthM: number;
    /** The share of the wind left after each hex inland from the open sea. */
    inlandKeep: number;
    /** The wind falls off evenly to nothing this many hexes from the landfall site. */
    landfallReachHex: number;
    /** Section 25.1: the share of the wind each kind takes out on every tile within `shelterReachHex` of it (pandanus only). */
    shelter: Record<string, number>;
    /** How far that shelter reaches, hexes, in every direction. */
    shelterReachHex: number;
    /** However much shelter stands round a tile, at least this share of the wind still gets through. */
    minKeep: number;
    /** Section 26.3: the compound storm's wind, as a share of a cyclone's at the same strength (absent: compound.surgeShare). */
    compoundShare?: number;
  };
}

export const HAZARD_MODEL: HazardModelConfig = MODEL_DATA as unknown as HazardModelConfig;

export type WaterHazard = "cyclone" | "flood";

interface BoardTile {
  key: string;
  terrainId: string;
  ground: number;
  neighbours: string[];
}

/** The board as the water sees it: terrain, ground height, neighbours, the river's order and the landfall sites. Fixed for a map. */
export interface WaterBoard {
  tiles: Map<string, BoardTile>;
  /** Channel (river and wetland) tiles: 0 at the farthest upstream point, `mouthIndex` at the sea. */
  riverIndex: Map<string, number>;
  mouthIndex: number;
  /** Open-sea tiles on the shore where a cyclone can come ashore, in order along the coast. */
  sites: string[];
  /** Hexes from the nearest open-sea tile (0 on the sea itself): how far inland the wind has come. */
  seaDistance: Map<string, number>;
  /**
   * Where the flood comes from when the level names it (`PlacedTile.floodSource`,
   * Section 16.5), with each channel tile's distance from it along the
   * channels; null on a map without one, where `floodSources` falls back to
   * the farthest stretch of river from the sea.
   */
  floodSource: { keys: string[]; distance: Map<string, number> } | null;
}

const CHANNEL = new Set(["river", "estuary"]);

/** The zone of open coast cyclones come in on (the Miramar to Dona Paula beach). */
export const LANDFALL_ZONE = "z1";

const boards = new WeakMap<object, Map<string, WaterBoard>>();

/**
 * The water board for a game state's map. Terrain never changes in play, so
 * it is worked out once per map and landfall coast. The cache is keyed by
 * the map's first tile object, which `GameState.clone()` shares, so every
 * preview copy of a board reuses it.
 */
export function waterBoard(state: GameState, landfallZoneTiles?: readonly string[]): WaterBoard {
  const first = state.placed.values().next().value as object | undefined;
  const coastKey = landfallZoneTiles ? [...landfallZoneTiles].sort().join(";") : "";
  const perMap = first ? boards.get(first) : undefined;
  const cached = perMap?.get(coastKey);
  if (cached) return cached;
  const tiles = new Map<string, BoardTile>();
  for (const [key, tile] of state.placed) {
    // Section 30.1: a dry tile is outside the storms: not in the water graph, so no water reaches or passes through it.
    if (tile.dry) continue;
    tiles.set(key, { key, terrainId: tile.terrainId, ground: tile.terrainId === "coast" ? 0 : Math.max(0, tile.elevationM ?? 0), neighbours: [] });
  }
  for (const tile of tiles.values()) {
    const [q, r] = tile.key.split(",").map(Number);
    for (let dir = 0; dir < 6; dir++) {
      const n = axialKey(neighbor({ q, r }, dir));
      if (tiles.has(n)) tile.neighbours.push(n);
    }
  }
  // The river from the sea: the mouth is a channel tile beside open sea.
  const fromMouth = new Map<string, number>();
  const queue: string[] = [];
  for (const tile of tiles.values()) {
    if (tile.terrainId !== "river") continue;
    if (tile.neighbours.some((n) => tiles.get(n)!.terrainId === "coast")) {
      fromMouth.set(tile.key, 0);
      queue.push(tile.key);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const n of tiles.get(queue[i])!.neighbours) {
      if (fromMouth.has(n) || !CHANNEL.has(tiles.get(n)!.terrainId)) continue;
      fromMouth.set(n, fromMouth.get(queue[i])! + 1);
      queue.push(n);
    }
  }
  let mouthIndex = 0;
  for (const d of fromMouth.values()) mouthIndex = Math.max(mouthIndex, d);
  const riverIndex = new Map<string, number>();
  for (const [key, d] of fromMouth) riverIndex.set(key, mouthIndex - d);

  // Landfall sites: open sea beside the shore, on the landfall coast when the map names one.
  const onCoast = landfallZoneTiles ? new Set(landfallZoneTiles) : null;
  const sites = [...tiles.values()]
    .filter((tile) => tile.terrainId === "coast" && tile.neighbours.some((n) => ["beach", "land"].includes(tiles.get(n)!.terrainId)))
    .filter((tile) => !onCoast || onCoast.has(tile.key) || tile.neighbours.some((n) => onCoast.has(n)))
    .map((tile) => tile.key);
  // How far inland each tile is, in hexes from the open sea, for the wind.
  const seaDistance = new Map<string, number>();
  const seaQueue: string[] = [];
  for (const tile of tiles.values()) {
    if (tile.terrainId !== "coast") continue;
    seaDistance.set(tile.key, 0);
    seaQueue.push(tile.key);
  }
  for (let i = 0; i < seaQueue.length; i++) {
    for (const n of tiles.get(seaQueue[i])!.neighbours) {
      if (seaDistance.has(n)) continue;
      seaDistance.set(n, seaDistance.get(seaQueue[i])! + 1);
      seaQueue.push(n);
    }
  }
  // The flood's source, when the level names it: its river tiles, and hexes from them along the channels.
  const sourceKeys = [...state.placed].filter(([key, tile]) => tile.floodSource && tiles.get(key)?.terrainId === "river").map(([key]) => key).sort();
  let floodSource: WaterBoard["floodSource"] = null;
  if (sourceKeys.length > 0) {
    const distance = new Map(sourceKeys.map((key) => [key, 0]));
    const channelQueue = [...sourceKeys];
    for (let i = 0; i < channelQueue.length; i++) {
      for (const n of tiles.get(channelQueue[i])!.neighbours) {
        if (distance.has(n) || !CHANNEL.has(tiles.get(n)!.terrainId)) continue;
        distance.set(n, distance.get(channelQueue[i])! + 1);
        channelQueue.push(n);
      }
    }
    floodSource = { keys: sourceKeys, distance };
  }
  const board: WaterBoard = { tiles, riverIndex, mouthIndex, sites: alongTheCoast(sites), seaDistance, floodSource };
  if (first) {
    const map = boards.get(first) ?? new Map<string, WaterBoard>();
    map.set(coastKey, board);
    boards.set(first, map);
  }
  return board;
}

/**
 * Orders landfall sites along the shore: from the northernmost, each next
 * site is the nearest one not yet taken (ties to the north, then the west).
 * So one site along the list is one short step along the coast, and a
 * forecast cone is one stretch of sea, not scattered patches.
 */
function alongTheCoast(keys: string[]): string[] {
  const coords = keys.map((key) => {
    const [q, r] = key.split(",").map(Number);
    return { key, q, r };
  });
  const before = (a: { q: number; r: number }, b: { q: number; r: number }): number => a.r - b.r || a.q - b.q;
  const distance = (a: { q: number; r: number }, b: { q: number; r: number }): number => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const left = [...coords].sort(before);
  const out: string[] = [];
  let at = left.shift();
  while (at) {
    out.push(at.key);
    let best = -1;
    for (let i = 0; i < left.length; i++) {
      if (best < 0 || distance(at, left[i]) < distance(at, left[best]) || (distance(at, left[i]) === distance(at, left[best]) && before(left[i], left[best]) < 0)) best = i;
    }
    at = best >= 0 ? left.splice(best, 1)[0] : undefined;
  }
  return out;
}

/**
 * The river tiles a monsoon flood starts from: the level's own source when it
 * names one (Section 16.5), else the upstream part of the river (`riverIndex`
 * up to `sourceShare` of the mouth index), the rule every other map uses.
 */
export function floodSources(board: WaterBoard, config: HazardModelConfig = HAZARD_MODEL): string[] {
  if (board.floodSource) return board.floodSource.keys;
  const upstream = config.flood.sourceShare * board.mouthIndex;
  return [...board.riverIndex].filter(([key, index]) => board.tiles.get(key)!.terrainId === "river" && index <= upstream).map(([key]) => key);
}

/**
 * The way the flood's water comes to each tile, with nothing built (Section
 * 16.5): the same spread from the same sources as `computeWater`, keeping for
 * each wet tile the tile its highest water came from. `routeTo` reads a path
 * off it. For the forecast's track, so the line drawn is the water's own.
 */
export function floodRoutes(board: WaterBoard, storm: Pick<StormInput, "kind" | "strength">, config: HazardModelConfig = HAZARD_MODEL): Map<string, string | null> {
  const loss = floodLoss(config);
  const start = (config.flood.baseM + config.flood.perStrengthM * storm.strength) * (storm.kind === "compound" ? config.compound.floodShare : 1);
  const from = new Map<string, string | null>();
  const settled = new Set<string>();
  const heap = new LevelHeap();
  const via = new Map<string, string | null>();
  for (const key of floodSources(board, config)) {
    heap.push(start, key);
    via.set(key, null);
  }
  const best = new Map<string, number>();
  while (heap.size > 0) {
    const { level: l, key } = heap.pop();
    if (settled.has(key) || l < (best.get(key) ?? -Infinity)) continue;
    const tile = board.tiles.get(key)!;
    if (l <= tile.ground) continue;
    settled.add(key);
    from.set(key, via.get(key) ?? null);
    for (const n of tile.neighbours) {
      if (settled.has(n)) continue;
      const next = board.tiles.get(n)!;
      const nl = l - Math.max(0, loss(next));
      if (nl > next.ground && nl > (best.get(n) ?? -Infinity)) {
        best.set(n, nl);
        via.set(n, key);
        heap.push(nl, n);
      }
    }
  }
  return from;
}

/** The path from a flood source to `target` through `routes` (`floodRoutes`), source first; empty if the water never reaches it. */
export function routeTo(routes: ReadonlyMap<string, string | null>, target: string): string[] {
  if (!routes.has(target)) return [];
  const path: string[] = [];
  for (let at: string | null = target; at !== null; at = routes.get(at) ?? null) path.unshift(at);
  return path;
}

/** The site index a forecast centre (0-1 along the coast) points at. */
export function siteAt(board: WaterBoard, fraction: number): number {
  return Math.max(0, Math.min(board.sites.length - 1, Math.round(fraction * (board.sites.length - 1))));
}

/**
 * Where a storm comes ashore: the landfall site at its `landfall` tile ("q,r",
 * fixed in the level data), or the nearest landfall site to it if the tile is
 * not one; the middle of the coast if it names none. Fixed: no seed moves it.
 */
export function landfallSite(board: WaterBoard, challenge: { landfall?: string }): number {
  if (!challenge.landfall) return siteAt(board, 0.5);
  const exact = board.sites.indexOf(challenge.landfall);
  if (exact >= 0) return exact;
  const [q, r] = challenge.landfall.split(",").map(Number);
  let best = 0;
  let bestDistance = Infinity;
  board.sites.forEach((key, i) => {
    const [sq, sr] = key.split(",").map(Number);
    const distance = (Math.abs(sq - q) + Math.abs(sr - r) + Math.abs(sq + sr - q - r)) / 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}

/** What a storm is: its kind, its strength (the level's 1-3 scale), and for a cyclone where it comes ashore. */
export interface StormInput {
  kind: ChallengeKind;
  strength: number;
  /** Index into `board.sites`. Required for a cyclone or compound storm. */
  landfall: number | null;
  /**
   * Tiles this storm never reaches (Section 23.1, a game rule: the sheltered
   * middle of Taleigao in the 2050 storm). No water or wind on them; the water
   * elsewhere is worked out as if they were not sheltered.
   */
  sheltered?: ReadonlySet<string>;
  /** Section 26.3: the storm's own wind numbers (the 2030 and 2050 storms), over the model's. */
  wind?: WindOverride;
  /**
   * Section 26.1: the turn the storm lands on (the board's `turn` when it resolves). Defences' ages are counted to
   * it, so a preview made years before sees them as old as they will be. Defaults to the board's own turn.
   */
  turn?: number;
}

export interface WaterField {
  /** Peak water depth above the ground, game metres, on every wet tile. */
  depth: Map<string, number>;
  /** The surge's depth and the flood's depth separately (for the animation's two kinds of water). */
  surge: Map<string, number>;
  flood: Map<string, number>;
  /** The cyclone's wind on every tile it reaches, game metres of water-equivalent damage (`windField`); empty for a flood. Never drawn as water. */
  wind: Map<string, number>;
  /** Engineered structures that failed (coord keys). */
  failed: string[];
  /** Nature defences overwhelmed and worn (coord keys). */
  overwhelmed: string[];
  /** Section 25.1: defences with a storm count (seawall, small dam) that came through this storm, to be counted. */
  survived?: string[];
  /** Section 26.1: defences broken by age by the storm's turn (breakwaters 10 years old): no protection, marked broken. */
  aged?: string[];
  /** The surge's level where it came ashore, and the flood's level at its source, game metres. */
  surgeLevel: number;
  floodLevel: number;
}

/** A defence's protection now, in game metres, against `hazard`: resilience × metres-per-point × maturity × wear. Negative for things that weaken the shore. */
export function defenceMetres(state: GameState, key: string, hazard: WaterHazard, config: HazardModelConfig = HAZARD_MODEL): number {
  const inst = state.elements.get(key);
  // Section 25.1: a broken seawall or dam protects nothing.
  if (!inst || inst.broken) return 0;
  const def = ELEMENT_BY_ID.get(inst.elementId);
  if (!def) return 0;
  const value = def.effects.resilience ?? 0;
  if (value === 0) return 0;
  if (value > 0 && !def.targetsHazards?.includes(hazard)) return 0;
  const scale = value > 0 ? state.maturityFraction(inst, def) * Math.max(0, 1 - inst.degradeAmount) : 1;
  return value * scale * config.defence.metresPerResilience;
}

/** Each defence's own protection now against `hazard`, game metres (combo bonus included, failures skipped, overwhelmed weakened). */
export function ownMetres(state: GameState, hazard: WaterHazard, skip: ReadonlySet<string>, weaken: ReadonlyMap<string, number>, combos: ReadonlyMap<string, number> | undefined, config: HazardModelConfig): Map<string, number> {
  const own = new Map<string, number>();
  for (const key of state.elements.keys()) {
    if (skip.has(key)) continue;
    let m = defenceMetres(state, key, hazard, config);
    if (m > 0 && combos?.has(key)) m += (combos.get(key) ?? 0) * config.defence.comboMetresPerPoint;
    if (m === 0) continue;
    own.set(key, m * (weaken.get(key) ?? 1));
  }
  return own;
}

/**
 * Drag on water passing through a defended tile and its neighbours:
 * `pathShare` of a defence's metres on its own tile, `neighbourShare` of
 * that next door. Like the area protection, only the strongest defence of
 * each kind counts on a tile. Drag slows the water as it crosses defended
 * ground, on top of the area protection's ceiling; it is what lets a line of
 * defences, not one, hold back a long run of surge.
 */
function pathDrag(board: WaterBoard, own: Map<string, number>, config: HazardModelConfig, kindOf: (key: string) => string): Map<string, number> {
  const byKind = new Map<string, Map<string, KindStack>>();
  const add = (tile: string, kind: string, m: number, from: string): void => {
    const kinds = byKind.get(tile) ?? new Map<string, KindStack>();
    kinds.set(kind, stackInto(kinds.get(kind), m, from));
    byKind.set(tile, kinds);
  };
  // Negative ones (sand mining, a resort) let water through more easily, and each adds its harm.
  const harm = new Map<string, number>();
  for (const [key, m] of own) {
    const drag = m * config.defence.pathShare;
    if (m < 0) {
      harm.set(key, (harm.get(key) ?? 0) + drag);
      for (const n of board.tiles.get(key)?.neighbours ?? []) harm.set(n, (harm.get(n) ?? 0) + drag * config.defence.neighbourShare);
      continue;
    }
    const kind = kindOf(key);
    add(key, kind, drag, key);
    for (const n of board.tiles.get(key)?.neighbours ?? []) add(n, kind, drag * config.defence.neighbourShare, key);
  }
  const out = new Map<string, number>(harm);
  const adjacent = neighboursOn(board);
  for (const [tile, kinds] of byKind) out.set(tile, (out.get(tile) ?? 0) + [...kinds].reduce((a, [kind, stack]) => a + kindValue(kind, stack, adjacent).value, 0));
  return out;
}

/** A kind's contributions on one tile: how much each of its defences gives there, and where that defence stands. */
type KindStack = { m: number; from: string }[];

function stackInto(stack: KindStack | undefined, m: number, from: string): KindStack {
  const out = stack ?? [];
  out.push({ m, from });
  return out;
}

/**
 * What a kind holds back on a tile: its strongest defence there, and for a kind that pairs (Section 25.1, a game rule:
 * two dunes side by side protect as much as one seawall, two khazans as much as one small dam) the best two of it that
 * stand side by side, added up, where that is more. `paired` says whether a pair gave it.
 */
function kindValue(kind: string, stack: KindStack, adjacent: (a: string, b: string) => boolean): { value: number; paired: boolean } {
  const single = Math.max(...stack.map((e) => e.m));
  if (!ELEMENT_BY_ID.get(kind)?.pairsLike || stack.length < 2) return { value: single, paired: false };
  let pair = 0;
  for (let i = 0; i < stack.length; i++) for (let j = i + 1; j < stack.length; j++) if (adjacent(stack[i].from, stack[j].from)) pair = Math.max(pair, stack[i].m + stack[j].m);
  return pair > single ? { value: pair, paired: true } : { value: single, paired: false };
}

/** Whether a kind's value on a tile counts as an engineered structure's for the ceiling: an engineered one, or a pair standing in for one. */
function engineeredLike(kind: string, paired: boolean): boolean {
  const def = ELEMENT_BY_ID.get(kind);
  if (def?.category === "engineered") return true;
  return paired && !!def?.pairsLike && ELEMENT_BY_ID.get(def.pairsLike)?.category === "engineered";
}

/** Whether two tiles are neighbours on the board. */
function neighboursOn(board: WaterBoard): (a: string, b: string) => boolean {
  return (a, b) => board.tiles.get(a)?.neighbours.includes(b) ?? false;
}

/**
 * How much lower water stands on each tile because of the defences round it:
 * each protects tiles within `radiusHex`, by its metres × `falloff[distance]`
 * (negative ones — sand mining — make it stand higher). On a tile only the
 * strongest defence of each kind counts, and different kinds add up (layered
 * defence: a dune line and a mangrove belt behind it do more than either
 * twice over), to at most `stackCap` × the strongest single one, and never
 * more than `maxProtectionM`. `kindOf` names a defence's kind; without it
 * every defence is its own kind.
 */
export function areaProtection(board: WaterBoard, own: Map<string, number>, config: HazardModelConfig = HAZARD_MODEL, kindOf: (key: string) => string = (key) => key): Map<string, number> {
  const best = new Map<string, Map<string, KindStack>>();
  const harm = new Map<string, number>();
  const { radiusHex, falloff, stackCap } = config.defence;
  for (const [key, m] of own) {
    const kind = kindOf(key);
    // Rings outward from the defence.
    const seen = new Set([key]);
    let frontier = [key];
    for (let d = 0; d <= radiusHex && frontier.length > 0; d++) {
      const f = falloff[Math.min(d, falloff.length - 1)];
      const next: string[] = [];
      for (const t of frontier) {
        if (m > 0) {
          const kinds = best.get(t) ?? new Map<string, KindStack>();
          kinds.set(kind, stackInto(kinds.get(kind), m * f, key));
          best.set(t, kinds);
        } else harm.set(t, (harm.get(t) ?? 0) + m * f);
        if (d === radiusHex) continue;
        for (const n of board.tiles.get(t)?.neighbours ?? []) {
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
        }
      }
      frontier = next;
    }
  }
  const out = new Map<string, number>();
  const adjacent = neighboursOn(board);
  for (const [key, kinds] of best) {
    const judged = [...kinds].map(([kind, stack]) => ({ kind, ...kindValue(kind, stack, adjacent) }));
    const values = judged.map((j) => j.value);
    const sum = values.reduce((a, b) => a + b, 0);
    // An engineered wall's own protection may rise above the ceiling, to engineeredMaxProtectionM: hard structures hold back more than any living defence.
    // So may a pair that stands in for one (Section 25.1).
    let hard = 0;
    for (const j of judged) if (engineeredLike(j.kind, j.paired)) hard = Math.max(hard, j.value);
    const ceiling = Math.min(config.defence.engineeredMaxProtectionM ?? config.defence.maxProtectionM, Math.max(config.defence.maxProtectionM, hard));
    out.set(key, Math.min(sum, Math.max(...values) * stackCap, ceiling));
  }
  for (const [key, h] of harm) out.set(key, (out.get(key) ?? 0) + h);
  return out;
}

/** A max-heap of (level, key), for spreading water highest-first. */
class LevelHeap {
  private items: { level: number; key: string }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(level: number, key: string): void {
    const a = this.items;
    a.push({ level, key });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].level >= a[i].level) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { level: number; key: string } {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].level > a[m].level) m = l;
        if (r < a.length && a[r].level > a[m].level) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Spreads water from `sources` (key → level). Each tile settles at the
 * highest level any path brings it; water moves on only from tiles where it
 * stands above the ground. Returns the level on every wet tile.
 */
function spread(board: WaterBoard, sources: Map<string, number>, loss: (tile: BoardTile) => number, shield: Map<string, number>): Map<string, number> {
  const level = new Map<string, number>();
  const heap = new LevelHeap();
  for (const [key, l] of sources) heap.push(l, key);
  while (heap.size > 0) {
    const { level: l, key } = heap.pop();
    if (level.has(key)) continue;
    const tile = board.tiles.get(key)!;
    if (l <= tile.ground) continue;
    level.set(key, l);
    for (const n of tile.neighbours) {
      if (level.has(n)) continue;
      const next = board.tiles.get(n)!;
      const drop = Math.max(0, loss(next) + (shield.get(n) ?? 0));
      const nl = l - drop;
      if (nl > next.ground) heap.push(nl, n);
    }
  }
  return level;
}

/**
 * Section 25.1, a game rule: a seawall pushes extra water onto the land at each end of the wall. A wall is a line of
 * standing seawalls; its ends are the ones with at most one seawall beside them. Where the surge stands against an end,
 * each land tile beside it (not itself a wall) lower than that water keeps at least `endPushM` of water above its
 * ground, whatever the protection round it: the water the wall turns aside comes round its ends.
 */
function pushAtWallEnds(state: GameState, board: WaterBoard, reached: ReadonlyMap<string, number>, level: Map<string, number>, own: ReadonlyMap<string, number>): void {
  const walls = [...own.keys()].filter((key) => (ELEMENT_BY_ID.get(state.elements.get(key)?.elementId ?? "")?.endPushM ?? 0) > 0);
  if (walls.length === 0) return;
  const wallSet = new Set(walls);
  const push = new Map<string, number>();
  for (const key of walls) {
    const around = board.tiles.get(key)?.neighbours ?? [];
    if (around.filter((n) => wallSet.has(n)).length > 1) continue;
    // The water standing against the wall: on its tile or any beside it (the sea side included).
    let against = -Infinity;
    for (const k of [key, ...around]) {
      const l = reached.get(k);
      if (l !== undefined && l > board.tiles.get(k)!.ground) against = Math.max(against, l);
    }
    if (against === -Infinity) continue;
    const m = ELEMENT_BY_ID.get(state.elements.get(key)!.elementId)!.endPushM!;
    // Only onto land lower than that water: it does not climb a hill.
    for (const n of around) {
      const tile = board.tiles.get(n);
      if (!wallSet.has(n) && tile?.terrainId === "land" && tile.ground < against) push.set(n, Math.max(push.get(n) ?? 0, m));
    }
  }
  for (const [key, m] of push) {
    const ground = board.tiles.get(key)!.ground;
    level.set(key, Math.max(level.get(key) ?? ground, ground + m));
  }
}

/** Lowers the water on each tile by the protection there. */
function protect(level: Map<string, number>, protection: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, l] of level) out.set(key, l - (protection.get(key) ?? 0));
  return out;
}

function depthOf(board: WaterBoard, level: Map<string, number>): Map<string, number> {
  const depth = new Map<string, number>();
  for (const [key, l] of level) {
    const d = l - board.tiles.get(key)!.ground;
    if (d > 0) depth.set(key, d);
  }
  return depth;
}

function surgeLoss(config: HazardModelConfig, strength: number): (tile: BoardTile) => number {
  const loss = config.surge.lossPerHex;
  // A weaker storm's surge stays nearer its landfall: it loses more at sea and up the creeks (a game rule; none below or at refStrength).
  const weak = config.surge.weakStorm;
  const ratio = weak && strength > 0 && strength < weak.refStrength ? weak.refStrength / strength : 1;
  const sea = loss.sea * (weak ? ratio ** weak.seaExponent : 1);
  const channel = loss.channel * (weak ? ratio ** weak.channelExponent : 1);
  return (tile) => (tile.terrainId === "coast" ? sea : CHANNEL.has(tile.terrainId) ? channel : tile.terrainId === "beach" ? loss.beach : loss.land);
}

function floodLoss(config: HazardModelConfig): (tile: BoardTile) => number {
  const loss = config.flood.lossPerHex;
  return (tile) =>
    tile.terrainId === "coast" ? loss.sea : tile.terrainId === "river" ? loss.channel : tile.terrainId === "estuary" ? loss.wetland : tile.terrainId === "beach" ? loss.beach : loss.land;
}

/** One pass of the water for a storm, with the given defences out of action or weakened. */
function pass(state: GameState, board: WaterBoard, storm: StormInput, combos: ReadonlyMap<string, number> | undefined, skip: ReadonlySet<string>, weaken: ReadonlyMap<string, number>, config: HazardModelConfig) {
  const hasSurge = storm.kind !== "flood" && storm.landfall !== null && board.sites.length > 0;
  const hasFlood = storm.kind !== "cyclone";
  const kindOf = (key: string): string => state.elements.get(key)?.elementId ?? key;
  const c = config.compound;
  let surgeLevel = 0;
  let surge = new Map<string, number>();
  if (hasSurge) {
    surgeLevel = (config.surge.baseM + config.surge.perStrengthM * storm.strength) * (storm.kind === "compound" ? c.surgeShare : 1);
    const site = board.sites[Math.max(0, Math.min(board.sites.length - 1, storm.landfall!))];
    const own = ownMetres(state, "cyclone", skip, weaken, combos, config);
    const reached = spread(board, new Map([[site, surgeLevel]]), surgeLoss(config, storm.strength), pathDrag(board, own, config, kindOf));
    surge = protect(reached, areaProtection(board, own, config, kindOf));
    pushAtWallEnds(state, board, reached, surge, own);
  }
  let floodLevel = 0;
  let flood = new Map<string, number>();
  if (hasFlood) {
    floodLevel = (config.flood.baseM + config.flood.perStrengthM * storm.strength) * (storm.kind === "compound" ? c.floodShare : 1);
    const sources = new Map<string, number>();
    const upstream = config.flood.sourceShare * board.mouthIndex;
    for (const key of floodSources(board, config)) sources.set(key, floodLevel);
    if (storm.kind === "compound" && hasSurge) {
      // The surge holds the river back: the channel stands higher toward the mouth.
      const mouthSurge = Math.max(0, ...[...board.riverIndex].filter(([, i]) => i === board.mouthIndex).map(([key]) => surge.get(key) ?? 0));
      for (const [key, index] of board.riverIndex) {
        if (board.tiles.get(key)!.terrainId !== "river") continue;
        const share = board.mouthIndex > 0 ? Math.pow(index / board.mouthIndex, c.backwaterExponent) : 1;
        const lift = c.backwaterShare * mouthSurge * share;
        // The flood reaching this point, plus the water backed up behind the surge.
        const travelled = board.floodSource ? (board.floodSource.distance.get(key) ?? board.mouthIndex) : Math.max(0, index - upstream);
        const reach = floodLevel - config.flood.lossPerHex.channel * travelled;
        if (lift > 0) sources.set(key, Math.max(sources.get(key) ?? 0, reach + lift));
      }
    }
    const own = ownMetres(state, "flood", skip, weaken, combos, config);
    flood = protect(spread(board, sources, floodLoss(config), pathDrag(board, own, config, kindOf)), areaProtection(board, own, config, kindOf));
  }
  const surgeDepth = depthOf(board, surge);
  const floodDepth = depthOf(board, flood);
  const depth = new Map<string, number>(surgeDepth);
  for (const [key, d] of floodDepth) depth.set(key, Math.max(depth.get(key) ?? 0, d));
  const wind = windField(state, board, storm, weaken, config);
  if (storm.sheltered) {
    for (const key of storm.sheltered) {
      depth.delete(key);
      surgeDepth.delete(key);
      floodDepth.delete(key);
      wind.delete(key);
    }
  }
  return { depth, surge: surgeDepth, flood: floodDepth, wind, surgeLevel, floodLevel };
}

/**
 * Where the water goes for `storm` on the board as it stands. Does not change
 * `state`: the resolver applies the result. Engineered structures over their
 * limit fail and nature defences over theirs are weakened, and the water is
 * worked out again without them (once: a failure does not cascade).
 */
export function computeWater(state: GameState, storm: StormInput, options: { combos?: ReadonlyMap<string, number>; landfallZoneTiles?: readonly string[]; config?: HazardModelConfig } = {}): WaterField {
  const config = options.config ?? HAZARD_MODEL;
  const board = waterBoard(state, options.landfallZoneTiles);
  // Section 25.1, a game rule: a seawall comes through the first cyclone it faces and breaks in the second (a small dam
  // the same with floods). Every storm that brings the hazard it answers counts; it breaks as that storm comes, so
  // it gives no protection in it. Ones that come through are counted by the resolver (`survived`).
  // Section 26.1, game rules: ages count to the turn the storm lands on. A breakwater 10 years old is broken (it
  // broke as it turned 10, storm or none, `ageBroken`); a seawall or dam 10 years old is cracked and breaks in the
  // next storm of its kind, even its first.
  const brings = storm.kind === "compound" ? ["cyclone", "flood"] : [storm.kind];
  const at = storm.turn ?? state.turn;
  const breaking = new Set<string>();
  const aged = new Set<string>();
  const survived: string[] = [];
  for (const [key, inst] of state.elements) {
    const def = ELEMENT_BY_ID.get(inst.elementId);
    if (!def || inst.broken) continue;
    if (ageBroken(def, inst, at)) {
      aged.add(key);
      continue;
    }
    if (def.survivesStorms === undefined || !def.targetsHazards?.some((h) => brings.includes(h))) continue;
    if ((inst.stormsSurvived ?? 0) >= def.survivesStorms || isCracked(def, inst, at)) breaking.add(key);
    else survived.push(key);
  }
  const out = new Set([...breaking, ...aged]);
  const first = pass(state, board, storm, options.combos, out, new Map(), config);
  const failed: string[] = [...breaking];
  const overwhelmed: string[] = [];
  const weaken = new Map<string, number>();
  for (const [key, inst] of state.elements) {
    const def = ELEMENT_BY_ID.get(inst.elementId);
    if (!def || (def.effects.resilience ?? 0) <= 0 || inst.broken || out.has(key)) continue;
    const d = first.depth.get(key) ?? 0;
    if (d <= 0) continue;
    // The depth rule stays only for an engineered structure with neither a storm count nor an age (none on Panjim since Section 26).
    if (def.category === "engineered" && def.survivesStorms === undefined && def.breaksAtAge === undefined && def.failureThreshold !== undefined && d > def.failureThreshold * config.defence.failDepthPerUnit) failed.push(key);
    // Section 25.1: a khazan is never worn.
    else if (def.neverWears) continue;
    else if (def.overwhelmSeverity !== undefined && d > def.overwhelmSeverity * config.defence.overwhelmDepthPerUnit) {
      overwhelmed.push(key);
      weaken.set(key, def.overwhelmedAbsorptionMultiplier ?? 0.5);
    }
  }
  const result = failed.length > breaking.size || overwhelmed.length > 0 ? pass(state, board, storm, options.combos, new Set([...failed, ...aged]), weaken, config) : first;
  return { ...result, failed, overwhelmed, aged: [...aged], survived: survived.filter((key) => !failed.includes(key)) };
}

/** Section 26.1: a defence's age in years (one turn a year) on turn `at`. */
export function ageOf(inst: { builtOnTurn: number }, at: number): number {
  return at - inst.builtOnTurn;
}

/** Section 26.1, a game rule: whether a defence that breaks with age (the breakwater, at 10) has broken by turn `at`. */
export function ageBroken(def: { breaksAtAge?: number }, inst: { builtOnTurn: number }, at: number): boolean {
  return def.breaksAtAge !== undefined && ageOf(inst, at) >= def.breaksAtAge;
}

/** Section 26.1, a game rule: whether a seawall or dam is cracked on turn `at` (10 years old): it breaks in the next storm of its kind. */
export function isCracked(def: { cracksAtAge?: number }, inst: { builtOnTurn: number; broken?: boolean }, at: number): boolean {
  return !inst.broken && def.cracksAtAge !== undefined && ageOf(inst, at) >= def.cracksAtAge;
}

/** Section 26.1: what a cracked seawall or dam's card says (a game rule, in the game's words). */
export function crackedNote(def: { targetsHazards?: string[] }): string {
  return `Cracked: breaks in the next ${def.targetsHazards?.includes("cyclone") ? "cyclone" : "flood"}`;
}

/** True where the water is deep enough to take a house. */
export function floodsHouse(depth: number, config: HazardModelConfig = HAZARD_MODEL): boolean {
  return depth >= config.houseLossDepthM;
}

const worldOf = (key: string): { x: number; z: number } => {
  const [q, r] = key.split(",").map(Number);
  return axialToWorld({ q, r }, 1);
};

/**
 * The direction from a landfall site out to open sea: towards the mass of sea
 * within six hexes of it. The forecast's track and the wind both use it.
 */
export function seawardOf(board: WaterBoard, site: string): { x: number; z: number } {
  const at = worldOf(site);
  const reach = 6 * Math.sqrt(3);
  let x = 0;
  let z = 0;
  for (const [key, tile] of board.tiles) {
    if (tile.terrainId !== "coast") continue;
    const p = worldOf(key);
    const dx = p.x - at.x;
    const dz = p.z - at.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.01 || distance > reach) continue;
    x += dx / distance;
    z += dz / distance;
  }
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

/**
 * A cyclone's wind on every tile it reaches, in game metres of water-
 * equivalent damage (Section 12; a game rule, tuned so the surge stays the
 * main threat and the wind decides some homes at the margin):
 *
 *   - it comes in off the sea at the landfall: `perStrengthM` × strength on
 *     the shore there, falling off evenly to nothing `landfallReachHex` hexes
 *     away along the coast;
 *   - it weakens with every hex inland from the open sea (`inlandKeep`);
 *     higher ground does not block it;
 *   - rows of pandanus and mangroves are shelterbelts: each takes out a share
 *     of the wind on the tiles up to three hexes downwind of it (within
 *     `shelterHalfAngleDeg` of the wind's direction), several rows multiply,
 *     and at least `minKeep` always gets through. Nothing else slows it.
 *
 * A flood has no wind. Not water: never drawn as water, only added to it
 * where a house's damage is judged.
 */
export function windField(
  state: GameState,
  board: WaterBoard,
  storm: StormInput,
  /** Defences weakened this storm (kept for callers; pandanus shelter is the same however worn, Section 25.1). */
  _weaken: ReadonlyMap<string, number> = new Map(),
  config: HazardModelConfig = HAZARD_MODEL
): Map<string, number> {
  const wind = new Map<string, number>();
  // Section 26.3: the storm's own wind numbers, where it has them, over the model's.
  const w = config.wind && storm.wind ? { ...config.wind, ...storm.wind } : config.wind;
  if (!w || storm.kind === "flood" || storm.landfall === null || board.sites.length === 0) return wind;
  const site = board.sites[Math.max(0, Math.min(board.sites.length - 1, storm.landfall))];
  const [sq, sr] = site.split(",").map(Number);
  // In the compound storm the wind comes with the surge, at its own share (Section 26.3; the surge's before).
  const shore = w.perStrengthM * storm.strength * (storm.kind === "compound" ? (w.compoundShare ?? config.compound.surgeShare) : 1);
  for (const [key, tile] of board.tiles) {
    if (tile.terrainId === "coast") continue;
    const [q, r] = key.split(",").map(Number);
    const along = 1 - axialDistance({ q, r }, { q: sq, r: sr }) / w.landfallReachHex;
    if (along <= 0) continue;
    const inland = Math.max(0, (board.seaDistance.get(key) ?? 99) - 1);
    const v = shore * along * Math.pow(w.inlandKeep, inland);
    if (v > 1e-3) wind.set(key, v);
  }
  // Section 25.1, a game rule: pandanus is the one defence that lowers the wind. Every tile within shelterReachHex of
  // a standing pandanus keeps 1 - shelter of the wind (in any direction; more pandanus round a tile add nothing).
  const keep = new Map<string, number>();
  const reach = w.shelterReachHex;
  for (const [key, inst] of state.elements) {
    const share = w.shelter[inst.elementId];
    if (!share || inst.broken) continue;
    const [q0, r0] = key.split(",").map(Number);
    for (let dq = -reach; dq <= reach; dq++) {
      for (let dr = Math.max(-reach, -dq - reach); dr <= Math.min(reach, -dq + reach); dr++) {
        const target = `${q0 + dq},${r0 + dr}`;
        if (!wind.has(target)) continue;
        keep.set(target, Math.min(keep.get(target) ?? 1, 1 - share));
      }
    }
  }
  for (const [key, k] of keep) wind.set(key, wind.get(key)! * Math.max(w.minKeep, k));
  return wind;
}

/** Water and wind together on a tile: what a house there has to stand against (game metres). */
export function damageAt(field: { depth: ReadonlyMap<string, number>; wind?: ReadonlyMap<string, number> }, key: string): number {
  return (field.depth.get(key) ?? 0) + (field.wind?.get(key) ?? 0);
}
