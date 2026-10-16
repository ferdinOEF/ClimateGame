import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, coneFrustum, rotate, move } from "./primitives3d";

/**
 * Section 14: the seven defences redrawn for Panaji, so each reads at the
 * default zoom as a landscape feature and never as a house. Low-poly and
 * flat-shaded like the rest of the board, about 1.5x the earlier size, each
 * filling its tile, no red anywhere (red is the roofs' and the heat's), and a
 * thin coloured ring on the tile under it: green for the living defences
 * (mangrove, pandanus, dune), light grey for the built ones (seawall,
 * breakwater, small dam), ochre for the khazan.
 *
 * Local frame: a tile has circumradius 1 (pointy-top: flat sides at x = ±√3/2).
 * Local +X is SEAWARD (for the small dam, DOWNSTREAM); the mesh manager turns
 * each instance so +X faces the sea (or runs with the river) on its tile.
 *
 * Every vertex carries two extra attributes the defence shader reads (see
 * `defenceMaterial.ts`), so all motion runs on the GPU with one time uniform
 * and no draw calls of its own:
 *   aSway — how far this vertex bends with the breeze and the storm (0 rigid,
 *           1 a leaf tip);
 *   aPart — what kind of surface it is (PART below): water shimmers, foam
 *           pulses, the sluice gate rises and falls, a spillway runs, the
 *           ring draws itself in.
 * Colours are authored as they should render: these meshes are tinted white
 * (`SELF_COLOURED`), not multiplied by a palette hue.
 */
export const PART = {
  solid: 0,
  foliage: 1,
  water: 2,
  foam: 3,
  gate: 4,
  spill: 5,
  ring: 6,
  grass: 7
} as const;

export const DEFENCE_IDS = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"] as const;

const RING = { nature: "#6fcf7c", built: "#dfe3e0", khazan: "#d39a3a" } as const;
const RING_OF: Record<string, keyof typeof RING> = {
  mangrove: "nature",
  sandy_vegetation: "nature",
  dune: "nature",
  seawall: "built",
  breakwater: "built",
  small_dam: "built",
  khazan: "khazan"
};

const SQRT3_2 = Math.sqrt(3) / 2;

/** Keeps position and colour only (so parts of every kind merge), then tags each vertex with its sway and part. */
function tag(g: THREE.BufferGeometry, sway: number | ((p: THREE.Vector3) => number), part: number): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  const position = flat.getAttribute("position");
  out.setAttribute("position", position.clone());
  const color = flat.getAttribute("color");
  out.setAttribute("color", color ? color.clone() : new THREE.BufferAttribute(new Float32Array(position.count * 3).fill(1), 3));
  const swayArr = new Float32Array(position.count);
  const partArr = new Float32Array(position.count).fill(part);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    swayArr[i] = typeof sway === "number" ? sway : sway(v);
  }
  out.setAttribute("aSway", new THREE.BufferAttribute(swayArr, 1));
  out.setAttribute("aPart", new THREE.BufferAttribute(partArr, 1));
  return out;
}

/** A flat triangle list from raw positions, one colour. */
function triangles(positions: number[], color: string): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const c = new THREE.Color(color);
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A tube along a smooth curve: roots, limbs. */
function tube(points: THREE.Vector3[], radius: number, color: string, segments = 5, radial = 4): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  const flat = g.toNonIndexed();
  const c = new THREE.Color(color);
  const count = flat.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return flat;
}

/** A low-poly blob (icosahedron, detail 1), squashed: canopy masses, rocks, fruit. */
function blob(rx: number, ry: number, rz: number, color: string, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.scale(rx, ry, rz);
  return tag(paintAll(g, color), 0, PART.solid);
}

function paintAll(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const count = flat.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return flat;
}

/**
 * The ring on the tile under a defence: a thin hexagonal band just inside
 * the tile's edge, lifted a hair above the ground. Drawn in by the shader on
 * a build (its angle is read from the local position).
 */
function ring(color: string): THREE.BufferGeometry {
  const outer = 0.9;
  const inner = 0.865;
  // Above the sea's animated surface on a coast tile, so the ring shows round a seawall or breakwater too.
  const y = 0.07;
  const pos: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a0 = (Math.PI / 180) * (60 * i - 30);
    const a1 = (Math.PI / 180) * (60 * (i + 1) - 30);
    const o0 = [Math.cos(a0) * outer, y, Math.sin(a0) * outer];
    const o1 = [Math.cos(a1) * outer, y, Math.sin(a1) * outer];
    const i0 = [Math.cos(a0) * inner, y, Math.sin(a0) * inner];
    const i1 = [Math.cos(a1) * inner, y, Math.sin(a1) * inner];
    pos.push(...o0, ...i1, ...o1, ...o0, ...i0, ...i1);
  }
  return tag(triangles(pos, color), 0, PART.ring);
}

