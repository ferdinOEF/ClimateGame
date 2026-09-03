import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, taperedSlab, coneFrustum, dome, blade, plan, rotate, move, scale } from "./primitives3d";

/**
 * Element-icon redesign pass (see PROGRESS.md): every element rebuilt from
 * real low-poly 3D primitives with per-vertex color (see `primitives3d.ts`)
 * instead of the earlier generation's thin flat-cutout icons — matching the
 * same construction language the hex-prism terrain already uses. Colors
 * below are the vertex-color targets from that pass's design review,
 * lightly adjusted where needed to sit against the corrected (more
 * saturated) terrain palette from the readability pass.
 */

/** Dune: two overlapping low ridge arcs (back taller/set back, front lower/forward), plus angled grass tufts on the crest. */
function duneGeometry(): THREE.BufferGeometry {
  const backRidge = dome(0.42, 0.22, 0.22, "#c9932e", 0);
  move(backRidge, 0, 0, -0.14);
  const frontRidge = dome(0.4, 0.16, 0.2, "#b5842a", 0);
  move(frontRidge, 0.03, 0, 0.13);

  const tuft = (x: number, angle: number) => {
    const g = blade(
      [
        [-0.02, 0],
        [0.02, 0],
        [0.01, 0.22],
        [-0.01, 0.22]
      ],
      "#4b5a34"
    );
    rotate(g, 0, 0, angle);
    move(g, x, 0.16, 0.1);
    return g;
  };

  return mergeGeometries([backRidge, frontRidge, tuft(-0.08, 0.25), tuft(0.02, -0.1), tuft(0.12, 0.3)]);
}

/** Seawall: a tapered concrete block wall with a lighter cap slab and coursed groove lines. */
function seawallGeometry(): THREE.BufferGeometry {
  const wall = taperedSlab(0.86, 0.64, 0.42, 0.26, "#8a8f91", 0);
  const cap = box(0.7, 0.08, 0.3, "#b7bbbc", 0.42);
  const groove = (y: number, w: number) => box(w, 0.025, 0.02, "#6f7476", y);
  return mergeGeometries([
    wall,
    cap,
    move(groove(0.14, 0.78), 0, 0, 0.135),
    move(groove(0.28, 0.72), 0, 0, 0.135)
  ]);
}

/**
 * Breakwater (STEP_PROMPT_icon_legibility_pass.md item 1): a jagged
 * two-row rubble mound, deliberately with NO continuous top edge —
 * earlier version had a `crest` bar spanning all rocks, which at this
 * game's fairly steep top-down camera made it collapse toward Seawall's
 * own "wall + cap slab" silhouette. Front row carries the main
 * silhouette; a smaller staggered back row peeks up through the front
 * row's gaps so the skyline zigzags instead of reading as a flat course.
 * Each rock gets small non-zero rotation on all three axes (not just Y,
 * as before) so an axis-aligned box reads as a tumbled boulder rather
 * than a placed block.
 */
function breakwaterGeometry(): THREE.BufferGeometry {
  const rockColors = ["#7d7568", "#8f8676", "#6d6558", "#847a68", "#a89878"];
  // x, z, w, d, h, colorIndex, [rx, ry, rz]
  const rocks: { x: number; z: number; w: number; d: number; h: number; c: number; r: [number, number, number] }[] = [
    { x: -0.34, z: 0.12, w: 0.24, d: 0.24, h: 0.1, c: 0, r: [0.08, -0.25, -0.06] },
    { x: -0.1, z: 0.16, w: 0.26, d: 0.26, h: 0.2, c: 1, r: [-0.06, 0.15, 0.1] },
    { x: 0.14, z: 0.1, w: 0.22, d: 0.24, h: 0.14, c: 2, r: [0.1, -0.12, -0.08] },
    { x: 0.36, z: 0.14, w: 0.2, d: 0.22, h: 0.22, c: 3, r: [-0.09, 0.22, 0.07] },
    { x: -0.22, z: -0.12, w: 0.2, d: 0.2, h: 0.16, c: 4, r: [0.07, -0.18, 0.09] },
    { x: 0.02, z: -0.12, w: 0.22, d: 0.2, h: 0.24, c: 0, r: [-0.1, 0.1, -0.07] },
    { x: 0.26, z: -0.12, w: 0.18, d: 0.2, h: 0.12, c: 2, r: [0.06, -0.2, 0.08] }
  ];
  const parts = rocks.map(({ x, z, w, d, h, c, r }) => {
    const rock = box(w, h, d, rockColors[c], 0);
    rotate(rock, r[0], r[1], r[2]);
    move(rock, x, 0, z);
    return rock;
  });
  return mergeGeometries(parts);
}

