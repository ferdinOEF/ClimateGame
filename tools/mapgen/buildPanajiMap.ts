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
import path from "node:path";
import { chromium } from "playwright";
import { axialKey, axialToWorld, neighbor, neighbors, worldToAxial, type AxialCoord } from "../../src/core/hex";

const ROOT = path.resolve(process.cwd());
const BASEMAP_META = path.join(ROOT, "tools/mapgen/panajiBasemap.json");
const BASEMAP_IMAGE = path.join(ROOT, "tools/mapgen/panaji-basemap.jpg");
const PLACES = path.join(ROOT, "tools/mapgen/panajiPlaces.json");
const OUT = path.join(ROOT, "src/data/maps/panaji.json");
/** Debug images for checking the board by eye. Checked in, never shipped (not under `public/`). */
const DEBUG_DIR = path.join(ROOT, "tools/mapgen/debug");
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

/**
 * The street-map layer covers the board plus about 1.2 km round it, as far as
 * the basemap reaches, so the decorative ground past the edge of play
 * (`BoardSkirtManager`) shows the real surroundings — Porvorim, Reis Magos,
 * the open bay — instead of the board's edge smeared outwards. The basemap
 * stops close to the board on the south and east, so the margin is thinner
 * there and the shader fades the map out past it.
 */
const OVERLAY_MARGIN_DEG = 0.011;
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
 * 0.95: nearly the whole hex. The classes are counted, not majority-voted, so
 * a hex has to be read edge to edge for "a third of it is sea" to mean what it
 * says. Just short of 1.0 so neighbours do not read each other's pixels.
 */
const SAMPLE_RADIUS_FRACTION = 0.95;

/**
 * The minority-wins share. If this much of a hex is sand, water or wetland in
 * the picture, the hex takes that class even though most of it is something
 * else.
 *
 * A plain majority vote was what put the south shore on land tiles: the coast
 * from Dona Paula to Bambolim runs diagonally through the hexes, so most shore
 * hexes are 30–45% sea and every one of them lost the vote. The same rule
 * erased the Miramar sand (a strip narrower than a hex) and the edges of the
 * Taleigao marsh. Rare classes win from a third because a third of a hex is
 * 80 m of real sand, water or marsh, which is plenty to plant on.
 */
const MINORITY_SHARE = 0.3;

/**
 * Sand gets a lower bar than the rest. OpenStreetMap draws the Miramar to
 * Dona Paula beach as a strip about 50 m wide, a fifth of a hex, so no hex is
 * ever a third sand. Sand is also the one class with no false positives on
 * this image (checked: every hex over 8% sand is on that shore or at the river
 * mouth), so a low bar costs nothing.
 */
const SAND_SHARE = 0.08;

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
 * Paddy: khazan farmland next to the wetlands.
 *
 * OSM draws paddy as plain farmland, the same pale colour as any field, so it
 * cannot be told apart by colour. What makes a field khazan is where it is:
 * low land at the edge of the tidal marsh. So a field becomes estuary only if
 * it is mostly farmland, has little city in it, and is within `PADDY_REACH`
 * hexes of real wetland or water, reached through other such fields.
 */
const PADDY = { minFarmland: 0.45, maxBuilt: 0.3, reach: 2 };

/**
 * Named places that get a floating label but no building.
 *
 * Neighbourhoods and a bridge rather than monuments: there is no single
 * structure to draw for "Merces", and a label is what tells a player which
 * part of the board they are looking at. Positions are the centres of the
 * names as OpenStreetMap prints them on the basemap, measured on the image at
 * full resolution and converted back through its projection (the Atal Setu at
 * the middle of its deck over the Mandovi). An earlier pass read these off a
 * downscaled view and put every one 230–480 m north-west of its label.
 */
const PLACE_LABELS: { name: string; lat: number; lon: number }[] = [
  { name: "Caranzalem", lat: 15.4677, lon: 73.808 },
  { name: "Taleigao", lat: 15.4702, lon: 73.8226 },
  { name: "St Cruz", lat: 15.4731, lon: 73.8468 },
  { name: "Merces", lat: 15.4829, lon: 73.8538 },
  { name: "Atal Setu", lat: 15.5028, lon: 73.8366 }
];

/**
 * Locality names for the label layer (ui/mapLabels.ts), drawn in our own ink
 * above the board rather than read off the raster.
 *
 * Rank 1 is a major locality, always a candidate for a label; rank 2 a minor
 * one, shown only when the camera is close. Positions are the centres of the
 * names as OpenStreetMap prints them on the basemap
 * (`tools/mapgen/panaji-basemap.jpg`), measured at full resolution and
 * converted back through its projection, the same method as `PLACE_LABELS`.
 * A locality whose position falls outside the board is left out rather than
 * moved onto it. Atal Setu is a bridge, not a locality; it is kept as a minor
 * label because the board has always named it.
 */
