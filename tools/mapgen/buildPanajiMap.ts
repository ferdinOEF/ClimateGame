/**
 * Builds the Panaji board from the real map of Panjim.
 *
 * The board ships as flat coloured hexes, read offline out of the map image to
 * decide what each hex is: the coastline, the Mandovi, the creeks and wetlands,
 * the sand, and the sixteen landmarks standing where they really stand. A
 * crop of the same image, resampled onto the board's projection, also ships as
 * an optional street-map layer the player can show over the hexes
 * (`writeOverlay`); the game never fetches map tiles at runtime.
 *
 * WHAT CHANGED, AND WHY
 *
 * This board used to be a layout lifted from an earlier build's JS bundle:
 * 897 hand-placed tiles and sixteen landmark coordinates with no geography
 * behind them. It looked like a coastline, but it was not Panjim's, and the
 * landmarks were in invented places — Dhempe College nineteen columns east of
 * the church when it is in fact west of it, at Miramar; Dona Paula about as
 * far from the centre as Miramar when it is more than twice as far.
 *
 * So the board is now derived, not drawn:
 *
 *   1. `fetchPanajiBasemap.ts` renders the city from OpenStreetMap and records
 *      the exact geographic box the image covers.
 *   2. This script lays a hex grid over a chosen rectangle of that box, and
 *      asks the image what is at each hex centre — water, sand or land — by
 *      sampling the pixels inside the hex and taking the majority.
 *   3. `geocodePanaji.ts` supplies the landmarks as latitude and longitude,
 *      which land on the grid through the same projection.
 *
 * The consequence worth stating: the tiles and the landmarks are read from one
 * source through one projection, so they cannot disagree. A hex that says
 * "river" is a hex with the Mandovi drawn on it, and a monument at the
 * church's real coordinates stands on the tile the church is drawn on.
 *
 * READING WATER OUT OF A PICTURE
 *
 * Classifying "blue means water" is easy. The hard part is that this game
 * needs three kinds of water — open coast, river channel and estuary fringe —
 * and the map draws all three in one colour. Two rules separate them after the
 * fact, and neither can come from the picture:
 *
 *   - **The river is east of its mouth.** `RIVER_MOUTH` names the line across
 *     it. See that constant for why the obvious alternative, asking whether a
 *     water tile has banks on two sides, does not work on a board this narrow.
 *   - **An estuary is where a channel meets its bank.** River tiles touching
 *     land become estuary, which is both true of the Mandovi's tidal fringe
 *     and exactly where the game wants mangroves to be plantable.
 *
 * `npm run mapgen:basemap && npm run mapgen:geocode && npm run mapgen:panaji`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { axialKey, axialToWorld, neighbors, worldToAxial, type AxialCoord } from "../../src/core/hex";

const ROOT = path.resolve(process.cwd());
const BASEMAP_META = path.join(ROOT, "tools/mapgen/panajiBasemap.json");
const BASEMAP_IMAGE = path.join(ROOT, "tools/mapgen/panaji-basemap.jpg");
const PLACES = path.join(ROOT, "tools/mapgen/panajiPlaces.json");
const OUT = path.join(ROOT, "src/data/maps/panaji.json");
/** The OpenStreetMap layer the player can show over the board. Served from `public/`, so it ships. */
const OVERLAY_OUT = path.join(ROOT, "public/maps/panaji-osm.webp");
/** The path the game requests it at, relative to the site's base URL. */
const OVERLAY_URL = "maps/panaji-osm.webp";
/**
 * Pixel width of the shipped layer. The basemap has about 1,750 px across the
 * board, so this upsamples a little rather than inventing detail; it is the
 * texture size every phone handles without complaint. WebP quality is tuned to
 * keep the file at or under about 1.5 MB.
 */
const OVERLAY_WIDTH = 2048;
const OVERLAY_QUALITY = 0.8;

/**
 * The slice of the basemap that becomes playable board.
 *
 * Panjim and everything around it that a person from there would expect to
 * see: the Mandovi waterfront and the Betim bank across it along the top, the
 * Atal Setu and the river's estuary to the north-east, Aguada Bay and the
 * Miramar–Caranzalem–Dona Paula shore down the west, the Dona Paula headland
 * and the Zuari side along the bottom, and on the east the wetlands and creeks
 * of Taleigao, St Cruz and Merces.
 *
 * The east edge stops just inside the basemap's own (73.8721) so a hex on the
 * last column still has picture all round it to sample. The board used to end
 * at 73.84, which cut off at Patto and left out every creek east of the city.
 */
const BOARD = { north: 15.513, south: 15.446, west: 73.795, east: 73.87 };

/**
 * Metres to one world unit, which is what sets how big a hex is on the ground.
 *
 * 135 puts a hex at about 234 m across — a neighbourhood, not a building. That
 * is the right grain for this game: small enough that Campal, Altinho and
 * Fontainhas are different places, large enough that a board running from
 * Miramar to Merces is about 1,300 tiles. At the old 125 the same area would
 * be just over 1,500, which is more than a mid-range phone should be asked to
 * draw and more than a player can take in.
 */
const METRES_PER_UNIT = 135;

/** Hexes are authored at size 1, matching `HEX_SIZE` in the renderer. */
const HEX_SIZE = 1;

