import * as THREE from "three";
import { aerofoilSection, curve, ellipsoid, ellipseSection, mix, paint, toward, plumageMaterial, smoothstep, solid, sweep, tubeSection, type SectionFn } from "./kit";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Khazan pond life — a small silver fish and a prawn — and the splash
 * rings and droplets every water moment uses.
 *
 * Both animals are modelled facing +Z with length 1 and scaled on use. They
 * are ambience, not identification: the fish is a generic small silvery
 * fish of the kind that lives in the khazans' brackish water (no species
 * claim), the prawn a translucent penaeid-style prawn.
 */

const FISH_BACK = 0x5f7a86;
const FISH_SIDE = 0xdde6eb;
const FISH_BELLY = 0xf1f4f5;
const FISH_FIN = 0x9fb0b8;

/** A small silver fish, ~400 triangles, merged into one geometry. */
export function fishGeometry(): THREE.BufferGeometry {
  const w = curve([0.02, 0.06, 0.085, 0.095, 0.09, 0.07, 0.04, 0.02, 0.014]);
  const top = curve([0.025, 0.08, 0.125, 0.145, 0.14, 0.105, 0.06, 0.03, 0.022]);
  const bot = curve([0.02, 0.065, 0.1, 0.12, 0.115, 0.085, 0.045, 0.024, 0.018]);
  // Swept tail (v=0) -> snout (v=1); the shape is listed snout-first above, so reverse.
  const body = sweep(
    16,
    12,
    ellipseSection({ z: (v) => -0.42 + v * 0.92, w: (v) => w(1 - v), top: (v) => top(1 - v), bot: (v) => bot(1 - v) }),
    (p, _v, _u, out) => {
      // Countershaded: dark back, silver flank, white belly; a dark eye.
      const h = p.y;
      if (h > 0.05) mix(out, FISH_SIDE, FISH_BACK, smoothstep(0.05, 0.12, h));
      else mix(out, FISH_SIDE, FISH_BELLY, smoothstep(0.0, -0.08, h));
      // A faint darker line along the flank.
      if (Math.abs(h - 0.035) < 0.008) toward(out, 0x8fa3ad, 0.5);
      const ex = Math.abs(p.x) > 0.03 ? 1 : 0;
      const d = Math.hypot(p.y - 0.035, p.z - 0.37);
      if (ex && d < 0.035) paint(out, d < 0.022 ? 0x111418 : 0xe8e2c8);
    }
  );
  const fin = (span: number, chord: number) =>
    sweep(
      5,
      8,
      aerofoilSection({ x: (v) => v * span, le: (v) => -0.2 * v * chord, chord: (v) => chord * (1 - 0.55 * v), thick: () => 0.006 }),
      solid(FISH_FIN)
    );
  // Forked tail: two lobes, angled up and down, at the tail end.
  const upper = fin(0.15, 0.09);
  upper.rotateZ(Math.PI / 2 - 0.75);
  upper.rotateX(-0.35);
  upper.translate(0, 0.005, -0.39);
  const lower = fin(0.15, 0.09);
  lower.rotateZ(-Math.PI / 2 + 0.75);
  lower.rotateX(0.35);
  lower.translate(0, -0.005, -0.39);
  const dorsal = fin(0.09, 0.16);
  dorsal.rotateZ(Math.PI / 2);
  dorsal.translate(0, 0.12, 0.08);
  const g = mergeGeometries([body, upper, lower, dorsal]);
  g.computeBoundingSphere();
  return g;
}

const PRAWN_BODY = 0xe8d8ca;
const PRAWN_BAND = 0xc4a592;
const PRAWN_TAIL = 0xc77a5c;

