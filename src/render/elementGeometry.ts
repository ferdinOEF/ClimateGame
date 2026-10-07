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

/**
 * Beachside Resort — the thing that pays well and costs the coast.
 *
 * Has to read as unmistakably bigger and more intrusive than a House at a
 * glance, because the whole Boom Town lesson is carried by seeing a row of
 * these replace a village. The earlier version got the height right and
 * little else: a plain block with a window grid, which read as an office.
 *
 * What makes it a resort rather than a tall house, in order of how much work
 * each does at this size: a stepped-back upper storey, projecting balconies
 * with railings on every floor, a blue pool with a deck, loungers and
 * parasols, and two palms. The palms matter more than they look — they are
 * the fastest cue that this is a leisure building, and they also make the
 * biodiversity cost legible when a storm takes them.
 */
function beachsideResortGeometry(): THREE.BufferGeometry {
  // Deliberately far taller than House's ~0.6 total. A live side-by-side
  // check during the earlier pass found that flat-roof and window-grid cues
  // alone read as different in KIND but not obviously bigger, and "bigger"
  // is the specific thing this element has to communicate.
  const BASE_H = 0.46;
  const UPPER_H = 0.4;
  const TOP = BASE_H + UPPER_H;

  const parts: THREE.BufferGeometry[] = [];

  // Two storeys, the upper one stepped back — the standard seafront hotel
  // massing, and it breaks up what was previously one tall slab.
  const base = box(0.5, BASE_H, 0.42, "#f6f1e4", 0);
  move(base, -0.22, 0, -0.04);
  const upper = box(0.4, UPPER_H, 0.34, "#f6f1e4", BASE_H);
  move(upper, -0.26, 0, -0.04);
  parts.push(base, upper);

  // Floor slabs reading as balconies, projecting past the wall on the
  // seaward face. The projection is what casts the horizontal shadow lines
  // that say "hotel" from above.
  // Narrower than the wall they hang off, and shallow. A first attempt made
  // them wider than the block, which turned the whole building into a stack
  // of white slabs with no body — the balconies have to read as attached to
  // something, not as the something.
  const balcony = (y: number, width: number, z: number) => {
    const slab = box(width, 0.022, 0.08, "#e0d4b4", y);
    move(slab, 0, 0, z);
    const rail = box(width, 0.042, 0.012, "#2f6b7a", y + 0.022);
    move(rail, 0, 0, z + 0.034);
    const railTop = box(width, 0.01, 0.018, "#9fc6cc", y + 0.064);
    move(railTop, 0, 0, z + 0.034);
    return [slab, rail, railTop];
  };
  parts.push(...balcony(BASE_H * 0.5, 0.38, 0.205));
  parts.push(...balcony(BASE_H + UPPER_H * 0.45, 0.3, 0.165));

  // Flat parapet roofline with a gold trim band.
  const parapet = box(0.44, 0.055, 0.38, "#a9791f", TOP);
  move(parapet, -0.26, 0, -0.04);
  const parapetTrim = box(0.46, 0.016, 0.4, "#d8b158", TOP + 0.055);
  move(parapetTrim, -0.26, 0, -0.04);
  parts.push(parapet, parapetTrim);

  // Windows on the shaded return wall, where there are no balconies to read
  // against. Teal glass, same family as the railings.
  for (const y of [BASE_H * 0.25, BASE_H * 0.72, BASE_H + UPPER_H * 0.3]) {
    for (const z of [-0.12, 0.06]) {
      const win = box(0.02, 0.09, 0.08, "#1f6e66", y);
      move(win, -0.472, 0, z - 0.04);
      parts.push(win);
    }
  }

  // Ground-floor entrance: awning, glass doors, a step.
  const awning = box(0.28, 0.032, 0.1, "#c7503a", 0.2);
  move(awning, -0.22, 0, 0.23);
  const doors = box(0.15, 0.17, 0.02, "#2f6b5e", 0);
  move(doors, -0.22, 0, 0.175);
  const step = box(0.22, 0.02, 0.07, "#ded3b8", 0);
  move(step, -0.22, 0, 0.225);
  parts.push(awning, doors, step);

  // Rooftop pennant.
  const pennantPole = coneFrustum(0.007, 0.011, 0.16, 5, "#8a8f91", TOP + 0.078);
  move(pennantPole, -0.42, 0, -0.04);
  const pennantFlag = blade(
    [
      [0, 0],
      [0.11, -0.028],
      [0, -0.056]
    ],
    "#d8b158",
    0.014
  );
  move(pennantFlag, -0.415, TOP + 0.195, -0.04);
  parts.push(pennantPole, pennantFlag);

  // The pool deck, off to one side. Two tones so it reads as water with a
  // shallow end rather than a flat blue rectangle.
  const deck = box(0.38, 0.015, 0.4, "#efe6cf", 0);
  move(deck, 0.3, 0, -0.06);
  const pool = box(0.25, 0.018, 0.28, "#2f7f9e", 0.008);
  move(pool, 0.3, 0, -0.06);
  const poolShallow = box(0.25, 0.02, 0.08, "#67b4c4", 0.008);
  move(poolShallow, 0.3, 0, -0.17);
  parts.push(deck, pool, poolShallow);

  // Loungers and a parasol on the deck. Tiny, but they are what turn a blue
  // rectangle into a pool.
  for (const z of [0.1, 0.17]) {
    const lounger = box(0.1, 0.015, 0.042, "#f7f2e6", 0.015);
    move(lounger, 0.24, 0, z);
    parts.push(lounger);
  }
  const parasolPole = coneFrustum(0.006, 0.008, 0.13, 4, "#8d6b45", 0.015);
  move(parasolPole, 0.42, 0, 0.13);
  const parasol = coneFrustum(0.001, 0.1, 0.05, 7, "#c7503a", 0.13);
  move(parasol, 0.42, 0, 0.13);
  parts.push(parasolPole, parasol);

  // Two palms, different heights. The strongest "leisure" cue on the model,
  // and the clearest thing to lose when a surge comes through.
  const palm = (x: number, z: number, height: number) => {
    const built: THREE.BufferGeometry[] = [];
    const trunk = coneFrustum(0.018, 0.032, height, 6, "#8d6b45", 0);
    // A slight lean, the way a coconut palm actually grows on a beach.
    rotate(trunk, 0.1, 0, 0.12);
    move(trunk, x, 0, z);
    built.push(trunk);

    const frondCount = 6;
    for (let i = 0; i < frondCount; i++) {
      const yaw = (i / frondCount) * Math.PI * 2;
      const frond = blade(
        [
          [-0.025, 0],
          [0.025, 0],
          [0.012, 0.26],
          [-0.012, 0.26]
        ],
        i % 2 === 0 ? "#3f7f3a" : "#5aa04c",
        0.016
      );
      rotate(frond, -0.95, 0, 0);
      rotate(frond, 0, yaw, 0);
      move(frond, x + 0.03, height - 0.01, z);
      built.push(frond);
    }
    return built;
  };
  parts.push(...palm(0.08, 0.3, 0.44), ...palm(0.56, 0.3, 0.34));

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

/**
 * House — a Goan village house.
 *
 * Rebuilt from a cream box with a roof on it. The earlier version read as a
 * generic cottage from anywhere; this is specifically the thing that stands
 * on this coast, and that matters for a game about what a storm takes away.
 * The features are the ones a Goan house actually has and that survive at
 * this size: a raised laterite plinth, ochre walls, a steep terracotta tile
 * roof with a ridge course, and a `balcão` — the covered front porch with
 * built-in seats that is the single most recognisable element of the style.
 *
 * Everything is kept chunky on purpose. These props are about a third of a
 * hex across on screen, so detail finer than roughly 3 cm of world space
 * reads as noise rather than as a feature.
 */
function houseGeometry(): THREE.BufferGeometry {
  const PLINTH_H = 0.07;
  const WALL_H = 0.3;
  const WALL_TOP = PLINTH_H + WALL_H;

  // Laterite plinth. Real houses here sit up off the ground against the
  // monsoon, which is exactly the detail worth keeping in a game about water.
  const plinth = box(0.68, PLINTH_H, 0.56, "#9c5a37", 0);
  const wall = box(0.6, WALL_H, 0.48, "#f0e4c6", PLINTH_H);
  // A band of exposed laterite at the base of the wall, the usual treatment.
  const skirt = box(0.608, 0.05, 0.488, "#b4714a", PLINTH_H);

  // Steep tiled roof with a generous overhang — the overhang is the main
  // silhouette cue, and a steep pitch is what sheds 3 m of monsoon rain.
  const roof = taperedSlab(0.84, 0.06, 0.3, 0.7, "#b5502e", WALL_TOP);
  const ridge = box(0.1, 0.05, 0.72, "#8a3a1f", WALL_TOP + 0.28);
  const eave = box(0.86, 0.035, 0.03, "#8a3a1f", WALL_TOP);
  move(eave, 0, 0, 0.35);
  const eaveBack = box(0.86, 0.035, 0.03, "#8a3a1f", WALL_TOP);
  move(eaveBack, 0, 0, -0.35);

  const parts: THREE.BufferGeometry[] = [plinth, wall, skirt, roof, ridge, eave, eaveBack];

  // The balcão: a raised porch deck, two slim pillars carrying the roof
  // overhang, and the low seat walls that make it a balcão rather than a step.
  const deck = box(0.42, 0.05, 0.16, "#c69a63", PLINTH_H);
  move(deck, 0, 0, 0.3);
  parts.push(deck);

  for (const x of [-0.17, 0.17]) {
    const pillar = coneFrustum(0.022, 0.03, 0.26, 6, "#f0e4c6", PLINTH_H + 0.05);
    move(pillar, x, 0, 0.33);
    const seat = box(0.06, 0.09, 0.14, "#e2d3b2", PLINTH_H + 0.05);
    move(seat, x, 0, 0.3);
    parts.push(pillar, seat);
  }

  // Door, set into the porch, with a terracotta lintel over it.
  const door = box(0.13, 0.19, 0.02, "#6b4226", PLINTH_H + 0.05);
  move(door, 0, 0, 0.242);
  const lintel = box(0.17, 0.025, 0.02, "#b5502e", PLINTH_H + 0.24);
  move(lintel, 0, 0, 0.245);
  parts.push(door, lintel);

  // Shuttered windows on the two visible walls. The shutters are the reason
  // these read as windows at a glance rather than as dark rectangles.
  const window = (x: number, z: number, faceZ: boolean) => {
    const frame = box(faceZ ? 0.13 : 0.02, 0.12, faceZ ? 0.02 : 0.13, "#f7f0dd", PLINTH_H + 0.11);
    move(frame, x, 0, z);
    const pane = box(faceZ ? 0.09 : 0.022, 0.085, faceZ ? 0.022 : 0.09, "#3b5a52", PLINTH_H + 0.125);
    move(pane, x, 0, z);
    const shutterA = box(faceZ ? 0.035 : 0.024, 0.11, faceZ ? 0.024 : 0.035, "#2f6b5e", PLINTH_H + 0.115);
    move(shutterA, faceZ ? x - 0.05 : x, 0, faceZ ? z : z - 0.05);
    const shutterB = box(faceZ ? 0.035 : 0.024, 0.11, faceZ ? 0.024 : 0.035, "#2f6b5e", PLINTH_H + 0.115);
    move(shutterB, faceZ ? x + 0.05 : x, 0, faceZ ? z : z + 0.05);
    return [frame, pane, shutterA, shutterB];
  };
  parts.push(...window(-0.21, 0.245, true), ...window(0.21, 0.245, true));
  parts.push(...window(-0.305, -0.1, false));

  // Rooftop water tank — ubiquitous on Indian houses, and a strong
  // silhouette cue from this game's near-top-down camera.
  const tankStand = box(0.1, 0.05, 0.1, "#8a8f91", WALL_TOP + 0.2);
  move(tankStand, 0.19, 0, -0.14);
  const tank = coneFrustum(0.07, 0.075, 0.1, 8, "#1f6e66", WALL_TOP + 0.25);
  move(tank, 0.19, 0, -0.14);
  const tankLid = coneFrustum(0.05, 0.072, 0.025, 8, "#2f8f84", WALL_TOP + 0.35);
  move(tankLid, 0.19, 0, -0.14);
  parts.push(tankStand, tank, tankLid);

  return mergeGeometries(parts);
}

/**
 * Yacht — the Coin sink, and the one purely decorative thing on the board.
 *
 * Rebuilt from a flat lens with one triangle on a stick. It is the most
 * expensive thing a player can buy and it was the least convincing object in
 * the game, which is a poor trade for several turns of saved income. Now it
 * has the parts an eye actually uses to recognise a yacht: a hull with a dark
 * bootline, a raised coachroof, a cockpit, a mainsail AND a jib (one sail
 * reads as a dinghy), a boom, and a stern flag.
 *
 * Still deliberately small — a Coast-tile ornament, not a centrepiece — and
 * still zero gameplay effect.
 */
function yachtGeometry(): THREE.BufferGeometry {
  const hullOutline: [number, number][] = [
    [-0.4, 0],
    [-0.3, 0.085],
    [-0.05, 0.115],
    [0.22, 0.1],
    [0.4, 0.04],
    [0.4, -0.04],
    [0.22, -0.1],
    [-0.05, -0.115],
    [-0.3, -0.085]
  ];

  const hull = plan(hullOutline, 0.1, "#f4f1e8", 0);
  // A dark bootline just above the waterline. Real hulls have one, and it is
  // what stops a white shape reading as a bar of soap.
  const boot = plan(hullOutline, 0.022, "#2c4a5a", 0.055);
  const deck = plan(
    [
      [-0.34, 0],
      [-0.26, 0.06],
      [-0.04, 0.085],
      [0.2, 0.072],
      [0.34, 0.028],
      [0.34, -0.028],
      [0.2, -0.072],
      [-0.04, -0.085],
      [-0.26, -0.06]
    ],
    0.012,
    "#d8c69a",
    0.1
  );

  const parts: THREE.BufferGeometry[] = [hull, boot, deck];

  // Coachroof and cockpit — the break in the deck line that says "cabin".
  const coachroof = plan(
    [
      [-0.14, 0.055],
      [0.1, 0.05],
      [0.14, 0],
      [0.1, -0.05],
      [-0.14, -0.055]
    ],
    0.055,
    "#f4f1e8",
    0.112
  );
  const coachroofTop = plan(
    [
      [-0.13, 0.045],
      [0.09, 0.04],
      [0.12, 0],
      [0.09, -0.04],
      [-0.13, -0.045]
    ],
    0.014,
    "#c9bda0",
    0.167
  );
  parts.push(coachroof, coachroofTop);

  const cockpit = box(0.12, 0.03, 0.1, "#8d6b45", 0.112);
  move(cockpit, -0.24, 0, 0);
  parts.push(cockpit);

  const mast = coneFrustum(0.009, 0.016, 0.62, 6, "#d9d4c6", 0.112);
  move(mast, 0.02, 0, 0);
  // The boom, angled slightly off centreline so the rig does not read as flat.
  const boom = box(0.3, 0.014, 0.014, "#d9d4c6", 0.2);
  move(boom, -0.12, 0, 0.012);
  parts.push(mast, boom);

  // Mainsail aft of the mast, jib forward of it. blade()'s shape lies in the
  // local XY plane with its face normal along Z; a 90-degree yaw would turn
  // that face edge-on to this game's camera and the sail would vanish, so
  // both get a small yaw instead — enough to read as angled, not enough to
  // disappear.
  const mainsail = blade(
    [
      [0.02, 0.7],
      [-0.3, 0.26],
      [0.02, 0.22]
    ],
    "#f2efe2",
    0.018
  );
  rotate(mainsail, 0, 0.34, 0);
  move(mainsail, 0.02, 0.112, 0);

  const jib = blade(
    [
      [0.02, 0.66],
      [0.3, 0.2],
      [0.02, 0.2]
    ],
    "#e6dcc4",
    0.016
  );
  rotate(jib, 0, 0.34, 0);
  move(jib, 0.02, 0.112, 0);

  const sailSeam = blade(
    [
      [0.0, 0.7],
      [-0.03, 0.675],
      [0.0, 0.22]
    ],
    "#c2a86a",
    0.02
  );
  rotate(sailSeam, 0, 0.34, 0);
  move(sailSeam, 0.02, 0.112, 0);
  parts.push(mainsail, jib, sailSeam);

  // Stern flag — a small bright accent at the one end of the boat that has
  // nothing else going on.
  const flagPole = coneFrustum(0.005, 0.007, 0.1, 4, "#d9d4c6", 0.112);
  move(flagPole, -0.36, 0, 0);
  const flag = blade(
    [
      [0, 0],
      [0.09, -0.02],
      [0, -0.045]
    ],
    "#c7503a",
    0.012
  );
  move(flag, -0.355, 0.2, 0);
  parts.push(flagPole, flag);

  return mergeGeometries(parts);
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
