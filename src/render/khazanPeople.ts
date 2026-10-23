import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, dome, move, rotate } from "./primitives3d";

/**
 * Section 30.6 (owner decision): people at work in every khazan. In the paddy half, three transplanters bent over
 * the rows with seedlings in their hands (one with a head cover); on the bund beside the sluice gate, one person
 * casting a round net into the pond half: it spreads, lands on the water and is pulled back, every few seconds.
 *
 * Small, slow motions only. Hidden during a storm; still (no throw, no bob) with Calm motion. Four instanced meshes
 * for every khazan on the board, so four draw calls in all; `tick()` only rewrites instance matrices.
 *
 * Local frame as in defenceGeometry.ts: a khazan is never turned; its pond half is west (-x), its paddy half east
 * (+x), its sluice gate at the front (+z, toward the camera), its tile top at y = 0.
 */

/** A standing person is this tall, in board units (a tile has circumradius 1). */
const PERSON = 0.17;
const CAPACITY = 64;
/** The net's whole cycle, and its parts (fractions of it): wind up, fly, lie on the water, pulled back, rest. */
const CYCLE_MS = 6500;
const WIND = 0.08;
const FLY = 0.2;
const LIE = 0.4;
const PULL = 0.64;
/** Full spread of the net on the water (radius, board units), and where it lands in the pond half. */
const NET_R = 0.15;
const NET_TARGET = new THREE.Vector3(-0.3, 0.04, 0.12);
const FISHER_AT = new THREE.Vector3(-0.2, 0.08, 0.6);
const HAND = new THREE.Vector3(-0.22, 0.08 + PERSON * 0.75, 0.52);
/** Where the transplanters stand in the paddy, and which way each faces (yaw). */
const PLANTERS: readonly { x: number; z: number; yaw: number; cover: boolean }[] = [
  { x: 0.2, z: -0.22, yaw: 0.4, cover: true },
  { x: 0.38, z: 0.02, yaw: -0.3, cover: false },
  { x: 0.16, z: 0.24, yaw: 2.6, cover: false }
];

const SKIN = "#8a5a3c";
const HAIR = "#2a1d17";

/** A person bent over at the hips, arms down to the paddy with a bunch of seedlings; feet at the origin, facing +z. */
function planterGeometry(cover: boolean, cloth: string, lower: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) parts.push(move(box(0.09, 0.44, 0.1, lower), side * 0.06, 0, 0));
  // The torso, tipped forward about 70 degrees from the hips.
  const torso = box(0.24, 0.42, 0.15, cloth);
  rotate(torso, 1.2, 0, 0);
  parts.push(move(torso, 0, 0.42, 0.02));
  const head = dome(0.085, 0.09, 0.085, SKIN);
  parts.push(move(head, 0, 0.44, 0.47));
  if (cover) parts.push(move(dome(0.105, 0.075, 0.11, "#e9dcc0"), 0, 0.49, 0.45));
  else parts.push(move(dome(0.09, 0.05, 0.09, HAIR), 0, 0.51, 0.45));
  // Arms hang from the shoulders to the water, a bunch of seedlings in the hands.
  for (const side of [-1, 1]) {
    const arm = box(0.06, 0.34, 0.06, SKIN);
    rotate(arm, 0.25, 0, 0);
    parts.push(move(arm, side * 0.13, 0.12, 0.36));
  }
  for (let i = 0; i < 5; i++) {
    const blade = box(0.012, 0.16, 0.012, i % 2 ? "#7cc35a" : "#5ea83f");
    rotate(blade, 0.2 * (i - 2) * 0.5, 0, 0.18 * (i - 2));
    parts.push(move(blade, 0.02 * (i - 2), 0.06, 0.48));
  }
  return scaled(mergeGeometries(parts));
}

/** The net caster standing on the bund, arms forward (the net is its own mesh). */
function fisherGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) parts.push(move(box(0.09, 0.46, 0.1, "#3a4a5c"), side * 0.065, 0, 0));
  parts.push(box(0.26, 0.4, 0.15, "#d9d2c0", 0.44));
  parts.push(move(dome(0.085, 0.09, 0.085, SKIN), 0, 0.86, 0));
  parts.push(move(dome(0.088, 0.05, 0.088, HAIR), 0, 0.93, -0.01));
  for (const side of [-1, 1]) {
    const arm = box(0.06, 0.34, 0.06, SKIN);
    rotate(arm, -1.1, 0, 0);
    parts.push(move(arm, side * 0.15, 0.62, 0.16));
  }
  return scaled(mergeGeometries(parts));
}

function scaled(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.scale(PERSON, PERSON, PERSON);
  return g;
}

/** A round net, unit radius: a shallow open cone of mesh, weighted rim. Its height is set per frame by scale.y. */
function netGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.04, 1, 1, 14, 1, true);
  g.translate(0, 0.5, 0);
  return g;
}

