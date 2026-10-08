/**
 * Maya must never overlap any other HUD element, and must stay inside the
 * viewport. This drives the real game in a browser through every layout
 * the brief lists and checks the rectangles:
 *
 *   resolutions 1366x768, 1920x1080, 2560x1440
 *   x the Discovery card hidden and shown (its tallest card: the longest fact, with its Source row)
 *   x the Get ready panel open and collapsed
 *   x no tooltip and a tooltip open
 *   x Maya docked with a tip, and mid warning jump to three places
 *
 * Fails (exit code 1) on the first overlap, with the offending pair.
 * `npm run test:layout`.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const PORT = 5197;
const ALL_RESOLUTIONS = [
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 }
];
/** LAYOUT_ONLY=2560 runs one width (for chasing a single case). */
const RESOLUTIONS = ALL_RESOLUTIONS.filter((r) => !process.env.LAYOUT_ONLY || String(r.w) === process.env.LAYOUT_ONLY);
/** Everything Maya must keep clear of: a deliberately broad list, independent of the one the layout manager uses. */
const OTHER_HUD = [
  ".instrument-cluster", ".coin-jar", ".field-guide-button", ".panjim-clock", ".hud-chrome", ".houses-counter",
  ".panjim-toggles", ".objectives-panel", ".get-ready", ".nugget-badge", ".map-corner", ".map-layer-control",
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
  // A move fades her out and back in at the new spot; measure once she has arrived.
  for (let i = 0; i < 40 && (await page.evaluate("Boolean(document.querySelector('.maya.hopping'))")); i++) await page.waitForTimeout(100);
  const { maya, others, view } = await measure(page);
  checks++;
  const problems: string[] = [];
  if (!maya.some((r) => r.label === "figure" || r.label === "badge")) problems.push("Maya is not on screen");
  if (expectBubble && !maya.some((r) => r.label === "bubble")) {
    const why = await page.evaluate(`(() => { const m = window.__panjimForTest.maya; return JSON.stringify({ current: m.current && m.current.id, pending: m.pending, heldBack: m.heldBack, minimised: m.minimised, muted: m.muted, bubbleHidden: m.bubble.hidden, view: [innerWidth, innerHeight] }); })()`);
    problems.push(`her bubble is not showing ${why}`);
  }
  for (const m of maya) {
    if (m.x < 0 || m.y < 0 || m.x + m.w > view.w + 0.5 || m.y + m.h > view.h + 0.5) problems.push(`${m.label} leaves the viewport (${JSON.stringify(m)})`);
    for (const o of others) if (overlap(m, o)) problems.push(`${m.label} overlaps ${o.label}`);
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
      await page.goto(`http://localhost:${PORT}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-card", { timeout: 60000 });
      await page.locator(".brief-cta").first().click();
      await page.waitForTimeout(2500);
      // Measure layout, not reading time: her lines stay up until replaced.
      await page.evaluate("window.__panjimForTest.maya.holdLines = true");
      const tag = `${res.w}x${res.h}`;
      for (const discovery of [false, true]) {
        for (const getReadyOpen of [true, false]) {
          for (const tooltip of [false, true]) {
            for (const jump of [null, "st-cruz", "merces", "miramar"]) {
              // Reset the HUD state for this case.
              await page.evaluate(`(() => {
                const panel = document.querySelector(".get-ready");
                if (panel && panel.classList.contains("collapsed") === ${getReadyOpen}) panel.querySelector(".get-ready-toggle").click();
                window.__tooltipsForTest.hide();
              })()`);
              if (discovery) await page.evaluate("window.__nuggetPopupForTest.show('khazan', 'khazan-what')");
              await page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(jump ? `maya-jump-${jump}` : "maya:tip")})`);
              if (tooltip) await page.evaluate(`(() => { const el = document.querySelector('[data-tip="getReady"]') || document.querySelector('[data-tip="coin"]'); window.__tooltipsForTest.show(el); })()`);
              await assertClear(page, `${tag} discovery=${discovery ? "shown" : "hidden"} getReady=${getReadyOpen ? "open" : "collapsed"} tooltip=${tooltip ? "open" : "none"} ${jump ? `jump=${jump}` : "docked"}`, true);
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
        await page.evaluate("window.__nuggetPopupForTest.show('khazan', 'khazan-what')");
        await page.evaluate("window.__panjimScenarioForTest('maya:explains')");
        await page.waitForTimeout(900);
        await page.screenshot({ path: `docs/qa/layout/maya-discovery-shown-${tag}.jpg`, type: "jpeg", quality: 75 });
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
