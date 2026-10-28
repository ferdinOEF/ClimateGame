/**
 * Section 1e: is Maya stable? Where she stands, and whether anything about
 * her changes when it should not. Doubles as the permanent test
 * (`npm run test:maya`) and as the before/after measurement.
 *
 * Usage:
 *   npx tsx tools/mayaStability.ts [outDir]           (test: exits 1 on a failure)
 *   STABLE_REPORT=1 npx tsx tools/mayaStability.ts    (measure only: always exits 0)
 *   STABLE_LABEL=before|after   names the files written (default "after")
 *   STABLE_SECONDS=10           seconds of her in each state (default 10)
 *   STABLE_STATES=idle,greeting,...  (default: every state she has)
 *
 * At 1920x1080 on Panaji, with her lines held, in each state:
 *   - her figure's box is sampled every frame the page gives: it must never
 *     move (zero change in x, y, width or height), and must stand at her
 *     home;
 *   - how often her layout ran, how often her figure's inline style or class
 *     changed, and how many page mutations the old layout observer would have
 *     counted, per second (the probes that find the cause of a flicker);
 *   - photographs of her box, one after another, are compared pixel by pixel:
 *     the frames that changed are listed, and the ones that changed under
 *     reduced motion (where her animations are off, so nothing should) are the
 *     glitches.
 * Then: idle for 3 seconds on a still page (the permanent check), and a pass
 * in reduced motion. Writes `stability-<label>.json` and `.md`.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section1e");
const LABEL = process.env.STABLE_LABEL ?? "after";
const REPORT_ONLY = Boolean(process.env.STABLE_REPORT);
const SECONDS = Number(process.env.STABLE_SECONDS ?? 10);
const PORT = Number(process.env.STABLE_PORT ?? 5299);
const STATES = (process.env.STABLE_STATES ?? "idle,greeting,tip,explains,warning,worried,celebrates").split(",");

let failed = 0;
const lines: string[] = [];
function check(ok: boolean, what: string): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : REPORT_ONLY ? "NOTE" : "FAIL"}  ${what}`;
  lines.push(line);
  console.log(line);
}

type Box = { x: number; y: number; w: number; h: number };
const errors: string[] = [];

async function open(browser: Browser, url: string, reducedMotion: boolean): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3000);
  await page.evaluate("window.__panjimForTest.maya.holdLines = true; window.__panjimForTest.maya.withdraw(function () { return true; }); window.__panjimForTest.maya.dismiss()");
  return page;
}

/** Counters on her layout and on what the old layout observer reacted to. Plain JS: it runs in the page. */
const PROBES = `(() => {
  var maya = window.__panjimForTest.maya;
  var p = (window.__mayaProbes = { layouts: 0, figureWrites: 0, classWrites: 0, hops: 0, observerHits: 0, rects: [] });
  var origLayout = maya.layout;
  if (typeof origLayout === "function") maya.layout = function () { p.layouts++; return origLayout.apply(maya, arguments); };
  var wrap = document.querySelector(".maya-figure-wrap");
  new MutationObserver(function (records) {
    records.forEach(function (r) { if (r.attributeName === "style") p.figureWrites++; });
  }).observe(wrap, { attributes: true, attributeFilter: ["style"] });
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      if (r.attributeName === "class") {
        p.classWrites++;
        if (r.target.classList && r.target.classList.contains("hopping")) p.hops++;
      }
    });
  }).observe(document.querySelector(".maya"), { attributes: true, attributeFilter: ["class"] });
  var mayaEl = document.querySelector(".maya");
  new MutationObserver(function (records) {
    var moving = function (n) { return n instanceof Element && n.closest(".storm-word, .forecast-label, .storm-flash") !== null; };
    if (records.some(function (r) { return !mayaEl.contains(r.target) && !moving(r.target); })) p.observerHits++;
  }).observe(mayaEl.parentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
  (function sample() {
    var r = wrap.getBoundingClientRect();
    p.rects.push([r.x, r.y, r.width, r.height]);
    requestAnimationFrame(sample);
  })();
})()`;

async function figureBox(page: Page): Promise<Box> {
  return (await page.evaluate(`(() => { var r = document.querySelector(".maya-figure-wrap").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`)) as Box;
}

