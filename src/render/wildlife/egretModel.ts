import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BirdPose } from "./birdPose";
import {
  aerofoilSection,
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
  toward,
  tubeSection
} from "./kit";
import { WingPair, type WingSpec } from "./wing";

/**
 * Egret, modelled from the owner's design reference
 * docs/design/birds/egret.svg (proportions and colours from that file):
 *
 *   plumage white #FFFFFF / #F4F7F8 with faint grey shading #D5DDE0, #DCE4E7
 *   bill orange-yellow #F0A020, eye yellow #E5C02A with a black pupil
 *   legs and feet black #222 / #2A2A2A
 *
 * About 1 model unit tall standing (scaled to ~0.4 on the board), +Z
 * forward, origin on the ground under the hips. Rig:
 *
 *   root
 *    ├ body (pitch/roll/lift)
 *    │  ├ neck: one tube re-shaped along a curve every frame (the S)
 *    │  ├ head (at the neck's end) ─ bill, eyes
 *    │  ├ tail
 *    │  ├ wings (wing.ts)
 *    │  └ legs: hip ─ tibia, "knee" (the ankle, which bends backward) ─ tarsus, foot ─ toes
 *
 * Walking uses two-bone IK so planted feet do not slide; flight trails the
 * legs straight back.
 */
const WHITE = 0xffffff;
const WHITE_SOFT = 0xf4f7f8;
const SHADE = 0xd5dde0;
const SHADE_2 = 0xdce4e7;
const BILL = 0xf0a020;
const EYE = 0xe5c02a;
const LEG = 0x222222;
const FOOT = 0x2a2a2a;

const TIBIA = 0.27;
const TARSUS = 0.27;
/** Hip in body space. */
const HIP_Y = -0.05;
const HIP_X = 0.04;
const HIP_Z = 0.0;
const BODY_Y = 0.56;

function bodyGeometry(): THREE.BufferGeometry {
  const w = curve([0.02, 0.065, 0.1, 0.118, 0.12, 0.108, 0.085, 0.06]);
  const top = curve([0.02, 0.05, 0.075, 0.088, 0.09, 0.085, 0.07, 0.05]);
  const bot = curve([0.02, 0.06, 0.095, 0.11, 0.112, 0.1, 0.08, 0.055]);
  const cy = curve([0.02, 0.01, 0, 0, 0, 0.005, 0.015, 0.03]);
  return sweep(12, 14, ellipseSection({ z: (v) => -0.3 + v * 0.47, w, top, bot, cy }), (p, _v, _u, out) => {
    mix(out, WHITE_SOFT, SHADE, smoothstep(-0.02, -0.1, p.y) * 0.8);
    if (p.y > 0.04) paint(out, WHITE);
  });
}

function headGeometry(): THREE.BufferGeometry {
  return ellipsoid(0.034, 0.037, 0.052, 9, 12, (p, _v, _u, out) => {
    paint(out, WHITE);
    if (p.y < -0.015) toward(out, SHADE_2, 0.5);
    // Bare yellowish lores between eye and bill.
    if (p.z > 0.02 && Math.abs(p.y - 0.004) < 0.012 && Math.abs(p.x) > 0.012) toward(out, 0xe8d27a, 0.8);
  });
}

function billGeometry(): THREE.BufferGeometry {
  const len = 0.18;
  const h = curve([0.017, 0.013, 0.009, 0.0055, 0.0015]);
  const w = curve([0.013, 0.01, 0.007, 0.0045, 0.0012]);
  return sweep(8, 8, ellipseSection({ z: (v) => 0.035 + v * len, w, top: h, bot: (v) => h(v) * 1.05, cy: (v) => -0.004 - v * 0.004 }), (_p, v, _u, out) => {
    mix(out, BILL, 0x8a6a2a, smoothstep(0.8, 1, v) * 0.6);
  });
}

