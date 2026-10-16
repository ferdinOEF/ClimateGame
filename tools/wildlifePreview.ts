/**
 * Wildlife preview (served by Vite at /tools/wildlifePreview.html).
 *
 * Two modes, both driven from outside by tools/wildlifeShots.ts through
 * `window.__wl` so every frame is deterministic:
 *
 *   - model close-ups on a neutral background (`__wl.model(...)`), lit like
 *     the game (the same sun and hemisphere light as src/render/scene.ts);
 *   - moments on a small mock board (`__wl.board()`, `__wl.moment(...)`,
 *     `__wl.at(ms)`): water, a mangrove tile and a khazan tile, the game's
 *     camera angle, and the real WildlifeDirector stepped in fake time.
 *
 * No game code is imported except src/render/wildlife.
 */
import * as THREE from "three";
import { restPose, beat, type BirdPose } from "../src/render/wildlife/birdPose";
import { KingfisherModel } from "../src/render/wildlife/kingfisherModel";
import { EgretModel } from "../src/render/wildlife/egretModel";
import { OtterModel } from "../src/render/wildlife/otterModel";
import { fishGeometry, prawnGeometry, creatureMesh } from "../src/render/wildlife/pondLife";
import { WildlifeDirector, type WildlifeSources } from "../src/render/wildlife";

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const NEUTRAL = new THREE.Color("#c8ced2");
const SKY = new THREE.Color("#CFE6E8");
scene.background = NEUTRAL.clone();
const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
sun.position.set(-8, 14, 6);
scene.add(sun);
scene.add(new THREE.HemisphereLight(SKY.getHex(), 0x3a3a2a, 0.65));

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// --- Model close-ups ---------------------------------------------------------

const stage = new THREE.Group();
scene.add(stage);
let kingfisher: KingfisherModel | null = null;
let egret: EgretModel | null = null;
let otter: OtterModel | null = null;
const pose: BirdPose = restPose();
const tmpBeat: [number, number] = [0, 0];

function clearStage(): void {
  while (stage.children.length) stage.remove(stage.children[0]);
}

function frame(target: THREE.Vector3, radius: number, az: number, el: number): void {
  const d = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.08;
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  camera.position.set(target.x + Math.sin(a) * Math.cos(e) * d, target.y + Math.sin(e) * d, target.z + Math.cos(a) * Math.cos(e) * d);
  camera.lookAt(target);
}

function kingfisherPose(name: string): void {
  Object.assign(pose, restPose());
  if (name === "perch") {
    pose.bodyPitch = 0.72;
    pose.headPitch = -0.6;
    pose.tailPitch = -0.15;
    pose.neck = 0;
  } else if (name === "flight" || name === "flightUp") {
    beat(name === "flight" ? 0.3 : 0.75, tmpBeat);
    pose.fold = 0;
    pose.flap = 0.55 * tmpBeat[0];
    pose.wristFlex = 0.7 * tmpBeat[1];
    pose.twist = 0.08;
    pose.bodyPitch = 0.08;
    pose.headPitch = -0.12;
    pose.legTuck = 1;
    pose.carrying = true;
    pose.neck = 0.3;
  } else if (name === "dive") {
    pose.fold = 1;
    pose.bodyPitch = -1.2;
    pose.headPitch = 0.1;
    pose.neck = 1;
    pose.legTuck = 1;
  }
}

function egretPose(name: string): void {
  Object.assign(pose, restPose());
  if (name === "wade") {
    pose.neck = 0.55;
    pose.bodyPitch = 0.12;
  } else if (name === "flight") {
    beat(0.25, tmpBeat);
    pose.fold = 0;
    pose.flap = 0.75 * tmpBeat[0];
    pose.wristFlex = 0.5 * tmpBeat[1];
    pose.neck = 0;
    pose.legTuck = 1;
    pose.bodyPitch = 0.05;
  } else if (name === "flightUp") {
    beat(0.8, tmpBeat);
    pose.fold = 0;
    pose.flap = 0.75 * tmpBeat[0];
    pose.wristFlex = 0.6 * tmpBeat[1];
    pose.neck = 0;
    pose.legTuck = 1;
  }
}

