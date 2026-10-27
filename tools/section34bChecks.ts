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

// ---- 34b.3: the camera moves only at its set moments, and keeps clear of the card ----
STEPS.push([
  "34b.3",
  async (ctx) => {
    const page = await openGame(ctx);
    // Every automatic move is logged with its year (the storms' own cameras are not in this phase of play).
    await page.evaluate(`(() => { const h = window.__panjimForTest.host; window.__moves = [];
      for (const name of ["moveCamera", "focusCamera"]) { const f = h[name].bind(h); h[name] = (...a) => { window.__moves.push({ name, year: window.__panjimForTest.run.year }); return f(...a); }; } })()`);
    const cam = (): Promise<number[]> => page.evaluate("window.__cameraForTest.position.toArray().map((v) => Math.round(v * 100) / 100)") as Promise<number[]>;
    const moves = (): Promise<{ name: string; year: number }[]> => page.evaluate("window.__moves") as Promise<{ name: string; year: number }[]>;
    const hotClear = async (label: string): Promise<void> => {
      await page.waitForTimeout(1800);
      const card = await rectOf(page, ".panjim-clock");
      const pts = (await page.evaluate(`(() => { const c = window.__panjimForTest; const box = c.host.container.getBoundingClientRect(); return c.riskPoints().map((p) => ({ x: p.x + box.left, y: p.y + box.top })); })()`)) as { x: number; y: number }[];
      const onScreen = pts.filter((p) => p.x > 0 && p.y > 0 && p.x < ctx.W && p.y < ctx.H);
      const clear = card ? onScreen.filter((p) => !inside(p, card)) : onScreen;
      check(clear.length > 0, `${label}: a hot tile is on screen clear of the HUD card (${clear.length} of ${pts.length})`);
      await page.screenshot({ path: path.join(ctx.out, `34b3-${label.replace(/\W+/g, "-")}-${ctx.tag}.jpg`), type: "jpeg", quality: 75 });
    };
    const passYear = async (): Promise<void> => {
      await page.evaluate(`window.__panjimScenarioForTest("pass-year")`);
      await page.waitForTimeout(1600);
    };
    // Phase 1: each build to the storm; the camera moves only when the heat comes on and at Last call.
    let still = 0;
    let heatYear: number | null = null;
    for (let i = 0; i < 4; i++) {
      const before = await cam();
      const n = (await moves()).length;
      await passYear();
      const after = await cam();
      const made = (await moves()).slice(n);
      const year = (await page.evaluate("window.__panjimForTest.run.year")) as number;
      if (made.length === 0) {
        still++;
        check(JSON.stringify(before) === JSON.stringify(after), `a build into ${year} with no set move leaves the camera where it was`);
      } else {
        info(`${made.map((m) => m.name).join(", ")} into ${year}`);
        if (heatYear === null) {
          heatYear = year;
          await hotClear(`heat ${year}`);
        }
      }
    }
    check(still > 0, `at least one build in phase 1 left the camera alone (${still})`);
    check(heatYear !== null, `the heat coming on moved the camera once (in ${heatYear})`);
    const yearMoves = (await moves()).map((m) => m.year);
    check(new Set(yearMoves).size === yearMoves.length, `at most one set move a year in phase 1 (${yearMoves.join(", ")})`);
    // Phase 3: to the 2050 storm's heat.
    await page.evaluate(`window.__panjimScenarioForTest("past-storm")`);
    await page.waitForTimeout(1500);
    await page.evaluate(`window.__panjimScenarioForTest("past-storm")`);
    await page.waitForTimeout(1500);
    const n3 = (await moves()).length;
    for (let i = 0; i < 12 && (await moves()).length === n3; i++) await passYear();
    const late = (await moves()).slice(n3);
    if (late.length > 0) await hotClear(`heat ${late[0].year}`);
    else check(false, "the 2050 storm's heat moved the camera");
    await page.close();
  }
]);

