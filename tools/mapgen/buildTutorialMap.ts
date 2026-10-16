/**
 * Writes the tutorial map: `src/data/maps/tutorial.json`.
 *
 * This is the one map in the game that is NOT a real place, and that is the
 * point. Section 15: the Tutorial now plays the same game as Panaji — one
 * build a year, a forecast cone, the build cards' numbers, a storm and its
 * result — on a coast small enough to take in at a glance. So the map carries
 * what the Panaji engine reads: zones (the beach is the landfall zone),
 * authored ground heights (low homes near the shore, higher ones inland), a
 * focus and a few plain place names.
 *
 * The layout is a diagram: open sea, then a strip of sand, then a river
 * letting itself out through a mangrove estuary, with homes on the land
 * behind. The same arrangement every Goan river mouth has, drawn with the
 * noise taken out. Authored as the picture itself, because the only question
 * anyone asks of it is "what does it look like".
 */
import fs from "node:fs";
import path from "node:path";

/**
 * West is left. One character per hex; rows stagger by half a hex on screen.
 *
 *   ~ open sea        . beach          # land (homes)        ^ higher land (homes)
 *   = river channel   o estuary (brackish: mangroves and khazans)
 */
const LAYOUT = [
  "~ ~ ~ . . # # ^ ^ ^ ^",
  "~ ~ ~ . . # # # ^ ^ ^",
  "~ ~ . . # # # # # ^ ^",
  "~ ~ . . o o # # # # ^",
  "~ ~ . o o = = = = = =",
  "~ ~ . . o o # # # # ^",
  "~ ~ . . # # # # # ^ ^",
  "~ ~ ~ . . # # # ^ ^ ^",
  "~ ~ ~ . . # # ^ ^ ^ ^"
];

const TERRAIN_BY_GLYPH: Record<string, string> = {
  "~": "coast",
  ".": "beach",
  "#": "land",
  "^": "land",
  "=": "river",
  o: "estuary"
};

/** Ground height, metres: the sea and the sand low, the first homes a little up, the higher land well above any surge. */
function elevationFor(glyph: string, column: number): number {
  if (glyph === "~") return 0;
  if (glyph === ".") return 1;
  if (glyph === "o" || glyph === "=") return 0.5;
  if (glyph === "^") return 9 + column * 0.5;
  return 1.6 + Math.max(0, column - 4) * 0.9;
}

/** Plain names for the places the coach and the cards mention (no real place is claimed). */
const ANCHORS: { name: string; glyph: string; column: number; row: number }[] = [
  { name: "Open sea", glyph: "~", column: 0, row: 4 },
  { name: "The beach", glyph: ".", column: 3, row: 2 },
  // Far enough apart that their names never meet on the forecast's small map.
  { name: "The estuary", glyph: "o", column: 3, row: 4 },
  { name: "The river", glyph: "=", column: 9, row: 4 },
  { name: "The village", glyph: "#", column: 6, row: 1 }
];

interface Tile {
  q: number;
  r: number;
  terrainId: string;
  elevationM: number;
}

function main(): void {
  const rows = LAYOUT.map((line) => line.trim().split(/\s+/));
  const rowCount = rows.length;
  const colCount = rows[0].length;
  for (const [index, row] of rows.entries()) {
    if (row.length !== colCount) throw new Error(`tutorial layout row ${index} has ${row.length} cells, expected ${colCount}`);
  }
  // Same row-offset rectangle the city maps use, so the board renders as an actual rectangle.
  const rMin = -Math.floor(rowCount / 2);
  const qMin = -Math.floor(colCount / 2);
  const coordAt = (column: number, row: number): { q: number; r: number } => {
    const r = rMin + row;
    return { q: qMin - Math.floor(r / 2) + column, r };
  };

  const tiles: Tile[] = [];
  const counts = new Map<string, number>();
  const zoneTiles: Record<string, [number, number][]> = { z1: [], z2: [], z3: [], z4: [] };
  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column < colCount; column++) {
      const glyph = rows[row][column];
      const terrainId = TERRAIN_BY_GLYPH[glyph];
      if (!terrainId) throw new Error(`tutorial layout has unknown glyph "${glyph}" at row ${row}, column ${column}`);
      const { q, r } = coordAt(column, row);
      tiles.push({ q, r, terrainId, elevationM: Math.round(elevationFor(glyph, column) * 10) / 10 });
      counts.set(terrainId, (counts.get(terrainId) ?? 0) + 1);
      // Zones as Panaji has them: the beach (where a cyclone comes ashore), the wetland, the river, the low homes behind the beach.
      if (glyph === ".") zoneTiles.z1.push([q, r]);
      else if (glyph === "o") zoneTiles.z2.push([q, r]);
      else if (glyph === "=") zoneTiles.z3.push([q, r]);
      else if (glyph === "#") zoneTiles.z4.push([q, r]);
    }
  }

  const minimums: Record<string, number> = { coast: 10, beach: 10, land: 30, river: 4, estuary: 6 };
  for (const [terrainId, minimum] of Object.entries(minimums)) {
    const actual = counts.get(terrainId) ?? 0;
    if (actual < minimum) throw new Error(`tutorial map has only ${actual} ${terrainId} tiles, needs ${minimum}`);
  }

  const landmarks = ANCHORS.map((anchor) => {
    const glyph = rows[anchor.row][anchor.column];
    if (glyph !== anchor.glyph) throw new Error(`tutorial anchor "${anchor.name}" expects "${anchor.glyph}" at row ${anchor.row}, column ${anchor.column} but the layout has "${glyph}"`);
    return { name: anchor.name, ...coordAt(anchor.column, anchor.row) };
  });

  const file = {
    id: "tutorial",
    name: "Tutorial Cove",
    region: "A teaching map, not a real place",
    blurb: "A made-up river mouth, drawn simply: open sea, a bar of sand, an estuary, the river behind it, and a village on the land, so you can see all of it at once.",
    // No `geo` block: this map is not georeferenced, and claiming otherwise would be a lie.
    focus: coordAt(5, 4),
    elevation: {
      elevationSource: "authored",
      source: "Authored for the tutorial: low near the shore, higher inland. Not a real place.",
      licence: "Part of this game",
      accessed: "2026-10-16"
    },
    zones: [
      { id: "z1", name: "the beach", tiles: zoneTiles.z1 },
      { id: "z2", name: "the estuary", tiles: zoneTiles.z2 },
      { id: "z3", name: "the river", tiles: zoneTiles.z3 },
      { id: "z4", name: "the village", tiles: zoneTiles.z4 }
    ],
    landmarks,
    tiles
  };

  const outPath = path.resolve(process.cwd(), "src/data/maps/tutorial.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`=== ${file.name} ===`);
  console.log(`${tiles.length} tiles (${colCount} x ${rowCount})`);
  console.log(["coast", "beach", "land", "river", "estuary"].map((id) => `${id} ${counts.get(id) ?? 0}`).join("   "));
  for (const [index, row] of rows.entries()) console.log(" ".repeat(index) + row.join(" "));
  console.log(`beach (landfall zone): ${zoneTiles.z1.map(([q, r]) => `${q},${r}`).join(" ")}`);
  console.log(`\nWrote ${path.relative(process.cwd(), outPath)}`);
}

main();
