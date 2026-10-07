import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, taperedSlab, coneFrustum, dome, blade, plan, rotate, move } from "./primitives3d";

/**
 * The sixteen real Panjim landmarks, as buildings.
 *
 * WHAT THESE ARE FOR
 *
 * The reference map marks its historical locations with a gold star on a tile.
 * A star says "something is here" and nothing else — a player learns no more
 * about Panjim from it than from a blank hex. These replace the stars with the
 * buildings themselves, so the board reads as a specific city rather than as a
 * coastline with notes attached. That is most of what makes this map worth
 * playing on rather than any other 897 hexes.
 *
 * HOW CLOSE TO THE REAL THING
 *
 * Close enough to be recognised, which at this scale means getting the
 * silhouette and the one or two features everybody actually pictures. The
 * Church of the Immaculate Conception is its zigzag staircase and its twin
 * towers. Idalcao Palace is a long arcaded verandah under a red tiled roof.
 * Dona Paula is two figures on a headland. Beyond that, a prop about three
 * quarters of a hex across has no room for detail that is not silhouette, and
 * trying anyway produces mush.
 *
 * Seven of the sixteen share the `institution` building — the colleges, the
 * museum, the Institute Menezes Braganza and the Kala Academy. That is honest
 * rather than lazy: they genuinely are mid-century civic blocks of a similar
 * kind, and giving each a distinct invented silhouette would be making things
 * up about real buildings.
 *
 * SCALE
 *
 * Deliberately larger than the buildable elements — up to about 1.3 units
 * tall against a House's 0.6. A landmark that does not stand out from the
 * houses around it is not doing its job. Everything stays inside roughly 0.78
 * of the hex centre, since the hex inradius is about 0.87 and anything beyond
 * that visually belongs to the neighbour.
 */

/**
 * Warm whitewash, the dominant colour of Panjim's civic and religious
 * architecture.
 *
 * Pushed brighter and warmer than the obvious off-white after a look at the
 * first render, where the church came out a flat mid-grey. The scene lights
 * with one warm sun plus a HemisphereLight whose sky colour is the game's
 * cool blue — so a desaturated near-white picks up that blue on every face the
 * sun is not hitting square on, and reads as stone rather than as limewash.
 * Starting warmer cancels it.
 */
const WHITEWASH = "#fffaec";
const SHADOW_WASH = "#f0e4c8";
const TERRACOTTA = "#b5502e";
const TERRACOTTA_DARK = "#8a3a1f";
const LATERITE = "#9c5a37";
const STONE = "#cdc6b4";
const GOLD = "#d8b158";
const TEAL = "#2f6b5e";
const FOLIAGE_DARK = "#3f7f3a";
const FOLIAGE_LIGHT = "#5aa04c";

/** A small palm, reused by the beach and park monuments. */
function palm(x: number, z: number, height: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = coneFrustum(0.016, 0.028, height, 6, "#8d6b45", 0);
  rotate(trunk, 0.09, 0, 0.1);
  move(trunk, x, 0, z);
  parts.push(trunk);
  for (let i = 0; i < 6; i++) {
    const frond = blade(
      [
        [-0.022, 0],
        [0.022, 0],
        [0.01, 0.24],
        [-0.01, 0.24]
      ],
      i % 2 === 0 ? FOLIAGE_DARK : FOLIAGE_LIGHT,
      0.014
    );
    rotate(frond, -0.95, 0, 0);
    rotate(frond, 0, (i / 6) * Math.PI * 2, 0);
    move(frond, x + 0.025, height - 0.01, z);
    parts.push(frond);
  }
  return parts;
}

/** A rounded shade tree. */
function tree(x: number, z: number, height: number): THREE.BufferGeometry[] {
  const trunk = coneFrustum(0.018, 0.028, height * 0.45, 5, "#6b4a2f", 0);
  move(trunk, x, 0, z);
  const canopyLow = dome(0.14, 0.11, 0.14, FOLIAGE_DARK, height * 0.4);
  move(canopyLow, x, 0, z);
  const canopyHigh = dome(0.1, 0.09, 0.1, FOLIAGE_LIGHT, height * 0.58);
  move(canopyHigh, x + 0.02, 0, z - 0.02);
  return [trunk, canopyLow, canopyHigh];
}

