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
  hash3,
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
import { creatureMesh, fishGeometry } from "./pondLife";
import { WingPair, type WingSpec } from "./wing";

/**
 * Common kingfisher (Alcedo atthis), modelled from the owner's design
 * reference docs/design/birds/common-kingfisher.svg — its colours are taken
 * from that file:
 *
 *   head blue  #2A7CC4, crown barring #7FC4EE
 *   back stripe (bright cyan)  #4FD3EC
 *   wings (darker blue)  #1F6CB0, pale flecks #7FD8F2
 *   underparts and cheek (orange)  #EF8A2A, neck patch / throat white
 *   tail  #1E6AA8, bill  #1A1A1A, feet  #E2542F
 *
 * Built at a length of ~1 (bill tip to tail tip), +Z forward, then scaled
 * by the caller (about 0.15 world units on the board). Rig:
 *
 *   root
 *    └ body (pitch/roll/lift)
 *       ├ neck ─ head (yaw/pitch/roll) ─ bill, eyes, fish
 *       ├ tail (pitch)
 *       ├ wings: shoulder ─ arm, wrist ─ hand, primaries (wing.ts)
 *       └ legs: hip ─ tarsus + toes (tucked in flight)
 */
const HEAD_BLUE = 0x2a7cc4;
const BAR = 0x7fc4ee;
const CYAN = 0x4fd3ec;
const WING = 0x1f6cb0;
const WING_DARK = 0x163f6e;
const FLECK = 0x7fd8f2;
const ORANGE = 0xef8a2a;
const ORANGE_DEEP = 0xdc6f1c;
const WHITE = 0xffffff;
const TAIL = 0x1e6aa8;
const BILL = 0x1a1a1a;
const FEET = 0xe2542f;
const UNDERWING = 0xe7a35e;

/** Head centre relative to the body origin, and head radii. */
const HEAD_AT = new THREE.Vector3(0, 0.085, 0.215);
const HR = { x: 0.122, y: 0.128, z: 0.142 };

function bodyGeometry(): THREE.BufferGeometry {
  const w = curve([0.035, 0.085, 0.125, 0.15, 0.158, 0.152, 0.13, 0.095]);
  const top = curve([0.03, 0.07, 0.1, 0.118, 0.124, 0.12, 0.11, 0.09]);
  const bot = curve([0.03, 0.085, 0.125, 0.152, 0.166, 0.16, 0.14, 0.095]);
  const cy = curve([0.03, 0.02, 0.005, 0, 0, 0.004, 0.02, 0.05]);
  return sweep(
    13,
    16,
    ellipseSection({ z: (v) => -0.26 + v * 0.43, w, top, bot, cy }),
    (p, v, _u, out) => {
      // Orange underparts, blue upperparts, a soft boundary along the flank.
      const up = smoothstep(-0.03, 0.06, p.y - cy(v));
      mix(out, ORANGE, WING, up);
      // Deeper orange low on the belly, for some shape.
      if (up < 0.5) toward(out, ORANGE_DEEP, smoothstep(-0.05, -0.15, p.y) * 0.5);
      // The bright cyan stripe down the middle of the back.
      const stripe = (1 - smoothstep(0.03, 0.06, Math.abs(p.x))) * smoothstep(0.02, 0.07, p.y - cy(v));
      toward(out, CYAN, stripe);
    }
  );
}