const METRES_PER_DEG_LAT = 110_574;
/** At 15.48°N. Constant rather than per-row: the board spans 0.067° of latitude, over which the cosine moves by 0.02%. */
const METRES_PER_DEG_LON = 111_320 * Math.cos((15.48 * Math.PI) / 180);

/**
 * How far from a hex centre to sample, as a fraction of the hex inradius.
 *
 * 0.8 rather than 1.0 so neighbouring hexes do not read each other's pixels.
 * Overlapping samples would blur a coastline into a band of tiles that are all
 * half water, and the majority vote would then turn on sub-pixel noise.
 */
const SAMPLE_RADIUS_FRACTION = 0.8;

/**
 * The line across the Mandovi's mouth that separates river from open sea.
 *
 * Two points on the water, read off the basemap: the north bank below Betim
 * and the south bank at the Campal end of the Panaji waterfront. They are
 * about 1.1 km apart, which is the Mandovi's width where it passes the city.
 *
 * Everything wet EAST of the line through them is the river; everything west
 * is the Arabian Sea. The first attempt at this split instead asked whether a
 * water tile had land on two opposite sides within nine hexes — a "does it
 * have banks" test — and it classified almost the whole sea as river, because
 * this board is only about twenty hexes wide and the sea always has Goa on one
 * side of it and the board edge on the other. Geography beats shape here: the
 * mouth is a real place and can simply be named.
 */
const RIVER_MOUTH = {
  north: { lat: 15.506, lon: 73.818 },
  south: { lat: 15.496, lon: 73.8162 }
};

/**
 * South of this latitude, water east of the mouth line is the Zuari side, not
 * the Mandovi.
 *
 * The mouth line above was drawn for a board that stopped at Dona Paula. The
 * extended board reaches the bay between Dona Paula and Goa University, which
 * is also east of that line and would otherwise be called river. It is open
 * water facing the Arabian Sea, so it stays coast. Every Mandovi creek on the
 * board — Ourem, St Inez, the St Cruz and Merces channels — is north of here.
 */
const ZUARI_SIDE_LAT = 15.463;

/**
 * When a tile that is not mostly water still belongs to the tidal system.
 *
 * OpenStreetMap draws three wet things that a "more than half blue" test
 * misses, and all three are what this board is about east of the city:
 *
 *   - **Creeks.** Ourem, and the channels through St Cruz and Merces, are 30 to
 *     80 m wide — a fifth of a hex. A creek tile is mostly bank by area.
 *   - **Marsh.** Drawn as blue dashes over pale farmland or green meadow. Only
 *     about a tenth of the pixels are blue, but the tile is a wetland all the
 *     same.
 *   - **Mangrove.** Drawn as tree symbols over a grey-green unique to it.
 *     No blue at all.
 *
 * A tile meeting any of these, with little city in it and no sand, becomes
 * estuary — but only if it connects to the river through other such tiles
 * (`spreadWetlands`). That is what stops a swimming pool in Altinho or a
 * waterfront street in Campal turning into mangrove ground.
 */
const WET = {
  creekWater: 0.12,
  marshWater: 0.05,
  marshGround: 0.5,
  mangrove: 0.3,
  maxBuilt: 0.35,
  maxSand: 0.2
};

/**
 * Named places that get a floating label but no building.
 *
 * Neighbourhoods and a bridge rather than monuments: there is no single
 * structure to draw for "Merces", and a label is what tells a player which
 * part of the board they are looking at. Positions are where OpenStreetMap
 * prints each name on the basemap, converted back through its projection —
 * the geocoder is not reachable from every machine this runs on, and the
 * label position is the one a player will be comparing against anyway.
 */
const PLACE_LABELS: { name: string; lat: number; lon: number }[] = [
  { name: "Caranzalem", lat: 15.4701, lon: 73.8068 },
  { name: "Taleigao", lat: 15.4726, lon: 73.8209 },
  { name: "St Cruz", lat: 15.4754, lon: 73.8444 },
  { name: "Merces", lat: 15.4847, lon: 73.8497 },
  { name: "Atal Setu", lat: 15.5031, lon: 73.8345 }
];

/** How far inland of the open sea the sand is widened to. */
const BEACH_BAND = 3;

/**
 * The stretch of shore the sand is widened along: Campal at the river mouth
 * down to Caranzalem, the Miramar–Caranzalem beach.
 *
 * Named rather than inferred, for the same reason as the river mouth. The
 * row walk in `widenBeach` finds the first dry tile west to east, which on the
 * old board was always this beach. The extended board also has the Betim and
 * Reis Magos bank to the north, the rocky Dona Paula headland and the
 * south-facing shore to Bambolim, and the walk would paint all of them sand.
 */
const BEACH_SHORE = { north: 15.494, south: 15.462 };

const GLYPHS: Record<string, string> = { coast: "~", beach: ".", land: "#", river: "=", estuary: "o" };

interface BasemapMeta {
  image: string;
  zoom: number;
  width: number;
  height: number;
  bounds: { north: number; south: number; west: number; east: number };
}

interface Place {
  id: string;
  name: string;
  category: string;
  kind: string;
  lat: number;
  lon: number;
  source: string;
}

// ---- projection -------------------------------------------------------

/** Web Mercator's y, as a plain number. Only ever used as a ratio against two other values of itself. */
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