function tailGeometry(): THREE.BufferGeometry {
  const g = sweep(
    5,
    10,
    aerofoilSection({ x: (v) => v * 0.13, le: () => 0.05, chord: (v) => 0.1 * (1 - 0.25 * Math.pow(v, 4)), thick: () => 0.012 }),
    (_p, _v, u, out) => (u < 0.5 ? paint(out, WHITE_SOFT) : paint(out, SHADE))
  );
  g.rotateY(Math.PI / 2);
  return g;
}

function boneGeometry(len: number, r0: number, r1: number, segs: number): THREE.BufferGeometry {
  return sweep(3, segs, tubeSection(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -len, 0), (v) => r0 + (r1 - r0) * v), solid(LEG));
}

function footGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const o = new THREE.Vector3(0, 0, 0);
  const toes: [number, number, number][] = [
    [0.035, -0.006, 0.085],
    [0.0, -0.006, 0.1],
    [-0.035, -0.006, 0.085],
    [0.0, -0.004, -0.045]
  ];
  for (const [x, y, z] of toes) parts.push(sweep(3, 4, tubeSection(o, new THREE.Vector3(x, y, z), (v) => 0.0065 * (1 - 0.6 * v)), solid(FOOT)));
  parts.push(ellipsoid(0.012, 0.011, 0.012, 4, 6, solid(FOOT)));
  return mergeGeometries(parts);
}

const WING_SPEC: WingSpec = {
  armSpan: 0.33,
  armChord: [0.15, 0.25, 0.26, 0.255, 0.245],
  armLe: [0.0, 0.035, 0.04, 0.035, 0.02],
  armThick: 0.016,
  handSpan: 0.13,
  handChord: [0.24, 0.19],
  handThick: 0.012,
  primaries: [
    [0.24, 0.085],
    [0.28, 0.095],
    [0.295, 0.1],
    [0.29, 0.104],
    [0.27, 0.106],
    [0.245, 0.108]
  ],
  fanOpen: [-0.05, 0.06, 0.16, 0.26, 0.36, 0.46],
  fanFold: [0.0, 0.035, 0.07, 0.105, 0.14, 0.175],
  foldEuler: [1.2, 1.52, -0.06],
  wristFold: 0.0,
  wristFoldZ: -0.2,
  armFoldScale: 0.55,
  armFoldChord: 0.55,
  armRings: 8,
  handRings: 4,
  segs: 12,
  featherRings: 5,
  featherSegs: 4,
  scallop: 0.04,
  scallopCount: 7,
  armColor: (p, _v, u, out) => {
    if (u < 0.5) mix(out, WHITE, SHADE_2, smoothstep(-0.15, -0.24, p.z) * 0.5);
    else mix(out, SHADE_2, SHADE, 0.4);
  },
  handColor: (_p, _v, u, out) => (u < 0.5 ? paint(out, WHITE_SOFT) : paint(out, SHADE_2)),
  featherColor: (_p, v, u, out) => (u < 0.5 ? mix(out, WHITE_SOFT, SHADE_2, v * 0.6) : mix(out, SHADE_2, SHADE, v))
};

// --- The neck: one tube, re-shaped every frame --------------------------------

const NECK_RINGS = 18;
const NECK_SEGS = 8;
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();

function bezier(out: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return out.set(
    a * _p0.x + b * _p1.x + c * _p2.x + d * _p3.x,
    a * _p0.y + b * _p1.y + c * _p2.y + d * _p3.y,
    a * _p0.z + b * _p1.z + c * _p2.z + d * _p3.z
  );
}

function bezierTangent(out: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t;
  const a = -3 * u * u, b = 3 * u * u - 6 * u * t, c = 6 * u * t - 3 * t * t, d = 3 * t * t;
  out.set(
    a * _p0.x + b * _p1.x + c * _p2.x + d * _p3.x,
    a * _p0.y + b * _p1.y + c * _p2.y + d * _p3.y,
    a * _p0.z + b * _p1.z + c * _p2.z + d * _p3.z
  );
  if (out.lengthSq() < 1e-10) out.set(0, 1, 0);
  return out.normalize();
}

