/**
 * Section 4 (v2.1): the terrain map is fixed and pre-generated, not
 * player-drawn. This script runs the WFC-lite edge-matching solver ONCE,
 * offline, over a full hex grid under authored region constraints, and
 * serializes the result to src/data/map.json. It is never run at app
 * runtime — `npm run mapgen`, check the output in, done.
 *
 * Layout: a wide, short strip (west-to-east wider than north-to-south),
 * reading as "a stretch of coast" rather than a blob. World-space X is used
 * to bucket every hex into a west/mid/east band (axial q alone doesn't
 * track world-space west/east cleanly — see axialToWorld), so band
 * membership is robust regardless of axial skew.
 */
import fs from "node:fs";
import path from "node:path";
import { type AxialCoord, axialKey, axialToWorld, neighbor, axialDistance } from "../../src/core/hex";
import { edgesCompatible, type EdgeType } from "../../src/core/edgeTypes";
import { TERRAIN_BY_ID, TERRAIN_DEFS } from "../../src/core/terrain";

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

function pickWeighted<T extends string>(pool: [T, number][]): T {
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [id, w] of pool) {
    if (r < w) return id;
    r -= w;
  }
  return pool[pool.length - 1][0];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- 1. Build the grid, compute world-x band membership --------------------

const allCoords: AxialCoord[] = [];
for (let q = Q_MIN; q <= Q_MAX; q++) {
  for (let r = R_MIN; r <= R_MAX; r++) {
    allCoords.push({ q, r });
  }
}

const worldX = new Map<string, number>();
for (const c of allCoords) worldX.set(axialKey(c), axialToWorld(c, HEX_SIZE).x);
const xs = Array.from(worldX.values());
const xMin = Math.min(...xs);
const xMax = Math.max(...xs);
const band1 = xMin + (xMax - xMin) / 3;
const band2 = xMin + (2 * (xMax - xMin)) / 3;

type Band = "west" | "mid" | "east";
function bandOf(coord: AxialCoord): Band {
  const x = worldX.get(axialKey(coord))!;
  if (x < band1) return "west";
  if (x < band2) return "mid";
  return "east";
}

// --- 2. Carve exactly 2 continuous river paths, east -> shared west estuary ---

const grid = new Map<string, AxialCoord>();
for (const c of allCoords) grid.set(axialKey(c), c);

function inGrid(c: AxialCoord): boolean {
  return grid.has(axialKey(c));
}

const westCoords = allCoords.filter((c) => bandOf(c) === "west");
const eastCoords = allCoords.filter((c) => bandOf(c) === "east");

// Estuary sits centered in the west band, at r close to 0 (the coastal midline).
const estuaryCoord = westCoords.reduce((best, c) => (Math.abs(c.r) < Math.abs(best.r) ? c : best));

// Two river sources on the east edge, offset north/south so the two paths
// aren't identical.
function extremeEastAt(rTarget: number): AxialCoord {
  return eastCoords.reduce((best, c) => {
    const bestScore = Math.abs(c.r - rTarget) - worldX.get(axialKey(c))! * 0.001;
    const curScore = Math.abs(best.r - rTarget) - worldX.get(axialKey(best))! * 0.001;
    return bestScore < curScore ? c : best;
  });
}
const riverSourceA = eastCoords.reduce((best, c) => (c.r < best.r ? c : best), extremeEastAt(R_MIN));
const riverSourceB = eastCoords.reduce((best, c) => (c.r > best.r ? c : best), extremeEastAt(R_MAX));

