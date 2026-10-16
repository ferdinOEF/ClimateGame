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

function makeDirector(opts: { rects?: () => ScreenRect[]; seed?: number; camera?: THREE.PerspectiveCamera } = {}) {
  const scene = new THREE.Scene();
  const camera = opts.camera ?? gameCamera();
  const d = new WildlifeDirector({
    scene,
    camera,
    viewport: () => ({ width: W, height: H }),
    avoidRects: opts.rects ?? (() => []),
    random: seeded(opts.seed)
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
      const st = d as unknown as { kf: { stage: string }; eg: { stage: string }; otterLive: boolean; jumpers: { live: boolean }[] };
      const out = (st.kf.stage !== "off" ? 1 : 0) + (st.eg.stage !== "off" ? 1 : 0) + (st.otterLive ? 1 : 0) + (st.jumpers.some((j) => j.live) ? 1 : 0);
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
    for (const k of ["kingfisher", "egret", "otter", "fish", "prawn"]) expect(kinds.has(k as never)).toBe(true);
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
    expect((d as unknown as { clock: number }).clock).toBeLessThanOrEqual(16 + 50);
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