/** A flat patch over the part of the hex where x ≥ fromX (the sea in front of a wall): its outline follows the tile's edge. */
function hexStrip(fromX: number, toX: number, y: number, color: string, part: number): THREE.BufferGeometry {
  // The hex's half-height at x (pointy-top, circumradius 1).
  const half = (x: number) => 1 - Math.abs(x) / Math.sqrt(3);
  const steps = 3;
  const pos: number[] = [];
  for (let i = 0; i < steps; i++) {
    const x0 = fromX + ((toX - fromX) * i) / steps;
    const x1 = fromX + ((toX - fromX) * (i + 1)) / steps;
    const h0 = half(x0) * 0.92;
    const h1 = half(x1) * 0.92;
    pos.push(x0, y, -h0, x0, y, h0, x1, y, h1, x0, y, -h0, x1, y, h1, x1, y, -h1);
  }
  return tag(triangles(pos, color), 0, part);
}

// ---------------------------------------------------------------------------
// Mangrove: 3 clumps of dark, dense, rounded canopy on visible brown arching
// stilt roots over the wetland water. The roots are the signature.
// ---------------------------------------------------------------------------
function mangroveClump(size: number, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const crown = 0.5 * size;
  // Stilt roots: arching out and down from under the canopy to the water.
  const rootCount = 7;
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + seed * 0.7;
    const reach = (0.24 + 0.05 * Math.sin(i * 2.3 + seed)) * size;
    const top = new THREE.Vector3(Math.cos(a) * 0.04 * size, crown * 0.92, Math.sin(a) * 0.04 * size);
    const knee = new THREE.Vector3(Math.cos(a) * reach * 0.72, crown * 0.62, Math.sin(a) * reach * 0.72);
    const foot = new THREE.Vector3(Math.cos(a) * reach, -0.02, Math.sin(a) * reach);
    parts.push(tag(tube([top, knee, foot], 0.017 * size, i % 2 ? "#6b4a2c" : "#7a5634", 5, 4), 0, PART.solid));
  }
  // A short central trunk.
  parts.push(tag(coneFrustum(0.03 * size, 0.045 * size, crown, 5, "#5d4128", 0), 0, PART.solid));
  // Canopy: overlapping dark rounded masses. Sway grows with height.
  const canopy = (dx: number, dz: number, r: number, h: number, color: string) => {
    const g = blob(r * size, r * 0.72 * size, r * size, color);
    move(g, dx * size, crown + h * size, dz * size);
    const sway = g.getAttribute("aSway");
    const p = g.getAttribute("position");
    for (let i = 0; i < sway.count; i++) sway.setX(i, Math.min(1, Math.max(0.25, (p.getY(i) - crown * 0.8) / (0.45 * size))));
    const part = g.getAttribute("aPart");
    for (let i = 0; i < part.count; i++) part.setX(i, PART.foliage);
    return g;
  };
  parts.push(canopy(0, 0, 0.27, 0.12, "#1f4f2e"));
  parts.push(canopy(-0.13, 0.08, 0.2, 0.08, "#24603a"));
  parts.push(canopy(0.12, -0.07, 0.19, 0.1, "#1b4628"));
  parts.push(canopy(0.04, 0.12, 0.17, 0.2, "#2f7044"));
  // Tide ripples round the roots (foam pulses in the shader).
  const ripple: number[] = [];
  const r0 = 0.285 * size;
  const r1 = 0.3 * size;
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2;
    const a1 = ((i + 1) / 10) * Math.PI * 2;
    ripple.push(Math.cos(a0) * r1, 0.016, Math.sin(a0) * r1, Math.cos(a1) * r0, 0.016, Math.sin(a1) * r0, Math.cos(a1) * r1, 0.016, Math.sin(a1) * r1);
    ripple.push(Math.cos(a0) * r1, 0.016, Math.sin(a0) * r1, Math.cos(a0) * r0, 0.016, Math.sin(a0) * r0, Math.cos(a1) * r0, 0.016, Math.sin(a1) * r0);
  }
  parts.push(tag(triangles(ripple, "#9fcfc6"), 0, PART.foam));
  return parts;
}

function mangroveGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spots: [number, number, number][] = [
    [0.36, -0.12, 1.0],
    [-0.22, -0.34, 0.92],
    [-0.16, 0.36, 0.96]
  ];
  spots.forEach(([x, z, s], i) => {
    for (const g of mangroveClump(s, i)) parts.push(move(g, x, 0, z));
  });
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Pandanus: a branching screw-pine, never a palm. 2–3 trees, each a trunk
// forking into 4–5 limbs at different heights (a candelabra), each limb
// ending in its own tuft of long thin strap leaves that arch out and droop at
// the tips, in three greens; a few yellow-green fruits under some tufts; and a
// skirt of thin prop roots fanning from low on the trunk to the sand.
// ---------------------------------------------------------------------------
const LEAF_GREENS = ["#2f6a34", "#4c8c3a", "#6fa24a"];

/** One strap leaf from `base`, arching out along `dir` and drooping at the tip: a 4-segment ribbon. */
function strapLeaf(base: THREE.Vector3, dir: THREE.Vector3, length: number, width: number, lift: number, color: string): THREE.BufferGeometry {
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(width / 2);
  const pts: THREE.Vector3[] = [];
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Up and out first, then over and down: a parabola in the leaf's plane.
    const out = dir.clone().multiplyScalar(length * t);
    const up = lift * (t * 1.4 - t * t * 1.9) * length;
    pts.push(base.clone().add(out).add(new THREE.Vector3(0, up, 0)));
  }
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const taper0 = 1 - (i / n) * 0.75;
    const taper1 = 1 - ((i + 1) / n) * 0.75;
    const a = pts[i].clone().add(side.clone().multiplyScalar(taper0));
    const b = pts[i].clone().sub(side.clone().multiplyScalar(taper0));
    const c = pts[i + 1].clone().add(side.clone().multiplyScalar(taper1));
    const d = pts[i + 1].clone().sub(side.clone().multiplyScalar(taper1));
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
  }
  const g = triangles(pos, color);
  // The tip bends most; the base hardly at all.
  return tag(g, (p) => Math.min(1, p.distanceTo(base) / length), PART.foliage);
}

function pandanusTree(height: number, seed: number): THREE.BufferGeometry[] {
  const rnd = (k: number) => {
    const x = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const parts: THREE.BufferGeometry[] = [];
  const lean = new THREE.Vector3((rnd(1) - 0.5) * 0.06, height, (rnd(2) - 0.5) * 0.06);
  const trunkTop = lean.clone().multiplyScalar(0.55);
  parts.push(tag(tube([new THREE.Vector3(0, 0.0, 0), trunkTop.clone().multiplyScalar(0.5), trunkTop], 0.03, "#8a7454", 3, 5), 0.05, PART.solid));
  // Prop roots: 8 thin struts from low on the trunk out to the sand.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd(3 + i) * 0.4;
    const from = new THREE.Vector3(0, 0.08 + rnd(20 + i) * 0.05, 0);
    const to = new THREE.Vector3(Math.cos(a) * 0.1, -0.01, Math.sin(a) * 0.1);
    parts.push(tag(tube([from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.01, 0)), to], 0.007, "#9a845f", 2, 3), 0, PART.solid));
  }
  // The candelabra: 4–5 limbs forking at different heights, each ending in a tuft.
  const limbs = 4 + (rnd(4) > 0.5 ? 1 : 0);
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + rnd(5 + l) * 0.6;
    const forkAt = trunkTop.clone().multiplyScalar(0.6 + 0.4 * rnd(9 + l));
    const reach = 0.15 + 0.09 * rnd(13 + l);
    const rise = 0.2 + 0.22 * rnd(17 + l);
    const elbow = forkAt.clone().add(new THREE.Vector3(Math.cos(a) * reach * 0.6, rise * 0.55, Math.sin(a) * reach * 0.6));
    const tip = forkAt.clone().add(new THREE.Vector3(Math.cos(a) * reach, rise, Math.sin(a) * reach));
    parts.push(tag(tube([forkAt, elbow, tip], 0.014, "#806a4b", 3, 4), 0.2, PART.solid));
    // The tuft: 14–16 straps radiating from the limb's tip.
    const leaves = 14 + Math.floor(rnd(30 + l) * 3);
    for (let k = 0; k < leaves; k++) {
      const yaw = (k / leaves) * Math.PI * 2 + rnd(40 + k) * 0.3;
      const tilt = 0.25 + rnd(60 + k) * 0.5;
      const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).normalize();
      const length = 0.13 + rnd(80 + k + l) * 0.06;
      parts.push(strapLeaf(tip, dir, length, 0.018, 0.55 + tilt, LEAF_GREENS[(k + l) % 3]));
    }
    // A pineapple-like fruit hanging under some tufts.
    if (l % 2 === 0) {
      const fruit = blob(0.034, 0.045, 0.034, "#c9c44c", 0);
      move(fruit, tip.x + 0.01, tip.y - 0.06, tip.z);
      const s = fruit.getAttribute("aSway");
      for (let i = 0; i < s.count; i++) s.setX(i, 0.3);
      parts.push(fruit);
    }
  }
  return parts;
}

function pandanusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trees: [number, number, number][] = [
    [0.3, -0.18, 0.95],
    [-0.32, -0.24, 0.8],
    [-0.02, 0.36, 0.88]
  ];
  trees.forEach(([x, z, h], i) => {
    for (const g of pandanusTree(h, i + 1)) parts.push(move(g, x, 0, z));
  });
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Seawall: a straight coursed stone wall along the tile's seaward edge, sea
// in front of it inside the tile. Staggered block courses on its face, a
// pale cap with a small curved wave-return lip on the sea side, a darker
// stepped toe at the bottom. A continuous built wall, unlike the
// breakwater's rock pile.
// ---------------------------------------------------------------------------
function seawallGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const back = 0.34;
  const face = 0.54;
  const length = 1.36;
  const height = 0.46;
  const courses = 4;
  const stones = ["#a4a39b", "#97968e", "#b0aea4", "#8d8c85"];
  for (let c = 0; c < courses; c++) {
    const h = height / courses;
    const blockLen = length / 6;
    const offset = c % 2 ? blockLen / 2 : 0;
    for (let b = -1; b < 7; b++) {
      const z0 = Math.max(-length / 2, -length / 2 + b * blockLen + offset);
      const z1 = Math.min(length / 2, -length / 2 + (b + 1) * blockLen + offset);
      if (z1 - z0 < 0.02) continue;
      // A hair of gap between blocks so the courses read.
      const g = box(face - back, h - 0.012, z1 - z0 - 0.012, stones[(b + c * 3 + 8) % stones.length], c * h + 0.006);
      move(g, (face + back) / 2, 0, (z0 + z1) / 2);
      parts.push(tag(g, 0, PART.solid));
    }
  }
  // Mortar behind the gaps.
  const core = box(face - back - 0.02, height, length - 0.01, "#6c6b65", 0);
  move(core, (face + back) / 2 - 0.004, 0, 0);
  parts.push(tag(core, 0, PART.solid));
  // The cap, slightly wider than the wall.
  const cap = box(face - back + 0.05, 0.05, length + 0.02, "#dcd8cb", height);
  move(cap, (face + back) / 2 + 0.01, 0, 0);
  parts.push(tag(cap, 0, PART.solid));
  // The wave-return lip: a quarter round curling seaward off the cap.
  const lip = new THREE.CylinderGeometry(0.07, 0.07, length + 0.02, 6, 1, true, 0, Math.PI / 2);
  lip.rotateX(Math.PI / 2);
  lip.rotateZ(Math.PI);
  lip.translate(face + 0.03, height + 0.05, 0);
  parts.push(tag(paintAll(lip, "#cfcabb"), 0, PART.solid));
  // The stepped toe at the foot, seaward.
  const toe1 = box(0.08, 0.08, length, "#6e706a", 0);
  move(toe1, face + 0.04, 0, 0);
  const toe2 = box(0.06, 0.04, length - 0.04, "#7c7e77", 0);
  move(toe2, face + 0.11, 0, 0);
  parts.push(tag(toe1, 0, PART.solid), tag(toe2, 0, PART.solid));
  // Sea in front of the wall, inside the tile, and foam lapping at its foot.
  parts.push(hexStrip(face + 0.14, 0.86, 0.02, "#2c7f9a", PART.water));
  const foam = box(0.05, 0.012, length - 0.06, "#eef7f6", 0.022);
  move(foam, face + 0.17, 0, 0);
  parts.push(tag(foam, 0, PART.foam));
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Breakwater: a line of grey armour blocks out in the sea, white foam on the
// seaward side. Grey and white against the sea's blue-green, so it stands out.
// ---------------------------------------------------------------------------
function breakwaterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const greys = ["#8f9391", "#a6aaa8", "#7c807e", "#b4b7b4", "#969a97"];
  let k = 0;
  for (let row = 0; row < 2; row++) {
    const count = row === 0 ? 8 : 7;
    for (let i = 0; i < count; i++) {
      const z = -0.72 + (1.44 * (i + (row ? 0.5 : 0))) / (count - 1 + (row ? 0 : 0));
      if (Math.abs(z) > 0.74) continue;
      const s = 0.13 + ((k * 37) % 7) * 0.008;
      const rock = new THREE.DodecahedronGeometry(s, 0);
      rock.scale(1, 0.85 + ((k * 13) % 5) * 0.06, 1);
      rock.rotateX(k * 0.7);
      rock.rotateY(k * 1.3);
      rock.translate(row === 0 ? 0.06 : -0.1, s * (row === 0 ? 0.75 : 1.1), z);
      parts.push(tag(paintAll(rock, greys[k % greys.length]), 0, PART.solid));
      k++;
    }
  }
  // Foam on the seaward side: a broken band of low irregular flecks.
  const fleck: number[] = [];
  for (let i = 0; i < 16; i++) {
    const z = -0.68 + i * 0.09;
    const x = 0.24 + 0.05 * Math.sin(i * 2.7);
    const r = 0.035 + 0.02 * Math.abs(Math.sin(i * 1.3));
    fleck.push(x, 0.02, z - r, x - r, 0.02, z + r * 0.6, x + r * 1.2, 0.02, z + r * 0.4);
  }
  parts.push(tag(triangles(fleck, "#eef7f6"), 0, PART.foam));
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Dune: a smooth two-humped sand ridge, lighter on the windward (sea) face,
// with grass tufts on the crest.
// ---------------------------------------------------------------------------
function duneGeometry(): THREE.BufferGeometry {
  const nx = 9;
  const nz = 11;
  const xs = (i: number) => -0.62 + (1.24 * i) / (nx - 1);
  const zs = (j: number) => -0.74 + (1.48 * j) / (nz - 1);
  const height = (x: number, z: number): number => {
    // Two humps along the ridge; across it, a long gentle windward slope (+x) and a short steep lee.
    // Two crests with a clear saddle between them.
    const humps = 0.38 * Math.exp(-((z - 0.36) ** 2) / 0.03) + 0.32 * Math.exp(-((z + 0.36) ** 2) / 0.034) + 0.02;
    const across = x >= 0 ? Math.max(0, 1 - x / 0.62) ** 1.4 : Math.max(0, 1 + x / 0.42) ** 0.8;
    const fade = Math.max(0, 1 - (Math.abs(z) / 0.78) ** 4);
    return humps * across * fade;
  };
  const pos: number[] = [];
  const col: number[] = [];
  const windward = new THREE.Color("#f0dca6");
  const lee = new THREE.Color("#d2ae6c");
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nz - 1; j++) {
      const quad = [
        [xs(i), zs(j)],
        [xs(i), zs(j + 1)],
        [xs(i + 1), zs(j + 1)],
        [xs(i + 1), zs(j)]
      ];
      for (const tri of [
        [0, 1, 2],
        [0, 2, 3]
      ]) {
        let cx = 0;
        for (const t of tri) {
          const [x, z] = quad[t];
          pos.push(x, height(x, z), z);
          cx += x;
        }
        const c = lee.clone().lerp(windward, Math.min(1, Math.max(0, (cx / 3 + 0.2) / 0.5)));
        for (let t = 0; t < 3; t++) col.push(c.r, c.g, c.b);
      }
    }
  }
  const sand = new THREE.BufferGeometry();
  sand.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  sand.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const parts: THREE.BufferGeometry[] = [tag(sand, 0, PART.solid)];
  // Grass tufts along the crest: thin blades that sway.
  const tufts: [number, number][] = [
    [0.0, 0.34],
    [-0.1, 0.26],
    [0.1, 0.4],
    [0.02, -0.34],
    [-0.12, -0.28],
    [0.12, -0.42],
    [-0.05, 0.02],
    [0.18, 0.1],
    [-0.2, -0.05]
  ];
  tufts.forEach(([x, z], t) => {
    const y = height(x, z) - 0.01;
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2 + t;
      const lean = 0.05;
      const tipX = x + Math.cos(a) * lean;
      const tipZ = z + Math.sin(a) * lean;
      const w = 0.016;
      const g = triangles([x - w * Math.sin(a), y, z + w * Math.cos(a), x + w * Math.sin(a), y, z - w * Math.cos(a), tipX, y + 0.17 + 0.04 * (b % 2), tipZ], b % 2 ? "#5f8a33" : "#7fa547");
      parts.push(tag(g, (p) => Math.min(1, (p.y - y) / 0.18), PART.grass));
    }
  });
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Khazan: the owner's earlier design (STEP_PROMPT_icons.md and the legibility
// pass), restored: an earthen bund ring (#a9793f), lower on the camera-facing
// side so the inside shows; inside, a pond half (#4a90a4) and a paddy half
// with ridge rows (#3f6b3a and #6fa24a alternating); a grey slatted sluice
// gate (#8a8f91) at the front. Only the size, the ochre ring and the motion
// are new. The colours render as written here: these meshes are not tinted
// by the palette any more, which is what had pushed the water to cyan.
// ---------------------------------------------------------------------------
function khazanGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bund = "#a9793f";
  const rx = 0.66;
  const rz = 0.62;
  const segments = 14;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    // +z is towards the camera: the bund is lowest there.
    const front = Math.max(0, Math.sin(mid));
    const h = 0.17 - 0.11 * front;
    const len = Math.hypot(Math.cos(a1) * rx - Math.cos(a0) * rx, Math.sin(a1) * rz - Math.sin(a0) * rz) + 0.03;
    const seg = new THREE.BoxGeometry(len, h, 0.12);
    // A slight batter: narrower at the top.
    const p = seg.getAttribute("position");
    for (let v = 0; v < p.count; v++) if (p.getY(v) > 0) p.setZ(v, p.getZ(v) * 0.6);
    seg.translate(0, h / 2, 0);
    seg.rotateY(-mid - Math.PI / 2);
    seg.translate(Math.cos(mid) * rx, 0, Math.sin(mid) * rz);
    parts.push(tag(paintAll(seg, bund), 0, PART.solid));
  }
  // The pond half (west, −x) and the paddy half (east, +x).
  const inside: number[] = [];
  const insideP: number[] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI / 2 + (i / n) * Math.PI;
    const a1 = Math.PI / 2 + ((i + 1) / n) * Math.PI;
    inside.push(0, 0.03, 0, Math.cos(a1) * (rx - 0.07), 0.03, Math.sin(a1) * (rz - 0.07), Math.cos(a0) * (rx - 0.07), 0.03, Math.sin(a0) * (rz - 0.07));
  }
  parts.push(tag(triangles(inside, "#4a90a4"), 0, PART.water));
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i / n) * Math.PI;
    const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI;
    insideP.push(0, 0.026, 0, Math.cos(a1) * (rx - 0.07), 0.026, Math.sin(a1) * (rz - 0.07), Math.cos(a0) * (rx - 0.07), 0.026, Math.sin(a0) * (rz - 0.07));
  }
  parts.push(tag(triangles(insideP, "#3f6b3a"), 0, PART.solid));
  // Paddy ridge rows, alternating greens, running north–south.
  for (let r = 0; r < 5; r++) {
    const x = 0.08 + r * 0.11;
    const half = (rz - 0.1) * Math.sqrt(Math.max(0, 1 - (x / (rx - 0.08)) ** 2));
    if (half < 0.05) continue;
    const row = box(0.05, 0.035, half * 2, r % 2 ? "#3f6b3a" : "#6fa24a", 0.026);
    move(row, x, 0, 0);
    parts.push(tag(row, 0.15, PART.solid));
  }
  // The sluice gate at the front: two posts and a slatted panel that rises and falls.
  const gz = rz + 0.02;
  for (const side of [-1, 1]) {
    const post = box(0.04, 0.2, 0.06, "#7b7f81", 0);
    move(post, side * 0.1, 0, gz);
    parts.push(tag(post, 0, PART.solid));
  }
  const panel = box(0.17, 0.12, 0.03, "#8a8f91", 0.03);
  move(panel, 0, 0, gz);
  parts.push(tag(panel, 0, PART.gate));
  for (let i = 0; i < 4; i++) {
    const slat = box(0.012, 0.11, 0.012, "#6a6e70", 0.035);
    move(slat, -0.06 + i * 0.04, 0, gz + 0.02);
    parts.push(tag(slat, 0, PART.gate));
  }
  // A trickle running out under the gate.
  const trickle = box(0.08, 0.008, 0.16, "#7cc2d4", 0.012);
  move(trickle, 0, 0, gz + 0.1);
  parts.push(tag(trickle, 0, PART.spill));
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Small dam: a concrete weir across the river with a blue spillway notch,
// the water upstream a little higher, and white water below it. Local +x is
// downstream.
// ---------------------------------------------------------------------------
function smallDamGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const length = 1.3;
  const height = 0.24;
  const notch = 0.26;
  // The weir in two halves either side of the notch.
  for (const side of [-1, 1]) {
    const seg = (length - notch) / 2;
    const half = box(0.16, height, seg, "#bdbcb4", 0);
    move(half, 0, 0, side * (notch / 2 + seg / 2));
    parts.push(tag(half, 0, PART.solid));
    const crest = box(0.18, 0.025, seg, "#d6d5cd", height);
    move(crest, 0, 0, side * (notch / 2 + seg / 2));
    parts.push(tag(crest, 0, PART.solid));
    const abutment = box(0.26, height + 0.06, 0.1, "#a7a69e", 0);
    move(abutment, -0.02, 0, side * (length / 2 + 0.03));
    parts.push(tag(abutment, 0, PART.solid));
  }
  // The notch sill, lower.
  const sill = box(0.16, height - 0.08, notch, "#a9a8a0", 0);
  parts.push(tag(sill, 0, PART.solid));
  // Upstream water, held higher than the river below.
  const pool = box(0.36, 0.02, length - 0.12, "#4f8fab", height - 0.11);
  move(pool, -0.26, 0, 0);
  parts.push(tag(pool, 0, PART.water));
  // The spillway: blue water running over the notch and down the face.
  const spillPos: number[] = [];
  const top = height - 0.07;
  const z0 = -notch / 2 + 0.01;
  const z1 = notch / 2 - 0.01;
  spillPos.push(-0.08, top, z0, -0.08, top, z1, 0.09, top, z1, -0.08, top, z0, 0.09, top, z1, 0.09, top, z0);
  spillPos.push(0.09, top, z0, 0.09, top, z1, 0.26, 0.03, z1, 0.09, top, z0, 0.26, 0.03, z1, 0.26, 0.03, z0);
  parts.push(tag(triangles(spillPos, "#4a90a4"), 0, PART.spill));
  // White water below the weir: flecks fanning out from the spillway.
  const white: number[] = [];
  for (let i = 0; i < 12; i++) {
    const x = 0.28 + (i % 4) * 0.07;
    const z = (i - 5.5) * 0.045 * (1 + (i % 4) * 0.4);
    const r = 0.03;
    white.push(x - r, 0.03, z - r, x - r * 0.4, 0.03, z + r, x + r, 0.03, z);
  }
  parts.push(tag(triangles(white, "#f2f8f8"), 0, PART.foam));
  return mergeGeometries(parts);
}

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  mangrove: mangroveGeometry,
  sandy_vegetation: pandanusGeometry,
  seawall: seawallGeometry,
  breakwater: breakwaterGeometry,
  dune: duneGeometry,
  khazan: khazanGeometry,
  small_dam: smallDamGeometry
};

/** The Panaji model of a defence, with its ring, or null for anything else (houses keep theirs, and get no ring). */
export function createDefenceGeometry(elementId: string): THREE.BufferGeometry | null {
  const build = BUILDERS[elementId];
  if (!build) return null;
  const merged = mergeGeometries([build(), ring(RING[RING_OF[elementId]])]);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/** Triangles per defence model (with its ring), for the QA report. */
export function defenceTriangleCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of DEFENCE_IDS) out[id] = createDefenceGeometry(id)!.getAttribute("position").count / 3;
  return out;
}

/**
 * The rotation about Y that turns a model's local +X (seaward) towards (dx, dz),
 * snapped to a sixth of a turn: the hex is the same under those turns, so the
 * ring stays on the tile's outline and a seawall stands along a real tile edge.
 */
export function facingAngle(dx: number, dz: number): number {
  const step = Math.PI / 3;
  return Math.round(Math.atan2(-dz, dx) / step) * step;
}

export const DEFENCE_HALF_WIDTH = SQRT3_2;
