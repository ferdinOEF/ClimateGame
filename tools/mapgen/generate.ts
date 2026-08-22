/**
 * Section 4 (v2.4): the terrain map is fixed and pre-generated, not
 * player-drawn. This script runs ONCE, offline, and serializes the result
 * to src/data/map.json. It is never run at app runtime — `npm run mapgen`,
 * check the output in, done.
 *
 * Layout (v2.4, explicit left-to-right): Sea -> Beach -> Land (interior),
 * with a winding River entering the interior just past Beach and bending
 * through several turns as it crosses east off the map's edge (per
 * STEP_PROMPT_map_reshape_veg_icons.md, superseding the earlier single
 * two-arm-confluence mouth shape — see git history). Estuary is no longer
 * one blob at a river mouth: it's several distinct patches strung along the
 * river's bends (one larger patch at the widest/southernmost bend, several
 * smaller ones elsewhere), reading as a floodplain wetland threaded through
 * the terrain rather than a single delta. Land fills everything else,
 * reading as two clusters: a modest pocket near the estuary (wherever the
 * river's bends leave gaps) and a larger, deliberately separate Residential
 * cluster placed at the Land tile farthest from any River/Estuary tile —
 * where the starting claim's prebuilt Houses continue to sit.
 *
 * The grid is NOT a plain axial rectangle (q in [Q_MIN,Q_MAX], r in
 * [R_MIN,R_MAX]). `axialToWorld`'s x = sqrt3*(q + r/2) means a plain axial
 * rectangle renders as a *parallelogram* in world space, not a rectangle —
 * each row is shifted sideways from the last by the r/2 shear term, so
 * over R_MAX-R_MIN rows the accumulated drift is several hex-widths. With
 * a camera that never yaws (Section 6), a tilted world-space edge reads as
 * a diagonal on screen no matter how it's framed — which is exactly what a
 * live playtest found: Sea "wrapping" around a corner, and the
 * Estuary/River band reading as "a diagonal vein" instead of a coherent
 * side. (An earlier version tried banding by axial q directly to fix a
 * different, narrower bug — see git history — which produces a
 * *consistent* diagonal, better than the original worldX-threshold bug's
 * inconsistent one, but still a visible diagonal, not the fix.)
 *
 * The actual fix: build the grid with a per-row q-offset that cancels the
 * shear (`rowQMin(r) = Q_MIN - floor(r/2)`), the standard "offset
 * coordinates" trick for laying out a rectangular hex region. This leaves
 * only the natural half-hex stagger between adjacent rows (the normal,
 * expected brick-like offset every hex grid has) instead of an
 * accumulating drift — the result is an actual rectangle in world space,
 * so Sea/Beach/Land bands read as straight sides regardless of pan, zoom,
 * or which row you look at (the River/Estuary no longer form a "band" at
 * all — see below).
 */
import fs from "node:fs";
import path from "node:path";
import { type AxialCoord, axialKey, neighbor, axialDistance, hexRing, hexSpiral } from "../../src/core/hex";
import { TERRAIN_DEFS } from "../../src/core/terrain";

// STEP_PROMPT_visuals_map_river.md item 2: cut total map size down
// substantially for this pilot (~80-120 hex target — see that file's
// reasoning) from the previous 243-hex/27x9 map. 15x7 = 105 hexes, still
// "wider than tall" per Section 8.
const Q_MIN = -7;
const Q_MAX = 7;
const R_MIN = -3;
const R_MAX = 3;
const SEED = 20260819; // fixed seed for this pilot (Section 4: "a fixed seed is fine ... a new seed per era is a later enhancement")

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

// --- 1. Build a TRUE-rectangle grid via per-row offset coordinates --------

const TOTAL_COLS = Q_MAX - Q_MIN + 1; // 15, same for every row by construction

/** The q of the westmost hex in row `r`, shifted to cancel axialToWorld's r/2 shear. */
function rowQMin(r: number): number {
  return Q_MIN - Math.floor(r / 2);
}

const allCoords: AxialCoord[] = [];
for (let r = R_MIN; r <= R_MAX; r++) {
  const qMin = rowQMin(r);
  for (let q = qMin; q < qMin + TOTAL_COLS; q++) {
    allCoords.push({ q, r });
  }
}

const grid = new Map<string, AxialCoord>();
for (const c of allCoords) grid.set(axialKey(c), c);
function inGrid(c: AxialCoord): boolean {
  return grid.has(axialKey(c));
}

/** 0-based column index of `c` within its own row — the west-to-east position Coast/Beach are banded by. */
function colIndex(c: AxialCoord): number {
  return c.q - rowQMin(c.r);
}