/**
 * Church of Our Lady of the Immaculate Conception.
 *
 * The two things everyone pictures: the criss-cross zigzag staircase climbing
 * the front, and the twin bell towers either side of a tall central bay. Both
 * are here; the rest is a plain white box, which is also true of the building.
 */
function churchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const NAVE_H = 0.5;
  const nave = box(0.56, NAVE_H, 0.46, WHITEWASH, 0);
  move(nave, 0, 0, -0.1);
  const naveRoof = taperedSlab(0.6, 0.06, 0.16, 0.5, TERRACOTTA, NAVE_H);
  move(naveRoof, 0, 0, -0.1);
  parts.push(nave, naveRoof);

  // The central bay, taller than the nave, carrying the pediment and bell.
  const bay = box(0.3, 0.74, 0.16, WHITEWASH, 0);
  move(bay, 0, 0, 0.14);
  const pediment = taperedSlab(0.32, 0.04, 0.14, 0.18, WHITEWASH, 0.74);
  move(pediment, 0, 0, 0.14);
  const bell = coneFrustum(0.035, 0.05, 0.07, 6, GOLD, 0.76);
  move(bell, 0, 0, 0.14);
  const crossPost = box(0.022, 0.13, 0.022, WHITEWASH, 0.88);
  move(crossPost, 0, 0, 0.14);
  const crossArm = box(0.085, 0.022, 0.022, WHITEWASH, 0.955);
  move(crossArm, 0, 0, 0.14);
  parts.push(bay, pediment, bell, crossPost, crossArm);

  // Twin bell towers.
  for (const x of [-0.24, 0.24]) {
    const tower = box(0.17, 0.66, 0.17, WHITEWASH, 0);
    move(tower, x, 0, 0.1);
    const belfry = box(0.14, 0.12, 0.14, SHADOW_WASH, 0.66);
    move(belfry, x, 0, 0.1);
    const cap = coneFrustum(0.012, 0.11, 0.14, 4, TERRACOTTA_DARK, 0.78);
    move(cap, x, 0, 0.1);
    parts.push(tower, belfry, cap);
  }

  // The zigzag staircase: four landings stepping down and alternating side to
  // side. This is the single most recognisable thing about the building, so it
  // gets more geometry than its size would otherwise justify.
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const y = 0.015 + i * 0.055;
    const width = 0.46 - i * 0.07;
    const landing = box(width, 0.035, 0.07, SHADOW_WASH, y);
    move(landing, 0, 0, 0.42 - i * 0.055);
    parts.push(landing);
    // The balustrades that make it read as a staircase rather than as steps.
    for (const side of [-1, 1]) {
      const rail = box(0.022, 0.05, 0.07, WHITEWASH, y + 0.035);
      move(rail, (side * width) / 2, 0, 0.42 - i * 0.055);
      parts.push(rail);
    }
  }

  return mergeGeometries(parts);
}

/**
 * Mahalaxmi Temple — a Goan Hindu temple.
 *
 * The regional form rather than a north-Indian one: a pitched-roof mandap
 * hall, an octagonal drum carrying a dome over the sanctum, and a free-standing
 * deepstambha (lamp tower) in front, which is the detail that makes a Goan
 * temple unmistakable.
 */
function templeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const HALL_H = 0.3;
  const hall = box(0.48, HALL_H, 0.42, "#f2e7cf", 0);
  move(hall, -0.04, 0, 0.08);
  const hallRoof = taperedSlab(0.56, 0.08, 0.16, 0.48, TERRACOTTA, HALL_H);
  move(hallRoof, -0.04, 0, 0.08);
  parts.push(hall, hallRoof);

  // Sanctum: square base, octagonal drum, dome, finial.
  const sanctum = box(0.3, 0.36, 0.3, "#f2e7cf", 0);
  move(sanctum, -0.04, 0, -0.26);
  const drum = coneFrustum(0.14, 0.17, 0.16, 8, "#e7d9ba", 0.36);
  move(drum, -0.04, 0, -0.26);
  const cupola = dome(0.14, 0.13, 0.14, TERRACOTTA, 0.52);
  move(cupola, -0.04, 0, -0.26);
  const finial = coneFrustum(0.006, 0.03, 0.12, 6, GOLD, 0.64);
  move(finial, -0.04, 0, -0.26);
  parts.push(sanctum, drum, cupola, finial);

  // Deepstambha — the tiered oil-lamp tower.
  const lampBase = coneFrustum(0.055, 0.075, 0.1, 8, STONE, 0);
  move(lampBase, 0.3, 0, 0.3);
  const lampShaft = coneFrustum(0.028, 0.045, 0.42, 8, "#cfc7b4", 0.1);
  move(lampShaft, 0.3, 0, 0.3);
  parts.push(lampBase, lampShaft);
  for (const y of [0.22, 0.34, 0.46]) {
    const tier = coneFrustum(0.05, 0.075, 0.03, 8, "#b9ad93", y);
    move(tier, 0.3, 0, 0.3);
    parts.push(tier);
  }
  const lampTop = dome(0.05, 0.05, 0.05, GOLD, 0.52);
  move(lampTop, 0.3, 0, 0.3);
  parts.push(lampTop);

  return mergeGeometries(parts);
}

/** Jama Masjid, Panaji: a prayer hall under a central dome, flanked by two minarets. */
function mosqueGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const HALL_H = 0.38;
  const hall = box(0.54, HALL_H, 0.42, WHITEWASH, 0);
  const parapet = box(0.58, 0.05, 0.46, "#e4dcc6", HALL_H);
  parts.push(hall, parapet);

  // Central dome on a drum.
  const drum = coneFrustum(0.15, 0.17, 0.08, 8, "#e4dcc6", HALL_H + 0.05);
  const domeTop = dome(0.17, 0.17, 0.17, TEAL, HALL_H + 0.13);
  const finial = coneFrustum(0.005, 0.022, 0.1, 6, GOLD, HALL_H + 0.3);
  parts.push(drum, domeTop, finial);

  // Minarets.
  for (const x of [-0.3, 0.3]) {
    const shaft = coneFrustum(0.035, 0.045, 0.62, 8, WHITEWASH, 0);
    move(shaft, x, 0, 0.04);
    const gallery = coneFrustum(0.055, 0.055, 0.03, 8, "#d8cfb6", 0.62);
    move(gallery, x, 0, 0.04);
    const cap = dome(0.045, 0.06, 0.045, TEAL, 0.65);
    move(cap, x, 0, 0.04);
    parts.push(shaft, gallery, cap);
  }

  // Arched entrance, suggested by a recessed dark panel under a lighter arch.
  const archway = box(0.14, 0.2, 0.02, TEAL, 0.02);
  move(archway, 0, 0, 0.215);
  const archTop = dome(0.07, 0.06, 0.02, "#e4dcc6", 0.22);
  move(archTop, 0, 0, 0.215);
  parts.push(archway, archTop);

  return mergeGeometries(parts);
}

