import { axialDistance, axialKey, axialToWorld, neighbors, type AxialCoord } from "@core/hex";
import { hashSeed } from "@core/rng";
import type { GameMap } from "./levelMap";

/**
 * Panjim's town plan: which land tile holds which kind of building, which is
 * a road, and which is left as a garden. Deterministic: worked out from the
 * map and the level's seed alone, so a building never changes between frames,
 * saves or reloads, and the same seed always gives the same town.
 *
 * DENSITY. Each land tile's chance of being built comes from a density field:
 *   - closeness to the old city (the Church of the Immaculate Conception);
 *   - being beside a major road;
 *   - being on the Mandovi waterfront;
 *   - which zone it is in (Fontainhas and the waterfront denser, the
 *     Taleigao–Merces wetlands thinner);
 *   - outside the old city, the wetland's edge, which is fields and gardens
 *     more than houses.
 * One global offset then sets the share of empty land (gardens and trees)
 * at `EMPTY_SHARE`, inside the 10-20% the design asks for. So the core is
 * nearly solid, the suburbs have gardens, and the edges are sparse.
 *
 * KINDS. Small houses are the commonest. The core, Fontainhas and the
 * waterfront get apartments, shops and cafes (and the odd godown by the
 * water); Miramar, Caranzalem and Dona Paula get bungalows and cafes;
 * Taleigao, St Cruz and Merces mostly small houses.
 *
 * COLOURS. A Goan palette for walls and three roof colours, chosen so that no
 * two neighbouring buildings share a wall colour wherever another is free.
 *
 * Every building, whatever its kind, is one House in the game: one dwelling
 * for Houses saved, at risk and lost. The kinds are what the town looks like,
 * not different rules.
 */
export type BuildingKind = "small_house" | "bungalow" | "two_storey" | "apartment" | "cafe" | "shop" | "godown";
export const BUILDING_KINDS: BuildingKind[] = ["small_house", "bungalow", "two_storey", "apartment", "cafe", "shop", "godown"];

/**
 * The city fabric: the extra structures that stand round a tile's House, so
 * a built tile reads as a block of the city (one to seven buildings) rather
 * than one house on a lawn. Four shapes: the pitched Goan house, the flat
 * concrete block, the apartment at two to four storeys, and the long shed.
 * Decoration only: the tile is still one House in the game, and its fabric
 * shares the House's fate (damage, loss, rebuild).
 */
export type FabricKind = "small_house" | "shop" | "apartment" | "godown";
export const FABRIC_KINDS: FabricKind[] = ["small_house", "shop", "apartment", "godown"];

export interface FabricPart {
  kind: FabricKind;
  /** Offset from the tile centre, world units. */
  dx: number;
  dz: number;
  /** Rotation about the vertical, radians: its front faces the street. */
  rotY: number;
  scale: number;
  /** 1 for the authored height; apartments use 0.5 to 1 for two to four storeys. */
  heightScale: number;
  wall: number;
  roof: number;
}

export interface BuildingPlot {
  kind: BuildingKind;
  /** Index into `WALL_COLOURS`. */
  wall: number;
  /** Index into `ROOF_COLOURS`. */
  roof: number;
  /** About 0.88 to 1.12. */
  scale: number;
  /** Quarter turns, 0 to 3 (the plot's seeded turn, kept for old callers). */
  turns: number;
  /** Rotation about the vertical, radians: the House's front faces the nearest street. */
  rotY: number;
  /** The other structures on the tile (see FabricPart); empty where the House stands alone. */
  fabric: FabricPart[];
}

export interface TownLayout {
  /** Land tiles with a building, by coord key. */
  buildings: Map<string, BuildingPlot>;
  /** Land tiles left as gardens and trees. */
  gardens: Set<string>;
  /** Land tiles a road runs through. */
  roads: Set<string>;
  /** River and wetland tiles a road crosses. */
  bridges: Set<string>;
  /** Pairs of neighbouring road tiles the road runs between (coord keys). */
  links: [string, string][];
}

/** Whitewash, ochre, laterite red, terracotta, Fontainhas blue, teal, pink, mustard, mint, soft grey. */
export const WALL_COLOURS = ["#f3eee2", "#d9a441", "#b5523b", "#cf7a4f", "#4f7fb8", "#3f9a96", "#e59ab0", "#d8b13a", "#9fd3b0", "#b9b9b2"];
/** Red tile, grey, blue; then two more terracotta tones for the fabric's pitched roofs. */
export const ROOF_COLOURS = ["#b5452f", "#7d8288", "#4b6a8f", "#a8492c", "#c4643c"];

