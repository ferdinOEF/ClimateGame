import * as THREE from "three";

/**
 * The small modelling kit the wildlife is built with.
 *
 * Everything here is a SWEEP: a cross-section (a closed loop of points) swept
 * along a path, ring by ring, and joined into one smooth-shaded, indexed,
 * vertex-coloured mesh with a cap at each end. A body is an ellipse swept
 * along the bird's length with a changing size; a wing is an aerofoil swept
 * along the span; a feather is a thin lens swept along its shaft; a leg is a
 * circle swept along the bone. One function, so every part shares the same
 * smooth look and the same winding rule (outward-facing, FrontSide-safe).
 *
 * Colours are written per vertex by a callback that sees the vertex's local
 * position, so plumage patches (a cheek patch, a back stripe, barring) are
 * painted on the shape rather than glued on as extra parts.
 *
 * Built once at start-up; nothing here runs per frame.
 */

/** Writes the point at (along v ∈ [0,1], around u ∈ [0,1)) into `out`. */
export type SectionFn = (v: number, u: number, out: THREE.Vector3) => void;
/** Writes the vertex colour for local position `p` into `out` (use `paint`). */
export type ColorFn = (p: THREE.Vector3, v: number, u: number, out: THREE.Color) => void;

const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _a = new THREE.Color();
const _b = new THREE.Color();

/**
 * Sweeps a closed section along `rings` stations. `segs` points per ring.
 * Normals are smooth (computed from the shared, indexed vertices).
 *
 * Winding: for outward faces, as `u` increases the section must turn the
 * way that makes (along × around) point outward. Every caller in this
 * folder follows the same convention as `ellipseSection` below; `flip`
 * exists for the one-off case and for mirrored copies.
 */
