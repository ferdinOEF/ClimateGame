import { chromium } from "playwright";
import { startDevServer } from "./devServer";
const out = process.argv[2];
const server = await startDevServer(5485);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [W, H] of [[1366, 768], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(`${server.url}/#/play/l01-first-rains`);
  await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
  await page.waitForTimeout(3000);
  await page.evaluate(`window.__panjimForTest.maya.dismiss()`);
  const tile = await page.evaluate(`window.__panjimForTest.firstBuildable("khazan")`) as any;
  await page.evaluate(`window.__openTileForTest(${tile.q}, ${tile.r})`);
  await page.waitForTimeout(1500);
  await page.locator('.build-card[data-element="khazan"]').first().click();
  await page.waitForTimeout(800);
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && (await page.evaluate(`window.__panjimForTest.busy`))) await page.waitForTimeout(200);
  await page.evaluate(`window.__focusTileForTest(${tile.q}, ${tile.r})`);
  await page.evaluate(`window.__zoomForTest.zoomBy(-4)`);
  await page.waitForTimeout(2500);
  // Wait for the net mid-throw (lying on the water): the cycle is 6.5 s.
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1700);
    await page.screenshot({ path: `${out}/khazan-${i + 1}-${W}x${H}.png` });
  }
  console.log(W, "tile", tile.q, tile.r, "calls", JSON.stringify(await page.evaluate(`window.__frameStatsForTest`)));
  console.log(W, "errors", errs.length, errs.slice(0, 2));
  await page.close();
}
await browser.close(); await server.stop(); process.exit(0);
