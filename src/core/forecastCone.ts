import { axialToWorld } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import { computeWater, type StormInput, type WaterBoard } from "./hazardModel";

/**
 * The forecast cone at the start of a storm's phase (Section 6.1): where the
 * storm will come from and what it will reach, drawn from the hazard model
 * itself, never a separate picture.
 *
 *   - BANDS: every tile the storm's water reaches on a board with no
 *     defences at all (the worst a player can face), in three bands by how
 *     deep it would stand (`coneBands`): the deeper, the surer. So every house
 *     that could be lost lies inside the cone. At sea (a cyclone only), the
 *     same, inside the wedge the surge comes in through.
 *   - AREA TO PROTECT: the houses the storm takes with the defences standing
 *     now (the resolver's own answer, passed in): exactly what is at stake.
 *   - WHERE THEY MEET (the compound storm): the tiles where the surge and
 *     the river water stand at about the same height, so each holds the
 *     other back: the river mouth and the Mandovi waterfront.
 *   - TRACKS: a cyclone's comes from the open sea onto its landfall; a
 *     flood's runs from the most upstream river tile down the channel to the
 *     wetland it floods deepest.
 *
 * Pure: no DOM, no renderer. Points are world coordinates (hex size 1).
 */
export type ConeBand = 1 | 2 | 3;

export interface ConeTrack {
  kind: "cyclone" | "flood";
  /** World x/z, from where the water comes to where it goes. */
  points: { x: number; z: number }[];
}

export interface ForecastCone {
  challengeId: string;
  kind: ChallengeKind;
  /** 3 most likely, 2 likely, 1 possible, by tile key. */
  bands: Map<string, ConeBand>;
  /** The houses the storm takes with the defences as they stand. */
  area: string[];
  /** Compound only: where the surge and the river water meet. */
  meet: string[];
  tracks: ConeTrack[];
}

/**
 * The bands by depth: the deepest third of the tiles the storm reaches is
 * Most likely, the next third Likely, the shallowest third Possible (equal
 * depths share the darker band). A rank, not a strength cut-off: the river
 * and the wetlands flood at any strength, so a cut-off by strength put almost
 * a whole flood in one band.
 */
export function coneBands(reached: readonly (readonly [string, number])[]): Map<string, ConeBand> {
  const sorted = [...reached].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const bands = new Map<string, ConeBand>();
  if (sorted.length === 0) return bands;
  const cut = (share: number) => sorted[Math.max(0, Math.ceil(sorted.length * share) - 1)][1];
  const mostLikely = cut(1 / 3);
  const likely = cut(2 / 3);
  for (const [key, depth] of sorted) bands.set(key, depth >= mostLikely ? 3 : depth >= likely ? 2 : 1);
  return bands;
}
/** Where they meet: the surge and the river water within this ratio of each other. */
export const MEET_RATIO = 0.75;
/** The wedge at sea a cyclone comes in through: its half-angle and its reach in hexes. */
export const SEA_WEDGE = { halfAngleDeg: 35, reachHex: 8 };

const WATER = new Set(["coast"]);

/** A board with every defence removed: the worst a player can face. */
function bare(state: GameState): GameState {
  const copy = state.clone();
  for (const [key, inst] of [...copy.elements]) {
    const def = ELEMENT_BY_ID.get(inst.elementId);
    if (def && (def.effects.resilience ?? 0) > 0) copy.elements.delete(key);
  }
  return copy;
}

const world = (key: string): { x: number; z: number } => {
  const [q, r] = key.split(",").map(Number);
  return axialToWorld({ q, r }, 1);
};

/**
 * The direction from a landfall site out to open sea: towards the mass of sea
 * within six hexes of it. (It used to be "away from the land beside it", which
 * on a site where the coast bends, such as 1,12 by the river mouth since
 * Section 11, pointed the track in over the north bank.)
 */