/**
 * Where a latitude and longitude land on the hex grid's world plane.
 *
 * Hex (0,0) is the board's north-west corner, world +x runs east and world +z
 * runs south — which is what the renderer's camera already assumes, so no
 * axis has to be flipped anywhere downstream.
 */
function geoToWorld(lat: number, lon: number): { x: number; z: number } {
  return {
    x: ((lon - BOARD.west) * METRES_PER_DEG_LON) / METRES_PER_UNIT,
    z: ((BOARD.north - lat) * METRES_PER_DEG_LAT) / METRES_PER_UNIT
  };
}

function worldToGeo(x: number, z: number): { lat: number; lon: number } {
  return {
    lon: BOARD.west + (x * METRES_PER_UNIT) / METRES_PER_DEG_LON,
    lat: BOARD.north - (z * METRES_PER_UNIT) / METRES_PER_DEG_LAT
  };
}

/** Where a latitude and longitude land in the basemap image, in pixels. Mercator, because the image is a slippy-map mosaic. */
function geoToPixel(meta: BasemapMeta, lat: number, lon: number): { px: number; py: number } {
  const { bounds, width, height } = meta;
  const top = mercatorY(bounds.north);
  const bottom = mercatorY(bounds.south);
  return {
    px: ((lon - bounds.west) / (bounds.east - bounds.west)) * width,
    py: ((top - mercatorY(lat)) / (top - bottom)) * height
  };
}

// ---- the grid ---------------------------------------------------------

interface Cell {
  coord: AxialCoord;
  lat: number;
  lon: number;
  px: number;
  py: number;
  terrainId: string;
  /** Fractions of the sampled pixels, kept for the wetland pass after the water split. */
  share?: { water: number; sand: number; built: number; mangrove: number; pale: number; green: number };
}

/**
 * Every hex whose centre falls inside the board rectangle.
 *
 * Built by walking rows and asking each row which columns are in range, rather
 * than by taking a rectangle of (q, r). Axial rows shear east by half a column
 * each step, so a literal q-range would produce a parallelogram — a board
 * whose south-west corner is open sea it never meant to include and whose
 * north-east corner is cut off.
 */
function buildGrid(meta: BasemapMeta): Cell[] {
  const southZ = geoToWorld(BOARD.south, BOARD.west).z;
  const eastX = geoToWorld(BOARD.north, BOARD.east).x;

  const rowCount = Math.floor(southZ / (HEX_SIZE * 1.5));
  const cells: Cell[] = [];

  for (let r = 0; r <= rowCount; r++) {
    // Undo the row shear so every row starts at the board's west edge.
    const qStart = -Math.floor(r / 2);
    for (let q = qStart; ; q++) {
      const coord = { q, r };
      const { x, z } = axialToWorld(coord, HEX_SIZE);
      if (x < 0) continue;
      if (x > eastX) break;
      const { lat, lon } = worldToGeo(x, z);
      const { px, py } = geoToPixel(meta, lat, lon);
      cells.push({ coord, lat, lon, px, py, terrainId: "land" });
    }
  }

  return cells;
}

// ---- reading the picture ----------------------------------------------

type Reading = { water: number; sand: number; green: number; built: number; mangrove: number; pale: number };

/**
 * Asks a browser what colour the map is at each hex.
 *
 * Playwright rather than a PNG/JPEG decoder because the project already
 * depends on it and does not depend on an image library. The image goes in as
 * a data URL so the canvas stays untainted and `getImageData` is allowed.
 */