/** A single Pandanus plant: a tapered trunk topped by an 8-blade spiky rosette, braced by two prop-root struts. */
function pandanusClump(): THREE.BufferGeometry {
  const trunk = coneFrustum(0.05, 0.09, 0.5, 6, "#7c6a4f", 0);

  const parts: THREE.BufferGeometry[] = [trunk];
  const bladeCount = 8;
  for (let i = 0; i < bladeCount; i++) {
    const yaw = (i / bladeCount) * Math.PI * 2;
    const tone = i % 2 === 0 ? "#3f6b3a" : "#6fa24a";
    const g = blade(
      [
        [-0.035, 0],
        [0.035, 0],
        [0.015, 0.4],
        [-0.015, 0.4]
      ],
      tone,
      0.03
    );
    rotate(g, -0.55, 0, 0); // droop outward/downward like a real pandanus leaf
    rotate(g, 0, yaw, 0);
    move(g, 0, 0.5, 0);
    parts.push(g);
  }

  const strut = (side: number) => {
    const g = blade(
      [
        [-0.02, 0],
        [0.02, 0],
        [0.015, 0.32],
        [-0.015, 0.32]
      ],
      "#7c6a4f",
      0.03
    );
    rotate(g, 0, 0, side * 0.6);
    move(g, side * 0.03, 0.2, 0);
    return g;
  };
  parts.push(strut(-1), strut(1));

  return mergeGeometries(parts);
}

/**
 * Sandy Vegetation (Pandanus): STEP_PROMPT_map_reshape_veg_icons.md item 3
 * — a single plant read as sparse ground cover at normal zoom, not a
 * barrier. Now a fused 3-plant stand: one full-size center plant plus two
 * ~65%-scale flanking plants, staggered along Z (perpendicular to the
 * wave's east-travelling path) so their rosettes overlap into one
 * continuous mass on the wave-facing side, instead of reading as three
 * separated dots. Geometry-only — no effects/buildCost/data fields touched.
 */
function sandyVegetationGeometry(): THREE.BufferGeometry {
  const center = pandanusClump();
  const left = scale(pandanusClump(), 0.65);
  move(left, -0.08, 0, -0.28);
  const right = scale(pandanusClump(), 0.65);
  move(right, 0.06, 0, 0.3);
  return mergeGeometries([center, left, right]);
}

/** Beachside Resort: a tall whitewashed block, flat parapet roofline, 3x3 window grid, ground-floor awning + door, rooftop pennant, plus a pool. */
function beachsideResortGeometry(): THREE.BufferGeometry {
  // Deliberately much taller than House's 0.32 wall (+ ~0.26 roof peak,
  // ~0.58 total) — a live side-by-side check found the flat-roof/window-
  // grid cues alone read as different in KIND but not obviously bigger;
  // this needs to be unmistakable at a glance, per this pass's own
  // explicit verification note, not just "technically taller."
  const BLOCK_H = 0.95;
  const block = box(0.58, BLOCK_H, 0.42, "#f2ede0", 0);
  const parapet = box(0.64, 0.08, 0.46, "#a9791f", BLOCK_H);
  const parapetTrim = box(0.66, 0.02, 0.48, "#d8b158", BLOCK_H + 0.08);

  const parts: THREE.BufferGeometry[] = [block, parapet, parapetTrim];

  // 3x3 window grid, skipping bottom-center for the entrance below it —
  // spread across the block's full height (proportional to BLOCK_H, not
  // a fixed offset) so the taller block reads as multi-storey rather than
  // one row of windows floating in a tall blank wall.
  const cols = [-0.18, 0, 0.18];
  const rows = [BLOCK_H * 0.17, BLOCK_H * 0.5, BLOCK_H * 0.83];
  for (const y of rows) {
    for (const x of cols) {
      if (y === rows[0] && x === 0) continue; // entrance position
      const win = box(0.11, 0.13, 0.02, "#1f6e66", y);
      move(win, x, 0, 0.215);
      const sill = box(0.11, 0.02, 0.02, "#3c9c8e", y + 0.13);
      move(sill, x, 0, 0.215);
      parts.push(win, sill);
    }
  }

  const awning = box(0.4, 0.04, 0.1, "#b5502e", 0.14);
  move(awning, 0, 0, 0.26);
  const door = box(0.12, 0.14, 0.02, "#8a3a1f", 0);
  move(door, 0, 0, 0.215);
  parts.push(awning, door);

  const pennantPole = coneFrustum(0.008, 0.012, 0.16, 5, "#8a8f91", BLOCK_H + 0.08);
  const pennantFlag = blade(
    [
      [0, 0],
      [0.12, -0.03],
      [0, -0.06]
    ],
    "#d8b158",
    0.015
  );
  move(pennantFlag, 0.008, BLOCK_H + 0.2, 0);
  parts.push(pennantPole, pennantFlag);

  const pool = box(0.32, 0.02, 0.4, "#4a90a4", 0);
  move(pool, 0.55, 0, -0.05);
  const poolHighlight = box(0.32, 0.022, 0.08, "#8fc0c2", 0);
  move(poolHighlight, 0.55, 0, -0.22);
  parts.push(pool, poolHighlight);

  return mergeGeometries(parts);
}

