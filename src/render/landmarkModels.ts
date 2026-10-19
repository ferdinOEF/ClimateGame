import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, taperedSlab, coneFrustum, dome, blade, plan, rotate, move } from "./primitives3d";

/**
 * The sixteen Panjim landmarks, each its own model (Section 18), drawn after
 * the owner's approved flat drawings (docs/reference/landmarks_approved.png,
 * 2026-10-18): the silhouette and the features everybody pictures, in the
 * board's low-poly, flat-shaded look, merged into one geometry each.
 *
 * Axes: x east, y up, z south. A model's front is +z (towards the default
 * camera); `LANDMARK_FACING` turns it to face its real street or water. Each
 * is authored to fill its hex (half its plan diagonal about 0.7) and is scaled
 * by `monumentScale.ts`. Lettering is drawn by `landmarkDecals.ts`.
 */

const WHITE = "#fffaec";
const WHITE_SHADE = "#efe6cf";
const CREAM = "#f3e7c6";
const TERRACOTTA = "#b5502e";
const TERRACOTTA_DARK = "#8a3a1f";
const ROOF_BROWN = "#6e3326";
const OCHRE = "#d9a63c";
const LATERITE = "#9c4a32";
const STONE = "#cdc6b4";
const PAVE = "#d8ccae";
const GOLD = "#d8b158";
const GLASS = "#3f6f86";
const DARK = "#4a3a2c";
const LEAF_DARK = "#3f7f3a";
const LEAF = "#5aa04c";
const GRASS = "#8fbf5a";
const GRASS_DARK = "#79ad4b";
const BLUE = "#3f78b8";
const WATER = "#3f8fb0";

type Parts = THREE.BufferGeometry[];

/** Paints any geometry one colour (non-indexed, so it merges with the primitives). */
function painted(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const color = new THREE.Color(hex);
  const count = flat.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  flat.deleteAttribute("uv");
  return flat;
}

/** A flat plate of ground over a polygon given as (x, z) points; `plan` reads its second number as -z, so this flips it. */
function ground(points: [number, number][], height: number, hex: string, baseY = 0): THREE.BufferGeometry {
  return plan(points.map(([x, z]) => [x, -z] as [number, number]), height, hex, baseY);
}

/** A hipped roof over a w x d rectangle: four slopes, a ridge along the long side. */
function hipRoof(w: number, d: number, h: number, hex: string, baseY: number): THREE.BufferGeometry {
  const long = w >= d;
  const half = Math.abs(w - d) / 2;
  const [hx, hz] = [w / 2, d / 2];
  const r1 = long ? [-half, baseY + h, 0] : [0, baseY + h, -half];
  const r2 = long ? [half, baseY + h, 0] : [0, baseY + h, half];
  const a = [-hx, baseY, -hz], b = [hx, baseY, -hz], c = [hx, baseY, hz], e = [-hx, baseY, hz];
  const tris = long
    ? [e, c, r2, e, r2, r1, b, a, r1, b, r1, r2, c, b, r2, a, e, r1]
    : [e, c, r2, a, e, r2, a, r2, r1, b, a, r1, c, b, r1, c, r1, r2];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return painted(g, hex);
}

/** A gabled roof over a w x d rectangle, the ridge along x. */
function gableRoof(w: number, d: number, h: number, hex: string, baseY: number): THREE.BufferGeometry {
  const g = taperedSlab(d, 0.012, h, w, hex, baseY);
  return rotate(g, 0, Math.PI / 2, 0);
}

/** A flat ring on the ground (centre circle, fountain rim). */
function ring(inner: number, outer: number, hex: string, y: number, segments = 20): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(inner, outer, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return painted(g, hex);
}

/** A disc on the ground. */
function disc(radius: number, hex: string, y: number, segments = 16): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return painted(g, hex);
}

/** A palm, leaning slightly. */
function palm(x: number, z: number, height: number): Parts {
  const parts: Parts = [];
  const trunk = coneFrustum(0.014, 0.024, height, 5, "#8d6b45", 0);
  rotate(trunk, 0.08, 0, 0.08);
  parts.push(move(trunk, x, 0, z));
  for (let i = 0; i < 6; i++) {
    const frond = blade([[-0.02, 0], [0.02, 0], [0.008, 0.2], [-0.008, 0.2]], i % 2 ? LEAF : LEAF_DARK, 0.012);
    rotate(frond, -1.0, 0, 0);
    rotate(frond, 0, (i / 6) * Math.PI * 2, 0);
    parts.push(move(frond, x + 0.02, height - 0.01, z + 0.02));
  }
  return parts;
}

/** A round shade tree. */
function tree(x: number, z: number, height: number, hex = LEAF_DARK): Parts {
  const trunk = move(coneFrustum(0.014, 0.022, height * 0.5, 5, "#6b4a2f", 0), x, 0, z);
  const crown = move(dome(height * 0.32, height * 0.34, height * 0.32, hex, height * 0.42), x, 0, z);
  const top = move(dome(height * 0.2, height * 0.22, height * 0.2, LEAF, height * 0.62), x + 0.01, 0, z - 0.01);
  return [trunk, crown, top];
}

/** A casuarina: a slim dark cone on a short trunk. */
function casuarina(x: number, z: number, height: number): Parts {
  return [move(coneFrustum(0.006, 0.01, height * 0.3, 4, "#6b4a2f", 0), x, 0, z), move(coneFrustum(0.004, 0.05, height * 0.75, 6, "#2f6b3a", height * 0.25), x, 0, z)];
}

/**
 * A row of window or arch openings on one face: flat panes (two triangles), an arch a six-triangle half disc.
 * `axis` "x": the face is normal to z at `face` (openings spread along x); "z": normal to x. `dir` is the way the
 * face looks (+1 or -1 along its normal); pass it for any face of a block that is not centred on the origin.
 */