/** A prawn, ~900 triangles: curled segmented abdomen, carapace, rostrum, fan tail, legs, long antennae. */
export function prawnGeometry(): THREE.BufferGeometry {
  // Centre line: an arc curling down at the tail. v = 0 tail, v = 1 head.
  const cz = (v: number) => -0.42 + v * 0.8;
  const cyOf = (v: number) => -0.3 * Math.pow(1 - v, 2.2) + 0.02 * v;
  const radius = curve([0.035, 0.05, 0.065, 0.075, 0.085, 0.09, 0.095, 0.095, 0.085, 0.06]);
  const segments = 6;
  const section: SectionFn = (v, u, out) => {
    const a = u * Math.PI * 2;
    // Abdomen segments: each slightly swollen at its back edge.
    const seg = v < 0.6 ? 1 + 0.06 * Math.pow(Math.sin(((v / 0.6) * segments) * Math.PI), 2) : 1;
    const r = radius(v) * seg;
    out.set(Math.sin(a) * r * 0.85, cyOf(v) + Math.cos(a) * r, cz(v));
  };
  const body = sweep(24, 10, section, (p, v, _u, out) => {
    const band = v < 0.6 ? Math.pow(Math.abs(Math.cos(((v / 0.6) * segments) * Math.PI)), 8) : 0;
    mix(out, PRAWN_BODY, PRAWN_BAND, band * 0.8 + (p.y > cyOf(v) ? 0.15 : 0));
    if (v < 0.06) mix(out, PRAWN_BODY, PRAWN_TAIL, 0.6);
  });
  const parts: THREE.BufferGeometry[] = [body];
  // Fan tail: telson and uropods spread sideways, continuing the curl.
  for (let i = -2; i <= 2; i++) {
    const blade = sweep(
      4,
      6,
      aerofoilSection({ x: (v) => v * 0.15, le: () => 0.035, chord: (v) => 0.07 + 0.025 * v - 0.05 * Math.pow(v, 5), thick: () => 0.005 }),
      (_p, v, _u, out) => mix(out, PRAWN_BODY, PRAWN_TAIL, 0.3 + 0.7 * v)
    );
    blade.rotateY(Math.PI / 2 + i * 0.26);
    blade.rotateX(-1.0);
    blade.translate(0, cyOf(0), cz(0));
    parts.push(blade);
  }
  // Rostrum: a thin spike forward and slightly up.
  parts.push(
    sweep(5, 5, tubeSection(new THREE.Vector3(0, 0.07, 0.34), new THREE.Vector3(0, 0.1, 0.52), (v) => 0.014 * (1 - v) + 0.002), solid(PRAWN_BAND))
  );
  // Eyes on short stalks.
  for (const s of [1, -1]) {
    const eye = ellipsoid(0.026, 0.026, 0.026, 5, 8, solid(0x15171a));
    eye.translate(s * 0.06, 0.06, 0.33);
    parts.push(eye);
  }
  // Long antennae sweeping back over the body.
  for (const s of [1, -1]) {
    const pts = [
      new THREE.Vector3(s * 0.03, 0.05, 0.37),
      new THREE.Vector3(s * 0.07, 0.11, 0.48),
      new THREE.Vector3(s * 0.14, 0.17, 0.4),
      new THREE.Vector3(s * 0.2, 0.18, 0.05),
      new THREE.Vector3(s * 0.25, 0.12, -0.35)
    ];
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), 10, 0.004, 3, false);
    const n = tube.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    const cc = new THREE.Color().setHex(PRAWN_TAIL);
    for (let k = 0; k < n; k++) cc.toArray(col, k * 3);
    tube.setAttribute("color", new THREE.BufferAttribute(col, 3));
    tube.deleteAttribute("uv");
    parts.push(tube);
  }
  // Three pairs of walking legs (angled forward) and four pairs of short swimmerets.
  for (let i = 0; i < 3; i++) {
    for (const s of [1, -1]) {
      const z = 0.27 - i * 0.06;
      const y = cyOf(0.9 - i * 0.06) - 0.07;
      const knee = new THREE.Vector3(s * 0.06, y - 0.04, z + 0.04);
      parts.push(sweep(2, 4, tubeSection(new THREE.Vector3(s * 0.025, y + 0.01, z), knee, () => 0.0055), solid(PRAWN_BODY)));
      parts.push(sweep(2, 4, tubeSection(knee, new THREE.Vector3(s * 0.05, y - 0.1, z + 0.09), (v) => 0.0055 * (1 - v * 0.7)), solid(PRAWN_BAND)));
    }
  }
  for (let i = 0; i < 4; i++) {
    for (const s of [1, -1]) {
      const v = 0.2 + i * 0.1;
      const y = cyOf(v) - radius(v) * 0.85;
      parts.push(
        sweep(2, 4, tubeSection(new THREE.Vector3(s * 0.02, y, cz(v)), new THREE.Vector3(s * 0.03, y - 0.045, cz(v) + 0.02), () => 0.006), solid(PRAWN_BAND))
      );
    }
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map(stripTo(["position", "normal", "color"])));
  g.computeBoundingSphere();
  return g;
}

function stripTo(keep: string[]): (g: THREE.BufferGeometry) => THREE.BufferGeometry {
  return (g) => {
    for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    return g;
  };
}

/** A fish or prawn mesh with its own material, so each can fade alone. */
export function creatureMesh(geometry: THREE.BufferGeometry, roughness: number): THREE.Mesh {
  const m = new THREE.Mesh(geometry, plumageMaterial(roughness));
  m.frustumCulled = false;
  return m;
}

