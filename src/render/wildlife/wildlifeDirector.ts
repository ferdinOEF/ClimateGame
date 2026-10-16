import * as THREE from "three";
import { beat, restPose, type BirdPose } from "./birdPose";
import { EgretModel } from "./egretModel";
import { KingfisherModel } from "./kingfisherModel";
import { blobShadow, countTriangles, smoothstep } from "./kit";
import { OtterModel } from "./otterModel";
import { Splashes, creatureMesh, fishGeometry, prawnGeometry } from "./pondLife";

/**
 * Schedules and plays the wildlife "moments" (see index.ts for the API and
 * docs/qa/section14/wildlife/README.md for what each moment does).
 *
 * Every mesh is created once in the constructor and reused; `tick()` only
 * rewrites transforms, opacities and a few vertex positions (the egret's
 * neck) through preallocated scratch objects. Time runs on an internal clock
 * that advances by at most 50 ms a frame, so a background tab coming back
 * never fast-forwards a moment.
 */

export type WildlifeKind = "kingfisher" | "egret" | "otter" | "fish" | "prawn";

export interface WildlifePoint {
  x: number;
  y: number;
  z: number;
}

export interface WildlifeSources {
  /** Mangrove tiles: (x, z) the tile centre, y the water surface there. */
  mangroves: WildlifePoint[];
  /** Khazan ponds: the centre of the pond (blue) half, its water height, and its radius. */
  khazanPonds: (WildlifePoint & { radius: number })[];
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WildlifeOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Canvas size in CSS pixels (the space `avoidRects` is in). */
  viewport: () => { width: number; height: number };
  /** Screen rectangles (CSS px, canvas-relative) wildlife must never cross: Maya, the HUD, open cards. */
  avoidRects: () => ScreenRect[];
  random?: () => number;
}

/** Board-scale sizes (a hex tile has circumradius 1). */
const KF_SCALE = 0.15;
const EGRET_SCALE = 0.4;
const OTTER_SCALE = 0.5;
const FISH_SCALE = 0.12;
const PRAWN_SCALE = 0.1;
/** Bounding radius of each bird with wings spread, in world units at its base scale. */
const KF_RADIUS = 0.13;
const EGRET_RADIUS = 0.34;
/** Gap between moments (ms). */
const GAP_MIN = 6000;
const GAP_SPAN = 4000;
/** A flying bird at the end of its path fills about this fraction of half the screen height. */
const END_SCREEN_FRACTION = 0.3;
const EXTRA_SCALE = 0.3;

// --- Scratch (never allocate in tick) -------------------------------------------
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _m = new THREE.Matrix4();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _beat: [number, number] = [0, 0];
const _rect: ScreenRect = { left: 0, top: 0, right: 0, bottom: 0 };

function rectsHit(r: ScreenRect, rects: readonly ScreenRect[], margin: number): boolean {
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    if (r.right + margin > a.left && r.left - margin < a.right && r.bottom + margin > a.top && r.top - margin < a.bottom) return true;
  }
  return false;
}

/**
 * A curved path from a point near the water to a point just in front of the
 * camera, re-anchored to the camera every frame (so panning mid-flight
 * still ends in front of the lens). Cubic Bezier: leaves along the bird's
 * take-off direction, ends heading straight at the camera.
 */
class FlightPath {
  readonly p0 = new THREE.Vector3();
  readonly p1 = new THREE.Vector3();
  readonly p2 = new THREE.Vector3();
  readonly p3 = new THREE.Vector3();
  readonly v0 = new THREE.Vector3();
  endX = 0.4;
  endY = 0.15;
  endDist = 2;
  /** Sideways bulge of the approach, in units of the path length (signed). */
  bulge = 0.2;
  t0 = 0;
  dur = 3000;
  /** Away-flight (a flush): ends away from the camera instead. */
  away = false;
  readonly awayEnd = new THREE.Vector3();

  anchor(camera: THREE.PerspectiveCamera): void {
    if (this.away) {
      this.p3.copy(this.awayEnd);
      _v.copy(this.p3).sub(this.p0);
      const len = _v.length();
      this.p1.copy(this.p0).addScaledVector(this.v0, len * 0.4);
      this.p2.copy(this.p3).addScaledVector(_v.normalize(), -len * 0.3);
      return;
    }
    camera.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, WORLD_UP).normalize();
    _up.crossVectors(_right, _fwd).normalize();
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * this.endDist;
    const halfW = halfH * camera.aspect;
    this.p3.copy(camera.position).addScaledVector(_fwd, this.endDist).addScaledVector(_right, this.endX * halfW).addScaledVector(_up, this.endY * halfH);
    const len = this.p3.distanceTo(this.p0);
    this.p1.copy(this.p0).addScaledVector(this.v0, len * 0.3);
    // Comes in from the side (the bulge) and finishes heading at the lens.
    this.p2.copy(this.p3).addScaledVector(_fwd, len * 0.42).addScaledVector(_right, this.bulge * len);
  }

  /** Position and unit tangent at parameter s. */
  at(s: number, pos: THREE.Vector3, tan: THREE.Vector3): void {
    const u = 1 - s;
    const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    pos.set(0, 0, 0).addScaledVector(this.p0, a).addScaledVector(this.p1, b).addScaledVector(this.p2, c).addScaledVector(this.p3, d);
    const da = -3 * u * u, db = 3 * u * u - 6 * u * s, dc = 6 * u * s - 3 * s * s, dd = 3 * s * s;
    tan.set(0, 0, 0).addScaledVector(this.p0, da).addScaledVector(this.p1, db).addScaledVector(this.p2, dc).addScaledVector(this.p3, dd);
    if (tan.lengthSq() < 1e-12) tan.set(0, 0, 1);
    tan.normalize();
  }
}

/** Which stage a bird is in. */
type BirdStage = "off" | "perch" | "dive" | "under" | "emerge" | "wade" | "crouch" | "takeoff" | "fly" | "flush";