// ---- 34b.4: the rings seen zoomed out and in (over the heat's hatching), and a row's flash ----
STEPS.push([
  "34b.4",
  async (ctx) => {
    const page = await openGame(ctx);
    // 2029: the heat is on, with its hatching, and the objective's tiles pulse.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(`window.__panjimScenarioForTest("pass-year")`);
      await page.waitForTimeout(1200);
    }
    await page.evaluate(`window.__panjimForTest.maya.dismiss()`);
    const pulses = await pulsePoints(page);
    check(pulses.length > 0, `the objective's tiles pulse in 2029 (${pulses.length})`);
    const order = (await page.evaluate(`(() => { const p = window.__objectivePulseForTest; return { ring: p.mesh.renderOrder, depthTest: p.mesh.material.depthTest, heat: window.__heatForTest.mesh.renderOrder }; })()`)) as { ring: number; depthTest: boolean; heat: number };
    check(order.ring > order.heat && order.depthTest === false, `the rings draw over the heat (${JSON.stringify(order)})`);
    await page.screenshot({ path: path.join(ctx.out, `34b4-rings-default-${ctx.tag}.jpg`), type: "jpeg", quality: 80 });
    if (pulses[0]) {
      const [q, r] = pulses[0].key.split(",").map(Number);
      // Zoomed in (negative notches) over the hatching, then out.
      for (const [notches, name] of [[-6, "in"], [12, "out"], [-6, ""]] as const) {
        await page.evaluate(`(() => { window.__focusTileForTest(${q}, ${r}); window.__zoomForTest.zoomBy(${notches}); })()`);
        await page.waitForTimeout(1800);
        if (name) await page.screenshot({ path: path.join(ctx.out, `34b4-rings-${name}-${ctx.tag}.jpg`), type: "jpeg", quality: 80 });
      }
    }
    // A row clicked: its tiles flash twice over 2 s.
    const row = page.locator(".get-ready-row").first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(250);
      const level = (await page.evaluate(`window.__objectivePulseForTest.flashLevel(performance.now())`)) as number;
      await page.screenshot({ path: path.join(ctx.out, `34b4-row-flash-${ctx.tag}.jpg`), type: "jpeg", quality: 80 });
      check(level > 0.3, `a row click flashes its tiles (strength ${level.toFixed(2)} at 0.25 s)`);
      await page.waitForTimeout(2100);
      check(((await page.evaluate(`window.__objectivePulseForTest.flashLevel(performance.now())`)) as number) === 0, "the flash is over after 2 s");
    } else check(false, "an objective row to click");
    await page.close();
  }
]);

