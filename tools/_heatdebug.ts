import { chromium } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";
const server = await startDevServer(5193);
try {
  const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text().slice(0, 300)); });
  await page.goto("http://localhost:5193/#/play/l01-first-rains");
  await page.waitForSelector(".brief-card", { timeout: 60000 });
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3000);
  await page.evaluate("window.__panjimScenarioForTest('heat-1')");
  await page.waitForTimeout(2000);
  console.log(await page.evaluate(`(() => { const h = window.__heatForTest; const m = h.mesh; const heats = []; for (let i = 0; i < m.count; i++) heats.push(m.geometry.attributes.aHeat.getX(i)); heats.sort((a,b)=>b-a); const e = window.__panjimForTest.exposure; return { count: m.count, top: heats.slice(0, 5), visible: m.visible, parent: !!m.parent, exp: e ? e.exposure.size : null, risk: window.__panjimForTest.riskToggle.value, matrix0: Array.from(m.instanceMatrix.array.slice(12, 15)) }; })()`));
  await page.evaluate(`(() => { const m = window.__heatForTest.mesh; for (let i = 0; i < m.count; i++) { m.geometry.attributes.aHeat.setX(i, 0.5); m.geometry.attributes.aFlags.setXYZ(i, 1, 1, i % 3 === 0 ? 1 : 0); } m.geometry.attributes.aHeat.needsUpdate = true; m.geometry.attributes.aFlags.needsUpdate = true; })()`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/claude-0/-home-user-ClimateGame/cd73c80d-ce5a-5638-a88c-9c6b14ae5f89/scratchpad/heatforced.jpg", type: "jpeg", quality: 70 });
  await browser.close();
} finally { server.stop(); }