interface BirdActor {
  kind: "kingfisher" | "egret";
  root: THREE.Group;
  pose: BirdPose;
  path: FlightPath;
  stage: BirdStage;
  stageAt: number;
  opacity: number;
  /** Extra fade multiplier (avoid rects, flush). */
  escape: number;
  escaping: boolean;
  flapPhase: number;
  bank: number;
  lastYaw: number;
  baseScale: number;
  radius: number;
  shadow: THREE.Mesh;
  shadowSize: number;
  /** Water height under the moment. */
  waterY: number;
  /** Horizontal yaw of the root while on the ground or perched. */
  yaw: number;
  readonly pos: THREE.Vector3;
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
  seed: number;
}

interface Jumper {
  mesh: THREE.Mesh;
  live: boolean;
  t0: number;
  dur: number;
  height: number;
  prawn: boolean;
  spin: number;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  splashedOut: boolean;
}

export class WildlifeDirector {
  /** Triangles per model (birds with wings, fish/prawn each, otter). */
  readonly triangleCounts: Record<string, number>;
  readonly group = new THREE.Group();

  private readonly opts: WildlifeOptions;
  private readonly random: () => number;
  private readonly kingfisher: KingfisherModel;
  private readonly egret: EgretModel;
  private readonly otter: OtterModel;
  private readonly splashes = new Splashes();
  private readonly jumpers: Jumper[] = [];
  private readonly kf: BirdActor;
  private readonly eg: BirdActor;

  private sources: WildlifeSources = { mangroves: [], khazanPonds: [] };
  private enabled = true;
  private calm = true;
  private clock = 0;
  private lastNow: number | null = null;
  private nextAt = GAP_MIN;
  private active: WildlifeKind | null = null;
  private activeStart = 0;
  /** Starts of every moment (clock ms), for tests and QA. */
  readonly momentLog: { kind: WildlifeKind; at: number; source: number }[] = [];
  /** Pond launch points of the latest fish/prawn moment (world x, z) — for tests. */
  readonly lastLaunches: { x: number; z: number; pond: number }[] = [];

  // Otter state
  private otterAt = 0;
  private otterDiveAt = 0;
  private otterWaterY = 0;
  private otterYawSign = 1;
  private otterLive = false;
  private otterRingDone = false;

  // Pond state
  private pondEnd = 0;

  constructor(opts: WildlifeOptions) {
    this.opts = opts;
    this.random = opts.random ?? Math.random;
    this.group.name = "wildlife";
    opts.scene.add(this.group);

    this.kingfisher = new KingfisherModel();
    this.egret = new EgretModel();
    this.otter = new OtterModel();
    this.group.add(this.kingfisher.root, this.kingfisher.perch, this.egret.root, this.otter.root, this.splashes.group);
    this.otter.root.scale.setScalar(OTTER_SCALE);

    const fishGeo = fishGeometry();
    const prawnGeo = prawnGeometry();
    for (let i = 0; i < 3; i++) {
      for (const prawn of [false, true]) {
        const mesh = creatureMesh(prawn ? prawnGeo : fishGeo, prawn ? 0.45 : 0.3);
        mesh.scale.setScalar(prawn ? PRAWN_SCALE : FISH_SCALE);
        mesh.visible = false;
        this.group.add(mesh);
        this.jumpers.push({ mesh, live: false, t0: 0, dur: 650, height: 0.15, prawn, spin: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), splashedOut: false });
      }
    }