function openings(opts: { axis: "x" | "z"; from: number; to: number; count: number; face: number; y: number; w: number; h: number; hex: string; arch?: boolean; out?: number; dir?: 1 | -1 }): Parts {
  const parts: Parts = [];
  // Which way the face looks: given, or else taken from the face's side of the origin (right for a centred block only).
  const sign = opts.dir ?? (Math.sign(opts.face) || 1);
  const off = opts.face + sign * (opts.out ?? 0.004);
  // Facing outward: +z (or -z) for "x", +x (or -x) for "z".
  const turn = opts.axis === "x" ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2;
  for (let i = 0; i < opts.count; i++) {
    const t = opts.count === 1 ? 0.5 : i / (opts.count - 1);
    const at = opts.from + (opts.to - opts.from) * t;
    const pane = new THREE.PlaneGeometry(opts.w, opts.h);
    pane.translate(0, opts.y + opts.h / 2, 0);
    if (opts.arch) {
      const cap = new THREE.CircleGeometry(opts.w / 2, 6, 0, Math.PI);
      cap.translate(0, opts.y + opts.h, 0);
      const merged = mergeGeometries([pane.toNonIndexed(), cap.toNonIndexed()].map((g) => (g.deleteAttribute("uv"), g)))!;
      parts.push(placeOnFace(painted(merged, opts.hex), opts.axis, at, off, turn));
    } else parts.push(placeOnFace(painted(pane, opts.hex), opts.axis, at, off, turn));
  }
  return parts;
}

function placeOnFace(g: THREE.BufferGeometry, axis: "x" | "z", at: number, off: number, turn: number): THREE.BufferGeometry {
  g.rotateY(turn);
  return axis === "x" ? move(g, at, 0, off) : move(g, off, 0, at);
}

/** A thin horizontal band round a w x d box at height y. */
function band(w: number, d: number, y: number, h: number, hex: string, x = 0, z = 0): THREE.BufferGeometry {
  return move(box(w + 0.012, h, d + 0.012, hex, y), x, 0, z);
}

// ---------------------------------------------------------------------------

/** 1. Our Lady of the Immaculate Conception: the white facade, two towers, the bell gable, the zigzag stair. */
function church(): Parts {
  const p: Parts = [];
  const top = 0.18; // the church stands on its hill: a platform the stair climbs
  p.push(box(0.62, top, 0.5, "#e6dcc2", 0));
  move(p[0], 0, 0, -0.16);
  // The nave under a red gable.
  // The ridge runs back from the facade (along z): the roof is turned about its own centre, then set over the nave.
  p.push(move(box(0.34, 0.34, 0.42, WHITE, top), 0, 0, -0.22), move(rotate(gableRoof(0.42, 0.38, 0.12, TERRACOTTA, top + 0.34), 0, Math.PI / 2, 0), 0, 0, -0.22));
  // The facade.
  const fz = 0.0;
  p.push(move(box(0.44, 0.42, 0.06, WHITE, top), 0, 0, fz));
  for (const x of [-0.19, 0.19]) {
    p.push(move(box(0.11, 0.56, 0.11, WHITE, top), x, 0, fz));
    p.push(move(box(0.12, 0.03, 0.12, WHITE_SHADE, top + 0.56), x, 0, fz));
    p.push(move(coneFrustum(0.01, 0.08, 0.08, 4, WHITE_SHADE, top + 0.59), x, 0, fz));
    p.push(...openings({ axis: "x", from: x, to: x, count: 1, face: fz + 0.055, dir: 1, y: top + 0.38, w: 0.04, h: 0.06, hex: DARK, arch: true }));
  }
  // The central bell gable, with its open arch, the gold bell and the cross.
  p.push(move(box(0.2, 0.26, 0.06, WHITE, top + 0.42), 0, 0, fz));
  p.push(move(taperedSlab(0.2, 0.04, 0.08, 0.06, WHITE, top + 0.68), 0, 0, fz));
  p.push(move(box(0.07, 0.1, 0.02, "#a99b7a", top + 0.5), 0, 0, fz + 0.032));
  p.push(move(coneFrustum(0.012, 0.026, 0.045, 6, GOLD, top + 0.52), 0, 0, fz + 0.03));
  p.push(move(box(0.014, 0.1, 0.014, WHITE, top + 0.76), 0, 0, fz), move(box(0.06, 0.014, 0.014, WHITE, top + 0.82), 0, 0, fz));
  // Door, windows and the small blue balcony.
  p.push(move(box(0.07, 0.12, 0.012, DARK, top), 0, 0, fz + 0.034));
  p.push(...openings({ axis: "x", from: -0.08, to: 0.08, count: 2, face: fz + 0.03, dir: 1, y: top + 0.18, w: 0.035, h: 0.06, hex: DARK, arch: true }));
  p.push(move(box(0.12, 0.016, 0.04, BLUE, top + 0.3), 0, 0, fz + 0.05), move(box(0.12, 0.03, 0.006, BLUE, top + 0.316), 0, 0, fz + 0.07));
  // The zigzag stair: three flights down the hill, white balustrades edged in blue.
  const flights: [number, number, number, number][] = [
    [0.12, 0.11, top, top * 0.66],
    [-0.12, 0.25, top * 0.66, top * 0.33],
    [0.12, 0.39, top * 0.33, 0]
  ];
  for (const [x, z, y0, y1] of flights) {
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const y = y1 + ((y0 - y1) * (steps - s)) / steps;
      const sx = x + (s - 1.5) * 0.045 * Math.sign(x);
      p.push(move(box(0.05, y, 0.1, "#f6f0e2", 0), sx, 0, z));
    }
    for (const side of [-1, 1]) {
      p.push(move(box(0.22, 0.03, 0.012, WHITE, y0 + 0.01), x, 0, z + side * 0.055));
      p.push(move(box(0.22, 0.008, 0.016, BLUE, y0 + 0.04), x, 0, z + side * 0.055));
    }
    p.push(move(box(0.12, 0.012, 0.14, PAVE, y1), -x * 1.4, 0, z + 0.07));
  }
  // The statue at the foot.
  p.push(move(box(0.05, 0.05, 0.05, STONE, 0), -0.28, 0, 0.44), move(coneFrustum(0.012, 0.02, 0.07, 6, WHITE, 0.05), -0.28, 0, 0.44));
  p.push(...palm(-0.4, 0.2, 0.36), ...palm(0.4, 0.16, 0.32), ...palm(0.34, 0.46, 0.28));
  return p;
}

