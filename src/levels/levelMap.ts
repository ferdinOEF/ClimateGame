import legacyMapData from "@data/map.json";
import tutorialMap from "@data/maps/tutorial.json";
import panajiMap from "@data/maps/panaji.json";
import { axialDistance, type AxialCoord } from "@core/hex";
import type { PlacedTile } from "@core/gameState";
import type { LevelDef } from "./levels";

/**
 * The maps a level can be played on, and which one each level gets.
 *
 * This used to be a windowing function over a single authored coastline: one
 * 198-tile map, cropped to a radius that widened as the campaign went on. That
 * solved onboarding — 198 tiles with a storm inbound is too much to parse the
 * first time — but it meant every level was the same place, and the only thing
 * that changed between them was how much of it you could see.
 *
 * Now each level names a map. One is a teaching diagram; the other eight are
 * real stretches of the Goan coast, rasterised from traced coastlines, river
 * centrelines and beach strips by `tools/mapgen/buildCityMaps.ts`. The windowing
 * machinery is kept, because it is still the right answer for a level that wants
 * a corner of a large map, but no level uses it today — the city maps are
 * already sized to the level they belong to.
 *
 * WHAT STOPS A MAP SHIPPING BROKEN
 *
 * Two layers, deliberately separate:
 *
 *   - `buildCityMaps.ts` refuses to call a map finished if it is missing any of
 *     the five terrain types, or if a river has come out as a dashed line.
 *     That is about the geography being drawable.
 *   - `tests/levels.test.ts` checks each LEVEL's objectives against the tiles
 *     of the map it was assigned. That is about the level being winnable, which
 *     is a different question: a perfectly good map can still be the wrong one
 *     for a level that asks for four Mangroves.
 */

/**
 * Provenance for a board derived from real-world map data.
 *
 * Kept with the map rather than in a credits screen because the obligation
 * travels with the data: a map that carries this has to show the attribution
 * wherever it is played.
 */
export interface MapSource {
  /** What the credit line reads, shown in the corner of the board. */
  attribution: string;
  /** A link for the credit to point at. */
  href?: string;
  /** The geographic box the board was read out of, for regenerating or checking it. */
  bounds: { north: number; south: number; west: number; east: number };
  /** Ground metres to one world unit, which is what sets how big a hex is. */
  metresPerUnit: number;
}

/**
 * A picture of the real place that can be shown over the board.
 *
 * Baked offline from OpenStreetMap by the map's generator and served as a
 * static file — the game never calls a tile server. `world` is the rectangle
 * of the board's world plane the image covers, written by the same projection
 * that placed the hexes, so drawing the image over exactly that rectangle is
 * all the alignment there is.
 */
export interface MapOverlay {
  /** Path under the site's base URL, e.g. `maps/panaji-osm.webp`. */
  image: string;
  /** The geographic box the image covers: the board plus a margin round it. */
  bounds?: { north: number; south: number; west: number; east: number };
  /** World x/z of the image's top-left (north-west) corner, and its size. +x is east, +z is south. */
  world: { x: number; z: number; width: number; depth: number };
  attribution: string;
  href?: string;
}

/** A place a level is played on. */
export interface GameMap {
  id: string;
  /** Shown on the level card, the HUD and the level brief. */
  name: string;
  /** Administrative region, or a plain statement that the map is synthetic. */
  region: string;
  /** Real-world context, shown when the level opens. */
  blurb: string;
  /**
   * Where this map sits on Earth, for the maps that sit anywhere. Absent on
   * the tutorial, which is a diagram — claiming a latitude for it in the data
   * would be a lie a later reader would have to disprove.
   */
  geo?: {
    originLat: number;
    originLon: number;
    metersPerHex: number;
    cols: number;
    rows: number;
  };
  /** Where the camera opens, and the centre any `mapRadius` window is measured from. */
  focus: AxialCoord;
  /**
   * Where this board's geography came from, for the maps that are real places.
   *
   * Absent on the tutorial, which is a diagram of a coastline that does not
   * exist anywhere; claiming a source for it would be inventing provenance for
   * a teaching aid.
   *
   * This is not decoration. The Panaji coastline, river, estuary and sixteen
   * landmark positions were all read out of OpenStreetMap, whose ODbL licence
   * asks for a credit on anything derived from it. `attribution` is what the
   * game puts on screen to pay that, and `bounds` records exactly which piece
   * of the world was read, so the board can be regenerated or checked later.
   */
  source?: MapSource;
  /** An OpenStreetMap layer the player can show over the hexes. Absent on maps without one. */
  overlay?: MapOverlay;
  /** Real places on the board, used for the floating place labels. */
  landmarks: { name: string; q: number; r: number }[];
  /**
   * Historic buildings that stand on the board permanently.
   *
   * Decorative and immovable: they grant nothing, take no damage and cannot be
   * removed, but their tile cannot be built on (see `GameState.reserved`).
   * `kind` selects which building the renderer draws — see
   * `src/render/monumentGeometry.ts`.
   */
  monuments: { id: string; name: string; category: string; kind: string; q: number; r: number }[];
  tiles: PlacedTile[];
}

