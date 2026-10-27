/**
 * Section 34b: the owner's two play tests' fixes checked in a browser, on the production build served by `vite preview`
 * (started here on a free port unless `url=` is given; run `npm run build` first). Behaviour, not source text. Each
 * step of the section adds its checks below, under its own name, so one step can be run alone.
 *
 * Usage: npx tsx tools/section34bChecks.ts [sizes=1024x640,1366x768,1920x1080] [steps=34b.1,34b.2] [out=docs/qa/section34b]
 *        [url=http://localhost:4173]
 * Exits 1 on any failure. Uses the real GPU where there is one (ANGLE D3D11 on Windows). Zero console errors or
 * warnings is itself a check, at every size.
 */
import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const SIZES = (args.get("sizes") ?? "1024x640,1366x768,1920x1080").split(",").map((s) => s.split("x").map(Number) as [number, number]);
const ONLY = args.get("steps")?.split(",") ?? null;
const OUT = path.resolve(args.get("out") ?? "docs/qa/section34b");
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
let tag = "";
export const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} [${tag}] ${what}`);
};
const info = (what: string): void => console.log(`INFO [${tag}] ${what}`);

/** A free local port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/** `vite preview` of dist/ on a free port, until the checks end. */
async function startPreview(): Promise<{ url: string; child: ChildProcess }> {
  if (!fs.existsSync("dist/index.html")) throw new Error("no dist/: run npm run build first");
  const port = await freePort();
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    const ok = await fetch(url).then((r) => r.ok).catch(() => false);
    if (ok) return { url, child };
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`vite preview did not answer on ${url}`);
}

const gpu = process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

export interface Ctx {
  browser: Browser;
  url: string;
  W: number;
  H: number;
  tag: string;
  out: string;
  errors: string[];
}

/** A new page at this size, its console errors and warnings collected. */
export async function newPage(ctx: Ctx): Promise<Page> {
  const page = await ctx.browser.newPage({ viewport: { width: ctx.W, height: ctx.H } });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") ctx.errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => ctx.errors.push(`pageerror: ${e.message}`));
  return page;
}

/** Panjim (`l01-first-rains`) or the Tutorial, with the test hooks on (`?qa=1`), the start popup closed when `begin`. */
export async function openGame(ctx: Ctx, opts: { tutorial?: boolean; begin?: boolean } = {}): Promise<Page> {
  const page = await newPage(ctx);
  const level = opts.tutorial ? "l00-tutorial" : "l01-first-rains";
  await page.goto(`${ctx.url}/?qa=1#/play/${level}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  await page.waitForTimeout(1500);
  if (opts.begin !== false) {
    await page.locator(".brief-cta").first().click({ timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
  }
  return page;
}

export type Rect = { x: number; y: number; w: number; h: number };
export const rectOf = (page: Page, selector: string): Promise<Rect | null> =>
  page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.closest("[hidden]")) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; })()`) as Promise<Rect | null>;
export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const inside = (p: { x: number; y: number }, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Each step's checks, by name ("34b.1"), run at every size. */
const STEPS: [string, (ctx: Ctx) => Promise<void>][] = [];

/** The screen points of the tiles pulsing now, in page pixels. */
const pulsePoints = (page: Page): Promise<{ key: string; x: number; y: number }[]> =>
  page.evaluate(`(() => { const c = window.__panjimForTest; const box = c.host.container.getBoundingClientRect();
    return window.__objectivePulseForTest.tiles.map((key) => { const [q, r] = key.split(",").map(Number); const p = c.host.project({ q, r }); return p ? { key, x: p.x + box.left, y: p.y + box.top } : null; }).filter(Boolean); })()`) as Promise<{ key: string; x: number; y: number }[]>;

// ---- 34b.1: notes and popovers clear of the HUD card and the pulsing tiles ----
STEPS.push([
  "34b.1",
  async (ctx) => {
    const page = await openGame(ctx);
    // The banner, as a crack with age or a combo shows it.
    await page.evaluate(`window.__panjimForTest.host.showBanner("A small dam cracked with age. In this game it breaks in the next flood.", 8000)`);
    await page.waitForTimeout(300);
    const banner = await rectOf(page, ".era-banner");
    const card = await rectOf(page, ".panjim-clock");
    check(!!banner && !!card && !intersects(banner, card), `the banner clears the HUD card (banner ${JSON.stringify(banner)}, card ${JSON.stringify(card)})`);
    check(!!banner && banner.x >= 0 && banner.x + banner.w <= ctx.W, "the banner is inside the window");
    await page.screenshot({ path: path.join(ctx.out, `34b1-banner-${ctx.tag}.jpg`), type: "jpeg", quality: 75 });
    // The Miramar tile at 2026: the pulsing tile nearest Miramar, opened as a click would.
    const target = (await page.evaluate(`(() => { const c = window.__panjimForTest; const m = c.host.landmarks.find((l) => /Miramar/.test(l.name));
      const tiles = window.__objectivePulseForTest.tiles.map((key) => key.split(",").map(Number));
      if (!m || tiles.length === 0) return null; tiles.sort((a, b) => Math.hypot(a[0] - m.q, a[1] - m.r) - Math.hypot(b[0] - m.q, b[1] - m.r)); return { q: tiles[0][0], r: tiles[0][1], name: m.name }; })()`)) as { q: number; r: number; name: string } | null;
    check(target !== null, `a pulsing tile near Miramar at 2026 (${JSON.stringify(target)})`);
    if (target) {
      await page.evaluate(`window.__focusTileForTest(${target.q}, ${target.r})`);
      await page.waitForTimeout(1200);
      await page.evaluate(`window.__openTileForTest(${target.q}, ${target.r})`);
      await page.waitForTimeout(600);
      const pop = await rectOf(page, ".build-popover");
      const pulses = await pulsePoints(page);
      const covered = pop ? pulses.filter((p) => inside(p, pop)) : [];
      check(!!pop && covered.length === 0, `the Miramar menu covers no pulsing tile (${covered.map((p) => p.key).join(", ") || "none"} of ${pulses.length}; menu ${JSON.stringify(pop)})`);
      check(!!pop && !!card && !intersects(pop, card), "the menu clears the HUD card");
      await page.screenshot({ path: path.join(ctx.out, `34b1-miramar-menu-${ctx.tag}.jpg`), type: "jpeg", quality: 75 });
    }
    await page.close();
  }
]);

const bubbleOpen = (page: Page): Promise<boolean> => page.evaluate(`!!document.querySelector(".maya-bubble:not([hidden])")`) as Promise<boolean>;
const menuOpen = (page: Page): Promise<boolean> => page.evaluate(`(() => { const b = document.querySelector(".popover-backdrop"); return !!b && !b.hidden; })()`) as Promise<boolean>;

/** A tile on the canvas (nothing over it), in the middle of the window, of this terrain, with what can be built there. */
async function tileOnScreen(page: Page, ctx: Ctx, terrain: string): Promise<{ key: string; x: number; y: number; options: string[] } | null> {
  return (await page.evaluate(`(() => { const c = window.__panjimForTest; const run = c.run; const box = c.host.container.getBoundingClientRect(); const out = [];
    for (const [key, t] of run.state.placed) { if (t.terrainId !== ${JSON.stringify(terrain)} || run.state.elements.has(key)) continue;
      const p = c.host.project(t.coord); if (!p) continue; const x = p.x + box.left, y = p.y + box.top;
      if (x < ${ctx.W} * 0.35 || x > ${ctx.W} * 0.65 || y < ${ctx.H} * 0.3 || y > ${ctx.H} * 0.75) continue;
      const el = document.elementFromPoint(x, y); if (!el || el.tagName !== "CANVAS") continue;
      const options = run.state.buildableAt(t.coord).map((o) => o.id).sort(); if (options.length) out.push({ key, x, y, options }); }
    return out[0] ?? null; })()`)) as { key: string; x: number; y: number; options: string[] } | null;
}

// ---- 34b.2: Maya's bubble holds for Got it, passes a tile click through, Source works ----
STEPS.push([
  "34b.2",
  async (ctx) => {
    // The greeting stays until Got it; a click where Got it was closes it and opens nothing.
    {
      const page = await openGame(ctx);
      await page.waitForFunction(`!!document.querySelector(".maya-bubble:not([hidden])")`, undefined, { timeout: 15000 }).catch(() => undefined);
      const gotIt = await rectOf(page, ".maya-dismiss");
      check(gotIt !== null, "the greeting is up with Got it");
      await page.waitForTimeout(20000);
      check(await bubbleOpen(page), "after 20 s the greeting is still up (a line with Got it has no timer)");
      if (gotIt) await page.mouse.click(gotIt.x + gotIt.w / 2, gotIt.y + gotIt.h / 2);
      await page.waitForTimeout(700);
      check(!(await bubbleOpen(page)) && !(await menuOpen(page)), "a click where Got it was closes the bubble and opens no build menu");
      await page.close();
    }
    // With the bubble open, a click on a beach tile closes it and opens that tile's menu.
    {
      const page = await openGame(ctx);
      await page.waitForFunction(`!!document.querySelector(".maya-bubble:not([hidden])")`, undefined, { timeout: 15000 }).catch(() => undefined);
      const tile = (await tileOnScreen(page, ctx, "beach")) ?? (await tileOnScreen(page, ctx, "estuary"));
      check(tile !== null && (await bubbleOpen(page)), `the bubble is open and a free beach tile is on screen (${tile?.key})`);
      if (tile) {
        await page.mouse.click(tile.x, tile.y);
        await page.waitForTimeout(800);
        const cards = (await page.evaluate("[...document.querySelectorAll('.build-popover .build-card:not(.disabled)')].map((c) => c.dataset.element).sort()")) as string[];
        check(!(await bubbleOpen(page)), "the map click closed the bubble");
        check((await menuOpen(page)) && JSON.stringify(cards) === JSON.stringify(tile.options), `and opened that tile's menu (${cards.join(", ")}; want ${tile.options.join(", ")})`);
        await page.screenshot({ path: path.join(ctx.out, `34b2-click-through-${ctx.tag}.jpg`), type: "jpeg", quality: 75 });
      }
      await page.close();
    }
    // Source on a fact opens Facts and sources at that fact.
    {
      const page = await openGame(ctx);
      await page.evaluate(`(() => { const m = window.__panjimForTest.maya; m.dismiss(); window.__nuggetPopupForTest.replay("dunes-barrier"); })()`);
      await page.waitForTimeout(800);
      const source = await rectOf(page, ".maya-source");
      check(source !== null, "a fact line shows Source");
      if (source) await page.mouse.click(source.x + source.w / 2, source.y + source.h / 2);
      await page.waitForTimeout(900);
      const at = (await page.evaluate(`(() => { const el = document.querySelector(".sources-item.highlight"); if (!el) return null; const r = el.getBoundingClientRect(); return { id: el.dataset.factId, anchor: el.id, top: r.top, bottom: r.bottom, h: window.innerHeight }; })()`)) as { id: string; anchor: string; top: number; bottom: number; h: number } | null;
      check(!!at && at.id === "dunes-barrier" && at.anchor === "fact-dunes-barrier" && at.top >= 0 && at.bottom <= at.h, `Source opens Facts and sources at that fact (${JSON.stringify(at)})`);
      await page.screenshot({ path: path.join(ctx.out, `34b2-source-${ctx.tag}.jpg`), type: "jpeg", quality: 75 });
      await page.close();
    }
    // A passing line closes by itself and leaves a shield for a moment.
    {
      const page = await openGame(ctx);
      await page.evaluate(`(() => { const m = window.__panjimForTest.maya; m.dismiss(); m.say({ id: "qa-hint", text: "A passing line.", state: "tip", urgent: true, hint: true }); m.next(); })()`);
      await page.waitForTimeout(300);
      check(!(await page.evaluate(`!!document.querySelector(".maya-dismiss:not([hidden])")`)), "a passing line has no Got it");
      await page.waitForFunction(`!document.querySelector(".maya-bubble:not([hidden])")`, undefined, { timeout: 20000 }).catch(() => undefined);
      check((await page.evaluate(`!!document.querySelector(".maya-shield")`)) as boolean, "when it closes by itself, a shield stands where it was");
      await page.waitForTimeout(700);
      check(!(await page.evaluate(`!!document.querySelector(".maya-shield")`)), "and is gone after 500 ms");
      await page.close();
    }
  }
]);

const { url, child } = args.get("url") ? { url: args.get("url")!, child: null } : await startPreview();
const browser = await chromium.launch({ args: gpu });
try {
  for (const [W, H] of SIZES) {
    tag = `${W}x${H}`;
    const ctx: Ctx = { browser, url, W, H, tag, out: OUT, errors: [] };
    for (const [name, run] of STEPS) {
      if (ONLY && !ONLY.includes(name)) continue;
      try {
        await run(ctx);
      } catch (error) {
        check(false, `${name} threw: ${(error as Error).message.split("\n")[0]}`);
      }
    }
    const real = ctx.errors.filter((l) => !/GPU stall|WebGL|Automatic fallback/.test(l));
    check(real.length === 0, `no console errors or warnings${real.length ? `: ${real.slice(0, 3).join(" | ")}` : ""}`);
  }
} finally {
  await browser.close();
  child?.kill();
}
void info;
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