/** The coordinate at a given (row-relative column index, row) — the inverse of colIndex, used to place river waypoints by their intended west-to-east position regardless of row shear. */
function coordAt(colIdx: number, r: number): AxialCoord {
  return { q: rowQMin(r) + colIdx, r };
}

// --- 2. Coast / Beach are still fixed left-to-right bands -------------------

const COAST_COLS = 1;
const BEACH_COLS = 2;
const coastMaxCol = COAST_COLS - 1; // colIndex <= this: Sea
const beachMaxCol = coastMaxCol + BEACH_COLS; // colIndex in (coastMaxCol, beachMaxCol]: Beach

const coastCoords = allCoords.filter((c) => colIndex(c) <= coastMaxCol);
const coastSet = new Set(coastCoords.map(axialKey));
const beachCoords = allCoords.filter((c) => colIndex(c) > coastMaxCol && colIndex(c) <= beachMaxCol);
const beachSet = new Set(beachCoords.map(axialKey));

// --- 3. Carve a winding River with distributed Estuary patches -------------

// The river's route as a sequence of (column index, row) waypoints: it
// enters the interior immediately past Beach, swings south through a wide
// bend (the deepest point, col 8/r 2 — the widest/southernmost bend, where
// the larger Estuary patch sits), then swings back north before exiting off
// the map's east edge. Unlike the old two-arm-to-confluence river, this is
// NOT confined to an eastern "water zone" band — it's meant to cross the
// full width of the interior, which is the whole point of "winding."
const RIVER_WAYPOINT_SPEC: { col: number; r: number }[] = [
  { col: 3, r: -2 }, // entry, just past Beach
  { col: 5, r: -2 },
  { col: 6, r: 0 },
  { col: 8, r: 2 }, // widest/southernmost bend — the big Estuary patch anchors here
  { col: 9, r: 1 },
  { col: 11, r: -1 },
  { col: 12, r: -2 },
  { col: 14, r: -1 } // exits off the east edge
];
const riverWaypoints: AxialCoord[] = RIVER_WAYPOINT_SPEC.map((w) => coordAt(w.col, w.r));

/**
 * A near-greedy walk from `start` toward `target` (always moves strictly
 * closer, ties broken by a small random jitter for a natural wiggle rather
 * than a detour), avoiding Coast/Beach (the river only ever touches the
 * interior) and any hex already used earlier in the path (so the winding
 * route doesn't cross or double back on itself).
 */
function walkSegment(start: AxialCoord, target: AxialCoord, visited: Set<string>): AxialCoord[] {
  const segPath: AxialCoord[] = [];
  let current = start;
  const maxSteps = axialDistance(start, target) * 2 + 10;

  for (let step = 0; step < maxSteps; step++) {
    if (axialDistance(current, target) === 0) break;
    const candidates: { coord: AxialCoord; score: number }[] = [];
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbor(current, dir);
      const key = axialKey(n);
      if (!inGrid(n) || coastSet.has(key) || beachSet.has(key) || visited.has(key)) continue;
      candidates.push({ coord: n, score: -axialDistance(n, target) + rng() * 0.3 });
    }
    if (candidates.length === 0) break; // boxed in; stop where we are
    candidates.sort((a, b) => b.score - a.score);
    current = candidates[0].coord;
    visited.add(axialKey(current));
    segPath.push(current);
  }
  if (axialDistance(current, target) > 0 && inGrid(target) && !visited.has(axialKey(target))) {
    segPath.push(target); // guarantee the segment actually reaches its waypoint
    visited.add(axialKey(target));
  }
  return segPath;
}

const riverVisited = new Set<string>([axialKey(riverWaypoints[0])]);
const riverPath: AxialCoord[] = [riverWaypoints[0]];
for (let i = 0; i < riverWaypoints.length - 1; i++) {
  riverPath.push(...walkSegment(riverWaypoints[i], riverWaypoints[i + 1], riverVisited));
}

// Estuary patches: the interior waypoints (excluding the entry/exit points)
// each anchor one patch. The widest/southernmost bend (col 8, r 2) gets a
// larger patch (itself plus two ring neighbors); every other interior
// waypoint gets a single-tile patch. This reads as a floodplain wetland
// strung along the river's bends, not one blob at a single mouth.
const bigPatchAnchor = riverWaypoints[3]; // col 8, r 2
const bigPatchExtra = hexRing(bigPatchAnchor, 1)
  .filter((c) => inGrid(c) && !coastSet.has(axialKey(c)) && !beachSet.has(axialKey(c)))
  .slice(0, 2);