/** The shape `src/data/maps/*.json` is written in. */
interface MapFileShape {
  id: string;
  name: string;
  region: string;
  blurb: string;
  geo?: GameMap["geo"];
  source?: MapSource;
  overlay?: MapOverlay;
  focus: { q: number; r: number };
  landmarks: { name: string; q: number; r: number }[];
  monuments?: { id: string; name: string; category: string; kind: string; q: number; r: number }[];
  tiles: { q: number; r: number; terrainId: string }[];
}

function fromFile(file: unknown): GameMap {
  const data = file as MapFileShape;
  return {
    id: data.id,
    name: data.name,
    region: data.region,
    blurb: data.blurb,
    geo: data.geo,
    source: data.source,
    overlay: data.overlay,
    focus: { q: data.focus.q, r: data.focus.r },
    landmarks: data.landmarks ?? [],
    monuments: data.monuments ?? [],
    tiles: data.tiles.map((tile) => ({ coord: { q: tile.q, r: tile.r }, terrainId: tile.terrainId }))
  };
}

/**
 * The original procedurally generated coastline, kept as a playable map.
 *
 * Nothing in the campaign points at it any more, but it is still what
 * `tools/mapgen/generate.ts` writes and what `tests/mapgen.test.ts` verifies,
 * and the daily challenge can legitimately roll onto it. Deleting it would
 * throw away a working map to save nine lines.
 */
const LEGACY_MAP: GameMap = (() => {
  const data = legacyMapData as unknown as {
    estuary: { q: number; r: number };
    startingClaim: { q: number; r: number }[];
    tiles: { q: number; r: number; terrainId: string }[];
  };

  // The old map has no authored focus point. Its starting claim is where play
  // always began and where the camera already framed itself, so its centroid
  // is the honest equivalent — rounded to a whole hex, because a fractional
  // centre makes a radius comparison lopsided by half a tile in one direction.
  const claim = data.startingClaim;
  const focus =
    claim.length === 0
      ? { q: 0, r: 0 }
      : {
          q: Math.round(claim.reduce((sum, c) => sum + c.q, 0) / claim.length),
          r: Math.round(claim.reduce((sum, c) => sum + c.r, 0) / claim.length)
        };

  return {
    id: "goa-coast",
    name: "The Goa Coast",
    region: "Generated coastline",
    blurb:
      "The original generated coast: sea, sand, a winding river and a floodplain strung along its bends. Not a particular place — the shape every stretch of this coast shares.",
    focus,
    landmarks: [],
    monuments: [],
    tiles: data.tiles.map((tile) => ({ coord: { q: tile.q, r: tile.r }, terrainId: tile.terrainId }))
  };
})();

/**
 * The maps the game can load.
 *
 * Seven other Goan coasts were generated in an earlier pass and are still on
 * disk under `src/data/maps/`, along with the coordinates they were built
 * from in `tools/mapgen/cities.ts`. They are deliberately NOT imported: the
 * campaign is Panaji only now, and an unused JSON import is about 23 KB of
 * dead weight in the bundle each. Re-adding one is a line here plus a line in
 * `levels.json`.
 */
export const GAME_MAPS: GameMap[] = [fromFile(tutorialMap), fromFile(panajiMap), LEGACY_MAP];

const MAP_BY_ID = new Map(GAME_MAPS.map((map) => [map.id, map]));

/** Every map that depicts a real place, in campaign order. Drives the "where you have played" list on the menu. */
export const REAL_PLACE_MAPS: GameMap[] = GAME_MAPS.filter((map) => map.geo !== undefined);

export function mapById(id: string): GameMap | null {
  return MAP_BY_ID.get(id) ?? null;
}

/**
 * The map a level plays on.
 *
 * Falls back to the legacy coast for an unknown id rather than throwing. A
 * level pointing at a map that does not exist is a data bug, and
 * `tests/levels.test.ts` fails on it — but at runtime, dropping a player onto
 * a working coast beats a blank screen, and the console warning is what a
 * developer will actually notice.
 */
export function mapForLevel(level: Pick<LevelDef, "mapId">): GameMap {
  const map = level.mapId ? mapById(level.mapId) : null;
  if (map) return map;
  if (level.mapId) console.warn(`[levelMap] unknown map id "${level.mapId}"; falling back to the generated coast`);
  return LEGACY_MAP;
}

/**
 * The tiles a level plays on.
 *
 * `mapRadius` crops the map to a window around its focus point — the
 * onboarding aid described at the top of this file. `null` (every level today)
 * means the whole map.
 */
export function tilesForLevel(level: Pick<LevelDef, "mapId" | "mapRadius">): PlacedTile[] {
  const map = mapForLevel(level);
  if (level.mapRadius === null || level.mapRadius === undefined) return map.tiles;
  return map.tiles.filter((tile) => axialDistance(tile.coord, map.focus) <= level.mapRadius!);
}

/** Terrain counts for a tile set — used by the level-data tests to prove a level's objectives are physically achievable on its own map. */
export function terrainCounts(tiles: readonly PlacedTile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tile.terrainId, (counts.get(tile.terrainId) ?? 0) + 1);
  return counts;
}
