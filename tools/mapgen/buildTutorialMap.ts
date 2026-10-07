/**
 * Writes the tutorial map: `src/data/maps/tutorial.json`.
 *
 * This is the one map in the game that is NOT a real place, and that is the
 * point. A first-time player has to learn five terrain types, three families
 * of defence and the build-advances-the-turn rule, and Panaji's 323 tiles are
 * the wrong place to learn any of it — the eye has nowhere to start.
 *
 * So the layout below is a diagram: open sea, then a strip of sand, then a
 * river letting itself out through a mangrove estuary, then land behind. Every
 * terrain type is visible without panning, each one is a clean band rather
 * than a realistic scatter, and the whole board is 63 tiles. It is the same
 * arrangement every Goan river mouth has, drawn with the noise taken out.
 *
 * The map is authored as the picture itself rather than as a coordinate list,
 * because the only question anyone will ever ask of it is "what does it look
 * like" — and a coordinate list cannot answer that.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * West is left. One character per hex; rows stagger by half a hex on screen,
 * exactly as the ASCII previews in `buildCityMaps.ts` print them.
 *
 *   ~ open sea        . beach          # land
 *   = river channel   o estuary (brackish: mangroves and khazans)
 */
const LAYOUT = [
  "~ ~ . # # # # # #",
  "~ ~ . . # # # # #",
  "~ ~ . . o o # # #",
  "~ ~ . o o = = = =",
  "~ ~ . . o o # # #",
  "~ ~ . . # # # # #",
  "~ ~ . # # # # # #"
];

const TERRAIN_BY_GLYPH: Record<string, string> = {
  "~": "coast",
  ".": "beach",
  "#": "land",
  "=": "river",
  o: "estuary"
};

/**
 * Where each teaching beat happens, so the coach can point at a specific tile
 * rather than saying "find a beach somewhere". Coordinates are filled in from
 * the layout below — see `anchorFor`.
 */
const ANCHORS: { name: string; glyph: string; column: number; row: number }[] = [
  { name: "Open sea", glyph: "~", column: 0, row: 3 },
  { name: "Beach", glyph: ".", column: 2, row: 3 },
  { name: "Estuary", glyph: "o", column: 4, row: 3 },
  { name: "River", glyph: "=", column: 6, row: 3 },
  { name: "Land", glyph: "#", column: 6, row: 0 }
];

interface Tile {
  q: number;
  r: number;
  terrainId: string;
}

function main(): void {
  const rows = LAYOUT.map((line) => line.trim().split(/\s+/));
  const rowCount = rows.length;
  const colCount = rows[0].length;

  for (const [index, row] of rows.entries()) {
    if (row.length !== colCount) {
      throw new Error(`tutorial layout row ${index} has ${row.length} cells, expected ${colCount}`);
    }
  }

  // Same row-offset rectangle the city maps use, so the board renders as an
  // actual rectangle rather than a parallelogram. See `buildCityMaps.ts`.
  const rMin = -Math.floor(rowCount / 2);
  const qMin = -Math.floor(colCount / 2);
  const coordAt = (column: number, row: number): { q: number; r: number } => {
    const r = rMin + row;
    return { q: qMin - Math.floor(r / 2) + column, r };
  };

  const tiles: Tile[] = [];
  const counts = new Map<string, number>();
  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column < colCount; column++) {
      const glyph = rows[row][column];
      const terrainId = TERRAIN_BY_GLYPH[glyph];
      if (!terrainId) throw new Error(`tutorial layout has unknown glyph "${glyph}" at row ${row}, column ${column}`);
      const { q, r } = coordAt(column, row);
      tiles.push({ q, r, terrainId });
      counts.set(terrainId, (counts.get(terrainId) ?? 0) + 1);
    }
  }

  // The coach walks the player through one build on each of sand, estuary,
  // river and land, so each needs real room — not the bare minimum.
  const minimums: Record<string, number> = { coast: 6, beach: 6, land: 10, river: 3, estuary: 4 };
  for (const [terrainId, minimum] of Object.entries(minimums)) {
    const actual = counts.get(terrainId) ?? 0;
    if (actual < minimum) throw new Error(`tutorial map has only ${actual} ${terrainId} tiles, needs ${minimum}`);
  }

  const landmarks = ANCHORS.map((anchor) => {
    const glyph = rows[anchor.row][anchor.column];
    if (glyph !== anchor.glyph) {
      throw new Error(
        `tutorial anchor "${anchor.name}" expects "${anchor.glyph}" at row ${anchor.row}, column ${anchor.column} but the layout has "${glyph}"`
      );
    }
    const { q, r } = coordAt(anchor.column, anchor.row);
    return { name: anchor.name, q, r };
  });

  const file = {
    id: "tutorial",
    name: "Tutorial Cove",
    region: "A teaching map, not a real place",
    blurb:
      "Every Goan river mouth has this shape: open sea, a bar of sand, a brackish estuary where the fresh water meets the salt, and the river behind it. This is that shape with the noise taken out, so you can see all of it at once.",
    // No `geo` block: this map is not georeferenced, and claiming otherwise
    // in the data would be a lie a future reader would have to disprove.
    focus: coordAt(4, 3),
    landmarks,
    tiles
  };

  const outPath = path.resolve(process.cwd(), "src/data/maps/tutorial.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`);

  console.log(`=== ${file.name} ===`);
  console.log(`${tiles.length} tiles (${colCount} x ${rowCount})`);
  console.log(
    ["coast", "beach", "land", "river", "estuary"].map((id) => `${id} ${counts.get(id) ?? 0}`).join("   ")
  );
  for (const [index, row] of rows.entries()) console.log(" ".repeat(index) + row.join(" "));
  console.log(`\nWrote ${path.relative(process.cwd(), outPath)}`);
}

main();
