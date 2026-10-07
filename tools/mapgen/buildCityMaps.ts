/**
 * Turns the georeferenced city definitions in `cities.ts` into playable hex
 * maps under `src/data/maps/`.
 *
 * Runs offline, never at app runtime: `npm run mapgen:cities`, eyeball the
 * ASCII previews it prints, commit the JSON. Same contract as the original
 * `generate.ts` — the map is data, and the game only ever reads it.
 *
 * THE CLASSIFICATION ORDER IS THE WHOLE DESIGN
 *
 * Each hex centre is projected to metres and tested in this order, first
 * match wins:
 *
 *   1. inside a river channel            -> river
 *   2. inside a river's brackish fringe  -> estuary
 *      or inside an authored estuary patch
 *   3. outside every landmass            -> coast   (open water)
 *   4. on land, close to open water,
 *      and inside a beach strip          -> beach
 *   5. anything else on land             -> land
 *
 * Rivers winning over the land/water test is what makes a river readable at
 * all. A channel traced down the middle of the gap between two landmasses
 * would otherwise come out as `coast` — visually a finger of open sea
 * reaching inland, which is both wrong and much worse to play on, because
 * `coast` hosts Breakwater and a river hosts Small Dam and Sand Mining.
 *
 * Estuary beating `coast` matters for the same reason in reverse: the
 * brackish fringe either side of a channel is where Mangrove and Khazan are
 * legal, and those two elements carry most of the campaign's teaching.
 *
 * WHAT THIS SCRIPT REFUSES TO WRITE
 *
 * A map missing any of the five terrain types would silently delete a whole
 * branch of the build menu and can make a level unwinnable. The validator at
 * the bottom treats that as a hard failure and exits non-zero rather than
 * writing the file — the same bar `tests/levels.test.ts` holds level data to,
 * applied one step earlier where the fix is cheaper.
 */
import fs from "node:fs";
import path from "node:path";
import { axialDistance, axialKey, axialToWorld, neighbor, type AxialCoord } from "../../src/core/hex";
import { MAX_TERRAIN_INSTANCES_PER_TYPE } from "../../src/render/instanceLimits";
import { CITIES, type CityDef } from "./cities";
import {
  beyondPolylineEnds,
  distanceToPolyline,
  pointInPolygon,
  positionAlongPolyline,
  project,
  sampleTapered,
  type LatLon,
  type Metres
} from "./geo";

const OUT_DIR = path.resolve(process.cwd(), "src/data/maps");

/**
 * Centre-to-centre distance between neighbouring hexes, in the world units
 * `axialToWorld` produces for `hexSize = 1`. A pointy-top hex of circumradius
 * 1 is sqrt(3) wide, and neighbours sit exactly that far apart.
 */
const HEX_SPACING_WORLD = Math.sqrt(3);

/** Minimum channel width that still renders as a connected watercourse. */
function minimumChannelWidth(metersPerHex: number): number {
  // A straight line through a hex grid is never further than the hex inradius
  // (half the centre spacing) from some hex centre, so a channel at least one
  // spacing wide always claims a connected run of tiles. Anything narrower
  // breaks into dashes.
  return metersPerHex;
}

interface ClassifiedTile {
  coord: AxialCoord;
  terrainId: string;
}

interface PreparedRiver {
  name: string;
  line: Metres[];
  widthsM: number[];
  fringeM: number;
}

interface PreparedCity {
  def: CityDef;
  landmasses: Metres[][];
  rivers: PreparedRiver[];
  estuaryPatches: { name: string; center: Metres; radiusM: number }[];
  beaches: { name: string; line: Metres[]; depthM: number }[];
}

function prepare(def: CityDef): PreparedCity {
  const toMetres = (p: LatLon): Metres => project(p, def.origin);
  const floor = minimumChannelWidth(def.metersPerHex);

  return {
    def,
    landmasses: def.landmasses.map((polygon) => polygon.map(toMetres)),
    rivers: def.rivers.map((river) => ({
      name: river.name,
      line: river.points.map(toMetres),
      // See `cities.ts`: real creek widths are far below one hex, so they are
      // raised to the smallest width the grid can draw continuously rather
      // than being allowed to disappear.
      widthsM: river.widthsM.map((w) => Math.max(w, floor)),
      fringeM: river.fringeM
    })),
    estuaryPatches: def.estuaryPatches.map((patch) => ({
      name: patch.name,
      center: toMetres(patch.center),
      radiusM: patch.radiusM
    })),
    beaches: def.beaches.map((beach) => ({
      name: beach.name,
      line: beach.points.map(toMetres),
      depthM: beach.depthM
    }))
  };
}