export function sweep(
  rings: number,
  segs: number,
  section: SectionFn,
  color: ColorFn,
  opts: { flip?: boolean; capStart?: boolean; capEnd?: boolean } = {}
): THREE.BufferGeometry {
  const capStart = opts.capStart ?? true;
  const capEnd = opts.capEnd ?? true;
  const vertCount = rings * segs + (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const pos = new Float32Array(vertCount * 3);
  const col = new Float32Array(vertCount * 3);
  const idx: number[] = [];

  for (let i = 0; i < rings; i++) {
    const v = rings === 1 ? 0 : i / (rings - 1);
    for (let j = 0; j < segs; j++) {
      const u = j / segs;
      section(v, u, _p);
      const k = i * segs + j;
      pos[k * 3] = _p.x;
      pos[k * 3 + 1] = _p.y;
      pos[k * 3 + 2] = _p.z;
      color(_p, v, u, _c);
      col[k * 3] = _c.r;
      col[k * 3 + 1] = _c.g;
      col[k * 3 + 2] = _c.b;
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      idx.push(a, c, b, b, c, d);
    }
  }
  let next = rings * segs;
  const cap = (ring: number, start: boolean): void => {
    let cx = 0, cy = 0, cz = 0;
    let r = 0, g = 0, bl = 0;
    for (let j = 0; j < segs; j++) {
      const k = ring * segs + j;
      cx += pos[k * 3]; cy += pos[k * 3 + 1]; cz += pos[k * 3 + 2];
      r += col[k * 3]; g += col[k * 3 + 1]; bl += col[k * 3 + 2];
    }
    const c = next++;
    pos[c * 3] = cx / segs; pos[c * 3 + 1] = cy / segs; pos[c * 3 + 2] = cz / segs;
    col[c * 3] = r / segs; col[c * 3 + 1] = g / segs; col[c * 3 + 2] = bl / segs;
    for (let j = 0; j < segs; j++) {
      const a = ring * segs + j;
      const b = ring * segs + ((j + 1) % segs);
      if (start) idx.push(c, a, b);
      else idx.push(c, b, a);
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(rings - 1, false);

  if (opts.flip) {
    for (let t = 0; t < idx.length; t += 3) {
      const s = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = s;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Mirrors a geometry across the YZ plane (left part -> right part), keeping faces outward. */
export function mirrorX(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.clone();
  g.scale(-1, 1, 1);
  const index = g.getIndex();
  if (index) {
    const arr = index.array as Uint16Array | Uint32Array;
    for (let t = 0; t < arr.length; t += 3) {
      const s = arr[t + 1];
      arr[t + 1] = arr[t + 2];
      arr[t + 2] = s;
    }
    index.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/** Triangles in one geometry. */
export function triangles(g: THREE.BufferGeometry): number {
  const index = g.getIndex();
  return index ? index.count / 3 : (g.getAttribute("position").count / 3);
}

/** Triangles in every mesh under `root` (instanced meshes count once per instance). */
export function countTriangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
      n += triangles(m.geometry) * inst;
    }
  });
  return n;
}

// --- Colour helpers (sRGB hex in, linear working colour out) ---------------

export function paint(out: THREE.Color, hex: number): THREE.Color {
  return out.setHex(hex);
}

/** out = mix(a, b, t), both sRGB hex, t clamped to [0,1]. */
export function mix(out: THREE.Color, a: number, b: number, t: number): THREE.Color {
  _a.setHex(a);
  _b.setHex(b);
  return out.copy(_a).lerp(_b, t < 0 ? 0 : t > 1 ? 1 : t);
}

/** Blends `out` toward hex `b` by t (clamped). */
export function toward(out: THREE.Color, b: number, t: number): THREE.Color {
  _b.setHex(b);
  return out.lerp(_b, t < 0 ? 0 : t > 1 ? 1 : t);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Cheap deterministic hash in [0,1) — for flecks painted per vertex. */
export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// --- Profiles --------------------------------------------------------------

/**
 * A smooth 1-D curve through keyframes (Catmull-Rom over evenly spaced keys).
 * `keys[k]` is the value at v = k / (keys.length - 1).
 */
export function curve(keys: readonly number[]): (v: number) => number {
  const n = keys.length - 1;
  return (v: number): number => {
    const f = Math.min(n - 1e-9, Math.max(0, v * n));
    const i = Math.floor(f);
    const t = f - i;
    const p0 = keys[Math.max(0, i - 1)];
    const p1 = keys[i];
    const p2 = keys[Math.min(n, i + 1)];
    const p3 = keys[Math.min(n, i + 2)];
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
}

/**
 * A body-of-revolution-like section swept along +Z: at each station an
 * ellipse centred at (cx, cy) with half-width w, top half-height `top` and
 * bottom half-height `bot`. u = 0 is the top centre line, u = 0.25 is the
 * +X (left) side. Profiles are functions of v (use `curve`).
 */
export function ellipseSection(p: {
  z: (v: number) => number;
  w: (v: number) => number;
  top: (v: number) => number;
  bot: (v: number) => number;
  cy?: (v: number) => number;
  cx?: (v: number) => number;
}): SectionFn {
  return (v, u, out) => {
    const a = u * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const h = c >= 0 ? p.top(v) : p.bot(v);
    out.set((p.cx ? p.cx(v) : 0) + p.w(v) * s, (p.cy ? p.cy(v) : 0) + h * c, p.z(v));
  };
}

/**
 * An aerofoil section swept along +X (span). At span station v the chord
 * runs from the leading edge at z = le(v) back to le(v) - chord(v). Upper
 * surface first (u 0 -> 0.5, leading -> trailing edge), then lower.
 * `thick` is the maximum half-thickness, `camber` the arch height, `y`
 * an optional dihedral offset, `x` the span position.
 */
export function aerofoilSection(p: {
  x: (v: number) => number;
  le: (v: number) => number;
  chord: (v: number) => number;
  thick: (v: number) => number;
  camber?: (v: number) => number;
  y?: (v: number) => number;
}): SectionFn {
  return (v, u, out) => {
    const upper = u < 0.5;
    const s0 = upper ? u * 2 : (1 - u) * 2; // 0 at leading edge, 1 at trailing edge
    const s = (1 - Math.cos(Math.PI * s0)) / 2; // cosine spacing: more points at the edges
    const t = p.thick(v) * (2.6 * Math.sqrt(s) * (1 - s) + 0.06);
    const cam = p.camber ? p.camber(v) * 4 * s * (1 - s) : 0;
    const y = (p.y ? p.y(v) : 0) + cam + (upper ? t : -t * 0.55);
    out.set(p.x(v), y, p.le(v) - s * p.chord(v));
  };
}

/** A circular tube section along an arbitrary straight axis from a to b, radius r(v). */
export function tubeSection(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: (v: number) => number,
  side = new THREE.Vector3(1, 0, 0)
): SectionFn {
  const axis = b.clone().sub(a).normalize();
  const n1 = side.clone().sub(axis.clone().multiplyScalar(side.dot(axis)));
  if (n1.lengthSq() < 1e-8) n1.set(0, 0, 1);
  n1.normalize();
  const n2 = n1.clone().cross(axis).normalize(); // keeps (axis x around) pointing outward
  const len = a.distanceTo(b);
  return (v, u, out) => {
    const ang = u * Math.PI * 2;
    const rr = r(v);
    out.copy(a).addScaledVector(axis, v * len)
      .addScaledVector(n1, Math.cos(ang) * rr)
      .addScaledVector(n2, Math.sin(ang) * rr);
  };
}

/** A UV-sphere-like ellipsoid (radius rx, ry, rz) centred at origin, built as a sweep along Z. */
export function ellipsoid(rx: number, ry: number, rz: number, rings: number, segs: number, color: ColorFn): THREE.BufferGeometry {
  return sweep(
    rings,
    segs,
    (v, u, out) => {
      const phi = Math.PI * (0.02 + 0.96 * v); // stops just short of the poles; caps close it
      const zz = -Math.cos(phi) * rz;
      const rr = Math.sin(phi);
      const a = u * Math.PI * 2;
      out.set(Math.sin(a) * rx * rr, Math.cos(a) * ry * rr, zz);
    },
    color
  );
}

/** A flat-colour ColorFn. */
export function solid(hex: number): ColorFn {
  return (_p, _v, _u, out) => {
    out.setHex(hex);
  };
}

/** Material for plumage/fur: smooth-shaded, vertex-coloured, lit by the scene's lights. */
export function plumageMaterial(roughness = 0.78, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness,
    metalness: 0,
    side,
    transparent: true,
    opacity: 1
  });
}

/** Glossy dark eye. */
export function eyeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, transparent: true, opacity: 1 });
}

/**
 * Collects every material under `root` once, so a model can fade as one.
 */
export function collectMaterials(root: THREE.Object3D): THREE.Material[] {
  const set = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => set.add(x));
      else if (mat) set.add(mat);
    }
  });
  return [...set];
}

/** Sets opacity on a list of materials (no allocation). */
export function setOpacity(mats: readonly THREE.Material[], a: number): void {
  for (let i = 0; i < mats.length; i++) {
    const m = mats[i];
    m.opacity = a;
  }
}

/**
 * A soft round blob shadow: a disc whose vertex alpha falls from `alpha`
 * at the centre to 0 at the rim. Black, transparent, never writes depth.
 */
export function blobShadow(radius: number, alpha = 0.32): THREE.Mesh {
  const segs = 24;
  const rings = 4;
  const pos: number[] = [0, 0, 0];
  const col: number[] = [0, 0, 0, alpha];
  const idx: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const rr = (r / rings) * radius;
    const a = alpha * Math.pow(1 - r / rings, 1.6);
    for (let s = 0; s < segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(ang) * rr, 0, Math.sin(ang) * rr);
      col.push(0, 0, 0, a);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + (r - 1) * segs + s;
      const b = 1 + (r - 1) * segs + ((s + 1) % segs);
      const c = 1 + r * segs + s;
      const d = 1 + r * segs + ((s + 1) % segs);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 1 });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}
