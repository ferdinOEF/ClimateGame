import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WildlifeDirector, type ScreenRect, type WildlifeSources } from "@render/wildlife";
import { KingfisherModel } from "@render/wildlife/kingfisherModel";
import { EgretModel } from "@render/wildlife/egretModel";

/**
 * Section 14 wildlife: model budgets and the director's rules, in Node with
 * no WebGL (projection uses a real PerspectiveCamera, which needs none).
 */

const W = 1920;
const H = 1080;

function seeded(seed = 11): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** The game's camera: 58 degrees down, looking at the origin from `dist`. */
function gameCamera(dist = 18): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 200);
  const el = THREE.MathUtils.degToRad(58);
  cam.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

function makeDirector(opts: { rects?: () => ScreenRect[]; seed?: number; camera?: THREE.PerspectiveCamera; isWater?: (x: number, z: number) => boolean } = {}) {
  const scene = new THREE.Scene();
  const camera = opts.camera ?? gameCamera();
  const d = new WildlifeDirector({
    scene,
    camera,
    viewport: () => ({ width: W, height: H }),
    avoidRects: opts.rects ?? (() => []),
    random: seeded(opts.seed),
    isWater: opts.isWater
  });
  return { d, scene, camera };
}

/** One mangrove and one pond on screen, plus one of each far off screen. */
const SOURCES: WildlifeSources = {
  mangroves: [
    { x: 400, y: 0, z: 400 }, // off screen
    { x: -1.5, y: 0.02, z: 0.5 } // on screen
  ],
  khazanPonds: [
    { x: -300, y: 0, z: -300, radius: 0.4 }, // off screen
    { x: 2.2, y: 0.0, z: -0.4, radius: 0.38 } // on screen
  ]
};

function run(d: WildlifeDirector, fromMs: number, toMs: number, step = 1000 / 60): number {
  let t = fromMs;
  for (; t < toMs; t += step) d.tick(t);
  return t;
}

describe("wildlife models", () => {
  it("each bird is 1,500-3,000 triangles; the otter, fish and prawn are small", () => {
    const { d } = makeDirector();
    const c = d.triangleCounts;
    // Reported so the README's numbers can be checked against a run.
    console.log("wildlife triangle counts", JSON.stringify(c));
    expect(c.kingfisher).toBeGreaterThanOrEqual(1500);
    expect(c.kingfisher).toBeLessThanOrEqual(3000);
    expect(c.egret).toBeGreaterThanOrEqual(1500);
    expect(c.egret).toBeLessThanOrEqual(3000);
    expect(c.otter).toBeLessThan(2000);
    expect(c.fish).toBeLessThan(800);
    expect(c.prawn).toBeLessThan(1500);
    expect(c.fish).toBeGreaterThan(100);
    expect(c.prawn).toBeGreaterThan(100);
  });

  it("the birds are rigged as jointed parts (shoulder, wrist, primaries, head, tail, legs)", () => {
    const k = new KingfisherModel();
    expect(k.wings.left.feathers.length).toBeGreaterThanOrEqual(5);
    expect(k.wings.left.shoulder.children).toContain(k.wings.left.wrist);
    expect(k.neck.children).toContain(k.head);
    expect(k.legs).toHaveLength(2);
    const e = new EgretModel();
    expect(e.legs[0].hip.children).toContain(e.legs[0].knee);
    expect(e.legs[0].knee.children).toContain(e.legs[0].foot);
  });

  it("the kingfisher's bill is about twice the head radius and its tail is short", () => {
    const k = new KingfisherModel();
    const bill = k.head.children[1] as THREE.Mesh;
    bill.geometry.computeBoundingBox();
    const bb = bill.geometry.boundingBox!;
    const billLen = bb.max.z - bb.min.z;
    const head = k.head.children[0] as THREE.Mesh;
    head.geometry.computeBoundingBox();
    const hb = head.geometry.boundingBox!;
    const headR = (hb.max.y - hb.min.y) / 2;
    expect(billLen / headR).toBeGreaterThan(1.7);
    expect(billLen / headR).toBeLessThan(2.4);
    const tail = k.tail.children[0] as THREE.Mesh;
    tail.geometry.computeBoundingBox();
    const tb = tail.geometry.boundingBox!;
    expect(tb.max.z - tb.min.z).toBeLessThan(billLen);
  });

  it("the egret's knee bends backward while standing", () => {
    const e = new EgretModel();
    const pose = { bodyPitch: 0.12, bodyRoll: 0, bodyLift: 0, headYaw: 0, headPitch: 0, headRoll: 0, neck: 0.5, neckThrust: 0, tailPitch: 0, fold: 1, flap: 0, sweep: 0, twist: 0, wristFlex: 0, spread: 1, legTuck: 0, carrying: false };
    e.applyPose(pose);
    e.root.updateMatrixWorld(true);
    for (const leg of e.legs) {
      const hip = leg.hip.getWorldPosition(new THREE.Vector3());
      const knee = leg.knee.getWorldPosition(new THREE.Vector3());
      const foot = leg.foot.getWorldPosition(new THREE.Vector3());
      // The joint sits behind (-Z) the straight line from hip to foot.
      const t = (knee.y - hip.y) / (foot.y - hip.y);
      const lineZ = hip.z + (foot.z - hip.z) * t;
      expect(knee.z).toBeLessThan(lineZ - 0.005);
      // And the foot is on the ground.
      expect(Math.abs(foot.y)).toBeLessThan(0.02);
    }
  });
});

