/**
 * Section 34c.2: where the locality labels of Panjim's opening view stand against the HUD card and Maya, at a size.
 *
 *   npx tsx tools/section34cLabelProbe.ts url=http://localhost:4310 [sizes=1366x768,1920x1080]
 */
import { chromium } from "playwright";

const args = new Map(process.argv.slice(2).map((a) => a.split("=") as [string, string]));
const url = args.get("url") ?? "http://localhost:4310";
const sizes = (args.get("sizes") ?? "1366x768,1920x1080").split(",").map((s) => s.split("x").map(Number));
const gpu = process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : [];
const browser = await chromium.launch({ args: gpu });
for (const [W, H] of sizes) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${url}/?qa=1#/play/l01-first-rains`);
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta").first().click({ timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(3500);
  const out = await page.evaluate(`(() => {
    const c = window.__panjimForTest; const box = c.host.container.getBoundingClientRect();
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    const places = [...c.host.localities, ...c.host.landmarks].map((l) => { const p = c.host.project({ q: l.q, r: l.r }); return p ? [l.name, Math.round(p.x + box.left), Math.round(p.y + box.top)] : [l.name, null]; });
    const drawn = [...document.querySelectorAll(".map-labels > *")].filter((e) => getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden" && Number(getComputedStyle(e).opacity) > 0.05).map((e) => e.textContent);
    return { card: r(".panjim-clock"), maya: r(".maya-figure-wrap"), bubble: r(".maya-bubble:not([hidden])"), drawn, places };
  })()`);
  console.log(`${W}x${H}`, JSON.stringify(out));
  await page.close();
}
await browser.close();
