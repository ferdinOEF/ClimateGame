/**
 * Section 4: the terrain map is fixed and pre-generated, not player-drawn.
 * This script runs ONCE, offline, and serializes the result to
 * src/data/map.json. It is never run at app runtime — `npm run mapgen`,
 * check the output in, done.
 *
 * v2.11 — user supplied a real map screenshot (Google Maps, Panaji /
 * Taleigao / Caranzalem / Dona Paula) and asked to recreate it. The single
 * biggest shape mismatch: the reference shows Dona Paula as a distinct
 * hook — the coast runs south in a fairly straight line through Miramar
 * and Caranzalem, dips inland slightly in a shallow cove just past
 * Durgavado, then the headland itself juts sharply back out west to a
 * narrow point, and the point curls back east into its own small bay at
 * the very tip. v2.10's coastline only ever monotonically tapered to a
 * point — no cove, no hook. v2.11 adds three more points to
 * COASTLINE_TRACE to encode that non-monotonic shape directly (cove at
 * y=0.6, point at y=0.675, hook-back at y=0.7), instead of changing the
 * taper formula itself. Everything else about the reference (Ribandar
 * upstream/east of the river bend, the bay opening west past Reis Magos
 * Fort) was already the right general arrangement from v2.9/v2.10, just
 * without this specific headland detail — the river's own curve around
 * Reis Magos Fort isn't modeled (that bank is off the north edge of the
 * grid, outside what this map represents), flagged as a known gap below.
 *
 * v2.10 — user asked to expand the map further, both vertically and
 * horizontally, so the shape reads as Panjim at a glance: the river/bay
 * frontage in the north and the coastline sweeping down to Dona Paula in
 * the south. Two problems in v2.9 worked against that:
 *
 * 1. The river band (top 5 rows) and the coastal band below it used two
 *    unrelated width formulas — a flat constant for the river's sea-mouth
 *    cut, then an entirely separate trace-based taper starting immediately
 *    below it. That produced a visible step/kink right where the river
 *    meets the open coast, instead of one continuous bay-to-headland
 *    curve. v2.10 adds `riverRowSeaWidth()`, which interpolates the
 *    river rows' sea-mouth width up to match the first coastal row's
 *    width exactly, so the coastline reads as a single sweep.
 * 2. R_MAX only gave the Miramar -> Dona Paula taper 13 rows of vertical
 *    resolution, not enough for the headland to read as an actual
 *    point/cape rather than a stairstep. v2.10 extends R_MAX by 5 more
 *    rows (9 -> 14) for a sharper, smoother taper, and drops the taper's
 *    minimum width from 3 cols to 2 so the Dona Paula tip reads as a
 *    narrow cape, not a blunt edge.
 *
 * Both of those add a lot more open-sea tile area (more coastal rows,
 * each with its own sea/beach cut), which would have pulled the river/sea
 * tile ratio away from the real CRZ proportions this project grounds
 * itself in (river the single largest water category, ahead of open sea
 * — see panjim_mandovi_case_study.json). The first attempt at fixing this
 * widened RIVER_ROWS (5 -> 7), but that silently absorbed two rows that
 * used to be the city's riverfront land/estuary frontage (where several
 * landmarks sit) into open river tiles — wrong trade. RIVER_ROWS stays at
 * v2.9's 5, and the coastal width formula's ceiling comes down instead
 * (headland tapers to 1 col, bay tops out at 6, both down from v2.9) —
 * net effect: sanity check `riverVsSeaProportionate` still holds
 * (verified by running the script) without eating into the land mass.
 *
 * Horizontal expansion: Q_MIN -10 -> -13 (more open-sea room to the west
 * so the wider bay silhouette doesn't crowd the grid edge) and Q_MAX 20
 * -> 25 (more interior/upstream room so the taller map's Land mass, both
 * creeks, and the east-side khazan cluster keep the same proportions
 * relative to the coastline rather than getting squeezed).
 *
 * Net grid: 31x13 (v2.8) -> 31x18 (v2.9) -> 39x23 (v2.10).
 *
 * Everything else — coastline trace shape, Ourem + St Inez creeks, the
 * two Land clusters, the east-side khazan/Ribandar cluster, the river
 * meeting the sea on the west — is kept as-is from v2.9, just re-run over
 * the bigger grid.
 */