/**
 * The hex grid, as a true rectangle in world space.
 *
 * `axialToWorld` shears x by r/2, so a plain axial rectangle renders as a
 * parallelogram — the original `generate.ts` hit this and documents it at
 * length. Offsetting each row's q range by -floor(r/2) cancels the shear and
 * leaves only the ordinary half-hex stagger between adjacent rows.
 */
function buildGrid(cols: number, rows: number): AxialCoord[] {
  const rMin = -Math.floor(rows / 2);
  const rMax = rMin + rows - 1;
  const qMin = -Math.floor(cols / 2);

  const coords: AxialCoord[] = [];
  for (let r = rMin; r <= rMax; r++) {
    const rowQMin = qMin - Math.floor(r / 2);
    for (let q = rowQMin; q < rowQMin + cols; q++) coords.push({ q, r });
  }
  return coords;
}

/** A hex's centre on the local tangent plane: metres east, metres north of the map origin. */
function hexCentreMetres(coord: AxialCoord, metersPerHex: number): Metres {
  const world = axialToWorld(coord, 1);
  const metresPerWorldUnit = metersPerHex / HEX_SPACING_WORLD;
  return {
    x: world.x * metresPerWorldUnit,
    // World +z points away from the camera's "up", i.e. south. North is -z.
    y: -world.z * metresPerWorldUnit
  };
}

/** Nearest hex to a lat/lon, by brute-force search over the grid. Grids are a few hundred tiles, so this costs nothing and cannot get the rounding wrong. */
function nearestHex(target: LatLon, city: PreparedCity, grid: readonly AxialCoord[]): AxialCoord {
  const wanted = project(target, city.def.origin);
  let best = grid[0];
  let bestDistance = Infinity;
  for (const coord of grid) {
    const centre = hexCentreMetres(coord, city.def.metersPerHex);
    const distance = Math.hypot(centre.x - wanted.x, centre.y - wanted.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = coord;
    }
  }
  return best;
}

/**
 * Where a landmark's label belongs, and how far it had to move to get there.
 *
 * Almost every landmark in `cities.ts` is a coastal point — a beach, a fort on
 * a headland, a village on a river bank — so its real coordinates sit within a
 * few hundred metres of the waterline. At 400-520 m per hex the nearest hex to
 * such a point is as likely to be the water just offshore as the sand just
 * inshore, and a label reading "Colva Beach" planted on an open-sea tile is
 * simply wrong.
 *
 * So the label snaps to the nearest tile that is not open water, and the
 * distance it travelled is returned alongside. A snap of a tile or two is the
 * expected rounding; a long one means the traced coastline has genuinely
 * drifted away from a real anchor point, which is the authoring mistake worth
 * reporting — and the one that is otherwise invisible, because the map still
 * validates and still plays.
 */
function placeLandmark(
  target: LatLon,
  city: PreparedCity,
  grid: readonly AxialCoord[],
  terrainById: Map<string, string>
): { coord: AxialCoord; snappedBy: number } {
  const raw = nearestHex(target, city, grid);
  if (terrainById.get(axialKey(raw)) !== "coast") return { coord: raw, snappedBy: 0 };

  let best: AxialCoord | null = null;
  let bestDistance = Infinity;
  for (const coord of grid) {
    if (terrainById.get(axialKey(coord)) === "coast") continue;
    const distance = axialDistance(coord, raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = coord;
    }
  }
  return best ? { coord: best, snappedBy: bestDistance } : { coord: raw, snappedBy: Infinity };
}

function classify(centre: Metres, city: PreparedCity): string {
  // 1 & 2: rivers and their fringes, which outrank the land/water test.
  let estuaryFromRiver = false;
  for (const river of city.rivers) {
    // Each centreline starts at the mouth, not out at sea, so anything
    // beyond that first vertex is open water and belongs to the coast.
    if (beyondPolylineEnds(centre, river.line)) continue;
    const distance = distanceToPolyline(centre, river.line);
    const fraction = positionAlongPolyline(centre, river.line);
    const halfWidth = sampleTapered(river.widthsM, fraction) / 2;
    if (distance <= halfWidth) return "river";
    if (distance <= halfWidth + river.fringeM) estuaryFromRiver = true;
  }

  for (const patch of city.estuaryPatches) {
    if (Math.hypot(centre.x - patch.center.x, centre.y - patch.center.y) <= patch.radiusM) return "estuary";
  }
  if (estuaryFromRiver) return "estuary";

  // 3: anything not inside a landmass is open water.
  const onLand = city.landmasses.some((polygon) => pointInPolygon(centre, polygon));
  if (!onLand) return "coast";

  // 4: sand, where a beach strip says there is sand.
  for (const beach of city.beaches) {
    if (distanceToPolyline(centre, beach.line) <= beach.depthM) return "beach";
  }

  // 5.
  return "land";
}

