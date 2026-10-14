/**
 * Section 1c screenshots: Maya, whole and at 70%, where the player meets her.
 *
 * Usage:  npx tsx tools/section1cShots.ts [outDir] [sizes]
 *   outDir defaults to docs/qa/section1c; sizes to "1366x768,1920x1080,2560x1440".
 *
 * At each size: Panaji's brief (her full figure beside it), Maya docked and
 * idle with no line, docked with a line showing, and hopped over the pale old
 * city (the church) and over the dark river (the Atal Setu). At 1920:
 * the Tutorial's brief (she stands beside every level's brief) and an
 * Aftermath card. A `-gray` twin of every shot. Also counts the DOM nodes
 * in her HUD layer. Exits 1 on any console error.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section1c");
const SIZES = (process.argv[3] ?? "1366x768,1920x1080,2560x1440").split(",").map((s) => s.split("x").map(Number) as [number, number]);
const PORT = Number(process.env.SHOTS_PORT ?? 5295);

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 72 });
  await page.evaluate(() => {
    for (const style of Array.from(document.querySelectorAll("style"))) if (style.textContent?.includes("grayscale(1) !important")) style.remove();
  });
}

const scenario = (page: Page, name: string): Promise<unknown> => page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(name)})`);

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  try {
    for (const [w, h] of SIZES) {
      const tag = `${w}x${h}`;
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`${tag}: ${m.text()}`);
      });
      await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-card", { timeout: 120000 });
      await page.waitForTimeout(2500);
      await shot(page, `brief-${tag}`);
      await page.locator(".brief-cta").first().click();
      await page.waitForTimeout(3000);
      // Idle: any line she opened with is dismissed and none is left queued, so there is no bubble.
      await page.evaluate("window.__panjimForTest.maya.withdraw(() => true); window.__panjimForTest.maya.dismiss()");
      await page.waitForTimeout(1500);
      const quiet = await page.evaluate(`document.querySelector(".maya-bubble") ? document.querySelector(".maya-bubble").hidden : true`);
      console.log(`${tag}: idle shot, bubble ${quiet ? "hidden" : "SHOWING"}`);
      if (!quiet) errors.push(`${tag}: the idle shot still has a bubble`);
      await shot(page, `idle-${tag}`);
      await scenario(page, "maya:greeting");
      await page.waitForTimeout(3000);
      await shot(page, `docked-${tag}`);
      if (w === 1920) {
        const count = await page.evaluate("document.querySelectorAll('.maya *').length");
        const svg = await page.evaluate("document.querySelectorAll('.maya-figure *').length");
        console.log(`Maya's HUD layer: ${count} DOM nodes, ${svg} of them in her figure's SVG`);
      }
      // Over the pale old city (the church), then over the dark river (the Atal Setu bridge).
      await scenario(page, "maya-warn-immaculate");
      await page.waitForTimeout(3500);
      await shot(page, `city-${tag}`);
      await scenario(page, "maya-warn-atal-setu");
      await page.waitForTimeout(3500);
      await shot(page, `water-${tag}`);
      if (w === 1920) {
        await scenario(page, "challenge");
        await page.waitForSelector(".aftermath-card", { timeout: 300000 });
        await page.waitForTimeout(2500);
        await shot(page, `aftermath-${tag}`);
      }
      await page.close();
    }
    const tut = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    tut.on("pageerror", (e) => errors.push(`tutorial: ${e.message}`));
    tut.on("console", (m) => {
      if (m.type() === "error") errors.push(`tutorial: ${m.text()}`);
    });
    await tut.goto(`${server.url}/#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
    await tut.waitForSelector(".brief-card", { timeout: 120000 });
    await tut.waitForTimeout(2500);
    const figure = await tut.locator(".brief-stage .maya-full-figure").isVisible();
    console.log(`Tutorial brief: Maya's full figure ${figure ? "shown" : "MISSING"}`);
    if (!figure) errors.push("tutorial: Maya's full figure is not shown beside the brief");
    await shot(tut, "brief-tutorial-1920x1080");
  } finally {
    await browser.close();
    server.stop();
  }
  if (errors.length > 0) {
    console.error(`Console errors:\n${errors.join("\n")}`);
    process.exit(1);
  }
  console.log("No console errors.");
}

void main();
