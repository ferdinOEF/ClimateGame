/**
 * Section 1b: what Maya's new artwork costs per frame, at 1920x1080.
 *
 * Usage:  npx tsx tools/mayaPerf.ts
 *
 * Two measurements, alternated three times:
 *   - the game on Panaji (calm board, Medium quality) with Maya shown and
 *     idling (breathing, nodding, blinking: her animations run every frame),
 *     then with her layer hidden: the difference is her whole cost;
 *   - a page with nothing but her HUD figure, animated by the game's own
 *     stylesheet at the same size: her cost alone, the new art against the
 *     old (from master) and an empty page.
 * Prints the frames per second of each. Software GL (SwiftShader), so the
 * game's own numbers are low; the comparison is what matters.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { startDevServer } from "./devServer";
import { hudFigureSvg } from "../src/ui/panjim/mayaArt";

const ROOT = path.resolve(import.meta.dirname, "..");

const PORT = Number(process.env.PERF_PORT ?? 5297);
const SECONDS = Number(process.env.PERF_SECONDS ?? 20);

async function fps(page: Page): Promise<number> {
  const before = (await page.evaluate("window.__frameStatsForTest.frames")) as number;
  await page.waitForTimeout(SECONDS * 1000);
  const after = (await page.evaluate("window.__frameStatsForTest.frames")) as number;
  return (after - before) / SECONDS;
}

async function rafFps(page: Page): Promise<number> {
  return (await page.evaluate(
    `new Promise((resolve) => { let n = 0; const start = performance.now(); const tick = () => { n++; if (performance.now() - start < ${SECONDS * 1000}) requestAnimationFrame(tick); else resolve(n / ((performance.now() - start) / 1000)); }; requestAnimationFrame(tick); })`
  )) as number;
}

async function main(): Promise<void> {
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card", { timeout: 120000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(4000);
    await page.evaluate(`window.__panjimScenarioForTest("quality-medium")`);
    await page.evaluate("window.__panjimForTest && (window.__panjimForTest.maya.holdLines = true)");
    await page.waitForTimeout(3000);
    const shown: number[] = [];
    const hidden: number[] = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate("document.getElementById('qa-hide-maya')?.remove()");
      await page.waitForTimeout(1500);
      shown.push(await fps(page));
      await page.addStyleTag({ content: ".maya { display: none !important; }" }).then((h) => h.evaluate((el) => ((el as HTMLElement).id = "qa-hide-maya")));
      await page.waitForTimeout(1500);
      hidden.push(await fps(page));
    }
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`Panaji at 1920x1080, Medium: Maya shown ${mean(shown).toFixed(2)} fps (${shown.map((x) => x.toFixed(2)).join(", ")}), hidden ${mean(hidden).toFixed(2)} fps (${hidden.map((x) => x.toFixed(2)).join(", ")}); her cost ${(mean(hidden) - mean(shown)).toFixed(2)} fps`);

    // Her figure alone, animated by the game's own stylesheet, old art against new: an A/B with nothing else on the page.
    const css = fs.readFileSync(path.join(ROOT, "src/ui/panjim/panjim.css"), "utf8");
    const oldSvg = execSync("git show master:src/ui/panjim/maya.ts", { cwd: ROOT, encoding: "utf8" }).match(/const SVG = `([\s\S]*?<\/svg>)`;/)?.[1];
    const pages: [string, string][] = [["new", hudFigureSvg(118, 136)], ...(oldSvg ? ([["old (master)", oldSvg]] as [string, string][]) : [])];
    for (const [name, svg] of pages) {
      const alone = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await alone.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="margin:0;background:#3b6b5c"><div class="maya state-idle"><div class="maya-figure-wrap" style="top:auto;bottom:80px">${svg}</div></div></body></html>`);
      await alone.waitForTimeout(1500);
      console.log(`Her figure alone, idling (${name}): ${(await rafFps(alone)).toFixed(1)} fps`);
      await alone.close();
    }
    const blank = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await blank.setContent(`<!doctype html><html><body style="margin:0;background:#3b6b5c"></body></html>`);
    console.log(`An empty page: ${(await rafFps(blank)).toFixed(1)} fps`);
  } finally {
    await browser.close();
    server.stop();
  }
}

void main();
