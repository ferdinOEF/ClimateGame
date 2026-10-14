/**
 * Section 1b/1c: what Maya's artwork costs per frame, at 1920x1080.
 *
 * Usage:  npx tsx tools/mayaPerf.ts
 *
 * Two measurements, alternated three times:
 *   - the game on Panaji (calm board, Medium quality) with Maya shown and
 *     idling (breathing, nodding, blinking: her animations run every frame),
 *     then with her layer hidden: the difference is her whole cost;
 *   - a page with nothing but her HUD figure, animated by the game's own
 *     stylesheet at the same size: her cost alone, the new figure against the
 *     one on master (art, stylesheet and size) and an empty page.
 * Prints the frames per second of each. Software GL (SwiftShader), so the
 * game's own numbers are low; the comparison is what matters.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { startDevServer } from "./devServer";
import { HUD_UNIT_PX, HUD_VIEWBOX, hudFigureSvg } from "../src/ui/panjim/mayaArt";
import { MAYA_SCALE, figureSize } from "../src/ui/panjim/mayaLayout";

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

    // The game's page is closed first: left running it shares the one software renderer and drags every page after it down to its own 1-2 fps.
    await page.context().close();
    // Her figure alone, animated by each version's own stylesheet: the new one against master's, with nothing else on the page.
    const nodes = (svg: string): number => (svg.match(/<[a-zA-Z]/g) ?? []).length;
    const box = figureSize(HUD_VIEWBOX, HUD_UNIT_PX);
    const css = fs.readFileSync(path.join(ROOT, "src/ui/panjim/panjim.css"), "utf8");
    const oldCss = execSync("git show master:src/ui/panjim/panjim.css", { cwd: ROOT, encoding: "utf8" });
    // master's art, loaded from a copy of its file (it imports nothing).
    const oldArtFile = path.join(ROOT, "tools/.mayaArtMaster.ts");
    fs.writeFileSync(oldArtFile, execSync("git show master:src/ui/panjim/mayaArt.ts", { cwd: ROOT, encoding: "utf8" }));
    const oldArt = (await import(oldArtFile)) as { hudFigureSvg: (w: number, h: number) => string };
    fs.rmSync(oldArtFile);
    const newSvg = hudFigureSvg("100%", "100%");
    const oldSvg = oldArt.hudFigureSvg(139, 136);
    console.log(`HUD figure SVG nodes: master ${nodes(oldSvg)}, now ${nodes(newSvg)}`);
    const pages: [string, string, string, string][] = [
      ["new", css, newSvg, `--maya-scale:${MAYA_SCALE};--maya-home:12px;--maya-fig-w:${box.w}px;--maya-fig-h:${box.h}px;--maya-badge:30px;--maya-minimise:14px`],
      ["master", oldCss, oldSvg, ""]
    ];
    for (const [name, sheet, svg, vars] of pages) {
      const alone = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      await alone.setContent(`<!doctype html><html><head><style>${sheet}</style></head><body style="margin:0;background:#3b6b5c"><div class="maya state-idle" style="${vars}"><div class="maya-figure-wrap" style="top:auto;left:12px;bottom:80px">${svg}</div></div></body></html>`);
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