const smallPatchAnchors = [1, 2, 4, 5, 6].map((i) => riverWaypoints[i]); // the other 5 interior waypoints

const estuaryCoords: AxialCoord[] = [bigPatchAnchor, ...bigPatchExtra, ...smallPatchAnchors];
const estuarySet = new Set(estuaryCoords.map(axialKey));

// --- 4. Assign terrain: Coast / Beach / Estuary / River fixed, rest Land ---

const terrainOf = new Map<string, string>();
for (const c of coastCoords) terrainOf.set(axialKey(c), "coast");
for (const c of beachCoords) terrainOf.set(axialKey(c), "beach");
for (const c of estuaryCoords) terrainOf.set(axialKey(c), "estuary");
for (const c of riverPath) {
  const key = axialKey(c);
  if (!estuarySet.has(key)) terrainOf.set(key, "river");
}
for (const c of allCoords) {
  const key = axialKey(c);
  if (!terrainOf.has(key)) terrainOf.set(key, "land");
}

// --- 5. Serialize -------------------------------------------------------------

interface MapTile {
  q: number;
  r: number;
  terrainId: string;
}

const tiles: MapTile[] = allCoords.map((c) => ({ q: c.q, r: c.r, terrainId: terrainOf.get(axialKey(c))! }));

// The player's initial claim is a small coastal footprint (Section 4/8,
// v2.4: "the player begins already owning a small coastal claim") — near
// the shore, unrelated to the (now-interior) river. Centered on a Beach
// tile close to the coastal midline. Unchanged by the river reshape.
const coastalClaimSeed = beachCoords.reduce((best, c) => (Math.abs(c.r) < Math.abs(best.r) ? c : best), beachCoords[0]);
const startingClaim: AxialCoord[] = [
  coastalClaimSeed,
  ...[0, 1, 2, 3, 4, 5].map((dir) => neighbor(coastalClaimSeed, dir)).filter(inGrid)
].slice(0, 3);

// The true q extent now varies by row (the offset grid isn't a plain
// rectangle in q,r terms even though it is one in world space), so record
// the actual min/max across every generated tile rather than the nominal
// Q_MIN/Q_MAX — those are the row-0 baseline only.
const allQs = allCoords.map((c) => c.q);
const output = {
  seed: SEED,
  qRange: [Math.min(...allQs), Math.max(...allQs)],
  rRange: [R_MIN, R_MAX],
  estuary: bigPatchAnchor, // the larger patch's anchor — a stable single-coord handle for tooling that just needs "a" estuary tile
  startingClaim,
  tiles
};

const outPath = path.resolve(import.meta.dirname, "../../src/data/map.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

// A pre-built residential cluster of 10 Houses on Land (Section 4/8, v2.4's
// new starting state) — the player owns this from turn one, they don't
// build it. Per the map reshape, this is the "main Residential cluster, set
// apart from the river": seeded from the Land tile that maximizes distance
// to the nearest River/Estuary tile, so it's demonstrably the land pocket
// farthest from the water, not just "the first Land tile found."
const waterCoords = tiles.filter((t) => t.terrainId === "river" || t.terrainId === "estuary").map((t) => ({ q: t.q, r: t.r }));
const landCoords = allCoords.filter((c) => terrainOf.get(axialKey(c)) === "land");
function minDistToWater(c: AxialCoord): number {
  return Math.min(...waterCoords.map((w) => axialDistance(c, w)));
}
// Only consider seeds whose radius-2 spiral actually has 10 Land tiles to
// give — otherwise "farthest from the river" could pick a pocket too small
// to hold the full cluster (e.g. clipped by the grid edge).
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
  startingCoin: 1000, // explicitly a temporary testing value (Section 8), not tuned balance
  startingPopulation: 50,
  populationPerHouse: 5, // placeholder growth hook — "population scales with House count," no curve specified beyond that yet
  prebuiltHouses: houseCoords
};
const startingStatePath = path.resolve(import.meta.dirname, "../../src/data/startingState.json");
fs.writeFileSync(startingStatePath, JSON.stringify(startingState, null, 2));

// --- 6. Sanity-check the constraints before declaring success ---------------

const terrainIdSet = new Set(TERRAIN_DEFS.map((t) => t.id));
const badTerrainIds = tiles.filter((t) => !terrainIdSet.has(t.terrainId));
const riverTileCount = tiles.filter((t) => t.terrainId === "river").length;
const estuaryTileCount = tiles.filter((t) => t.terrainId === "estuary").length;
const landTileCount = tiles.filter((t) => t.terrainId === "land").length;