function headGeometry(): THREE.BufferGeometry {
  const rings = 17;
  return ellipsoid(HR.x, HR.y, HR.z, rings, 16, (p, v, _u, out) => {
    const ax = Math.abs(p.x);
    paint(out, HEAD_BLUE);
    // Fine pale-blue barring on the crown and nape: alternate rings.
    if (p.y > 0.035) {
      const ring = Math.round(v * (rings - 1));
      if (ring % 2 === 1) toward(out, BAR, 0.38 * smoothstep(0.035, 0.07, p.y));
    }
    // Orange patch: lores in front of the eye, through below it to the ear
    // coverts behind it (the reference's orange ellipse).
    const eo = Math.pow((p.z + 0.019) / 0.085, 2) + Math.pow((p.y + 0.036) / 0.042, 2);
    const lore = Math.pow((p.z - 0.095) / 0.035, 2) + Math.pow((p.y - 0.0) / 0.03, 2);
    if ((eo < 1 || lore < 1) && ax > 0.045) paint(out, ORANGE);
    // White patch on the side of the neck, behind the orange.
    const wp = Math.pow((p.z + 0.095) / 0.045, 2) + Math.pow((p.y + 0.05) / 0.04, 2);
    if (wp < 1 && ax > 0.05) paint(out, WHITE);
    // White chin and throat (front and underside of the head).
    if (p.y < -0.055 && p.z > -0.05 && ax < 0.08 - Math.max(0, -p.y - 0.06) * 0) paint(out, WHITE);
    else if (p.y < -0.095 && p.z <= -0.05) paint(out, ORANGE);
  });
}

function neckGeometry(): THREE.BufferGeometry {
  return ellipsoid(0.1, 0.1, 0.11, 8, 12, (p, _v, _u, out) => {
    mix(out, ORANGE, HEAD_BLUE, smoothstep(-0.0, 0.05, p.y));
    if (p.z > 0.03 && p.y < 0.02 && p.y > -0.075 && Math.abs(p.x) < 0.07) paint(out, WHITE);
  });
}

function billGeometry(): THREE.BufferGeometry {
  // Long, straight, dagger-shaped: as long as the head is wide and more
  // (about twice the head radius), deep at the base, compressed to a point.
  const len = 0.27;
  const h = curve([0.045, 0.04, 0.032, 0.022, 0.012, 0.002]);
  const w = curve([0.034, 0.028, 0.021, 0.014, 0.008, 0.0015]);
  return sweep(
    8,
    8,
    ellipseSection({ z: (v) => 0.085 + v * len, w, top: h, bot: (v) => h(v) * 1.02, cy: (v) => -0.012 - v * 0.006 }),
    (p, v, _u, out) => {
      paint(out, BILL);
      // Lower mandible base faintly reddish (the female's mark is stronger;
      // keep it subtle so the bill reads black).
      if (p.y < -0.02 && v < 0.25) toward(out, 0x5a2a1a, 0.4);
    }
  );
}

function tailGeometry(): THREE.BufferGeometry {
  const g = sweep(
    6,
    12,
    aerofoilSection({
      x: (v) => v * 0.17,
      le: (v) => 0.045 + 0.008 * v,
      chord: (v) => 0.09 + 0.016 * v - 0.05 * Math.pow(v, 6),
      thick: (v) => 0.024 * (1 - 0.5 * v)
    }),
    (_p, v, u, out) => {
      paint(out, TAIL);
      if (u >= 0.5) toward(out, 0x163a5c, 0.6);
      else toward(out, 0x2a86c8, 0.25 * (1 - v));
    }
  );
  g.rotateY(Math.PI / 2); // span +X -> -Z: the tail points back
  return g;
}

function legGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hip = new THREE.Vector3(0, 0, 0);
  const ankle = new THREE.Vector3(0, -0.055, 0.008);
  parts.push(sweep(2, 6, tubeSection(hip, ankle, () => 0.014), solid(FEET)));
  // Three forward toes and one back, curled as if gripping.
  const toes: [number, number, number][] = [
    [0.02, -0.075, 0.06],
    [0.0, -0.078, 0.065],
    [-0.018, -0.075, 0.055],
    [0.0, -0.075, -0.04]
  ];
  for (const [x, y, z] of toes) parts.push(sweep(2, 4, tubeSection(ankle, new THREE.Vector3(x, y, z), (v) => 0.0085 * (1 - 0.5 * v)), solid(FEET)));
  return mergeGeometries(parts);
}

