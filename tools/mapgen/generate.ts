/**
 * Section 4 (v2.4): the terrain map is fixed and pre-generated, not
 * player-drawn. This script runs ONCE, offline, and serializes the result
 * to src/data/map.json. It is never run at app runtime — `npm run mapgen`,
 * check the output in, done.
 *
 * Layout (v2.4, explicit left-to-right): Sea → Beach → Land (interior) →
 * Estuary/River, with the river continuing further right/inland past the
 * estuary. A wide, short strip (west-to-east wider than north-to-south).
 *
 * Bands are chosen by axial `q` alone, not world-space X. This looks
 * backwards at first — `axialToWorld`'s x = sqrt3*(q + r/2), so a fixed-q
 * "column" drifts diagonally in world space as r changes — but that
 * uniform per-row drift is exactly what makes it correct here: every row
 * gets the *same number* of coast/beach columns, so the edge reads as one
 * smooth (if gently diagonal) line. A world-X threshold looks more
 * "correct" on paper but picks a *global* min/max across every row at
 * once, which — since each row's own local x-range is itself shifted by
 * that same r/2 term — ends up selecting lots of tiles from the rows near
 * one corner and almost none from the rows near the opposite corner: the
 * sea "wraps around a map corner" instead of forming a single edge, which
 * is exactly the bug an earlier version of this script had (caught by a
 * live playtest, not by eye). A gentle diagonal is a fine stand-in for
 * Goa's real "gently curved shore" for this pilot's purposes anyway.
 */
import fs from "node:fs";
import path from "node:path";
import { type AxialCoord, axialKey, neighbor, axialDistance, hexRing, hexSpiral } from "../../src/core/hex";
import { TERRAIN_DEFS } from "../../src/core/terrain";

const Q_MIN = -13;
const Q_MAX = 13;
const R_MIN = -4;
const R_MAX = 4;
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

// --- 1. Build the grid, define the left-to-right band boundaries by q ------

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

const TOTAL_COLS = Q_MAX - Q_MIN + 1; // 27
const COAST_COLS = 1;
const BEACH_COLS = 3;
const coastMaxQ = Q_MIN + COAST_COLS - 1; // q <= this: Sea
const beachMaxQ = coastMaxQ + BEACH_COLS; // q in (coastMaxQ, beachMaxQ]: Beach
const waterZoneMinQ = Q_MIN + Math.floor(TOTAL_COLS * 0.62); // Estuary/River confined to the eastern ~38%

const coastCoords = allCoords.filter((c) => c.q <= coastMaxQ);
const coastSet = new Set(coastCoords.map(axialKey));
const beachCoords = allCoords.filter((c) => c.q > coastMaxQ && c.q <= beachMaxQ);
const beachSet = new Set(beachCoords.map(axialKey));
const waterZoneCoords = allCoords.filter((c) => c.q >= waterZoneMinQ);
const waterZoneSet = new Set(waterZoneCoords.map(axialKey));

// --- 2. Carve a wide, branching estuary: two river arms meeting inland -----

// Two sources at the far east edge (the map's inland extreme), offset
// north/south, so the two arms read as distinct tributaries rather than
// one straight line.
const eastEdgeCoords = allCoords.filter((c) => c.q === Q_MAX);
const riverSourceA = eastEdgeCoords.reduce((best, c) => (c.r < best.r ? c : best), eastEdgeCoords[0]);
const riverSourceB = eastEdgeCoords.reduce((best, c) => (c.r > best.r ? c : best), eastEdgeCoords[0]);

// The confluence sits toward the *west* edge of the water zone (not all the
// way back to Beach/Land — Land still separates it from the coast), close
// to the coastal midline, so there's a real stretch of river continuing
// further east/inland past it once the arms join.
const confluence = waterZoneCoords.reduce((best, c) => {
  const score = (c.q - waterZoneMinQ) + Math.abs(c.r) * 0.5;
  const bestScore = (best.q - waterZoneMinQ) + Math.abs(best.r) * 0.5;
  return score < bestScore ? c : best;
}, waterZoneCoords[0]);