interface Api {
  ready: boolean;
  model(kind: string, poseName: string, az: number, el: number, zoom?: number): string;
  board(): void;
  moment(kind: string): boolean;
  at(ms: number): void;
  /** Runs a whole moment off-screen and returns [ms, stage] at every stage change. */
  timeline(kind: string): [number, string][];
  /** Screen position (px) of the animal now on stage, for close-up crops. */
  focus(): { x: number; y: number; stage: string } | null;
  counts(): Record<string, number>;
}

const api: Api = {
  ready: true,
  model(kind, poseName, az, el, zoom = 1) {
    leaveBoard();
    clearStage();
    scene.background = NEUTRAL.clone();
    let obj: THREE.Object3D;
    if (kind === "kingfisher") {
      kingfisher ??= new KingfisherModel();
      (window as unknown as { __kf: KingfisherModel }).__kf = kingfisher;
      kingfisherPose(poseName);
      kingfisher.applyPose(pose);
      kingfisher.setOpacity(1);
      obj = kingfisher.root;
      kingfisher.root.scale.setScalar(1);
      kingfisher.root.position.set(0, 0, 0);
      kingfisher.root.rotation.set(0, 0, 0);
      if (poseName === "perch") {
        // Lay the twig horizontally under the feet, across the bird.
        kingfisher.perch.scale.setScalar(0.3);
        kingfisher.perch.rotation.set(0, 0, Math.PI / 2);
        kingfisher.perch.position.set(-0.48, -0.25, 0.06);
        stage.add(kingfisher.perch);
      }
    } else if (kind === "egret") {
      egret ??= new EgretModel();
      egretPose(poseName);
      egret.applyPose(pose);
      egret.setOpacity(1);
      obj = egret.root;
      egret.root.position.set(0, 0, 0);
      egret.root.rotation.set(0, 0, 0);
    } else if (kind === "otter") {
      otter ??= new OtterModel();
      otter.applyPose(poseName === "look" ? 0.6 : 0, 0, 0);
      otter.setOpacity(1);
      obj = otter.root;
    } else if (kind === "fish") {
      obj = creatureMesh(fishGeometry(), 0.35);
    } else {
      obj = creatureMesh(prawnGeometry(), 0.45);
    }
    stage.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    frame(sphere.center, sphere.radius / zoom, az, el);
    renderer.render(scene, camera);
    return `r=${sphere.radius.toFixed(3)}`;
  },
  board() {
    enterBoard();
  },
  moment(kind) {
    enterBoard();
    resetDirector();
    return director!.forceMoment(kind as "kingfisher", 0);
  },
  timeline(kind) {
    enterBoard();
    resetDirector();
    director!.forceMoment(kind as "kingfisher", 0);
    const out: [number, string][] = [];
    let last = "";
    for (let t = 0; t < 20000; t += 1000 / 60) {
      director!.tick(t);
      const st = stageOf();
      if (st !== last) {
        out.push([Math.round(t), st]);
        last = st;
      }
      if (st === "off" && t > 200) break;
    }
    resetDirector();
    return out;
  },
  focus() {
    if (!director) return null;
    const d = director as unknown as { kf: { stage: string; pos: THREE.Vector3 }; eg: { stage: string; pos: THREE.Vector3 }; otter: { root: THREE.Object3D }; lastLaunches: { x: number; z: number }[] };
    let p: THREE.Vector3 | null = null;
    if (d.kf.stage !== "off") p = d.kf.pos.clone();
    else if (d.eg.stage !== "off") p = d.eg.pos.clone();
    else if (d.otter.root.visible) p = d.otter.root.position.clone();
    else if (d.lastLaunches.length) p = new THREE.Vector3(d.lastLaunches[0].x, 0.05, d.lastLaunches[0].z);
    if (!p) return null;
    p.project(camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, stage: stageOf() };
  },
  at(ms) {
    director!.tick(ms);
    renderer.render(scene, camera);
  },
  counts() {
    if (director) return { ...director.triangleCounts };
    return {
      kingfisher: (kingfisher ??= new KingfisherModel()).triangles,
      egret: (egret ??= new EgretModel()).triangles,
      otter: (otter ??= new OtterModel()).triangles
    };
  }
};

// --- Mock board --------------------------------------------------------------

const board = new THREE.Group();
let director: WildlifeDirector | null = null;
let onBoard = false;