import fs from "node:fs";
import path from "node:path";
import { type AxialCoord, axialKey, neighbor, axialDistance, hexSpiral } from "../../src/core/hex";
import { TERRAIN_DEFS } from "../../src/core/terrain";

// --- Coastline trace (south of the river only) ------------------------------
const COASTLINE_TRACE: { x: number; y: number }[] = [
  { x: 0.44, y: 0.235 }, // river mouth bay, near Reis Magos Fort's side
  { x: 0.365, y: 0.27 }, // Miramar Beach frontage
  { x: 0.34, y: 0.35 },
  { x: 0.335, y: 0.45 }, // Caranzalem
  { x: 0.33, y: 0.55 }, // Durgavado
  { x: 0.4, y: 0.6 }, // v2.11: cove/recess just north of the Dona Paula headland (real coast dips inland here)
  { x: 0.3, y: 0.645 }, // land juts back out, approaching the headland
  { x: 0.22, y: 0.675 }, // Dona Paula headland tip — sharpest point, westmost
  { x: 0.32, y: 0.7 } // v2.11: the hook — Dona Paula's point curls back east into its own small bay at the map's southern edge
];
const TRACE_X_MIN = Math.min(...COASTLINE_TRACE.map((p) => p.x));
const TRACE_X_MAX = Math.max(...COASTLINE_TRACE.map((p) => p.x));

function xFracAt(yFrac: number): number {
  const pts = COASTLINE_TRACE;
  if (yFrac <= pts[0].y) return pts[0].x;
  if (yFrac >= pts[pts.length - 1].y) return pts[pts.length - 1].x;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (yFrac >= a.y && yFrac <= b.y) {
      const t = b.y === a.y ? 0 : (yFrac - a.y) / (b.y - a.y);
      return a.x + t * (b.x - a.x);
    }
  }
  return pts[pts.length - 1].x;
}

// --- Grid --------------------------------------------------------------------
const Q_MIN = -13; // v2.10: was -10 — more open-sea room for the wider bay
const Q_MAX = 25; // v2.10: was 20 — more interior room now the map is taller
const R_MIN = -8;
const R_MAX = 14; // v2.10: was 9 — more vertical resolution for the Dona Paula taper
const SEED = 20260928;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

const TOTAL_COLS = Q_MAX - Q_MIN + 1;
const TOTAL_ROWS = R_MAX - R_MIN + 1;

function rowQMin(r: number): number {
  return Q_MIN - Math.floor(r / 2);
}

const allCoords: AxialCoord[] = [];
for (let r = R_MIN; r <= R_MAX; r++) {
  const qMin = rowQMin(r);
  for (let q = qMin; q < qMin + TOTAL_COLS; q++) allCoords.push({ q, r });
}
const grid = new Map<string, AxialCoord>();
for (const c of allCoords) grid.set(axialKey(c), c);
function inGrid(c: AxialCoord): boolean {
  return grid.has(axialKey(c));
}
function colIndex(c: AxialCoord): number {
  return c.q - rowQMin(c.r);
}
function coordAt(r: number, col: number): AxialCoord {
  return { q: rowQMin(r) + col, r };
}

// --- River: the north edge (Mandovi), mouth on the WEST meeting the open sea,
// River running the rest of the row east, upstream. 7 rows so its tile share
// matches the real CRZ-IVB (tidal water channel) proportion, which is
// actually the single largest water category in the reference data —
// bigger than the open sea, and still ahead of it after v2.10's extra
// coastal rows. ---------------------------------------------------------------
const RIVER_ROWS = 5; // v2.10: kept at v2.9's value — see note below on why this stayed put
const riverRowSet = new Set<number>();
for (let i = 0; i < RIVER_ROWS; i++) riverRowSet.add(R_MIN + i);
const firstCoastRow = R_MIN + RIVER_ROWS;

