/**
 * Section 33b.5's quick look, at one size: the Panjim start with the hint pill, the build menu open beside a tile
 * (its pointer), and the HUD card with the longest countdown ("Cyclone and flood in 10 builds", Larger text off and on).
 *
 * Usage: npx tsx tools/section33bQuick.ts <width> <height> [outDir=docs/qa/section33b/after]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const [w = "1366", h = "768", outDir = "docs/qa/section33b/after"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(outDir);
fs.mkdirSync(OUT, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5500));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
});
await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta").first().click();
await page.waitForTimeout(3000);
await page.evaluate(() => (window as any).__panjimForTest.maya.dismiss());
await page.mouse.move(W / 2, 2);
await page.waitForTimeout(800);
const hint = await page.locator(".empty-prompt").boundingBox();
console.log(`hint: ${JSON.stringify(hint)} (viewport ${W}x${H})`);
await page.screenshot({ path: path.join(OUT, `start-${W}x${H}.jpg`), type: "jpeg", quality: 88 });
// The build menu, beside a beach tile in front of Sharada Mandir School.
await page.evaluate(() => (window as any).__openTileForTest(-4, 18));
await page.waitForTimeout(1500);
const pop = await page.evaluate(() => {
  const el = document.querySelector(".build-popover") as HTMLElement;
  const r = el.getBoundingClientRect();
  return { box: [r.x, r.y, r.width, r.height].map(Math.round), cls: el.className, y: el.style.getPropertyValue("--pointer-y") };
});
console.log(`popover: ${JSON.stringify(pop)}`);
await page.screenshot({ path: path.join(OUT, `build-popover-${W}x${H}.jpg`), type: "jpeg", quality: 88 });
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
// The longest countdown the game says.
for (const large of [false, true]) {
  await page.evaluate((large) => {
    document.querySelector(".has-panjim-clock")!.classList.toggle("large-text", large);
    const t = document.querySelector(".outlook-countdown") as HTMLElement;
    t.textContent = "Cyclone and flood in 10 builds";
  }, large);
  await page.waitForTimeout(400);
  const card = await page.locator(".panjim-clock").boundingBox();
  const out = await page.evaluate(() => {
    const card = document.querySelector(".panjim-clock")!.getBoundingClientRect();
    return [...document.querySelectorAll(".panjim-clock .help-button, .panjim-clock .hud-panel-button")].map((b) => b.getBoundingClientRect()).filter((r) => r.right > card.right - 8 || r.left < card.left).length;
  });
  console.log(`long countdown${large ? " (Larger text)" : ""}: buttons outside the card: ${out}`);
  if (card) await page.screenshot({ path: path.join(OUT, `card-long-countdown${large ? "-large" : ""}-${W}x${H}.png`), clip: { x: 0, y: 0, width: Math.min(W, card.x + card.width + 14), height: Math.min(H, card.y + card.height + 14) } });
}
await browser.close();
await server.stop();
console.log(`console errors [${W}x${H}]: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
process.exit(errors.length ? 1 : 0);
