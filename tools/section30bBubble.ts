/**
 * Section 30b: Maya's speech bubble holds still under the pointer. At one window size: a tip with a Field Guide
 * count ("5 of 20") and Got it, the pointer moved onto the bubble and then onto Got it and held there 3 s while the
 * bubble's and her figure's rectangles are recorded every frame (they must not change, and she must stay drawn);
 * a strip of 10 frames with the pointer on Got it; then one click on Got it closes the bubble. The tile under the
 * bubble gets no hover outline while the pointer is on it. Console errors must be 0.
 *
 * Usage: npx tsx tools/section30bBubble.ts <width> <height> [outDir=docs/qa/section30b]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section30b"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });

const server = await startDevServer(Number(process.env.PORT ?? 5479));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};
const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);

// A Field Guide tip, as in the owner's recording: a line with a count and Got it, held up until dismissed.
await page.evaluate(`(() => {
  const maya = window.__panjimForTest.maya;
  maya.dismiss();
  maya.holdLines = true;
  maya.say({ id: "s30b-tip", force: true, urgent: true, state: "tip", text: "Mangroves slow the surge before it reaches the houses. Plant them on the wetland edge.", fact: { id: "mangroves-surge", credit: "Wetlands International", progress: () => "5 of 20" } });
  maya.next();
})()`);
await page.waitForTimeout(1500);
const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
const bubble = await box(".maya-bubble");
check(!!bubble, `the tip is up (${bubble ? `${Math.round(bubble.x)},${Math.round(bubble.y)} ${Math.round(bubble.width)}x${Math.round(bubble.height)}` : "missing"})`);

/** Records, every animation frame for `ms`, the bubble's and the figure's rectangles and whether she is drawn. */
async function record(ms: number): Promise<{ frames: number; spots: string[]; figureGone: number; outlines: number }> {
  return (await page.evaluate(`new Promise((resolve) => {
    const b = document.querySelector(".maya-bubble");
    const f = document.querySelector(".maya-figure-wrap");
    const spots = new Set(); let frames = 0; let figureGone = 0; let outlines = 0;
    const t0 = performance.now();
    const tick = () => {
      const r = b.getBoundingClientRect();
      spots.add(b.hidden ? "hidden" : [r.left, r.top, r.width, r.height].map(Math.round).join(","));
      const fr = f.getBoundingClientRect();
      const fs = getComputedStyle(f);
      if (fr.width < 1 || fs.visibility === "hidden" || fs.display === "none" || Number(fs.opacity) < 0.5) figureGone++;
      const th = window.__tileHoverForTest && window.__tileHoverForTest();
      if (th && th.mesh.visible) outlines++;
      frames++;
      if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick); else resolve({ frames, spots: [...spots], figureGone, outlines });
    };
    requestAnimationFrame(tick);
  })`)) as { frames: number; spots: string[]; figureGone: number; outlines: number };
}

// The pointer onto the bubble's text, then onto Got it, as a player moves it.
await page.mouse.move(bubble.x + bubble.width / 2, bubble.y + 24, { steps: 8 });
const onBubble = await record(3000);
check(onBubble.spots.length === 1 && onBubble.figureGone === 0, `pointer on the bubble, 3 s: ${onBubble.frames} frames, ${onBubble.spots.length} position(s) [${onBubble.spots.join(" | ")}], figure missing in ${onBubble.figureGone}`);
const got = await box(".maya-dismiss");
await page.mouse.move(got.x + got.width / 2, got.y + got.height / 2, { steps: 8 });
const onGot = await record(3000);
check(onGot.spots.length === 1 && onGot.figureGone === 0, `pointer on Got it, 3 s: ${onGot.frames} frames, ${onGot.spots.length} position(s) [${onGot.spots.join(" | ")}], figure missing in ${onGot.figureGone}`);
check(onBubble.outlines === 0 && onGot.outlines === 0, `no tile hover outline under the bubble while the pointer is on it (outlined in ${onBubble.outlines + onGot.outlines} frames)`);