/** 2. Adil Shah Palace: a hollow square block, two storeys, white with ochre bands, arched verandas, hipped roof. */
function palace(): Parts {
  const p: Parts = [];
  const W = 0.86, D = 0.66, wing = 0.2, H = 0.36;
  const wings: [number, number, number, number][] = [
    [0, D / 2 - wing / 2, W, wing],
    [0, -D / 2 + wing / 2, W, wing],
    [-W / 2 + wing / 2, 0, wing, D - 2 * wing],
    [W / 2 - wing / 2, 0, wing, D - 2 * wing]
  ];
  for (const [x, z, w, d] of wings) {
    p.push(move(box(w, H, d, WHITE, 0), x, 0, z));
    p.push(band(w, d, 0.0, 0.03, OCHRE, x, z), band(w, d, H * 0.5, 0.02, OCHRE, x, z), band(w, d, H - 0.02, 0.02, OCHRE, x, z));
    p.push(move(hipRoof(w + 0.05, d + 0.05, 0.1, ROOF_BROWN, H), x, 0, z));
  }
  // The courtyard floor.
  p.push(box(W - 2 * wing, 0.01, D - 2 * wing, PAVE, 0));
  // Rows of arches on the long front (+z) and back (the river side, -z).
  for (const face of [D / 2, -D / 2]) {
    p.push(...openings({ axis: "x", from: -0.36, to: 0.36, count: 9, face, y: 0.04, w: 0.045, h: 0.09, hex: "#8a6a3a", arch: true }));
    p.push(...openings({ axis: "x", from: -0.36, to: 0.36, count: 9, face, y: 0.21, w: 0.04, h: 0.08, hex: GLASS, arch: true }));
  }
  for (const face of [W / 2, -W / 2]) p.push(...openings({ axis: "z", from: -0.22, to: 0.22, count: 5, face, y: 0.21, w: 0.04, h: 0.08, hex: GLASS, arch: true }));
  // The taller central gate bay with its arched door and round window.
  p.push(move(box(0.18, H + 0.12, 0.08, WHITE, 0), 0, 0, D / 2 - 0.01));
  p.push(move(hipRoof(0.22, 0.12, 0.07, ROOF_BROWN, H + 0.12), 0, 0, D / 2 - 0.01));
  p.push(move(box(0.07, 0.13, 0.012, DARK, 0), 0, 0, D / 2 + 0.035), move(dome(0.035, 0.035, 0.006, DARK, 0.13), 0, 0, D / 2 + 0.035));
  const round = new THREE.CircleGeometry(0.03, 12);
  p.push(move(painted(round, GLASS), 0, H + 0.03, D / 2 + 0.032));
  p.push(...tree(-0.5, 0.36, 0.22), move(box(0.05, 0.05, 0.05, STONE, 0), -0.52, 0, 0.06));
  return p;
}

/** 3. The Municipal Market: two long sheds under pale cream gables, on a ring of stalls with coloured awnings. */
function market(): Parts {
  const p: Parts = [];
  p.push(box(0.92, 0.04, 0.7, PAVE, 0));
  for (const z of [-0.15, 0.15]) {
    p.push(move(box(0.76, 0.2, 0.24, CREAM, 0.04), 0, 0, z));
    p.push(...openings({ axis: "x", from: -0.32, to: 0.32, count: 7, face: z + 0.12, dir: 1, y: 0.1, w: 0.04, h: 0.06, hex: "#7a6648" }));
    p.push(move(gableRoof(0.8, 0.28, 0.16, "#d9d4c4", 0.24), 0, 0, z));
  }
  // The stalls round the edge, each a coloured awning on a low stall.
  const colours = ["#c8423a", "#3a6fc8", "#2f9a6a", "#e08a2a", "#8a4ab0", "#2a9a9a"];
  let k = 0;
  const stall = (x: number, z: number, rot: number): void => {
    const counter = rotate(box(0.11, 0.06, 0.06, "#e8dcc0", 0.04), 0, rot, 0);
    const awning = blade([[-0.06, 0], [0.06, 0], [0.06, 0.08], [-0.06, 0.08]], colours[k++ % colours.length], 0.01);
    rotate(awning, -1.1, 0, 0);
    rotate(awning, 0, rot, 0);
    p.push(move(counter, x, 0, z), move(awning, x, 0.12, z));
  };
  for (let i = 0; i < 7; i++) {
    const x = -0.39 + i * 0.13;
    stall(x, 0.33, 0);
    stall(x, -0.33, Math.PI);
  }
  for (const x of [-0.44, 0.44]) for (const z of [-0.12, 0.12]) stall(x, z, x > 0 ? Math.PI / 2 : -Math.PI / 2);
  return p;
}

/** 4. Institute Menezes Braganza: a long two-storey ochre building, white pilasters, green shutters, a red hipped roof. */
function menezesBraganza(): Parts {
  const p: Parts = [];
  const W = 0.86, D = 0.36, H = 0.34;
  p.push(move(box(W, H, D, OCHRE, 0), 0, 0, -0.08));
  p.push(band(W, D, 0, 0.03, WHITE, 0, -0.08), band(W, D, H * 0.5, 0.02, WHITE, 0, -0.08), band(W, D, H - 0.025, 0.025, WHITE, 0, -0.08));
  for (let i = 0; i <= 8; i++) p.push(move(box(0.02, H, 0.012, WHITE, 0), -W / 2 + (i * W) / 8, 0, D / 2 - 0.08 + 0.006));
  for (const y of [0.05, 0.2]) p.push(...openings({ axis: "x", from: -0.38, to: 0.38, count: 8, face: D / 2 - 0.08, y, w: 0.045, h: 0.09, hex: "#3f7a3a", arch: true }));
  p.push(move(hipRoof(W + 0.05, D + 0.05, 0.11, TERRACOTTA, H), 0, 0, -0.08));
  // The white entrance bay with its arched door.
  p.push(move(box(0.16, H + 0.04, 0.06, WHITE, 0), 0, 0, D / 2 - 0.06));
  p.push(move(taperedSlab(0.18, 0.04, 0.06, 0.07, WHITE, H + 0.04), 0, 0, D / 2 - 0.06));
  p.push(move(box(0.06, 0.12, 0.012, DARK, 0), 0, 0, D / 2 - 0.024), move(dome(0.03, 0.03, 0.006, DARK, 0.12), 0, 0, D / 2 - 0.024));
  // Azad Maidan: a little green with a small memorial.
  p.push(move(disc(0.13, GRASS, 0.006), -0.18, 0, 0.32), move(box(0.07, 0.05, 0.07, STONE, 0), -0.18, 0, 0.32), move(box(0.04, 0.1, 0.04, WHITE, 0.05), -0.18, 0, 0.32));
  p.push(...tree(-0.42, 0.3, 0.22), ...tree(0.4, 0.3, 0.2));
  return p;
}