/**
 * A near-greedy walk from `start` toward `target`: always moves strictly
 * closer (ties broken by a small random jitter for a natural wiggle, not a
 * detour), so path length stays close to the true hex distance instead of
 * wandering.
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
      if (!inGrid(n) || visited.has(key)) continue;
      candidates.push({ coord: n, score: -axialDistance(n, target) + rng() * 0.2 });
    }
    if (candidates.length === 0) break; // boxed in; stop where we are
    candidates.sort((a, b) => b.score - a.score);
    current = candidates[0].coord;
    visited.add(axialKey(current));
    path.push(current);
  }
  if (axialDistance(current, target) > 0) path.push(target); // guarantee it actually reaches the estuary
  return path;
}

const riverA = walkRiver(riverSourceA, estuaryCoord);
const riverB = walkRiver(riverSourceB, estuaryCoord);

const fixedTerrain = new Map<string, string>();
for (const c of [...riverA, ...riverB]) fixedTerrain.set(axialKey(c), "river");
fixedTerrain.set(axialKey(estuaryCoord), "estuary"); // the river mouth itself

// --- 3. Greedy band-constrained fill for everything else --------------------

const WEST_POOL: [string, number][] = [
  ["coast", 0.6],
  ["estuary", 0.4]
];
const MID_POOL: [string, number][] = [
  ["khazan_flatland", 0.4],
  ["village_plains", 0.4],
  ["forest", 0.2]
];
const EAST_POOL: [string, number][] = [
  ["laterite_plateau", 0.6],
  ["forest", 0.4]
];

function poolFor(band: Band): [string, number][] {
  return band === "west" ? WEST_POOL : band === "mid" ? MID_POOL : EAST_POOL;
}

const terrainOf = new Map<string, string>(fixedTerrain);

function edgeTypeOf(terrainId: string): EdgeType {
  return TERRAIN_BY_ID.get(terrainId)!.edgeTypes[0]; // every terrain in this pilot is uniform on all 6 edges
}

function compatibleWithAssignedNeighbors(coord: AxialCoord, candidateId: string): number {
  let incompatibleCount = 0;
  for (let dir = 0; dir < 6; dir++) {
    const n = neighbor(coord, dir);
    const nId = terrainOf.get(axialKey(n));
    if (!nId) continue;
    if (!edgesCompatible(edgeTypeOf(candidateId), edgeTypeOf(nId))) incompatibleCount++;
  }
  return incompatibleCount;
}

function isWaterAdjacentAlready(coord: AxialCoord): boolean {
  for (let dir = 0; dir < 6; dir++) {
    const nId = terrainOf.get(axialKey(neighbor(coord, dir)));
    if (nId === "river" || nId === "estuary") return true;
  }
  return false;
}

// Scan west -> mid -> east so each tile's already-decided neighbors bias the next pick.
const scanOrder = [...westCoords, ...allCoords.filter((c) => bandOf(c) === "mid"), ...eastCoords];

// Khazan flatland is thematically riverside reclaimed land (Section 4/5) —
// a real defense (the khazan) specifically needs it water-adjacent, so bias
// the generator to actually place it near rivers/the estuary, not scatter
// it uniformly through the mid band. Without this, khazan_flatland tiles
// that are *also* water-adjacent turn out rare enough that the khazan
// defense becomes nearly unbuildable in a full playthrough (caught by
// tests/balance.test.ts, not by eye).
const WATERSIDE_KHAZAN_BIAS = 0.75;

for (const coord of scanOrder) {
  const key = axialKey(coord);
  if (terrainOf.has(key)) continue; // river/estuary already fixed

  const band = bandOf(coord);
  let pool = shuffle(poolFor(band));
  if (band === "mid" && isWaterAdjacentAlready(coord) && rng() < WATERSIDE_KHAZAN_BIAS) {
    pool = [["khazan_flatland", 1], ...pool.filter(([id]) => id !== "khazan_flatland")];
  }

  let chosen: string | null = null;
  for (const [id] of pool) {
    if (compatibleWithAssignedNeighbors(coord, id) === 0) {
      chosen = id;
      break;
    }
  }
  if (!chosen) {
    // Best-effort fallback: fewest incompatible neighbors, weighted pick among ties.
    chosen = pool.reduce((best, [id]) =>
      compatibleWithAssignedNeighbors(coord, id) < compatibleWithAssignedNeighbors(coord, best) ? id : best,
      pool[0][0]
    );
  }
  terrainOf.set(key, chosen);
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
let incompatibleEdges = 0;
for (const coord of allCoords) {
  for (let dir = 0; dir < 3; dir++) {
    const n = neighbor(coord, dir);
    if (!inGrid(n)) continue;
    const a = terrainOf.get(axialKey(coord))!;
    const b = terrainOf.get(axialKey(n))!;
    if (!edgesCompatible(edgeTypeOf(a), edgeTypeOf(b))) incompatibleEdges++;
  }
}
const riverTileCount = tiles.filter((t) => t.terrainId === "river").length;
const badTerrainIds = tiles.filter((t) => !terrainIdSet.has(t.terrainId));

console.log(`map.json written: ${tiles.length} tiles`);
console.log(`  river tiles: ${riverTileCount} (2 paths + shared estuary mouth)`);
console.log(`  incompatible edge pairs: ${incompatibleEdges}`);
console.log(`  unknown terrain ids: ${badTerrainIds.length}`);
console.log(`  starting claim: ${startingClaim.map((c) => `(${c.q},${c.r})`).join(", ")}`);

if (incompatibleEdges > 0 || badTerrainIds.length > 0) {
  console.error("mapgen sanity check FAILED");
  process.exitCode = 1;
}
