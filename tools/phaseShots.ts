/**
 * Desktop screenshots for the Panjim 2050 gauntlet: one run per phase.
 *
 * Boots the dev server, opens the menu and then Panaji at 1920x1080 with a
 * fresh profile, and saves JPEGs to docs/screenshots/panjim2050/. Every shot
 * also gets a grayscale twin (`-gray`), because the board has to stay
 * readable without colour: terrain types, buildings and the Forecast overlay
 * must still be told apart.
 *
 * It also reports the frame rate on the full board and every console error
 * seen. A console error fails the run.
 *
 * Usage:  npx tsx tools/phaseShots.ts p1
 *         npx tsx tools/phaseShots.ts p3 --scenario=forecast
 *
 * Scenarios drive the board through the `__panjim*` test hooks so a phase can
 * photograph the thing it added (a locked forecast, a challenge, the finale).
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "screenshots", process.env.SHOTS_DIR ?? "panjim2050");
const PORT = 5191;

const phase = process.argv[2] ?? "adhoc";
const scenarios = process.argv
  .filter((arg) => arg.startsWith("--scenario="))
  .flatMap((arg) => arg.slice("--scenario=".length).split(","));

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(OUT_DIR, `${phase}-${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 78 });
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT_DIR, `${phase}-${name}-gray.jpg`), type: "jpeg", quality: 70 });
  await page.evaluate(() => {
    for (const style of Array.from(document.querySelectorAll("style"))) {
      if (style.textContent?.includes("grayscale(1) !important")) style.remove();
    }
  });
  console.log(`  shot: ${path.relative(ROOT, file)} (+ gray)`);
}

async function fps(page: Page, ms = 3000): Promise<number> {
  // A string, not a function: tsx wraps named closures in a `__name` helper
  // that does not exist inside the page.
  return page.evaluate(`new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const step = () => {
      frames++;
      if (performance.now() - t0 < ${ms}) requestAnimationFrame(step);
      else resolve((frames * 1000) / (performance.now() - t0));
    };
    requestAnimationFrame(step);
  })`) as Promise<number>;
}

/**
 * Frame cost on the full board. Software GL (SwiftShader, no GPU here) makes
 * frames per second a poor guide, so this also reports CPU milliseconds per
 * frame for the scene update and for `renderer.render` (draw submission), and
 * the draw calls and triangles of the last frame: the numbers that move when
 * the scene gets heavier, on any machine.
 */
async function perf(page: Page, label: string): Promise<void> {
  const before = (await page.evaluate("({ ...window.__frameStatsForTest })")) as Record<string, number>;
  const rate = await fps(page);
  const after = (await page.evaluate("({ ...window.__frameStatsForTest })")) as Record<string, number>;
  const frames = Math.max(1, after.frames - before.frames);
  console.log(
    `perf (${label}, software GL): ${rate.toFixed(1)} fps · update ${((after.updateMs - before.updateMs) / frames).toFixed(2)} ms/frame · ` +
      `render submit ${((after.renderMs - before.renderMs) / frames).toFixed(1)} ms/frame · ${after.calls} draw calls · ${after.triangles} triangles`
  );
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await startDevServer(PORT);
  const errors: string[] = [];
  try {
    const browser = await chromium.launch({
      executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    });
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".menu-screen", { timeout: 20000 });
    await shot(page, "menu");

    await page.goto(`http://localhost:${PORT}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card", { timeout: 60000 });
    await shot(page, "brief");
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(4500);
    await shot(page, "board");
    await perf(page, "full Panaji board");

    for (const scenario of scenarios) {
      const ran = await page.evaluate(async (name) => {
        const hook = (window as unknown as Record<string, unknown>).__panjimScenarioForTest as
          | ((scenario: string) => Promise<boolean> | boolean)
          | undefined;
        return hook ? await hook(name) : false;
      }, scenario);
      if (!ran) {
        errors.push(`scenario "${scenario}" is not available`);
        continue;
      }
      await page.waitForTimeout(2500);
      await shot(page, scenario);
    }

    const telemetry = await page.evaluate(() => (window as unknown as { __telemetry?: unknown[] }).__telemetry ?? []);
    console.log(`telemetry events: ${telemetry.length}`);
    for (const event of telemetry as { name: string; t: number; data: unknown }[]) {
      if (["checkpoint", "challenge_start", "challenge_end", "first_action_ms", "first_reward_ms", "run_end"].includes(event.name)) {
        console.log(`  ${event.name} t=${event.t}ms ${JSON.stringify(event.data)}`);
      }
    }
    await browser.close();
  } finally {
    server.stop();
  }
  console.log(`console errors: ${errors.length === 0 ? "none" : ""}`);
  for (const error of errors) console.log(`  ${error}`);
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