describe("wildlife director", () => {
  it("plays at most one moment at a time, 6-10 s apart, only from on-screen sources", () => {
    const { d } = makeDirector({ seed: 3 });
    d.setSources(SOURCES);
    let t = 0;
    let maxConcurrent = 0;
    for (; t < 240_000; t += 1000 / 60) {
      d.tick(t);
      // Never two kinds out at once.
      // Section 30.5: the mangroves' birds fly in on their own clock (tested below); here, the other moments.
      const st = d as unknown as { kf: { stage: string; flyIn: number }; eg: { stage: string; flyIn: number }; otterLive: boolean; jumpers: { live: boolean }[] };
      const bird = (b: { stage: string; flyIn: number }) => (b.stage !== "off" && b.flyIn < 0 ? 1 : 0);
      const out = bird(st.kf) + bird(st.eg) + (st.otterLive ? 1 : 0) + (st.jumpers.some((j) => j.live) ? 1 : 0);
      maxConcurrent = Math.max(maxConcurrent, out);
    }
    const log = d.momentLog;
    expect(log.length).toBeGreaterThan(8);
    expect(maxConcurrent).toBeLessThanOrEqual(1);
    for (let i = 1; i < log.length; i++) expect(log[i].at - log[i - 1].at).toBeGreaterThanOrEqual(6000);
    // Only the on-screen sources (index 1 of each list) are ever used.
    for (const m of log) expect(m.source).toBe(1);
    // Every kind turns up.
    const kinds = new Set(log.map((m) => m.kind));
    for (const k of ["otter", "fish", "prawn"]) expect(kinds.has(k as never)).toBe(true);
    // The birds came too, as fly-ins, both kinds.
    expect(new Set(d.flyIns.map((f) => f.kind))).toEqual(new Set(["kingfisher", "egret"]));
  });

  it("the next moment comes 6-10 s after the last one ended", () => {
    const { d } = makeDirector({ seed: 5 });
    d.setSources(SOURCES);
    let t = 0;
    let wasBusy = false;
    let endedAt = -1;
    const gaps: number[] = [];
    let seen = 0;
    for (; t < 200_000; t += 1000 / 60) {
      d.tick(t);
      if (d.momentLog.length > seen) {
        if (endedAt >= 0) gaps.push(d.momentLog[d.momentLog.length - 1].at - endedAt);
        seen = d.momentLog.length;
      }
      const busy = d.current !== null;
      if (wasBusy && !busy) endedAt = (d as unknown as { clock: number }).clock;
      wasBusy = busy;
    }
    expect(gaps.length).toBeGreaterThan(5);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(5990);
      expect(g).toBeLessThanOrEqual(10_100);
    }
  });

  it("nothing starts when no source is on screen", () => {
    const { d } = makeDirector();
    d.setSources({ mangroves: [SOURCES.mangroves[0]], khazanPonds: [SOURCES.khazanPonds[0]] });
    run(d, 0, 60_000);
    expect(d.momentLog).toHaveLength(0);
  });

  it("a source under an avoid rect (Maya, the HUD, a card) is never chosen", () => {
    const cover: ScreenRect = { left: 0, top: 0, right: W, bottom: H };
    const { d } = makeDirector({ rects: () => [cover] });
    d.setSources(SOURCES);
    run(d, 0, 60_000);
    expect(d.momentLog).toHaveLength(0);
  });

  it("nothing plays while not calm, or while disabled", () => {
    const a = makeDirector().d;
    a.setSources(SOURCES);
    a.setCalm(false);
    run(a, 0, 60_000);
    expect(a.momentLog).toHaveLength(0);
    expect(a.forceMoment("kingfisher", 1)).toBe(false);
    a.setCalm(true);
    run(a, 60_000, 80_000);
    expect(a.momentLog.length).toBeGreaterThan(0);

    const b = makeDirector().d;
    b.setSources(SOURCES);
    b.setEnabled(false);
    run(b, 0, 60_000);
    expect(b.momentLog).toHaveLength(0);
    expect(b.group.visible).toBe(false);
    expect(b.forceMoment("egret", 1)).toBe(false);
  });

  it("disabling mid-moment hides everything at once", () => {
    const { d } = makeDirector();
    d.setSources(SOURCES);
    d.tick(0);
    expect(d.forceMoment("egret", 1)).toBe(true);
    run(d, 0, 1500);
    d.setEnabled(false);
    expect(d.busy).toBe(false);
    expect(d.group.visible).toBe(false);
  });

  it("a storm flushes a bird away in a short burst and the otter dives", () => {
    const { d } = makeDirector();
    d.setSources(SOURCES);
    d.tick(0);
    d.forceMoment("kingfisher", 1);
    let t = run(d, 0, 1500);
    d.setCalm(false);
    const st = d as unknown as { kf: { stage: string } };
    expect(st.kf.stage).toBe("flush");
    t = run(d, t, t + 2000);
    expect(st.kf.stage).toBe("off");

    const o = makeDirector().d;
    o.setSources(SOURCES);
    o.tick(0);
    o.forceMoment("otter", 1);
    let t2 = run(o, 0, 1200);
    o.setCalm(false);
    t2 = run(o, t2, t2 + 1300);
    expect((o as unknown as { otterLive: boolean }).otterLive).toBe(false);
  });

  it("a storm with no bird out flushes a short burst from an on-screen mangrove", () => {
    const { d } = makeDirector();
    d.setSources(SOURCES);
    d.tick(0);
    d.setCalm(false);
    const st = d as unknown as { kf: { stage: string }; eg: { stage: string } };
    expect(st.kf.stage).toBe("flush");
    expect(st.eg.stage).toBe("flush");
    run(d, 0, 2000);
    expect(st.kf.stage).toBe("off");
    expect(st.eg.stage).toBe("off");
    expect(d.momentLog).toHaveLength(0);
  });

  it("fish and prawns launch and land only inside the pond half", () => {
    const { d } = makeDirector({ seed: 9 });
    d.setSources(SOURCES);
    d.tick(0);
    const pond = SOURCES.khazanPonds[1];
    let t = 0;
    let launches = 0;
    for (let i = 0; i < 120; i++) {
      expect(d.forceMoment(i % 2 ? "fish" : "prawn", 1)).toBe(true);
      for (const p of d.lastLaunches) {
        expect(Math.hypot(p.x - pond.x, p.z - pond.z)).toBeLessThanOrEqual(pond.radius);
        launches++;
      }
      const jumpers = (d as unknown as { jumpers: { live: boolean; to: THREE.Vector3 }[] }).jumpers;
      for (const j of jumpers) if (j.live) expect(Math.hypot(j.to.x - pond.x, j.to.z - pond.z)).toBeLessThanOrEqual(pond.radius);
      t = run(d, t, t + 400);
    }
    expect(launches).toBeGreaterThan(120);
  });

  it("a bird flies towards the camera, growing, and fades out before the near plane", () => {
    const { d, camera } = makeDirector();
    d.setSources(SOURCES);
    d.tick(0);
    d.forceMoment("kingfisher", 1);
    const kf = (d as unknown as { kf: { stage: string; pos: THREE.Vector3; opacity: number; root: THREE.Object3D } }).kf;
    let first: number | null = null;
    let minDist = Infinity;
    let maxScale = 0;
    let opacityNear = 1;
    for (let t = 0; t < 20_000 && (first === null || kf.stage !== "off"); t += 1000 / 60) {
      d.tick(t);
      if (kf.stage === "fly") {
        const dist = camera.position.distanceTo(kf.pos);
        if (first === null) first = dist;
        if (dist < minDist) {
          minDist = dist;
          opacityNear = kf.opacity;
        }
        maxScale = Math.max(maxScale, kf.root.scale.x);
      }
    }
    expect(first).not.toBeNull();
    expect(minDist).toBeLessThan(first! * 0.4);
    expect(minDist).toBeGreaterThan(camera.near * 5);
    expect(maxScale).toBeGreaterThan(0.15 * 1.1);
    expect(opacityNear).toBeLessThan(0.2);
  });

  it("a flight that would cross an avoid rect ends early with a fade", () => {
    let covered = false;
    const { d } = makeDirector({ rects: () => (covered ? [{ left: 0, top: 0, right: W, bottom: H }] : []) });
    d.setSources(SOURCES);
    d.tick(0);
    d.forceMoment("kingfisher", 1);
    const kf = (d as unknown as { kf: { stage: string; opacity: number } }).kf;
    let t = 0;
    while (kf.stage !== "fly" && t < 20_000) d.tick((t += 1000 / 60));
    expect(kf.stage).toBe("fly");
    covered = true;
    const start = t;
    while (kf.stage !== "off" && t < start + 5000) d.tick((t += 1000 / 60));
    expect(kf.stage).toBe("off");
    expect(t - start).toBeLessThan(500);
  });

  it("a long frame gap (a background tab) does not fast-forward a moment", () => {
    const { d } = makeDirector();
    d.setSources(SOURCES);
    d.tick(0);
    d.forceMoment("egret", 1);
    d.tick(16);
    d.tick(60_000);
    // At most one quarter-second step, however long the gap.
    expect((d as unknown as { clock: number }).clock).toBeLessThanOrEqual(16 + 250);
    expect(d.current).toBe("egret");
  });

  it("creates its meshes once: ticking never adds objects", () => {
    const { d, scene } = makeDirector();
    d.setSources(SOURCES);
    let count = 0;
    scene.traverse(() => count++);
    run(d, 0, 90_000);
    for (const k of ["kingfisher", "egret", "otter", "fish", "prawn"] as const) {
      d.forceMoment(k, 1);
      run(d, 90_000, 100_000);
    }
    let after = 0;
    scene.traverse(() => after++);
    expect(after).toBe(count);
    d.dispose();
    expect(scene.children).not.toContain(d.group);
  });
});

