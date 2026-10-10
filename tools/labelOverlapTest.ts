/**
 * The map-label overlap test (permanent): no two labels the game draws ever
 * touch, and none touches Maya or any HUD panel.
 *
 * Usage:  npm run test:labels            (LABEL_SHOTS=1 also saves screenshots)
 *
 * On Panaji at 1366x768, 1920x1080 and 2560x1440, at three zoom levels
 * (the opening view, a wheel step in, two wheel steps in), after a drag-pan,
 * and with Maya talking, it reads back the box of every drawn label
 * (`.map-label.shown`) and fails if:
 *   - two label boxes intersect;
 *   - a label box intersects Maya (figure, bubble, badge) or a HUD element;
 *   - a label box is not fully inside the window.
 * The Tutorial's labels are checked once as well. It prints which names were
 * drawn and which were dropped at each step, and exits 1 on any failure.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.LABELS_PORT ?? 5198);
const SHOTS = path.join(ROOT, "docs", "qa", "labels");
const SIZES = [
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 }
];
/** Everything a label must stay off. Kept independent of the game's own list (ui/mapLabels.ts) on purpose. */
const HUD = [
  ".maya-figure-wrap", ".maya-bubble", ".maya-badge",
  ".instrument-cluster", ".coin-jar", ".field-guide-button", ".panjim-clock", ".hud-chrome", ".houses-counter",
  ".panjim-toggles", ".objectives-panel", ".get-ready", ".nugget-badge", ".map-corner", ".map-layer-control",
  ".empty-prompt", ".era-banner", ".build-popover", ".hud-tooltip", ".field-guide-toast", ".aftermath-card",
  ".field-guide-card", ".finale-card", ".brief-card", ".replay-card", ".tutorial-coach", ".forecast-label", ".storm-card"
];

interface Rect { x: number; y: number; w: number; h: number; label: string }
let checks = 0;
const costs: number[] = [];
const failures: string[] = [];
const report: string[] = [];

async function measure(page: Page): Promise<{ labels: Rect[]; hud: Rect[]; hidden: string[]; view: { w: number; h: number } }> {
  return page.evaluate(`(() => {
    const visible = (el) => {
      if (el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    };
    const rect = (el, label) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, label }; };
    const labels = [...document.querySelectorAll(".map-label")].filter(visible).map((el) => rect(el, el.textContent));
    const hidden = [...document.querySelectorAll(".map-label")].filter((el) => !visible(el)).map((el) => el.textContent);
    const hud = [];
    for (const s of ${JSON.stringify(HUD)}) for (const el of document.querySelectorAll(s)) if (!el.closest(".map-labels") && visible(el)) hud.push(rect(el, s));
    return { labels, hud, hidden, view: { w: innerWidth, h: innerHeight } };
  })()`) as Promise<{ labels: Rect[]; hud: Rect[]; hidden: string[]; view: { w: number; h: number } }>;
}

const hit = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function check(page: Page, tag: string, shot?: string): Promise<void> {
  // Let the camera glide finish and the layer re-read the HUD.
  await page.waitForTimeout(900);
  const { labels, hud, hidden, view } = await measure(page);
  checks++;
  const problems: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i];
    for (let j = i + 1; j < labels.length; j++) if (hit(a, labels[j])) problems.push(`"${a.label}" overlaps "${labels[j].label}"`);
    for (const h of hud) if (hit(a, h)) problems.push(`"${a.label}" overlaps ${h.label}`);
    if (a.x < 0 || a.y < 0 || a.x + a.w > view.w || a.y + a.h > view.h) problems.push(`"${a.label}" leaves the window`);
  }
  const cost = (await page.evaluate(`(async () => { const l = window.__labelsForTest; if (!l) return [0, 0]; const v = []; for (let i = 0; i < 30; i++) { await new Promise((r) => requestAnimationFrame(r)); v.push(l.lastCostMs); } v.sort((a, b) => a - b); return [v[15], v[29]]; })()`)) as [number, number];
  costs.push(cost[1]);
  const line = `${tag}: label layer ${cost[0].toFixed(2)} ms median, ${cost[1].toFixed(2)} ms max a frame; ${labels.length} drawn [${labels.map((l) => l.label).join(", ")}]; dropped or out of view: ${hidden.length}`;
  report.push(line);
  if (problems.length) {
    failures.push(`${tag}: ${problems.join("; ")}`);
    console.log(`FAIL  ${tag}  ${problems.join("; ")}`);
  } else console.log(`PASS  ${line}`);
  if (shot && process.env.LABEL_SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${shot}.jpg`), type: "jpeg", quality: 82 });
  }
}

async function main(): Promise<void> {
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  try {
    for (const size of SIZES) {
      const tag = `${size.w}x${size.h}`;
      const page = await (await browser.newContext({ viewport: { width: size.w, height: size.h } })).newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
      await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-card", { timeout: 60000 });
      await page.locator(".brief-cta").first().click();
      await page.waitForTimeout(2000);
      await page.evaluate("window.__panjimForTest && (window.__panjimForTest.maya.holdLines = true)");
      const cx = Math.round(size.w * 0.55);
      const cy = Math.round(size.h * 0.5);
      await page.mouse.move(cx, cy);
      await check(page, `${tag} zoom 1 (opening view)`, `panaji-zoom1-${tag}`);
      await page.mouse.wheel(0, -500);
      await check(page, `${tag} zoom 2`, `panaji-zoom2-${tag}`);
      await page.mouse.wheel(0, -500);
      await check(page, `${tag} zoom 3 (close)`, `panaji-zoom3-${tag}`);
      // A drag-pan across the city.
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - Math.round(size.w * 0.2), cy - Math.round(size.h * 0.15), { steps: 14 });
      await page.mouse.up();
      await check(page, `${tag} zoom 3 after a pan`, `panaji-pan-${tag}`);
      // Back out a step, with Maya talking (her bubble outranks every name).
      await page.mouse.wheel(0, 500);
      await page.evaluate(`window.__panjimScenarioForTest("maya:tip")`);
      await check(page, `${tag} zoom 2, Maya talking`, `panaji-maya-${tag}`);
      // A warning jump puts Maya out on the board, among the names.
      await page.evaluate(`window.__panjimScenarioForTest("maya-jump-st-cruz")`);
      await check(page, `${tag} Maya out on the board`);
      await page.close();
    }
    // The Tutorial's own labels.
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    page.on("pageerror", (e) => errors.push(`tutorial: ${e.message}`));
    await page.goto(`${server.url}/#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card", { timeout: 60000 });
    await page.locator(".brief-cta").first().click();
    await check(page, "Tutorial 1920x1080", "tutorial-1920x1080");
    await page.close();
  } finally {
    await browser.close();
    server.stop();
  }
  if (errors.length) failures.push(`page errors: ${errors.join(" | ")}`);
  console.log(`\n${checks} views checked, ${failures.length} failed; label layer at most ${Math.max(...costs).toFixed(2)} ms a frame`);
  if (process.env.LABEL_REPORT) fs.writeFileSync(process.env.LABEL_REPORT, report.join("\n") + "\n");
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
