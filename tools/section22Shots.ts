/**
 * Section 22: the opening view and Miramar close up (for the labels' before
 * and after), with the labels measured: font size, padding, the pin dot, and
 * the screen area the cream pins and the district names cover.
 *
 * Usage: npx tsx tools/section22Shots.ts <width> <height> <before|after> [outDir]
 * Writes <name>-<tag>-<W>x<H>.jpg and prints one JSON line of measurements.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1920", h = "1080", tag = "after", outDir = "docs/qa/section22"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5471));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];

/** The labels on screen now: sizes of the first of each kind and the screen area each kind covers. */
async function measure(page: Page): Promise<unknown> {
  return page.evaluate(`(() => {
    const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight ? r : null; };
    const kind = (sel) => {
      const els = [...document.querySelectorAll(sel)].filter((el) => vis(el));
      const first = els[0];
      const cs = first ? getComputedStyle(first) : null;
      const area = els.reduce((a, el) => { const r = el.getBoundingClientRect(); return a + r.width * r.height; }, 0);
      return { count: els.length, font: cs?.fontSize ?? null, padding: cs ? cs.padding : null, shadow: cs ? cs.boxShadow : null, areaPx: Math.round(area), areaShare: Number((area / (innerWidth * innerHeight)).toFixed(4)), names: els.slice(0, 6).map((el) => el.textContent.trim()) };
    };
    const dot = [...document.querySelectorAll(".map-pin-dot")].find((el) => vis(el));
    return {
      pins: kind(".map-pin-name"),
      places: kind(".map-label:not(.locality):not(.card)"),
      districts: kind(".map-label.locality"),
      dot: dot ? { w: Math.round(dot.getBoundingClientRect().width * 10) / 10, border: getComputedStyle(dot).borderTopWidth } : null,
      distance: window.__cameraForTest ? Math.round(window.__cameraForTest.position.length()) : null
    };
  })()`);
}