class NeckTube {
  readonly mesh: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;
  private readonly nor: THREE.BufferAttribute;
  private readonly radius: (v: number) => number = curve([0.038, 0.03, 0.024, 0.021, 0.02, 0.02]);

  constructor(mat: THREE.Material) {
    const n = NECK_RINGS * NECK_SEGS;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.nor = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.nor.setUsage(THREE.DynamicDrawUsage);
    const col = new Float32Array(n * 3);
    const cc = new THREE.Color();
    for (let i = 0; i < NECK_RINGS; i++) {
      for (let j = 0; j < NECK_SEGS; j++) {
        // j = 0 is the front of the neck; the back and underside take the grey.
        const a = (j / NECK_SEGS) * Math.PI * 2;
        mix(cc, WHITE, SHADE_2, 0.5 + 0.5 * Math.cos(a + Math.PI));
        cc.toArray(col, (i * NECK_SEGS + j) * 3);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < NECK_RINGS - 1; i++) {
      for (let j = 0; j < NECK_SEGS; j++) {
        const a = i * NECK_SEGS + j;
        const b = i * NECK_SEGS + ((j + 1) % NECK_SEGS);
        const c = (i + 1) * NECK_SEGS + j;
        const d = (i + 1) * NECK_SEGS + ((j + 1) % NECK_SEGS);
        idx.push(a, c, b, b, c, d);
      }
    }
    g.setAttribute("position", this.pos);
    g.setAttribute("normal", this.nor);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0.1), 0.6);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }

  /** Re-shapes the tube along the cubic through p0..p3 (in body space, all in the x = 0 plane). */
  update(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3): void {
    _p0.copy(p0); _p1.copy(p1); _p2.copy(p2); _p3.copy(p3);
    const pa = this.pos.array as Float32Array;
    const na = this.nor.array as Float32Array;
    for (let i = 0; i < NECK_RINGS; i++) {
      const v = i / (NECK_RINGS - 1);
      bezier(_c, v);
      bezierTangent(_t, v);
      // In-plane normal (0, t.z, -t.y): with the side axis X this keeps
      // (along x around) pointing outward, like every sweep here.
      _n.set(0, _t.z, -_t.y).normalize();
      const r = this.radius(v);
      for (let j = 0; j < NECK_SEGS; j++) {
        const a = (j / NECK_SEGS) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = sa; // side axis is X
        const ny = _n.y * ca;
        const nz = _n.z * ca;
        const k = (i * NECK_SEGS + j) * 3;
        pa[k] = _c.x + nx * r;
        pa[k + 1] = _c.y + ny * r;
        pa[k + 2] = _c.z + nz * r;
        na[k] = nx; na[k + 1] = ny; na[k + 2] = nz;
      }
    }
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
  }
}

// --- The rig ----------------------------------------------------------------------

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  foot: THREE.Group;
}

const _base = new THREE.Vector3();
const _q1 = new THREE.Vector3();
const _q2 = new THREE.Vector3();
const _head = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _tgt = new THREE.Vector3();