const EXTRA_SEA_COLS = 1; // unchanged from v2.8 ("reduce the sea by 50%")
const BEACH_COLS = 2;
const RIVER_MOUTH_SEA_COLS = EXTRA_SEA_COLS + 3;

/** Coast column-width for a coastal (non-river) row — wide at the bay end, narrow at Dona Paula. */
function coastWidthForRow(r: number): number {
  const yFrac =
    COASTLINE_TRACE[0].y +
    ((r - firstCoastRow) / Math.max(1, R_MAX - firstCoastRow)) * (COASTLINE_TRACE[COASTLINE_TRACE.length - 1].y - COASTLINE_TRACE[0].y);
  const xf = xFracAt(yFrac);
  const t = (xf - TRACE_X_MIN) / (TRACE_X_MAX - TRACE_X_MIN);
  const base = 1 + t * 5; // v2.10: was 3 + t*6 — narrower overall (headland down to 1, bay down to 6)
  return Math.round(base) + EXTRA_SEA_COLS;
}

/**
 * v2.10: the river rows' own sea-mouth width, ramped from a narrower cut at
 * the map's north edge up to exactly coastWidthForRow(firstCoastRow) by the
 * last river row — so the coastline is one continuous curve from the bay
 * into the open coast instead of a flat river-mouth wall meeting a sudden
 * jump in width.
 */
function riverRowSeaWidth(r: number): number {
  const tRow = (r - R_MIN) / Math.max(1, RIVER_ROWS - 1);
  const endWidth = coastWidthForRow(firstCoastRow);
  return Math.round(RIVER_MOUTH_SEA_COLS + tRow * (endWidth - RIVER_MOUTH_SEA_COLS));
}

// --- Estuary (Mangrove/Khazan terrain, src/data/elements.json restricts both
// to validTerrainIds: ["estuary"]): riverbank fringe + interior corridor +
// an east-side khazan cluster, matching the real CRZ khazan overlay's shape
// (khazan_overlay.png, panjim_crz_classified_map.png). ----------------------
function landStartCol(r: number): number {
  return coastWidthForRow(r) + BEACH_COLS;
}
const RIVER_FRINGE_ROWS = 2;
const RIVER_FRINGE_WIDTH = 18;
const CORRIDOR_OFFSET = 2;
const CORRIDOR_WIDTH = 3;
function corridorBounds(r: number): { start: number; end: number } {
  const wave = Math.sin((r - firstCoastRow) * 0.9) * 1.2;
  const start = landStartCol(r) + CORRIDOR_OFFSET + Math.round(wave);
  const end = start + CORRIDOR_WIDTH;
  return { start, end };
}
function isRiverFringeRow(r: number): boolean {
  return r >= firstCoastRow && r < firstCoastRow + RIVER_FRINGE_ROWS;
}

// East-side khazan/mangrove cluster (Ribandar analog): the classified CRZ
// map shows a distinct olive-green mangrove/khazan patch near the map's
// east edge, close to the river, separate from the city-frontage fringe.
const EAST_KHAZAN_ROW_SPAN = 6; // v2.10: was 4 — kept proportional on the taller map
function isEastKhazanTile(c: AxialCoord, col: number): boolean {
  const rOffset = c.r - (firstCoastRow + RIVER_FRINGE_ROWS);
  if (rOffset < 0 || rOffset >= EAST_KHAZAN_ROW_SPAN) return false;
  const availableWidth = Math.max(1, TOTAL_COLS - landStartCol(c.r));
  const fracStart = 0.82 - rOffset * 0.02;
  const fracEnd = 0.98 - rOffset * 0.02;
  const colStart = landStartCol(c.r) + Math.round(fracStart * availableWidth);
  const colEnd = landStartCol(c.r) + Math.round(fracEnd * availableWidth);
  return col >= colStart && col <= colEnd;
}