// Ten frames with the pointer on Got it, side by side.
const now = await box(".maya-bubble");
const fig = await box(".maya-figure-wrap");
const clip = { x: Math.max(0, Math.min(now.x, fig.x) - 12), y: Math.max(0, Math.min(now.y, fig.y) - 12), width: 0, height: 0 };
clip.width = Math.min(W - clip.x, Math.max(now.x + now.width, fig.x + fig.width) - clip.x + 12);
clip.height = Math.min(H - clip.y, Math.max(now.y + now.height, fig.y + fig.height) - clip.y + 12);
const frameFiles: string[] = [];
for (let i = 0; i < 10; i++) {
  const file = path.join(OUT, `frame-${W}x${H}-${i}.png`);
  await page.screenshot({ path: file, clip });
  frameFiles.push(file);
  await page.waitForTimeout(100);
}
execFileSync("python3", ["-I", "-c", `
import sys
from PIL import Image
files = sys.argv[2:]
ims = [Image.open(f).convert("RGB") for f in files]
w, h = ims[0].size
strip = Image.new("RGB", (w * len(ims) + 4 * (len(ims) - 1), h), (30, 30, 30))
for i, im in enumerate(ims): strip.paste(im, (i * (w + 4), 0))
scale = min(1.0, 4000 / strip.size[0])
if scale < 1: strip = strip.resize((int(strip.size[0] * scale), int(strip.size[1] * scale)))
strip.save(sys.argv[1], quality=85)
`, path.join(OUT, `frame-strip-${W}x${H}.jpg`), ...frameFiles]);
for (const f of frameFiles) fs.rmSync(f);

// One click on Got it closes the bubble.
const before = await box(".maya-dismiss");
await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
await page.waitForTimeout(500);
const closed = (await page.evaluate(`document.querySelector(".maya-bubble").hidden`)) as boolean;
check(closed, "one click on Got it closes the bubble");
// Something lands on the bubble while the pointer is elsewhere: it keeps its shape where it stands, then moves once,
// within about a second and a quarter, to a free spot.
await page.mouse.move(W * 0.7, H * 0.4, { steps: 4 });
await page.evaluate(`(() => {
  const maya = window.__panjimForTest.maya;
  maya.say({ id: "s30b-tip-2", force: true, urgent: true, state: "tip", text: "Mangroves slow the surge before it reaches the houses. Plant them on the wetland edge.", fact: { id: "mangroves-surge", credit: "Wetlands International", progress: () => "5 of 20" } });
  maya.next();
})()`);
await page.waitForTimeout(1500);
const start = await box(".maya-bubble");
const moves = (await page.evaluate(`new Promise((resolve) => {
  const b = document.querySelector(".maya-bubble");
  const r0 = b.getBoundingClientRect();
  const note = document.createElement("div");
  note.className = "map-note beside";
  note.textContent = "an obstacle for the test";
  const c = window.__panjimForTest.maya.el.parentElement.getBoundingClientRect();
  note.style.cssText = "position:absolute;z-index:5;background:#fff;left:" + (r0.left - c.left + 20) + "px;top:" + (r0.top - c.top + 10) + "px;width:" + Math.round(r0.width / 2) + "px;height:" + Math.round(r0.height / 2) + "px";
  const container = window.__panjimForTest.maya.el.parentElement;
  container.appendChild(note);
  const seen = []; const t0 = performance.now(); let firstMove = null;
  const tick = () => {
    const r = b.getBoundingClientRect();
    const key = [r.left, r.top, r.width, r.height].map(Math.round).join(",");
    if (seen[seen.length - 1] !== key) { seen.push(key); if (seen.length === 2) firstMove = Math.round(performance.now() - t0); }
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else { note.remove(); resolve({ seen, firstMove }); }
  };
  requestAnimationFrame(tick);
})`)) as { seen: string[]; firstMove: number | null };
const startKey = [start.x, start.y, start.width, start.height].map(Math.round).join(",");
const near = (a: string, b: string): boolean => a.split(",").every((v, i) => Math.abs(Number(v) - Number(b.split(",")[i])) <= 1);
// One change only: a move to a free spot beside her, or (no free spot, as before Section 30b) the line held back.
const outcome = moves.seen[1]?.startsWith("0,0,0,0") ? "held back (no free spot beside her)" : "moved";
check(near(moves.seen[0] ?? "", startKey) && moves.seen.length === 2 && moves.firstMove !== null && moves.firstMove <= 1600, `an obstacle over the bubble: unchanged where it stood, then one change after ${moves.firstMove ?? "never"} ms, ${outcome} [${moves.seen.join(" | ")}]`);
await page.evaluate(`window.__panjimForTest.maya.dismiss()`);
check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
await server.stop();
process.exit(failed > 0 ? 1 : 0);