// Coast/Beach order check: every row should still read Coast then Beach at
// its west edge (unchanged by the reshape — the River/Estuary now wind
// through the interior and are no longer confined to a per-row band, so
// there's no "Land before water" invariant left to check here: on rows
// near the river's entry column, the river can legitimately appear right
// after Beach with no Land tile ahead of it in that row).
let orderViolations = 0;
for (let r = R_MIN; r <= R_MAX; r++) {
  const row = tiles.filter((t) => t.r === r).sort((a, b) => a.q - b.q);
  const order: string[] = [];
  for (const t of row) {
    if (order[order.length - 1] !== t.terrainId) order.push(t.terrainId);
  }
  const macro = order.filter((id, i) => id !== order[i - 1]);
  if (macro.indexOf("coast") !== 0 || macro.indexOf("beach") !== 1) orderViolations++;
}

// Estuary-patch check: the patches should read as several distinct clumps,
// not one contiguous blob (the whole point of the reshape) — flood-fill
// estuary-only tiles (not river) and count connected components.
function estuaryComponentCount(): number {
  const estuaryKeys = new Set(estuaryCoords.map(axialKey));
  const seen = new Set<string>();
  let components = 0;
  for (const c of estuaryCoords) {
    const key = axialKey(c);
    if (seen.has(key)) continue;
    components++;
    const queue = [c];
    seen.add(key);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(cur, dir);
        const nKey = axialKey(n);
        if (!estuaryKeys.has(nKey) || seen.has(nKey)) continue;
        seen.add(nKey);
        queue.push(n);
      }
    }
  }
  return components;
}
const estuaryPatchCount = estuaryComponentCount();

// Rectangle check: every row's westmost hex should sit at (approximately)
// the same world-X as every other row's — confirms the shear-cancelling
// offset actually worked, not just that terrain assignment is internally
// consistent. Half a hex-width of residual stagger between adjacent rows
// is the normal/expected brick-like hex offset, not an error; anything
// bigger accumulating across rows would mean the offset math is wrong.
function worldXOf(c: AxialCoord): number {
  return Math.sqrt(3) * (c.q + c.r / 2);
}
const westEdgeXs = [];
for (let r = R_MIN; r <= R_MAX; r++) {
  westEdgeXs.push(worldXOf({ q: rowQMin(r), r }));
}
const maxWestEdgeDrift = Math.max(...westEdgeXs) - Math.min(...westEdgeXs);
const HALF_HEX = Math.sqrt(3) / 2;

const minHouseToWaterDist = Math.min(...houseCoords.map((h) => Math.min(...waterCoords.map((w) => axialDistance(h, w)))));

console.log(`map.json written: ${tiles.length} tiles`);
console.log(`  coast: ${coastCoords.length}, beach: ${beachCoords.length}, land: ${landTileCount}, river: ${riverTileCount}, estuary: ${estuaryTileCount}`);
console.log(`  estuary patches (connected components): ${estuaryPatchCount} (should be several, not 1)`);
console.log(`  rows with a Coast/Beach order violation: ${orderViolations} / ${R_MAX - R_MIN + 1} (should be 0)`);
console.log(`  west-edge world-X drift across all rows: ${maxWestEdgeDrift.toFixed(3)} (should be <= ${HALF_HEX.toFixed(3)}, one half-hex stagger, not several hex-widths)`);
console.log(`  unknown terrain ids: ${badTerrainIds.length}`);
console.log(`  starting claim (coastal): ${startingClaim.map((c) => `(${c.q},${c.r})`).join(", ")}`);
console.log(`  big estuary patch anchor: (${bigPatchAnchor.q},${bigPatchAnchor.r})`);
console.log(`  house cluster seed: (${houseClusterSeed.q},${houseClusterSeed.r}), min distance from any prebuilt House to River/Estuary: ${minHouseToWaterDist}`);
console.log(`startingState.json written: ${houseCoords.length} pre-built Houses (should be 10), all on Land: ${houseCoords.every((c) => terrainOf.get(axialKey(c)) === "land")}`);

if (
  badTerrainIds.length > 0 ||
  estuaryTileCount < 6 ||
  estuaryTileCount > 9 ||
  estuaryPatchCount < 3 ||
  riverTileCount === 0 ||
  orderViolations > 0 ||
  houseCoords.length !== 10 ||
  maxWestEdgeDrift > HALF_HEX + 0.01
) {
  console.error("mapgen sanity check FAILED");
  process.exitCode = 1;
}