const LOCALITIES: { name: string; lat: number; lon: number; rank: 1 | 2 }[] = [
  { name: "Campal", lat: 15.4933, lon: 73.8195, rank: 1 },
  { name: "Altinho", lat: 15.4878, lon: 73.8262, rank: 1 },
  { name: "Fontainhas", lat: 15.4967, lon: 73.831, rank: 1 },
  { name: "Miramar", lat: 15.4828, lon: 73.8093, rank: 1 },
  { name: "Taleigao", lat: 15.4702, lon: 73.8226, rank: 1 },
  { name: "St Cruz", lat: 15.4731, lon: 73.8468, rank: 1 },
  { name: "Merces", lat: 15.4829, lon: 73.8538, rank: 1 },
  { name: "Dona Paula", lat: 15.4582, lon: 73.8047, rank: 1 },
  { name: "Sao Tome", lat: 15.4994, lon: 73.8322, rank: 2 },
  { name: "Patto", lat: 15.4952, lon: 73.8354, rank: 2 },
  { name: "Santa Inez", lat: 15.4869, lon: 73.8175, rank: 2 },
  { name: "Caranzalem", lat: 15.4677, lon: 73.808, rank: 2 },
  { name: "Ribandar", lat: 15.5029, lon: 73.8656, rank: 2 },
  { name: "Atal Setu", lat: 15.5028, lon: 73.8366, rank: 2 }
];

/**
 * The four zones the Panjim 2050 challenges resolve through, as polygons in
 * latitude and longitude traced around real places.
 *
 *   Z1  the beach strip: Campal, Miramar, Caranzalem down to Dona Paula, with
 *       a row of sea in front and a couple of rows of town behind. A cyclone
 *       makes landfall here.
 *   Z2  the Taleigao plain and the St Cruz and Merces wetlands. A cyclone
 *       that gets past the beach runs on into it; the monsoon flood starts
 *       here as rain off the plain.
 *   Z3  the Ourem creek and Fontainhas: the channel the flood drains down.
 *   Z4  the Mandovi waterfront and the old city centre: where the flood ends
 *       up, and where the compound storm's surge comes up the river.
 *
 * A tile in two polygons takes the first listed, so the city centre (Z4) and
 * the creek (Z3) keep their edges against the larger zones around them.
 */
const ZONES: { id: string; name: string; polygon: [number, number][] }[] = [
  {
    id: "z4",
    name: "Mandovi waterfront",
    polygon: [
      [15.507, 73.817], [15.507, 73.838], [15.4995, 73.837], [15.499, 73.829],
      [15.494, 73.8285], [15.493, 73.82], [15.496, 73.818]
    ]
  },
  {
    id: "z3",
    name: "Ourem creek and Fontainhas",
    polygon: [
      [15.499, 73.829], [15.4995, 73.837], [15.495, 73.842], [15.487, 73.844],
      [15.484, 73.836], [15.488, 73.83], [15.494, 73.8285]
    ]
  },
  {
    id: "z1",
    name: "Miramar to Dona Paula beach",
    polygon: [
      [15.496, 73.814], [15.4955, 73.8195], [15.48, 73.8135], [15.466, 73.8125],
      [15.456, 73.808], [15.4515, 73.804], [15.45, 73.799], [15.46, 73.799],
      [15.475, 73.801], [15.49, 73.808]
    ]
  },
  {
    id: "z2",
    name: "Taleigao, St Cruz and Merces wetlands",
    polygon: [
      [15.479, 73.8145], [15.484, 73.829], [15.487, 73.844], [15.492, 73.856],
      [15.486, 73.865], [15.47, 73.856], [15.462, 73.84], [15.462, 73.82],
      [15.468, 73.814]
    ]
  }
];

/** Ray-casting point-in-polygon on [lat, lon] pairs. */
function insidePolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    if (lonI > lon !== lonJ > lon && lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI) inside = !inside;
  }
  return inside;
}