function seaward(board: WaterBoard, site: string): { x: number; z: number } {
  const at = world(site);
  const reach = 6 * Math.sqrt(3);
  let x = 0;
  let z = 0;
  for (const [key, tile] of board.tiles) {
    if (!WATER.has(tile.terrainId)) continue;
    const p = world(key);
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

/** The cyclone's track: from open sea, through its landfall site, a little way inland. */
function cycloneTrack(board: WaterBoard, site: string): ConeTrack {
  const at = world(site);
  const out = seaward(board, site);
  const unit = Math.sqrt(3);
  return {
    kind: "cyclone",
    points: [
      { x: at.x + out.x * unit * 7, z: at.z + out.z * unit * 7 },
      { x: at.x + out.x * unit * 3, z: at.z + out.z * unit * 3 },
      { x: at.x, z: at.z },
      { x: at.x - out.x * unit * 1.6, z: at.z - out.z * unit * 1.6 }
    ]
  };
}

/** The flood's track: the shortest way along the channels from the most upstream river tile to `target`. */
function floodTrack(board: WaterBoard, target: string): ConeTrack | null {
  let start: string | null = null;
  for (const [key, index] of board.riverIndex) {
    if (board.tiles.get(key)!.terrainId !== "river") continue;
    if (start === null || index < board.riverIndex.get(start)!) start = key;
  }
  if (!start) return null;
  const from = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  for (let i = 0; i < queue.length && !from.has(target); i++) {
    for (const n of board.tiles.get(queue[i])!.neighbours) {
      if (from.has(n)) continue;
      const terrain = board.tiles.get(n)!.terrainId;
      if (n !== target && terrain !== "river" && terrain !== "estuary") continue;
      from.set(n, queue[i]);
      queue.push(n);
    }
  }
  if (!from.has(target)) return null;
  const path: string[] = [];
  for (let at: string | null = target; at; at = from.get(at) ?? null) path.unshift(at);
  // Every other tile, the ends kept: a smooth line, not a staircase.
  const points = path.filter((_, i) => i % 2 === 0 || i === path.length - 1).map(world);
  return { kind: "flood", points };
}

/**
 * The cone for one storm. `storm` is its kind, strength and landfall; `lost`
 * is the resolver's houses lost on the board as it stands (the area to
 * protect); `isHouse` says which tiles hold a house.
 */
export function forecastCone(
  challengeId: string,
  state: GameState,
  board: WaterBoard,
  storm: StormInput,
  lost: readonly string[],
  options: { combos?: ReadonlyMap<string, number>; landfallZoneTiles?: readonly string[] } = {}
): ForecastCone {
  const water = computeWater(bare(state), storm, { landfallZoneTiles: options.landfallZoneTiles });
  const site = storm.kind !== "flood" && storm.landfall !== null ? board.sites[storm.landfall] : null;
  // At sea only the wedge a cyclone comes in through; the open sea elsewhere is not the forecast.
  const at = site ? world(site) : null;
  const out = site ? seaward(board, site) : null;
  const cos = Math.cos((SEA_WEDGE.halfAngleDeg * Math.PI) / 180);
  const inWedge = (key: string): boolean => {
    if (!at || !out) return false;
    const p = world(key);
    const dx = p.x - at.x;
    const dz = p.z - at.z;
    const distance = Math.hypot(dx, dz);
    if (distance > SEA_WEDGE.reachHex * Math.sqrt(3)) return false;
    return distance < 0.01 || (dx * out.x + dz * out.z) / distance >= cos;
  };
  // Never the north bank: it is scenery, not part of the game.
  const reached = [...water.depth.keys()].filter((key) => !state.isScenery(key) && (!WATER.has(board.tiles.get(key)!.terrainId) || inWedge(key)));
  const bands = coneBands(reached.map((key) => [key, water.depth.get(key)!] as const));
  const tracks: ConeTrack[] = [];
  if (site) tracks.push(cycloneTrack(board, site));
  let meet: string[] = [];
  if (storm.kind !== "cyclone") {
    // The flood's track ends in the wetland it floods deepest.
    let target: string | null = null;
    for (const [key, depth] of water.flood) {
      if (board.tiles.get(key)!.terrainId !== "estuary") continue;
      if (target === null || depth > water.flood.get(target)! || (depth === water.flood.get(target)! && key < target)) target = key;
    }
    const track = target ? floodTrack(board, target) : null;
    if (track) tracks.push(track);
  }
  if (storm.kind === "compound") {
    meet = [...water.surge.keys()].filter((key) => {
      if (WATER.has(board.tiles.get(key)!.terrainId)) return false;
      const surge = water.surge.get(key)!;
      const flood = water.flood.get(key) ?? 0;
      return flood > 0 && Math.min(surge, flood) / Math.max(surge, flood) >= MEET_RATIO;
    });
  }
  return { challengeId, kind: storm.kind, bands, area: [...lost], meet, tracks };
}

/**
 * The line over the forecast's map (Section 8), on the start popup and the
 * result cards: "The first cyclone lands in 5 years", "The flood comes in 10
 * years", "The cyclone and flood arrive together in 10 years".
 */
export function forecastLine(kind: ChallengeKind, years: number, first: boolean): string {
  const span = `${years} year${years === 1 ? "" : "s"}`;
  if (kind === "cyclone") return `The ${first ? "first " : ""}cyclone lands in ${span}`;
  if (kind === "flood") return `The flood comes in ${span}`;
  return `The cyclone and flood arrive together in ${span}`;
}