/** The share of buildable land (not road, not a landmark) left as gardens. */
export const EMPTY_SHARE = 0.16;

/** Fewest and most structures on a built tile (the House included). */
export const FABRIC_MIN = 1;
export const FABRIC_MAX = 7;
/**
 * The fabric's slots: the centre and a ring of six, each on a line from the
 * centre to an edge's midpoint, so the blocks line up with the grid and the
 * streets. The radius keeps the largest shape clear of the tile's edge (the
 * inner radius is 0.866), so nothing ever stands on a neighbouring road.
 */
const FABRIC_RING = 0.52;
/** How far a slot may swing off its line, radians (each way: half this). */
const FABRIC_SWING = 0.5;
/** A companion structure's size, relative to the authored building. */
const FABRIC_SCALE: [number, number] = [0.56, 0.68];
/** The House's own size on a tile with company, so the block does not crowd. */
const CROWDED_HOUSE_SCALE = 0.8;

/** A stable number in [0, 1) for a tile, a seed and a purpose. */
function unit(seed: string, coord: AxialCoord, salt: string): number {
  return hashSeed(`${seed}|${coord.q},${coord.r}|${salt}`) / 4294967296;
}

type District = "core" | "seaside" | "suburb";

const SEASIDE = ["Miramar Beach", "Caranzalem", "Dona Paula"];
const CORE_LANDMARK = "Our Lady of the Immaculate Conception";

const WEIGHTS: Record<District, Partial<Record<BuildingKind, number>>> = {
  core: { apartment: 0.24, shop: 0.2, cafe: 0.12, two_storey: 0.2, small_house: 0.18, bungalow: 0.06 },
  seaside: { bungalow: 0.34, cafe: 0.14, small_house: 0.26, two_storey: 0.15, shop: 0.07, apartment: 0.04 },
  suburb: { small_house: 0.52, bungalow: 0.14, two_storey: 0.2, shop: 0.08, cafe: 0.04, apartment: 0.02 }
};