/** A single Mangrove tree: four angled stilt roots converging upward into a two-tone rounded canopy. */
function mangroveClump(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rootAngles = [-0.55, -0.2, 0.2, 0.55];
  for (const angle of rootAngles) {
    const root = coneFrustum(0.02, 0.045, 0.32, 5, "#5a4632", 0);
    rotate(root, 0, 0, angle);
    move(root, Math.sin(angle) * 0.05, 0, 0);
    parts.push(root);
  }
  const canopyBase = dome(0.32, 0.24, 0.3, "#1f6e66", 0.28);
  const canopyHighlight = dome(0.2, 0.16, 0.2, "#3c9c8e", 0.4);
  move(canopyHighlight, 0.08, 0, -0.04);
  parts.push(canopyBase, canopyHighlight);
  return mergeGeometries(parts);
}

/**
 * Mangrove: STEP_PROMPT_map_reshape_veg_icons.md item 3 — same fused-stand
 * treatment as Sandy Vegetation: one full-size center tree plus two
 * smaller (70%-scale) flanking trees, staggered along Z so their canopies
 * overlap into one continuous mass on the wave-facing side. Geometry-only
 * — no effects/buildCost/data fields touched.
 */
function mangroveGeometry(): THREE.BufferGeometry {
  const center = mangroveClump();
  const left = scale(mangroveClump(), 0.7);
  move(left, -0.1, 0, -0.24);
  const right = scale(mangroveClump(), 0.7);
  move(right, 0.08, 0, 0.26);
  return mergeGeometries([center, left, right]);
}

/**
 * Khazan (STEP_PROMPT_icon_legibility_pass.md item 3): a low earthen bund
 * enclosing a split interior — water on one side, paddy rows on the
 * other — with a slatted sluice gate at the front-center. The bund's
 * genuinely distinctive shape (a full ring, unlike anything else in the
 * roster) was getting hidden by its own front wall: at this game's fixed
 * camera angle, a same-height front bund plus an even-taller gate sitting
 * just outside it were both opaque and roughly wall-height, blocking the
 * one sightline into the water/paddy split that's the whole point.
 * `frontBund` (nearest camera) and `gate` are both lowered here —
 * `backBund`/`sideBund` stay full height, so the ring still reads as a
 * raised border from every side except the one the camera would
 * otherwise see straight through as a wall. This is a deliberate
 * legibility cheat (a real bund is uniform height) — flagged, not hidden.
 */
