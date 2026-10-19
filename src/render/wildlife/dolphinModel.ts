import * as THREE from "three";
import { collectMaterials, countTriangles, curve, ellipseSection, ellipsoid, eyeMaterial, hash3, mix, paint, plumageMaterial, setOpacity, smoothstep, solid, sweep, toward } from "./kit";

/**
 * Indian Ocean humpback dolphin (Sousa plumbea), the dolphin people watch off
 * Panjim and Dona Paula (Section 18): a long slender beak, a rounded melon, a
 * long body with the species' raised hump on the back under a small
 * triangular fin, short flippers and broad flukes. Adults pale grey with
 * pinkish white patches; the young darker grey. Modelled 1 unit long (beak
 * tip to fluke notch), +Z forward, the origin at the middle of the back's
 * waterline; the board's water hides whatever is below its surface.
 */
const ADULT = 0x9aa0a5;
const ADULT_BELLY = 0xd8d4d2;
const PINK = 0xe7c2bc;
const YOUNG = 0x5f666d;
const YOUNG_BELLY = 0x8e949a;

function bodyGeometry(young: boolean): THREE.BufferGeometry {
  // v 0 = tail stock, 1 = beak tip. The hump: the back rises at mid-body, where the fin sits.
  const w = curve([0.03, 0.06, 0.09, 0.11, 0.115, 0.11, 0.1, 0.085, 0.06, 0.03, 0.016]);
  const top = curve([0.03, 0.055, 0.085, 0.12, 0.13, 0.11, 0.095, 0.08, 0.05, 0.022, 0.012]);
  const bot = curve([0.03, 0.06, 0.09, 0.105, 0.11, 0.105, 0.095, 0.08, 0.05, 0.02, 0.01]);
  return sweep(16, 14, ellipseSection({ z: (v) => -0.5 + v, w, top, bot, cy: (v) => -0.06 + 0.02 * Math.sin(v * Math.PI) }), (p, v, _u, out) => {
    const base = young ? YOUNG : ADULT;
    const belly = young ? YOUNG_BELLY : ADULT_BELLY;
    mix(out, base, belly, smoothstep(-0.07, -0.14, p.y));
    // Adults: pinkish white patches, more of them along the flanks and the beak.
    if (!young) {
      const n = hash3(Math.round(p.x * 40), Math.round(p.y * 40), Math.round(p.z * 26));
      const flank = smoothstep(0.02, 0.09, Math.abs(p.x));
      if (n > 0.58 - 0.18 * flank) toward(out, PINK, 0.7);
      if (v > 0.86) toward(out, PINK, 0.45);
    }
  });
}

/** A thin triangle (fin, flipper half, fluke half) from three points, given a thickness. */
function fin(points: [number, number, number][], hex: number, thickness: number): THREE.BufferGeometry {
  const [a, b, c] = points.map((p) => new THREE.Vector3(...p));
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize().multiplyScalar(thickness / 2);
  const front = [a.clone().add(n), b.clone().add(n), c.clone().add(n)];
  const back = [a.clone().sub(n), b.clone().sub(n), c.clone().sub(n)];
  const tris = [front[0], front[1], front[2], back[0], back[2], back[1], front[0], back[0], front[1], front[1], back[0], back[1], front[1], back[1], front[2], front[2], back[1], back[2], front[2], back[2], front[0], front[0], back[2], back[0]];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flatMap((v) => [v.x, v.y, v.z]), 3));
  g.computeVertexNormals();
  const color = new THREE.Color();
  paint(color, hex);
  const colors = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) colors.set([color.r, color.g, color.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

export class DolphinModel {
  readonly root = new THREE.Group();
  /** Rolls and pitches with the surfacing; the root carries position and heading. */
  readonly body = new THREE.Group();
  readonly materials: THREE.Material[];
  readonly triangles: number;
  readonly young: boolean;

  constructor(young = false) {
    this.young = young;
    const mat = plumageMaterial(0.35);
    const eyeMat = eyeMaterial();
    const finHex = young ? 0x50565c : 0x8a9096;
    this.root.add(this.body);
    this.body.add(new THREE.Mesh(bodyGeometry(young), mat));
    // The small triangular fin on top of the hump.
    this.body.add(new THREE.Mesh(fin([[0, 0.05, 0.06], [0, 0.05, -0.08], [0, 0.13, -0.05]], finHex, 0.018), mat));
    // Short flippers.
    for (const s of [1, -1]) this.body.add(new THREE.Mesh(fin([[s * 0.08, -0.1, 0.2], [s * 0.08, -0.1, 0.12], [s * 0.18, -0.15, 0.1]], finHex, 0.012), mat));
    // Broad flukes at the tail.
    for (const s of [1, -1]) this.body.add(new THREE.Mesh(fin([[0, -0.03, -0.46], [s * 0.15, -0.03, -0.56], [s * 0.04, -0.03, -0.5]], finHex, 0.012), mat));
    const eyeGeo = ellipsoid(0.008, 0.008, 0.008, 4, 6, solid(0x0b0907));
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.05, -0.05, 0.32);
      this.body.add(eye);
    }
    this.triangles = countTriangles(this.root);
    this.materials = collectMaterials(this.root);
    this.root.traverse((o) => (o.frustumCulled = false));
  }

  setOpacity(a: number): void {
    setOpacity(this.materials, a);
  }

  /** pitch: + nose up (radians). roll: a slight lean as it turns. */
  applyPose(pitch: number, roll = 0): void {
    this.body.rotation.set(-pitch, 0, roll);
  }

  dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) geos.add(m.geometry);
    });
    geos.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
