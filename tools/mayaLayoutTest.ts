/**
 * Maya must never overlap any other HUD element, and must stay inside the
 * viewport. This drives the real game in a browser through every layout
 * the brief lists and checks the rectangles:
 *
 *   resolutions 1280x600, 1366x768, 1920x1080, 2560x1440 (1280x600 from Section 12)
 *   x the Discovery card hidden and shown (its tallest card: the longest cited fact, dunes-barrier, with its Source row)
 *   x the Get ready panel open and collapsed
 *   x no tooltip and a tooltip open
 *   x Maya with a tip, and with a warning (the camera glides to three places; she never moves)
 *
 * Fails (exit code 1) on the first overlap, with the offending pair.
 * `npm run test:layout`.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const PORT = 5197;
const ALL_RESOLUTIONS = [
  { w: 1280, h: 600 },
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 }
];
/** LAYOUT_ONLY=2560 runs one width (for chasing a single case). */
const RESOLUTIONS = ALL_RESOLUTIONS.filter((r) => !process.env.LAYOUT_ONLY || String(r.w) === process.env.LAYOUT_ONLY);
/** Everything Maya must keep clear of: a deliberately broad list, independent of the one the layout manager uses. */
const OTHER_HUD = [
  ".instrument-cluster", ".coin-jar", ".field-guide-button", ".panjim-clock", ".hud-chrome",
  ".hud-panel", ".panjim-toggles", ".objectives-panel", ".get-ready", ".map-corner", ".map-layer-control",
  ".empty-prompt", ".era-banner", ".build-popover", ".hud-tooltip", ".forecast-label", ".sound-toggle", ".quality-control"
];

type Rect = { x: number; y: number; w: number; h: number; label?: string };
const failures: string[] = [];
let checks = 0;

async function measure(page: Page): Promise<{ maya: Rect[]; others: Rect[]; view: { w: number; h: number } }> {
  return page.evaluate(`(() => {
    const sel = ${JSON.stringify(OTHER_HUD)};
    const visible = (el) => {
      if (el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    };
    const rect = (el, label) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, label }; };
    const maya = [];
    for (const [s, label] of [[".maya-figure-wrap", "figure"], [".maya-bubble", "bubble"], [".maya-badge", "badge"]]) {
      const el = document.querySelector(s);
      if (el && visible(el)) maya.push(rect(el, label));
    }
    const others = [];
    for (const s of sel) for (const el of document.querySelectorAll(s)) if (!el.closest(".maya") && visible(el)) others.push(rect(el, s + (el.className ? " (" + String(el.className).slice(0, 40) + ")" : "")));
    return { maya, others, view: { w: innerWidth, h: innerHeight } };
  })()`) as Promise<{ maya: Rect[]; others: Rect[]; view: { w: number; h: number } }>;
}

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