// --- Creeks: real named waterways cutting into the Land mass, drawn in the
// same River terrain as the Mandovi (not Estuary) with an Estuary fringe on
// both banks — grounded via a web lookup of each creek's real geography. ---
interface CreekDef {
  name: string;
  rowStart: number;
  rowEnd: number;
  fracStart: number;
  fracEnd: number;
  meanderAmp: number;
  meanderFreq: number;
}
const CREEKS: CreekDef[] = [
  {
    // Ourem Creek: short, hugs the river, bounds Fontainhas (old quarter)
    // on its east side just inland from the Mandovi.
    name: "ourem",
    rowStart: firstCoastRow + 1,
    rowEnd: firstCoastRow + 6,
    fracStart: 0.4,
    fracEnd: 0.52,
    meanderAmp: 1.4,
    meanderFreq: 0.8
  },
  {
    // St Inez Creek: long, runs most of the peninsula's north-south length,
    // from near the river down toward the Dona Paula/Taleigao hills at the
    // southern end, further east/interior than Ourem Creek. With the
    // vertical expansion this now spans nearly the full land mass.
    name: "st_inez",
    rowStart: firstCoastRow + 1,
    rowEnd: R_MAX - 1,
    fracStart: 0.65,
    fracEnd: 0.78,
    meanderAmp: 1.6,
    meanderFreq: 0.5
  }
];
/** Column offset from landStartCol(r), scaled to that row's actual Land width so a creek always stays in-grid. */
function creekColForRow(def: CreekDef, r: number): number {
  const t = (r - def.rowStart) / Math.max(1, def.rowEnd - def.rowStart);
  const frac = def.fracStart + t * (def.fracEnd - def.fracStart);
  const availableWidth = Math.max(1, TOTAL_COLS - landStartCol(r));
  const base = frac * availableWidth;
  const meander = Math.sin((r - def.rowStart) * def.meanderFreq) * def.meanderAmp;
  return Math.round(base + meander);
}

// --- Assign terrain (base pass: coast/beach/river/fringe/corridor/khazan/land) ----
const terrainOf = new Map<string, string>();
for (const c of allCoords) {
  const key = axialKey(c);
  const col = colIndex(c);

  if (riverRowSet.has(c.r)) {
    const seaMouthMaxCol = riverRowSeaWidth(c.r) - 1;
    // v2.10: the northernmost river row is the actual mouth, where the
    // Mandovi's main channel opens straight into the sea with no sandbar —
    // skip the beach there so River tiles touch Coast tiles directly,
    // instead of relying on the v2.9 width-discontinuity to do it by
    // accident. Every other river row keeps its beach strip.
    const beachColsThisRow = c.r === R_MIN ? 0 : BEACH_COLS;
    const beachMaxCol = seaMouthMaxCol + beachColsThisRow;
    if (col <= seaMouthMaxCol) terrainOf.set(key, "coast");
    else if (col <= beachMaxCol) terrainOf.set(key, "beach");
    else terrainOf.set(key, "river");
    continue;
  }

  const cw = coastWidthForRow(c.r);
  const coastMaxCol = cw - 1;
  const beachMaxCol = coastMaxCol + BEACH_COLS;

  if (col <= coastMaxCol) {
    terrainOf.set(key, "coast");
  } else if (col <= beachMaxCol) {
    terrainOf.set(key, "beach");
  } else if (isRiverFringeRow(c.r) && col <= beachMaxCol + RIVER_FRINGE_WIDTH) {
    terrainOf.set(key, "estuary");
  } else if (isEastKhazanTile(c, col)) {
    terrainOf.set(key, "estuary");
  } else {
    const { start, end } = corridorBounds(c.r);
    terrainOf.set(key, col >= start && col <= end ? "estuary" : "land");
  }
}