/** 5. Mahalaxmi Temple: a cream hall under a red hipped roof, the orange tiered tower, a scalloped porch, a lamp tower. */
function temple(): Parts {
  const p: Parts = [];
  p.push(box(0.8, 0.04, 0.8, PAVE, 0));
  p.push(move(box(0.46, 0.22, 0.36, CREAM, 0.04), 0, 0, 0.06), move(hipRoof(0.52, 0.42, 0.12, TERRACOTTA, 0.26), 0, 0, 0.06));
  // The tower behind: four octagonal tiers stepping in, a golden dome and finial.
  const tiers: [number, number, string][] = [
    [0.16, 0.12, "#e0782a"],
    [0.13, 0.1, "#f0a43a"],
    [0.1, 0.09, "#e0782a"],
    [0.075, 0.08, "#f0b84a"]
  ];
  let y = 0.04;
  for (const [r, h, hex] of tiers) {
    p.push(move(coneFrustum(r * 0.92, r, h, 8, hex, y), 0.02, 0, -0.18));
    y += h;
    p.push(move(coneFrustum(r * 0.95, r * 0.95, 0.015, 8, "#f6d27a", y), 0.02, 0, -0.18));
    y += 0.015;
  }
  p.push(move(dome(0.05, 0.05, 0.05, GOLD, y), 0.02, 0, -0.18), move(coneFrustum(0.004, 0.012, 0.08, 6, GOLD, y + 0.04), 0.02, 0, -0.18));
  // The porch with its red cusped arch.
  p.push(move(box(0.18, 0.18, 0.1, CREAM, 0.04), -0.08, 0, 0.29), move(hipRoof(0.22, 0.14, 0.05, TERRACOTTA, 0.22), -0.08, 0, 0.29));
  p.push(move(box(0.1, 0.1, 0.012, "#c8423a", 0.05), -0.08, 0, 0.345));
  for (let i = 0; i < 3; i++) p.push(move(dome(0.018, 0.018, 0.006, "#c8423a", 0.15), -0.08 + (i - 1) * 0.034, 0, 0.345));
  // The white tiered lamp tower in front.
  for (let i = 0; i < 6; i++) p.push(move(coneFrustum(0.026 - i * 0.003, 0.03 - i * 0.003, 0.05, 6, i % 2 ? WHITE_SHADE : WHITE, 0.04 + i * 0.05), 0.2, 0, 0.3));
  p.push(...palm(-0.36, -0.1, 0.36), ...palm(0.36, -0.22, 0.32));
  return p;
}

/** 6. Jama Masjid: a white flat-roofed hall, green trim and arches, a small dome, two slender minarets. */
function mosque(): Parts {
  const p: Parts = [];
  p.push(box(0.8, 0.03, 0.66, PAVE, 0));
  p.push(move(box(0.5, 0.28, 0.4, WHITE, 0.03), 0, 0, -0.02));
  // Green trim: a parapet round the white flat roof (edges only, so the roof stays white), and a band at the foot.
  for (const [w, d, x, z] of [[0.514, 0.014, 0, 0.18], [0.514, 0.014, 0, -0.22], [0.014, 0.4, 0.25, -0.02], [0.014, 0.4, -0.25, -0.02]] as [number, number, number, number][]) p.push(move(box(w, 0.035, d, "#2f8a4a", 0.29), x, 0, z));
  p.push(band(0.5, 0.4, 0.04, 0.015, "#2f8a4a", 0, -0.02));
  p.push(...openings({ axis: "x", from: -0.18, to: 0.18, count: 4, face: 0.18, y: 0.1, w: 0.05, h: 0.1, hex: "#2f8a4a", arch: true }));
  p.push(...openings({ axis: "z", from: -0.14, to: 0.1, count: 3, face: 0.25, y: 0.1, w: 0.05, h: 0.1, hex: "#2f8a4a", arch: true }));
  p.push(move(box(0.07, 0.14, 0.012, "#2f8a4a", 0.03), 0, 0, 0.19), move(dome(0.035, 0.035, 0.006, "#2f8a4a", 0.17), 0, 0, 0.19));
  // The small dome and its crescent.
  p.push(move(coneFrustum(0.09, 0.09, 0.04, 10, WHITE, 0.31), 0.04, 0, -0.06), move(dome(0.09, 0.08, 0.09, WHITE, 0.35), 0.04, 0, -0.06));
  p.push(move(coneFrustum(0.004, 0.006, 0.05, 4, GOLD, 0.43), 0.04, 0, -0.06), move(rotate(new THREE.TorusGeometry(0.014, 0.004, 4, 10, Math.PI * 1.3) as THREE.BufferGeometry, 0, 0, 0), 0.04, 0.49, -0.06));
  const crescent = p.pop()!;
  p.push(painted(crescent, GOLD));
  // Two slender minarets with green balconies and small domes.
  for (const x of [-0.3, 0.3]) {
    p.push(move(coneFrustum(0.03, 0.036, 0.62, 8, WHITE, 0.03), x, 0, 0.16));
    p.push(move(coneFrustum(0.05, 0.05, 0.02, 8, "#2f8a4a", 0.42), x, 0, 0.16), move(coneFrustum(0.048, 0.048, 0.02, 8, "#2f8a4a", 0.58), x, 0, 0.16));
    p.push(move(dome(0.034, 0.05, 0.034, "#2f8a4a", 0.65), x, 0, 0.16));
  }
  p.push(...tree(0.3, 0.3, 0.2));
  return p;
}