const WING_SPEC: WingSpec = {
  armSpan: 0.3,
  armChord: [0.13, 0.21, 0.21, 0.205, 0.2],
  armLe: [-0.01, 0.035, 0.045, 0.04, 0.025],
  armThick: 0.015,
  handSpan: 0.1,
  handChord: [0.2, 0.15],
  handThick: 0.014,
  primaries: [
    [0.2, 0.075],
    [0.24, 0.085],
    [0.26, 0.092],
    [0.255, 0.096],
    [0.235, 0.1],
    [0.21, 0.1]
  ],
  fanOpen: [-0.04, 0.06, 0.16, 0.27, 0.38, 0.5],
  fanFold: [0.0, 0.08, 0.16, 0.24, 0.32, 0.4],
  foldEuler: [1.12, 1.5, -0.05],
  wristFold: 0.0,
  wristFoldZ: -0.22,
  armFoldScale: 0.62,
  armFoldChord: 0.72,
  armRings: 8,
  handRings: 4,
  segs: 12,
  featherRings: 5,
  featherSegs: 4,
  scallop: 0.03,
  scallopCount: 5,
  armColor: (p, v, u, out) => {
    if (u < 0.5) {
      paint(out, WING);
      // Pale flecks on the coverts (front half of the inner wing).
      const front = p.z > -0.08;
      if (front && hash3(Math.round(p.x * 60), Math.round(p.z * 60), 3) > 0.84) toward(out, FLECK, 0.45);
      if (p.z < -0.14) toward(out, WING_DARK, 0.5);
    } else {
      mix(out, UNDERWING, 0x8d97a1, smoothstep(-0.1, -0.2, p.z));
    }
  },
  handColor: (p, _v, u, out) => {
    if (u < 0.5) {
      paint(out, WING);
      if (hash3(Math.round(p.x * 60), Math.round(p.z * 60), 7) > 0.84) toward(out, FLECK, 0.45);
    } else paint(out, 0x8d97a1);
  },
  featherColor: (_p, v, u, out) => {
    if (u < 0.5) mix(out, WING, WING_DARK, 0.4 + v * 0.5);
    else paint(out, 0x7d8792);
  }
};

const _fishScale = 0.36;

