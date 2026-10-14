/**
 * Section 1b/1c: a contact sheet of every one of Maya's states with her new
 * artwork, photographed in the real game (her real component, CSS and
 * layout), so the face can be checked state by state.
 *
 * Usage:  npx tsx tools/mayaStates.ts [outDir]
 *   outDir defaults to docs/qa/section1e.
 *
 * Opens Panaji at 1366x768 (STATES_VIEW=WxH for another size), puts Maya in each state through the
 * `maya:<state>` scenario, lets the pose settle and photographs her figure
 * at HUD size (her whole body now), then lays the crops out as
 * `maya-states.png` (all at 1x in a strip, then each enlarged 2x; and a `-gray` twin). The vector detail is in maya-hud-crop.png
 * (tools/mayaSheet.ts). At device scale 2 the software renderer's frames
 * took long enough that some state changes were not yet painted when the
 * photograph was taken, so this runs at 1x. Exits 1 on a console error.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section1e");
const PORT = Number(process.env.SHOTS_PORT ?? 5294);
const STATES = ["idle", "greeting", "tip", "explains", "warning", "worried", "celebrates"];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  const crops: { state: string; hud: string; big: string }[] = [];
  try {
    const [vw, vh] = (process.env.STATES_VIEW ?? "1366x768").split("x").map(Number);
    const page = await (await browser.newContext({ viewport: { width: vw, height: vh } })).newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card", { timeout: 120000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(3000);
    for (const state of STATES) {
      await page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(state === "idle" ? "maya:greeting" : `maya:${state}`)})`);
      if (state === "idle") await page.evaluate("window.__panjimForTest.maya.setState('idle')");
      await page.waitForTimeout(2600);
      const box = await page.locator(".maya-figure-wrap").boundingBox();
      if (!box) throw new Error("no Maya figure");
      // Room round her for raised hands, the alert and the stars.
      const clip = { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: box.width + 48, height: box.height + 36 };
      const file = path.join(OUT, `state-${state}.png`);
      await page.screenshot({ path: file, clip });
      crops.push({ state, hud: file, big: file });
    }
    // The sheet: each crop at HUD size (1x of the CSS box) and at 2x.
    const img = (file: string, zoom: number): string => `<img src="data:image/png;base64,${fs.readFileSync(file).toString("base64")}" style="${zoom ? `zoom:${zoom}` : ""};image-rendering:auto">`;
    const strip = crops.map(({ state, hud }) => `<figure style="margin:0;text-align:center">${img(hud, 0)}<figcaption>${state}</figcaption></figure>`).join("");
    const cells = crops.map(({ state, hud }) => `<figure style="margin:0;text-align:center">${img(hud, 2)}<figcaption>${state}</figcaption></figure>`).join("");
    const sheet = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
    await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:20px;background:#22313a;color:#dfe8ee;font:15px system-ui"><div style="display:flex;gap:6px;align-items:flex-end">${strip}</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:24px">${cells}</div></body></html>`);
    await sheet.screenshot({ path: path.join(OUT, "maya-states.png"), fullPage: true });
    await sheet.addStyleTag({ content: "html { filter: grayscale(1); }" });
    await sheet.screenshot({ path: path.join(OUT, "maya-states-gray.png"), fullPage: true });
    if (!process.env.KEEP_CROPS) for (const { hud } of crops) fs.rmSync(hud);
    console.log(`shot: ${path.relative(ROOT, path.join(OUT, "maya-states.png"))} (+ gray), ${crops.length} states`);
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
