/**
 * The HUD in play (Section 16 part B): every visible top-level HUD element on
 * the Panjim board after Begin, with its box, and a screenshot.
 *
 * Usage: npx tsx tools/hudInventory.ts <outPrefix> [width] [height]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const [out = "/tmp/hud", w = "1366", h = "768"] = process.argv.slice(2);
const server = await startDevServer(Number(process.env.PORT ?? 5381));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-popup.jpg`, type: "jpeg", quality: 82 });
await page.locator(".brief-cta").first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}-first-frame.jpg`, type: "jpeg", quality: 82 });
const items = await page.evaluate(`(() => {
  const out = [];
  const canvas = document.querySelector("canvas");
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (el === canvas || el.closest("canvas")) continue;
    const s = getComputedStyle(el);
    if (s.position !== "fixed" && s.position !== "absolute") continue;
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
    // A full-screen layer is a container, not a HUD element: look inside it.
    if (r.width >= innerWidth - 2 && r.height >= innerHeight - 2) continue;
    // Top-level only: skip anything inside an element already counted.
    let p = el.parentElement, inner = false;
    while (p) { if (seen.has(p)) { inner = true; break; } p = p.parentElement; }
    if (inner) continue;
    if (el.classList.contains("map-label") || el.closest(".map-labels")) continue;
    seen.add(el);
    out.push({ cls: (el.className && el.className.baseVal === undefined ? el.className : "") + " <" + el.tagName.toLowerCase() + ">", text: (el.innerText || "").replace(/\\s+/g, " ").slice(0, 60), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
})()`);
for (const e of items as { cls: string; text: string; x: number; y: number; w: number; h: number }[]) console.log(`${e.x},${e.y} ${e.w}x${e.h} | ${e.cls.slice(0, 70)} | ${e.text.slice(0, 50)}`);
console.log(`${(items as unknown[]).length} top-level HUD elements`);
console.log("errors", errors);
await browser.close();
server.stop();