// --- Overlay pass: cut the two creeks through the Land mass (River terrain,
// Estuary fringe on both banks) — only ever replaces Land, never touches
// Coast/Beach/River/existing Estuary. ----------------------------------------
for (const def of CREEKS) {
  for (let r = def.rowStart; r <= def.rowEnd; r++) {
    if (!grid.has(axialKey({ q: rowQMin(r), r }))) continue;
    const col = landStartCol(r) + creekColForRow(def, r);
    const centerCoord = coordAt(r, col);
    if (inGrid(centerCoord) && terrainOf.get(axialKey(centerCoord)) === "land") {
      terrainOf.set(axialKey(centerCoord), "river");
    }
    for (const bankCol of [col - 1, col + 1]) {
      const bankCoord = coordAt(r, bankCol);
      if (inGrid(bankCoord) && terrainOf.get(axialKey(bankCoord)) === "land") {
        terrainOf.set(axialKey(bankCoord), "estuary");
      }
    }
  }
}

interface MapTile {
  q: number;
  r: number;
  terrainId: string;
}
const tiles: MapTile[] = allCoords.map((c) => ({ q: c.q, r: c.r, terrainId: terrainOf.get(axialKey(c))! }));

const coastCoords = allCoords.filter((c) => terrainOf.get(axialKey(c)) === "coast");
const beachCoords = allCoords.filter((c) => terrainOf.get(axialKey(c)) === "beach");
const riverCoords = allCoords.filter((c) => terrainOf.get(axialKey(c)) === "river");
const estuaryCoords = allCoords.filter((c) => terrainOf.get(axialKey(c)) === "estuary");
const landCoords = allCoords.filter((c) => terrainOf.get(axialKey(c)) === "land");

const coastalClaimSeed = beachCoords.reduce((best, c) => (c.r > best.r ? c : best), beachCoords[0]);
const startingClaim: AxialCoord[] = [
  coastalClaimSeed,
  ...[0, 1, 2, 3, 4, 5].map((dir) => neighbor(coastalClaimSeed, dir)).filter(inGrid)
].slice(0, 3);

const allQs = allCoords.map((c) => c.q);
const output = {
  seed: SEED,
  qRange: [Math.min(...allQs), Math.max(...allQs)],
  rRange: [R_MIN, R_MAX],
  estuary: estuaryCoords[Math.floor(estuaryCoords.length / 2)],
  startingClaim,
  tiles
};
fs.writeFileSync(path.resolve(import.meta.dirname, "../../src/data/map.json"), JSON.stringify(output, null, 2));

const waterCoords = tiles.filter((t) => t.terrainId === "river" || t.terrainId === "estuary").map((t) => ({ q: t.q, r: t.r }));
function minDistToWater(c: AxialCoord): number {
  return Math.min(...waterCoords.map((w) => axialDistance(c, w)));
}
const viableSeeds = landCoords.filter(
  (c) => hexSpiral(c, 2).filter((n) => inGrid(n) && terrainOf.get(axialKey(n)) === "land").length >= 10
);
const houseClusterSeed = (viableSeeds.length > 0 ? viableSeeds : landCoords).reduce((best, c) =>
  minDistToWater(c) > minDistToWater(best) ? c : best
);
const houseCoords = hexSpiral(houseClusterSeed, 2)
  .filter((c) => inGrid(c) && terrainOf.get(axialKey(c)) === "land")
  .slice(0, 10);

const startingState = {
  startingCoin: 1000,
  startingPopulation: 50,
  populationPerHouse: 5,
  prebuiltHouses: houseCoords
};
fs.writeFileSync(path.resolve(import.meta.dirname, "../../src/data/startingState.json"), JSON.stringify(startingState, null, 2));

// --- Sanity checks ---------------------------------------------------------
const terrainIdSet = new Set(TERRAIN_DEFS.map((t) => t.id));
const badTerrainIds = tiles.filter((t) => !terrainIdSet.has(t.terrainId));
const expectedTotal = TOTAL_COLS * TOTAL_ROWS;
const minHouseToWaterDist = Math.min(...houseCoords.map((h) => Math.min(...waterCoords.map((w) => axialDistance(h, w)))));