/** A multi-storey block with floor bands and window rows on all faces. */
function block(opts: { w: number; d: number; storeys: number; storey: number; wall: string; band: string; window: string; x?: number; z?: number; roof?: string }): Parts {
  const p: Parts = [];
  const { w, d, storeys, storey } = opts;
  const x = opts.x ?? 0, z = opts.z ?? 0;
  const H = storeys * storey;
  p.push(move(box(w, H, d, opts.wall, 0), x, 0, z));
  for (let s = 0; s < storeys; s++) {
    p.push(band(w, d, s * storey, 0.014, opts.band, x, z));
    const y = s * storey + storey * 0.32;
    const nx = Math.max(2, Math.round(w / 0.06)), nz = Math.max(2, Math.round(d / 0.06));
    for (const face of [d / 2, -d / 2]) p.push(...openings({ axis: "x", from: x - w / 2 + 0.04, to: x + w / 2 - 0.04, count: nx, face: z + face, dir: face > 0 ? 1 : -1, y, w: 0.03, h: storey * 0.42, hex: opts.window }));
    for (const face of [w / 2, -w / 2]) p.push(...openings({ axis: "z", from: z - d / 2 + 0.04, to: z + d / 2 - 0.04, count: nz, face: x + face, dir: face > 0 ? 1 : -1, y, w: 0.03, h: storey * 0.42, hex: opts.window }));
  }
  p.push(band(w, d, H - 0.01, 0.02, opts.band, x, z));
  if (opts.roof) p.push(move(box(w - 0.02, 0.012, d - 0.02, opts.roof, H), x, 0, z));
  return p;
}

/** 7. Don Bosco High School: a five-storey cream L, the blue tower with its name, the red playground. */
function donBoscoHigh(): Parts {
  const p: Parts = [];
  p.push(move(box(0.5, 0.012, 0.4, "#c97a4a", 0), -0.12, 0, 0.18));
  p.push(...block({ w: 0.62, d: 0.2, storeys: 5, storey: 0.1, wall: CREAM, band: "#9a9a92", window: GLASS, x: 0.06, z: -0.2 }));
  p.push(...block({ w: 0.2, d: 0.4, storeys: 5, storey: 0.1, wall: CREAM, band: "#9a9a92", window: GLASS, x: 0.28, z: 0.06 }));
  // The tall blue-grey tower (its name is a decal) and its round medallion.
  p.push(move(box(0.1, 0.66, 0.1, "#5a7ea8", 0), 0.16, 0, -0.06));
  p.push(move(painted(new THREE.CircleGeometry(0.03, 12), WHITE), 0.16, 0.6, -0.008));
  // A small statue on a plinth in the playground.
  p.push(move(box(0.05, 0.06, 0.05, STONE, 0), -0.14, 0, 0.18), move(coneFrustum(0.01, 0.016, 0.06, 6, WHITE, 0.06), -0.14, 0, 0.18));
  p.push(...palm(-0.42, -0.12, 0.34), ...palm(-0.38, 0.4, 0.3));
  return p;
}

/** 8. Don Bosco College: a four-storey block, peach walls and mint bands, the white tower with its name and cross, a blue court. */
function donBoscoCollege(): Parts {
  const p: Parts = [];
  p.push(move(box(0.36, 0.01, 0.24, "#3a6fc8", 0), -0.16, 0, 0.22), move(box(0.012, 0.012, 0.22, WHITE, 0.01), -0.16, 0, 0.22));
  p.push(...block({ w: 0.66, d: 0.26, storeys: 4, storey: 0.11, wall: "#f0c4a4", band: "#9fd8b8", window: GLASS, x: 0.06, z: -0.14, roof: "#d8d0c0" }));
  p.push(move(box(0.1, 0.62, 0.1, WHITE, 0), 0.16, 0, 0.02));
  p.push(move(box(0.014, 0.1, 0.014, WHITE, 0.62), 0.16, 0, 0.02), move(box(0.06, 0.014, 0.014, WHITE, 0.67), 0.16, 0, 0.02));
  p.push(...palm(0.4, 0.3, 0.34), ...palm(-0.42, -0.1, 0.3));
  return p;
}