    const mkActor = (kind: "kingfisher" | "egret", root: THREE.Group, baseScale: number, radius: number, shadowSize: number): BirdActor => {
      const shadow = blobShadow(1, 0.34);
      shadow.visible = false;
      this.group.add(shadow);
      return {
        kind, root, pose: restPose(), path: new FlightPath(), stage: "off", stageAt: 0, opacity: 0, escape: 1, escaping: false,
        flapPhase: 0, bank: 0, lastYaw: 0, baseScale, radius, shadow, shadowSize, waterY: 0, yaw: 0,
        pos: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), seed: 0
      };
    };
    this.kf = mkActor("kingfisher", this.kingfisher.root, KF_SCALE, KF_RADIUS, 0.07);
    this.eg = mkActor("egret", this.egret.root, EGRET_SCALE, EGRET_RADIUS, 0.16);

    this.triangleCounts = {
      kingfisher: this.kingfisher.triangles,
      egret: this.egret.triangles,
      otter: this.otter.triangles,
      fish: countTriangles(this.jumpers[0].mesh),
      prawn: countTriangles(this.jumpers[1].mesh),
      kingfisherFish: countTriangles(this.kingfisher.fish),
      perchTwig: countTriangles(this.kingfisher.perch)
    };
    this.hideAll();
  }

  setSources(s: WildlifeSources): void {
    this.sources = s;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.group.visible = on;
    if (!on) this.hideAll();
    else this.nextAt = this.clock + GAP_MIN + this.random() * GAP_SPAN;
  }

  setCalm(calm: boolean): void {
    if (calm === this.calm) return;
    this.calm = calm;
    if (!calm) this.flush();
    else this.nextAt = this.clock + GAP_MIN + this.random() * GAP_SPAN;
  }

  /** True while any moment (or a flush) is still playing. */
  get busy(): boolean {
    return this.active !== null || this.kf.stage !== "off" || this.eg.stage !== "off" || this.otterLive || this.anyJumper();
  }

  /** The moment playing now, if any. */
  get current(): WildlifeKind | null {
    return this.active;
  }

  forceMoment(kind: WildlifeKind, sourceIndex?: number): boolean {
    if (!this.enabled || !this.calm) return false;
    const list = kind === "fish" || kind === "prawn" ? this.sources.khazanPonds : this.sources.mangroves;
    if (!list.length) return false;
    const idx = sourceIndex !== undefined ? sourceIndex : this.pickOnScreen(list);
    if (idx < 0 || idx >= list.length) return false;
    this.hideAll();
    this.start(kind, idx);
    return true;
  }

  tick(nowMs: number): void {
    if (this.lastNow === null) this.lastNow = nowMs;
    const dt = Math.max(0, Math.min(50, nowMs - this.lastNow));
    this.lastNow = nowMs;
    if (!this.enabled) return;
    this.clock += dt;
    const now = this.clock;
    this.opts.camera.updateMatrixWorld();

    if (this.active === null && this.calm && now >= this.nextAt && !this.busy) this.schedule();

    this.tickBird(this.kf, now, dt);
    this.tickBird(this.eg, now, dt);
    this.tickOtter(now);
    this.tickPond(now);
    this.splashes.tick(now);

    if (this.active !== null && !this.busyWith(this.active)) {
      this.active = null;
      this.nextAt = now + GAP_MIN + this.random() * GAP_SPAN;
    }
  }

  dispose(): void {
    this.opts.scene.remove(this.group);
    this.kingfisher.dispose();
    this.egret.dispose();
    this.otter.dispose();
    this.splashes.dispose();
    const seen = new Set<THREE.BufferGeometry>();
    for (const j of this.jumpers) {
      if (!seen.has(j.mesh.geometry)) {
        seen.add(j.mesh.geometry);
        j.mesh.geometry.dispose();
      }
      (j.mesh.material as THREE.Material).dispose();
    }
    for (const a of [this.kf, this.eg]) {
      a.shadow.geometry.dispose();
      (a.shadow.material as THREE.Material).dispose();
    }
  }

  // --- Scheduling ---------------------------------------------------------------

  private busyWith(kind: WildlifeKind): boolean {
    if (kind === "kingfisher") return this.kf.stage !== "off";
    if (kind === "egret") return this.eg.stage !== "off";
    if (kind === "otter") return this.otterLive;
    return this.anyJumper() || this.clock < this.pondEnd;
  }

  private anyJumper(): boolean {
    for (let i = 0; i < this.jumpers.length; i++) if (this.jumpers[i].live) return true;
    return false;
  }

  private schedule(): void {
    const mang = this.pickOnScreen(this.sources.mangroves);
    const pond = this.pickOnScreen(this.sources.khazanPonds);
    const kinds: WildlifeKind[] = [];
    if (mang >= 0) kinds.push("kingfisher", "egret", "otter");
    if (pond >= 0) kinds.push("fish", "prawn");
    if (!kinds.length) {
      // Nothing on screen: look again in a second.
      this.nextAt = this.clock + 1000;
      return;
    }
    const kind = kinds[Math.min(kinds.length - 1, Math.floor(this.random() * kinds.length))];
    this.start(kind, kind === "fish" || kind === "prawn" ? pond : mang);
  }

  /** A random source whose point is on screen and clear of every avoid rect, or -1. */
  private pickOnScreen(list: readonly WildlifePoint[]): number {
    if (!list.length) return -1;
    const n = list.length;
    const startAt = Math.floor(this.random() * n);
    const rects = this.opts.avoidRects();
    for (let k = 0; k < n; k++) {
      const i = (startAt + k) % n;
      if (this.sourceVisible(list[i], rects)) return i;
    }
    return -1;
  }

  private sourceVisible(p: WildlifePoint, rects: readonly ScreenRect[]): boolean {
    _v.set(p.x, p.y, p.z).project(this.opts.camera);
    if (_v.z <= -1 || _v.z >= 1) return false;
    if (Math.abs(_v.x) > 0.8 || Math.abs(_v.y) > 0.78) return false;
    const vp = this.opts.viewport();
    const px = (_v.x * 0.5 + 0.5) * vp.width;
    const py = (-_v.y * 0.5 + 0.5) * vp.height;
    _rect.left = px - 30; _rect.right = px + 30; _rect.top = py - 30; _rect.bottom = py + 30;
    return !rectsHit(_rect, rects, 20);
  }

  private start(kind: WildlifeKind, idx: number): void {
    this.active = kind;
    this.activeStart = this.clock;
    this.momentLog.push({ kind, at: this.clock, source: idx });
    if (this.momentLog.length > 200) this.momentLog.shift();
    if (kind === "kingfisher") this.startKingfisher(this.sources.mangroves[idx]);
    else if (kind === "egret") this.startEgret(this.sources.mangroves[idx]);
    else if (kind === "otter") this.startOtter(this.sources.mangroves[idx]);
    else this.startPond(kind === "prawn", this.sources.khazanPonds[idx], idx);
  }

  private hideAll(): void {
    for (const a of [this.kf, this.eg]) {
      a.stage = "off";
      a.root.visible = false;
      a.shadow.visible = false;
    }
    this.kingfisher.perch.visible = false;
    this.otter.root.visible = false;
    this.otterLive = false;
    for (const j of this.jumpers) {
      j.live = false;
      j.mesh.visible = false;
    }
    this.pondEnd = 0;
    this.splashes.clear();
    this.active = null;
  }

  /** Unit vector on the ground from p toward the camera, and its right-hand side vector. */
  private towardCamera(p: WildlifePoint, out: THREE.Vector3, side: THREE.Vector3): void {
    const cam = this.opts.camera.position;
    out.set(cam.x - p.x, 0, cam.z - p.z);
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
    out.normalize();
    side.set(out.z, 0, -out.x);
  }

  // --- Storm: flush ------------------------------------------------------------------

  private flush(): void {
    const now = this.clock;
    let flushed = false;
    for (const a of [this.kf, this.eg]) {
      if (a.stage === "off") continue;
      if (a.stage === "under") {
        a.stage = "off";
        a.root.visible = false;
        continue;
      }
      this.beginFlush(a, now);
      flushed = true;
    }
    if (this.kingfisher.perch.visible && this.twigFadeAt < 0) this.twigFadeAt = now; // the twig goes too
    if (this.otterLive && now < this.otterDiveAt) this.otterDiveAt = now;
    // No bird out: a short burst from a mangrove on screen instead.
    if (!flushed && this.enabled) {
      const idx = this.pickOnScreen(this.sources.mangroves);
      if (idx >= 0) {
        const m = this.sources.mangroves[idx];
        this.towardCamera(m, _w, _right);
        this.kf.pos.set(m.x + _right.x * 0.2, m.y + 0.45, m.z + _right.z * 0.2);
        this.eg.pos.set(m.x - _right.x * 0.25, m.y + 0.5, m.z - _right.z * 0.25);
        this.kf.waterY = m.y;
        this.eg.waterY = m.y;
        this.beginFlush(this.kf, now, true);
        this.beginFlush(this.eg, now, true);
      }
    }
  }

  private beginFlush(a: BirdActor, now: number, fromCover = false): void {
    const path = a.path;
    path.away = true;
    path.p0.copy(a.pos);
    // Up and away from the camera, fast.
    this.towardCamera(a.pos, _w, _right);
    path.v0.set(-_w.x * 0.5, 1, -_w.z * 0.5).normalize();
    const side = this.random() < 0.5 ? -1 : 1;
    path.awayEnd.copy(a.pos).addScaledVector(_w, -2.2).addScaledVector(_right, side * 0.8).add(_v.set(0, 1.4, 0));
    path.t0 = now;
    path.dur = a.kind === "kingfisher" ? 1100 : 1500;
    a.stage = "flush";
    a.stageAt = now;
    a.escaping = false;
    a.escape = 1;
    if (fromCover) a.opacity = 0;
    a.root.visible = true;
    const p = a.pose;
    p.fold = 0;
    p.legTuck = 1;
    p.carrying = a.kind === "kingfisher" && p.carrying;
    p.neck = a.kind === "egret" ? 0 : 0.3;
    p.bodyPitch = 0.1;
  }

  // --- Kingfisher -----------------------------------------------------------------

  private startKingfisher(m: WildlifePoint): void {
    const a = this.kf;
    this.towardCamera(m, _w, _right);
    const side = this.random() < 0.5 ? -1 : 1;
    // Perch: a bare twig at the tile's camera-facing edge, a little off centre.
    a.a.set(m.x + _w.x * 0.55 + _right.x * 0.18 * side, m.y + 0.16, m.z + _w.z * 0.55 + _right.z * 0.18 * side);
    // Dive point: in front of the perch, on the water.
    a.b.set(a.a.x + _w.x * 0.18 - _right.x * 0.12 * side, m.y, a.a.z + _w.z * 0.18 - _right.z * 0.12 * side);
    a.waterY = m.y;
    // Side-on to the camera, facing the dive point's side.
    a.yaw = Math.atan2(-_right.x * side, -_right.z * side) + 0.35 * side;
    a.stage = "perch";
    a.stageAt = this.clock;
    a.seed = this.random() * 100;
    a.opacity = 0;
    a.escape = 1;
    a.escaping = false;
    a.bank = 0;
    a.root.visible = true;
    a.root.scale.setScalar(KF_SCALE);
    // Hold time on the perch.
    a.path.dur = 2400 + this.random() * 900; // reused as the perch duration until take-off
    const perch = this.kingfisher.perch;
    perch.visible = true;
    perch.position.copy(a.a);
    perch.scale.setScalar(0.055);
    perch.rotation.set(0, this.random() * Math.PI * 2, 0);
    (perch.material as THREE.Material).opacity = 0;
    a.pos.copy(a.a);
    this.twigFadeAt = -1;
  }

  private twigFadeAt = -1;

  private tickKingfisherGround(a: BirdActor, now: number, dt: number): void {
    const t = now - a.stageAt;
    const p = a.pose;
    const perch = this.kingfisher.perch;
    const perchHold = a.path.dur;
    if (a.stage === "perch") {
      a.opacity = Math.min(1, t / 500);
      p.fold = 1;
      p.flap = 0;
      p.legTuck = 0;
      p.carrying = false;
      p.neck = 0;
      p.bodyPitch = 0.72;
      p.bodyRoll = 0;
      p.tailPitch = -0.15 + 0.12 * Math.max(0, Math.sin(t / 260 + a.seed)) * (Math.sin(t / 1300 + a.seed) > 0.6 ? 1 : 0);
      // Head turns now and then (held between quick turns) and bobs.
      const slot = Math.floor((t + a.seed * 40) / 850);
      const target = 0.55 * Math.sin(slot * 2.39 + a.seed);
      p.headYaw += (target - p.headYaw) * Math.min(1, dt / 70);
      const bob = (t % 1700) / 1700;
      p.headPitch = -0.6 - 0.18 * Math.max(0, Math.sin(bob * Math.PI * 6)) * (bob < 0.17 ? 1 : 0);
      p.bodyLift = -0.015 * Math.max(0, Math.sin(bob * Math.PI * 6)) * (bob < 0.17 ? 1 : 0);
      // Feet on the twig: the root sits just above the perch.
      a.pos.set(a.a.x, a.a.y + 0.205 * KF_SCALE, a.a.z);
      a.root.position.copy(a.pos);
      a.root.rotation.set(0, a.yaw, 0);
      perch.visible = true;
      (perch.material as THREE.Material).opacity = a.opacity;
      if (t >= perchHold) {
        a.stage = "dive";
        a.stageAt = now;
        this.twigFadeAt = now;
        // Face the dive point.
        a.yaw = Math.atan2(a.b.x - a.a.x, a.b.z - a.a.z);
        p.headYaw = 0;
      }
    } else if (a.stage === "dive") {
      // Head first, wings tucked: a short drop along an arc to the water.
      const DUR = 380;
      const k = Math.min(1, t / DUR);
      const e = k * k;
      p.fold = 1 - 0.6 * Math.sin(Math.min(1, k * 3) * Math.PI) * (k < 0.33 ? 1 : 0);
      p.flap = 0.3 * (k < 0.33 ? Math.sin(k * 3 * Math.PI) : 0);
      p.bodyPitch = 0.72 + (-1.35 - 0.72) * smoothstep(0, 0.45, k);
      p.headPitch = -0.2 * (1 - k);
      p.headYaw = 0;
      p.neck = smoothstep(0.2, 0.7, k);
      p.legTuck = smoothstep(0, 0.4, k);
      a.pos.set(
        a.a.x + (a.b.x - a.a.x) * k,
        a.a.y + 0.205 * KF_SCALE + 0.04 * Math.sin(k * Math.PI) * (1 - k) + (a.b.y - a.a.y - 0.205 * KF_SCALE) * e,
        a.a.z + (a.b.z - a.a.z) * k
      );
      a.root.position.copy(a.pos);
      a.root.rotation.set(0, a.yaw, 0);
      if (k >= 1) {
        this.splashes.ring(now, a.b.x, a.waterY, a.b.z, 0.16, 900);
        this.splashes.ring(now + 0, a.b.x, a.waterY, a.b.z, 0.09, 600);
        this.splashes.burst(now, a.b.x, a.waterY, a.b.z, 14, 0.75, 0.007, this.random);
        a.stage = "under";
        a.stageAt = now;
        a.root.visible = false;
      }
    } else if (a.stage === "under") {
      if (t >= 520) {
        a.stage = "emerge";
        a.stageAt = now;
        a.root.visible = true;
        p.carrying = true;
        this.splashes.ring(now, a.b.x, a.waterY, a.b.z, 0.1, 700);
        this.splashes.burst(now, a.b.x, a.waterY, a.b.z, 9, 0.55, 0.006, this.random);
      }
    } else if (a.stage === "emerge") {
      // Bursts up out of the water, fish in the bill, beating hard.
      const DUR = 420;
      const k = Math.min(1, t / DUR);
      a.flapPhase += (dt / 1000) * 11;
      beat(a.flapPhase, _beat);
      p.fold = 1 - smoothstep(0, 0.35, k);
      p.flap = 0.65 * _beat[0];
      p.wristFlex = 0.6 * _beat[1];
      p.spread = 1;
      p.twist = 0.1;
      p.bodyPitch = 1.0 - 0.6 * k;
      p.headPitch = -0.3;
      p.neck = 0.3;
      p.legTuck = 1;
      this.towardCamera(a.b, _w, _right);
      a.pos.set(a.b.x + _w.x * 0.05 * k, a.waterY - 0.03 + 0.24 * (1 - (1 - k) * (1 - k)), a.b.z + _w.z * 0.05 * k);
      a.root.position.copy(a.pos);
      a.root.rotation.set(0, a.yaw, 0);
      if (k >= 1) {
        const path = a.path;
        path.away = false;
        path.p0.copy(a.pos);
        path.v0.set(Math.sin(a.yaw) * 0.6 + _w.x * 0.4, 0.9, Math.cos(a.yaw) * 0.6 + _w.z * 0.4).normalize();
        this.planEnd(a);
        path.t0 = now;
        path.dur = 3300;
        path.anchor(this.opts.camera);
        a.lastYaw = a.yaw;
        a.stage = "fly";
        a.stageAt = now;
      }
    }
    // The twig fades once the bird has left it.
    if (this.twigFadeAt >= 0) {
      const f = 1 - Math.min(1, (now - this.twigFadeAt) / 700);
      (perch.material as THREE.Material).opacity = f * (a.stage === "perch" ? a.opacity : 1);
      if (f <= 0) {
        perch.visible = false;
        this.twigFadeAt = -1;
      }
    }
  }

  // --- Egret --------------------------------------------------------------------------

  private egretSteps = 3;
  private egretStepDur = 1150;
  private egretStride = 0.2;

  private startEgret(m: WildlifePoint): void {
    const a = this.eg;
    this.towardCamera(m, _w, _right);
    const side = this.random() < 0.5 ? -1 : 1;
    // Wades across the camera's view along the tile's near edge.
    a.a.set(m.x + _w.x * 0.5 - _right.x * 0.22 * side, m.y - 0.035, m.z + _w.z * 0.5 - _right.z * 0.22 * side);
    a.b.set(_right.x * side, 0, _right.z * side); // walking direction
    a.yaw = Math.atan2(a.b.x, a.b.z);
    a.waterY = m.y;
    a.stage = "wade";
    a.stageAt = this.clock;
    a.opacity = 0;
    a.escape = 1;
    a.escaping = false;
    a.bank = 0;
    a.flapPhase = 0;
    a.root.visible = true;
    a.root.scale.setScalar(EGRET_SCALE);
    this.egretSteps = 3 + (this.random() < 0.4 ? 1 : 0);
    const p = a.pose;
    p.fold = 1; p.flap = 0; p.legTuck = 0; p.neck = 0.5; p.neckThrust = 0; p.bodyLift = 0; p.bodyPitch = 0.12; p.bodyRoll = 0;
    p.headYaw = 0; p.headPitch = -0.05;
    a.pos.copy(a.a);
  }

  private tickEgretGround(a: BirdActor, now: number, dt: number): void {
    const t = now - a.stageAt;
    const p = a.pose;
    const eg = this.egret;
    const L = this.egretStride;
    const T = this.egretStepDur;
    const fadeIn = 600;
    if (a.stage === "wade") {
      a.opacity = Math.min(1, t / fadeIn);
      const walkT = Math.max(0, t - fadeIn);
      const steps = this.egretSteps;
      const stepF = Math.min(steps, walkT / T);
      const i = Math.min(steps - 1, Math.floor(stepF));
      const u = stepF - i; // phase within the current step
      // Body glides forward half a stride per step, easing within the step.
      const doneWalking = stepF >= steps;
      const iEff = doneWalking ? steps : i;
      const s = (L / 2) * (doneWalking ? steps : i + smoothstep(0, 1, u));
      for (let f = 0; f < 2; f++) {
        // Foot 1 steps on even steps, foot 0 on odd ones; each step is one stride.
        const moving = !doneWalking && f === (i % 2 === 0 ? 1 : 0);
        const completed = f === 1 ? Math.ceil(iEff / 2) : Math.floor(iEff / 2);
        let fz = (f === 0 ? L / 4 : -L / 4) + L * completed;
        let lift = 0;
        if (moving) {
          fz += L * smoothstep(0.12, 0.85, u);
          lift = 0.07 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.1) / 0.78)));
        }
        eg.feet[f].set(f === 0 ? 0.04 : -0.04, lift, fz - s);
        eg.footLift[f] = lift;
      }
      // Neck pulls back as the foot lifts, then thrusts forward as it lands.
      const moving = stepF < steps;
      p.neckThrust = moving ? -Math.cos(u * Math.PI * 2) * 0.8 : p.neckThrust * 0.9;
      p.neck = 0.5 + 0.06 * Math.sin(u * Math.PI);
      p.headPitch = -0.05 + 0.08 * Math.sin(u * Math.PI * 2);
      p.bodyPitch = 0.12 + 0.03 * Math.sin(u * Math.PI * 2);
      p.bodyLift = -0.012 * Math.sin(u * Math.PI);
      p.fold = 1;
      p.legTuck = 0;
      a.pos.set(a.a.x + a.b.x * s * EGRET_SCALE, a.a.y, a.a.z + a.b.z * s * EGRET_SCALE);
      a.root.position.copy(a.pos);
      a.root.rotation.set(0, a.yaw, 0);
      if (walkT >= steps * T + 450) {
        a.stage = "crouch";
        a.stageAt = now;
      }
    } else if (a.stage === "crouch") {
      // Crouch and push: legs bend, the body dips and the wings open.
      const DUR = 620;
      const k = Math.min(1, t / DUR);
      const dip = k < 0.6 ? smoothstep(0, 0.6, k) : 1 - smoothstep(0.6, 1, k) * 1.6;
      p.bodyLift = -0.09 * dip;
      p.bodyPitch = 0.12 + 0.25 * k;
      p.neck = 0.5 - 0.15 * k;
      p.neckThrust = 0.3 * k;
      p.fold = 1 - smoothstep(0.25, 0.8, k);
      p.flap = 0.9 * smoothstep(0.3, 0.75, k) - 1.6 * smoothstep(0.82, 1, k);
      p.spread = 1;
      a.root.position.copy(a.pos);
      if (k >= 1) {
        a.stage = "takeoff";
        a.stageAt = now;
        a.flapPhase = 0.42; // straight into the upstroke after the push's downstroke
      }
    } else if (a.stage === "takeoff") {
      // Lifts off: slow deep beats, legs swing back to trail, neck folds.
      const DUR = 900;
      const k = Math.min(1, t / DUR);
      a.flapPhase += (dt / 1000) * 2.6;
      beat(a.flapPhase, _beat);
      p.fold = 0;
      p.flap = 0.85 * _beat[0];
      p.wristFlex = 0.7 * _beat[1];
      p.twist = 0.12;
      p.bodyLift = 0.3 * k;
      p.bodyPitch = 0.35 - 0.25 * k;
      p.legTuck = smoothstep(0.1, 0.9, k);
      p.neck = 0.35 * (1 - smoothstep(0.2, 1, k));
      p.neckThrust = 0;
      a.pos.set(a.pos.x + a.b.x * dt * 0.00012, a.a.y + 0.22 * k * k, a.pos.z + a.b.z * dt * 0.00012);
      a.root.position.copy(a.pos);
      if (k >= 1) {
        // Fold the body lift into the root so the path starts where the bird is.
        a.pos.y += p.bodyLift * EGRET_SCALE;
        p.bodyLift = 0;
        const path = a.path;
        path.away = false;
        path.p0.copy(a.pos);
        this.towardCamera(a.pos, _w, _right);
        path.v0.set(a.b.x * 0.7 + _w.x * 0.3, 0.55, a.b.z * 0.7 + _w.z * 0.3).normalize();
        this.planEnd(a);
        path.t0 = now;
        path.dur = 4600;
        path.anchor(this.opts.camera);
        a.lastYaw = a.yaw;
        a.stage = "fly";
        a.stageAt = now;
      }
    }
  }

  // --- Shared flight -------------------------------------------------------------------

  /** Chooses where on screen the approach ends: the side clear of every avoid rect. */
  private planEnd(a: BirdActor): void {
    const path = a.path;
    const cam = this.opts.camera;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const rEnd = a.radius * (1 + EXTRA_SCALE);
    path.endDist = Math.max(1, rEnd / (END_SCREEN_FRACTION * halfTan));
    const camDist = cam.position.distanceTo(path.p0);
    path.endDist = Math.min(path.endDist, camDist * 0.6);
    const vp = this.opts.viewport();
    const rects = this.opts.avoidRects();
    const rPx = (rEnd / (path.endDist * halfTan)) * (vp.height / 2);
    // Prefer the side the bird is already on, so it does not cut across the board.
    _v.copy(path.p0).project(cam);
    const sx = _v.x >= 0 ? 1 : -1;
    const cands = CANDIDATES;
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < cands.length; i++) {
      const cx = cands[i][0] * sx;
      const cy = cands[i][1];
      const px = (cx * 0.5 + 0.5) * vp.width;
      const py = (-cy * 0.5 + 0.5) * vp.height;
      _rect.left = px - rPx; _rect.right = px + rPx; _rect.top = py - rPx; _rect.bottom = py + rPx;
      const clear = !rectsHit(_rect, rects, 24);
      const score = (clear ? 10 : 0) - i * 0.5 + this.random() * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    path.endX = cands[best][0] * sx;
    path.endY = cands[best][1];
    path.bulge = (this.random() < 0.5 ? -1 : 1) * (0.3 + this.random() * 0.15);
  }

  private tickFlight(a: BirdActor, now: number, dt: number): void {
    const path = a.path;
    const t = Math.min(1, (now - path.t0) / path.dur);
    const s = path.away ? t : t * (1.5 - 0.5 * t); // eases in toward the camera
    path.anchor(this.opts.camera);
    path.at(s, a.pos, _tan);
    a.root.position.copy(a.pos);

    // Banking: roll into the turn, from the heading's rate of change.
    const yaw = Math.atan2(_tan.x, _tan.z);
    let dyaw = yaw - a.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    a.lastYaw = yaw;
    const rate = dt > 0 ? dyaw / (dt / 1000) : 0;
    const bankTarget = Math.max(-0.75, Math.min(0.75, -rate * 0.45));
    a.bank += (bankTarget - a.bank) * Math.min(1, dt / 160);

    // Orientation from the tangent (+Z along the path), then the bank. The
    // climb toward a camera that looks down from above is mostly hidden from
    // the body's pitch (a bird climbing gently keeps its back level), so the
    // player sees its back and spread wings rather than its belly.
    _tan.y *= path.away ? 0.6 : 0.3;
    _tan.normalize();
    _m.lookAt(_tan, _zero, WORLD_UP);
    a.root.quaternion.setFromRotationMatrix(_m);
    const p = a.pose;
    p.bodyRoll = a.bank;
    p.bodyPitch = 0.04;

    // Wing beats: fast and shallow with short glides (kingfisher), slow and
    // deep (egret). A flush beats faster still.
    const kf = a.kind === "kingfisher";
    let freq = kf ? 9.5 : 2.5;
    let amp = kf ? 0.5 : 0.85;
    if (a.stage === "flush") {
      freq *= 1.3;
      amp *= 1.1;
    }
    let glide = 0;
    if (kf && a.stage !== "flush") {
      // A short glide in every ~1.1 s, wings held level and slightly raised.
      const g = ((now - path.t0) % 1100) / 1100;
      glide = g > 0.68 && g < 0.9 ? Math.sin(((g - 0.68) / 0.22) * Math.PI) : 0;
    }
    a.flapPhase += (dt / 1000) * freq * (1 - 0.85 * glide);
    beat(a.flapPhase, _beat);
    p.fold = 0;
    p.flap = amp * _beat[0] * (1 - glide) + 0.12 * glide;
    p.wristFlex = (kf ? 0.55 : 0.7) * _beat[1] * (1 - glide);
    p.twist = 0.1;
    p.spread = 1;
    p.legTuck = 1;
    if (!kf) {
      p.neck += (0 - p.neck) * Math.min(1, dt / 300);
      p.neckThrust = 0;
      p.headPitch = 0.05;
    } else {
      p.neck = 0.3;
      p.headPitch = -0.08;
    }
    p.headYaw = 0;
    p.bodyLift = 0;

    // Grows naturally with perspective, plus a slight extra scale-up.
    const scale = a.baseScale * (1 + EXTRA_SCALE * (path.away ? 0 : s * s));
    a.root.scale.setScalar(scale);

    // Fades: before the near plane (distance), when an avoid rect would be
    // crossed (escape), at the end of a flush.
    const cam = this.opts.camera;
    const dist = cam.position.distanceTo(a.pos);
    let o = 1;
    if (path.away) o = 1 - smoothstep(0.45, 1, t);
    else o = 1 - smoothstep(path.endDist * 1.4, path.endDist * 1.03, dist) - smoothstep(0.9, 1, t);
    // A flush from cover fades in quickly.
    if (path.away && now - path.t0 < 160 && a.opacity < 1) o = Math.min(o, (now - path.t0) / 160);
    if (!a.escaping && this.boundsHitAvoid(a, scale)) a.escaping = true;
    if (a.escaping) a.escape = Math.max(0, a.escape - dt / 260);
    a.opacity = Math.max(0, Math.min(1, o)) * a.escape;
    if (dist < cam.near * 6) a.opacity = 0;
    if (t >= 1 || a.opacity <= 0.001) {
      a.stage = "off";
      a.root.visible = false;
      a.shadow.visible = false;
    }
  }

  /** Would the bird's projected bounds enter an avoid rect? */
  private boundsHitAvoid(a: BirdActor, scale: number): boolean {
    const cam = this.opts.camera;
    _v.copy(a.pos).project(cam);
    if (_v.z <= -1 || _v.z >= 1) return false;
    const vp = this.opts.viewport();
    const dist = Math.max(0.001, cam.position.distanceTo(a.pos));
    const halfTan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const r = ((a.radius * scale) / a.baseScale / (dist * halfTan)) * (vp.height / 2);
    const px = (_v.x * 0.5 + 0.5) * vp.width;
    const py = (-_v.y * 0.5 + 0.5) * vp.height;
    _rect.left = px - r; _rect.right = px + r; _rect.top = py - r; _rect.bottom = py + r;
    return rectsHit(_rect, this.opts.avoidRects(), 8);
  }

  private tickBird(a: BirdActor, now: number, dt: number): void {
    if (a.stage === "off") {
      if (a.kind === "kingfisher" && this.twigFadeAt >= 0) this.tickKingfisherGround(a, now, dt);
      return;
    }
    if (a.stage === "fly" || a.stage === "flush") {
      this.tickFlight(a, now, dt);
      if (a.kind === "kingfisher" && this.twigFadeAt >= 0) {
        const perch = this.kingfisher.perch;
        const f = 1 - Math.min(1, (now - this.twigFadeAt) / 700);
        (perch.material as THREE.Material).opacity = f;
        if (f <= 0) {
          perch.visible = false;
          this.twigFadeAt = -1;
        }
      }
    } else {
      if (a.kind === "kingfisher") this.tickKingfisherGround(a, now, dt);
      else this.tickEgretGround(a, now, dt);
      // On the perch or wading: if an avoid rect (a card, a HUD panel) comes
      // over the bird, it fades away and the moment ends.
      if ((a.stage as BirdStage) !== "under" && (a.stage as BirdStage) !== "off") {
        if (!a.escaping && this.boundsHitAvoid(a, a.root.scale.x)) a.escaping = true;
        if (a.escaping) {
          a.escape = Math.max(0, a.escape - dt / 260);
          a.opacity *= a.escape;
          if (a.escape <= 0) {
            a.stage = "off";
            a.root.visible = false;
            a.shadow.visible = false;
            if (a.kind === "kingfisher" && this.twigFadeAt < 0 && this.kingfisher.perch.visible) this.twigFadeAt = now;
          }
        }
      }
    }
    if ((a.stage as BirdStage) === "off") return; // the stage may have ended above

    if (a.kind === "kingfisher") {
      this.kingfisher.applyPose(a.pose);
      this.kingfisher.setOpacity(a.opacity);
    } else {
      this.egret.applyPose(a.pose);
      this.egret.setOpacity(a.opacity);
    }
    // Soft blob shadow on the water, only while near the surface.
    const h = a.pos.y - a.waterY;
    const near = 1 - smoothstep(0.05, 0.55, h);
    const sh = a.shadow;
    if (near > 0.01 && a.root.visible && a.stage !== "under") {
      sh.visible = true;
      sh.position.set(a.pos.x, a.waterY + 0.004, a.pos.z);
      const size = a.shadowSize * (1 + h * 0.8);
      sh.scale.set(size, 1, size);
      (sh.material as THREE.MeshBasicMaterial).opacity = near * a.opacity;
    } else sh.visible = false;
  }

  // --- Otter ----------------------------------------------------------------------------

  private startOtter(m: WildlifePoint): void {
    this.towardCamera(m, _w, _right);
    const side = this.random() < 0.5 ? -1 : 1;
    const o = this.otter.root;
    o.position.set(m.x + _w.x * 0.6 + _right.x * 0.25 * side, m.y, m.z + _w.z * 0.6 + _right.z * 0.25 * side);
    this.otterYawSign = side;
    // Side-on to the camera.
    o.rotation.set(0, Math.atan2(_right.x * side, _right.z * side), 0);
    this.otterWaterY = m.y;
    this.otterAt = this.clock;
    this.otterDiveAt = this.clock + 3400 + this.random() * 1200;
    this.otterLive = true;
    this.otterRingDone = false;
    o.visible = true;
    this.splashes.ring(this.clock, o.position.x, m.y, o.position.z, 0.14, 1100);
  }

  private tickOtter(now: number): void {
    if (!this.otterLive) return;
    const o = this.otter.root;
    const t = now - this.otterAt;
    const surf = smoothstep(0, 700, t);
    const dive = Math.max(0, (now - this.otterDiveAt) / 1100);
    // Surfaces from below, bobs gently while it looks around.
    const bob = 0.004 * Math.sin(t / 380);
    // Rides low: head and a line of back above the surface, the rest below it.
    o.position.y = this.otterWaterY - 0.012 - 0.08 * (1 - surf) + bob * (1 - Math.min(1, dive));
    const look = t / 1000;
    const yaw = 0.7 * Math.sin(look * 1.3 + 0.5) * Math.min(1, t / 900);
    const pitch = 0.15 * Math.sin(look * 0.9) - 0.05;
    // Head and shoulders raised while it looks around ("periscoping").
    const raise = smoothstep(300, 1100, t) * (1 - smoothstep(0, 0.3, dive));
    this.otter.applyPose(yaw, pitch, dive, raise);
    this.otter.setOpacity(Math.min(1, t / 400) * (1 - smoothstep(0.85, 1, dive)));
    if (dive > 0.25 && !this.otterRingDone) {
      this.otterRingDone = true;
      this.splashes.ring(now, o.position.x, this.otterWaterY, o.position.z, 0.16, 1200);
      this.splashes.burst(now, o.position.x, this.otterWaterY, o.position.z, 6, 0.45, 0.006, this.random);
    }
    if (dive >= 1) {
      this.otterLive = false;
      o.visible = false;
    }
  }

  // --- Fish and prawns -------------------------------------------------------------------

  private startPond(prawn: boolean, pond: WildlifePoint & { radius: number }, idx: number): void {
    const count = prawn ? 1 + Math.floor(this.random() * 3) : 1 + Math.floor(this.random() * 2);
    this.lastLaunches.length = 0;
    let made = 0;
    let last = this.clock;
    for (const j of this.jumpers) {
      if (made >= count) break;
      if (j.prawn !== prawn || j.live) continue;
      // Launch inside 60% of the radius, land inside the rest: never out of the pond half.
      const r0 = pond.radius * 0.6 * Math.sqrt(this.random());
      const a0 = this.random() * Math.PI * 2;
      j.from.set(pond.x + Math.cos(a0) * r0, pond.y, pond.z + Math.sin(a0) * r0);
      const a1 = this.random() * Math.PI * 2;
      const len = pond.radius * (0.2 + 0.2 * this.random());
      j.to.set(j.from.x + Math.cos(a1) * len, pond.y, j.from.z + Math.sin(a1) * len);
      j.t0 = this.clock + made * (prawn ? 260 : 420);
      j.dur = prawn ? 520 : 680;
      j.height = prawn ? 0.13 : 0.19;
      j.spin = (this.random() - 0.5) * 2;
      j.live = true;
      j.splashedOut = false;
      j.mesh.visible = false;
      this.lastLaunches.push({ x: j.from.x, z: j.from.z, pond: idx });
      last = j.t0 + j.dur;
      made++;
    }
    this.pondEnd = last + 900;
  }

  private tickPond(now: number): void {
    for (const j of this.jumpers) {
      if (!j.live) continue;
      const k = (now - j.t0) / j.dur;
      if (k < 0) continue;
      if (!j.splashedOut) {
        j.splashedOut = true;
        this.splashes.ring(now, j.from.x, j.from.y, j.from.z, j.prawn ? 0.06 : 0.08, 700);
        this.splashes.burst(now, j.from.x, j.from.y, j.from.z, 4, 0.4, 0.0045, this.random);
      }
      if (k >= 1) {
        j.live = false;
        j.mesh.visible = false;
        this.splashes.ring(now, j.to.x, j.to.y, j.to.z, j.prawn ? 0.06 : 0.085, 750);
        this.splashes.burst(now, j.to.x, j.to.y, j.to.z, 5, 0.42, 0.0045, this.random);
        continue;
      }
      const m = j.mesh;
      m.visible = true;
      const y = j.from.y + 4 * j.height * k * (1 - k) - 0.01;
      m.position.set(j.from.x + (j.to.x - j.from.x) * k, y, j.from.z + (j.to.z - j.from.z) * k);
      // Nose follows the arc; a fish flexes, a prawn flicks tail-first and tumbles.
      const dx = j.to.x - j.from.x;
      const dz = j.to.z - j.from.z;
      const horiz = Math.hypot(dx, dz) / j.dur;
      const vy = (4 * j.height * (1 - 2 * k)) / j.dur;
      const pitch = Math.atan2(vy, horiz);
      const heading = Math.atan2(dx, dz);
      if (j.prawn) m.rotation.set(pitch + k * 2.4 * j.spin, heading + Math.PI, 0.4 * j.spin, "YXZ");
      else m.rotation.set(-pitch, heading, 0.25 * Math.sin(k * Math.PI * 4), "YXZ");
      (m.material as THREE.Material).opacity = Math.min(1, k * 10, (1 - k) * 10);
    }
  }
}

/** End-of-approach screen positions (NDC), tried in order; x is mirrored to the bird's side. */
const CANDIDATES: readonly (readonly [number, number])[] = [
  [0.42, 0.12],
  [0.4, -0.22],
  [0.15, 0.3],
  [-0.3, 0.12],
  [-0.35, -0.22],
  [0.0, -0.05]
];