function pick(weights: Partial<Record<BuildingKind, number>>, roll: number): BuildingKind {
  const entries = Object.entries(weights) as [BuildingKind, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (const [kind, weight] of entries) {
    acc += weight / total;
    if (roll < acc) return kind;
  }
  return entries[entries.length - 1][0];
}

/**
 * The town plan for `map`. `seed` is the level's seed. Monument tiles are
 * left out entirely (they are neither buildings nor gardens).
 */
export function townLayout(map: GameMap, seed: string): TownLayout {
  const terrain = new Map(map.tiles.map((tile) => [axialKey(tile.coord), tile.terrainId]));
  const monuments = new Set(map.monuments.map((m) => `${m.q},${m.r}`));
  const roads = new Set(map.roads.map(([q, r]) => `${q},${r}`).filter((key) => terrain.get(key) === "land" && !monuments.has(key)));
  const bridges = new Set(map.bridges.map(([q, r]) => `${q},${r}`).filter((key) => terrain.has(key)));
  const zoneOf = new Map<string, string>();
  for (const zone of map.zones) for (const [q, r] of zone.tiles) zoneOf.set(`${q},${r}`, zone.id);
  const core = map.landmarks.find((l) => l.name === CORE_LANDMARK) ?? map.focus;
  const seaside = map.landmarks.filter((l) => SEASIDE.includes(l.name));

  const plots: { key: string; coord: AxialCoord; density: number; roll: number; district: District; nearWater: boolean }[] = [];
  for (const tile of map.tiles) {
    const key = axialKey(tile.coord);
    if (tile.terrainId !== "land" || monuments.has(key) || roads.has(key)) continue;
    const around = neighbors(tile.coord).map((n) => axialKey(n));
    const byRoad = around.some((n) => roads.has(n) || bridges.has(n));
    const nearRoad = !byRoad && around.some((n) => neighbors({ q: Number(n.split(",")[0]), r: Number(n.split(",")[1]) }).some((m) => roads.has(axialKey(m))));
    const waterfront = around.some((n) => terrain.get(n) === "river");
    // Godowns stand a street back from the water too: the riverside tiles
    // themselves are mostly the road.
    const nearWater = waterfront || around.some((n) => {
      const [nq, nr] = n.split(",").map(Number);
      return neighbors({ q: nq, r: nr }).some((m) => ["river", "coast"].includes(terrain.get(axialKey(m)) ?? ""));
    });
    const zone = zoneOf.get(key);
    const dCore = axialDistance(tile.coord, { q: core.q, r: core.r });
    const coreness = Math.max(0, 1 - dCore / 20);
    const zoneBias = zone === "z3" ? 0.12 : zone === "z4" ? 0.1 : zone === "z2" ? -0.12 : 0;
    // The wetland's edge is fields and gardens more than houses: low, wet
    // ground that floods. (Built up along the river in the old city, which
    // is the waterfront bonus above.)
    const wetEdge = around.some((n) => terrain.get(n) === "estuary");
    const density = 0.45 * coreness + (byRoad ? 0.22 : nearRoad ? 0.1 : 0) + (waterfront ? 0.12 : 0) + zoneBias - (wetEdge && dCore > 7 ? 0.2 : 0);
    const dSea = Math.min(...seaside.map((l) => axialDistance(tile.coord, { q: l.q, r: l.r })), 99);
    const district: District = dCore <= 7 || zone === "z3" || zone === "z4" ? "core" : dSea <= 6 || zone === "z1" ? "seaside" : "suburb";
    plots.push({ key, coord: tile.coord, density, roll: unit(seed, tile.coord, "built"), district, nearWater });
  }

  // One offset sets the overall empty share; the field decides where.
  // A tile is built when roll < density + offset.
  const target = Math.round(plots.length * (1 - EMPTY_SHARE));
  let lo = -2;
  let hi = 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const built = plots.filter((p) => p.roll < p.density + mid).length;
    if (built < target) lo = mid;
    else hi = mid;
  }
  const offset = hi;

  const buildings = new Map<string, BuildingPlot>();
  const gardens = new Set<string>();
  // In a fixed order, so the neighbour check for colours is deterministic.
  plots.sort((a, b) => a.coord.r - b.coord.r || a.coord.q - b.coord.q);
  for (const plot of plots) {
    if (plot.roll >= plot.density + offset) {
      gardens.add(plot.key);
      continue;
    }
    let kind = pick(WEIGHTS[plot.district], unit(seed, plot.coord, "kind"));
    if (plot.nearWater && plot.district !== "seaside" && unit(seed, plot.coord, "godown") < 0.12) kind = "godown";
    const taken = new Set(
      neighbors(plot.coord)
        .map((n) => buildings.get(axialKey(n))?.wall)
        .filter((w): w is number => w !== undefined)
    );
    let wall = Math.floor(unit(seed, plot.coord, "wall") * WALL_COLOURS.length);
    for (let step = 0; step < WALL_COLOURS.length && taken.has(wall); step++) wall = (wall + 1) % WALL_COLOURS.length;
    const roofRoll = unit(seed, plot.coord, "roof");
    // Red tile for half the pitched roofs, grey and blue for the rest; flat
    // roofs are concrete grey or painted blue. Enough variety that the town
    // no longer reads as a field of red dots from above.
    const roof = kind === "apartment" || kind === "shop" || kind === "godown" ? (roofRoll < 0.7 ? 1 : 2) : roofRoll < 0.5 ? 0 : roofRoll < 0.8 ? 1 : 2;
    buildings.set(plot.key, {
      kind,
      wall,
      roof,
      scale: 0.88 + unit(seed, plot.coord, "scale") * 0.24,
      turns: Math.floor(unit(seed, plot.coord, "turn") * 4),
      rotY: (Math.floor(unit(seed, plot.coord, "turn") * 4) * Math.PI) / 2,
      fabric: []
    });
  }
  addFabric(seed, plots, buildings, roads, bridges);
  const network = new Set([...roads, ...bridges]);
  const links = map.roadLinks
    .map(([q1, r1, q2, r2]) => [`${q1},${r1}`, `${q2},${r2}`] as [string, string])
    .filter(([a, b]) => network.has(a) && network.has(b));
  return { buildings, gardens, roads, bridges, links };
}

