import { chromium } from "playwright";
import { startDevServer } from "./devServer";
const out = process.argv[2];
const server = await startDevServer(5484);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [W, H] of [[1366, 768], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`);
  await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
  await page.waitForTimeout(3000);
  await page.evaluate(`window.__panjimForTest.maya.dismiss()`);
  // A mangrove on the wetland nearest the middle of the screen.
  const tile = await page.evaluate(`(() => { const p = window.__panjimForTest; return p.firstBuildable("mangrove"); })()`);
  console.log(W, "tile", JSON.stringify(tile));
  await page.evaluate(`window.__openTileForTest(${(tile as any).q}, ${(tile as any).r})`);
  await page.waitForTimeout(1500);
  await page.evaluate(`window.__wildlifeStepForTest(0)`);
  await page.locator('.build-card[data-element="mangrove"]').first().click();
  await page.waitForTimeout(800);
  console.log(W, "built", await page.evaluate(`window.__panjimForTest.run.state.elements.get("${(tile as any).q},${(tile as any).r}")?.elementId`), "busy", await page.evaluate(`window.__panjimForTest.busy`));
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && (await page.evaluate(`window.__panjimForTest.busy`))) await page.waitForTimeout(200);
  await page.evaluate(`window.__wildlifeStepForTest(0)`);
  let waited = 0;
  while (waited < 8000 && (await page.evaluate(`window.__wildlifeForTest().flyIns.length`)) === 0) { await page.evaluate(`window.__wildlifeStepForTest(50)`); waited += 50; }
  console.log(W, "state", JSON.stringify(await page.evaluate(`(() => { const w = window.__wildlifeForTest(); return { calm: w.calm, gentle: w.gentle, enabled: w.enabled, lite: w.lite, pending: w.pendingBird, due: [...w.birdDue], clock: w.clock, rest: w.birdRestUntil, vis: w.sources.mangroves.map((m) => w.sourceVisible(m, w.opts.avoidRects())), kf: w.kf.stage, eg: w.eg.stage, active: w.active }; })()`)));
  console.log(W, "bird after", waited, "ms; mangroves", JSON.stringify(await page.evaluate(`window.__wildlifeForTest().sources.mangroves`)));
  const frames = [400, 1500, 2600];
  let done = 0;
  for (let i = 0; i < frames.length; i++) {
    await page.evaluate(`window.__wildlifeStepForTest(${frames[i] - done})`);
    done = frames[i];
    await page.waitForTimeout(400);
    console.log(W, "frame", i + 1, JSON.stringify(await page.evaluate(`(() => { const w = window.__wildlifeForTest(); const a = w.kf.stage !== "off" ? w.kf : w.eg; const v = a.pos.clone().project(w.opts.camera); const vp = w.opts.viewport(); return [a.kind, a.stage, a.opacity.toFixed(2), Math.round((v.x * 0.5 + 0.5) * vp.width), Math.round((-v.y * 0.5 + 0.5) * vp.height), w.projectedRadius(a, a.root.scale.x).toFixed(0), a.root.visible, w.group.visible, a.root.scale.x.toFixed(3)]; })()`)));
    await page.screenshot({ path: `${out}/bird-${i + 1}-${W}x${H}.png` });
  }
  await page.evaluate(`window.__wildlifeStepForTest(3000)`);
  console.log(W, "flyIns", JSON.stringify(await page.evaluate(`window.__wildlifeForTest().flyIns`)));
  console.log(W, "errors", errs.length, errs.slice(0, 2));
  await page.close();
}
await browser.close(); await server.stop(); process.exit(0);