// ---- 34b.5: Speed up hidden in the replay, its words a tooltip; Previous card; the forecast card's labels apart ----
STEPS.push([
  "34b.5",
  async (ctx) => {
    const page = await openGame(ctx);
    // To the storm's year, then the build that brings the 2030 cyclone, played as a player sees it.
    for (let i = 0; i < 4; i++) {
      await page.evaluate(`window.__panjimScenarioForTest("pass-year")`);
      await page.waitForTimeout(900);
    }
    const tile = (await page.evaluate(`(() => { const c = window.__panjimForTest; for (const [key, t] of c.run.state.placed) { if (c.run.state.elements.has(key)) continue; const o = c.run.state.buildableAt(t.coord); if (o.length && t.coord.q > 12) return { q: t.coord.q, r: t.coord.r, id: o[0].id }; } return null; })()`)) as { q: number; r: number; id: string } | null;
    check(tile !== null, "a tile away from the storm for the last build");
    if (tile) await page.evaluate(`window.__panjimForTest.build({ q: ${tile.q}, r: ${tile.r} }, "${tile.id}")`);
    // While the storm plays: Speed up shows, with its words as a tooltip, no label over it.
    await page.waitForFunction(`!!document.querySelector(".speed-up:not([hidden])")`, undefined, { timeout: 30000 }).catch(() => undefined);
    const speed = (await page.evaluate(`(() => { const b = document.querySelector(".speed-up"); if (!b) return null; const after = getComputedStyle(b, "::after").content; return { title: b.title, described: document.getElementById(b.getAttribute("aria-describedby") || "")?.textContent ?? null, after }; })()`)) as { title: string; described: string | null; after: string } | null;
    check(!!speed && speed.title === "It hurries the storm" && speed.described === "It hurries the storm" && (speed.after === "none" || speed.after === "normal"), `Speed up's words are a tooltip, not a label (${JSON.stringify(speed)})`);
    // The replay card: Speed up is gone while it is up.
    await page.waitForFunction(`!!document.querySelector(".replay-card:not([hidden])")`, undefined, { timeout: 90000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const replay = (await page.evaluate(`(() => ({ replay: !!document.querySelector(".replay-card:not([hidden])"), speed: !!document.querySelector(".speed-up:not([hidden])") }))()`)) as { replay: boolean; speed: boolean };
    check(replay.replay && !replay.speed, `with the replay card up, Speed up is hidden (${JSON.stringify(replay)})`);
    await page.screenshot({ path: path.join(ctx.out, `34b5-replay-${ctx.tag}.jpg`), type: "jpeg", quality: 75 });
    await page.mouse.click(ctx.W / 2, ctx.H - 40);
    await page.waitForFunction(`!!document.querySelector(".result-cards:not([hidden])")`, undefined, { timeout: 60000 }).catch(() => undefined);
    await page.locator(".result-next").click();
    await page.waitForTimeout(500);
    check(((await page.locator(".result-back").textContent()) ?? "") === "Previous card", "card 2's way back reads Previous card");
    await page.screenshot({ path: path.join(ctx.out, `34b5-card2-${ctx.tag}.jpg`), type: "jpeg", quality: 75 });
    for (let i = 0; i < 3 && (await page.locator(".result-cards:not([hidden])").count()); i++) {
      await page.locator(".result-next").click();
      await page.waitForTimeout(400);
    }
    // The 2040 flood to its cards; card 3 is the 2050 forecast.
    await page.waitForTimeout(1500);
    await page.evaluate(`window.__panjimScenarioForTest("to-results")`);
    for (let i = 0; i < 2; i++) {
      await page.locator(".result-next").click();
      await page.waitForTimeout(500);
    }
    const labels = (await page.evaluate(`[...document.querySelectorAll(".result-cards .cone-preview-place text")].map((t) => { const r = t.getBoundingClientRect(); return { name: t.textContent, x: r.left, y: r.top, w: r.width, h: r.height }; })`)) as { name: string; x: number; y: number; w: number; h: number }[];
    const clash = labels.flatMap((a, i) => labels.slice(i + 1).filter((b) => intersects(a, b)).map((b) => `${a.name} / ${b.name}`));
    check(labels.length > 0 && clash.length === 0, `the 2050 forecast card's names never overlap (${labels.map((l) => l.name).join(", ")}${clash.length ? `; overlapping: ${clash.join(", ")}` : ""})`);
    const map = await rectOf(page, ".result-cards .cone-preview-map");
    // A name left off (it would sit on one before it, even under its own dot) is not drawn: 0 by 0.
    const outside = map ? labels.filter((l) => l.w > 0).filter((l) => l.x < map.x - 1 || l.y < map.y - 1 || l.x + l.w > map.x + map.w + 1 || l.y + l.h > map.y + map.h + 1) : labels;
    check(outside.length === 0, `and each sits inside the map (${labels.map((l) => `${l.name} ${Math.round(l.x)},${Math.round(l.y)} ${Math.round(l.w)}x${Math.round(l.h)}`).join("; ")}; map ${JSON.stringify(map)})`);
    await page.screenshot({ path: path.join(ctx.out, `34b5-forecast-2050-${ctx.tag}.jpg`), type: "jpeg", quality: 80 });
    await page.close();
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

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
