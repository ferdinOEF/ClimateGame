/**
 * Frame cost of the storms, per graphics quality and hazard, on the full
 * Panaji board at 1920x1080: average fps, 1% low, p95 frame time, draw calls
 * and triangles, each storm held at its peak. Also a leak check: JS heap and
 * renderer geometry/texture counts before and after three storms.
 *
 * Software GL here (SwiftShader): absolute fps is far below a real GPU's, so
 * the useful readings are the relative ones and the call/triangle counts.
 *
 * Usage: npx tsx tools/stormPerf.ts > docs/qa/perf.txt
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const PORT = 5195;
const QUALITIES = ["low", "medium", "high"] as const;
const HAZARDS: { name: string; steps: string[] }[] = [
  { name: "calm", steps: [] },
  { name: "cyclone", steps: ["storm-16"] },
  { name: "flood", steps: ["past-storm", "storm-18"] },
  { name: "finale", steps: ["past-storm", "past-storm", "storm-18"] }
];

async function scenario(page: Page, name: string): Promise<boolean> {
  return (await page.evaluate(`(async () => window.__panjimScenarioForTest ? await window.__panjimScenarioForTest(${JSON.stringify(name)}) : false)()`)) as boolean;
}

async function measure(page: Page, ms = 4000): Promise<{ fps: number; low1: number; p95: number; calls: number; triangles: number }> {
  const times = (await page.evaluate(`new Promise((resolve) => {
    const out = [];
    let last = performance.now();
    const t0 = last;
    const step = (now) => {
      out.push(now - last);
      last = now;
      if (now - t0 < ${ms}) requestAnimationFrame(step);
      else resolve(out);
    };
    requestAnimationFrame(step);
  })`)) as number[];
  const frames = times.slice(1).sort((a, b) => a - b);
  const total = frames.reduce((a, b) => a + b, 0);
  const fps = (frames.length * 1000) / total;
  const p95 = frames[Math.floor(frames.length * 0.95)] ?? 0;
  const worst = frames.slice(Math.floor(frames.length * 0.99));
  const low1 = worst.length ? 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length) : fps;
  const stats = (await page.evaluate("({ ...window.__frameStatsForTest })")) as { calls: number; triangles: number };
  return { fps, low1, p95, calls: stats.calls, triangles: stats.triangles };
}

async function main(): Promise<void> {
  const server = await startDevServer(PORT);
  const errors: string[] = [];
  const rows: string[] = ["| quality | state | avg fps | 1% low | p95 frame ms | draw calls | triangles |", "|---|---|---|---|---|---|---|"];
  try {
    const browser = await chromium.launch({
      executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info"]
    });
    for (const quality of QUALITIES) {
      for (const hazard of HAZARDS) {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        await context.addInitScript(`try { localStorage.setItem("riptide-rising:quality", "${quality}"); } catch {}`);
        const page = await context.newPage();
        page.on("pageerror", (err) => errors.push(`${quality}/${hazard.name}: ${err}`));
        page.on("console", (msg) => {
          if (msg.type() === "error" || msg.type() === "warning") errors.push(`${quality}/${hazard.name} [${msg.type()}]: ${msg.text()}`);
        });
        page.on("requestfailed", (req) => errors.push(`${quality}/${hazard.name} request failed: ${req.url()}`));
        await page.goto(`http://localhost:${PORT}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".brief-cta", { timeout: 90000 });
        await page.locator(".brief-cta").first().click();
        await page.waitForTimeout(3000);
        for (const step of hazard.steps) if (!(await scenario(page, step))) errors.push(`${quality}/${hazard.name}: scenario ${step} failed`);
        await page.waitForTimeout(800);
        const m = await measure(page);
        rows.push(`| ${quality} | ${hazard.name} | ${m.fps.toFixed(1)} | ${m.low1.toFixed(1)} | ${m.p95.toFixed(1)} | ${m.calls} | ${m.triangles} |`);
        console.error(rows[rows.length - 1]);
        await context.close();
      }
    }
    // Leak check: three storms played through on one page.
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push(`leak: ${err}`));
    await page.goto(`http://localhost:${PORT}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-cta", { timeout: 90000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(3000);
    const snap = async (): Promise<string> =>
      (await page.evaluate(`JSON.stringify({ heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, dom: document.getElementsByTagName("*").length })`)) as string;
    const before = await snap();
    for (let i = 0; i < 3; i++) await scenario(page, "past-storm");
    await page.waitForTimeout(1500);
    const after = await snap();
    rows.push("", `Leak check (three storms on one page): before ${before}, after ${after}`);
    await context.close();
    await browser.close();
  } finally {
    server.stop();
  }
  console.log(rows.join("\n"));
  console.log(`\nconsole errors/warnings/failed requests: ${errors.length === 0 ? "none" : errors.length}`);
  for (const e of errors) console.log(`  ${e}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