export class EgretModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly tail = new THREE.Group();
  readonly wings: WingPair;
  readonly legs: [Leg, Leg];
  readonly materials: THREE.Material[];
  readonly triangles: number;
  private readonly neck: NeckTube;
  /** Foot targets in root space (used while legTuck < 1). */
  readonly feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(HIP_X, 0, 0.02), new THREE.Vector3(-HIP_X, 0, -0.02)];
  /** How high each foot is lifted off the ground (0 planted), for the toes' curl. */
  readonly footLift: [number, number] = [0, 0];
  private readonly shoulderOpen = new THREE.Vector3(0.065, 0.06, 0.05);
  private readonly shoulderFold = new THREE.Vector3(0.105, -0.055, 0.1);

  constructor() {
    const mat = plumageMaterial(0.85);
    // A touch of self-light so white reads as white on the shaded side too.
    mat.emissive.setHex(0x262a2c);
    const billMat = plumageMaterial(0.4);
    const legMat = plumageMaterial(0.55);
    const eyeMat = eyeMaterial();

    this.root.add(this.body);
    this.body.position.y = BODY_Y;
    this.body.add(new THREE.Mesh(bodyGeometry(), mat));

    this.neck = new NeckTube(mat);
    this.body.add(this.neck.mesh);
    this.body.add(this.head);
    this.head.add(new THREE.Mesh(headGeometry(), mat));
    this.head.add(new THREE.Mesh(billGeometry(), billMat));
    const eyeGeo = ellipsoid(0.0085, 0.0085, 0.0085, 5, 8, (p, _v, _u, out) => {
      // Yellow iris, black pupil on the outward-facing pole.
      paint(out, EYE);
      if (Math.abs(p.x) > 0.0062) paint(out, 0x111111);
    });
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.027, 0.008, 0.024);
      this.head.add(eye);
    }

    this.tail.position.set(0, 0.015, -0.27);
    this.body.add(this.tail);
    this.tail.add(new THREE.Mesh(tailGeometry(), mat));

    const tibiaGeo = boneGeometry(TIBIA, 0.014, 0.0085, 6);
    const tarsusGeo = boneGeometry(TARSUS, 0.0085, 0.0075, 6);
    const kneeGeo = ellipsoid(0.011, 0.011, 0.011, 4, 6, solid(LEG));
    const footGeo = footGeometry();
    // Feathered thigh: the white "trousers" where the leg leaves the body.
    const thighGeo = ellipsoid(0.026, 0.05, 0.03, 6, 8, (p, _v, _u, out) => mix(out, WHITE_SOFT, SHADE, smoothstep(0.0, -0.04, p.y)));
    const mk = (s: number): Leg => {
      const hip = new THREE.Group();
      hip.position.set(s * HIP_X, HIP_Y, HIP_Z);
      const thigh = new THREE.Mesh(thighGeo, mat);
      thigh.position.y = -0.03;
      hip.add(thigh, new THREE.Mesh(tibiaGeo, legMat));
      const knee = new THREE.Group();
      knee.position.y = -TIBIA;
      knee.add(new THREE.Mesh(kneeGeo, legMat), new THREE.Mesh(tarsusGeo, legMat));
      hip.add(knee);
      const foot = new THREE.Group();
      foot.position.y = -TARSUS;
      foot.add(new THREE.Mesh(footGeo, legMat));
      knee.add(foot);
      this.body.add(hip);
      return { hip, knee, foot };
    };
    this.legs = [mk(1), mk(-1)];

    this.wings = new WingPair(WING_SPEC, mat);
    this.body.add(this.wings.left.shoulder, this.wings.right.shoulder);

    this.neck.update(new THREE.Vector3(0, 0.03, 0.12), new THREE.Vector3(0, 0.1, 0.24), new THREE.Vector3(0, 0.3, 0.1), new THREE.Vector3(0, 0.44, 0.25));
    this.triangles = countTriangles(this.root);
    this.materials = collectMaterials(this.root);
    this.root.traverse((o) => (o.frustumCulled = false));
  }

  setOpacity(a: number): void {
    setOpacity(this.materials, a);
  }

  applyPose(p: BirdPose): void {
    this.body.rotation.set(-p.bodyPitch, 0, p.bodyRoll, "YXZ");
    this.body.position.set(0, BODY_Y + p.bodyLift, 0);
    this.tail.rotation.set(-p.tailPitch, 0, 0);

    // Neck: wading S (0.5) .. alert (1) .. folded back for flight (0).
    const n = p.neck;
    const th = p.neckThrust;
    _base.set(0, 0.035, 0.13);
    if (n >= 0.5) {
      const k = (n - 0.5) * 2;
      _head.set(0, 0.4 + 0.05 * k, 0.17 - 0.04 * k + 0.07 * th);
      _q1.set(0, 0.11, 0.25 - 0.04 * k);
      _q2.set(0, _head.y - 0.13, _head.z - 0.2 + 0.03 * th);
    } else {
      // Retracted: head drawn back over the shoulders, the S folded into a
      // deep loop that hangs below the line of the body.
      const k = n * 2;
      _head.set(0, 0.11 + 0.29 * k, 0.2 - 0.03 * k + 0.07 * th * k);
      _q1.set(0, -0.12 + 0.23 * k, 0.27 - 0.02 * k);
      _q2.set(0, _head.y - 0.13 * k - 0.1 * (1 - k), _head.z + 0.1 * (1 - k) - 0.2 * k);
    }
    this.neck.update(_base, _q1, _q2, _head);
    this.head.position.copy(_head);
    this.head.rotation.set(-p.headPitch, p.headYaw, p.headRoll, "YXZ");

    const sh = this.shoulderOpen;
    const sf = this.shoulderFold;
    const k = p.fold;
    this.wings.left.shoulder.position.set(sh.x + (sf.x - sh.x) * k, sh.y + (sf.y - sh.y) * k, sh.z + (sf.z - sh.z) * k);
    this.wings.right.shoulder.position.set(-(sh.x + (sf.x - sh.x) * k), sh.y + (sf.y - sh.y) * k, sh.z + (sf.z - sh.z) * k);
    this.wings.pose(p.fold, p.flap, p.sweep, p.twist, p.wristFlex, p.spread);

    // Legs: IK to the foot targets on the ground, blended toward trailing
    // straight back behind the tail in flight.
    _inv.copy(this.body.quaternion).invert();
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      // Target into body space.
      _tgt.copy(this.feet[i]).sub(this.body.position).applyQuaternion(_inv);
      const hy = leg.hip.position.y;
      const hz = leg.hip.position.z;
      const dy = _tgt.y - hy;
      const dz = _tgt.z - hz;
      let d = Math.hypot(dy, dz);
      d = Math.min(d, (TIBIA + TARSUS) * 0.999);
      d = Math.max(d, Math.abs(TIBIA - TARSUS) + 0.01);
      // Angle of the hip->foot line, measured from straight down (-Y), + toward +Z.
      const base = Math.atan2(dz, -dy);
      const cosA = (TIBIA * TIBIA + d * d - TARSUS * TARSUS) / (2 * TIBIA * d);
      const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
      const cosB = (TIBIA * TIBIA + TARSUS * TARSUS - d * d) / (2 * TIBIA * TARSUS);
      const b = Math.acos(Math.max(-1, Math.min(1, cosB)));
      // The tibia swings forward of the line so the joint bends BACKWARD
      // (a bird's visible "knee" is its ankle). Rotation about X: + swings
      // the bone's -Y end toward -Z, so forward is negative.
      const ikHip = -(base - a);
      const ikKnee = -(Math.PI - b); // the tarsus angles forward again from the joint
      // Trailing: tibia back and slightly down, tarsus straight, toes back.
      const t = p.legTuck;
      const hipX = ikHip * (1 - t) + 1.25 * t;
      const kneeX = ikKnee * (1 - t) + 0.25 * t;
      leg.hip.rotation.set(hipX, 0, 0);
      leg.knee.rotation.set(kneeX, 0, 0);
      // Toes level with the ground while standing (counter the chain, and the
      // body pitch), curled a little when lifted; pointing back in flight.
      const level = -(hipX + kneeX) + p.bodyPitch;
      const curl = 0.9 * Math.min(1, this.footLift[i] * 12);
      leg.foot.rotation.set((level + curl) * (1 - t) + 1.45 * t, 0, 0);
    }
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

export const EGRET_LEG = { tibia: TIBIA, tarsus: TARSUS, hipX: HIP_X, bodyY: BODY_Y };