async function assertClear(page: Page, label: string, expectBubble: boolean): Promise<void> {
  await page.waitForTimeout(450);
  // Her bubble fades in over 220 ms; under software GL a slow first frame can leave it at
  // opacity 0 when measured. Wait (up to 3 s) for the fade to finish; it still fails if it never shows.
  if (expectBubble) {
    for (let i = 0; i < 30; i++) {
      const settled = await page.evaluate(`(() => { const b = document.querySelector(".maya-bubble"); return Boolean(b) && !b.closest("[hidden]") && Number(getComputedStyle(b).opacity) > 0.99; })()`);
      if (settled) break;
      await page.waitForTimeout(100);
    }
  }
  // Measure a layout made after everything above settled: her layout runs on the game's frame,
  // and under software GL with the whole city drawn a frame can take a second, so a check taken
  // between frames would read a layout made before the HUD last changed. Wait (up to 10 s) for a
  // fresh, clean layout pass.
  await page.evaluate(`new Promise((resolve) => {
    const m = window.__panjimForTest.maya;
    const t0 = performance.now();
    const tick = () => !m.layoutDirty || performance.now() - t0 > 10000 ? resolve(null) : requestAnimationFrame(tick);
    requestAnimationFrame(tick);
  })`);
  const { maya, others, view } = await measure(page);
  checks++;
  const problems: string[] = [];
  if (!maya.some((r) => r.label === "figure" || r.label === "badge")) problems.push("Maya is not on screen");
  if (expectBubble && !maya.some((r) => r.label === "bubble")) {
    const why = await page.evaluate(`(() => { const m = window.__panjimForTest.maya; return JSON.stringify({ current: m.current && m.current.id, pending: m.pending, heldBack: m.heldBack, minimised: m.minimised, muted: m.muted, bubbleHidden: m.bubble.hidden, view: [innerWidth, innerHeight] }); })()`);
    problems.push(`her bubble is not showing ${why}`);
  }
  // She never moves: her figure (or her badge) stands at her home, a fixed margin in from the bottom-right corner (Section 33b), on whole pixels.
  for (const m of maya.filter((r) => r.label === "figure" || r.label === "badge")) {
    if (view.w - (m.x + m.w) !== 12 || Math.abs(view.h - (m.y + m.h) - 12) > 0.001) problems.push(`${m.label} is not at home: ${JSON.stringify([m.x, m.y, m.w, m.h])} on ${view.w}x${view.h}`);
    if (![m.x, m.y, m.w, m.h].every(Number.isInteger)) problems.push(`${m.label} is not on whole pixels: ${JSON.stringify([m.x, m.y, m.w, m.h])}`);
  }
  for (const m of maya) {
    if (m.x < 0 || m.y < 0 || m.x + m.w > view.w + 0.5 || m.y + m.h > view.h + 0.5) problems.push(`${m.label} leaves the viewport (${JSON.stringify(m)})`);
    for (const o of others) if (overlap(m, o)) problems.push(`${m.label} ${JSON.stringify([m.x, m.y, m.w, m.h].map(Math.round))} overlaps ${o.label} ${JSON.stringify([o.x, o.y, o.w, o.h].map(Math.round))}`);
  }
  if (problems.length && process.env.LAYOUT_DEBUG) {
    problems.push(String(await page.evaluate(`(() => { const m = window.__panjimForTest.maya; const p = document.querySelector(".empty-prompt"); return JSON.stringify({ obstacles: m.obstacles().map((r) => [r.x, r.y, r.w, r.h].map(Math.round)), anchor: m.anchor ? m.anchor() : null, placed: m.placed, lastLayoutMs: Math.round(m.lastLayoutMs), now: Math.round(performance.now()), dirty: m.layoutDirty, minimised: m.minimised, current: m.current && m.current.id, figVis: m.figure.style.visibility, prompt: p ? { hidden: p.hidden, closestHidden: !!p.closest("[hidden]"), vis: getComputedStyle(p).visibility, disp: getComputedStyle(p).display, inMayaContainer: m.container.contains(p) } : null }); })()`)));
  }
  if (problems.length) failures.push(`${label}: ${problems.join("; ")}`);
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${label}${problems.length ? "  " + problems.join("; ") : ""}`);
}

async function main(): Promise<void> {
  const server = await startDevServer(PORT);
  try {
    const browser = await chromium.launch({
      executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    });
    for (const res of RESOLUTIONS) {
      const page = await (await browser.newContext({ viewport: { width: res.w, height: res.h } })).newPage();
      // A page error stops the game's frame loop, and with it Maya's layout: fail on any.
      page.on("pageerror", (e) => {
        failures.push(`${res.w}x${res.h}: page error: ${e.message}`);
        console.log(`FAIL  ${res.w}x${res.h} page error: ${e.message}\n${e.stack ?? ""}`);
      });
      await page.goto(`http://localhost:${PORT}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-card", { timeout: 60000 });
      await page.locator(".brief-cta").first().click();
      await page.waitForTimeout(2500);
      // Measure layout, not reading time: her lines stay up until replaced.
      await page.evaluate("window.__panjimForTest.maya.holdLines = true");
      const tag = `${res.w}x${res.h}`;
      for (const discovery of [false, true]) {
        for (const getReadyOpen of [true, false]) {
          for (const tooltip of [false, true]) {
            for (const warn of [null, "st-cruz", "merces", "miramar"]) {
              // Reset the HUD state for this case.
              await page.evaluate(`(() => {
                const panel = document.querySelector(".get-ready");
                if (panel && panel.classList.contains("collapsed") === ${getReadyOpen}) panel.querySelector(".get-ready-toggle").click();
                window.__tooltipsForTest.hide();
              })()`);
              await page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(warn ? `maya-warn-${warn}` : "maya:tip")})`);
              // A discovery: the tallest fact (a cited one, with its count and Source), said by Maya in place of her tip.
              if (discovery) await page.evaluate("window.__nuggetPopupForTest.replay('khazan-what')");
              if (tooltip) await page.evaluate(`(() => { const el = document.querySelector('[data-tip="getReady"]') || document.querySelector('[data-tip="coin"]'); window.__tooltipsForTest.show(el); })()`);
              await assertClear(page, `${tag} discovery=${discovery ? "said" : "no"} getReady=${getReadyOpen ? "open" : "collapsed"} tooltip=${tooltip ? "open" : "none"} ${warn ? `warning=${warn}` : "tip"}`, true);
            }
          }
        }
      }
      // The build menu open, Maya talking.
      await page.evaluate("window.__panjimScenarioForTest('maya:tip')");
      await page.evaluate("window.__panjimScenarioForTest('menu-beach')");
      await assertClear(page, `${tag} build menu open`, true);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      if (process.env.LAYOUT_SHOTS) {
        fs.mkdirSync("docs/qa/layout", { recursive: true });
        await page.evaluate("window.__nuggetPopupForTest.replay('khazan-what')");
        await page.waitForTimeout(900);
        await page.screenshot({ path: `docs/qa/layout/maya-discovery-said-${tag}.jpg`, type: "jpeg", quality: 75 });
        await page.waitForTimeout(5200);
        await page.evaluate("window.__panjimScenarioForTest('maya:tip')");
        await page.waitForTimeout(900);
        await page.screenshot({ path: `docs/qa/layout/maya-discovery-hidden-${tag}.jpg`, type: "jpeg", quality: 75 });
      }
      // Minimised: the badge alone, clear of everything.
      await page.evaluate("window.__panjimForTest.maya.setMinimised(true)");
      await assertClear(page, `${tag} minimised`, false);
      await page.evaluate("window.__panjimForTest.maya.setMinimised(false)");
      // Resize down and back: she follows.
      await page.setViewportSize({ width: Math.round(res.w * 0.8), height: Math.round(res.h * 0.8) });
      await page.evaluate("window.__panjimScenarioForTest('maya:tip')");
      // A resize re-lays her out, which can re-show the bubble; let its 220 ms fade-in finish
      // (up to 3 s) so the check reads the settled layout. It still fails if the bubble never shows.
      for (let i = 0; i < 30; i++) {
        const settled = await page.evaluate(`(() => { const b = document.querySelector(".maya-bubble"); return Boolean(b) && !b.closest("[hidden]") && Number(getComputedStyle(b).opacity) > 0.99; })()`);
        if (settled) break;
        await page.waitForTimeout(100);
      }
      await assertClear(page, `${tag} resized to 80%`, true);
      await page.close();
    }
    await browser.close();
  } finally {
    server.stop();
  }
  console.log(`\n${checks} layouts checked, ${failures.length} failed`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