/** Pixels that changed between consecutive photographs (a canvas comparison in a scratch page). */
async function diffFrames(browser: Browser, images: string[]): Promise<{ changed: number[]; strong: number[] }> {
  const page = await browser.newPage();
  try {
    await page.setContent("<canvas id=c></canvas>");
    return (await page.evaluate(`(async () => {
      var imgs = await Promise.all(${JSON.stringify(images)}.map(function (b64) {
        return new Promise(function (resolve) { var i = new Image(); i.onload = function () { resolve(i); }; i.src = "data:image/png;base64," + b64; });
      }));
      var c = document.getElementById("c"); var ctx = c.getContext("2d", { willReadFrequently: true });
      var datas = imgs.map(function (im) { c.width = im.width; c.height = im.height; ctx.drawImage(im, 0, 0); return ctx.getImageData(0, 0, im.width, im.height).data; });
      var changed = [], strong = [];
      for (var k = 1; k < datas.length; k++) {
        var a = datas[k - 1], b = datas[k], n = 0, s = 0;
        if (a.length !== b.length) { changed.push(-1); strong.push(-1); continue; }
        for (var i = 0; i < a.length; i += 4) {
          var d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
          if (d > 0) n++;
          if (d > 24) s++;
        }
        changed.push(n); strong.push(s);
      }
      return { changed: changed, strong: strong };
    })()`)) as { changed: number[]; strong: number[] };
  } finally {
    await page.close();
  }
}

interface StateResult {
  state: string;
  seconds: number;
  frames: number;
  moved: boolean;
  box: Box;
  perSecond: { layouts: number; figureWrites: number; classWrites: number; hops: number; observerHits: number };
  framesChanged: number;
  strongChanged: number;
  changedList: number[];
}

/**
 * `onlyHer`: the board's canvas is hidden while she is photographed, so the
 * comparison sees her own pixels only. The board under the 40 px margin keeps
 * moving in reduced motion (walkers, boats, water), and a boat passing her
 * feet is not a glitch of hers.
 */
