/**
 * Section 18: the humpback dolphins in the game. A pod is started in the
 * Mandovi off the old city, on the wildlife's hand-stepped clock, and filmed
 * at a surfacing roll and at a leap (at the top and at the splash back in),
 * at the default zoom and close up, at 1920x1080. Also reports the dolphins'
 * triangle counts and checks every visible dolphin stands on open water.
 *
 * Usage: npx tsx tools/dolphinFrames.ts [outDir]   (default docs/qa/section18/dolphins)
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section18/dolphins");
fs.mkdirSync(OUT, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5463));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${server.url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta").first().click();
await page.waitForTimeout(3000);
await page.evaluate(`window.__panjimScenarioForTest("quality-high")`);
await page.mouse.move(5, 5);
await page.waitForTimeout(2500);
// The clock by hand from here on; the sources are read on the next frame.
await page.evaluate("window.__wildlifeStepForTest(0)");
await page.waitForTimeout(1500);

/** The open water tile nearest a point off the old city's waterfront (the Mandovi north of the church). */
const water = (await page.evaluate(`(() => {
  const w = window.__wildlifeForTest();
  const list = w.sources.waters || [];
  const church = { x: Math.sqrt(3) * 11 + (Math.sqrt(3) / 2) * 8, z: 1.5 * 8 - 2.2 };
  let best = -1, bestD = Infinity;
  list.forEach((p, i) => { const d = Math.hypot(p.x - church.x, p.z - church.z); if (d < bestD) { bestD = d; best = i; } });
  return { index: best, point: list[best], count: list.length, triangles: w.triangleCounts };
})()`)) as { index: number; point: { x: number; y: number; z: number }; count: number; triangles: Record<string, number> };
console.log(`open water tiles: ${water.count}; dolphin triangles: adult ${water.triangles.dolphin}, young ${water.triangles.dolphinYoung}`);
check(water.index >= 0, "there is open water for a pod");

/** Steps the wildlife until a dolphin begins a surfacing of the asked kind; returns its index. */
async function surfacing(page: Page, leap: boolean): Promise<number> {
  return (await page.evaluate(`(() => {
    const w = window.__wildlifeForTest();
    w.dolphinNext = ${leap};
    const seen = new Set(w.swimmers.map((s, i) => s.live ? i + ":" + s.t0 : ""));
    for (let k = 0; k < 2000; k++) {
      window.__wildlifeStepForTest(50);
      const i = w.swimmers.findIndex((s, j) => s.live && s.leap === ${leap} && !seen.has(j + ":" + s.t0));
      if (i >= 0) return i;
      if (!w.podLive) w.forceMoment("dolphins", ${water.index});
    }
    return -1;
  })()`)) as number;
}

/** Steps on to `u` of that dolphin's surfacing, frames it (close: the camera beside it), and shoots. */
async function frame(page: Page, swimmer: number, u: number, close: boolean, name: string): Promise<void> {
  const at = (await page.evaluate(`(() => {
    const w = window.__wildlifeForTest();
    const s = w.swimmers[${swimmer}];
    const target = s.t0 + s.dur * ${u};
    while (w.clock < target) window.__wildlifeStepForTest(50);
    const p = s.model.root.position;
    return { x: p.x, y: p.y, z: p.z, visible: s.model.root.visible };
  })()`)) as { x: number; y: number; z: number; visible: boolean };
  if (close) {
    await page.evaluate(`(() => {
      const cam = window.__cameraForTest;
      const w = window.__wildlifeForTest();
      const el = 28 * Math.PI / 180, d = 1.7;
      // From over the water: the first heading round from the south whose ground under the camera, and halfway to it, is open water.
      let az = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * Math.PI / 8;
        const far = Math.cos(el) * d;
        if (w.opts.isWater(${at.x} + Math.sin(a) * far, ${at.z} + Math.cos(a) * far) && w.opts.isWater(${at.x} + Math.sin(a) * far / 2, ${at.z} + Math.cos(a) * far / 2)) { az = a; break; }
      }
      cam.position.set(${at.x} + Math.sin(az) * Math.cos(el) * d, ${at.y} + Math.sin(el) * d, ${at.z} + Math.cos(az) * Math.cos(el) * d);
      cam.lookAt(${at.x}, ${at.y}, ${at.z});
      cam.updateMatrixWorld();
    })()`);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 86 });
  check(at.visible, `${name}: the dolphin is at the surface`);
}

for (const close of [false, true]) {
  const zoom = close ? "close" : "default-zoom";
  await page.evaluate(`window.__focusOnForTest(${water.point.x}, ${water.point.z}, true)`);
  await page.waitForTimeout(1200);
  check((await page.evaluate(`window.__wildlifeForTest().forceMoment("dolphins", ${water.index})`)) as boolean, `${zoom}: a pod starts in the Mandovi`);
  const roll = await surfacing(page, false);
  check(roll >= 0, `${zoom}: a dolphin rolls at the surface`);
  if (roll >= 0) await frame(page, roll, 0.5, close, `dolphin-roll-${zoom}`);
  const leap = await surfacing(page, true);
  check(leap >= 0, `${zoom}: a dolphin leaps`);
  if (leap >= 0) {
    await frame(page, leap, 0.42, close, `dolphin-leap-${zoom}`);
    await frame(page, leap, 0.9, close, `dolphin-leap-splash-${zoom}`);
  }
}

// Every dolphin seen over two minutes of the pod's time stands on open water.
const offWater = (await page.evaluate(`(() => {
  const w = window.__wildlifeForTest();
  let bad = 0, seen = 0;
  for (let k = 0; k < 2400; k++) {
    window.__wildlifeStepForTest(50);
    if (!w.podLive) w.forceMoment("dolphins", ${water.index});
    for (const s of w.swimmers) if (s.model.root.visible) { seen++; if (!w.opts.isWater(s.model.root.position.x, s.model.root.position.z)) bad++; }
  }
  return { bad, seen };
})()`)) as { bad: number; seen: number };
check(offWater.seen > 0 && offWater.bad === 0, `every visible dolphin is on open water (${offWater.seen} dolphin frames)`);

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
