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
await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(4000);
await page.mouse.move(2, H - 2);
await page.screenshot({ path: path.join(OUT, `opening-${tag}-${W}x${H}.jpg`), type: "jpeg", quality: 82 });
const opening = await measure(page);
// Miramar close up: the camera's own close framing on Miramar Beach, the same in before and after.
await page.evaluate(`window.__panjimForTest.host.focusCamera({ q: -4, r: 19 }, true, 1)`);
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT, `miramar-${tag}-${W}x${H}.jpg`), type: "jpeg", quality: 82 });
const miramar = await measure(page);
console.log(JSON.stringify({ size: `${W}x${H}`, tag, opening, miramar, errors }));
await browser.close();
server.stop();
process.exit(0);
