/**
 * The whole Panjim board in the game, zoomed fully out, the HUD hidden: for a
 * before and after of a map change. Usage: npx tsx tools/boardWhole.ts <out.jpg> [width] [height]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const [out = "board-whole.jpg", w = "1920", h = "1080"] = process.argv.slice(2);
const W = Number(w), H = Number(h);
const server = await startDevServer(Number(process.env.PORT ?? 5473));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta").first().click();
await page.waitForTimeout(3000);
await page.evaluate("(function () { var p = window.__panjimForTest; if (p && p.hideCone) p.hideCone(); })()");
await page.evaluate(`window.__focusOnForTest(${(Math.sqrt(3) * 8 + (Math.sqrt(3) / 2) * 18).toFixed(2)}, 27, true)`);
await page.mouse.move(W / 2, H / 2);
for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600);
await page.mouse.move(2, H - 2);
await page.addStyleTag({ content: "body * { visibility: hidden !important; } canvas { visibility: visible !important; }" });
await page.waitForTimeout(3500);
await page.screenshot({ path: out, type: "jpeg", quality: 85 });
await browser.close();
server.stop();
