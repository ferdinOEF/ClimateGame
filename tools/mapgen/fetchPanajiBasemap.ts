/**
 * Fetches the real map of Panjim that the board is read out of.
 *
 * WHAT IT PRODUCES
 *
 *   tools/mapgen/panaji-basemap.jpg   one image, the city as OpenStreetMap draws it
 *   tools/mapgen/panajiBasemap.json   the geographic box that image covers
 *
 * The JSON is what makes the image usable: it records the exact latitude and
 * longitude of the image's edges, so `buildPanajiMap.ts` can say which pixels
 * a given hex covers. Without it the picture is just a picture.
 *
 * Neither file ships as is. The image is read offline to decide what each hex
 * is, and `buildPanajiMap.ts` cuts the board's own rectangle out of it as the
 * street-map layer in `public/maps/`. The game never calls the tile server.
 *
 * WHY TILES AND NOT A VECTOR TRACE
 *
 * The first attempt at this asked Overpass for Panjim's coastline, waterways
 * and landuse polygons and drew them. Overpass is unreachable from this
 * machine (every request comes back 406 from something in the middle), and the
 * fallback — tracing the coast by hand from memory — is how the board got its
 * current invented geography in the first place.
 *
 * Rendered tiles sidestep the whole question. They are the actual map,
 * including the street names, which turn out to matter more than accuracy
 * alone: a player from Panjim recognises "Campal" and "Altinho" written along
 * the roads they live on far faster than they recognise a correctly shaped
 * blob of green.
 *
 * ON USING THE PUBLIC TILE SERVER
 *
 * This is a one-off, run by hand, for 81 tiles, with a User-Agent that names
 * the project — within OpenStreetMap's tile usage policy, which exists to stop
 * bulk scraping and heavy automated traffic. The deployed game never touches
 * the tile server at all, however many people play it. The map data is
 * © OpenStreetMap contributors, licensed ODbL, and the board derived from it
 * is a derived database — so `src/ui/attribution.ts` still puts that credit on
 * screen even though no imagery is shipped, which is the condition of using
 * it.
 *
 * Tiles are cached under the system temp directory between runs, so a re-run
 * while tuning the crop costs nothing and re-downloads nothing.
 *
 * `npm run mapgen:basemap`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(process.cwd());
/*
 * Both outputs are BUILD INPUTS, not shipped assets.
 *
 * They live beside the generator rather than in `public/` because the game
 * never draws this whole image: the board is read out of it offline, and only
 * the board's own rectangle ships, as a smaller WebP street-map layer written
 * by `buildPanajiMap.ts`. It stays checked in so the board and that layer can
 * be regenerated and the classification re-checked.
 */
const IMAGE_OUT = path.join(ROOT, "tools/mapgen/panaji-basemap.jpg");
const META_OUT = path.join(ROOT, "tools/mapgen/panajiBasemap.json");
const CACHE = path.join(os.tmpdir(), "riptide-osm-tiles");

const USER_AGENT = "RiptideRising/1.0 (coastal-resilience teaching game; contact ferdin@oneearth.world)";

/**
 * Zoom 15 is the level where the street names appear.
 *
 * At 14 the city is a shape; at 15 it says Campal, Altinho, Miramar, Dona
 * Paula, Mandovi, and those words are doing most of the recognition work. At
 * 16 the tile count quadruples to 324 for detail nobody can read at this
 * camera distance.
 */
const ZOOM = 15;

/**
 * The tile rectangle to fetch, in slippy-map tile coordinates.
 *
 * Covers roughly 15.44–15.52 N, 73.78–73.86 E: the Mandovi and its north
 * bank along the top, the whole of Panaji, Miramar at the river mouth, the
 * Dona Paula headland in the south-west, and enough open Arabian Sea on the
 * west edge that the board has somewhere for storms to come from.
 */
const TILE_X0 = 23099;
const TILE_X1 = 23107;
const TILE_Y0 = 14952;
const TILE_Y1 = 14960;

const TILE_PX = 256;

/** JPEG, not PNG: a street map of this size is ~4 MB as PNG and under 700 KB as a quality-0.88 JPEG, and it is a photograph-like image being viewed at an angle. */
const JPEG_QUALITY = 0.88;

// ---- slippy map maths -------------------------------------------------