export interface CityMapFile {
  id: string;
  name: string;
  region: string;
  blurb: string;
  /** Kept in the output so a reader can re-derive any tile's real-world position, and so a future regeneration is reproducible without re-reading this script. */
  geo: {
    originLat: number;
    originLon: number;
    metersPerHex: number;
    cols: number;
    rows: number;
  };
  /** Where the camera opens. */
  focus: AxialCoord;
  landmarks: { name: string; q: number; r: number }[];
  tiles: { q: number; r: number; terrainId: string }[];
}

function buildCity(def: CityDef): { file: CityMapFile; preview: string; problems: string[] } {
  const city = prepare(def);
  const grid = buildGrid(def.cols, def.rows);

  const tiles: ClassifiedTile[] = grid.map((coord) => ({
    coord,
    terrainId: classify(hexCentreMetres(coord, def.metersPerHex), city)
  }));

  const terrainById = new Map(tiles.map((t) => [axialKey(t.coord), t.terrainId]));

  const placedLandmarks = def.landmarks.map((landmark) => ({
    name: landmark.name,
    ...placeLandmark(landmark.at, city, grid, terrainById)
  }));

  const file: CityMapFile = {
    id: def.id,
    name: def.name,
    region: def.region,
    blurb: def.blurb,
    geo: {
      originLat: def.origin.lat,
      originLon: def.origin.lon,
      metersPerHex: def.metersPerHex,
      cols: def.cols,
      rows: def.rows
    },
    focus: nearestHex(def.focus, city, grid),
    landmarks: placedLandmarks.map((landmark) => ({ name: landmark.name, q: landmark.coord.q, r: landmark.coord.r })),
    tiles: tiles.map((t) => ({ q: t.coord.q, r: t.coord.r, terrainId: t.terrainId }))
  };

  return {
    file,
    preview: asciiPreview(def, tiles),
    problems: validate(def, tiles, placedLandmarks)
  };
}

const GLYPHS: Record<string, string> = {
  coast: "~",
  beach: ".",
  land: "#",
  river: "=",
  estuary: "o"
};

function asciiPreview(def: CityDef, tiles: ClassifiedTile[]): string {
  const rMin = Math.min(...tiles.map((t) => t.coord.r));
  const rMax = Math.max(...tiles.map((t) => t.coord.r));
  const byKey = new Map(tiles.map((t) => [axialKey(t.coord), t.terrainId]));

  const lines: string[] = [];
  for (let r = rMin; r <= rMax; r++) {
    const row = tiles.filter((t) => t.coord.r === r).sort((a, b) => a.coord.q - b.coord.q);
    // Each row is indented by half a cell relative to the last, matching the
    // real hex stagger, so the printed shape is the shape on screen.
    const indent = " ".repeat(r - rMin);
    lines.push(indent + row.map((t) => GLYPHS[t.terrainId] ?? "?").join(" "));
  }
  return lines.join("\n");
}