/** 9. Sharada Mandir School: a grey block with skylights, a white block under terracotta, the blue hall, and the football pitch. */
function sharadaMandir(): Parts {
  const p: Parts = [];
  // The wooded hill behind.
  p.push(move(ground([[-0.5, -0.5], [0.5, -0.5], [0.52, -0.3], [-0.52, -0.3]], 0.08, "#6a9a4a", 0), 0, 0, 0));
  p.push(...tree(-0.36, -0.42, 0.26), ...tree(-0.1, -0.44, 0.22), ...tree(0.2, -0.43, 0.26), ...tree(0.42, -0.4, 0.22));
  // The buildings along the back.
  p.push(move(box(0.24, 0.14, 0.18, "#e8e2d4", 0), -0.3, 0, -0.18), move(hipRoof(0.28, 0.22, 0.08, "#7f8288", 0.14), -0.3, 0, -0.18));
  // Round skylights on the roof's front slope: each disc tilted to the slope first, then set on it.
  for (const dx of [-0.06, 0.06]) p.push(move(rotate(painted(new THREE.CircleGeometry(0.018, 10), "#cfe6ef"), -Math.PI / 2 + 0.62, 0, 0), -0.3 + dx, 0.19, -0.132));
  p.push(move(box(0.2, 0.16, 0.16, WHITE, 0), -0.06, 0, -0.2), move(hipRoof(0.24, 0.2, 0.08, TERRACOTTA, 0.16), -0.06, 0, -0.2));
  p.push(...openings({ axis: "x", from: -0.12, to: 0.0, count: 3, face: -0.12, dir: 1, y: 0.03, w: 0.03, h: 0.07, hex: DARK, arch: true }));
  // The big hall under a light-blue gable; its name is a decal on the side.
  p.push(move(box(0.3, 0.2, 0.22, "#d8d4c8", 0), 0.26, 0, -0.17), move(gableRoof(0.34, 0.26, 0.12, "#8fc3e8", 0.2), 0.26, 0, -0.17));
  // The pitch: striped turf, every marking, goals with nets, a ball.
  const PW = 0.82, PD = 0.42, pz = 0.2, py = 0.006;
  for (let i = 0; i < 8; i++) p.push(move(box(PW / 8, 0.006, PD, i % 2 ? GRASS : GRASS_DARK, 0), -PW / 2 + PW / 16 + (i * PW) / 8, 0, pz));
  const line = (w: number, d: number, x: number, z: number): void => void p.push(move(box(w, 0.004, d, WHITE, py), x, 0, z));
  line(PW - 0.04, 0.008, 0, pz - PD / 2 + 0.02);
  line(PW - 0.04, 0.008, 0, pz + PD / 2 - 0.02);
  line(0.008, PD - 0.04, -PW / 2 + 0.02, pz);
  line(0.008, PD - 0.04, PW / 2 - 0.02, pz);
  line(0.008, PD - 0.04, 0, pz);
  p.push(move(ring(0.058, 0.066, WHITE, py + 0.002), 0, 0, pz), move(disc(0.008, WHITE, py + 0.003, 8), 0, 0, pz));
  for (const side of [-1, 1]) {
    const gx = side * (PW / 2 - 0.02);
    line(0.008, 0.2, gx - side * 0.1, pz);
    line(0.1, 0.008, gx - side * 0.05, pz - 0.1);
    line(0.1, 0.008, gx - side * 0.05, pz + 0.1);
    line(0.008, 0.1, gx - side * 0.04, pz);
    line(0.04, 0.008, gx - side * 0.02, pz - 0.05);
    line(0.04, 0.008, gx - side * 0.02, pz + 0.05);
    // The goal: posts, crossbar and a net behind.
    for (const dz of [-0.04, 0.04]) p.push(move(box(0.006, 0.05, 0.006, WHITE, 0), gx + side * 0.006, 0, pz + dz));
    p.push(move(box(0.006, 0.006, 0.086, WHITE, 0.05), gx + side * 0.006, 0, pz));
    p.push(move(box(0.004, 0.05, 0.08, "#e8e8e8", 0), gx + side * 0.03, 0, pz));
  }
  p.push(move(dome(0.012, 0.012, 0.012, WHITE, 0.005), 0.08, 0, pz + 0.05));
  // The boundary wall.
  p.push(move(box(PW + 0.06, 0.04, 0.012, "#cfc8b6", 0), 0, 0, pz + PD / 2 + 0.02));
  for (const side of [-1, 1]) p.push(move(box(0.012, 0.04, PD + 0.04, "#cfc8b6", 0), side * (PW / 2 + 0.03), 0, pz));
  return p;
}

/** 10. Government Polytechnic: a long four-storey block, yellow walls, blue window bands, a blue name board, a lawn. */
function polytechnic(): Parts {
  const p: Parts = [];
  p.push(...block({ w: 0.82, d: 0.26, storeys: 4, storey: 0.11, wall: "#f2d24a", band: "#3a6fc8", window: "#2f5f9a", z: -0.14, roof: "#d8d0c0" }));
  p.push(move(box(0.14, 0.12, 0.08, "#f2d24a", 0), 0, 0, 0.02), move(box(0.07, 0.09, 0.012, DARK, 0), 0, 0, 0.066));
  p.push(move(box(0.16, 0.04, 0.012, "#2f5fb0", 0.12), 0, 0, 0.066));
  p.push(move(box(0.5, 0.008, 0.22, GRASS, 0), 0.08, 0, 0.26));
  p.push(...tree(-0.36, 0.3, 0.24), ...tree(-0.18, 0.36, 0.2), ...tree(0.38, 0.32, 0.22));
  return p;
}

/** 11. Kala Academy: dark laterite walls, a salmon band, a white pergola roof, stepped terraces, the amphitheatre, a jetty. */
function kalaAcademy(): Parts {
  const p: Parts = [];
  // The river at the front edge, and a small jetty into it.
  p.push(move(ground([[-0.55, 0.3], [0.55, 0.3], [0.55, 0.5], [-0.55, 0.5]], 0.006, WATER, 0), 0, 0, 0));
  p.push(move(box(0.06, 0.02, 0.2, "#b89a6a", 0), 0.36, 0, 0.36));
  // The main block.
  p.push(move(box(0.6, 0.18, 0.4, LATERITE, 0), -0.1, 0, -0.06), band(0.6, 0.4, 0.13, 0.03, "#e8907a", -0.1, -0.06));
  p.push(move(box(0.62, 0.012, 0.42, "#f2efe6", 0.18), -0.1, 0, -0.06));
  for (let i = 0; i <= 10; i++) p.push(move(box(0.008, 0.02, 0.4, WHITE, 0.19), -0.4 + i * 0.06, 0, -0.06));
  for (let i = 0; i <= 6; i++) p.push(move(box(0.6, 0.02, 0.008, WHITE, 0.19), -0.1, 0, -0.26 + i * 0.066));
  // Grey stepped terraces on the roof, and the blue strip roof.
  for (let i = 0; i < 3; i++) p.push(move(box(0.2 - i * 0.04, 0.03, 0.08, "#6f7378", 0.2 + i * 0.03), -0.26, 0, -0.18));
  p.push(move(box(0.22, 0.03, 0.05, "#3a6fc8", 0.2), 0.06, 0, -0.14));
  // The fan-shaped open air amphitheatre at one side.
  for (let i = 0; i < 4; i++) {
    const tier = new THREE.CylinderGeometry(0.22 - i * 0.04, 0.22 - i * 0.04, 0.025, 12, 1, false, 0, Math.PI * 0.7);
    tier.translate(0, i * 0.025 + 0.0125, 0);
    p.push(move(painted(tier, i % 2 ? "#a0a4a8" : "#8a8e92"), 0.3, 0, 0.08));
  }
  p.push(...tree(-0.44, 0.22, 0.22), ...tree(0.44, -0.3, 0.24), ...tree(-0.46, -0.32, 0.2));
  return p;
}

