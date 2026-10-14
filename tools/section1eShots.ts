/**
 * Section 1e screenshots: Maya at 0.315, locked at home, where the player meets her.
 *
 * Usage:  npx tsx tools/section1eShots.ts [outDir]   (outDir defaults to docs/qa/section1e)
 *
 * At 1366x768, 1920x1080 and 2560x1440 (device scale 1): Maya idle, and with a
 * warning showing (the camera glides to St Cruz; she stays where she is); each
 * with a -gray copy. At every size her figure's box is read before and after the
 * warning: it must be the same box at her home. Then zoom crops of her face,
 * hands and binoculars as the player sees them (the pixels of the 1920x1080
 * shot, enlarged 8x with no smoothing, so what is legible is what is on
 * screen), and the same at device scale 2. Exits 1 on any console error or any
 * change of her box.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section1e");
const PORT = Number(process.env.SHOTS_PORT ?? 5297);
const errors: string[] = [];

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 85 });
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 75 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
}

async function box(page: Page): Promise<string> {
  return (await page.evaluate(`JSON.stringify((function () { var r = document.querySelector(".maya-figure-wrap").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })())`)) as string;
}

async function open(browser: import("playwright").Browser, url: string, w: number, h: number, dpr = 1): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage();
  page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${w}x${h}: ${m.text()}`);
  });
  await page.goto(`${url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3000);
  await page.evaluate("window.__panjimForTest.maya.holdLines = true; window.__panjimForTest.maya.withdraw(function () { return true; }); window.__panjimForTest.maya.dismiss()");
  await page.waitForTimeout(1500);
  return page;
}

/** Enlarges a region of a photograph 8x without smoothing, side by side, for looking at. */
async function zoomSheet(browser: import("playwright").Browser, parts: { name: string; png: Buffer }[], file: string, zoom: number): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const cells = parts.map((p) => `<figure style="margin:0;color:#dfe8ee;font:15px system-ui"><img src="data:image/png;base64,${p.png.toString("base64")}" style="image-rendering:pixelated;zoom:${zoom};display:block"><figcaption style="margin-top:6px">${p.name}</figcaption></figure>`).join("");
  await page.setContent(`<!doctype html><body style="margin:0;padding:20px;background:#22313a;display:flex;gap:24px;align-items:flex-start">${cells}</body>`);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  let moved = false;
  try {
    for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]] as [number, number][]) {
      const tag = `${w}x${h}`;
      const page = await open(browser, server.url, w, h);
      const idleBox = await box(page);
      await shot(page, `idle-${tag}`);
      await page.evaluate(`window.__panjimScenarioForTest("maya-warn-st-cruz")`);
      await page.waitForTimeout(4500);
      const warnBox = await box(page);
      console.log(`${tag}: her box idle ${idleBox}, with a warning ${warnBox}`);
      if (idleBox !== warnBox) {
        moved = true;
        errors.push(`${tag}: her box changed for a warning`);
      }
      await shot(page, `warning-${tag}`);
      if (w === 1920) {
        // Zoom crops of her face, hands and binoculars, with no line in front of her.
        await page.evaluate("window.__panjimForTest.maya.dismiss()");
        await page.waitForTimeout(1200);
        const [x, y, bw, bh] = JSON.parse(await box(page)) as number[];
        const part = async (name: string, fx0: number, fy0: number, fx1: number, fy1: number): Promise<{ name: string; png: Buffer }> => ({
          name,
          png: await page.screenshot({ clip: { x: x + bw * fx0, y: y + bh * fy0, width: bw * (fx1 - fx0), height: bh * (fy1 - fy0) } })
        });
        const parts = [
          await part("whole figure, 1x pixels", 0, 0, 1, 1),
          await part("face", 0.18, 0.02, 0.82, 0.3),
          await part("hands and binoculars", 0, 0.52, 1, 0.8)
        ];
        await zoomSheet(browser, parts, path.join(OUT, "maya-zoom-1920x1080.png"), 8);
        console.log("shot: maya-zoom-1920x1080.png");
      }
      await page.context().close();
    }
    // The same, on a high-density screen (what a laptop or a 4K monitor at 200% shows).
    const dense = await open(browser, server.url, 1366, 768, 2);
    const [dx, dy, dw, dh] = JSON.parse(await box(dense)) as number[];
    const whole = await dense.screenshot({ clip: { x: dx, y: dy, width: dw, height: dh } });
    const face = await dense.screenshot({ clip: { x: dx + dw * 0.18, y: dy + dh * 0.02, width: dw * 0.64, height: dh * 0.28 } });
    const hands = await dense.screenshot({ clip: { x: dx, y: dy + dh * 0.52, width: dw, height: dh * 0.28 } });
    await zoomSheet(browser, [{ name: "whole figure, device scale 2", png: whole }, { name: "face", png: face }, { name: "hands and binoculars", png: hands }], path.join(OUT, "maya-zoom-dpr2.png"), 4);
    await dense.context().close();
  } finally {
    await browser.close();
    server.stop();
  }
  if (errors.length > 0 || moved) {
    console.error(`Problems:\n${errors.join("\n")}`);
    process.exit(1);
  }
  console.log("No console errors; her box never changed.");
}

void main();