function validate(
  def: CityDef,
  tiles: ClassifiedTile[],
  landmarks: { name: string; snappedBy: number }[]
): string[] {
  const problems: string[] = [];
  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tile.terrainId, (counts.get(tile.terrainId) ?? 0) + 1);

  // Every terrain must be present, and present in a usable quantity. "At
  // least one" is not enough: a single estuary tile cannot host the four
  // Mangroves a level asks for.
  const minimums: Record<string, number> = { coast: 8, beach: 6, land: 12, river: 4, estuary: 6 };
  for (const [terrainId, minimum] of Object.entries(minimums)) {
    const actual = counts.get(terrainId) ?? 0;
    if (actual < minimum) problems.push(`${def.id}: only ${actual} ${terrainId} tiles (want at least ${minimum})`);
  }

  // A watercourse has to be continuous. Separate CREEKS are expected — Baga
  // creek and Nerul creek really are two different streams — so this counts
  // connected runs of river tiles and checks there are no more of them than
  // there are authored rivers, rather than demanding one network. What it
  // catches is a channel traced too narrow for the grid, which comes out as
  // a dashed line of orphan tiles.
  const riverTiles = tiles.filter((t) => t.terrainId === "river");
  const riverKeys = new Set(riverTiles.map((t) => axialKey(t.coord)));
  const seen = new Set<string>();
  const runs: number[] = [];
  for (const tile of riverTiles) {
    const startKey = axialKey(tile.coord);
    if (seen.has(startKey)) continue;
    seen.add(startKey);
    let size = 0;
    const queue: AxialCoord[] = [tile.coord];
    while (queue.length > 0) {
      const current = queue.shift()!;
      size++;
      for (let direction = 0; direction < 6; direction++) {
        const next = neighbor(current, direction);
        const key = axialKey(next);
        if (!riverKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push(next);
      }
    }
    runs.push(size);
  }
  if (runs.length > def.rivers.length) {
    problems.push(
      `${def.id}: ${def.rivers.length} river(s) authored but the tiles form ${runs.length} disconnected runs (${runs.join(", ")}) — a channel is narrower than one hex somewhere`
    );
  }

  // Wetlands do not have to join the channel — an isolated khazan pocket
  // behind a bund genuinely is cut off — but a lone estuary tile with no
  // neighbour cannot host anything meaningful.
  const estuaryKeys = new Set(tiles.filter((t) => t.terrainId === "estuary").map((t) => axialKey(t.coord)));
  let orphanEstuaries = 0;
  for (const key of estuaryKeys) {
    const [q, r] = key.split(",").map(Number);
    const touching = Array.from({ length: 6 }, (_, direction) => axialKey(neighbor({ q, r }, direction))).some(
      (neighbourKey) => estuaryKeys.has(neighbourKey) || riverKeys.has(neighbourKey)
    );
    if (!touching) orphanEstuaries++;
  }
  if (orphanEstuaries > 2) {
    problems.push(`${def.id}: ${orphanEstuaries} single-tile estuary patches with no neighbouring wetland`);
  }

  // `TerrainMeshManager` allocates one instanced-mesh pool per terrain type
  // and throws outright when a map overruns one. The constant is imported
  // from the renderer rather than copied, so the two cannot drift.
  for (const [terrainId, count] of counts) {
    if (count > MAX_TERRAIN_INSTANCES_PER_TYPE) {
      problems.push(
        `${def.id}: ${count} ${terrainId} tiles exceeds the renderer's per-type pool of ${MAX_TERRAIN_INSTANCES_PER_TYPE}`
      );
    }
  }

  // How far each landmark had to be nudged inshore to land on something that
  // is not open water. One or two tiles is the expected rounding for a
  // coastal point at this scale; further than that means the traced coastline
  // has drifted away from a real anchor, which is the authoring mistake that
  // would otherwise ship invisibly.
  for (const landmark of landmarks) {
    if (landmark.snappedBy > 2) {
      problems.push(
        `${def.id}: landmark "${landmark.name}" is ${landmark.snappedBy} tiles out to sea — check the traced coastline near it`
      );
    }
  }

  return problems;
}

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allProblems: string[] = [];
  const index: { id: string; name: string; region: string; tiles: number }[] = [];

  for (const def of CITIES) {
    const { file, preview, problems } = buildCity(def);

    const counts = new Map<string, number>();
    for (const tile of file.tiles) counts.set(tile.terrainId, (counts.get(tile.terrainId) ?? 0) + 1);

    console.log(`\n=== ${file.name} (${file.id}) — ${file.region} ===`);
    console.log(
      `${file.tiles.length} tiles @ ${def.metersPerHex} m/hex  ` +
        `(${((def.cols * def.metersPerHex) / 1000).toFixed(1)} x ${((def.rows * 0.866 * def.metersPerHex) / 1000).toFixed(1)} km)`
    );
    console.log(
      ["coast", "beach", "land", "river", "estuary"]
        .map((id) => `${GLYPHS[id]} ${id} ${counts.get(id) ?? 0}`)
        .join("   ")
    );
    console.log(preview);
    if (problems.length > 0) {
      console.log("PROBLEMS:");
      for (const problem of problems) console.log(`  - ${problem}`);
      allProblems.push(...problems);
    }

    fs.writeFileSync(path.join(OUT_DIR, `${file.id}.json`), `${JSON.stringify(file, null, 2)}\n`);
    index.push({ id: file.id, name: file.name, region: file.region, tiles: file.tiles.length });
  }

  console.log(`\nWrote ${index.length} city maps to ${path.relative(process.cwd(), OUT_DIR)}`);

  if (allProblems.length > 0) {
    console.error(`\n${allProblems.length} problem(s) found. The JSON was still written so the previews above can be compared against it, but fix these before relying on the maps.`);
    process.exitCode = 1;
  }
}

main();