/**
 * A near-greedy walk from `start` toward `target`, staying within the water
 * zone (so the estuary/river system doesn't spill into Land): always moves
 * strictly closer (ties broken by a small random jitter for a natural
 * wiggle, not a detour), so path length stays close to the true hex
 * distance instead of wandering.
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
      if (!waterZoneSet.has(key) || visited.has(key)) continue;
      candidates.push({ coord: n, score: -axialDistance(n, target) + rng() * 0.2 });
    }
    if (candidates.length === 0) break; // boxed in; stop where we are
    candidates.sort((a, b) => b.score - a.score);
    current = candidates[0].coord;
    visited.add(axialKey(current));
    path.push(current);
  }
  if (axialDistance(current, target) > 0) path.push(target); // guarantee it actually reaches the confluence
  return path;
}

const riverArmA = walkRiver(riverSourceA, confluence);
const riverArmB = walkRiver(riverSourceB, confluence);

// The estuary itself: the confluence plus a ring of neighbors still inside
// the water zone — a small branching blob, not a single tile.
const estuaryCoords = [confluence, ...hexRing(confluence, 1).filter((c) => waterZoneSet.has(axialKey(c)))];
const estuarySet = new Set(estuaryCoords.map(axialKey));

// --- 3. Assign terrain: Coast / Beach / Estuary / River fixed, rest Land ---

const terrainOf = new Map<string, string>();
for (const c of coastCoords) terrainOf.set(axialKey(c), "coast");
for (const c of beachCoords) terrainOf.set(axialKey(c), "beach");
for (const c of estuaryCoords) terrainOf.set(axialKey(c), "estuary");
for (const c of [...riverArmA, ...riverArmB]) {
  const key = axialKey(c);
  if (!estuarySet.has(key)) terrainOf.set(key, "river");
}
for (const c of allCoords) {
  const key = axialKey(c);
  if (!terrainOf.has(key)) terrainOf.set(key, "land");
}

// --- 4. Serialize -------------------------------------------------------------

interface MapTile {
  q: number;
  r: number;
  terrainId: string;
}

const tiles: MapTile[] = allCoords.map((c) => ({ q: c.q, r: c.r, terrainId: terrainOf.get(axialKey(c))! }));

// The player's initial claim is a small coastal footprint (Section 4/8,
// v2.4: "the player begins already owning a small coastal claim") — near
// the shore, not the (now-inland) estuary. Centered on a Beach tile close
// to the coastal midline.
const coastalClaimSeed = beachCoords.reduce((best, c) => (Math.abs(c.r) < Math.abs(best.r) ? c : best), beachCoords[0]);
const startingClaim: AxialCoord[] = [
  coastalClaimSeed,
  ...[0, 1, 2, 3, 4, 5].map((dir) => neighbor(coastalClaimSeed, dir)).filter(inGrid)
].slice(0, 3);

const output = {
  seed: SEED,
  qRange: [Q_MIN, Q_MAX],
  rRange: [R_MIN, R_MAX],
  estuary: confluence,
  startingClaim,
  tiles
};

const outPath = path.resolve(import.meta.dirname, "../../src/data/map.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

// A pre-built residential cluster of 10 Houses on Land, inland from the
// coastal claim (Section 4/8, v2.4's new starting state) — the player owns
// this from turn one, they don't build it. Seeded from the first Land tile
// on the coastal claim's own row, so it reads as "just inland" rather than
// scattered.
const houseClusterSeed = allCoords
  .filter((c) => c.r === coastalClaimSeed.r && terrainOf.get(axialKey(c)) === "land")
  .reduce((best, c) => (c.q < best.q ? c : best));
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

// --- 5. Sanity-check the constraints before declaring success ---------------

const terrainIdSet = new Set(TERRAIN_DEFS.map((t) => t.id));
const badTerrainIds = tiles.filter((t) => !terrainIdSet.has(t.terrainId));
const riverTileCount = tiles.filter((t) => t.terrainId === "river").length;
const estuaryTileCount = tiles.filter((t) => t.terrainId === "estuary").length;
const landTileCount = tiles.filter((t) => t.terrainId === "land").length;

// Order check: every row should read Coast, then Beach, then Land, before
// any Estuary/River tile ever appears — confirms every row sees the same
// left-to-right order (Sea -> Beach -> Land -> Estuary/River), not just
// "these terrains exist somewhere on the map."
let orderViolations = 0;
for (let r = R_MIN; r <= R_MAX; r++) {
  const row = tiles.filter((t) => t.r === r).sort((a, b) => a.q - b.q);
  const order: string[] = [];
  for (const t of row) {
    if (order[order.length - 1] !== t.terrainId) order.push(t.terrainId);
  }
  const macro = order.filter((id, i) => id !== order[i - 1]);
  const coastIdx = macro.indexOf("coast");
  const beachIdx = macro.indexOf("beach");
  const landIdx = macro.indexOf("land");
  const waterIdx = Math.min(
    ...["estuary", "river"].map((id) => macro.indexOf(id)).filter((i) => i >= 0)
  );
  if (coastIdx !== 0 || beachIdx !== 1 || landIdx < 0 || (waterIdx >= 0 && landIdx > waterIdx)) orderViolations++;
}

console.log(`map.json written: ${tiles.length} tiles`);
console.log(`  coast: ${coastCoords.length}, beach: ${beachCoords.length}, land: ${landTileCount}, river: ${riverTileCount}, estuary: ${estuaryTileCount}`);
console.log(`  rows with a left-to-right order violation: ${orderViolations} / ${R_MAX - R_MIN + 1} (should be 0)`);
console.log(`  unknown terrain ids: ${badTerrainIds.length}`);
console.log(`  starting claim (coastal): ${startingClaim.map((c) => `(${c.q},${c.r})`).join(", ")}`);
console.log(`  estuary center: (${confluence.q},${confluence.r})`);
console.log(`startingState.json written: ${houseCoords.length} pre-built Houses (should be 10), all on Land: ${houseCoords.every((c) => terrainOf.get(axialKey(c)) === "land")}`);

if (
  badTerrainIds.length > 0 ||
  estuaryTileCount < 3 ||
  riverTileCount === 0 ||
  orderViolations > 0 ||
  houseCoords.length !== 10
) {
  console.error("mapgen sanity check FAILED");
  process.exitCode = 1;
}