/** Panjim Municipal Market: a long open shed, wide pitched roof on columns, produce stacked underneath. */
function marketGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const ROOF_Y = 0.34;
  // Open sides are the point — a market is a roof on legs, not a building.
  for (const x of [-0.3, -0.1, 0.1, 0.3]) {
    for (const z of [-0.16, 0.16]) {
      const column = coneFrustum(0.018, 0.024, ROOF_Y, 5, "#cfc7b4", 0);
      move(column, x, 0, z);
      parts.push(column);
    }
  }

  const roof = taperedSlab(0.78, 0.1, 0.16, 0.5, TERRACOTTA, ROOF_Y);
  const ridge = box(0.1, 0.035, 0.52, TERRACOTTA_DARK, ROOF_Y + 0.15);
  const eaveFront = box(0.8, 0.028, 0.03, TERRACOTTA_DARK, ROOF_Y);
  move(eaveFront, 0, 0, 0.25);
  parts.push(roof, ridge, eaveFront);

  // Stalls and produce — the colour that says market rather than bus shelter.
  const stallColours = ["#c7503a", "#4f8f3a", "#d8b158", "#7a9f3a"];
  for (let i = 0; i < 6; i++) {
    const x = -0.3 + i * 0.12;
    const crate = box(0.09, 0.07, 0.12, "#8d6b45", 0);
    move(crate, x, 0, i % 2 === 0 ? -0.05 : 0.08);
    const produce = dome(0.045, 0.035, 0.055, stallColours[i % stallColours.length], 0.07);
    move(produce, x, 0, i % 2 === 0 ? -0.05 : 0.08);
    parts.push(crate, produce);
  }

  return mergeGeometries(parts);
}

/**
 * Idalcao Palace / the Old Secretariat.
 *
 * Goa's former seat of government and one of its oldest surviving buildings: a
 * long low two-storey block, white, with a continuous arcaded verandah on the
 * upper floor under a deep red tiled roof. The arcade is the whole silhouette.
 */
function palaceGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const GROUND_H = 0.26;
  const UPPER_H = 0.24;
  const ground = box(0.74, GROUND_H, 0.4, WHITEWASH, 0);
  const band = box(0.76, 0.03, 0.42, "#e0d5ba", GROUND_H);
  const upper = box(0.7, UPPER_H, 0.36, WHITEWASH, GROUND_H + 0.03);
  parts.push(ground, band, upper);

  // The verandah: a floor slab projecting forward, a row of slim columns, and
  // a balustrade between them.
  const deck = box(0.76, 0.03, 0.1, "#e0d5ba", GROUND_H);
  move(deck, 0, 0, 0.24);
  parts.push(deck);
  for (let i = 0; i < 7; i++) {
    const x = -0.3 + i * 0.1;
    const column = coneFrustum(0.014, 0.018, UPPER_H, 5, WHITEWASH, GROUND_H + 0.03);
    move(column, x, 0, 0.25);
    parts.push(column);
  }
  const rail = box(0.74, 0.055, 0.02, "#d2c7ab", GROUND_H + 0.03);
  move(rail, 0, 0, 0.26);
  parts.push(rail);

  // Deep hipped tile roof with a generous overhang.
  const roof = taperedSlab(0.84, 0.16, 0.14, 0.5, TERRACOTTA, GROUND_H + 0.03 + UPPER_H);
  const ridge = box(0.2, 0.035, 0.52, TERRACOTTA_DARK, GROUND_H + 0.03 + UPPER_H + 0.13);
  parts.push(roof, ridge);

  // Ground-floor arcade, as recessed dark openings.
  for (let i = 0; i < 5; i++) {
    const opening = box(0.08, 0.16, 0.02, "#5a4a36", 0.03);
    move(opening, -0.24 + i * 0.12, 0, 0.195);
    parts.push(opening);
  }

  return mergeGeometries(parts);
}

/**
 * A mid-century civic block, used for the colleges, the museum, the Institute
 * Menezes Braganza and the Kala Academy.
 *
 * One shared building for seven landmarks. See this file's header: these
 * genuinely are buildings of the same kind, and inventing six distinct
 * silhouettes would be making things up about real places.
 */
function institutionGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const BLOCK_H = 0.52;
  const block = box(0.66, BLOCK_H, 0.4, "#f2eee0", 0);
  const parapet = box(0.7, 0.06, 0.44, "#ddd5be", BLOCK_H);
  const trim = box(0.72, 0.016, 0.46, STONE, BLOCK_H + 0.06);
  parts.push(block, parapet, trim);

  // Window bands rather than individual windows — at this size a grid of dots
  // reads as noise, and a horizontal band reads as "offices".
  for (const y of [BLOCK_H * 0.3, BLOCK_H * 0.68]) {
    const band = box(0.56, 0.1, 0.02, TEAL, y);
    move(band, 0, 0, 0.2);
    parts.push(band);
  }

  // Portico: four columns under a flat canopy, with steps up to it.
  const canopy = box(0.38, 0.04, 0.16, "#e6e0cd", 0.3);
  move(canopy, 0, 0, 0.26);
  parts.push(canopy);
  for (const x of [-0.15, -0.05, 0.05, 0.15]) {
    const column = coneFrustum(0.016, 0.02, 0.3, 6, WHITEWASH, 0);
    move(column, x, 0, 0.3);
    parts.push(column);
  }
  const steps = box(0.34, 0.03, 0.08, "#ded6c0", 0);
  move(steps, 0, 0, 0.36);
  const doors = box(0.14, 0.18, 0.02, "#5a4a36", 0.03);
  move(doors, 0, 0, 0.195);
  parts.push(steps, doors);

  const flagPole = coneFrustum(0.006, 0.008, 0.2, 4, STONE, BLOCK_H + 0.076);
  move(flagPole, -0.26, 0, -0.1);
  const flag = blade(
    [
      [0, 0],
      [0.1, -0.025],
      [0, -0.05]
    ],
    "#c7503a",
    0.012
  );
  move(flag, -0.255, BLOCK_H + 0.24, -0.1);
  parts.push(flagPole, flag);

  return mergeGeometries(parts);
}

/** Campal Garden / Azad Maidan: the domed memorial pavilion on its colonnade, with trees around it. */
function parkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const plinth = coneFrustum(0.28, 0.32, 0.06, 8, "#ddd5be", 0);
  const plinthTop = coneFrustum(0.25, 0.28, 0.04, 8, "#e9e3d2", 0.06);
  parts.push(plinth, plinthTop);

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const column = coneFrustum(0.02, 0.026, 0.32, 6, WHITEWASH, 0.1);
    move(column, Math.cos(angle) * 0.19, 0, Math.sin(angle) * 0.19);
    parts.push(column);
  }

  const entablature = coneFrustum(0.24, 0.24, 0.05, 8, "#e9e3d2", 0.42);
  const pavilionDome = dome(0.22, 0.16, 0.22, "#9fb0a8", 0.47);
  const finial = coneFrustum(0.006, 0.026, 0.1, 6, GOLD, 0.63);
  parts.push(entablature, pavilionDome, finial);

  parts.push(...tree(-0.5, 0.22, 0.34), ...tree(0.48, -0.26, 0.3), ...tree(0.3, 0.44, 0.26));

  // A low hedge line, which is what reads as "garden" from above.
  for (const [x, z] of [
    [-0.2, 0.52],
    [0, 0.56],
    [0.2, 0.52]
  ] as [number, number][]) {
    const hedge = box(0.18, 0.06, 0.08, FOLIAGE_DARK, 0);
    move(hedge, x, 0, z);
    parts.push(hedge);
  }

  return mergeGeometries(parts);
}

/** Miramar Beach: a lifeguard tower, palms and a parasol — the things actually on the sand. */
function beachGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Lifeguard tower on splayed legs.
  for (const [x, z] of [
    [-0.1, -0.1],
    [0.1, -0.1],
    [-0.1, 0.1],
    [0.1, 0.1]
  ] as [number, number][]) {
    const leg = coneFrustum(0.014, 0.02, 0.3, 5, "#8d6b45", 0);
    rotate(leg, z * 0.35, 0, -x * 0.35);
    move(leg, x, 0, z);
    parts.push(leg);
  }
  const cabin = box(0.26, 0.18, 0.24, "#e8e2d0", 0.3);
  const cabinWindow = box(0.2, 0.08, 0.02, "#3b6f7a", 0.36);
  move(cabinWindow, 0, 0, 0.12);
  const cabinRoof = taperedSlab(0.32, 0.06, 0.08, 0.3, "#c7503a", 0.48);
  const mast = coneFrustum(0.006, 0.008, 0.16, 4, "#cfc7b4", 0.56);
  const flag = blade(
    [
      [0, 0],
      [0.09, -0.022],
      [0, -0.045]
    ],
    "#c7503a",
    0.012
  );
  move(flag, 0.005, 0.69, 0);
  parts.push(cabin, cabinWindow, cabinRoof, mast, flag);

  parts.push(...palm(-0.42, 0.26, 0.46), ...palm(0.44, 0.3, 0.38));

  const parasolPole = coneFrustum(0.006, 0.008, 0.14, 4, "#8d6b45", 0);
  move(parasolPole, 0.34, 0, -0.3);
  const parasol = coneFrustum(0.001, 0.13, 0.06, 8, "#d8b158", 0.14);
  move(parasol, 0.34, 0, -0.3);
  parts.push(parasolPole, parasol);

  return mergeGeometries(parts);
}