const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
});
await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(4000);
await page.mouse.move(2, H - 2);
await page.screenshot({ path: path.join(OUT, `opening-${tag}-${W}x${H}.jpg`), type: "jpeg", quality: 82 });
const opening = await measure(page);
const openingDistance = (await page.evaluate("window.__zoomForTest ? window.__zoomForTest.distance() : -1")) as number;
// Miramar close up: the camera's own close framing on Miramar Beach, the same in before and after.
await page.evaluate(`window.__panjimForTest.host.focusCamera({ q: -4, r: 19 }, true, 1)`);
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT, `miramar-${tag}-${W}x${H}.jpg`), type: "jpeg", quality: 82 });
const miramar = await measure(page);
// ---- 22.3 zoom: notches and key presses, furthest to nearest; the pointer's ground; Home -----------------------
// The distance the camera is gliding to: what a notch or a press changes at once (software GL draws a frame a second).
const dist = (): Promise<number> => page.evaluate("window.__zoomForTest ? window.__zoomForTest.target() : -1") as Promise<number>;
const settle = async (): Promise<number> => {
  let last = -2;
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(250);
    const d = await dist();
    if (Math.abs(d - last) < 0.01) return d;
    last = d;
  }
  return last;
};
let zoom: Record<string, unknown> = { available: false };
if ((await dist()) > 0) {
  const limits = (await page.evaluate("window.__zoomForTest.limits")) as { min: number; max: number };
  await page.mouse.move(W / 2, H / 2);
  // Out to the limit first.
  for (let k = 0; k < 40 && (await dist()) < limits.max - 0.01; k++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(120);
  }
  const far = await settle();
  let notches = 0;
  for (; notches < 200; notches++) {
    if ((await dist()) <= limits.min + 0.01) break;
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(150);
    await settle();
  }
  const near = await dist();
  // Keys: back out, then + presses to the limit.
  for (let k = 0; k < 40; k++) await page.keyboard.press("-");
  const keyFar = await settle();
  let presses = 0;
  for (; presses < 200; presses++) {
    if ((await dist()) <= limits.min + 0.01) break;
    await page.keyboard.press("+");
    await settle();
  }
  // Held: - held for a second and a half zooms on smoothly (more than one notch).
  const beforeHold = await dist();
  await page.keyboard.down("-");
  await page.waitForTimeout(1500);
  await page.keyboard.up("-");
  const afterHold = await settle();
  // The pointer's ground stays under it: the world point under a corner of the screen before and after a notch.
  const probe = (x: number, y: number): Promise<{ x: number; z: number } | null> =>
    page.evaluate(`(() => { const cam = window.__cameraForTest; const ndc = { x: (${x} / innerWidth) * 2 - 1, y: -(${y} / innerHeight) * 2 + 1 }; const o = cam.position.clone(); const v = cam.position.clone().set(ndc.x, ndc.y, 0.5).unproject(cam).sub(o).normalize(); if (v.y >= 0) return null; const t = -o.y / v.y; return { x: o.x + v.x * t, z: o.z + v.z * t }; })()`) as Promise<{ x: number; z: number } | null>;
  const px = Math.round(W * 0.72), py = Math.round(H * 0.62);
  await page.mouse.move(px, py);
  const g0 = await probe(px, py);
  await page.mouse.wheel(0, -100);
  // The drawn camera reaches the glide's end before the ground is read again.
  await page.waitForFunction("Math.abs(window.__zoomForTest.distance() - window.__zoomForTest.target()) < 0.01", undefined, { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const g1 = await probe(px, py);
  const drift = g0 && g1 ? Math.hypot(g0.x - g1.x, g0.z - g1.z) : null;
  // Home: the opening view's distance again.
  await page.keyboard.press("Home");
  const home = await settle();
  zoom = { available: true, limits, far, near, notchesFarToNear: notches, keyFar, keyPressesFarToNear: presses, held: { from: beforeHold, to: afterHold }, pointerGroundDrift: drift, home, opening: openingDistance };
}
// ---- 22.4 the result cards after an earlier storm's losses, and the final card ----------------------------------
const cards: Record<string, string> = {};
if (tag === "after") {
  const settled = async (): Promise<void> => {
    await page
      .waitForFunction("(() => { const c = document.querySelector('.result-cards:not([hidden]) .result-card'); return !!c && getComputedStyle(c).opacity === '1' && c.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'); })()", undefined, { timeout: 20000 })
      .catch(() => undefined);
    await page.waitForTimeout(1500);
  };
  const cardText = (): Promise<string> => page.evaluate("(() => { const c = document.querySelector('.result-cards:not([hidden]) .result-card'); return c ? c.textContent.replace(/\\s+/g, ' ').trim() : ''; })()") as Promise<string>;
  const closeCards = async (): Promise<void> => {
    for (let k = 0; k < 10; k++) {
      const next = page.locator(".result-cards:not([hidden]) .result-next");
      if (!(await next.isVisible().catch(() => false))) return;
      if (/Play again/.test((await next.textContent()) ?? "")) return;
      await next.click();
      await page.waitForTimeout(900);
    }
  };
  await page.keyboard.press("Home");
  for (const name of ["2030", "2040", "2050"]) {
    await page.evaluate(`window.__panjimScenarioForTest("to-results")`).catch(() => undefined);
    await settled();
    cards[name] = await cardText();
    if (name !== "2030") await page.screenshot({ path: path.join(OUT, `card-${name}-${W}x${H}.jpg`), type: "jpeg", quality: 82 });
    await closeCards();
  }
  // The final card comes after 2050's cards and the skyline.
  await page.waitForFunction("[...document.querySelectorAll('.result-cards:not([hidden]) button')].some((b) => /Play again/.test(b.textContent))", undefined, { timeout: 60000 }).catch(() => undefined);
  await settled();
  cards.final = await cardText();
  await page.screenshot({ path: path.join(OUT, `card-final-${W}x${H}.jpg`), type: "jpeg", quality: 82 });
}
console.log(JSON.stringify({ size: `${W}x${H}`, tag, opening, miramar, zoom, cards, errors }));
await browser.close();
server.stop();
process.exit(0);