/** Longitude of a tile's western edge. */
function tileToLon(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

/** Latitude of a tile's northern edge. */
function tileToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// ---- fetching ---------------------------------------------------------

async function fetchTile(zoom: number, x: number, y: number): Promise<Buffer> {
  const cached = path.join(CACHE, `${zoom}-${x}-${y}.png`);
  if (fs.existsSync(cached)) {
    const buffer = fs.readFileSync(cached);
    // A zero-length or truncated cache entry would silently become a hole in
    // the map, so anything implausibly small is re-fetched rather than used.
    if (buffer.byteLength > 256) return buffer;
  }

  const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cached, buffer);
  // Only sleep on a real download, so a fully cached re-run is instant.
  await new Promise((resolve) => setTimeout(resolve, 120));
  return buffer;
}

async function main(): Promise<void> {
  const columns = TILE_X1 - TILE_X0 + 1;
  const rows = TILE_Y1 - TILE_Y0 + 1;
  const width = columns * TILE_PX;
  const height = rows * TILE_PX;

  console.log(`Fetching ${columns}x${rows} = ${columns * rows} tiles at zoom ${ZOOM} (${width}x${height}px)`);

  const tiles: { x: number; y: number; dataUrl: string }[] = [];
  let downloaded = 0;
  for (let y = TILE_Y0; y <= TILE_Y1; y++) {
    for (let x = TILE_X0; x <= TILE_X1; x++) {
      const existed = fs.existsSync(path.join(CACHE, `${ZOOM}-${x}-${y}.png`));
      const buffer = await fetchTile(ZOOM, x, y);
      if (!existed) downloaded++;
      tiles.push({
        x: (x - TILE_X0) * TILE_PX,
        y: (y - TILE_Y0) * TILE_PX,
        dataUrl: `data:image/png;base64,${buffer.toString("base64")}`
      });
    }
  }
  console.log(`  ${downloaded} downloaded, ${tiles.length - downloaded} from cache`);

  /*
   * Compositing happens in a browser because the project already depends on
   * Playwright and does not depend on an image library. Tiles go in as data
   * URLs rather than file:// paths specifically so the canvas is not tainted
   * and `toDataURL` is allowed to read it back.
   */
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body></body></html>");

    const jpeg = await page.evaluate(
      async ({ tiles, width, height, quality }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        // The sea is the one part of the map that must not be a white gap if a
        // tile fails to draw; OSM's own water colour makes a missing tile
        // read as water rather than as a hole.
        ctx.fillStyle = "#aad3df";
        ctx.fillRect(0, 0, width, height);

        await Promise.all(
          tiles.map(
            (tile) =>
              new Promise<void>((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                  ctx.drawImage(image, tile.x, tile.y);
                  resolve();
                };
                image.onerror = () => reject(new Error(`tile at ${tile.x},${tile.y} failed to decode`));
                image.src = tile.dataUrl;
              })
          )
        );

        return canvas.toDataURL("image/jpeg", quality);
      },
      { tiles, width, height, quality: JPEG_QUALITY }
    );

    const base64 = jpeg.replace(/^data:image\/jpeg;base64,/, "");
    fs.mkdirSync(path.dirname(IMAGE_OUT), { recursive: true });
    fs.writeFileSync(IMAGE_OUT, Buffer.from(base64, "base64"));
  } finally {
    await browser.close();
  }

  const meta = {
    note: "Generated by tools/mapgen/fetchPanajiBasemap.ts. Map imagery rendered from OpenStreetMap data, © OpenStreetMap contributors, ODbL.",
    generatedAt: new Date().toISOString(),
    image: "panaji-basemap.jpg",
    zoom: ZOOM,
    width,
    height,
    // The geographic edges of the image. North and west are the edges of the
    // first tile; south and east are the edges of the tile AFTER the last,
    // which is what makes this the box the image actually covers.
    bounds: {
      north: tileToLat(TILE_Y0, ZOOM),
      south: tileToLat(TILE_Y1 + 1, ZOOM),
      west: tileToLon(TILE_X0, ZOOM),
      east: tileToLon(TILE_X1 + 1, ZOOM)
    },
    attribution: "© OpenStreetMap contributors"
  };

  fs.mkdirSync(path.dirname(META_OUT), { recursive: true });
  fs.writeFileSync(META_OUT, `${JSON.stringify(meta, null, 2)}\n`);

  const kb = (fs.statSync(IMAGE_OUT).size / 1024).toFixed(0);
  console.log(`\nWrote ${path.relative(ROOT, IMAGE_OUT)} (${kb} KB)`);
  console.log(`Wrote ${path.relative(ROOT, META_OUT)}`);
  console.log(
    `Covers ${meta.bounds.south.toFixed(4)}..${meta.bounds.north.toFixed(4)} N, ${meta.bounds.west.toFixed(4)}..${meta.bounds.east.toFixed(4)} E`
  );
}

main();
