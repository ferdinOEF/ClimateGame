/**
 * Section 4 (v2.2): the terrain map is fixed and pre-generated, not
 * player-drawn, and — since the trimmed-content revision — coastal-only:
 * one sea-facing edge (Coast), Beach filling everything else, and one
 * continuous River reaching the sea at a single Estuary tile. This script
 * runs ONCE, offline, and serializes the result to src/data/map.json. It is
 * never run at app runtime — `npm run mapgen`, check the output in, done.
 *
 * Layout: a wide, short strip (west-to-east wider than north-to-south),
 * reading as "a stretch of coast" rather than a blob, sea on the west edge.
 * World-space X is used to find that edge (axial q alone doesn't track
 * world-space west/east cleanly — see axialToWorld), so the edge is a
 * straight line in the rendered scene regardless of axial skew.
 */
import fs from "node:fs";
import path from "node:path";
import { type AxialCoord, axialKey, axialToWorld, neighbor, axialDistance } from "../../src/core/hex";
import { TERRAIN_DEFS } from "../../src/core/terrain";

const Q_MIN = -13;
const Q_MAX = 13;
const R_MIN = -4;
const R_MAX = 4;
const HEX_SIZE = 1.0;
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

// --- 1. Build the grid, find the sea-facing edge -----------------------------

const allCoords: AxialCoord[] = [];
for (let q = Q_MIN; q <= Q_MAX; q++) {
  for (let r = R_MIN; r <= R_MAX; r++) {
    allCoords.push({ q, r });
  }
}

const grid = new Map<string, AxialCoord>();
for (const c of allCoords) grid.set(axialKey(c), c);
function inGrid(c: AxialCoord): boolean {
  return grid.has(axialKey(c));
}

const worldX = new Map<string, number>();
for (const c of allCoords) worldX.set(axialKey(c), axialToWorld(c, HEX_SIZE).x);
const xs = Array.from(worldX.values());
const xMin = Math.min(...xs);

// One hex-column's world-x spacing, so the coast reads as a single sea-edge
// column regardless of axial skew across rows.
const COAST_DEPTH = Math.sqrt(3) * HEX_SIZE * 1.05;
const coastThreshold = xMin + COAST_DEPTH;

const coastCoords = allCoords.filter((c) => worldX.get(axialKey(c))! < coastThreshold);
const coastSet = new Set(coastCoords.map(axialKey));
const landCoords = allCoords.filter((c) => !coastSet.has(axialKey(c)));

// --- 2. Carve one continuous river from an inland source to the sea ---------

function isCoastAdjacent(c: AxialCoord): boolean {
  for (let dir = 0; dir < 6; dir++) {
    if (coastSet.has(axialKey(neighbor(c, dir)))) return true;
  }
  return false;
}

// A single inland source near the east edge (the far side of the map from
// the sea), close to the coastal midline (r near 0) so the river reads as a
// natural, mostly-direct run down to the coast rather than a long diagonal.
const maxQ = Math.max(...landCoords.map((c) => c.q));
const eastEdgeCoords = landCoords.filter((c) => c.q === maxQ);
const riverSource = eastEdgeCoords.reduce((best, c) => (Math.abs(c.r) < Math.abs(best.r) ? c : best), eastEdgeCoords[0]);

// The river's mouth: the shore-fronting Beach tile nearest the source's row
// — this tile becomes the Estuary once the river reaches it.
const shoreCoords = landCoords.filter(isCoastAdjacent);
const riverTarget = shoreCoords.reduce((best, c) =>
  Math.abs(c.r - riverSource.r) < Math.abs(best.r - riverSource.r) ? c : best
);

/**
 * A near-greedy walk from `start` toward `target`, staying on land (never
 * routing through Coast — the river reaches the sea only at its final
 * tile, the Estuary): always moves strictly closer (ties broken by a small
 * random jitter for a natural wiggle, not a detour), so path length stays
 * close to the true hex distance instead of wandering.
 */
