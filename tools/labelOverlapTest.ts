/**
 * The map-label overlap test (permanent): no two labels the game draws ever
 * touch, and none touches Maya or any HUD panel.
 *
 * Usage:  npm run test:labels            (LABEL_SHOTS=1 also saves screenshots)
 *
 * On Panaji at 1366x768, 1920x1080 and 2560x1440, at three zoom levels
 * (the opening view, a wheel step in, two wheel steps in), after a drag-pan,
 * and with Maya talking, it reads back the box of every drawn label. During
 * the drag-pan and during Maya's hop onto the board it checks every frame.
 * Each settled Panaji view must draw at least two locality names, so the test
 * cannot pass with nothing on screen. It reads back the box of every drawn label
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
  ".field-guide-card", ".finale-card", ".brief-card", ".replay-card", ".tutorial-coach", ".forecast-label", ".storm-card",
  ".hud-corner", ".help-card", ".storm-report", ".era-end-card", ".welcome-card", ".sources-panel", ".nugget-credit"
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

/**
 * Starts checking every animation frame for `frames` frames, in the page, while
 * the caller moves the camera or Maya. Returns the violations seen (deduplicated).
 */
async function startSampling(page: Page, frames: number): Promise<void> {
  await page.evaluate(`(() => {
    const sel = ${JSON.stringify(HUD)};
    const visible = (el) => {
      if (el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    };
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    window.__labelSample = new Promise((resolve) => {
      const seen = new Set();
      let left = ${frames};
      const tick = () => {
        const labels = [...document.querySelectorAll(".map-label.shown")].filter(visible).map((el) => [el.textContent, el.getBoundingClientRect()]);
        const hud = [];
        for (const s of sel) for (const el of document.querySelectorAll(s)) if (!el.closest(".map-labels") && visible(el)) hud.push([s, el.getBoundingClientRect()]);
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) if (hit(labels[i][1], labels[j][1])) seen.add(labels[i][0] + " / " + labels[j][0]);
          for (const [s, r] of hud) if (hit(labels[i][1], r)) seen.add(labels[i][0] + " / " + s);
        }
        if (--left > 0) requestAnimationFrame(tick);
        else resolve([...seen]);
      };
      requestAnimationFrame(tick);
    });
  })()`);
}

async function endSampling(page: Page, tag: string): Promise<void> {
  const seen = (await page.evaluate("window.__labelSample")) as string[];
  checks++;
  if (seen.length) {
    failures.push(`${tag} (frame by frame): ${seen.join("; ")}`);
    console.log(`FAIL  ${tag} (frame by frame)  ${seen.join("; ")}`);
  } else console.log(`PASS  ${tag} (frame by frame): no overlap in any frame`);
}

const hit = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function check(page: Page, tag: string, shot?: string, minLocalities = 0): Promise<void> {
  // Let the camera glide finish and the layer re-read the HUD.
  await page.waitForTimeout(900);
  const { labels, hud, hidden, view } = await measure(page);
  checks++;
  const problems: string[] = [];
  const localities = (await page.evaluate(`document.querySelectorAll(".map-label.locality.shown").length`)) as number;
  if (localities < minLocalities) problems.push(`only ${localities} locality names drawn (expected at least ${minLocalities})`);
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i];
    for (let j = i + 1; j < labels.length; j++) if (hit(a, labels[j])) problems.push(`"${a.label}" overlaps "${labels[j].label}"`);
    for (const h of hud) if (hit(a, h)) problems.push(`"${a.label}" overlaps ${h.label}`);
    if (a.x < 0 || a.y < 0 || a.x + a.w > view.w || a.y + a.h > view.h) problems.push(`"${a.label}" leaves the window`);
  }
  const cost = (await page.evaluate(`(async () => { const l = window.__labelsForTest; if (!l) return [-1, -1]; const v = []; for (let i = 0; i < 30; i++) { await new Promise((r) => requestAnimationFrame(r)); v.push(l.lastCostMs); } v.sort((a, b) => a - b); return [v[15], v[29]]; })()`)) as [number, number];
  if (cost[0] < 0) problems.push("window.__labelsForTest is missing");
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
      await page.evaluate("window.__labelsForTest && (window.__labelsForTest.collectDebug = true)");
      const cx = Math.round(size.w * 0.55);
      const cy = Math.round(size.h * 0.5);
      await page.mouse.move(cx, cy);
      await check(page, `${tag} zoom 1 (opening view)`, `panaji-zoom1-${tag}`, 2);
      await page.mouse.wheel(0, -500);
      await check(page, `${tag} zoom 2`, `panaji-zoom2-${tag}`, 2);
      await page.mouse.wheel(0, -500);
      await check(page, `${tag} zoom 3 (close)`, `panaji-zoom3-${tag}`, 2);
      // A drag-pan across the city, checked on every frame of the drag and the glide after it.
      await startSampling(page, 90);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - Math.round(size.w * 0.2), cy - Math.round(size.h * 0.15), { steps: 14 });
      await page.mouse.up();
      await endSampling(page, `${tag} during a drag-pan`);
      await check(page, `${tag} zoom 3 after a pan`, `panaji-pan-${tag}`, 2);
      // Back out a step, with Maya talking (her bubble outranks every name).
      await page.mouse.wheel(0, 500);
      if (!(await page.evaluate(`window.__panjimScenarioForTest("maya:tip")`))) failures.push(`${tag}: maya:tip scenario failed`);
      await check(page, `${tag} zoom 2, Maya talking`, `panaji-maya-${tag}`, 2);
      // A warning jump puts Maya out on the board, among the names: checked on every frame of the hop.
      const before = (await page.evaluate(`JSON.stringify(document.querySelector(".maya-figure-wrap").getBoundingClientRect())`)) as string;
      await startSampling(page, 90);
      if (!(await page.evaluate(`window.__panjimScenarioForTest("maya-jump-st-cruz")`))) failures.push(`${tag}: maya-jump scenario failed`);
      await endSampling(page, `${tag} during Maya's hop`);
      const after = (await page.evaluate(`JSON.stringify(document.querySelector(".maya-figure-wrap").getBoundingClientRect())`)) as string;
      if (before === after) failures.push(`${tag}: Maya did not move for the jump`);
      await check(page, `${tag} Maya out on the board`, undefined, 1);
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
