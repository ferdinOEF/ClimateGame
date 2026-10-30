/**
 * Section 16 part B: a quick screenshot of the Panjim board after Begin, with
 * optional steps. Usage: npx tsx tools/s16bShot.ts <out.jpg> <w> <h> [step ...]
 * Steps: menu (open ☰), help (open ?), esc, wait:<ms>, eval:<js>.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";
import { qaUrl } from "./qaUrl";

const [out, w, h, ...steps] = process.argv.slice(2);
const server = await startDevServer(Number(process.env.PORT ?? 5383));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(qaUrl(`${server.url}/${process.env.ROUTE ?? "#/play/l01-first-rains"}`), { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
await page.waitForTimeout(1500);
if (!process.env.NOBEGIN) {
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3000);
}
for (const step of steps) {
  if (step === "menu") await page.locator(".hud-panel-settings .hud-panel-button").click();
  else if (step === "help") await page.locator(".help-button").click();
  else if (step === "esc") await page.keyboard.press("Escape");
  else if (step.startsWith("wait:")) await page.waitForTimeout(Number(step.slice(5)));
  else if (step.startsWith("eval:")) console.log("eval:", JSON.stringify(await page.evaluate(step.slice(5))));
  await page.waitForTimeout(500);
}
await page.screenshot({ path: out, type: "jpeg", quality: 82 });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
server.stop();
