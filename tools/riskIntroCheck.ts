/**
 * The first-warning risk sequence, checked in a browser (Section 2).
 *
 * Usage:  npx tsx tools/riskIntroCheck.ts
 *
 *   - It plays on the first warning, and not on the second or third (the run
 *     is played through both storms in between).
 *   - A contact sheet of the whole sequence at 1920x1080 on High: frames held
 *     at fixed times from the fill to the button's pulse
 *     (docs/qa/section2/contact/, laid out by tools/contactSheet.py).
 *   - Reduced motion and Low quality: the right mode, and neither creates the
 *     droplet particles or the ball shader.
 *   - Opening a menu mid-sequence cancels it and leaves nothing behind.
 *   - Frame rate while it plays, on High and on Low.
 *   - No console errors.
 * Exits 1 on any failure.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "qa", "section2");
const PORT = Number(process.env.RISK_PORT ?? 5199);
const failures: string[] = [];
const lines: string[] = [];
const check = (ok: boolean, what: string): void => {
  const line = `${ok ? "PASS" : "FAIL"}  ${what}`;
  console.log(line);
  lines.push(line);
  if (!ok) failures.push(what);
};

async function scenario(page: Page, name: string): Promise<boolean> {
  return (await page.evaluate(`(async () => window.__panjimScenarioForTest ? await window.__panjimScenarioForTest(${JSON.stringify(name)}) : false)()`)) as boolean;
}

async function startPanaji(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 90000 });
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(1500);
}

const fx = (page: Page, expr: string): Promise<unknown> => page.evaluate(`(() => { const fx = window.__riskIntroForTest; return ${expr}; })()`);

/** Frame times while the sequence plays for `seconds`; returns fps and the worst frame. */
async function sampleFps(page: Page, seconds: number): Promise<{ fps: number; worstMs: number }> {
  return (await page.evaluate(`new Promise((resolve) => {
    const times = [];
    const t0 = performance.now();
    const tick = (now) => {
      times.push(now);
      if (now - t0 < ${seconds * 1000}) requestAnimationFrame(tick);
      else {
        let worst = 0;
        for (let i = 1; i < times.length; i++) worst = Math.max(worst, times[i] - times[i - 1]);
        resolve({ fps: (times.length - 1) / ((times[times.length - 1] - times[0]) / 1000), worstMs: worst });
      }
    };
    requestAnimationFrame(tick);
  })`)) as { fps: number; worstMs: number };
}