const riverMeetsSea = riverCoords.some((rc) =>
  [0, 1, 2, 3, 4, 5].some((dir) => {
    const n = neighbor(rc, dir);
    return inGrid(n) && terrainOf.get(axialKey(n)) === "coast";
  })
);

const coastWidths = [];
for (let r = firstCoastRow; r <= R_MAX; r++) coastWidths.push(coastWidthForRow(r));
const coastlineNarrows = coastWidths[0] > coastWidths[coastWidths.length - 1];

const creekRiverTilesByName = CREEKS.map((def) => {
  let count = 0;
  for (let r = def.rowStart; r <= def.rowEnd; r++) {
    const col = landStartCol(r) + creekColForRow(def, r);
    const coord = coordAt(r, col);
    if (inGrid(coord) && terrainOf.get(axialKey(coord)) === "river") count++;
  }
  return { name: def.name, count };
});
const creeksPresent = creekRiverTilesByName.every((c) => c.count >= 3);

// Water-tile proportions should favor the river over the sea, per the real
// CRZ-area ratio (river the largest water category, ahead of sea).
const riverVsSeaProportionate = riverCoords.length > coastCoords.length;

// v2.10: the river-row sea cut should ramp smoothly up to the first coastal
// row's width, not jump — i.e. the last river row's sea width should be
// close (within a couple columns) to firstCoastRow's width.
const riverCoastContinuity = Math.abs(riverRowSeaWidth(R_MIN + RIVER_ROWS - 1) - coastWidthForRow(firstCoastRow)) <= 1;

console.log(`map.json written: ${tiles.length} tiles (expected ${expectedTotal})`);
console.log(`  grid: ${TOTAL_COLS} cols x ${TOTAL_ROWS} rows`);
console.log(`  coast: ${coastCoords.length}, beach: ${beachCoords.length}, land: ${landCoords.length}, river: ${riverCoords.length}, estuary: ${estuaryCoords.length}`);
console.log(`  river meets the sea (river tile adjacent to coast tile): ${riverMeetsSea}`);
console.log(`  river tile count exceeds sea tile count (matches real CRZ ratio): ${riverVsSeaProportionate}`);
console.log(`  river-mouth -> coastline continuity (no jump at the join): ${riverCoastContinuity} (last river-row width ${riverRowSeaWidth(R_MIN + RIVER_ROWS - 1)}, first coastal-row width ${coastWidthForRow(firstCoastRow)})`);
console.log(`  coastline narrows bay(N) -> headland(S): ${coastlineNarrows} (widths ${coastWidths.join(",")})`);
console.log(`  creeks cut through Land: ${creekRiverTilesByName.map((c) => `${c.name}=${c.count}`).join(", ")}`);
console.log(`  unknown terrain ids: ${badTerrainIds.length}`);
console.log(`  starting claim (coastal, southern Beach end): ${startingClaim.map((c) => `(${c.q},${c.r})`).join(", ")}`);
console.log(`  house cluster seed: (${houseClusterSeed.q},${houseClusterSeed.r}), min distance to River/Estuary: ${minHouseToWaterDist}`);
console.log(`startingState.json written: ${houseCoords.length} pre-built Houses, all on Land: ${houseCoords.every((c) => terrainOf.get(axialKey(c)) === "land")}`);

if (
  badTerrainIds.length > 0 ||
  tiles.length !== expectedTotal ||
  !riverMeetsSea ||
  !riverVsSeaProportionate ||
  !riverCoastContinuity ||
  !coastlineNarrows ||
  !creeksPresent ||
  estuaryCoords.length < 25 ||
  houseCoords.length !== 10
) {
  console.error("mapgen sanity check FAILED");
  process.exitCode = 1;
}