/** 12. Goa State Museum: a white and grey block, two rows of glazing, a big red pitched roof, a white name band, a porch. */
function stateMuseum(): Parts {
  const p: Parts = [];
  p.push(move(box(0.64, 0.3, 0.4, "#f2f2ee", 0), 0, 0, -0.06), band(0.64, 0.4, 0.0, 0.04, "#c8ccd0", 0, -0.06));
  for (const y of [0.05, 0.17]) p.push(...openings({ axis: "x", from: -0.27, to: 0.27, count: 8, face: 0.14, y, w: 0.05, h: 0.08, hex: GLASS }));
  p.push(...openings({ axis: "z", from: -0.2, to: 0.08, count: 4, face: 0.32, y: 0.11, w: 0.05, h: 0.1, hex: GLASS }));
  // The white band (the name is a decal) and the big red pitched roof, overhanging at the gable ends; its eave
  // stops at the front wall so the name under it reads from the game's camera.
  p.push(move(box(0.66, 0.05, 0.012, WHITE, 0.25), 0, 0, 0.146));
  p.push(move(gableRoof(0.78, 0.44, 0.22, "#c8423a", 0.3), 0, 0, -0.06));
  // The porch with its own red roof.
  p.push(move(box(0.16, 0.12, 0.1, "#f2f2ee", 0), -0.18, 0, 0.19), move(gableRoof(0.2, 0.14, 0.06, "#c8423a", 0.12), -0.18, 0, 0.19));
  p.push(...palm(0.4, 0.28, 0.34), ...palm(-0.44, -0.2, 0.3));
  return p;
}

/** 13. Campal Garden: a park of shade trees, a pond with three pedal boats, a path, the green arch gate, a red slide. */
function campalGarden(): Parts {
  const p: Parts = [];
  p.push(ground([[-0.62, -0.36], [0, -0.7], [0.62, -0.36], [0.62, 0.36], [0, 0.7], [-0.62, 0.36]], 0.02, GRASS, 0));
  p.push(move(ground([[-0.6, 0.12], [0.45, 0.36], [0.45, 0.44], [-0.6, 0.2]], 0.006, "#d8c49a", 0.02), 0, 0, 0));
  // The pond and its boats.
  p.push(move(painted(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 14), "#4f9ac0"), -0.04, 0.02, -0.1));
  for (const [x, z, hex] of [[-0.12, -0.14, "#e0c040"], [0.02, -0.04, "#c84a3a"], [0.06, -0.18, "#3a6fc8"]] as [number, number, string][]) {
    p.push(move(box(0.05, 0.02, 0.03, hex, 0.03), x, 0, z), move(box(0.02, 0.02, 0.02, WHITE, 0.05), x, 0, z));
  }
  // The green arch gate on the path.
  for (const dx of [-0.07, 0.07]) p.push(move(box(0.02, 0.14, 0.02, "#2f8a4a", 0.02), 0.06 + dx, 0, 0.31));
  const arch = new THREE.TorusGeometry(0.07, 0.012, 4, 10, Math.PI);
  p.push(move(painted(arch, "#2f8a4a"), 0.06, 0.16, 0.31));
  // The red slide.
  p.push(move(box(0.03, 0.12, 0.03, "#d84a3a", 0.02), 0.34, 0, 0.0), move(rotate(box(0.04, 0.012, 0.18, "#d84a3a", 0), 0.6, 0, 0), 0.34, 0.07, 0.06));
  p.push(...tree(-0.44, -0.2, 0.3), ...tree(-0.4, 0.12, 0.26), ...tree(0.36, -0.3, 0.3), ...tree(0.46, 0.18, 0.24), ...tree(0.12, -0.46, 0.26), ...tree(-0.2, 0.46, 0.22), ...tree(0.2, 0.2, 0.22));
  return p;
}

/** 14. Dhempe College: a white U-shaped three-storey block, maroon bands, a blue court in the courtyard, a name board. */
function dhempeCollege(): Parts {
  const p: Parts = [];
  const opts = { storeys: 3, storey: 0.12, wall: WHITE, band: "#7a2a3a", window: "#5a2a32", roof: "#d8d0c0" };
  p.push(...block({ ...opts, w: 0.7, d: 0.18, z: -0.24 }));
  p.push(...block({ ...opts, w: 0.18, d: 0.36, x: -0.26, z: 0.03 }));
  p.push(...block({ ...opts, w: 0.18, d: 0.36, x: 0.26, z: 0.03 }));
  p.push(move(box(0.28, 0.008, 0.3, "#3a6fc8", 0), 0, 0, 0.02), move(box(0.008, 0.01, 0.28, WHITE, 0.008), 0, 0, 0.02));
  // The name board along the top (lettering is a decal).
  p.push(move(box(0.5, 0.05, 0.012, WHITE, 0.36), 0, 0, -0.15));
  p.push(...palm(-0.46, 0.34, 0.32), ...palm(0.44, 0.36, 0.3));
  return p;
}

/** 15. Miramar Beach: the sea on the west with surf, a wide sand strip with umbrellas, casuarinas, the Miramar circle. */
function miramarBeach(): Parts {
  const p: Parts = [];
  // Three strips across the hexagon of ground (corners (0, +-0.7) and (+-0.62, +-0.36)), each cut to its edges.
  const edge = (x: number): number => 0.36 + (0.62 - Math.abs(x)) * (0.34 / 0.62);
  p.push(ground([[-0.62, -0.36], [-0.2, -edge(-0.2)], [-0.2, edge(-0.2)], [-0.62, 0.36]], 0.02, "#3f8fb0", 0));
  for (const x of [-0.28, -0.36, -0.46]) p.push(move(box(0.012, 0.006, 2 * edge(x) - 0.08, "#f2f6f8", 0.02), x, 0, 0));
  p.push(ground([[-0.2, -edge(-0.2)], [0, -0.7], [0.18, -edge(0.18)], [0.18, edge(0.18)], [0, 0.7], [-0.2, edge(-0.2)]], 0.02, "#ecd29a", 0));
  for (const [z, hex] of [[-0.4, "#c8423a"], [-0.05, "#3a6fc8"], [0.3, "#e0c040"]] as [number, string][]) {
    p.push(move(coneFrustum(0.004, 0.006, 0.08, 4, "#8d6b45", 0.02), -0.06, 0, z), move(coneFrustum(0.002, 0.06, 0.03, 8, hex, 0.1), -0.06, 0, z));
  }
  p.push(ground([[0.18, -edge(0.18)], [0.62, -0.36], [0.62, 0.36], [0.18, edge(0.18)]], 0.02, GRASS, 0));
  for (let i = 0; i < 6; i++) p.push(...casuarina(0.24 + (i % 2) * 0.08, -0.5 + i * 0.18, 0.26));
  // The Miramar circle with its fountain, on the town side.
  p.push(move(painted(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16), "#d8ccae"), 0.44, 0.02, 0.14));
  p.push(move(painted(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 12), "#9fc8de"), 0.44, 0.04, 0.14), move(coneFrustum(0.01, 0.03, 0.06, 8, WHITE, 0.055), 0.44, 0, 0.14));
  return p;
}