export class KingfisherModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly tail = new THREE.Group();
  readonly legs: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  readonly wings: WingPair;
  readonly fish: THREE.Mesh;
  /** The twig it perches on: placed by the caller, not part of `root`. */
  readonly perch: THREE.Mesh;
  readonly materials: THREE.Material[];
  /** Triangles in the bird itself (fish and twig excluded). */
  readonly triangles: number;
  private readonly shoulderOpen = new THREE.Vector3(0.09, 0.07, 0.06);
  private readonly shoulderFold = new THREE.Vector3(0.14, -0.065, 0.1);

  constructor() {
    const mat = plumageMaterial(0.62);
    const billMat = plumageMaterial(0.32);
    const eyeMat = eyeMaterial();

    this.root.add(this.body);
    this.body.add(new THREE.Mesh(bodyGeometry(), mat));

    this.neck.position.set(0, 0.05, 0.11);
    this.body.add(this.neck);
    this.head.position.copy(HEAD_AT).sub(this.neck.position);
    this.neck.add(this.head);
    this.head.add(new THREE.Mesh(headGeometry(), mat));
    // A thick neck that blends the big head into the body (a kingfisher has
    // no visible neck): blue nape, white throat, orange below.
    const neckBlob = new THREE.Mesh(neckGeometry(), mat);
    neckBlob.position.set(0, 0.0, 0.03);
    this.neck.add(neckBlob);
    this.head.add(new THREE.Mesh(billGeometry(), billMat));
    const eyeGeo = ellipsoid(0.021, 0.021, 0.021, 5, 8, (p, _v, _u, out) => {
      paint(out, 0x0b0c0e);
    });
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.098, 0.022, 0.058);
      this.head.add(eye);
    }
    this.fish = creatureMesh(fishGeometry(), 0.35);
    this.fish.scale.setScalar(_fishScale);
    this.fish.rotation.set(0, Math.PI / 2, 0.15);
    this.fish.position.set(0.02, -0.03, 0.27);
    this.fish.visible = false;
    this.head.add(this.fish);

    this.tail.position.set(0, 0.015, -0.23);
    this.body.add(this.tail);
    this.tail.add(new THREE.Mesh(tailGeometry(), mat));

    const legGeo = legGeometry();
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      this.legs[i].position.set(s * 0.05, -0.13, 0.03);
      this.legs[i].add(new THREE.Mesh(legGeo, mat));
      this.body.add(this.legs[i]);
    }

    this.wings = new WingPair(WING_SPEC, mat);
    this.body.add(this.wings.left.shoulder, this.wings.right.shoulder);

    this.triangles = countTriangles(this.root) - countTriangles(this.fish);
    this.materials = collectMaterials(this.root);

    const twig = sweep(
      8,
      7,
      (v, u, out) => {
        // A bare, slightly crooked twig rising out of the water and leaning in.
        const a = u * Math.PI * 2;
        const r = 0.11 * (1 - 0.55 * v);
        const bend = Math.sin(v * 2.4) * 0.35;
        out.set(Math.sin(a) * r + bend, v * 3.2 - 3.2, Math.cos(a) * r);
      },
      (p, _v, _u, out) => mix(out, 0x5a4632, 0x3c2e22, smoothstep(0.0, -0.08, p.x))
    );
    this.perch = new THREE.Mesh(twig, plumageMaterial(0.9));
    this.perch.frustumCulled = false;
    this.root.traverse((o) => (o.frustumCulled = false));
  }

  /** All the materials that fade with the bird, including the fish and twig. */
  get fadeMaterials(): THREE.Material[] {
    return [...this.materials, this.fish.material as THREE.Material];
  }

  setOpacity(a: number): void {
    setOpacity(this.materials, a);
    (this.fish.material as THREE.Material).opacity = a;
  }

  applyPose(p: BirdPose): void {
    this.body.rotation.set(-p.bodyPitch, 0, p.bodyRoll, "YXZ");
    this.body.position.y = p.bodyLift;
    // The neck stretches the head forward and down for a dive.
    this.neck.position.set(0, 0.05 + 0.02 * p.neck, 0.11 + 0.06 * p.neck);
    this.head.rotation.set(-p.headPitch, p.headYaw, p.headRoll, "YXZ");
    this.tail.rotation.set(-p.tailPitch, 0, 0);
    const sh = this.shoulderOpen;
    const sf = this.shoulderFold;
    const k = p.fold;
    this.wings.left.shoulder.position.set(sh.x + (sf.x - sh.x) * k, sh.y + (sf.y - sh.y) * k, sh.z + (sf.z - sh.z) * k);
    this.wings.right.shoulder.position.set(-(sh.x + (sf.x - sh.x) * k), sh.y + (sf.y - sh.y) * k, sh.z + (sf.z - sh.z) * k);
    this.wings.pose(p.fold, p.flap, p.sweep, p.twist, p.wristFlex, p.spread);
    for (let i = 0; i < 2; i++) {
      // Tucked: feet drawn up and back into the belly feathers.
      this.legs[i].rotation.set(p.legTuck * 1.3, 0, 0);
      this.legs[i].scale.setScalar(1 - 0.35 * p.legTuck);
    }
    this.fish.visible = p.carrying;
  }

  dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const visit = (o: THREE.Object3D): void => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        geos.add(m.geometry);
        mats.add(m.material as THREE.Material);
      }
    };
    this.root.traverse(visit);
    visit(this.perch);
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
  }
}
