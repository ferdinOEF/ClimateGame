/**
 * Section 33's shots of the screens the main tool (tools/section33Shots.ts) does not reach: How to play again, ☰ open, ☰ → Larger text
 * with the build menu open, the Field Guide, "Leave Panjim?", the Sources screen (from the menu's "Facts & sources")
 * and the level select (its route, #/levels). Console errors counted.
 *
 * Usage: npx tsx tools/section33Extra.ts <width> <height> [outDir=docs/qa/section33/after]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section33/after"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });

const server = await startDevServer(Number(process.env.PORT ?? 5496));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
const missed: string[] = [];
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 88 });

async function newPage(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}

// ---- in Panjim: ☰, Larger text with the build menu, the Field Guide, Leave Panjim? ------------------------------
{
  const page = await newPage();
  await page.goto(`${server.url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).__panjimForTest.maya.dismiss());
  // How to play ("?").
  await page.locator(".help-button").first().click();
  await page.waitForTimeout(1000);
  await shot(page, "help-now");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const menu = page.locator(".hud-panel-settings .hud-panel-button");
  await menu.click();
  await page.waitForTimeout(700);
  await shot(page, "menu-open");
  // Larger text on, then the build menu.
  const larger = page.locator(".text-toggle");
  if (await larger.count()) {
    await larger.first().click();
    await page.waitForTimeout(400);
  } else missed.push("no Larger text switch");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.evaluate(() => (window as any).__openTileForTest(-4, 18));
  await page.waitForTimeout(1500);
  await page.locator(".build-popover .build-card").first().hover().catch(() => missed.push("no build card"));
  await page.waitForTimeout(700);
  await shot(page, "larger-text-build-menu");
  await page.keyboard.press("Escape");
  await page.mouse.move(2, H - 2);
  await page.waitForTimeout(500);
  // The Field Guide, from ☰.
  await menu.click();
  await page.waitForTimeout(500);
  const guide = page.locator(".hud-panel-settings .field-guide-button");
  if (await guide.count()) {
    await guide.first().click();
    await page.waitForTimeout(900);
    await shot(page, "field-guide");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } else missed.push("no Field Guide button");
  // Leave Panjim? (Esc with nothing open).
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  if (await page.locator(".leave-confirm-backdrop:not([hidden])").count()) await shot(page, "leave-confirm");
  else missed.push("Leave Panjim? did not open");
  await page.close();
}

// ---- the Sources screen, from the menu -------------------------------------------------------------------------
{
  const page = await newPage();
  await page.goto(`${server.url}/?qa=1&noname=1#/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const link = page.locator(".menu-sources-link, .menu-credits-sources").first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(1200);
    await shot(page, "sources");
  } else missed.push("no Facts & sources link");
  await page.goto(`${server.url}/?qa=1&noname=1#/levels`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await shot(page, "level-select");
  await page.close();
}

await browser.close();
await server.stop();
for (const m of missed) console.log(`MISSED [${W}x${H}] ${m}`);
console.log(`console errors [${W}x${H}]: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
process.exit(missed.length || errors.length ? 1 : 0);
