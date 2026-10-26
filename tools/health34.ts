/**
 * Section 34: health on the production build (`vite preview`, default http://localhost:4173), in one tab:
 *
 *   - load time: the menu (DOMContentLoaded, load, the first paint of the menu) and Play Panjim's game view (from the
 *     click to the start popup ready);
 *   - frame time on the calm board at Low, Medium and High quality (median, p95, average fps over a few seconds);
 *   - memory across three full runs of Panjim in the same tab (Play again from the final card each time): the JS heap
 *     after a forced garbage collection, the DOM node count, and the renderer's geometries and textures, at the start
 *     and after each run. A leak shows as steady growth run over run;
 *   - console errors and warnings over the whole session.
 *
 * The runs are hurried with the game's own build path (`__panjimForTest.build` on the objective's picks, else any
 * build) and its Speed up button; result cards are stepped with their own buttons. Measurement, not play.
 *
 * Usage: npx tsx tools/health34.ts [width=1920] [height=1080] [runs=3] [gpu=1] [url=http://localhost:4173] > docs/qa/section34/health.md
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("width") ?? 1920);
const H = Number(args.get("height") ?? 1080);
const RUNS = Number(args.get("runs") ?? 3);
const URL0 = args.get("url") ?? "http://localhost:4173";
const useGpu = args.get("gpu") !== "0";
const GPU = process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--ignore-gpu-blocklist", "--enable-gpu"];
const SW = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: [...(useGpu ? GPU : SW), "--enable-precise-memory-info"] });
const context = await browser.newContext({ viewport: { width: W, height: H } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const log: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") log.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));

const renderer = await page.evaluate(() => {
  const g = document.createElement("canvas").getContext("webgl2");
  const e = g?.getExtension("WEBGL_debug_renderer_info");
  return e ? String(g!.getParameter(e.UNMASKED_RENDERER_WEBGL)) : "unknown";
});

// ---- load time ----
const t0 = Date.now();
await page.goto(`${URL0}/`, { waitUntil: "load" });
const nav = (await page.evaluate(`(() => { const n = performance.getEntriesByType("navigation")[0]; const fp = performance.getEntriesByName("first-contentful-paint")[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fp ? Math.round(fp.startTime) : null }; })()`)) as { dcl: number; load: number; fcp: number | null };
await page.waitForSelector(".menu-card button, .menu button", { timeout: 60000 }).catch(() => undefined);
const menuMs = Date.now() - t0;
const t1 = Date.now();
await page.getByRole("button", { name: "Play Panjim" }).click();
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function" && !!document.querySelector(".brief-cta")`, undefined, { timeout: 120000 });
const gameMs = Date.now() - t1;

// ---- frame time per quality, calm board ----
async function frames(ms = 4000): Promise<{ median: number; p95: number; fps: number }> {
  const times = (await page.evaluate(`new Promise((resolve) => { const out = []; let last = performance.now(); const t0 = last; const step = (now) => { out.push(now - last); last = now; if (now - t0 < ${ms}) requestAnimationFrame(step); else resolve(out); }; requestAnimationFrame(step); })`)) as number[];
  const sorted = [...times.slice(2)].sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const avg = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
  return { median: Math.round(at(0.5) * 10) / 10, p95: Math.round(at(0.95) * 10) / 10, fps: Math.round((1000 / avg) * 10) / 10 };
}
await page.locator(".brief-cta").first().click();
await page.waitForTimeout(3000);
await page.mouse.move(2, H - 2);
const quality: Record<string, { median: number; p95: number; fps: number }> = {};
for (const q of ["low", "medium", "high"]) {
  const ok = await page.evaluate(`(() => { const c = window.__panjimForTest; if (typeof c.host?.setQuality === "function") { c.host.setQuality(${JSON.stringify(q)}); return true; } return false; })()`);
  if (!ok) {
    // Through the menu as a player would: ☰, Quality.
    await page.evaluate(`localStorage.setItem("riptide-rising:quality", ${JSON.stringify(q)})`);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function" && !!document.querySelector(".brief-cta")`, undefined, { timeout: 120000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(3000);
    await page.mouse.move(2, H - 2);
  }
  await page.waitForTimeout(1500);
  quality[q] = await frames();
}
await page.evaluate(`localStorage.setItem("riptide-rising:quality", "medium")`);

// ---- memory over full runs ----
async function memory(): Promise<{ heapMB: number; dom: number; geometries: number | null; textures: number | null }> {
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(500);
  const heap = (await cdp.send("Runtime.getHeapUsage")) as { usedSize: number };
  const info = (await page.evaluate(`(() => { const r = window.__rendererForTest ?? null; const i = r?.info?.memory; return { dom: document.getElementsByTagName("*").length, geometries: i ? i.geometries : null, textures: i ? i.textures : null }; })()`)) as { dom: number; geometries: number | null; textures: number | null };
  return { heapMB: Math.round((heap.usedSize / 1048576) * 10) / 10, ...info };
}

async function playRun(): Promise<{ stars: number[]; ms: number }> {
  const start = Date.now();
  await page.waitForFunction(`!!window.__panjimForTest?.run`, undefined, { timeout: 60000 });
  for (let guard = 0; guard < 60; guard++) {
    const finished = (await page.evaluate("window.__panjimForTest.run.finished")) as boolean;
    if (finished) break;
    await page.evaluate(`(() => { const c = window.__panjimForTest; const run = c.run; if (c.isBusy) return; const at = (k) => ({ q: +k.split(",")[0], r: +k.split(",")[1] });
      const pk = (run.objective?.picks ?? []).find((p) => run.state.canBuild(at(p.key), p.elementId));
      if (pk) { c.build(at(pk.key), pk.elementId); return; }
      for (const t of run.state.placed.values()) { const o = run.state.buildableAt(t.coord); if (o.length) { c.build(t.coord, o[o.length - 1].id); return; } } })()`);
    // A storm: Speed up, then step the result cards with their own buttons.
    for (let k = 0; k < 600; k++) {
      await page.waitForTimeout(250);
      const speed = page.locator(".speed-up:visible");
      if (await speed.count()) await speed.first().click().catch(() => undefined);
      const next = page.locator(".result-cards:not([hidden]) .result-next");
      if (await next.isVisible().catch(() => false)) {
        const label = (await next.textContent()) ?? "";
        if (/Play again|menu/i.test(label)) break;
        await next.click().catch(() => undefined);
        continue;
      }
      const busy = (await page.evaluate("window.__panjimForTest.isBusy || window.__panjimForTest.host.challengeFx.isPlaying()")) as boolean;
      if (!busy) break;
    }
  }
  // The finale's title and the final card.
  await page.waitForFunction(`[...document.querySelectorAll("button")].some((b) => /Play again/.test(b.textContent) && b.getClientRects().length)`, undefined, { timeout: 120000 }).catch(() => undefined);
  const stars = (await page.evaluate("window.__panjimForTest.run.schedule.map((c) => window.__panjimForTest.run.outcomes.get(c.id)?.stars ?? 0)")) as number[];
  return { stars, ms: Date.now() - start };
}

const mem: { when: string; heapMB: number; dom: number; geometries: number | null; textures: number | null }[] = [];
mem.push({ when: "start of run 1", ...(await memory()) });
const runs: { stars: number[]; ms: number }[] = [];
for (let i = 1; i <= RUNS; i++) {
  runs.push(await playRun());
  mem.push({ when: `end of run ${i}`, ...(await memory()) });
  if (i < RUNS) {
    await page.locator("button", { hasText: "Play again" }).first().click();
    await page.waitForFunction(`!!document.querySelector(".brief-cta")`, undefined, { timeout: 120000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(2500);
  }
}
await browser.close();

console.log(`# Section 34 health, ${W}x${H}, ${useGpu ? "GPU" : "software GL"} (${renderer})\n`);
console.log(`| Load | ms |\n|---|---|\n| menu DOMContentLoaded | ${nav.dcl} |\n| menu load event | ${nav.load} |\n| menu first contentful paint | ${nav.fcp ?? "n/a"} |\n| menu on screen (from navigation) | ${menuMs} |\n| Play Panjim click to the start popup ready | ${gameMs} |\n`);
console.log(`| Quality (calm board, 2026) | median frame ms | p95 frame ms | avg fps |\n|---|---|---|---|`);
for (const [q, f] of Object.entries(quality)) console.log(`| ${q} | ${f.median} | ${f.p95} | ${f.fps} |`);
console.log(`\n| Memory | JS heap after GC, MB | DOM nodes | geometries | textures |\n|---|---|---|---|---|`);
for (const m of mem) console.log(`| ${m.when} | ${m.heapMB} | ${m.dom} | ${m.geometries ?? "n/a"} | ${m.textures ?? "n/a"} |`);
console.log(`\nRuns: ${runs.map((r, i) => `run ${i + 1} stars ${r.stars.join("/")} in ${Math.round(r.ms / 1000)} s`).join("; ")}`);
console.log(`\nConsole errors and warnings: ${log.length === 0 ? "none" : log.slice(0, 10).join(" | ")}`);