function khazanGeometry(): THREE.BufferGeometry {
  const bundColor = "#a9793f";
  const parts: THREE.BufferGeometry[] = [];

  const frontBund = taperedSlab(0.9, 0.7, 0.06, 0.1, bundColor, 0);
  move(frontBund, 0, 0, 0.4);
  const backBund = taperedSlab(0.9, 0.7, 0.16, 0.1, bundColor, 0);
  move(backBund, 0, 0, -0.4);
  const sideBund = (x: number) => {
    const g = taperedSlab(0.8, 0.6, 0.16, 0.1, bundColor, 0);
    rotate(g, 0, Math.PI / 2, 0);
    move(g, x, 0, 0);
    return g;
  };
  parts.push(frontBund, backBund, sideBund(-0.4), sideBund(0.4));

  // Small lip above the tile surface — reads as contained water/planted
  // bed rather than flush paint on the ground, and gives both a sliver of
  // visible side-face now that the front bund no longer hides them.
  //
  // Verified-in-render correction to the original STEP_PROMPT: the
  // water/paddy split is the one thing that's supposed to make Khazan
  // identifiable, and it was invisible in a fresh screenshot even after
  // the front-bund fix above — `ElementMeshManager` multiplies every
  // vertex color here against this element's flat `defenseKhazanBund`
  // instance tint (`#8C6A3F`, a warm brown with very little blue), which
  // crushed the water's blue-teal (`#4a90a4`) down to a dark, near-
  // indistinguishable green — almost the same result as the paddy rows'
  // green. Literal blue isn't achievable under this tint; what still
  // works is a genuine hue split either side of it — water pushed
  // cool/cyan, paddy pushed warm/yellow-green — confirmed against a
  // fresh render, not assumed. See the same finding on Sand Mining below.
  const water = box(0.62, 0.03, 0.7, "#5fe8e0", 0.015);
  move(water, -0.17, 0, 0);
  parts.push(water);

  for (let i = 0; i < 3; i++) {
    const tone = i % 2 === 0 ? "#8fc25a" : "#a0d060";
    const row = box(0.28, 0.035, 0.14, tone, 0.015);
    move(row, 0.24, 0, -0.2 + i * 0.2);
    parts.push(row);
  }

  const gate = box(0.16, 0.16, 0.06, "#8a8f91", 0);
  move(gate, 0, 0, 0.42);
  parts.push(gate);
  for (let i = 0; i < 3; i++) {
    const slat = box(0.02, 0.13, 0.01, "#6f7476", 0.02);
    move(slat, -0.05 + i * 0.05, 0, 0.455);
    parts.push(slat);
  }

  return mergeGeometries(parts);
}

/** Small Dam: a river-scaled tapered wall with ridge grooves, a blue spillway notch at the crest, and two corner buttresses. */
function smallDamGeometry(): THREE.BufferGeometry {
  const wall = taperedSlab(0.9, 0.68, 0.36, 0.24, "#8a8f91", 0);
  const ridgeCap = box(0.66, 0.03, 0.26, "#b7bbbc", 0.34);
  const spillway = box(0.22, 0.1, 0.26, "#4a90a4", 0.26);

  const buttress = (side: number) => {
    const g = taperedSlab(0.16, 0.04, 0.2, 0.14, "#8a8f91", 0);
    rotate(g, 0, Math.PI / 2, 0);
    move(g, side * 0.42, 0, 0);
    return g;
  };

  return mergeGeometries([wall, ridgeCap, spillway, buttress(-1), buttress(1)]);
}

/**
 * Sand Mining (STEP_PROMPT_icon_legibility_pass.md item 2): a stepped
 * terraced mound plus a dredge arm-and-scoop. Two changes from the
 * earlier version: tier colors are pushed apart (not just a lightness
 * ramp on one hue, which read as one smoothly-lit cone rather than three
 * deliberate steps) with a wider radius gap between tiers so each step
 * leaves a visible flat shelf, and the dredge arm/scoop — the one shape
 * that signals "active excavation" over "natural dune" — is scaled up
 * ~1.7x and repainted for contrast.
 *
 * Verified-in-render correction to the original STEP_PROMPT: a
 * "construction-yellow" scoop was the first thing tried, on the
 * assumption the vertex colors below render as-authored. They don't —
 * `ElementMeshManager` multiplies every vertex color against this
 * element's flat `defenseSandMining` instance tint (`#C68A3D`, see
 * `palette.ts`), so a low-blue orange-gold tint gets multiplied through
 * every part; a screenshot showed the intended yellow scoop landing as
 * just another dark orange, barely different from the mound. Hue
 * contrast is a lost cause under this tint — what still works is
 * *lightness* contrast: the scoop below is near-white so it multiplies
 * up to the brightest thing on the model, and the arm mast is near-black
 * so it reads as a shadowed dark strut — confirmed against a fresh
 * render, not assumed.
 */