export interface KhazanSpot {
  x: number;
  y: number;
  z: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class KhazanPeople {
  readonly group = new THREE.Group();
  private readonly planters: THREE.InstancedMesh[];
  private readonly fisher: THREE.InstancedMesh;
  private readonly net: THREE.InstancedMesh;
  /** Every mesh, in a fixed list (no array built per frame). */
  private readonly meshes: THREE.InstancedMesh[];
  private spots: KhazanSpot[] = [];
  /** With Calm motion nothing moves: the matrices are written once, until the khazans change. */
  private stillDrawn = false;
  private hidden = false;
  private still = false;

  constructor(scene: THREE.Scene) {
    this.group.name = "khazan-people";
    const body = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, vertexColors: true });
    // The one with the head cover, and the two without (different clothes).
    const covered = planterGeometry(true, "#b8475a", "#7a3d4c");
    const bare = planterGeometry(false, "#d08a2e", "#6b5a3a");
    this.planters = [new THREE.InstancedMesh(covered, body, CAPACITY), new THREE.InstancedMesh(bare, body, CAPACITY * 2)];
    this.fisher = new THREE.InstancedMesh(fisherGeometry(), body, CAPACITY);
    this.net = new THREE.InstancedMesh(netGeometry(), new THREE.MeshBasicMaterial({ color: "#e8e2cf", transparent: true, opacity: 0.6, side: THREE.DoubleSide, wireframe: true, depthWrite: false }), CAPACITY);
    this.meshes = [...this.planters, this.fisher, this.net];
    for (const mesh of this.meshes) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    scene.add(this.group);
  }

  /** The khazans on the board: each one's tile centre, y its tile top. */
  setKhazans(spots: KhazanSpot[]): void {
    this.spots = spots.slice(0, CAPACITY);
    this.stillDrawn = false;
  }

  /** Storms hide everyone (Section 30.6). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.group.visible = !hidden;
  }

  /** Calm motion: everyone holds still and the net stays in hand. */
  setStill(still: boolean): void {
    if (still !== this.still) this.stillDrawn = false;
    this.still = still;
  }

  /** Draw calls this adds when khazans are on the board. */
  get drawCalls(): number {
    return this.spots.length ? 4 : 0;
  }

  tick(nowMs: number): void {
    if (this.hidden || (this.still && this.stillDrawn)) return;
    this.stillDrawn = this.still;
    const n = this.spots.length;
    let covered = 0;
    let bare = 0;
    let nets = 0;
    for (let i = 0; i < n; i++) {
      const k = this.spots[i];
      // Each khazan keeps its own rhythm.
      const offset = (i * 2371) % CYCLE_MS;
      const u = this.still ? 1 : ((nowMs + offset) % CYCLE_MS) / CYCLE_MS;
      for (let j = 0; j < PLANTERS.length; j++) {
        const pl = PLANTERS[j];
        // A slow small dip: deeper into the rows and back, about every 4 s.
        const dip = this.still ? 0 : 0.06 * Math.sin((nowMs + offset + j * 1300) / 640);
        _e.set(dip, pl.yaw, 0);
        _q.setFromEuler(_e);
        _p.set(k.x + pl.x, k.y + 0.03, k.z + pl.z);
        _m.compose(_p, _q, _s.set(1, 1, 1));
        if (pl.cover) this.planters[0].setMatrixAt(covered++, _m);
        else this.planters[1].setMatrixAt(bare++, _m);
      }
      // The caster turns into the throw, then leans back on the pull.
      let yaw = -0.9;
      let lean = 0;
      if (u < WIND) yaw += 0.5 * Math.sin((u / WIND) * Math.PI * 0.5);
      else if (u < FLY) yaw += 0.5 * (1 - (u - WIND) / (FLY - WIND)) - 0.25 * Math.sin(((u - WIND) / (FLY - WIND)) * Math.PI);
      else if (u >= LIE && u < PULL) lean = -0.18 * Math.sin(((u - LIE) / (PULL - LIE)) * Math.PI);
      _e.set(lean, yaw, 0);
      _q.setFromEuler(_e);
      _p.set(k.x + FISHER_AT.x, k.y + FISHER_AT.y, k.z + FISHER_AT.z);
      _m.compose(_p, _q, _s.set(1, 1, 1));
      this.fisher.setMatrixAt(i, _m);
      // The net: flies out spreading, lies flat on the water, is drawn back gathering.
      if (u >= WIND && u < PULL) {
        let r: number;
        let h: number;
        if (u < FLY) {
          const f = (u - WIND) / (FLY - WIND);
          const e = f * (2 - f);
          _p.lerpVectors(HAND, NET_TARGET, e);
          _p.y += 0.14 * Math.sin(f * Math.PI);
          r = 0.02 + (NET_R - 0.02) * e;
          h = 0.1 * (1 - e) + 0.03;
        } else if (u < LIE) {
          const f = (u - FLY) / (LIE - FLY);
          _p.copy(NET_TARGET);
          _p.y -= 0.012 * f;
          r = NET_R;
          h = 0.03 + 0.02 * f;
        } else {
          const f = (u - LIE) / (PULL - LIE);
          const e = f * f;
          _p.lerpVectors(NET_TARGET, HAND, e);
          _p.y += 0.04 * Math.sin(f * Math.PI) - 0.012 * (1 - f);
          r = NET_R + (0.02 - NET_R) * f;
          h = 0.05 + 0.08 * f;
        }
        _p.set(k.x + _p.x, k.y + _p.y, k.z + _p.z);
        _m.compose(_p, _q.identity(), _s.set(r, h, r));
        this.net.setMatrixAt(nets++, _m);
      }
    }
    this.planters[0].count = covered;
    this.planters[1].count = bare;
    this.fisher.count = n;
    this.net.count = nets;
    for (const mesh of this.meshes) if (mesh.count) mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
