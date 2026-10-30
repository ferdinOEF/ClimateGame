/**
 * Section 21.1: How to play at each desktop size, measured: does the card scroll, and by how much.
 * Usage: npx tsx tools/helpFit.ts [WxH ...]  (default 1280x600 1366x768 1920x1080 2560x1440)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { glArgs, startDevServer } from "./devServer";

const sizes = (process.argv.slice(2).length ? process.argv.slice(2) : ["1280x600", "1366x768", "1920x1080", "2560x1440"]).map((s) => s.split("x").map(Number));
const server = await startDevServer(Number(process.env.PORT ?? 5493));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: glArgs() });
let failures = 0;
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
  await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
  await page.waitForTimeout(2500);
  await page.locator(".help-button").click();
  await page.waitForSelector(".panjim-help");
  // The pictures decode before the measure (and the screenshot).
  await page.waitForFunction("[...document.querySelectorAll('.panjim-help-pic')].every((i) => i.complete && i.naturalWidth > 0)", undefined, { timeout: 30000 });
  const m = (await page.evaluate(`(() => { const out = []; for (const el of document.querySelectorAll(".help-card, .help-card *")) { const cs = getComputedStyle(el); if (["auto","scroll"].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) out.push(el.className.split(" ")[0] + " by " + (el.scrollHeight - el.clientHeight) + "px"); } const r = document.querySelector(".help-card").getBoundingClientRect(); return { scrolls: out, top: Math.round(r.top), bottom: Math.round(r.bottom) }; })()`)) as { scrolls: string[]; top: number; bottom: number };
  const ok = m.scrolls.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} [${w}x${h}] How to play fits (card ${m.top} to ${m.bottom})${ok ? "" : `: scrolls ${m.scrolls.join("; ")}`}`);
  await page.screenshot({ path: `docs/qa/section21/help-${w}x${h}.jpg`, type: "jpeg", quality: 72 });
  await page.close();
}
await browser.close();
server.stop();
process.exit(failures ? 1 : 0);