function sandMiningGeometry(): THREE.BufferGeometry {
  const bottom = coneFrustum(0.3, 0.42, 0.14, 7, "#b06f2a", 0);
  const middle = coneFrustum(0.2, 0.26, 0.12, 7, "#d5972e", 0.14);
  move(middle, 0.03, 0, -0.02);
  const top = coneFrustum(0.08, 0.17, 0.1, 6, "#eccb8f", 0.26);
  move(top, -0.02, 0, 0.02);

  // Shadow bands right at each tier transition — thicker and darker than
  // before so the step reads as a real ledge, not a hairline.
  const grooveRing = (y: number, r: number, color: string) => coneFrustum(r, r, 0.03, 7, color, y);
  const groove1 = grooveRing(0.11, 0.31, "#a9661d");
  const groove2 = grooveRing(0.23, 0.205, "#8f5a1a");

  let armBase = coneFrustum(0.035, 0.05, 0.3, 5, "#3a352e", 0);
  armBase = scale(armBase, 1.7);
  rotate(armBase, 0, 0, -0.75);
  move(armBase, 0.44, 0.03, 0);
  let scoop = taperedSlab(0.16, 0.06, 0.1, 0.12, "#fdf6e8", 0);
  scoop = scale(scoop, 1.7);
  rotate(scoop, 0, 0, -0.55);
  move(scoop, 0.66, 0.4, 0);

  return mergeGeometries([bottom, middle, top, groove1, groove2, armBase, scoop]);
}

/** House: a cream cottage wall under a wide overhanging gable roof, a lean-to veranda at the front, and a pair of window insets. */
function houseGeometry(): THREE.BufferGeometry {
  const WALL_H = 0.32;
  const wall = box(0.62, WALL_H, 0.5, "#ede3c8", 0);
  // Wider than the wall on purpose — the overhang is the key silhouette
  // cue distinguishing this from a flush-roofed generic box.
  const roof = taperedSlab(0.8, 0.08, 0.26, 0.64, "#b5502e", WALL_H);
  const fascia = box(0.8, 0.03, 0.02, "#8a3a1f", WALL_H);
  move(fascia, 0, 0, 0.32);
  const veranda = taperedSlab(0.26, 0.22, 0.16, 0.18, "#a9793f", 0);
  move(veranda, 0, 0, 0.34);

  const window = (x: number) => {
    const g = box(0.08, 0.1, 0.015, "#a9793f", 0.1);
    move(g, x, 0, 0.255);
    return g;
  };

  return mergeGeometries([wall, roof, fascia, veranda, window(-0.18), window(0.18)]);
}

/** Yacht (STEP_PROMPT_economy_food_yacht.md item 4): a low, both-ends-tapered hull, a thin mast, one angled sail, a gold waterline trim — a single small accent piece, not a scene centerpiece. Purely cosmetic (Coast-only, zero effects). */
function yachtGeometry(): THREE.BufferGeometry {
  const hull = plan(
    [
      [-0.42, 0],
      [-0.28, 0.1],
      [0, 0.14],
      [0.28, 0.1],
      [0.42, 0],
      [0.28, -0.1],
      [0, -0.14],
      [-0.28, -0.1]
    ],
    0.1,
    "#f2ede0",
    0
  );
  const waterline = plan(
    [
      [-0.4, 0],
      [-0.26, 0.09],
      [0, 0.125],
      [0.26, 0.09],
      [0.4, 0],
      [0.26, -0.09],
      [0, -0.125],
      [-0.26, -0.09]
    ],
    0.02,
    "#d8b158",
    0
  );

  const mast = coneFrustum(0.012, 0.02, 0.5, 6, "#7c6a4f", 0.1);
  // blade()'s shape lies in the local XY plane (its flat face normal
  // along Z) — a 90° rotateY, tried first, turned that face edge-on to a
  // camera that looks in mostly along -Z, making the sail vanish. A small
  // angle instead keeps the flat face mostly toward the camera (reads as
  // a real sail, not a sliver) while still looking "angled," not flat-on.
  const sail = blade(
    [
      [0, 0.56],
      [0.26, 0.42],
      [0, 0.2]
    ],
    "#e7e2cf",
    0.02
  );
  rotate(sail, 0, 0.35, 0);
  const sailTrim = blade(
    [
      [0, 0.56],
      [0.03, 0.545],
      [0, 0.2]
    ],
    "#d8b158",
    0.022
  );
  rotate(sailTrim, 0, 0.35, 0);

  return mergeGeometries([hull, waterline, mast, sail, sailTrim]);
}

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  dune: duneGeometry,
  sandy_vegetation: sandyVegetationGeometry,
  beachside_resort: beachsideResortGeometry,
  seawall: seawallGeometry,
  breakwater: breakwaterGeometry,
  mangrove: mangroveGeometry,
  khazan: khazanGeometry,
  small_dam: smallDamGeometry,
  sand_mining: sandMiningGeometry,
  house: houseGeometry,
  yacht: yachtGeometry
};

export function createElementGeometry(elementId: string): THREE.BufferGeometry {
  const builder = BUILDERS[elementId];
  if (!builder) throw new Error(`No geometry builder for element id: ${elementId}`);
  return builder();
}