async function measureState(browser: Browser, page: Page, state: string, seconds: number, onlyHer = false): Promise<StateResult> {
  await page.evaluate(`window.__panjimForTest.maya.dismiss(); window.__panjimForTest.maya.withdraw(function () { return true; })`);
  await page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(state === "idle" ? "maya:greeting" : `maya:${state}`)})`);
  if (state === "idle") await page.evaluate("window.__panjimForTest.maya.dismiss()");
  await page.waitForTimeout(1500);
  const home = await figureBox(page);
  if (onlyHer) await page.evaluate(`document.querySelectorAll("canvas").forEach(function (c) { c.style.visibility = "hidden"; })`);
  const before = (await page.evaluate("JSON.stringify(window.__mayaProbes)")) as string;
  const probes0 = JSON.parse(before) as { layouts: number; figureWrites: number; classWrites: number; hops: number; observerHits: number; rects: number[][] };
  const margin = 40;
  const clip = { x: Math.max(0, home.x - margin), y: Math.max(0, home.y - margin), width: home.w + margin * 2, height: home.h + margin * 2 };
  const photos: string[] = [];
  const started = Date.now();
  while (Date.now() - started < seconds * 1000) photos.push((await page.screenshot({ clip })).toString("base64"));
  const probes1 = (await page.evaluate("JSON.parse(JSON.stringify(window.__mayaProbes))")) as typeof probes0;
  if (onlyHer) await page.evaluate(`document.querySelectorAll("canvas").forEach(function (c) { c.style.visibility = ""; })`);
  const elapsed = (Date.now() - started) / 1000;
  const sampled = probes1.rects.slice(probes0.rects.length);
  const moved = sampled.some((r) => r.some((v, i) => Math.abs(v - [home.x, home.y, home.w, home.h][i]) > 0.001));
  const { changed, strong } = await diffFrames(browser, photos);
  const per = (a: number, b: number): number => Math.round(((b - a) / elapsed) * 100) / 100;
  return {
    state,
    seconds: Math.round(elapsed * 10) / 10,
    frames: photos.length,
    moved,
    box: home,
    perSecond: {
      layouts: per(probes0.layouts, probes1.layouts),
      figureWrites: per(probes0.figureWrites, probes1.figureWrites),
      classWrites: per(probes0.classWrites, probes1.classWrites),
      hops: per(probes0.hops, probes1.hops),
      observerHits: per(probes0.observerHits, probes1.observerHits)
    },
    framesChanged: changed.filter((n) => n !== 0).length,
    strongChanged: strong.filter((n) => n !== 0).length,
    changedList: changed
  };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: glArgs()
  });
  const result: { label: string; live: StateResult[]; calm: StateResult[]; home?: Box; idleStill?: { moved: boolean; frames: number } } = { label: LABEL, live: [], calm: [] };
  try {
    // Her home, from the code (Section 1e): a fixed corner.
    let homeX: number | undefined;
    let homeBottom: number | undefined;
    try {
      const layout = (await import("../src/ui/panjim/mayaLayout")) as Record<string, unknown>;
      if (typeof layout.HOME_MARGIN === "number") homeX = layout.HOME_MARGIN;
      if (typeof layout.HOME_MARGIN === "number") homeBottom = layout.HOME_MARGIN;
    } catch {
      // Before Section 1e there was no fixed home.
    }

    // ---- With her animations running --------------------------------------------------------
    const page = await open(browser, server.url, false);
    await page.evaluate(PROBES);
    for (const state of STATES) {
      const r = await measureState(browser, page, state, SECONDS);
      result.live.push(r);
      check(!r.moved, `${state}: her figure's box never moved in ${r.frames} frames over ${r.seconds}s (${r.box.x},${r.box.y} ${r.box.w}x${r.box.h})`);
      if (homeX !== undefined && homeBottom !== undefined) {
        check(r.box.x === homeX && Math.abs(1080 - (r.box.y + r.box.h) - homeBottom) < 0.001, `${state}: she stands at her home (${homeX}px from the left, ${homeBottom}px from the bottom; Section 34c.2)`);
        check(Number.isInteger(r.box.x) && Number.isInteger(r.box.y) && Number.isInteger(r.box.w) && Number.isInteger(r.box.h), `${state}: her box is on whole pixels`);
      }
      console.log(`      per second: layouts ${r.perSecond.layouts}, figure style writes ${r.perSecond.figureWrites}, class writes ${r.perSecond.classWrites}, hop restarts ${r.perSecond.hops}, observer hits ${r.perSecond.observerHits}; frames that changed ${r.framesChanged} of ${r.frames - 1} (${r.strongChanged} strongly)`);
    }

    // ---- Idle for 3 seconds on a still page (the permanent check) ------------------------
    await page.evaluate("window.__panjimForTest.maya.dismiss()");
    await page.waitForTimeout(1500);
    const still = await measureState(browser, page, "idle", 3);
    result.idleStill = { moved: still.moved, frames: still.frames };
    check(!still.moved, `idle for 3 seconds on a still page: her figure's rectangle is stable (${still.frames} frames)`);
    await page.context().close();

    // ---- With her animations off: nothing about her may change at all ------------------------
    const calm = await open(browser, server.url, true);
    await calm.evaluate(PROBES);
    for (const state of STATES) {
      const r = await measureState(browser, calm, state, Math.min(SECONDS, 5), true);
      result.calm.push(r);
      check(!r.moved, `reduced motion, ${state}: her box never moved`);
      check(r.framesChanged === 0, `reduced motion, ${state}: no pixel of her changes between ${r.frames} photographs (${r.framesChanged} did)`);
    }
    await calm.context().close();

    // ---- The Tutorial loads -------------------------------------------------------------------
    const tut = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    tut.on("pageerror", (e) => errors.push(`tutorial: ${e.message}`));
    tut.on("console", (m) => {
      if (m.type() === "error") errors.push(`tutorial: ${m.text()}`);
    });
    await tut.goto(`${server.url}/?qa=1&noname=1#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
    await tut.waitForSelector(".brief-card", { timeout: 120000 });
    await tut.locator(".brief-cta").first().click();
    await tut.waitForTimeout(2500);
    check((await tut.locator(".maya").count()) === 1 && (await tut.locator(".panjim-clock").count()) === 1, "the Tutorial loads (Section 15: the Panjim HUD, Maya coaching)");
    await tut.context().close();
  } finally {
    await browser.close();
    server.stop();
  }
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  fs.writeFileSync(path.join(OUT, `stability-${LABEL}.json`), `${JSON.stringify(result, null, 1)}\n`);
  const table = [
    `# Maya's stability, ${LABEL}`,
    "",
    "| State | Box moved | Layouts /s | Figure style writes /s | Class writes /s | Hop restarts /s | Observer hits /s | Photographs that changed | (strongly) |",
    "|---|---|---|---|---|---|---|---|---|",
    ...result.live.map((r) => `| ${r.state} | ${r.moved ? "YES" : "no"} | ${r.perSecond.layouts} | ${r.perSecond.figureWrites} | ${r.perSecond.classWrites} | ${r.perSecond.hops} | ${r.perSecond.observerHits} | ${r.framesChanged} of ${r.frames - 1} | ${r.strongChanged} |`),
    "",
    "Reduced motion (her animations off, so no pixel should change):",
    "",
    "| State | Box moved | Photographs that changed |",
    "|---|---|---|",
    ...result.calm.map((r) => `| ${r.state} | ${r.moved ? "YES" : "no"} | ${r.framesChanged} of ${r.frames - 1} |`),
    ""
  ].join("\n");
  fs.writeFileSync(path.join(OUT, `stability-${LABEL}.md`), table);
  console.log(failed === 0 || REPORT_ONLY ? "\nDone." : `\n${failed} check(s) failed.`);
  process.exit(REPORT_ONLY || failed === 0 ? 0 : 1);
}

void main();