/** 16. Dona Paula: a laterite headland with trees, the white two-figure statue on its rock, the red jetty with railings and lamps. */
function donaPaula(): Parts {
  const p: Parts = [];
  p.push(ground([[-0.62, -0.36], [0, -0.7], [0.62, -0.36], [0.62, 0.36], [0, 0.7], [-0.62, 0.36]], 0.012, WATER, 0));
  p.push(ground([[-0.5, -0.46], [0.06, -0.52], [0.24, -0.3], [0.1, -0.02], [-0.3, 0.08], [-0.52, -0.1]], 0.16, LATERITE, 0));
  p.push(move(ground([[-0.46, -0.42], [0.04, -0.48], [0.2, -0.29], [0.07, -0.05], [-0.28, 0.04], [-0.48, -0.1]], 0.02, "#7a9a4a", 0.16), 0, 0, 0));
  p.push(...tree(-0.3, -0.3, 0.24).map((g) => move(g, 0, 0.17, 0)), ...tree(-0.08, -0.36, 0.2).map((g) => move(g, 0, 0.17, 0)));
  // The statue's rock at the tip, and the two white figures.
  p.push(move(dome(0.1, 0.07, 0.1, "#8a6a52", 0.0), 0.2, 0, -0.02));
  for (const [dx, h] of [[-0.024, 0.17], [0.024, 0.15]] as [number, number][]) {
    p.push(move(coneFrustum(0.016, 0.026, h, 6, WHITE, 0.125), 0.2 + dx, 0, -0.02), move(dome(0.018, 0.018, 0.018, WHITE, 0.125 + h), 0.2 + dx, 0, -0.02));
  }
  // The L-shaped red viewing jetty, white railings, lamp posts.
  const deck = (w: number, d: number, x: number, z: number): void => void p.push(move(box(w, 0.025, d, "#b04a3a", 0.03), x, 0, z));
  deck(0.08, 0.46, 0.02, 0.24);
  deck(0.34, 0.08, 0.15, 0.45);
  for (const [w, d, x, z] of [[0.006, 0.46, -0.02, 0.24], [0.006, 0.4, 0.06, 0.2], [0.34, 0.006, 0.15, 0.49], [0.28, 0.006, 0.2, 0.41]] as [number, number, number, number][]) p.push(move(box(w, 0.03, d, WHITE, 0.055), x, 0, z));
  for (const [x, z] of [[-0.02, 0.06], [-0.02, 0.3], [0.1, 0.49], [0.3, 0.49]] as [number, number][]) p.push(move(box(0.008, 0.1, 0.008, "#3a3a3a", 0.055), x, 0, z), move(box(0.02, 0.016, 0.02, "#f6e6a0", 0.155), x, 0, z));
  for (const [x, z, r] of [[0.4, 0.1, 0.04], [-0.4, 0.3, 0.035], [0.46, -0.2, 0.03], [-0.1, 0.5, 0.03]] as [number, number, number][]) p.push(move(dome(r, r * 0.7, r, "#6f6a62", 0), x, 0, z));
  return p;
}

/** Every landmark's builder, by its id in the map data. */
const BUILDERS: Record<string, () => Parts> = {
  panjim_church: church,
  idalcao_palace: palace,
  panjim_municipal_market: market,
  institute_menezes_braganza: menezesBraganza,
  mahalaxmi_temple: temple,
  jama_masjid_panaji: mosque,
  don_bosco_high_school: donBoscoHigh,
  don_bosco_college: donBoscoCollege,
  sharada_mandir_school: sharadaMandir,
  government_polytechnic_panaji: polytechnic,
  kala_academy: kalaAcademy,
  goa_state_museum: stateMuseum,
  campal_garden: campalGarden,
  dhempe_college: dhempeCollege,
  miramar_beach: miramarBeach,
  dona_paula_viewpoint: donaPaula
};

/** The landmark ids with their own model. */
export const LANDMARK_IDS: readonly string[] = Object.keys(BUILDERS);

/**
 * Which way each landmark's front (+z) faces, as a turn about y (radians), where its real orientation is known:
 * the church's facade west to Church Square (turned 30 degrees back towards the camera, so its twin towers read side by side), the school's pitch west to the beach, the Kala Academy north-west to
 * the Mandovi. The palace keeps its river side to the north as modelled. Others face the default camera.
 */
export const LANDMARK_FACING: Readonly<Record<string, number>> = {
  panjim_church: -Math.PI / 3,
  sharada_mandir_school: -Math.PI / 2,
  kala_academy: (-3 * Math.PI) / 4
};

/** The merged model for a landmark id, or null when it has none of its own. */
export function landmarkGeometry(id: string): THREE.BufferGeometry | null {
  const builder = BUILDERS[id];
  if (!builder) return null;
  const parts = builder();
  for (const part of parts) if (part.getAttribute("uv")) part.deleteAttribute("uv");
  for (const part of parts) if (!part.getAttribute("normal")) part.computeVertexNormals();
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error(`[landmarks] ${id}: parts do not merge`);
  return merged;
}