function walkRiver(start: AxialCoord, target: AxialCoord): AxialCoord[] {
  const path: AxialCoord[] = [start];
  const visited = new Set<string>([axialKey(start)]);
  let current = start;
  const maxSteps = axialDistance(start, target) + 6;

  for (let step = 0; step < maxSteps; step++) {
    if (axialDistance(current, target) === 0) break;
    const candidates: { coord: AxialCoord; score: number }[] = [];
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbor(current, dir);
      const key = axialKey(n);
      if (!inGrid(n) || coastSet.has(key) || visited.has(key)) continue;
      candidates.push({ coord: n, score: -axialDistance(n, target) + rng() * 0.2 });
    }
    if (candidates.length === 0) break; // boxed in; stop where we are
    candidates.sort((a, b) => b.score - a.score);
    current = candidates[0].coord;
    visited.add(axialKey(current));
    path.push(current);
  }
  if (axialDistance(current, target) > 0) path.push(target); // guarantee it actually reaches the shore
  return path;
}

const riverPath = walkRiver(riverSource, riverTarget);
const estuaryCoord = riverPath[riverPath.length - 1];

// --- 3. Assign terrain: Coast / River / Estuary fixed, everything else Beach -

const terrainOf = new Map<string, string>();
for (const c of coastCoords) terrainOf.set(axialKey(c), "coast");
for (const c of riverPath.slice(0, -1)) terrainOf.set(axialKey(c), "river");
terrainOf.set(axialKey(estuaryCoord), "estuary");
for (const c of allCoords) {
  const key = axialKey(c);
  if (!terrainOf.has(key)) terrainOf.set(key, "beach");
}

// --- 4. Serialize -------------------------------------------------------------

interface MapTile {
  q: number;
  r: number;
  terrainId: string;
}

const tiles: MapTile[] = allCoords.map((c) => ({ q: c.q, r: c.r, terrainId: terrainOf.get(axialKey(c))! }));

const startingClaim: AxialCoord[] = [
  estuaryCoord,
  ...[0, 1, 2, 3, 4, 5].map((dir) => neighbor(estuaryCoord, dir)).filter(inGrid)
].slice(0, 3);

const output = {
  seed: SEED,
  qRange: [Q_MIN, Q_MAX],
  rRange: [R_MIN, R_MAX],
  estuary: estuaryCoord,
  startingClaim,
  tiles
};

const outPath = path.resolve(import.meta.dirname, "../../src/data/map.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

// --- 5. Sanity-check the constraints before declaring success ---------------

const terrainIdSet = new Set(TERRAIN_DEFS.map((t) => t.id));
const badTerrainIds = tiles.filter((t) => !terrainIdSet.has(t.terrainId));
const riverTileCount = tiles.filter((t) => t.terrainId === "river").length;
const estuaryTileCount = tiles.filter((t) => t.terrainId === "estuary").length;
let riverDisconnected = 0;
for (let i = 1; i < riverPath.length; i++) {
  if (axialDistance(riverPath[i - 1], riverPath[i]) !== 1) riverDisconnected++;
}
const estuaryReachesSea = isCoastAdjacent(estuaryCoord);

console.log(`map.json written: ${tiles.length} tiles`);
console.log(`  coast tiles: ${coastCoords.length}`);
console.log(`  river tiles: ${riverTileCount}, estuary tiles: ${estuaryTileCount} (should be exactly 1)`);
console.log(`  river path disconnected hops: ${riverDisconnected} (should be 0)`);
console.log(`  estuary reaches the sea (coast-adjacent): ${estuaryReachesSea}`);
console.log(`  unknown terrain ids: ${badTerrainIds.length}`);
console.log(`  starting claim: ${startingClaim.map((c) => `(${c.q},${c.r})`).join(", ")}`);

if (badTerrainIds.length > 0 || estuaryTileCount !== 1 || riverDisconnected > 0 || !estuaryReachesSea) {
  console.error("mapgen sanity check FAILED");
  process.exitCode = 1;
}
