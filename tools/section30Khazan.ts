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
  await page.goto(`${server.url}/?qa=1&noname=1#/play/l01-first-rains`);
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
  await page.evaluate(`window.__zoomForTest.zoomBy(-12)`);
  await page.waitForTimeout(2500);
  // Wait for the net mid-throw (lying on the water): the cycle is 6.5 s.
  // The net mid throw: wait until it is out (its instanced mesh has a count), then three frames.
  const t1 = Date.now();
  while (Date.now() - t1 < 15000 && !(await page.evaluate(`(window.__khazanPeopleForTest()?.group.children[3]?.count ?? 0) > 0`))) await page.waitForTimeout(100);
  for (let i = 0; i < 3; i++) {
    await page.screenshot({ path: `${out}/khazan-${i + 1}-${W}x${H}.png` });
    await page.waitForTimeout(700);
  }
  console.log(W, "people draw calls", await page.evaluate(`window.__khazanPeopleForTest()?.drawCalls`));
  console.log(W, "tile", tile.q, tile.r, "calls", JSON.stringify(await page.evaluate(`window.__frameStatsForTest`)));
  console.log(W, "errors", errs.length, errs.slice(0, 2));
  await page.close();
}
await browser.close(); await server.stop(); process.exit(0);