/**
 * Dona Paula.
 *
 * The headland with its jetty and the two-figure sculpture that stands on it.
 * The figures are deliberately abstract — a pair of standing forms on a
 * pedestal, not an attempt at portraiture, which at this size would read as
 * two smudges and would be a worse likeness than an honest abstraction.
 */
function viewpointGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Rocky promontory.
  const headland = plan(
    [
      [-0.4, -0.2],
      [-0.1, -0.36],
      [0.3, -0.26],
      [0.42, 0.06],
      [0.2, 0.34],
      [-0.2, 0.3],
      [-0.42, 0.08]
    ],
    0.1,
    LATERITE,
    0
  );
  const headlandTop = plan(
    [
      [-0.34, -0.16],
      [-0.08, -0.3],
      [0.26, -0.22],
      [0.36, 0.05],
      [0.17, 0.28],
      [-0.17, 0.25],
      [-0.36, 0.07]
    ],
    0.03,
    "#b08055",
    0.1
  );
  parts.push(headland, headlandTop);

  // Pedestal and the two figures.
  const pedestal = box(0.2, 0.14, 0.16, "#cfc7b4", 0.13);
  move(pedestal, -0.02, 0, -0.02);
  parts.push(pedestal);
  for (const [x, height] of [
    [-0.05, 0.3],
    [0.04, 0.26]
  ] as [number, number][]) {
    const body = coneFrustum(0.028, 0.045, height, 6, "#e4ded0", 0.27);
    move(body, x, 0, -0.02);
    const head = dome(0.034, 0.034, 0.034, "#e4ded0", 0.27 + height);
    move(head, x, 0, -0.02);
    parts.push(body, head);
  }

  // Railing along the seaward edge, which is what says "viewpoint".
  for (let i = 0; i < 5; i++) {
    const x = -0.28 + i * 0.14;
    const post = coneFrustum(0.008, 0.01, 0.1, 4, "#cfc7b4", 0.13);
    move(post, x, 0, 0.26);
    parts.push(post);
  }
  const rail = box(0.6, 0.016, 0.016, "#cfc7b4", 0.21);
  move(rail, 0, 0, 0.26);
  parts.push(rail);

  return mergeGeometries(parts);
}

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  church: churchGeometry,
  temple: templeGeometry,
  mosque: mosqueGeometry,
  market: marketGeometry,
  palace: palaceGeometry,
  institution: institutionGeometry,
  park: parkGeometry,
  beach: beachGeometry,
  viewpoint: viewpointGeometry
};

/** Every monument kind the renderer knows how to draw. The map generator's `kind` values must be a subset. */
export const MONUMENT_KINDS: readonly string[] = Object.keys(BUILDERS);

/**
 * Builds one monument.
 *
 * Falls back to the civic block for an unknown kind rather than throwing. A
 * map naming a building this file has not been taught is a data error worth
 * noticing, but not one worth a blank screen over — and `tests/monuments.test.ts`
 * fails on it, which is where it should be caught.
 */
export function createMonumentGeometry(kind: string): THREE.BufferGeometry {
  const builder = BUILDERS[kind];
  if (!builder) {
    console.warn(`[monuments] no geometry for kind "${kind}"; drawing a civic block instead`);
    return institutionGeometry();
  }
  return builder();
}