function hexPrism(color: number, height: number): THREE.Mesh {
  // Pointy-top hexes like the game's (src/core/hex.ts axialToWorld, size 1).
  const g = new THREE.CylinderGeometry(0.985, 0.985, height, 6, 1);
  g.translate(0, -height / 2, 0);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
}

function buildBoard(): void {
  // A strip of tiles like the game's: water around a mangrove tile and a khazan tile.
  const W = Math.sqrt(3);
  const tiles: [number, number, number, number][] = [];
  for (let q = -3; q <= 3; q++) {
    for (let r = -2; r <= 2; r++) {
      const x = W * (q + r / 2);
      const z = 1.5 * r;
      tiles.push([x, z, 0x3f8fa8, 0]);
    }
  }
  for (const [x, z, c] of tiles) {
    const t = hexPrism(c, 0.4);
    t.position.set(x, 0, z);
    board.add(t);
  }
  // Mangrove tile (muddy, with stilt roots and canopies), at the origin.
  const mud = hexPrism(0x6f8a5a, 0.4);
  mud.position.set(0, 0.02, 0);
  board.add(mud);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x1f6e66, roughness: 0.9, flatShading: true });
  const rootMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9, flatShading: true });
  for (const [x, z, s] of [[0, 0, 1], [-0.1, -0.24, 0.7], [0.08, 0.26, 0.7]] as [number, number, number][]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.32 * s, 8, 6), canopyMat);
    c.scale.y = 0.75;
    c.position.set(x, 0.02 + 0.45 * s, z);
    board.add(c);
    for (const a of [-0.55, -0.2, 0.2, 0.55]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.045 * s, 0.32 * s, 5), rootMat);
      r.position.set(x + Math.sin(a) * 0.08 * s, 0.02 + 0.16 * s, z);
      r.rotation.z = a;
      board.add(r);
    }
  }
  // Khazan tile to the right: pond half (blue) and paddy half (green).
  const kx = W * 2;
  const kz = 0;
  const pond = hexPrism(0x4a90a4, 0.4);
  pond.position.set(kx, 0.0, kz);
  board.add(pond);
  const paddy = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 1.3), new THREE.MeshStandardMaterial({ color: 0x8fb24a, roughness: 0.95 }));
  paddy.position.set(kx + 0.45, 0.02, kz);
  board.add(paddy);
}

const SOURCES: WildlifeSources = {
  mangroves: [{ x: 0, y: 0.02, z: 0 }],
  khazanPonds: [{ x: Math.sqrt(3) * 2 - 0.4, y: 0.0, z: 0, radius: 0.38 }]
};

function enterBoard(): void {
  if (onBoard) return;
  onBoard = true;
  clearStage();
  if (!board.children.length) buildBoard();
  scene.add(board);
  scene.background = SKY.clone();
  // The game's camera: 58 degrees down, looking at the board centre.
  const el = THREE.MathUtils.degToRad(58);
  const dist = 9;
  camera.position.set(1.2, Math.sin(el) * dist, Math.cos(el) * dist);
  camera.lookAt(1.2, 0, 0);
  camera.updateMatrixWorld(true);
  if (!director) director = makeDirector();
  director.setEnabled(true);
  director.setCalm(true);
}

function stageOf(): string {
  if (!director) return "off";
  const d = director as unknown as { kf: { stage: string }; eg: { stage: string }; otterLive: boolean; jumpers: { live: boolean }[] };
  if (d.kf.stage !== "off") return "kf-" + d.kf.stage;
  if (d.eg.stage !== "off") return "eg-" + d.eg.stage;
  if (d.otterLive) return "otter";
  if (d.jumpers.some((j) => j.live)) return "jump";
  return director.busy ? "busy" : "off";
}

function makeDirector(): WildlifeDirector {
  let seed = 7;
  const d = new WildlifeDirector({
    scene,
    camera,
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    avoidRects: () => [],
    random: () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    }
  });
  d.setSources(SOURCES);
  return d;
}

/** A fresh director with a fresh seed, so a timeline run and the shot run match. */
function resetDirector(): void {
  director?.dispose();
  director = makeDirector();
  director.tick(0);
}

function leaveBoard(): void {
  if (!onBoard) return;
  onBoard = false;
  scene.remove(board);
  director?.setEnabled(false);
}

(window as unknown as { __wl: Api }).__wl = api;
api.model("kingfisher", "perch", 90, 8);