/** Which tiles fall in each zone, first polygon wins. */
function assignZones(cells: Cell[]): { id: string; name: string; tiles: [number, number][] }[] {
  const zones = ZONES.map((zone) => ({ id: zone.id, name: zone.name, tiles: [] as [number, number][] }));
  for (const cell of cells) {
    const index = ZONES.findIndex((zone) => insidePolygon(cell.lat, cell.lon, zone.polygon));
    if (index >= 0) zones[index].tiles.push([cell.coord.q, cell.coord.r]);
  }
  // Listed in path order (Z1 to Z4) in the file.
  return zones.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * How far inland of the open sea the sand is widened to: the shoreline row
 * only, which fills gaps in the strip where a hex happened to straddle less
 * than `SAND_SHARE` of it. It used to be three rows, which painted Miramar's
 * road and houses as sand.
 */
const BEACH_BAND = 1;

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
  share?: { water: number; sand: number; built: number; mangrove: number; pale: number; green: number; marsh: number };
  /** Share of the hex covered by a major road's fill (motorway, trunk, primary, secondary). */
  roadShare?: number;
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

type Reading = { water: number; sand: number; green: number; built: number; mangrove: number; pale: number; marsh: number; road: number; samples: number };

/**
 * Asks a browser what the map shows under each hex.
 *
 * Playwright rather than a PNG/JPEG decoder because the project already
 * depends on it and does not depend on an image library. The image goes in as
 * a data URL so the canvas stays untainted and `getImageData` is allowed.
 *
 * Two passes. First every pixel of the image gets a class from its colour.
 * Then blue pixels are split by how much blue surrounds them: solid blue is
 * water, sparse blue is the dash pattern OSM draws over marsh, so the dashes
 * and the meadow or farmland they are drawn on both count as marsh. A hex is
 * then read from a dense grid of samples (every 2 px, about 450 per hex),
 * which is what lets a class that covers only a third of a hex be seen at all.
 */
/** Two neighbouring hexes, for measuring how much of the line between their centres is road. */
type Pair = { a: number; b: number };

async function readBasemap(meta: BasemapMeta, cells: Cell[], pairs: Pair[] = []): Promise<{ readings: Reading[]; links: number[] }> {
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
      async ({ dataUrl, points, pairs, radius, width, height }) => {
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
         * around every label and road casing.
         */
        const WATER = 0, SAND = 1, MANGROVE = 2, GREEN = 3, PALE = 4, BUILT = 5, MARSH = 6;
        const classOf = new Uint8Array(width * height);
        /*
         * Major roads, by the fill colours OSM's standard style paints them:
         * motorway (232,146,162), trunk (249,178,156), primary (252,214,164)
         * and secondary (247,250,191). Tertiary and smaller roads are white,
         * which labels and building outlines share, so they are left out: the
         * board only wants the roads a player would name. A secondary road's
         * green is at least its red; sand's is lower, which keeps the beach
         * from reading as road.
         */
        const isRoad = new Uint8Array(width * height);
        const ROAD_FILLS = [[232, 146, 162], [249, 178, 156], [252, 214, 164], [247, 250, 191]];
        const blue = new Uint8Array(width * height);
        for (let i = 0, p = 0; i < classOf.length; i++, p += 4) {
          const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
          let c: number;
          // Water is the only thing on the map that is markedly bluer than it
          // is red. Roads, buildings and labels are all neutral or warm.
          if (b - r > 22 && b > 165) c = WATER;
          // Sand is warm and pale with a clear blue deficit (about 250,235,
          // 195). `r - g >= 8` keeps out farmland and marsh (about 239,242,
          // 208), which are just as pale but not warm.
          else if (r > 238 && g > 220 && r - g >= 8 && b < g - 18) c = SAND;
          // Mangrove: the muted grey-green (about 192,210,170) under OSM's
          // mangrove tree symbols. Darker and greyer than grass (205,235,176),
          // redder than forest (172,209,158).
          else if (r >= 182 && r <= 204 && g >= 200 && g <= 222 && b >= 155 && b <= 186 && g - r >= 8 && g - r <= 28) c = MANGROVE;
          // Everything else OSM draws as vegetation is green-dominant.
          else if (g > r + 6 && g > b + 14) c = GREEN;
          // The pale yellow-green of farmland and meadow (about 234,240,210).
          // Around Taleigao and St Cruz this is the khazan paddy.
          else if (r > 224 && g > 228 && Math.abs(r - g) < 8 && b > 185 && b < g - 10) c = PALE;
          else c = BUILT;
          classOf[i] = c;
          blue[i] = c === WATER ? 1 : 0;
          for (let k = 0; k < ROAD_FILLS.length; k++) {
            const fill = ROAD_FILLS[k];
            if (Math.abs(r - fill[0]) < 10 && Math.abs(g - fill[1]) < 10 && Math.abs(b - fill[2]) < 12 && (k < 3 || g >= r - 3)) {
              isRoad[i] = 1;
              break;
            }
          }
        }

        // Blue density in a 15 px window (about 70 m), from a summed-area table.
        const W = width + 1;
        const sat = new Uint32Array(W * (height + 1));
        for (let y = 0; y < height; y++) {
          let row = 0;
          for (let x = 0; x < width; x++) {
            row += blue[y * width + x];
            sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
          }
        }
        const HALF = 7;
        const density = (x: number, y: number): number => {
          const x0 = Math.max(0, x - HALF), y0 = Math.max(0, y - HALF);
          const x1 = Math.min(width, x + HALF + 1), y1 = Math.min(height, y + HALF + 1);
          const sum = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0];
          return sum / ((x1 - x0) * (y1 - y0));
        };
        // Marsh: blue that is sparse around it (the dashes themselves), or
        // ground that has a sprinkling of blue around it (what they are drawn
        // on). Solid water stays water; a creek fifteen pixels wide is still
        // more than half blue in its own window.
        const finalClass = (x: number, y: number): number => {
          const c = classOf[y * width + x];
          if (c === BUILT || c === SAND) return c;
          const d = density(x, y);
          if (c === WATER) return d < 0.35 ? MARSH : WATER;
          if (d >= 0.04 && d < 0.35) return MARSH;
          return c;
        };

        /*
         * For each pair of neighbouring hexes, the share of the line between
         * their centres that runs along a road (a road pixel within 4 px of
         * each sample). A road that really links two hexes covers most of that
         * line; two hexes that merely both touch a road do not.
         */
        const nearRoad = (x: number, y: number): boolean => {
          for (let dy = -4; dy <= 4; dy += 2) {
            for (let dx = -4; dx <= 4; dx += 2) {
              const sx = Math.round(x + dx);
              const sy = Math.round(y + dy);
              if (sx >= 0 && sy >= 0 && sx < width && sy < height && isRoad[sy * width + sx]) return true;
            }
          }
          return false;
        };
        const links = pairs.map(({ a, b }) => {
          const pa = points[a];
          const pb = points[b];
          let hits = 0;
          const samples = 16;
          for (let i = 1; i < samples; i++) {
            const t = i / samples;
            if (nearRoad(pa.px + (pb.px - pa.px) * t, pa.py + (pb.py - pa.py) * t)) hits++;
          }
          return hits / (samples - 1);
        });

        const readings = points.map(({ px, py }) => {
          const reading = { water: 0, sand: 0, green: 0, built: 0, mangrove: 0, pale: 0, marsh: 0, road: 0, samples: 0 };
          const keys = ["water", "sand", "mangrove", "green", "pale", "built", "marsh"] as const;
          for (let dy = -radius; dy <= radius; dy += 2) {
            for (let dx = -radius; dx <= radius; dx += 2) {
              if (dx * dx + dy * dy > radius * radius) continue;
              const x = Math.round(px + dx);
              const y = Math.round(py + dy);
              if (x < 0 || y < 0 || x >= width || y >= height) continue;
              reading[keys[finalClass(x, y)]]++;
              reading.samples++;
              if (isRoad[y * width + x]) reading.road++;
            }
          }
          return reading;
        });
        return { readings, links };
      },
      {
        dataUrl,
        points: cells.map((cell) => ({ px: cell.px, py: cell.py })),
        pairs,
        radius: Math.max(2, Math.round(sampleRadiusPx)),
        width: meta.width,
        height: meta.height
      }
    );
  } finally {
    await browser.close();
  }
}

