/**
 * Section 21.3: what the ruins cost. The calm board at the start of the run
 * (no ruins) against the calm board after the three storms played through
 * undefended (every ruin the run can hold), per graphics quality: average
 * fps, p95 frame time, draw calls and triangles, and the ruins on the board.
 *
 * Software GL here (SwiftShader): absolute fps is far below a real GPU's;
 * the draw calls and triangles are the useful readings.
 *
 * Usage: npx tsx tools/ruinPerf.ts [WxH=1920x1080]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const [W, H] = (process.argv[2] ?? "1920x1080").split("x").map(Number);
const QUALITIES = ["low", "high"] as const;

async function measure(page: Page, ms = 6000): Promise<{ fps: number; p95: number; calls: number; triangles: number }> {
  const times = (await page.evaluate(`new Promise((resolve) => {
    const out = []; let last = performance.now(); const t0 = last;
    const step = (now) => { out.push(now - last); last = now; if (now - t0 < ${ms}) requestAnimationFrame(step); else resolve(out); };
    requestAnimationFrame(step);
  })`)) as number[];
  const frames = times.slice(1).sort((a, b) => a - b);
  const total = frames.reduce((a, b) => a + b, 0);
  const stats = (await page.evaluate("({ ...window.__frameStatsForTest })")) as { calls: number; triangles: number };
  return { fps: (frames.length * 1000) / total, p95: frames[Math.floor(frames.length * 0.95)] ?? 0, calls: stats.calls, triangles: stats.triangles };
}

const server = await startDevServer(Number(process.env.PORT ?? 5197));
const errors: string[] = [];
const rows = ["| quality | board | ruins | avg fps | p95 frame ms | draw calls | triangles |", "|---|---|---|---|---|---|---|"];
try {
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  for (const quality of QUALITIES) {
    const context = await browser.newContext({ viewport: { width: W, height: H } });
    await context.addInitScript(`try { localStorage.clear(); localStorage.setItem("riptide-rising:quality", "${quality}"); } catch {}`);
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push(`${quality}: ${err}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`${quality} [error]: ${msg.text()}`);
    });
    await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-cta", { timeout: 120000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(3000);
    await page.mouse.move(2, H - 2);
    const row = async (board: string): Promise<void> => {
      await page.waitForTimeout(1000);
      const ruins = (await page.evaluate("window.__ruinsForTest().ruined")) as number;
      const m = await measure(page);
      rows.push(`| ${quality} | ${board} | ${ruins} | ${m.fps.toFixed(1)} | ${m.p95.toFixed(1)} | ${m.calls} | ${m.triangles} |`);
      console.error(rows[rows.length - 1]);
    };
    await row("2026, before any storm");
    // Each storm as the shots play them: brought on, hurried, its result cards read through and shut.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(`window.__panjimScenarioForTest("to-results")`);
      for (let k = 0; k < 40; k++) {
        const next = page.locator(".result-cards:not([hidden]) .result-next");
        if (!(await next.isVisible().catch(() => false))) break;
        if (/Play again/.test((await next.textContent()) ?? "")) break;
        await next.click();
        await page.waitForTimeout(800);
      }
      await page.waitForTimeout(1500);
    }
    await row("after the three storms, undefended");
    await context.close();
  }
  await browser.close();
} finally {
  server.stop();
}
console.log(`Ruins' cost at ${W}x${H}, software GL (SwiftShader).\n`);
console.log(rows.join("\n"));
console.log(`\nconsole errors: ${errors.length === 0 ? "none" : errors.join(" | ")}`);