describe("wildlife director: avoid rects on the ground", () => {
  it("a perched bird fades away if a card opens over it", () => {
    let covered = false;
    const { d } = makeDirector({ rects: () => (covered ? [{ left: 0, top: 0, right: W, bottom: H }] : []) });
    d.setSources(SOURCES);
    d.tick(0);
    d.forceMoment("kingfisher", 1);
    let t = run(d, 0, 1000);
    const kf = (d as unknown as { kf: { stage: string } }).kf;
    expect(kf.stage).toBe("perch");
    covered = true;
    t = run(d, t, t + 400);
    expect(kf.stage).toBe("off");
  });
});

describe("humpback dolphins (Section 18)", () => {
  /** A stretch of open water on screen; everything else is land. */
  const isWater = (x: number, z: number): boolean => x > -6 && x < 4 && z > -3 && z < 2.5;
  const WATERS: WildlifeSources = { mangroves: [], khazanPonds: [], waters: [{ x: -1, y: 0, z: 0 }] };
  type Pod = { swimmers: { inPod: boolean; live: boolean; leap: boolean; t0: number; model: { root: THREE.Object3D } }[]; podLive: boolean };

  /** Plays `ms` and reports every visible dolphin's place, the pod sizes and the surfacings. */
  function watch(d: WildlifeDirector, ms: number) {
    const pod = d as unknown as Pod;
    const places: THREE.Vector3[] = [];
    const sizes: number[] = [];
    const surfacings = new Set<string>();
    let leaps = 0;
    let wasLive = false;
    for (let t = 0; t < ms; t += 50) {
      d.tick(t);
      if (pod.podLive && !wasLive) sizes.push(pod.swimmers.filter((s) => s.inPod).length);
      wasLive = pod.podLive;
      pod.swimmers.forEach((s, i) => {
        if (!s.live) return;
        const key = `${i}:${s.t0}`;
        if (!surfacings.has(key)) {
          surfacings.add(key);
          if (s.leap) leaps++;
        }
        if (s.model.root.visible) places.push(s.model.root.position.clone());
      });
    }
    return { places, sizes, surfacings: surfacings.size, leaps };
  }

  it("come in pods of 2 to 5, only ever in open water, mostly rolling, leaping now and then", () => {
    const { d } = makeDirector({ seed: 7, isWater });
    d.setSources(WATERS);
    const seen = watch(d, 900_000);
    expect(d.momentLog.filter((m) => m.kind === "dolphins").length).toBeGreaterThan(10);
    for (const n of seen.sizes) {
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(seen.places.length).toBeGreaterThan(100);
    for (const p of seen.places) expect(isWater(p.x, p.z), `a dolphin at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(true);
    // About one surfacing in six is a leap.
    const share = seen.leaps / seen.surfacings;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.3);
  });

  it("stay in a narrow channel, leaps and rolls included", () => {
    // A river a little over half a tile wide, running east to west: the pod must swim along it, never onto its banks.
    const channel = (x: number, z: number): boolean => Math.abs(z) < 0.36 && x > -9 && x < 9;
    const { d } = makeDirector({ seed: 13, isWater: channel });
    d.setSources(WATERS);
    const seen = watch(d, 900_000);
    expect(seen.surfacings).toBeGreaterThan(20);
    for (const p of seen.places) expect(channel(p.x, p.z), `a dolphin at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(true);
  });

  it("never come where there is no open water", () => {
    const { d } = makeDirector({ isWater: () => false });
    d.setSources(WATERS);
    run(d, 0, 120_000);
    expect(d.momentLog.filter((m) => m.kind === "dolphins")).toHaveLength(0);
    expect(d.forceMoment("dolphins", 0)).toBe(false);
  });

  it("with calm motion: only dolphins, two or three, never leaping", () => {
    const { d } = makeDirector({ seed: 9, isWater });
    d.setGentle(true);
    d.setSources({ ...SOURCES, waters: WATERS.waters });
    const seen = watch(d, 600_000);
    const kinds = new Set(d.momentLog.map((m) => m.kind));
    expect([...kinds]).toEqual(["dolphins"]);
    for (const n of seen.sizes) expect(n).toBeLessThanOrEqual(3);
    expect(seen.leaps).toBe(0);
    expect(seen.surfacings).toBeGreaterThan(10);
  });

  it("go down when a storm comes, and stay away while disabled", () => {
    const { d } = makeDirector({ isWater });
    d.setSources(WATERS);
    expect(d.forceMoment("dolphins", 0)).toBe(true);
    run(d, 0, 4000);
    d.setCalm(false);
    run(d, 4000, 6000);
    const pod = d as unknown as Pod;
    expect(pod.podLive).toBe(false);
    expect(pod.swimmers.every((s) => !s.model.root.visible)).toBe(true);

    const b = makeDirector({ isWater }).d;
    b.setSources(WATERS);
    b.setEnabled(false);
    run(b, 0, 60_000);
    expect(b.momentLog).toHaveLength(0);
  });
});

/**
 * Section 30.5 (owner decision, critical): the mangrove's bird. When a mangrove is planted, and then every 20-30 s
 * for each mangrove on screen (one bird at a time across the board), a kingfisher or an egret flies up out of it
 * toward the screen, big enough to see at the opening zoom on a 1366x768 screen. Never in a storm, under a result
 * card (both: not calm) or with Calm motion.
 */
describe("the mangrove's bird (Section 30.5)", () => {
  const VW = 1366;
  const VH = 768;
  /**
   * "Clearly visible", chosen and reported: a projected radius of at least 40 CSS px (80 px across, wings spread) at
   * 1366x768, at least 0.6 opaque, for at least 1.5 s of the flight.
   */
  const MIN_SEEN_MS = 1500;
  /** The opening view of Panjim at its farthest (scene.ts CAM_DISTANCE_OPENING_MAX), on a 1366x768 screen. */
  function openingCamera(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(38, VW / VH, 0.1, 200);
    const el = THREE.MathUtils.degToRad(58);
    cam.position.set(0, Math.sin(el) * 44, Math.cos(el) * 44);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    return cam;
  }
  function director(seed: number, rects: () => ScreenRect[] = () => []) {
    const d = new WildlifeDirector({ scene: new THREE.Scene(), camera: openingCamera(), viewport: () => ({ width: VW, height: VH }), avoidRects: rects, random: seeded(seed) });
    return d;
  }
  const ONE: WildlifeSources = { mangroves: [{ x: 3, y: 0.02, z: 2 }], khazanPonds: [] };

  it("over 2 minutes with one mangrove planted on screen: at least 4 fly-ins, each 40 px or more in radius for 1.5 s", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const d = director(seed);
      d.tick(0);
      d.setSources(ONE);
      d.birdFrom(ONE.mangroves[0]);
      run(d, 0, 120_000);
      const seen = d.flyIns.filter((f) => f.seenMs >= MIN_SEEN_MS);
      console.log(`seed ${seed}: ${d.flyIns.length} fly-ins: ${d.flyIns.map((f) => `${f.kind} up to ${f.maxPx.toFixed(0)}px, ${(f.seenMs / 1000).toFixed(1)}s at 40px+`).join("; ")}`);
      expect(seen.length, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      expect(d.flyIns[0].trigger).toBe("build");
      expect(d.flyIns[0].at).toBeLessThan(100);
      expect(new Set(d.flyIns.map((f) => f.kind))).toEqual(new Set(["kingfisher", "egret"]));
    }
  });

  it("even without the planting: a mangrove on screen sends a bird every 20-30 s", () => {
    const d = director(4);
    d.tick(0);
    d.setSources(ONE);
    run(d, 0, 300_000);
    const at = d.flyIns.map((f) => f.at);
    expect(at.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < at.length; i++) {
      expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(19_990);
      expect(at[i] - at[i - 1]).toBeLessThanOrEqual(30_100);
    }
  });

  it("one bird at a time across the board, however many mangroves are on screen", () => {
    const many: WildlifeSources = { mangroves: Array.from({ length: 12 }, (_, i) => ({ x: -5 + (i % 4) * 3, y: 0.02, z: -3 + Math.floor(i / 4) * 3 })), khazanPonds: [] };
    const d = director(9);
    d.tick(0);
    d.setSources(many);
    const st = d as unknown as { kf: { stage: string }; eg: { stage: string } };
    let both = 0;
    for (let t = 0; t < 180_000; t += 1000 / 60) {
      d.tick(t);
      if (st.kf.stage !== "off" && st.eg.stage !== "off") both++;
    }
    expect(both).toBe(0);
    expect(d.flyIns.length).toBeGreaterThan(12);
  });

  it("not in a storm or under a result card (not calm), not with Calm motion; a planting then waits for calm", () => {
    const d = director(2);
    d.tick(0);
    d.setSources(ONE);
    d.setCalm(false);
    d.birdFrom(ONE.mangroves[0]);
    run(d, 0, 60_000);
    expect(d.flyIns).toHaveLength(0);
    d.setCalm(true);
    run(d, 60_000, 61_000);
    // The planted one waited too long and was dropped; the mangrove's own clock, overdue, sends its bird now.
    expect(d.flyIns).toHaveLength(1);
    expect(d.flyIns[0].trigger).toBe("timer");

    const g = director(3);
    g.tick(0);
    g.setSources(ONE);
    g.setGentle(true);
    g.birdFrom(ONE.mangroves[0]);
    run(g, 0, 120_000);
    expect(g.flyIns).toHaveLength(0);
  });

  it("a planting during the year's turn flies up as soon as the board is calm", () => {
    const d = director(5);
    d.tick(0);
    d.setSources(ONE);
    d.setCalm(false);
    d.birdFrom(ONE.mangroves[0]);
    run(d, 0, 4000);
    d.setCalm(true);
    run(d, 4000, 4200);
    expect(d.flyIns).toHaveLength(1);
    expect(d.flyIns[0].trigger).toBe("build");
  });

  it("still comes on Low quality (lite), where the otter, pond life and dolphins do not", () => {
    const d = director(6);
    d.setLite(true);
    d.tick(0);
    d.setSources({ mangroves: ONE.mangroves, khazanPonds: [{ x: -2, y: 0, z: 1, radius: 0.38 }] });
    run(d, 0, 120_000);
    expect(d.flyIns.length).toBeGreaterThanOrEqual(3);
    expect(d.momentLog).toHaveLength(0);
  });
});