async function readBasemap(meta: BasemapMeta, cells: Cell[]): Promise<Reading[]> {
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(BASEMAP_IMAGE).toString("base64")}`;
  const inradiusMetres = HEX_SIZE * Math.sqrt(3) * 0.5 * METRES_PER_UNIT;
  const metresPerPixel = ((meta.bounds.east - meta.bounds.west) * METRES_PER_DEG_LON) / meta.width;
  const sampleRadiusPx = (inradiusMetres / metresPerPixel) * SAMPLE_RADIUS_FRACTION;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    /*
     * tsx compiles this file with esbuild's name-keeping on, which rewrites
     * every named function into a `__name(...)` call. That helper exists in
     * the Node module scope and not in the page, so a serialised function
     * carrying a named inner declaration throws `__name is not defined` the
     * moment Playwright evaluates it. Defining it as the identity function is
     * the whole fix: its only job was to set `Function.name`.
     */
    await page.setContent("<html><body></body></html>");
    // Passed as source text, not as a function: a function argument would be
    // compiled by the same pass that creates the problem and would arrive
    // needing `__name` in order to define `__name`.
    await page.evaluate("globalThis.__name = (fn) => fn;");

    return await page.evaluate(
      async ({ dataUrl, points, radius, width, height }) => {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("basemap failed to decode"));
          img.src = dataUrl;
        });

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, width, height).data;

        /*
         * The colours OpenStreetMap's standard style paints with.
         *
         * Thresholds rather than exact matches, because the basemap is a JPEG:
         * compression moves flat colour by a few counts and puts ringing
         * around every label and road casing. The tests below are written to
         * be the loosest thing that still separates the four categories.
         */
        function classify(r: number, g: number, b: number): "water" | "sand" | "green" | "built" | "mangrove" | "pale" {
          // Water is the only thing on the map that is markedly bluer than it
          // is red. Roads, buildings and labels are all neutral or warm. The
          // blue dashes OSM draws over marsh land here too, which is wanted.
          if (b - r > 22 && b > 165) return "water";
          // Sand is warm and pale with a clear blue deficit (about 250,235,
          // 195). The `b < g - 18` keeps white road fill (equal channels) out
          // of it, and `r - g >= 8` keeps out farmland and marsh (about 239,
          // 242,208), which are just as pale but not warm. Without that test
          // most of the sand this used to find was Taleigao's paddy fields.
          if (r > 238 && g > 220 && r - g >= 8 && b < g - 18) return "sand";
          // Mangrove: the muted grey-green (about 192,210,170) OSM puts under
          // its mangrove tree symbols. Darker and greyer than grass (205,235,
          // 176), redder than forest (172,209,158).
          if (r >= 182 && r <= 204 && g >= 200 && g <= 222 && b >= 155 && b <= 186 && g - r >= 8 && g - r <= 28) return "mangrove";
          // Everything else OSM draws as vegetation is green-dominant.
          if (g > r + 6 && g > b + 14) return "green";
          // The pale yellow-green of farmland and meadow (about 234,240,210),
          // which is what marsh dashes are drawn over. Not city: it must not
          // count against a tile the way buildings and roads do.
          if (r > 224 && g > 228 && Math.abs(r - g) < 8 && b > 185 && b < g - 10) return "pale";
          return "built";
        }

        const step = Math.max(1, Math.floor(radius / 6));
        return points.map(({ px, py }) => {
          const reading = { water: 0, sand: 0, green: 0, built: 0, mangrove: 0, pale: 0 };
          for (let dy = -radius; dy <= radius; dy += step) {
            for (let dx = -radius; dx <= radius; dx += step) {
              if (dx * dx + dy * dy > radius * radius) continue;
              const x = Math.round(px + dx);
              const y = Math.round(py + dy);
              if (x < 0 || y < 0 || x >= width || y >= height) continue;
              const i = (y * width + x) * 4;
              reading[classify(pixels[i], pixels[i + 1], pixels[i + 2])]++;
            }
          }
          return reading;
        });
      },
      {
        dataUrl,
        points: cells.map((cell) => ({ px: cell.px, py: cell.py })),
        radius: Math.max(2, Math.round(sampleRadiusPx)),
        width: meta.width,
        height: meta.height
      }
    );
  } finally {
    await browser.close();
  }
}

// ---- turning readings into terrain ------------------------------------

function classifyCells(cells: Cell[], readings: Reading[]): void {
  cells.forEach((cell, index) => {
    const reading = readings[index];
    const total = reading.water + reading.sand + reading.green + reading.built + reading.mangrove + reading.pale;
    if (total === 0) {
      cell.terrainId = "land";
      return;
    }
    cell.share = {
      water: reading.water / total,
      sand: reading.sand / total,
      built: reading.built / total,
      mangrove: reading.mangrove / total,
      pale: reading.pale / total,
      green: reading.green / total
    };
    // A majority of water, not a plurality. A tile that is 40% water and 60%
    // city is a waterfront street, and the game should let you build on it.
    cell.terrainId = reading.water / total > 0.5 ? "coast" : "land";
  });
}

/**
 * Separates river from open sea, then estuary from river.
 *
 * Everything wet arrives here as `coast`. The split is geographic rather than
 * inferred: the Mandovi is east of the line across its mouth, the Arabian Sea
 * is west of it, and `RIVER_MOUTH` says where that line is. River tiles that
 * touch a bank then become estuary, which is both true of the Mandovi's tidal
 * fringe and exactly where this game wants mangroves to be plantable.
 *
 * None of this can come from the picture, because OpenStreetMap draws sea,
 * river and tidal flat in one colour.
 */
function separateWater(cells: Cell[]): void {
  const byKey = new Map(cells.map((cell) => [axialKey(cell.coord), cell]));

  // Strictly land or beach. An earlier version asked "is this tile not coast",
  // which was true of river tiles too — so every river tile had a river
  // neighbour, every river tile looked like a bank, and the entire Mandovi
  // came out as estuary with no open channel left in the middle of it.
  const isBank = (coord: AxialCoord): boolean => {
    const cell = byKey.get(axialKey(coord));
    return cell !== undefined && (cell.terrainId === "land" || cell.terrainId === "beach");
  };

  /*
   * Which side of the mouth a point is on.
   *
   * The cross product of the mouth line against the point, in (lon, lat) taken
   * as plain x and y. The line runs south to north, so a positive result is
   * east of it. Nothing here needs real distance, only the sign.
   */
  const { north, south } = RIVER_MOUTH;
  const eastOfMouth = (lat: number, lon: number): boolean =>
    (north.lon - south.lon) * (lat - south.lat) - (north.lat - south.lat) * (lon - south.lon) < 0;

  const river = cells.filter(
    (cell) => cell.terrainId === "coast" && eastOfMouth(cell.lat, cell.lon) && cell.lat > ZUARI_SIDE_LAT
  );
  for (const cell of river) cell.terrainId = "river";

  /*
   * Water that cannot reach the open sea is not the sea.
   *
   * Flood-filled from every coast tile on the board's edge through other coast
   * tiles. Anything left over is a lake or a pond — Bandvol Lake, the tanks in
   * Taleigao — and is still water, so it joins the river set rather than
   * becoming a stretch of Arabian Sea stranded inland.
   */
  const rowsOf = new Map<number, Cell[]>();
  for (const cell of cells) {
    const row = rowsOf.get(cell.coord.r) ?? [];
    row.push(cell);
    rowsOf.set(cell.coord.r, row);
  }
  const rowKeys = [...rowsOf.keys()].sort((a, b) => a - b);
  const edge = new Set<string>();
  for (const r of rowKeys) {
    const row = rowsOf.get(r)!.sort((a, b) => a.coord.q - b.coord.q);
    edge.add(axialKey(row[0].coord));
    edge.add(axialKey(row[row.length - 1].coord));
    if (r === rowKeys[0] || r === rowKeys[rowKeys.length - 1]) for (const cell of row) edge.add(axialKey(cell.coord));
  }
  const open = new Set<string>();
  const queue = cells.filter((cell) => cell.terrainId === "coast" && edge.has(axialKey(cell.coord)));
  for (const cell of queue) open.add(axialKey(cell.coord));
  while (queue.length > 0) {
    const cell = queue.pop()!;
    for (const coord of neighbors(cell.coord)) {
      const next = byKey.get(axialKey(coord));
      if (!next || next.terrainId !== "coast" || open.has(axialKey(coord))) continue;
      open.add(axialKey(coord));
      queue.push(next);
    }
  }
  for (const cell of cells) {
    if (cell.terrainId === "coast" && !open.has(axialKey(cell.coord))) {
      cell.terrainId = "river";
      river.push(cell);
    }
  }

  // Estuary last, and over the river set computed above, so no tile is asked
  // whether its neighbour is a bank while that neighbour is still undecided.
  for (const cell of river) {
    if (neighbors(cell.coord).some((coord) => isBank(coord))) cell.terrainId = "estuary";
  }
}

/**
 * Turns creek, marsh and mangrove tiles connected to the river into estuary.
 *
 * Breadth-first from every river and estuary tile, through land tiles that
 * read as wet by the rules in `WET`. Connectivity is the important half: the
 * same reading on a tile with no path to the river — a park pond, a sports
 * ground with a pool — is not tidal and stays land.
 */
function spreadWetlands(cells: Cell[]): number {
  const byKey = new Map(cells.map((cell) => [axialKey(cell.coord), cell]));
  const isWet = (cell: Cell): boolean => {
    const share = cell.share;
    if (!share || cell.terrainId !== "land") return false;
    if (share.built > WET.maxBuilt || share.sand > WET.maxSand) return false;
    return (
      share.water >= WET.creekWater ||
      share.mangrove >= WET.mangrove ||
      (share.water >= WET.marshWater && share.pale + share.green + share.mangrove >= WET.marshGround)
    );
  };

  const queue = cells.filter((cell) => cell.terrainId === "river" || cell.terrainId === "estuary");
  let converted = 0;
  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const coord of neighbors(cell.coord)) {
      const next = byKey.get(axialKey(coord));
      if (!next || !isWet(next)) continue;
      next.terrainId = "estuary";
      converted++;
      queue.push(next);
    }
  }
  return converted;
}

/**
 * Widens the sand.
 *
 * The map's own beach polygons give about a dozen tiles of sand at this hex
 * size, which is a ribbon that mostly is not there. On a board where Dune,
 * Pandanus, Seawall and Beachside Resort ALL need sand, that is not enough
 * room to play the coastal half of the game.
 *
 * Walks each row inward from the open sea rather than using a column range,
 * because the coast here runs diagonally from Miramar down to Dona Paula — a
 * column range would paint sand into the water at one end and three tiles
 * inland at the other. It stops at anything that is not land, which is what
 * keeps the beach out of the Mandovi: on the rows where the river meets the
 * sea there is no shore to widen.
 */
function widenBeach(cells: Cell[]): number {
  const byKey = new Map(cells.map((cell) => [axialKey(cell.coord), cell]));
  const rows = [...new Set(cells.map((cell) => cell.coord.r))].sort((a, b) => a - b);
  let converted = 0;

  for (const r of rows) {
    const row = cells.filter((cell) => cell.coord.r === r).sort((a, b) => a.coord.q - b.coord.q);
    if (row[0].lat > BEACH_SHORE.north || row[0].lat < BEACH_SHORE.south) continue;
    let index = 0;
    while (index < row.length && row[index].terrainId === "coast") index++;
    // A row that is open sea all the way across, or dry land from its western
    // edge, has no shoreline on it to widen.
    if (index === 0 || index >= row.length) continue;

    for (let step = 0; step < BEACH_BAND && index + step < row.length; step++) {
      const cell = byKey.get(axialKey(row[index + step].coord))!;
      if (cell.terrainId !== "land" && cell.terrainId !== "beach") break;
      if (cell.terrainId === "land") converted++;
      cell.terrainId = "beach";
    }
  }

  return converted;
}

// ---- monuments --------------------------------------------------------

interface Monument {
  id: string;
  name: string;
  category: string;
  kind: string;
  q: number;
  r: number;
}

/**
 * Puts each landmark on the tile it stands on.
 *
 * Two corrections are applied to the raw projection, and both are necessary
 * rather than cosmetic:
 *
 *   - **Off the water.** A hex is 216 m across, so a building on a waterfront
 *     — Adil Shah Palace faces the Mandovi, Dona Paula is a jetty on a
 *     headland — can round into a tile the sampler called river. The nearest
 *     dry tile is still the right neighbourhood and is somewhere a building
 *     can stand.
 *   - **Off each other.** Don Bosco High School and Don Bosco College are
 *     about 100 m apart, which is inside one hex. Without this they would be
 *     one monument drawn twice in the same place, and `GameState.reserved`
 *     would silently hold one tile for two buildings.
 */
function placeMonuments(places: Place[], cells: Cell[]): { monuments: Monument[]; notes: string[] } {
  const byKey = new Map(cells.map((cell) => [axialKey(cell.coord), cell]));
  const taken = new Set<string>();
  const monuments: Monument[] = [];
  const notes: string[] = [];

  const isDry = (coord: AxialCoord): boolean => {
    const cell = byKey.get(axialKey(coord));
    return cell !== undefined && (cell.terrainId === "land" || cell.terrainId === "beach");
  };

  for (const place of places) {
    const { x, z } = geoToWorld(place.lat, place.lon);
    const ideal = worldToAxial(x, z, HEX_SIZE);

    // Rings outward from the true position, so a displaced monument moves the
    // shortest distance that satisfies both rules.
    let chosen: AxialCoord | null = null;
    search: for (let radius = 0; radius <= 4; radius++) {
      for (const coord of ringOrSelf(ideal, radius)) {
        const key = axialKey(coord);
        if (taken.has(key)) continue;
        if (!isDry(coord)) continue;
        chosen = coord;
        break search;
      }
    }

    if (!chosen) {
      notes.push(`${place.name}: no dry tile within 4 hexes of ${place.lat.toFixed(4)},${place.lon.toFixed(4)} — dropped`);
      continue;
    }

    const moved = hexDistance(ideal, chosen);
    if (moved > 0) {
      notes.push(`${place.name}: moved ${moved} hex${moved === 1 ? "" : "es"} to the nearest free dry tile`);
    }

    taken.add(axialKey(chosen));
    monuments.push({
      id: place.id,
      name: place.name,
      category: place.category,
      kind: place.kind,
      q: chosen.q,
      r: chosen.r
    });
  }

  return { monuments, notes };
}

function ringOrSelf(centre: AxialCoord, radius: number): AxialCoord[] {
  if (radius === 0) return [centre];
  const out: AxialCoord[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = -radius; dr <= radius; dr++) {
      const coord = { q: centre.q + dq, r: centre.r + dr };
      if (hexDistance(centre, coord) === radius) out.push(coord);
    }
  }
  return out;
}

function hexDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

// ---- looking at the result --------------------------------------------

/**
 * Draws the finished board back over the map it was read from.
 *
 * This is the only honest way to check the classification. An ASCII dump says
 * a tile is `coast`; it cannot say whether that tile is over the Arabian Sea
 * or over Campal. Painting the hexes onto the picture makes every disagreement
 * between the two visible at a glance, and it is how the river-mouth cut and
 * the sampling radius were actually settled.
 *
 * Written to the system temp directory rather than into the repo: it is a
 * thing to look at while changing this file, not an artefact the game needs.
 */
async function writePreview(meta: BasemapMeta, cells: Cell[], monuments: Monument[], outPath: string): Promise<void> {
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(BASEMAP_IMAGE).toString("base64")}`;
  const inradiusMetres = HEX_SIZE * Math.sqrt(3) * 0.5 * METRES_PER_UNIT;
  const metresPerPixel = ((meta.bounds.east - meta.bounds.west) * METRES_PER_DEG_LON) / meta.width;
  // Circumradius, not inradius: the polygon is drawn from its corners.
  const radiusPx = inradiusMetres / metresPerPixel / (Math.sqrt(3) / 2);

  const monumentPixels = monuments.map((monument) => {
    const { x, z } = axialToWorld({ q: monument.q, r: monument.r }, HEX_SIZE);
    const { lat, lon } = worldToGeo(x, z);
    return { ...geoToPixel(meta, lat, lon), name: monument.name };
  });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body></body></html>");
    await page.evaluate("globalThis.__name = (fn) => fn;");

    const png = await page.evaluate(
      async ({ dataUrl, hexes, markers, radius, width, height }) => {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("basemap failed to decode"));
          img.src = dataUrl;
        });

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);

        const FILL: Record<string, string> = {
          coast: "rgba(20,110,170,0.45)",
          river: "rgba(70,70,230,0.5)",
          estuary: "rgba(20,175,135,0.5)",
          beach: "rgba(245,190,55,0.55)",
          land: "rgba(70,150,60,0.3)"
        };

        for (const hex of hexes) {
          ctx.beginPath();
          for (let corner = 0; corner < 6; corner++) {
            // Pointy-top, matching the renderer: the first corner is due north.
            const angle = (Math.PI / 180) * (60 * corner - 90);
            const x = hex.px + radius * Math.cos(angle);
            const y = hex.py + radius * Math.sin(angle);
            if (corner === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          // Magenta is deliberately hideous: it means a terrain id arrived
          // here that this preview does not know about, which should be
          // impossible and should look impossible.
          ctx.fillStyle = FILL[hex.terrainId] ?? "rgba(255,0,255,0.7)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        for (const marker of markers) {
          ctx.beginPath();
          ctx.arc(marker.px, marker.py, radius * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(230,30,30,0.95)";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "white";
          ctx.stroke();

          ctx.font = "bold 21px sans-serif";
          ctx.lineWidth = 5;
          ctx.strokeStyle = "rgba(0,0,0,0.9)";
          ctx.strokeText(marker.name, marker.px + radius * 0.7, marker.py - radius * 0.6);
          ctx.fillStyle = "white";
          ctx.fillText(marker.name, marker.px + radius * 0.7, marker.py - radius * 0.6);
        }

        return canvas.toDataURL("image/png");
      },
      {
        dataUrl,
        hexes: cells.map((cell) => ({ px: cell.px, py: cell.py, terrainId: cell.terrainId })),
        markers: monumentPixels,
        radius: radiusPx,
        width: meta.width,
        height: meta.height
      }
    );

    const base64 = png.slice(png.indexOf(",") + 1);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
  } finally {
    await browser.close();
  }
}

