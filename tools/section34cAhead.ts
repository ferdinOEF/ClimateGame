/**
 * Section 34c.4 (owner, 28 October 2026): at the intro of each storm's last year (2029, 2039, 2049), with the phase's
 * objective done, Get ahead's row tiles are inside the window and clear of the HUD card and Maya, as the hot tiles are
 * (Section 34b.3, keepClearOf).
 *
 *   npx tsx tools/section34cAhead.ts url=http://localhost:4310 [sizes=1366x768,1920x1080] [out=docs/qa/section34c/ahead]
 *
 * Plays Panjim: the objective built on its own pulsing tiles, then years passed to the heat's year (two builds before the
 * storm); there it records the pulsing tiles' screen points against the window, the card, Maya and her bubble.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { glArgs } from "./devServer";

const args = new Map(process.argv.slice(2).map((a) => a.split("=") as [string, string]));
const url = args.get("url") ?? "http://localhost:4310";
const sizes = (args.get("sizes") ?? "1366x768,1920x1080").split(",").map((s) => s.split("x").map(Number));
const OUT = path.resolve(args.get("out") ?? "docs/qa/section34c/ahead");
fs.mkdirSync(OUT, { recursive: true });
process.env.GPU ??= process.platform === "win32" ? "1" : "";
const gpu = glArgs();

let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const scenario = (page: Page, name: string): Promise<boolean> => js<boolean>(page, `window.__panjimScenarioForTest(${JSON.stringify(name)})`);

type Rect = { x: number; y: number; w: number; h: number };
const inside = (p: { x: number; y: number }, r: Rect, m = 0): boolean => p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m;

const browser = await chromium.launch({ args: gpu });
const errors: string[] = [];
try {
  for (const [W, H] of sizes) {
    const tag = `${W}x${H}`;
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    await page.addInitScript(() => localStorage.clear());
    await page.goto(`${url}/?qa=1&noname=1#/play/l01-first-rains`);
    await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.locator(".brief-cta").first().click({ timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    for (let storm = 0; storm < 3; storm++) {
      const left = (): Promise<number> => js<number>(page, "(() => { const r = window.__panjimForTest.run; const n = r.nextChallenge(); return n ? r.yearsUntil(n) : 0; })()");
      // The phase's objective, built on its own pulsing tiles (as a player following it would), until Get ahead shows
      // or the heat's year comes (two builds before the storm).
      for (let i = 0; i < 12 && (await left()) > 2; i++) {
        const built = await js<boolean>(page, `(async () => { const c = window.__panjimForTest; if (c.aheadRows.length) return false;
          for (const job of c.run.prep) { const key = c.pulseKeys(job)[0]; if (!key) continue; const [q, r] = key.split(",").map(Number); await c.buildNow({ q, r }, job.elementId); return true; }
          return false; })()`);
        if (!built) break;
        await page.waitForTimeout(1500);
      }
      // On to the heat's year, if the objective was done before it.
      for (let i = 0; i < 12 && (await left()) > 2; i++) {
        await scenario(page, "pass-year");
        await page.waitForTimeout(1500);
      }
      // The heat comes on with its camera move (Section 34b.3); then the glide settles.
      await page.waitForTimeout(3500);
      const state = await js<{ year: number; ahead: number; card: Rect | null; maya: Rect | null; bubble: Rect | null; pts: { key: string; x: number; y: number }[] }>(page, `(() => {
        const c = window.__panjimForTest; const box = c.host.container.getBoundingClientRect();
        const r = (sel) => { const el = document.querySelector(sel); if (!el || el.closest("[hidden]")) return null; const b = el.getBoundingClientRect(); return b.width > 0 ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };
        const pts = window.__objectivePulseForTest.tiles.map((key) => { const [q, rr] = key.split(",").map(Number); const p = c.host.project({ q, r: rr }); return p ? { key, x: Math.round(p.x + box.left), y: Math.round(p.y + box.top) } : { key, x: -9999, y: -9999 }; });
        return { year: c.run.year, ahead: c.aheadRows ? c.aheadRows.length : -1, card: r(".panjim-clock"), maya: r(".maya-figure-wrap") ?? r(".maya-badge"), bubble: r(".maya-bubble:not([hidden])"), pts };
      })()`);
      const label = `${tag} ${state.year} (Get ahead rows ${state.ahead})`;
      const out = state.pts.filter((p) => p.x < 0 || p.y < 0 || p.x > W || p.y > H);
      const underCard = state.card ? state.pts.filter((p) => inside(p, state.card!)) : [];
      const underMaya = state.pts.filter((p) => (state.maya && inside(p, state.maya)) || (state.bubble && inside(p, state.bubble)));
      console.log(`INFO ${label}: ${state.pts.length} pulsing tiles ${JSON.stringify(state.pts)}`);
      if (state.pts.length) {
        check(out.length === 0, `${label}: every pulsing tile inside the window${out.length ? ` (out: ${out.map((p) => p.key).join(" ")})` : ""}`);
        check(underCard.length === 0, `${label}: none under the HUD card${underCard.length ? ` (${underCard.map((p) => p.key).join(" ")})` : ""}`);
        check(underMaya.length === 0, `${label}: none under Maya or her bubble${underMaya.length ? ` (${underMaya.map((p) => p.key).join(" ")})` : ""}`);
      }
      await page.screenshot({ path: path.join(OUT, `ahead-${state.year}-${tag}.jpg`), type: "jpeg", quality: 80 });
      if (storm < 2) {
        await scenario(page, "past-storm");
        await page.waitForTimeout(3000);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (errors.length) console.log(`console errors: ${errors.slice(0, 4).join(" | ")}`);
console.log(failures || errors.length ? `${failures} FAILED` : "ALL PASS");
process.exitCode = failures || errors.length ? 1 : 0;
