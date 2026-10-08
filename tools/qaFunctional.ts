/**
 * The QA gate's functional checks, in a real browser (Chromium, software GL):
 *
 *   - routing: menu → Tutorial → back → Panaji, refresh, browser back;
 *   - resize across 1366/1920/2560, a hidden tab, fullscreen;
 *   - keyboard only: Tab focus with a visible ring, R / M / S, Esc;
 *   - sound: nothing before the first click;
 *   - axe-core on the menu, the Tutorial and the Panaji board;
 *   - truthfulness: on every wet tile, the depth the water layer drew equals
 *     the core's depth at the same storm time, at several moments of each
 *     storm kind;
 *   - flash: the on-screen lightning overlay sampled every frame through a
 *     cyclone's height: peak opacity and onsets per second;
 *   - console errors, warnings and failed requests throughout.
 *
 * Prints a report (markdown) and exits 1 on any failure.
 * Usage: npx tsx tools/qaFunctional.ts > docs/qa/functional.md
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const PORT = 5197;
const BASE = `http://localhost:${PORT}`;
const lines: string[] = [];
const failures: string[] = [];
const noise: string[] = [];

function check(ok: boolean, label: string, detail = ""): void {
  lines.push(`- ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function scenario(page: Page, name: string): Promise<boolean> {
  return (await page.evaluate(`(async () => window.__panjimScenarioForTest ? await window.__panjimScenarioForTest(${JSON.stringify(name)}) : false)()`)) as boolean;
}

async function startPanaji(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-cta", { timeout: 90000 });
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3000);
}

function watch(page: Page, label: string): void {
  page.on("pageerror", (err) => noise.push(`${label} pageerror: ${err}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") noise.push(`${label} ${msg.type()}: ${msg.text()}`);
  });
  page.on("requestfailed", (req) => noise.push(`${label} request failed: ${req.url()} ${req.failure()?.errorText ?? ""}`));
}

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") });
  const result = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  })()`)) as { id: string; impact: string; nodes: number; help: string }[];
  const serious = result.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(serious.length === 0, `axe-core: ${label} has no serious or critical violations`, result.length === 0 ? "no violations" : result.map((v) => `${v.impact} ${v.id} ×${v.nodes} (${v.help})`).join("; "));
}

async function main(): Promise<void> {
  const server = await startDevServer(PORT);
  try {
    const browser = await chromium.launch({
      executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=user-gesture-required"]
    });

    // ---- Routing, refresh, back, sound before a click -----------------------
    lines.push("", "## Routing, refresh, back, sound");
    {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();
      watch(page, "routing");
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".menu-screen", { timeout: 30000 });
      const menuButtons = await page.locator(".menu-screen button, .menu-screen a").allInnerTexts();
      check(menuButtons.some((t) => /tutorial/i.test(t)) && menuButtons.some((t) => /choose a level/i.test(t)), "menu offers Tutorial and Choose a level", menuButtons.map((t) => t.trim()).filter(Boolean).join(" | "));
      check(!(await page.locator("input[type=email]").count()), "no email field on the menu (email requirement hidden)");
      const audioBefore = (await page.evaluate("window.__audioForTest ? window.__audioForTest() : null")) as { unlocked: boolean; context: boolean } | null;
      await page.goto(`${BASE}/#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);
      check((await page.locator("canvas").count()) > 0, "Tutorial route renders the board");
      await page.goBack();
      await page.waitForSelector(".menu-screen", { timeout: 30000 });
      check(true, "browser Back returns to the menu");
      await startPanaji(page);
      const audioSilent = (await page.evaluate("window.__audioForTest ? window.__audioForTest() : null")) as { unlocked: boolean; context: boolean } | null;
      check(audioBefore !== null && !audioBefore.context, "no audio context before any click", JSON.stringify(audioBefore));
      check(audioSilent !== null && audioSilent.unlocked, "the first click unlocks sound", JSON.stringify(audioSilent));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-cta, canvas", { timeout: 90000 });
      check(page.url().includes("l01-first-rains"), "refresh stays on the level", page.url());
      await context.close();
    }

    // ---- Resize, hidden tab, fullscreen -------------------------------------
    lines.push("", "## Resize, hidden tab, fullscreen");
    {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();
      watch(page, "resize");
      await startPanaji(page);
      for (const [w, h] of [[1366, 768], [2560, 1440], [1920, 1080]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(900);
        const size = (await page.evaluate("(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()")) as { w: number; h: number };
        check(size.w === w && size.h === h, `canvas fills the window at ${w}x${h}`, `${size.w}x${size.h}`);
      }
      const framesBefore = (await page.evaluate("window.__frameStatsForTest.frames")) as number;
      const other = await context.newPage();
      await other.goto("about:blank");
      await other.bringToFront();
      await page.waitForTimeout(1500);
      await page.bringToFront();
      await page.waitForTimeout(1500);
      const framesAfter = (await page.evaluate("window.__frameStatsForTest.frames")) as number;
      check(framesAfter > framesBefore, "rendering resumes after the tab is hidden and shown", `${framesBefore} → ${framesAfter} frames`);
      const fullscreen = (await page.evaluate("(async () => { try { await document.documentElement.requestFullscreen(); const on = !!document.fullscreenElement; await document.exitFullscreen(); return on ? 'entered and left' : 'not entered'; } catch (e) { return 'refused: ' + e.message; } })()")) as string;
      lines.push(`- INFO fullscreen: ${fullscreen} (headless Chromium may refuse without a real gesture)`);
      await context.close();
    }

    // ---- Keyboard only ------------------------------------------------------
    lines.push("", "## Keyboard only");
    {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();
      watch(page, "keyboard");
      await page.goto(`${BASE}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-cta", { timeout: 90000 });
      await page.locator(".brief-cta").first().focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
      const pressed = async (selector: string): Promise<string | null> => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute("aria-pressed") ?? null`) as Promise<string | null>;
      for (const [key, selector] of [["r", ".risk-toggle"], ["m", ".maya-toggle"], ["s", ".sound-toggle"]] as const) {
        const before = await pressed(selector);
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
        const after = await pressed(selector);
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
        const back = await pressed(selector);
        check(before !== null && before !== after && back === before, `${key.toUpperCase()} toggles ${selector} and back`, `${before} → ${after} → ${back}`);
      }
      // Tab reaches the HUD controls with a visible focus ring.
      let rings = 0;
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press("Tab");
        const info = (await page.evaluate(`(() => { const el = document.activeElement; if (!el || el === document.body) return null; const s = getComputedStyle(el); return { name: (el.className || el.tagName) + ':' + (el.textContent || '').trim().slice(0, 20), ring: (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none' }; })()`)) as { name: string; ring: boolean } | null;
        if (!info) continue;
        seen.add(info.name);
        if (info.ring) rings++;
      }
      check(seen.size >= 8, "Tab reaches the HUD controls", `${seen.size} distinct stops`);
      check(rings >= Math.min(seen.size, 8) * 0.8, "focused controls show a visible focus ring", `${rings} of ${seen.size} stops`);
      // Esc closes a tooltip.
      await page.locator(".sound-toggle").focus();
      await page.waitForTimeout(200);
      const tipOpen = (await page.evaluate("!document.querySelector('.hud-tooltip')?.hidden")) as boolean;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const tipClosed = (await page.evaluate("!!document.querySelector('.hud-tooltip')?.hidden")) as boolean;
      check(tipOpen && tipClosed, "focus shows a tooltip and Esc closes it");
      await context.close();
    }

    // ---- axe-core -----------------------------------------------------------
    lines.push("", "## axe-core");
    {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();
      watch(page, "axe");
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".menu-screen", { timeout: 30000 });
      await axe(page, "menu");
      await page.goto(`${BASE}/#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);
      await axe(page, "Tutorial");
      await startPanaji(page);
      await axe(page, "Panaji board");
      await context.close();
    }

    // ---- Truthfulness and flash ---------------------------------------------
    lines.push("", "## Truthfulness: drawn depth = resolved depth", "");
    {
      const kinds: { label: string; steps: string[]; times: number[] }[] = [
        { label: "cyclone", steps: [], times: [6, 9, 12, 16, 20] },
        { label: "flood", steps: ["past-storm"], times: [9, 14, 20, 28] },
        { label: "finale", steps: ["past-storm", "past-storm"], times: [10, 16, 22, 30] }
      ];
      for (const kind of kinds) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        watch(page, `truth-${kind.label}`);
        await startPanaji(page);
        for (const step of kind.steps) await scenario(page, step);
        await scenario(page, `storm-${kind.times[0]}`);
        let worst = 0;
        let compared = 0;
        let wet = 0;
        for (const t of kind.times) {
          await page.evaluate(`window.__stormForTest.freeze(${t})`);
          await page.waitForTimeout(400);
          const r = (await page.evaluate(`(() => {
            const keys = window.__stormForTest.allKeys();
            let worst = 0, n = 0, wet = 0;
            for (const key of keys) {
              const c = window.__stormForTest.compare(key);
              if (!c) continue;
              n++;
              if (c.drawn > 0.01) wet++;
              worst = Math.max(worst, Math.abs(c.drawn - c.core));
            }
            return { worst, n, wet };
          })()`)) as { worst: number; n: number; wet: number };
          worst = Math.max(worst, r.worst);
          compared += r.n;
          wet += r.wet;
        }
        check(worst < 1e-9 && compared > 0 && wet > 0, `${kind.label}: drawn depth equals the core depth on every water tile at t = ${kind.times.join(", ")} s`, `${compared} tile-moments, ${wet} wet, worst difference ${worst}`);
        if (kind.label === "cyclone") {
          // Flash: release the storm at the height and sample the overlay every frame.
          await page.evaluate("window.__stormForTest.freeze(null)");
          const flash = (await page.evaluate(`new Promise((resolve) => {
            const el = document.querySelector(".storm-flash");
            let peak = 0, onsets = 0, wasOn = false;
            const t0 = performance.now();
            const step = () => {
              const o = el ? parseFloat(getComputedStyle(el).opacity) : 0;
              peak = Math.max(peak, o);
              const on = o > 0.02;
              if (on && !wasOn) onsets++;
              wasOn = on;
              if (performance.now() - t0 < 12000) requestAnimationFrame(step);
              else resolve({ peak, onsets, seconds: (performance.now() - t0) / 1000 });
            };
            requestAnimationFrame(step);
          })`)) as { peak: number; onsets: number; seconds: number };
          check(flash.peak <= 0.25 + 1e-6, "lightning overlay never brighter than 25%", `peak opacity ${flash.peak.toFixed(3)}`);
          check(flash.onsets / flash.seconds <= 3, "no more than 3 flashes a second", `${flash.onsets} flashes in ${flash.seconds.toFixed(1)} s`);
        }
        await context.close();
      }
    }
    await browser.close();
  } finally {
    server.stop();
  }
  lines.push("", "## Console errors, warnings and failed requests", "");
  check(noise.length === 0, "no console errors, warnings or failed requests in any of the runs above", noise.length ? `${noise.length} found` : "");
  for (const n of noise.slice(0, 40)) lines.push(`  - ${n}`);
  console.log(["# Functional QA (Chromium, software GL)", ...lines, "", `**${failures.length === 0 ? "All checks passed" : `${failures.length} failed: ${failures.join("; ")}`}**`].join("\n"));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
