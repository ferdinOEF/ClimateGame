import * as THREE from "three";
import { aerofoilSection, curve, mirrorX, sweep, type ColorFn } from "./kit";

/**
 * A bird's wing as three jointed parts: the inner wing (arm, carrying the
 * secondaries) hinged at the SHOULDER, the hand hinged at the WRIST, and a
 * fan of separate primary feathers on the hand, so the wing tip reads as
 * distinct feathers both spread and folded.
 *
 * Local frame of a left wing: span +X out from the shoulder, +Z forward,
 * +Y up (dorsal). The right wing is a mirrored copy driven with mirrored
 * angles, so one `pose()` call moves both symmetrically.
 *
 * Folding blends two shoulder orientations (spread and folded) with a
 * quaternion slerp, shortens the inner wing (the overlapping secondaries of
 * a folded wing), swings the hand back at the wrist and stacks the
 * primaries. Nothing is allocated in `pose()`.
 */
export interface WingSpec {
  armSpan: number;
  armChord: readonly number[]; // keys root -> wrist
  armLe?: readonly number[]; // leading-edge z keys
  armThick: number;
  handSpan: number;
  handChord: readonly number[];
  handThick: number;
  /** Primary feathers, outermost first: [length, width]. */
  primaries: readonly (readonly [number, number])[];
  /** Spread fan angle per primary (radians, + sweeps back). */
  fanOpen: readonly number[];
  /** Folded fan angle per primary. */
  fanFold: readonly number[];
  /** Folded shoulder orientation for the left wing: [twist about X, sweep about Y, flap about Z], applied twist first. */
  foldEuler: readonly [number, number, number];
  /** Folded wrist angle about Y (left wing). */
  wristFold: number;
  /** Folded wrist roll about X. */
  wristFoldRoll?: number;
  /** Folded wrist bend about Z (- tucks the hand toward the body). */
  wristFoldZ?: number;
  /** Inner-wing span scale when folded. */
  armFoldScale: number;
  /** Inner-wing chord scale when folded (the secondaries tuck under one another). */
  armFoldChord?: number;
  armRings: number;
  handRings: number;
  segs: number;
  featherRings: number;
  featherSegs: number;
  armColor: ColorFn;
  handColor: ColorFn;
  featherColor: ColorFn;
  /** Scalloped trailing edge depth (fraction of chord) — the secondaries' tips. */
  scallop?: number;
  scallopCount?: number;
}

const _qOpen = new THREE.Quaternion();
const _qFold = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "ZYX");

class OneWing {
  readonly shoulder = new THREE.Group();
  readonly arm: THREE.Mesh;
  readonly wrist = new THREE.Group();
  readonly hand: THREE.Mesh;
  readonly feathers: THREE.Mesh[] = [];
  private readonly qFold = new THREE.Quaternion();

  constructor(
    private readonly spec: WingSpec,
    private readonly side: 1 | -1,
    armGeo: THREE.BufferGeometry,
    handGeo: THREE.BufferGeometry,
    featherGeo: THREE.BufferGeometry,
    mat: THREE.Material
  ) {
    this.arm = new THREE.Mesh(armGeo, mat);
    this.hand = new THREE.Mesh(handGeo, mat);
    this.shoulder.add(this.arm, this.wrist);
    this.wrist.add(this.hand);
    const n = spec.primaries.length;
    for (let i = 0; i < n; i++) {
      const [len, wid] = spec.primaries[i];
      const f = new THREE.Mesh(featherGeo, mat);
      f.scale.set(len, 1, wid);
      // Primaries root along the hand's trailing half, outermost at the tip.
      const along = spec.handSpan * (1 - (i / Math.max(1, n - 1)) * 0.85);
      f.position.set(side * along, 0, -spec.handChord[0] * 0.35);
      this.feathers.push(f);
      this.wrist.add(f);
    }
    _e.set(spec.foldEuler[0], spec.foldEuler[1] * side, spec.foldEuler[2] * side, "ZYX");
    this.qFold.setFromEuler(_e);
  }