// ---- roads -------------------------------------------------------------

/**
 * A hex is a road tile when at least this share of it is a major road's fill.
 * At zoom 15 a primary road is 10-12 px wide and a hex about 50 px across, so
 * a road through a hex's middle covers 0.2-0.4 of it; one grazing an edge
 * covers less. The bar sits between the two, so a road comes out one hex wide
 * rather than two wherever it runs between hex centres.
 */
const ROAD_SHARE = 0.13;
/** A hex with at least this much road joins the network only where it closes a gap between two road tiles. */
const ROAD_GAP_SHARE = 0.05;
/** Road pieces smaller than this are dropped: a stub is noise, not a road. */
const ROAD_MIN_RUN = 3;

/**
 * The major roads, as tiles, read from the same OSM picture as the terrain.
 * `roads` are land tiles a road runs through: they get no house. `bridges`
 * are river and wetland tiles a road crosses: drawn as a deck or a causeway,
 * still buildable, so storms and building are untouched by any of this.
 */
function findRoads(cells: Cell[]): { roads: AxialCoord[]; bridges: AxialCoord[] } {
  const byKey = new Map(cells.map((cell) => [axialKey(cell.coord), cell]));
  const roadable = (cell: Cell | undefined): boolean => cell !== undefined && ["land", "river", "estuary"].includes(cell.terrainId);
  const candidate = new Set<string>();
  for (const cell of cells) if (roadable(cell) && (cell.roadShare ?? 0) >= ROAD_SHARE) candidate.add(axialKey(cell.coord));
  // Close single-hex gaps: a weaker hex that joins two road tiles which do not touch each other.
  for (const cell of cells) {
    const key = axialKey(cell.coord);
    if (candidate.has(key) || !roadable(cell) || (cell.roadShare ?? 0) < ROAD_GAP_SHARE) continue;
    const around = neighbors(cell.coord).filter((n) => candidate.has(axialKey(n)));
    const joins = around.some((a, i) => around.slice(i + 1).some((b) => Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r) > 2));
    if (joins) candidate.add(key);
  }
  const seen = new Set<string>();
  const keep = new Set<string>();
  for (const start of candidate) {
    if (seen.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const key = queue.pop()!;
      component.push(key);
      const [q, r] = key.split(",").map(Number);
      for (let dir = 0; dir < 6; dir++) {
        const next = axialKey(neighbor({ q, r }, dir));
        if (candidate.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const hasLand = component.some((key) => byKey.get(key)?.terrainId === "land");
    if (component.length >= ROAD_MIN_RUN && hasLand) for (const key of component) keep.add(key);
  }
  const roads: AxialCoord[] = [];
  const bridges: AxialCoord[] = [];
  for (const key of keep) {
    const cell = byKey.get(key)!;
    (cell.terrainId === "land" ? roads : bridges).push(cell.coord);
  }
  const order = (a: AxialCoord, b: AxialCoord): number => a.r - b.r || a.q - b.q;
  return { roads: roads.sort(order), bridges: bridges.sort(order) };
}

/** An extra link (beyond what keeps the network connected) needs the road along at least this share of the line between centres. */
const LINK_COVERAGE = 0.6;

/**
 * How the road tiles join up, as pairs of neighbouring tiles.
 *
 * Drawing a strip between every pair of neighbouring road tiles turns any
 * two-hex-wide stretch into a lattice of triangles. Keeping only the pairs
 * the road visibly runs between leaves it in dashes, because a road rarely
 * passes exactly through hex centres. So:
 *   1. a maximum spanning forest over all neighbouring road pairs, weighted
 *      by how much of the line between their centres is road: every road
 *      stays in one piece, with no triangles (a tree has none);
 *   2. then the remaining links the road clearly follows (LINK_COVERAGE),
 *      strongest first, as long as each closes no triangle: that keeps the
 *      real loops, such as the city grid.
 */
function linkRoads(tiles: AxialCoord[], cells: Cell[], pairs: Pair[], coverage: number[]): [number, number, number, number][] {
  const onRoad = new Set(tiles.map((coord) => axialKey(coord)));
  const keyOf = (i: number): string => axialKey(cells[i].coord);
  const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const candidates: { a: string; b: string; weight: number }[] = [];
  pairs.forEach((pair, i) => {
    const a = keyOf(pair.a);
    const b = keyOf(pair.b);
    if (onRoad.has(a) && onRoad.has(b)) candidates.push({ a, b, weight: coverage[i] });
  });
  candidates.sort((x, y) => y.weight - x.weight || (edgeKey(x.a, x.b) < edgeKey(y.a, y.b) ? -1 : 1));

  // 1. Kruskal: a maximum spanning forest.
  const parent = new Map<string, string>([...onRoad].map((key) => [key, key]));
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(key, root);
    return root;
  };
  const kept = new Set<string>();
  const rest: typeof candidates = [];
  for (const edge of candidates) {
    const ra = find(edge.a);
    const rb = find(edge.b);
    if (ra !== rb) {
      parent.set(ra, rb);
      kept.add(edgeKey(edge.a, edge.b));
    } else {
      rest.push(edge);
    }
  }

  // 2. The strong extra links, as long as they close no triangle.
  const linked = (a: string, b: string): boolean => kept.has(edgeKey(a, b));
  const neighboursOf = (key: string): string[] => {
    const [q, r] = key.split(",").map(Number);
    return neighbors({ q, r }).map((n) => axialKey(n)).filter((n) => onRoad.has(n));
  };
  for (const edge of rest) {
    if (edge.weight < LINK_COVERAGE) break;
    const closes = neighboursOf(edge.a).some((c) => c !== edge.b && linked(edge.a, c) && linked(edge.b, c));
    if (!closes) kept.add(edgeKey(edge.a, edge.b));
  }

  return [...kept]
    .sort()
    .map((edge) => {
      const [a, b] = edge.split("|").map((key) => key.split(",").map(Number));
      return [a[0], a[1], b[0], b[1]] as [number, number, number, number];
    });
}

// ---- turning readings into terrain ------------------------------------

function classifyCells(cells: Cell[], readings: Reading[]): void {
  cells.forEach((cell, index) => {
    const reading = readings[index];
    cell.roadShare = reading.samples > 0 ? reading.road / reading.samples : 0;
    const total =
      reading.water + reading.sand + reading.green + reading.built + reading.mangrove + reading.pale + reading.marsh;
    if (total === 0) {
      cell.terrainId = "land";
      return;
    }
    const share = {
      water: reading.water / total,
      sand: reading.sand / total,
      built: reading.built / total,
      mangrove: reading.mangrove / total,
      pale: reading.pale / total,
      green: reading.green / total,
      marsh: reading.marsh / total
    };
    cell.share = share;
    const wetland = share.marsh + share.mangrove;
    /*
     * Minority wins, in this order:
     *   - mostly water is water, whatever else is there;
     *   - then sand, so a shoreline hex that is part sea and part beach is
     *     beach (somewhere a dune can go) rather than sea;
     *   - then water from a third up: the south shore, the creek banks;
     *   - then marsh and mangrove from a third up;
     *   - everything else is land.
     * Water is `coast` here; `separateWater` decides river from sea after.
     */
    if (share.water >= 0.5) cell.terrainId = "coast";
    else if (share.sand >= SAND_SHARE) cell.terrainId = "beach";
    else if (share.water >= MINORITY_SHARE) cell.terrainId = "coast";
    else if (wetland >= MINORITY_SHARE) cell.terrainId = "estuary";
    else cell.terrainId = "land";
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
 * Turns the khazan paddy next to the wetlands into estuary. See `PADDY`.
 *
 * Breadth-first from every river and estuary tile, at most `PADDY.reach`
 * steps out, through land that is mostly farmland with little city in it.
 */
function spreadPaddy(cells: Cell[]): number {
  const byKey = new Map(cells.map((cell) => [axialKey(cell.coord), cell]));
  const isPaddy = (cell: Cell): boolean =>
    cell.terrainId === "land" &&
    cell.share !== undefined &&
    cell.share.pale + cell.share.marsh >= PADDY.minFarmland &&
    cell.share.built <= PADDY.maxBuilt;

  let frontier = cells.filter((cell) => cell.terrainId === "river" || cell.terrainId === "estuary");
  let converted = 0;
  for (let step = 0; step < PADDY.reach; step++) {
    const next: Cell[] = [];
    for (const cell of frontier) {
      for (const coord of neighbors(cell.coord)) {
        const neighbour = byKey.get(axialKey(coord));
        if (!neighbour || !isPaddy(neighbour)) continue;
        neighbour.terrainId = "estuary";
        converted++;
        next.push(neighbour);
      }
    }
    frontier = next;
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
/** Where one landmark ended up and why, for the debug table. */
interface Placement {
  place: Place;
  ideal: AxialCoord;
  chosen: AxialCoord;
  /** Empty when it stands on the hex containing its real position. */
  reason: string;
}

function placeMonuments(places: Place[], cells: Cell[]): { monuments: Monument[]; notes: string[]; placements: Placement[] } {
  const byKey = new Map(cells.map((cell) => [axialKey(cell.coord), cell]));
  const takenBy = new Map<string, string>();
  const monuments: Monument[] = [];
  const notes: string[] = [];
  const placements: Placement[] = [];

  const isDry = (coord: AxialCoord): boolean => {
    const cell = byKey.get(axialKey(coord));
    return cell !== undefined && (cell.terrainId === "land" || cell.terrainId === "beach");
  };

  for (const place of places) {
    const { x, z } = geoToWorld(place.lat, place.lon);
    const ideal = worldToAxial(x, z, HEX_SIZE);

    // Rings outward from the true position, so a displaced monument moves the
    // shortest distance that satisfies both rules; within a ring, the hex
    // whose centre is nearest the real position wins.
    let chosen: AxialCoord | null = null;
    for (let radius = 0; radius <= 4 && !chosen; radius++) {
      let best = Infinity;
      for (const coord of ringOrSelf(ideal, radius)) {
        if (takenBy.has(axialKey(coord)) || !isDry(coord)) continue;
        const centre = axialToWorld(coord, HEX_SIZE);
        const distance = Math.hypot(centre.x - x, centre.z - z);
        if (distance < best) {
          best = distance;
          chosen = coord;
        }
      }
    }

    if (!chosen) {
      notes.push(`${place.name}: no dry tile within 4 hexes of ${place.lat.toFixed(4)},${place.lon.toFixed(4)} — dropped`);
      continue;
    }

    const moved = hexDistance(ideal, chosen);
    let reason = "";
    if (moved > 0) {
      const occupant = takenBy.get(axialKey(ideal));
      const terrain = byKey.get(axialKey(ideal))?.terrainId ?? "off the board";
      reason = occupant
        ? `its hex is taken by ${occupant}; moved ${moved}`
        : `its hex reads as ${terrain} in OSM; moved ${moved} to dry ground`;
      notes.push(`${place.name}: ${reason}`);
    }

    takenBy.set(axialKey(chosen), place.name);
    placements.push({ place, ideal, chosen, reason });
    monuments.push({
      id: place.id,
      name: place.name,
      category: place.category,
      kind: place.kind,
      q: chosen.q,
      r: chosen.r
    });
  }

  return { monuments, notes, placements };
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

/** A numbered landmark on the debug image: where it really is, and the centre of the hex it was given. */
interface DebugMarker {
  label: string;
  truePx: { px: number; py: number };
  hexPx: { px: number; py: number };
}

/**
 * Draws the finished board back over the map it was read from.
 *
 * This is the only honest way to check the classification. An ASCII dump says
 * a tile is `coast`; it cannot say whether that tile is over the Arabian Sea
 * or over Campal. Painting the hexes onto the picture makes every disagreement
 * between the two visible at a glance, and it is how the river-mouth cut, the
 * sampling radius and the minority-wins thresholds were settled.
 *
 * Two images, both under `tools/mapgen/debug/` (checked in, never shipped):
 * the classes, and the landmarks — a numbered dot at each landmark's real
 * position, a ring on the hex it was given, and a line between when they
 * differ.
 */
async function writeDebugImage(
  meta: BasemapMeta,
  cells: Cell[],
  markers: DebugMarker[],
  outPath: string,
  options: { hexAlpha: number; title: string }
): Promise<void> {
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(BASEMAP_IMAGE).toString("base64")}`;
  const inradiusMetres = HEX_SIZE * Math.sqrt(3) * 0.5 * METRES_PER_UNIT;
  const metresPerPixel = ((meta.bounds.east - meta.bounds.west) * METRES_PER_DEG_LON) / meta.width;
  // Circumradius, not inradius: the polygon is drawn from its corners.
  const radiusPx = inradiusMetres / metresPerPixel / (Math.sqrt(3) / 2);
  // Crop to the board plus a hex of margin, so the image is all board.
  const nw = geoToPixel(meta, BOARD.north, BOARD.west);
  const se = geoToPixel(meta, BOARD.south, BOARD.east);
  const crop = {
    x: Math.max(0, Math.floor(nw.px - radiusPx)),
    y: Math.max(0, Math.floor(nw.py - radiusPx)),
    w: Math.ceil(se.px - nw.px + 2 * radiusPx),
    h: Math.ceil(se.py - nw.py + 2 * radiusPx)
  };

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body></body></html>");
    await page.evaluate("globalThis.__name = (fn) => fn;");

    const jpeg = await page.evaluate(
      async ({ dataUrl, hexes, markers, radius, crop, hexAlpha, title }) => {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("basemap failed to decode"));
          img.src = dataUrl;
        });

        const canvas = document.createElement("canvas");
        canvas.width = crop.w;
        canvas.height = crop.h;
        const ctx = canvas.getContext("2d")!;
        ctx.translate(-crop.x, -crop.y);
        ctx.drawImage(image, 0, 0);

        const FILL: Record<string, string> = {
          coast: `rgba(20,110,170,${hexAlpha})`,
          river: `rgba(70,70,230,${hexAlpha})`,
          estuary: `rgba(20,175,135,${hexAlpha})`,
          beach: `rgba(245,190,55,${Math.min(1, hexAlpha + 0.1)})`,
          land: `rgba(70,150,60,${hexAlpha * 0.6})`,
          road: `rgba(220,40,40,${hexAlpha})`,
          bridge: `rgba(150,40,220,${hexAlpha})`,
          none: "rgba(0,0,0,0)"
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
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        for (const marker of markers) {
          const { truePx, hexPx } = marker;
          // Ring on the hex the landmark was given.
          ctx.beginPath();
          ctx.arc(hexPx.px, hexPx.py, radius * 0.62, 0, Math.PI * 2);
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.stroke();
          // Line from its real position, if it had to move.
          if (Math.hypot(truePx.px - hexPx.px, truePx.py - hexPx.py) > radius * 0.9) {
            ctx.beginPath();
            ctx.moveTo(truePx.px, truePx.py);
            ctx.lineTo(hexPx.px, hexPx.py);
            ctx.lineWidth = 3;
            ctx.strokeStyle = "rgba(230,30,30,0.9)";
            ctx.stroke();
          }
          // Numbered dot at its real position.
          ctx.beginPath();
          ctx.arc(truePx.px, truePx.py, 13, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(210,25,25,0.95)";
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "white";
          ctx.stroke();
          ctx.font = "bold 15px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "white";
          ctx.fillText(marker.label, truePx.px, truePx.py + 1);
        }

        // Legend, in image space.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const rows: [string, string][] = [
          ["coast (sea)", FILL.coast], ["river", FILL.river], ["estuary (wetland)", FILL.estuary],
          ["beach", FILL.beach], ["land", FILL.land]
        ];
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(10, 10, 300, 40 + rows.length * 26);
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#111";
        ctx.fillText(title, 20, 18);
        ctx.font = "16px sans-serif";
        rows.forEach(([name, fill], i) => {
          ctx.fillStyle = fill;
          ctx.fillRect(20, 46 + i * 26, 22, 18);
          ctx.fillStyle = "#111";
          ctx.fillText(name, 52, 46 + i * 26);
        });

        return canvas.toDataURL("image/jpeg", 0.82);
      },
      {
        dataUrl,
        hexes: cells.map((cell) => ({ px: cell.px, py: cell.py, terrainId: cell.terrainId })),
        markers,
        radius: radiusPx,
        crop,
        hexAlpha: options.hexAlpha,
        title: options.title
      }
    );

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(jpeg.slice(jpeg.indexOf(",") + 1), "base64"));
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
/** The board's bounds widened by `OVERLAY_MARGIN_DEG`, kept a hair inside the basemap. */
function overlayBounds(meta: BasemapMeta): typeof BOARD {
  const inset = 0.0002;
  return {
    north: Math.min(meta.bounds.north - inset, BOARD.north + OVERLAY_MARGIN_DEG),
    south: Math.max(meta.bounds.south + inset, BOARD.south - OVERLAY_MARGIN_DEG),
    west: Math.max(meta.bounds.west + inset, BOARD.west - OVERLAY_MARGIN_DEG),
    east: Math.min(meta.bounds.east - inset, BOARD.east + OVERLAY_MARGIN_DEG)
  };
}

async function writeOverlay(meta: BasemapMeta): Promise<{ width: number; height: number; bytes: number }> {
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(BASEMAP_IMAGE).toString("base64")}`;
  const bounds = overlayBounds(meta);
  const northWest = geoToWorld(bounds.north, bounds.west);
  const southEast = geoToWorld(bounds.south, bounds.east);
  const width = OVERLAY_WIDTH;
  const height = Math.round((OVERLAY_WIDTH * (southEast.z - northWest.z)) / (southEast.x - northWest.x));

  // Source rectangle per output row, computed here so the page needs no maths.
  const left = geoToPixel(meta, bounds.north, bounds.west).px;
  const right = geoToPixel(meta, bounds.north, bounds.east).px;
  const rows: number[] = [];
  for (let row = 0; row < height; row++) {
    const lat = bounds.north - ((row + 0.5) / height) * (bounds.north - bounds.south);
    rows.push(geoToPixel(meta, lat, bounds.west).py);
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

  // Every pair of neighbouring hexes, once each, for the road links.
  const indexOf = new Map(cells.map((cell, i) => [axialKey(cell.coord), i]));
  const pairs: Pair[] = [];
  cells.forEach((cell, a) => {
    for (let dir = 0; dir < 3; dir++) {
      const b = indexOf.get(axialKey(neighbor(cell.coord, dir)));
      if (b !== undefined) pairs.push({ a, b });
    }
  });
  const { readings, links: linkCoverage } = await readBasemap(meta, cells, pairs);
  classifyCells(cells, readings);
  console.log("after reading the map: ", JSON.stringify(countTerrain(cells)));

  separateWater(cells);
  console.log("after splitting water:  ", JSON.stringify(countTerrain(cells)));

  const paddy = spreadPaddy(cells);
  console.log(`after paddy:            ${JSON.stringify(countTerrain(cells))} (${paddy} khazan fields became estuary)`);

  const widened = widenBeach(cells);
  console.log(`after widening sand:    ${JSON.stringify(countTerrain(cells))} (${widened} land tiles became beach)`);

  const { monuments, notes, placements } = placeMonuments(places, cells);

  const monumentKeys = new Set(monuments.map((m) => `${m.q},${m.r}`));
  const found = findRoads(cells);
  const roads = found.roads.filter((coord) => !monumentKeys.has(axialKey(coord)));
  const bridges = found.bridges;
  const roadLinks = linkRoads([...roads, ...bridges], cells, pairs, linkCoverage);
  console.log(`road links: ${roadLinks.length}`);
  const landCount = cells.filter((cell) => cell.terrainId === "land").length;
  console.log(`roads: ${roads.length} land tiles (${((roads.length / landCount) * 100).toFixed(1)}% of land), ${bridges.length} bridge and causeway tiles`);
  if (process.env.ROAD_DEBUG) {
    for (const terrain of ["land", "river", "coast", "estuary"]) {
      const shares = cells.filter((c) => c.terrainId === terrain).map((c) => c.roadShare ?? 0).sort((a, b) => b - a);
      console.log(terrain, "top road shares", shares.slice(0, 12).map((v) => v.toFixed(3)).join(" "), "count>=0.07", shares.filter((v) => v >= 0.07).length, ">=0.1", shares.filter((v) => v >= 0.1).length, ">=0.13", shares.filter((v) => v >= 0.13).length);
    }
  }

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
  // The layer's corners, through the same projection as every hex.
  const layerBounds = overlayBounds(meta);
  const layerNorthWest = geoToWorld(layerBounds.north, layerBounds.west);
  const layerSouthEast = geoToWorld(layerBounds.south, layerBounds.east);
  const file = {
    id: "panaji",
    name: "Panaji",
    region: "Tiswadi, North Goa",
    blurb:
      "Panjim, drawn from OpenStreetMap: the city on the Mandovi, the creeks and fields of Taleigao, St Cruz and Merces to the east, and the beach from Miramar to Caranzalem facing the sea.",
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
      bounds: layerBounds,
      world: {
        x: layerNorthWest.x,
        z: layerNorthWest.z,
        width: layerSouthEast.x - layerNorthWest.x,
        depth: layerSouthEast.z - layerNorthWest.z
      },
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
    // Locality names for the label layer (see LOCALITIES): only those that land on the board.
    localities: LOCALITIES.flatMap((place) => {
      const { x, z } = geoToWorld(place.lat, place.lon);
      const coord = worldToAxial(x, z, HEX_SIZE);
      const onBoard = cells.some((cell) => cell.coord.q === coord.q && cell.coord.r === coord.r);
      if (!onBoard) console.log(`locality ${place.name} falls off the board; left out`);
      return onBoard ? [{ name: place.name, ...coord, rank: place.rank }] : [];
    }),
    // The Panjim 2050 challenge zones (see ZONES).
    zones: assignZones(cells),
    // Major roads and bridges, read from the OSM picture (see findRoads).
    roads: roads.map((coord) => [coord.q, coord.r]),
    bridges: bridges.map((coord) => [coord.q, coord.r]),
    // Which neighbouring road tiles the road actually runs between (see linkRoads).
    roadLinks,
    tiles: cells.map((cell) => ({ q: cell.coord.q, r: cell.coord.r, terrainId: cell.terrainId }))
  };
  for (const zone of file.zones) {
    const terrain = new Map<string, number>();
    for (const [q, r] of zone.tiles) {
      const id = cells.find((cell) => cell.coord.q === q && cell.coord.r === r)!.terrainId;
      terrain.set(id, (terrain.get(id) ?? 0) + 1);
    }
    console.log(`zone ${zone.id} ${zone.name}: ${zone.tiles.length} tiles ${JSON.stringify(Object.fromEntries(terrain))}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);

  const overlay = await writeOverlay(meta);
  console.log(
    `Map layer: ${path.relative(ROOT, OVERLAY_OUT)} ${overlay.width}x${overlay.height}, ${(overlay.bytes / 1024).toFixed(0)} KB`
  );

  const classesPath = path.join(DEBUG_DIR, "panaji-classes.jpg");
  await writeDebugImage(meta, cells, [], classesPath, { hexAlpha: 0.5, title: "Panaji: hex classes over OSM" });
  const roadKeys = new Set([...roads, ...bridges].map((coord) => axialKey(coord)));
  const roadCells = cells.map((cell) => ({ ...cell, terrainId: roadKeys.has(axialKey(cell.coord)) ? (cell.terrainId === "land" ? "road" : "bridge") : "none" }));
  await writeDebugImage(meta, roadCells, [], path.join(DEBUG_DIR, "panaji-roads.jpg"), { hexAlpha: 0.55, title: "Panaji: road and bridge tiles" });

  // Landmarks: monuments first, then the neighbourhood labels, numbered in
  // that order in both the image and the table.
  const hexPixel = (coord: AxialCoord): { px: number; py: number } => {
    const { x, z } = axialToWorld(coord, HEX_SIZE);
    const { lat, lon } = worldToGeo(x, z);
    return geoToPixel(meta, lat, lon);
  };
  const labelRows = PLACE_LABELS.map((label) => {
    const { x, z } = geoToWorld(label.lat, label.lon);
    return { label, coord: worldToAxial(x, z, HEX_SIZE) };
  });
  const markers: DebugMarker[] = [
    ...placements.map((placement, i) => ({
      label: String(i + 1),
      truePx: geoToPixel(meta, placement.place.lat, placement.place.lon),
      hexPx: hexPixel(placement.chosen)
    })),
    ...labelRows.map((row, i) => ({
      label: String(placements.length + i + 1),
      truePx: geoToPixel(meta, row.label.lat, row.label.lon),
      hexPx: hexPixel(row.coord)
    }))
  ];
  const landmarksPath = path.join(DEBUG_DIR, "panaji-landmarks.jpg");
  await writeDebugImage(meta, cells, markers, landmarksPath, { hexAlpha: 0.22, title: "Panaji: landmarks (dot = real, ring = hex)" });
  const terrainAt = new Map(cells.map((cell) => [axialKey(cell.coord), cell.terrainId]));
  const table = [
    "# Panaji landmarks",
    "",
    "Generated by `npm run mapgen:panaji`. Numbers match `panaji-landmarks.jpg`: the dot is the real",
    "position, the ring the hex the landmark stands on. Positions: `tools/mapgen/panajiPlaces.json`",
    "(monuments) and `PLACE_LABELS` in `buildPanajiMap.ts` (neighbourhood labels).",
    "",
    "| # | Name | Lat | Lon | Source | Hex (q,r) | Terrain | Note |",
    "|---|---|---|---|---|---|---|---|",
    ...placements.map((placement, i) =>
      `| ${i + 1} | ${placement.place.name} | ${placement.place.lat.toFixed(5)} | ${placement.place.lon.toFixed(5)} | ${placement.place.source} | ${placement.chosen.q},${placement.chosen.r} | ${terrainAt.get(axialKey(placement.chosen))} | ${placement.reason} |`
    ),
    ...labelRows.map((row, i) =>
      `| ${placements.length + i + 1} | ${row.label.name} (label) | ${row.label.lat.toFixed(5)} | ${row.label.lon.toFixed(5)} | OSM basemap label | ${row.coord.q},${row.coord.r} | ${terrainAt.get(axialKey(row.coord))} | |`
    ),
    ""
  ].join("\n");
  fs.writeFileSync(path.join(DEBUG_DIR, "panaji-landmarks.md"), table);

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

  console.log(`Debug images: ${path.relative(ROOT, classesPath)}, ${path.relative(ROOT, landmarksPath)}, panaji-landmarks.md`);
}

main();
