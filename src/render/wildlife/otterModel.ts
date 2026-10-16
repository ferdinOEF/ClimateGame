import * as THREE from "three";
import {
  collectMaterials,
  countTriangles,
  curve,
  ellipseSection,
  ellipsoid,
  eyeMaterial,
  mix,
  paint,
  plumageMaterial,
  setOpacity,
  smoothstep,
  solid,
  sweep,
  toward
} from "./kit";

/**
 * Smooth-coated otter (Lutrogale perspicillata): a long, sleek brown body,
 * a broad flat head with a pale throat and cheeks, small ears, a thick
 * tapering tail. Modelled 1 unit long (nose to tail tip), +Z forward, the
 * origin at the waterline over the shoulders; the board's own water
 * surface hides whatever is below it.
 *
 *   root
 *    └ body (pitch, sink)
 *       ├ head (yaw/pitch)
 *       └ tail (pitch, lags the body in a dive)
 */
const BROWN = 0x5d4029;
const BROWN_DARK = 0x46301f;
const PALE = 0xb79a78;
const THROAT = 0xcbb294;
const NOSE = 0x1b1512;

function bodyGeometry(): THREE.BufferGeometry {
  const w = curve([0.07, 0.095, 0.108, 0.112, 0.11, 0.104, 0.095, 0.085]);
  const top = curve([0.06, 0.08, 0.092, 0.096, 0.094, 0.09, 0.082, 0.075]);
  const bot = curve([0.06, 0.08, 0.092, 0.095, 0.093, 0.088, 0.08, 0.072]);
  return sweep(12, 14, ellipseSection({ z: (v) => -0.42 + v * 0.5, w, top, bot, cy: () => -0.05 }), (p, _v, _u, out) => {
    mix(out, BROWN, PALE, smoothstep(-0.07, -0.15, p.y));
    if (p.y > 0.0) toward(out, BROWN_DARK, smoothstep(0.0, 0.06, p.y) * 0.5);
  });
}

function tailGeometry(): THREE.BufferGeometry {
  // Thick at the root, flattened toward the tip (a smooth-coated otter's
  // tail is flattened, not round).
  const w = curve([0.07, 0.055, 0.04, 0.026, 0.008]);
  const h = curve([0.06, 0.04, 0.026, 0.016, 0.006]);
  return sweep(8, 10, ellipseSection({ z: (v) => -v * 0.36, w, top: h, bot: h }), (_p, v, _u, out) => mix(out, BROWN, BROWN_DARK, v * 0.6));
}

function headGeometry(): THREE.BufferGeometry {
  // Broad, flat-topped skull, short blunt muzzle.
  const w = curve([0.07, 0.083, 0.085, 0.078, 0.064, 0.05, 0.034]);
  const top = curve([0.058, 0.064, 0.06, 0.05, 0.04, 0.034, 0.024]);
  const bot = curve([0.06, 0.058, 0.052, 0.045, 0.038, 0.032, 0.022]);
  return sweep(11, 14, ellipseSection({ z: (v) => -0.07 + v * 0.19, w, top, bot }), (p, v, _u, out) => {
    paint(out, BROWN);
    if (p.y > 0.02) toward(out, BROWN_DARK, 0.35);
    // Pale cheeks, lips and throat.
    if (p.y < -0.01) mix(out, BROWN, THROAT, smoothstep(-0.01, -0.035, p.y));
    // Black nose pad at the muzzle tip.
    if (v > 0.88 && p.y > -0.005) paint(out, NOSE);
    // Pale whisker pads either side of the muzzle.
    if (v > 0.6 && v <= 0.88 && p.y < 0.01 && Math.abs(p.x) > 0.025) toward(out, THROAT, 0.55);
  });
}

export class OtterModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly tail = new THREE.Group();
  readonly materials: THREE.Material[];
  readonly triangles: number;

  constructor() {
    const mat = plumageMaterial(0.55);
    const eyeMat = eyeMaterial();
    this.root.add(this.body);
    this.body.add(new THREE.Mesh(bodyGeometry(), mat));
    this.head.position.set(0, -0.02, 0.1);
    this.body.add(this.head);
    this.head.add(new THREE.Mesh(headGeometry(), mat));
    const eyeGeo = ellipsoid(0.011, 0.011, 0.011, 4, 8, solid(0x0b0907));
    const earGeo = ellipsoid(0.014, 0.016, 0.01, 4, 6, (_p, _v, _u, out) => paint(out, BROWN_DARK));
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.05, 0.03, 0.055);
      this.head.add(eye);
      const ear = new THREE.Mesh(earGeo, mat);
      ear.position.set(s * 0.068, 0.04, -0.035);
      this.head.add(ear);
    }
    this.tail.position.set(0, -0.05, -0.4);
    this.body.add(this.tail);
    this.tail.add(new THREE.Mesh(tailGeometry(), mat));
    // Short legs (mostly under water) so the silhouette is right when it dives.
    const legGeo = ellipsoid(0.024, 0.05, 0.028, 5, 8, (_p, _v, _u, out) => paint(out, BROWN_DARK));
    for (const [x, z] of [[0.08, 0.02], [-0.08, 0.02], [0.08, -0.32], [-0.08, -0.32]] as [number, number][]) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(x, -0.14, z);
      leg.rotation.x = 0.4;
      this.body.add(leg);
    }
    this.triangles = countTriangles(this.root);
    this.materials = collectMaterials(this.root);
    this.root.traverse((o) => (o.frustumCulled = false));
  }

  setOpacity(a: number): void {
    setOpacity(this.materials, a);
  }

  /**
   * headYaw/headPitch: looking around. dive 0..1: the body tips nose-down
   * and sinks, the back rolls over and the tail lifts and follows last.
   * raise 0..1: head and shoulders lifted out of the water to look around.
   */
  applyPose(headYaw: number, headPitch: number, dive: number, raise = 0): void {
    const d = Math.max(0, Math.min(1, dive));
    // + rotation about X tips the nose down; `raise` lifts the head end.
    this.body.rotation.set(0.85 * smoothstep(0, 0.6, d) - 0.32 * raise, 0, 0);
    this.body.position.set(0, -0.36 * smoothstep(0.05, 0.75, d), 0.2 * smoothstep(0.1, 0.9, d));
    this.head.rotation.set(-headPitch + 0.25 * d + 0.28 * raise, headYaw * (1 - d), 0, "YXZ");
    // The tail lifts clear of the water as the body rolls under, then follows.
    this.tail.rotation.set(0.9 * Math.sin(Math.PI * smoothstep(0.2, 1, d)), 0, 0);
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