  pose(fold: number, flap: number, sweepBack: number, twist: number, wristFlex: number, spread: number): void {
    const s = this.side;
    const sp = this.spec;
    _e.set(twist, sweepBack * s, flap * s, "ZYX");
    _qOpen.setFromEuler(_e);
    _qFold.copy(this.qFold);
    this.shoulder.quaternion.copy(_qOpen).slerp(_qFold, fold);
    const armScale = 1 + (sp.armFoldScale - 1) * fold;
    this.arm.scale.x = armScale;
    this.arm.scale.z = 1 + ((sp.armFoldChord ?? 1) - 1) * fold;
    this.hand.scale.z = this.arm.scale.z;
    this.wrist.position.set(s * sp.armSpan * armScale, 0, 0);
    const wristY = wristFlex * (1 - fold) + sp.wristFold * fold;
    this.wrist.rotation.set((sp.wristFoldRoll ?? 0) * fold, wristY * s, (-0.25 * wristFlex * (1 - fold) + (sp.wristFoldZ ?? 0) * fold) * s, "XYZ");
    const n = this.feathers.length;
    for (let i = 0; i < n; i++) {
      const open = sp.fanOpen[i] * spread + sp.fanFold[i] * (1 - spread);
      const a = open * (1 - fold) + sp.fanFold[i] * fold;
      // Each primary sits a hair below the one outside it when folded, so the
      // stack never z-fights.
      this.feathers[i].rotation.set(0, a * s, 0);
      this.feathers[i].position.y = -0.004 * i * fold;
    }
  }
}

/** Builds the geometry for one wing spec once (shared by the left and right wing). */
function buildGeometry(spec: WingSpec): { arm: THREE.BufferGeometry; hand: THREE.BufferGeometry; feather: THREE.BufferGeometry } {
  const armChord = curve(spec.armChord);
  const armLe = spec.armLe ? curve(spec.armLe) : () => 0;
  const scallop = spec.scallop ?? 0;
  const scN = spec.scallopCount ?? 8;
  const arm = sweep(
    spec.armRings,
    spec.segs,
    aerofoilSection({
      x: (v) => v * spec.armSpan,
      le: armLe,
      chord: (v) => armChord(v) * (1 - scallop * Math.pow(Math.abs(Math.sin(v * Math.PI * scN)), 0.6)),
      thick: (v) => spec.armThick * (1 - 0.35 * v),
      camber: (v) => armChord(v) * 0.08
    }),
    spec.armColor
  );
  const handChord = curve(spec.handChord);
  const hand = sweep(
    spec.handRings,
    spec.segs,
    aerofoilSection({
      x: (v) => v * spec.handSpan,
      le: (v) => 0.01 * v,
      chord: handChord,
      thick: (v) => spec.handThick * (1 - 0.5 * v),
      camber: (v) => handChord(v) * 0.06
    }),
    spec.handColor
  );
  // A unit primary: shaft along +X, length 1, width 1 (scaled per feather);
  // narrow at the base, broadest at a third, rounded-pointed tip. Thin
  // aerofoil section, so it has a real upper and lower face.
  const width = curve([0.4, 0.85, 1, 0.98, 0.85, 0.55, 0.12]);
  const feather = sweep(
    spec.featherRings,
    spec.featherSegs,
    aerofoilSection({
      x: (v) => v,
      le: (v) => 0.35 * width(v),
      chord: (v) => width(v),
      thick: () => 0.022,
      camber: (v) => 0.06 * width(v)
    }),
    spec.featherColor
  );
  return { arm, hand, feather };
}

export class WingPair {
  readonly left: OneWing;
  readonly right: OneWing;
  constructor(spec: WingSpec, mat: THREE.Material) {
    const g = buildGeometry(spec);
    this.left = new OneWing(spec, 1, g.arm, g.hand, g.feather, mat);
    this.right = new OneWing(spec, -1, mirrorX(g.arm), mirrorX(g.hand), mirrorX(g.feather), mat);
  }

  /**
   * fold: 0 spread .. 1 folded. flap: shoulder elevation (+ up). sweepBack:
   * + swings the spread wing backward. twist: + pitches the leading edge up.
   * wristFlex: + swings the hand back (the upstroke's partial fold).
   * spread: 0..1 how far the primaries fan when open.
   */
  pose(fold: number, flap: number, sweepBack: number, twist: number, wristFlex: number, spread = 1): void {
    this.left.pose(fold, flap, sweepBack, twist, wristFlex, spread);
    this.right.pose(fold, flap, sweepBack, twist, wristFlex, spread);
  }
}
