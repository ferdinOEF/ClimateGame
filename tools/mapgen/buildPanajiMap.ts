/**
 * Builds the Panaji board from the real map of Panjim.
 *
 * The board SHIPS as flat coloured hexes. The map image is a build input read
 * once here, offline, to decide what each hex is — it is not an asset and is
 * never served to a player. What survives into the game is the geography: the
 * coastline, the Mandovi, the estuary fringe, the sand, and the sixteen
 * landmarks standing where they really stand.
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

/**
 * The slice of the basemap that becomes playable board.
 *
 * Narrower than the image on purpose. The image reaches Porvorim, Chorao and
 * Goa University so there is real city visible past the edge of play; the
 * board itself is the part the game is about — the Mandovi mouth, the whole of
 * Panaji, Miramar at the river mouth, the Dona Paula headland, and enough open
 * Arabian Sea on the west edge for a storm to arrive across.
 */
const BOARD = { north: 15.5105, south: 15.455, west: 73.7955, east: 73.84 };

/**
 * Metres to one world unit, which is what sets how big a hex is on the ground.
 *
 * 125 puts a hex at about 216 m across — a neighbourhood, not a building. That
 * is the right grain for this game: small enough that Campal, Altinho and
 * Fontainhas are different places, large enough that the board is about 700
 * tiles rather than the 10,000 a building-sized hex would need.
 */
const METRES_PER_UNIT = 125;

/** Hexes are authored at size 1, matching `HEX_SIZE` in the renderer. */
const HEX_SIZE = 1;

const METRES_PER_DEG_LAT = 110_574;
/** At 15.5°N. Constant rather than per-row: the board spans 0.055° of latitude, over which the cosine moves by 0.01%. */
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

/** How far inland of the open sea the sand is widened to. */
const BEACH_BAND = 3;

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

type Reading = { water: number; sand: number; green: number; built: number };

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
        function classify(r: number, g: number, b: number): "water" | "sand" | "green" | "built" {
          // Water is the only thing on the map that is markedly bluer than it
          // is red. Roads, buildings and labels are all neutral or warm.
          if (b - r > 22 && b > 165) return "water";
          // Sand is warm and pale with a clear blue deficit. The `b < g - 18`
          // is what keeps white road fill (equal channels) out of it.
          if (r > 232 && g > 220 && b < g - 18) return "sand";
          // Everything OSM draws as vegetation is green-dominant.
          if (g > r + 6 && g > b + 14) return "green";
          return "built";
        }

        const step = Math.max(1, Math.floor(radius / 6));
        return points.map(({ px, py }) => {
          const reading = { water: 0, sand: 0, green: 0, built: 0 };
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
    const total = reading.water + reading.sand + reading.green + reading.built;
    if (total === 0) {
      cell.terrainId = "land";
      return;
    }
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

  const river = cells.filter((cell) => cell.terrainId === "coast" && eastOfMouth(cell.lat, cell.lon));
  for (const cell of river) cell.terrainId = "river";

  // Estuary last, and over the river set computed above, so no tile is asked
  // whether its neighbour is a bank while that neighbour is still undecided.
  for (const cell of river) {
    if (neighbors(cell.coord).some((coord) => isBank(coord))) cell.terrainId = "estuary";
  }
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

  const widened = widenBeach(cells);
  console.log(`after widening sand:    ${JSON.stringify(countTerrain(cells))} (${widened} land tiles became beach)`);

  const { monuments, notes } = placeMonuments(places, cells);

  /*
   * Where the camera opens.
   *
   * The board is about 38 by 49 world units, far too large to fit on screen at
   * a readable zoom, so the opening frame is a choice rather than the board's
   * geometric centre — which lands in open water off Miramar. This point is
   * the old city: the church, the waterfront and the river mouth in one view,
   * which is the shot that says "this is Panjim" to someone who lives there.
   */
  const focusGeo = { lat: 15.4955, lon: 73.8205 };
  const focusWorld = geoToWorld(focusGeo.lat, focusGeo.lon);
  const focus = worldToAxial(focusWorld.x, focusWorld.z, HEX_SIZE);

  const rows = [...new Set(cells.map((cell) => cell.coord.r))];
  const file = {
    id: "panaji",
    name: "Panaji",
    region: "Tiswadi, North Goa",
    blurb:
      "Goa's capital, on the south bank of the Mandovi where the river spreads into tidal flats before reaching the sea. The old city sits on reclaimed water; the sand from Miramar down to Dona Paula is all that stands between it and the Arabian Sea.",
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
    // The floating place labels and the monument buildings are the same
    // sixteen places, so they are one list rather than two that could
    // disagree.
    landmarks: monuments.map((m) => ({ name: m.name, q: m.q, r: m.r })),
    monuments,
    tiles: cells.map((cell) => ({ q: cell.coord.q, r: cell.coord.r, terrainId: cell.terrainId }))
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);

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
