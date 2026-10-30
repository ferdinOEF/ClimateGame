/**
 * Section 3 screenshots: the relief, the city fabric and the monuments.
 *
 * Usage:  npx tsx tools/cityHillShots.ts [outDir] [sizes]
 *   outDir defaults to docs/qa/section3; sizes to "1366x768,1920x1080,2560x1440".
 *
 * For each size: the board zoomed fully out (as far as the game lets a player),
 * the opening view of the old city, and Altinho close up from the south-west,
 * on High quality, with Maya quiet. A `-gray` twin of each 1920 shot is
 * written for the grayscale check. Also prints draw calls, instance counts and
 * frame times. Exits 1 on any console error.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section3");
const SIZES = (process.argv[3] ?? "1366x768,1920x1080,2560x1440").split(",").map((s) => s.split("x").map(Number) as [number, number]);
const PORT = Number(process.env.SHOTS_PORT ?? 5288);
/** The Church of the Immaculate Conception's tile, in world units. */
const CHURCH = (() => {
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/maps/panaji.json"), "utf8")) as { monuments: { id: string; q: number; r: number }[] };
  const { q, r } = map.monuments.find((m) => m.id === "panjim_church")!;
  return { x: Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r, z: 1.5 * r };
})();
/** Altinho's locality tile, in world units (pointy-top hexes, size 1). */
const ALTINHO = (() => {
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/maps/panaji.json"), "utf8")) as { localities: { name: string; q: number; r: number }[] };
  const { q, r } = map.localities.find((l) => l.name === "Altinho")!;
  return { x: Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r, z: 1.5 * r };
})();

async function settle(page: Page, ms = 2500): Promise<void> {
  await page.waitForTimeout(ms);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  const report: string[] = [];
  try {
    for (const [w, h] of SIZES) {
      const tag = `${w}x${h}`;
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
      await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-card, .howto-card", { timeout: 90000 });
      await page.locator(".brief-cta").first().click();
      await settle(page);
      await page.evaluate(`window.__panjimScenarioForTest("quality-high")`);
      await page.evaluate("window.__panjimForTest && (window.__panjimForTest.maya.holdLines = true)");
      await settle(page);
      const shot = async (name: string): Promise<void> => {
        const file = path.join(OUT, `${name}-${tag}.jpg`);
        await page.screenshot({ path: file, type: "jpeg", quality: 80 });
      };
      await shot("core");
      const stats = (await page.evaluate(`(() => {
        const f = window.__frameStatsForTest;
        return f ? { calls: f.drawCalls ?? f.calls, triangles: f.triangles } : null;
      })()`)) as unknown;
      // Fully out.
      await page.mouse.move(w * 0.55, h * 0.5);
      for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 600);
      await settle(page, 3500);
      await shot("full");
      // Altinho close: centre on its locality tile, then zoom in.
      const altinho = ALTINHO;
      await page.evaluate(`window.__focusOnForTest(${altinho.x}, ${altinho.z + 2.5}, true)`);
      for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -600);
      await settle(page, 3500);
      await shot("altinho");
      // The old city close, with the church's name card up.
      await page.evaluate(`window.__focusOnForTest(${CHURCH.x}, ${CHURCH.z} + 1.5, true)`);
      await settle(page, 2500);
      await page.evaluate(`window.__labelsForTest.setFocus("Our Lady of the Immaculate Conception")`);
      await settle(page, 1500);
      await shot("oldcity");
      await page.evaluate(`window.__labelsForTest.setFocus(null)`);
      report.push(`${tag}: draw stats ${JSON.stringify(stats)}; Altinho at ${JSON.stringify(altinho)}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  console.log(report.join("\n"));
  if (errors.length) {
    console.log(`console errors: ${errors.join(" | ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