// ---- the map layer ----------------------------------------------------

/**
 * Bakes the OpenStreetMap layer that can be shown over the hexes.
 *
 * Cut from the same basemap the board was read out of, exactly to the board's
 * bounds, and RESAMPLED onto the board's own projection. The board places
 * hexes linearly in latitude (`geoToWorld`), the basemap is Web Mercator; over
 * 0.067 degrees the two differ by well under a pixel, but resampling row by row
 * makes them identical rather than merely close, so the game can stretch the
 * image over the board's world rectangle with no projection maths of its own.
 * That rectangle is written into the map file from `geoToWorld` too: one
 * projection places the hexes, the landmarks and this picture.
 *
 * Nothing at runtime touches the OpenStreetMap tile server. This is a static
 * file served with the game.
 */
async function writeOverlay(meta: BasemapMeta): Promise<{ width: number; height: number; bytes: number }> {
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(BASEMAP_IMAGE).toString("base64")}`;
  const southEast = geoToWorld(BOARD.south, BOARD.east);
  const width = OVERLAY_WIDTH;
  const height = Math.round((OVERLAY_WIDTH * southEast.z) / southEast.x);

  // Source rectangle per output row, computed here so the page needs no maths.
  const left = geoToPixel(meta, BOARD.north, BOARD.west).px;
  const right = geoToPixel(meta, BOARD.north, BOARD.east).px;
  const rows: number[] = [];
  for (let row = 0; row < height; row++) {
    const lat = BOARD.north - ((row + 0.5) / height) * (BOARD.north - BOARD.south);
    rows.push(geoToPixel(meta, lat, BOARD.west).py);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body></body></html>");
    await page.evaluate("globalThis.__name = (fn) => fn;");
    const webp = await page.evaluate(
      async ({ dataUrl, width, height, left, right, rows, quality }) => {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("basemap failed to decode"));
          img.src = dataUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        rows.forEach((sourceY, row) => ctx.drawImage(image, left, sourceY - 0.5, right - left, 1, 0, row, width, 1));
        return canvas.toDataURL("image/webp", quality);
      },
      { dataUrl, width, height, left, right, rows, quality: OVERLAY_QUALITY }
    );
    const buffer = Buffer.from(webp.slice(webp.indexOf(",") + 1), "base64");
    fs.mkdirSync(path.dirname(OVERLAY_OUT), { recursive: true });
    fs.writeFileSync(OVERLAY_OUT, buffer);
    return { width, height, bytes: buffer.length };
  } finally {
    await browser.close();
  }
}

// ---- output -----------------------------------------------------------

function asciiPreview(cells: Cell[], monuments: Monument[]): string {
  const byKey = new Map(cells.map((cell) => [axialKey(cell.coord), cell.terrainId]));
  const monumentKeys = new Set(monuments.map((m) => axialKey({ q: m.q, r: m.r })));
  const qs = cells.map((cell) => cell.coord.q);
  const rows = [...new Set(cells.map((cell) => cell.coord.r))].sort((a, b) => a - b);
  const qMin = Math.min(...qs);
  const qMax = Math.max(...qs);

  const lines: string[] = [];
  for (const r of rows) {
    let line = "";
    for (let q = qMin; q <= qMax; q++) {
      const key = axialKey({ q, r });
      if (!byKey.has(key)) {
        line += " ";
        continue;
      }
      line += monumentKeys.has(key) ? "*" : (GLYPHS[byKey.get(key)!] ?? "?");
    }
    lines.push(`${String(r).padStart(3)} |${" ".repeat(Math.floor(r / 2))}${line}`);
  }
  return lines.join("\n");
}

function countTerrain(cells: Cell[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cell of cells) counts[cell.terrainId] = (counts[cell.terrainId] ?? 0) + 1;
  return counts;
}

async function main(): Promise<void> {
  const meta = JSON.parse(fs.readFileSync(BASEMAP_META, "utf8")) as BasemapMeta;
  const places = (JSON.parse(fs.readFileSync(PLACES, "utf8")) as { places: Place[] }).places;

  const cells = buildGrid(meta);
  console.log(`Grid: ${cells.length} hexes over ${BOARD.south}..${BOARD.north} N, ${BOARD.west}..${BOARD.east} E`);

  const readings = await readBasemap(meta, cells);
  classifyCells(cells, readings);
  console.log("after reading the map: ", JSON.stringify(countTerrain(cells)));

  separateWater(cells);
  console.log("after splitting water:  ", JSON.stringify(countTerrain(cells)));

  const wetlands = spreadWetlands(cells);
  console.log(`after wetlands:         ${JSON.stringify(countTerrain(cells))} (${wetlands} land tiles became estuary)`);

  const widened = widenBeach(cells);
  console.log(`after widening sand:    ${JSON.stringify(countTerrain(cells))} (${widened} land tiles became beach)`);

  const { monuments, notes } = placeMonuments(places, cells);

  /*
   * Where the camera opens.
   *
   * The board is about 61 by 55 world units, far too large to fit on screen at
   * a readable zoom, so the opening frame is a choice rather than the board's
   * geometric centre — which lands in the Taleigao fields. This point is the
   * old city between Campal and the church: the waterfront, the river mouth
   * and Fontainhas in one view, which is the shot that says "this is Panjim"
   * to someone who lives there.
   */
  const focusGeo = { lat: 15.4955, lon: 73.8255 };
  const focusWorld = geoToWorld(focusGeo.lat, focusGeo.lon);
  const focus = worldToAxial(focusWorld.x, focusWorld.z, HEX_SIZE);

  const rows = [...new Set(cells.map((cell) => cell.coord.r))];
  // The board's north-west corner is world (0,0) by construction; its
  // south-east corner is where the far edge of the layer goes.
  const overlayWorld = geoToWorld(BOARD.south, BOARD.east);
  const file = {
    id: "panaji",
    name: "Panaji",
    region: "Tiswadi, North Goa",
    blurb:
      "Goa's capital, on the south bank of the Mandovi where the river spreads into tidal flats before reaching the sea. The old city sits on reclaimed water, the creeks and wetlands of Taleigao, St Cruz and Merces wrap round it to the east, and the sand from Miramar to Caranzalem is all that stands between it and the Arabian Sea.",
    geo: {
      originLat: BOARD.north,
      originLon: BOARD.west,
      metersPerHex: METRES_PER_UNIT,
      cols: Math.max(...cells.map((cell) => cell.coord.q)) - Math.min(...cells.map((cell) => cell.coord.q)) + 1,
      rows: rows.length
    },
    /*
     * Where this board's geography came from.
     *
     * The game does not draw the basemap — the tiles are flat palette colours
     * — but the coastline, the river, the estuary and the sixteen landmark
     * positions were all read out of OpenStreetMap, which makes this board a
     * derived database and the ODbL credit a condition of shipping it. The
     * bounds are here so the board can be regenerated or checked against the
     * same piece of the world later.
     */
    source: {
      attribution: "© OpenStreetMap contributors",
      href: "https://www.openstreetmap.org/copyright",
      bounds: BOARD,
      metresPerUnit: METRES_PER_UNIT
    },
    focus,
    /*
     * The OpenStreetMap layer: where the image is, and the world rectangle it
     * covers. The rectangle comes from the same `geoToWorld` that placed every
     * hex, so the picture cannot drift from the board.
     */
    overlay: {
      image: OVERLAY_URL,
      world: { x: 0, z: 0, width: overlayWorld.x, depth: overlayWorld.z },
      attribution: "© OpenStreetMap contributors",
      href: "https://www.openstreetmap.org/copyright"
    },
    // Every monument is labelled, so those share one list rather than two
    // that could disagree; the neighbourhood labels follow, projected through
    // the same function as everything else.
    landmarks: [
      ...monuments.map((m) => ({ name: m.name, q: m.q, r: m.r })),
      ...PLACE_LABELS.map((label) => {
        const { x, z } = geoToWorld(label.lat, label.lon);
        return { name: label.name, ...worldToAxial(x, z, HEX_SIZE) };
      })
    ],
    monuments,
    tiles: cells.map((cell) => ({ q: cell.coord.q, r: cell.coord.r, terrainId: cell.terrainId }))
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);

  const overlay = await writeOverlay(meta);
  console.log(
    `Map layer: ${path.relative(ROOT, OVERLAY_OUT)} ${overlay.width}x${overlay.height}, ${(overlay.bytes / 1024).toFixed(0)} KB`
  );

  const previewPath = path.join(os.tmpdir(), "riptide-panaji-preview.png");
  await writePreview(meta, cells, monuments, previewPath);

  console.log(`\n=== Panaji ===`);
  console.log(`${cells.length} tiles, ${monuments.length} monuments, focus ${focus.q},${focus.r}`);
  console.log(asciiPreview(cells, monuments));
  console.log("\n~ coast  . beach  # land  = river  o estuary  * monument\n");
  for (const note of notes) console.log(`  note: ${note}`);

  const counts = countTerrain(cells);
  const missing = Object.keys(GLYPHS).filter((id) => !counts[id]);
  if (missing.length > 0) {
    console.error(`\nFAILED: the board has no ${missing.join(", ")} tiles`);
    process.exitCode = 1;
  } else if (monuments.length !== places.length) {
    console.error(`\nFAILED: ${places.length - monuments.length} monument(s) could not be placed`);
    process.exitCode = 1;
  } else {
    console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
  }

  console.log(`Overlay preview: ${previewPath}`);
}

main();