async function main(): Promise<void> {
  fs.mkdirSync(path.join(OUT, "contact"), { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  const watch = (page: Page, tag: string): void => {
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${tag}: ${m.text()}`); });
  };
  try {
    // ---- First warning only, and the contact sheet (High) -------------------
    {
      const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      watch(page, "full");
      await startPanaji(page, server.url);
      await scenario(page, "quality-high");
      check((await fx(page, "fx.plays")) === 0, "nothing plays before the first warning");
      check(await scenario(page, "heat-4"), "reached the first warning (heat-4)");
      await page.waitForTimeout(300);
      check((await fx(page, "fx.plays")) === 1, "the sequence plays on the first warning");
      check((await fx(page, "fx.currentMode")) === "full", "High quality plays the full sequence");
      check((await fx(page, "fx.created.particles")) === 1 && (await fx(page, "fx.created.shader")) === 1, "the full sequence creates the droplets and the ball shader");
      // Contact sheet: held frames from fill to pulse.
      const times = [0.15, 0.4, 0.9, 1.5, 2.1, 2.7, 3.05, 3.3, 3.7, 6.0, 10.15, 10.4, 10.65, 10.85, 11.1, 11.4, 11.65, 11.85, 12.05, 12.3];
      let i = 0;
      for (const t of times) {
        await fx(page, `(fx.isRunning || fx.start("full", performance.now()), fx.hold(${t}), true)`);
        // Frames are slow under software GL: give the held moment time to be drawn.
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, "contact", `${String(i++).padStart(2, "0")}-t${t.toFixed(2)}.jpg`), type: "jpeg", quality: 70 });
      }
      await fx(page, "(fx.hold(null), true)");
      // Opening a menu mid-sequence cancels it cleanly.
      await fx(page, `(fx.start("full", performance.now()), fx.hold(1.5), true)`);
      await page.waitForTimeout(200);
      check(await scenario(page, "menu-beach"), "the build menu opened mid-sequence");
      // The render loop cancels on its next frame; frames are slow under software GL, so wait up to 5 s.
      for (let k = 0; k < 50 && (await fx(page, "fx.isRunning")); k++) await page.waitForTimeout(100);
      await page.waitForTimeout(200);
      const after = (await page.evaluate(`({
        running: window.__riskIntroForTest.isRunning,
        end: window.__riskIntroForTest.lastEnd,
        canvasHidden: document.querySelector(".risk-intro-canvas").hidden,
        balls: document.querySelectorAll(".risk-intro-ball, .risk-intro-disc").length,
        button: document.querySelector(".risk-toggle").className
      })`)) as { running: boolean; end: string; canvasHidden: boolean; balls: number; button: string };
      check(!after.running && after.end === "menu" && after.canvasHidden && after.balls === 0 && !/risk-intro/.test(after.button), `opening the build menu cancels it and leaves nothing behind (${JSON.stringify(after)})`);
      await page.keyboard.press("Escape");
      // Frame rate on High, the whole sequence in real time.
      await fx(page, `(fx.start("full", performance.now()), true)`);
      const high = await sampleFps(page, 12.5);
      lines.push(`fps during the sequence, High, 1920x1080: ${high.fps.toFixed(1)} (worst frame ${high.worstMs.toFixed(0)} ms)`);
      console.log(lines[lines.length - 1]);
      await page.close();
    }
    // ---- The wave and the ball at the other two window sizes ----------------
    for (const [w, h] of [[1366, 768], [2560, 1440]]) {
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      watch(page, `${w}`);
      await startPanaji(page, server.url);
      await scenario(page, "quality-high");
      await scenario(page, "heat-4");
      for (const t of [1.5, 3.3, 10.4, 11.3]) {
        await fx(page, `(fx.isRunning || fx.start("full", performance.now()), fx.hold(${t}), true)`);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `t${t}-${w}x${h}.jpg`), type: "jpeg", quality: 75 });
      }
      await fx(page, "(fx.cancel('done with shots'), true)");
      await page.close();
    }
    // ---- Second and third warnings do not play ------------------------------
    {
      const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      watch(page, "gate");
      await startPanaji(page, server.url);
      await scenario(page, "heat-4");
      await page.waitForTimeout(300);
      check((await fx(page, "fx.plays")) === 1, "gate: plays on the first warning");
      for (const n of [2, 3]) {
        check(await scenario(page, "past-storm"), `gate: played through storm ${n - 1}`);
        check(await scenario(page, "heat-4"), `gate: reached warning ${n}`);
        await page.waitForTimeout(400);
        const hot = (await page.evaluate("window.__heatForTest ? window.__heatForTest.visibleCount : -1")) as number;
        check((await fx(page, "fx.plays")) === 1, `gate: does NOT play on warning ${n} (risk tiles showing: ${hot})`);
      }
      await page.close();
    }
    // ---- Reduced motion -----------------------------------------------------
    {
      const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage();
      watch(page, "reduced");
      await startPanaji(page, server.url);
      await scenario(page, "heat-4");
      await page.waitForTimeout(500);
      check((await fx(page, "fx.currentMode")) === "reduced", "reduced motion: the reduced sequence");
      await page.screenshot({ path: path.join(OUT, "reduced-1920x1080.jpg"), type: "jpeg", quality: 75 });
      await page.waitForTimeout(4500);
      check((await fx(page, "fx.created.particles")) === 0 && (await fx(page, "fx.created.shader")) === 0, "reduced motion: no particle system and no shader were ever created");
      check((await fx(page, "fx.isRunning")) === false && (await page.evaluate(`document.querySelectorAll(".risk-intro-ball, .risk-intro-disc").length`)) === 0, "reduced motion: it ends and leaves nothing behind");
      await page.close();
    }
    // ---- Low quality --------------------------------------------------------
    {
      const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      watch(page, "low");
      await startPanaji(page, server.url);
      await scenario(page, "quality-low");
      await scenario(page, "heat-4");
      await page.waitForTimeout(300);
      check((await fx(page, "fx.currentMode")) === "flat", "Low quality: the flat sequence");
      const low = await sampleFps(page, 12.5);
      lines.push(`fps during the sequence, Low, 1920x1080: ${low.fps.toFixed(1)} (worst frame ${low.worstMs.toFixed(0)} ms)`);
      console.log(lines[lines.length - 1]);
      check((await fx(page, "fx.created.particles")) === 0 && (await fx(page, "fx.created.shader")) === 0, "Low quality: no particle system and no shader were ever created");
      // A held frame of the flat disc in flight, for the record.
      await fx(page, `(fx.start("flat", performance.now()), fx.hold(10.5), true)`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, "low-disc-1920x1080.jpg"), type: "jpeg", quality: 75 });
      check((await fx(page, "fx.created.particles")) === 0 && (await fx(page, "fx.created.shader")) === 0, "Low quality: still none after a second play");
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  check(errors.length === 0, `no console errors or warnings${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  fs.writeFileSync(path.join(OUT, "riskIntroCheck.txt"), lines.join("\n") + "\n");
  if (failures.length) {
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