// --- Splashes ----------------------------------------------------------------

const MAX_RINGS = 6;
const MAX_DROPS = 40;

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t0: number;
  dur: number;
  size: number;
  live: boolean;
}

interface Drop {
  live: boolean;
  t0: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  floor: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Splash rings (expanding, fading annuli on the water) and droplets (a
 * pooled InstancedMesh thrown ballistically). Everything is created once;
 * `ring()` and `burst()` claim free slots and `tick()` animates them.
 */
export class Splashes {
  readonly group = new THREE.Group();
  private readonly rings: Ring[] = [];
  private readonly drops: Drop[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly dropMat: THREE.MeshStandardMaterial;

  constructor() {
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48, 1);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf4fbfd, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, t0: 0, dur: 1, size: 1, live: false });
    }
    this.dropMat = new THREE.MeshStandardMaterial({ color: 0xeaf6fa, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.9 });
    this.dropMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.dropMat, MAX_DROPS);
    this.dropMesh.frustumCulled = false;
    for (let i = 0; i < MAX_DROPS; i++) {
      this.dropMesh.setMatrixAt(i, HIDDEN);
      this.drops.push({ live: false, t0: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, floor: 0 });
    }
    this.group.add(this.dropMesh);
  }

  /** An expanding ring on the water at (x, y, z), reaching radius `size` over `durMs`. */
  ring(now: number, x: number, y: number, z: number, size: number, durMs = 900): void {
    let r = this.rings.find((q) => !q.live);
    if (!r) r = this.rings.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    r.live = true;
    r.t0 = now;
    r.dur = durMs;
    r.size = size;
    r.mesh.position.set(x, y + 0.004, z);
    r.mesh.visible = true;
  }

  /** A crown of `count` droplets thrown up from (x, y, z). */
  burst(now: number, x: number, y: number, z: number, count: number, speed: number, size: number, random: () => number): void {
    let made = 0;
    for (let i = 0; i < this.drops.length && made < count; i++) {
      const d = this.drops[i];
      if (d.live) continue;
      const a = random() * Math.PI * 2;
      const out = speed * (0.35 + random() * 0.4);
      d.live = true;
      d.t0 = now;
      d.x = x; d.y = y; d.z = z;
      d.vx = Math.cos(a) * out;
      d.vz = Math.sin(a) * out;
      d.vy = speed * (0.8 + random() * 0.6);
      d.size = size * (0.6 + random() * 0.6);
      d.floor = y;
      made++;
    }
  }

  get busy(): boolean {
    return this.rings.some((r) => r.live) || this.drops.some((d) => d.live);
  }

  clear(): void {
    for (const r of this.rings) {
      r.live = false;
      r.mesh.visible = false;
    }
    for (let i = 0; i < this.drops.length; i++) {
      this.drops[i].live = false;
      this.dropMesh.setMatrixAt(i, HIDDEN);
    }
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }

  tick(now: number): void {
    for (const r of this.rings) {
      if (!r.live) continue;
      const k = (now - r.t0) / r.dur;
      if (k >= 1 || k < 0) {
        r.live = false;
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 2.2);
      const s = r.size * (0.18 + 0.82 * e);
      r.mesh.scale.set(s, 1, s);
      r.mat.opacity = 0.75 * (1 - k) * Math.min(1, k * 8);
    }
    let changed = false;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      if (!d.live) continue;
      changed = true;
      const t = (now - d.t0) / 1000;
      const y = d.y + d.vy * t - 4.9 * t * t;
      if (t > 0.05 && y < d.floor) {
        d.live = false;
        this.dropMesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      _t.set(d.x + d.vx * t, y, d.z + d.vz * t);
      const s = d.size * Math.max(0.2, 1 - t * 1.4);
      _s.set(s, s * 1.25, s);
      _m.compose(_t, _q, _s);
      this.dropMesh.setMatrixAt(i, _m);
    }
    if (changed) this.dropMesh.instanceMatrix.needsUpdate = true;
  }

  /** Triangles in one ring and one droplet (for the budget report). */
  get triangleCount(): number {
    return 48 * 2 + 80;
  }

  setOpacity(a: number): void {
    this.dropMat.opacity = 0.9 * a;
  }

  dispose(): void {
    (this.rings[0]?.mesh.geometry as THREE.BufferGeometry | undefined)?.dispose();
    for (const r of this.rings) r.mat.dispose();
    this.dropMesh.geometry.dispose();
    this.dropMat.dispose();
  }
}