/** The angle (for `makeRotationY`) that turns a building's front (+z) toward `to` from `from`. */
function facing(from: AxialCoord, to: AxialCoord): number {
  const a = axialToWorld(from, 1);
  const b = axialToWorld(to, 1);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/**
 * Fills each built tile with its fabric: how many structures (from the same
 * density field that decided the tile is built), which shapes, where, and
 * which way they face.
 *
 * Facing: toward a neighbouring road or bridge where there is one (the
 * street front), else toward the nearest road within two tiles, else along
 * the grid. Slots facing the street fill first, so a block's buildings line
 * its street.
 */
function addFabric(
  seed: string,
  plots: { key: string; coord: AxialCoord; density: number; district: District; nearWater: boolean }[],
  buildings: Map<string, BuildingPlot>,
  roads: Set<string>,
  bridges: Set<string>
): void {
  const built = plots.filter((plot) => buildings.has(plot.key));
  if (built.length === 0) return;
  const lo = Math.min(...built.map((p) => p.density));
  const hi = Math.max(...built.map((p) => p.density));
  const street = (key: string): boolean => roads.has(key) || bridges.has(key);
  for (const plot of built) {
    const house = buildings.get(plot.key)!;
    const around = neighbors(plot.coord);
    const fronts = around.filter((n) => street(axialKey(n)));
    let face: AxialCoord | null = fronts[0] ?? null;
    if (!face) {
      // The nearest road two tiles away: face the neighbour on the way to it.
      for (const n of around) {
        if (neighbors(n).some((m) => street(axialKey(m)))) {
          face = n;
          break;
        }
      }
    }
    const baseAngle = face ? facing(plot.coord, face) : facing(plot.coord, around[Math.floor(unit(seed, plot.coord, "grid") * 6)]);
    house.rotY = baseAngle;

    const t = hi > lo ? (plot.density - lo) / (hi - lo) : 0.5;
    const count = Math.max(FABRIC_MIN, Math.min(FABRIC_MAX, Math.round(FABRIC_MIN + t * (FABRIC_MAX - FABRIC_MIN) + (unit(seed, plot.coord, "count") - 0.5) * 2)));
    if (count <= 1) continue;
    if (count >= 5) house.scale *= CROWDED_HOUSE_SCALE;

    // Ring slots, the street-facing ones first.
    const slots = around
      .map((n) => ({ n, angle: facing(plot.coord, n), street: street(axialKey(n)) }))
      .sort((a, b) => Number(b.street) - Number(a.street) || unit(seed, a.n, "slot") - unit(seed, b.n, "slot"));
    // The House keeps the centre; the ring holds up to six more.
    for (let i = 0; i < count - 1 && i < slots.length; i++) {
      const slot = slots[i];
      const salt = `fabric${i}`;
      const roll = unit(seed, plot.coord, `${salt}kind`);
      const kind: FabricKind =
        plot.nearWater && plot.district !== "seaside" && roll < 0.12
          ? "godown"
          : plot.district === "core"
            ? roll < 0.35 ? "small_house" : roll < 0.65 ? "shop" : roll < 0.95 ? "apartment" : "godown"
            : plot.district === "seaside"
              ? roll < 0.6 ? "small_house" : roll < 0.8 ? "shop" : roll < 0.95 ? "apartment" : "godown"
              : roll < 0.62 ? "small_house" : roll < 0.84 ? "shop" : roll < 0.93 ? "apartment" : "godown";
      const wallRoll = unit(seed, plot.coord, `${salt}wall`);
      let wall = Math.floor(wallRoll * WALL_COLOURS.length);
      if (wall === house.wall) wall = (wall + 1) % WALL_COLOURS.length;
      const roofRoll = unit(seed, plot.coord, `${salt}roof`);
      // Pitched roofs are terracotta; flat ones are concrete grey, now and then painted blue.
      const roof = kind === "small_house" || kind === "godown" ? (roofRoll < 0.34 ? 0 : roofRoll < 0.67 ? 3 : 4) : roofRoll < 0.85 ? 1 : 2;
      // Facing the street if this slot is on it; otherwise the same way as the House.
      const rotY = slot.street ? slot.angle : baseAngle;
      // A little off the slot's line and radius, so a block does not read as a ring.
      const angle = slot.angle + (unit(seed, plot.coord, `${salt}swing`) - 0.5) * FABRIC_SWING;
      const radius = FABRIC_RING * (0.82 + unit(seed, plot.coord, `${salt}reach`) * 0.18);
      house.fabric.push({
        kind,
        dx: Math.sin(angle) * radius,
        dz: Math.cos(angle) * radius,
        rotY,
        scale: FABRIC_SCALE[0] + unit(seed, plot.coord, `${salt}scale`) * (FABRIC_SCALE[1] - FABRIC_SCALE[0]),
        heightScale: kind === "apartment" ? 0.5 + Math.floor(unit(seed, plot.coord, `${salt}storeys`) * 3) * 0.25 : 1,
        wall,
        roof
      });
    }
  }
}

/**
 * The Houses nearest a tile: those on its neighbours, or if it has none, those
 * two tiles out. For sizing a monument against its street (some stand among
 * roads, water and other monuments, with no House right beside them).
 */
export function nearestHouse(town: TownLayout, coord: AxialCoord): BuildingPlot[] {
  for (const ring of [1, 2]) {
    const plots: BuildingPlot[] = [];
    for (const [key, plot] of town.buildings) {
      const [q, r] = key.split(",").map(Number);
      if (axialDistance({ q, r }, coord) === ring) plots.push(plot);
    }
    if (plots.length > 0) return plots;
  }
  return [];
}
