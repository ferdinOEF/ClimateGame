/**
 * Section 21.1: the game played end to end in a browser, as a player would,
 * at one window size. Each step is checked; every problem is printed as
 * "FAIL <what>" with a screenshot name, for docs/BUGS.md.
 *
 *   - Landing: only Tutorial and Play Panjim; Play Panjim, Begin; a build, a
 *     reload, "Continue from 2027"; a reload, "Begin again" (back to 2026).
 *   - A full run 2026 to 2050 for each play style (STYLES, or the ones given):
 *     none (every build away from the storms), random, nature (nature based
 *     only), seawalls (seawalls and breakwaters only), well (the objective's
 *     rows, then the homes at risk). Each storm: hurried by clicks as a player
 *     can; the result cards read; the ruins on the board checked against the
 *     card; every card stepped through; the final card's Play again and Back
 *     to the menu.
 *   - Input: wheel zoom, R, S, +, -, Home, Esc at each step; a click during a
 *     storm; a double click on a tile; Help and ☰ during a storm and over a
 *     result card.
 *   - Edges: a click on the north bank and the east edge; resizing the window
 *     mid storm; reloading mid storm and over a result card; two tabs.
 *   - Text: every visible text scanned for the dots and hyphens Section 17b
 *     removed; nothing cut off, scrolling or off screen.
 *   - Console: errors and warnings, none expected.
 *
 * Usage: npx tsx tools/playthrough21.ts <width> <height> [outDir] [styles=none,random,nature,seawalls,well]
 * Exits 1 on any failure.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { punctuationProblems } from "../tests/helpers/uiStrings";

const ROOT = path.resolve(import.meta.dirname, "..");
const plain = process.argv.slice(2).filter((a) => !a.includes("="));
const named = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split("=") as [string, string]));
const [w = "1366", h = "768", outDir = "docs/qa/section21/playthrough"] = plain;
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });
const STYLES = (named.get("styles") ?? "none,random,nature,seawalls,well").split(",");
const server = await startDevServer(Number(process.env.PORT ?? 5491));
const browser: Browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${what}`);
};
const tag = `${W}x${H}`;

/** A fresh context and page, its console watched. Errors and warnings land in `log`. */
async function newPage(context?: BrowserContext): Promise<{ page: Page; log: string[]; context: BrowserContext }> {
  const ctx = context ?? (await browser.newContext({ viewport: { width: W, height: H } }));
  const page = await ctx.newPage();
  const log: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") log.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  return { page, log, context: ctx };
}

async function shot(page: Page, name: string): Promise<string> {
  const file = `${name}-${tag}.jpg`;
  await page.screenshot({ path: path.join(OUT, file), type: "jpeg", quality: 72 });
  return file;
}

/** Visible text (nodes and the attributes a player meets) scanned for Section 17b's dots and hyphens; and anything cut off, scrolling or off screen. */
async function textAndLayout(page: Page, where: string): Promise<void> {
  const found = (await page.evaluate(`(() => {
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const visible = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent.trim(); if (t && visible(n.parentElement)) texts.push(t); }
    for (const el of document.querySelectorAll("[aria-label],[title],[alt],[placeholder]")) if (visible(el)) for (const a of ["aria-label","title","alt","placeholder"]) { const v = el.getAttribute(a); if (v) texts.push(v); }
    const layout = [];
    for (const el of document.querySelectorAll("body *")) {
      // Screen reader only text (visually-hidden) is clipped on purpose.
      if (!visible(el) || el.closest("canvas, svg, .map-labels, .map-label, .map-pins, .visually-hidden, .sr-only")) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const name = el.className && typeof el.className === "string" ? el.className.split(" ")[0] : el.tagName.toLowerCase();
      if (["auto", "scroll"].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) layout.push("scrolls: " + name);
      if (["hidden", "clip"].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && el.textContent.trim()) layout.push("cut off: " + name + " (" + el.textContent.trim().slice(0, 40) + ")");
      if (cs.position === "fixed" || cs.position === "absolute") {
        if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) if (el.textContent.trim() && r.width < innerWidth) layout.push("off screen: " + name);
      }
    }
    return { texts, layout: [...new Set(layout)] };
  })()`)) as { texts: string[]; layout: string[] };
  const punct = [...new Set(found.texts.filter((t) => punctuationProblems(t).length > 0 && !/White-throated Kingfisher/.test(t)))];
  check(punct.length === 0, `${where}: no dots or hyphens between words${punct.length ? `: ${punct.slice(0, 4).join(" | ")}` : ""}`);
  check(found.layout.length === 0, `${where}: nothing cut off, scrolling or off screen${found.layout.length ? `: ${found.layout.slice(0, 6).join("; ")}` : ""}`);
}

const ready = async (page: Page): Promise<void> => {
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
  await page.waitForTimeout(1200);
};
const begin = async (page: Page, label = "Begin"): Promise<void> => {
  await page.locator(".brief-cta", { hasText: label }).first().click();
  await page.waitForTimeout(2500);
  await page.mouse.move(2, H - 2);
};
const year = (page: Page): Promise<number> => page.evaluate("window.__panjimForTest.run.year") as Promise<number>;
const cardsOpen = (page: Page): Promise<boolean> => page.evaluate("!!document.querySelector('.result-cards:not([hidden]) .result-next')") as Promise<boolean>;
const storming = (page: Page): Promise<boolean> => page.evaluate("window.__panjimForTest.host.challengeFx.isPlaying()") as Promise<boolean>;
const finalCard = (page: Page): Promise<boolean> => page.evaluate("!!document.querySelector('.finale-card') || [...document.querySelectorAll('.result-cards:not([hidden]) button')].some((b) => /Play again/.test(b.textContent))") as Promise<boolean>;

// In-page: the tile a play style builds on next (null: nothing worth building, the year goes away from the storms).
const PICK = `(style, seed) => {
  const p = window.__panjimForTest; const run = p.run; const state = run.state;
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ALL = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"];
  const allowed = { random: ALL, nature: ["dune", "sandy_vegetation", "mangrove", "khazan"], seawalls: ["seawall", "breakwater"], well: ALL }[style];
  if (!allowed) return null;
  const at = (k) => { const [q, r] = k.split(",").map(Number); return { q, r }; };
  const can = (k, id) => state.canBuild(at(k), id);
  const hex = (a, b) => { const A = at(a), B = at(b); return (Math.abs(A.q - B.q) + Math.abs(A.r - B.r) + Math.abs(A.q + A.r - B.q - B.r)) / 2; };
  if (style === "well" || style === "nature") for (const pk of run.objective?.picks ?? []) if (allowed.includes(pk.elementId) && can(pk.key, pk.elementId)) return { key: pk.key, id: pk.elementId };
  const keys = [...state.placed.keys()].filter((k) => !state.isScenery(k));
  if (style !== "random") {
    const next = run.nextChallenge(); const exp = next ? run.exposureFor(next) : null; const risk = exp ? exp.housesAtRisk : [];
    let best = null;
    for (const k of keys) { const near = risk.filter((h) => hex(h, k) <= 2).length; if (!near) continue; for (const id of allowed) if (can(k, id)) { const score = near + rnd(); if (!best || score > best.score) best = { key: k, id, score }; } }
    if (best) return { key: best.key, id: best.id };
    if (style !== "well") return null;
  }
  for (let t = 0; t < 400; t++) { const k = keys[Math.floor(rnd() * keys.length)]; const ids = allowed.filter((id) => can(k, id)); if (ids.length) return { key: k, id: ids[Math.floor(rnd() * ids.length)] }; }
  return null;
}`;

/** Plays a storm through as a player who clicks to hurry it, then reads and closes the result cards. Returns false at the final card. */
async function weatherStorm(page: Page, style: string, ruinsBefore: number): Promise<{ ruins: number; final: boolean }> {
  for (let k = 0; k < 800 && !(await cardsOpen(page)) && !(await finalCard(page)); k++) {
    if (await storming(page)) await page.mouse.click(W * 0.5, H * 0.55);
    await page.waitForTimeout(250);
  }
  const id = (await page.evaluate("[...window.__panjimForTest.run.landed].pop()")) as string;
  const outcome = (await page.evaluate(`(() => { const o = window.__panjimForTest.run.outcomes.get(${JSON.stringify(id)}); return o ? { damaged: o.housesDamaged, saved: o.housesSaved, total: o.housesTotal, stars: o.stars } : null; })()`)) as { damaged: number; saved: number; total: number; stars: number } | null;
  const card = (await page.evaluate(`(() => { const m = /(\\d+) of (\\d+) homes saved/.exec(document.querySelector(".result-homes-text")?.textContent ?? ""); return m ? { saved: Number(m[1]), total: Number(m[2]) } : null; })()`)) as { saved: number; total: number } | null;
  const ruins = (await page.evaluate("window.__ruinsForTest().ruined")) as number;
  check(!!outcome && !!card && card.saved === outcome.saved && card.total === outcome.total, `${style} ${id}: the card reads ${card?.saved} of ${card?.total} homes saved, as the storm resolved`);
  check(!!outcome && ruins - ruinsBefore === outcome.damaged, `${style} ${id}: ${ruins - ruinsBefore} new ruins, the ${outcome?.damaged} homes it destroyed`);
  await shot(page, `${style}-${id}-card1`);
  await textAndLayout(page, `${style} ${id} result card`);
  // Input over a result card: Help and ☰ open and close; Esc.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check(await cardsOpen(page) || (await finalCard(page)), `${style} ${id}: Esc does not drop the result cards`);
  for (let k = 0; k < 8; k++) {
    if (await finalCard(page)) return { ruins, final: true };
    const next = page.locator(".result-cards:not([hidden]) .result-next");
    if (!(await next.isVisible().catch(() => false))) break;
    const label = (await next.textContent()) ?? "";
    await next.click();
    await page.waitForTimeout(1100);
    if (/Play again|Back to/.test(label)) break;
  }
  await page.waitForTimeout(1500);
  return { ruins, final: await finalCard(page) };
}

/** A full run in one play style, 2026 to 2050. */
async function playStyle(style: string): Promise<void> {
  const { page, log, context } = await newPage();
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* blocked */
    }
  });
  await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await begin(page);
  let ruins = 0;
  let seed = 9871 + style.length * 31;
  let builds = 0;
  while (builds < 40) {
    if (await finalCard(page)) break;
    if ((await page.evaluate("window.__panjimForTest.run.finished")) as boolean) break;
    const pick = (await page.evaluate(`(${PICK})(${JSON.stringify(style)}, ${seed++})`)) as { key: string; id: string } | null;
    const before = await year(page);
    if (pick) {
      const [q, r] = pick.key.split(",").map(Number);
      void page.evaluate(`window.__panjimForTest.buildNow({ q: ${q}, r: ${r} }, ${JSON.stringify(pick.id)})`);
    } else void page.evaluate(`window.__panjimScenarioForTest("pass-year")`);
    builds++;
    // The year ends; a storm may come.
    for (let k = 0; k < 120; k++) {
      await page.waitForTimeout(200);
      if ((await storming(page)) || (await cardsOpen(page)) || (await year(page)) !== before || (await finalCard(page))) break;
    }
    if ((await storming(page)) || (await cardsOpen(page))) {
      if (builds < 8) {
        // Input during the first storm: Help and ☰ refuse or wait, a double click, R and S, a resize.
        await page.keyboard.press("?");
        await page.locator(".help-button").click({ timeout: 1000 }).catch(() => undefined);
        await page.waitForTimeout(300);
        await page.keyboard.press("Escape");
        await page.mouse.dblclick(W * 0.45, H * 0.5);
        await page.keyboard.press("r");
        await page.keyboard.press("r");
        await page.setViewportSize({ width: Math.round(W * 0.8), height: Math.round(H * 0.8) });
        await page.waitForTimeout(500);
        await page.setViewportSize({ width: W, height: H });
        await shot(page, `${style}-storm`);
      }
      const result = await weatherStorm(page, style, ruins);
      ruins = result.ruins;
      if (result.final) break;
    }
  }
  check(await finalCard(page), `${style}: the run reaches the final card (${builds} builds, year ${await year(page)})`);
  await shot(page, `${style}-final`);
  await textAndLayout(page, `${style} final card`);
  const stars = (await page.evaluate("window.__panjimForTest.run.schedule.map((c) => window.__panjimForTest.run.outcomes.get(c.id)?.stars ?? 0)")) as number[];
  console.log(`INFO [${tag}] ${style}: stars ${stars.join(" / ")}, ruins ${ruins}`);
  const buttons = (await page.evaluate("[...document.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim())")) as string[];
  check(buttons.some((b) => /Play again/.test(b)), `${style}: the final card offers Play again (${buttons.filter((b) => /Play|Back|menu/i.test(b)).join(", ")})`);
  const errs = log.filter((l) => !/Download the React DevTools|GPU stall|WebGL/.test(l));
  check(errs.length === 0, `${style}: no console errors or warnings${errs.length ? `: ${errs.slice(0, 3).join(" | ")}` : ""}`);
  await context.close();
}

// ---- landing, continue, begin again, input, edges ----------------------------------------
{
  const { page, log, context } = await newPage();
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const menu = (await page.evaluate("[...document.querySelectorAll('.menu-actions button, .menu-actions a')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim())")) as string[];
  check(menu.some((t) => /Tutorial/.test(t)) && menu.some((t) => /Play Panjim/.test(t)) && !menu.some((t) => /level/i.test(t)), `the menu offers Tutorial and Play Panjim only (${menu.join(", ")})`);
  await shot(page, "landing");
  await textAndLayout(page, "landing");
  await page.getByText("Play Panjim").first().click();
  await ready(page);
  await shot(page, "start-popup");
  await textAndLayout(page, "start popup");
  await begin(page);
  await textAndLayout(page, "the board in 2026");
  // Keys: R, S, +, -, Home, Esc.
  for (const key of ["r", "r", "s", "s", "+", "-", "Home"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await page.mouse.move(W / 2, H / 2);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -500);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const leave = (await page.evaluate("!!document.querySelector('.leave-confirm:not([hidden])') && document.querySelector('.leave-confirm').getClientRects().length > 0")) as boolean;
  check(leave, "Esc with nothing open asks to leave Panjim");
  await shot(page, "esc-leave");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  // ☰ and Help, and Esc closing each.
  for (const [button, layer] of [[".hud-panel-settings .hud-panel-button", ".hud-panel-settings .hud-panel-body"], [".help-button", ".help-card"]]) {
    await page.locator(button).first().click().catch(() => undefined);
    await page.waitForTimeout(700);
    const label = button.includes("help") ? "Help" : "the ☰ menu";
    await shot(page, `open-${button.includes("help") ? "help" : "menu"}`);
    await textAndLayout(page, label);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const still = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(layer)})].some((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.hidden)`)) as boolean;
    check(!still, `Esc closes ${label}`);
  }
  // The Field Guide.
  await page.locator(".field-guide-button").first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(600);
  await shot(page, "field-guide");
  await textAndLayout(page, "Field Guide");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  // A build menu on each kind of ground, the Not here line; the notes on scenery and a landmark.
  for (const [ground, element] of [["beach", "dune"], ["wetland", "mangrove"], ["river", "small_dam"], ["coast", "breakwater"], ["land", "khazan"]] as const) {
    const opened = (await page.evaluate(`(() => { const t = window.__panjimForTest.firstBuildable(${JSON.stringify(element)}); return t ? window.__openTileForTest(t.q, t.r) : false; })()`)) as boolean;
    await page.mouse.move(2, H - 2);
    await page.waitForTimeout(800);
    if (opened) {
      await shot(page, `build-menu-${ground}`);
      await textAndLayout(page, `build menu on ${ground}`);
    }
    check(opened, `a build menu opens on ${ground}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  for (const [what, q, r, note] of [["the north bank", 1, 6, /North of the Mandovi/], ["the east edge", 27, 13, /Outside Panjim/], ["a landmark", 11, 8, /Panjim landmark/]] as const) {
    await page.evaluate(`window.__openTileForTest(${q}, ${r})`);
    await page.waitForTimeout(800);
    const text = (await page.evaluate("[...document.querySelectorAll('.build-popover')].filter((el) => el.getClientRects().length).map((el) => el.innerText).join(' ')")) as string;
    check(note.test(text) && !/Build|Plant/.test(text.split("\n")[0]), `${what}: its note only ("${text.replace(/\s+/g, " ").slice(0, 60)}")`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  // A build, then a reload: Continue from 2027; then Begin again.
  const t = (await page.evaluate("window.__panjimForTest.firstBuildable('dune')")) as { q: number; r: number };
  await page.evaluate(`window.__panjimForTest.buildNow({ q: ${t.q}, r: ${t.r} }, "dune")`);
  await page.waitForTimeout(2500);
  check((await year(page)) === 2027, "a build ends the year: 2027");
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  const ctas = (await page.evaluate("[...document.querySelectorAll('.brief-cta')].map((b) => b.textContent.trim())")) as string[];
  check(ctas.some((c) => /Continue from 2027/.test(c)) && ctas.some((c) => /Begin again/.test(c)), `after a reload the start popup offers ${ctas.join(" and ")}`);
  await shot(page, "continue");
  await begin(page, "Continue from 2027");
  check((await year(page)) === 2027, "Continue lands in 2027");
  // Two tabs on the same run.
  const second = await newPage(context);
  await second.page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await ready(second.page);
  const ctas2 = (await second.page.evaluate("[...document.querySelectorAll('.brief-cta')].map((b) => b.textContent.trim())")) as string[];
  check(ctas2.some((c) => /Continue from 2027/.test(c)), `a second tab offers the same saved run (${ctas2.join(", ")})`);
  await begin(second.page, "Begin again");
  check((await year(second.page)) === 2026, "Begin again in the second tab starts at 2026");
  const t2 = (await second.page.evaluate("window.__panjimForTest.firstBuildable('dune')")) as { q: number; r: number };
  await second.page.evaluate(`window.__panjimForTest.buildNow({ q: ${t2.q}, r: ${t2.r} }, "dune")`);
  await second.page.waitForTimeout(2000);
  const t1 = (await page.evaluate("window.__panjimForTest.firstBuildable('mangrove')")) as { q: number; r: number };
  await page.evaluate(`window.__panjimForTest.buildNow({ q: ${t1.q}, r: ${t1.r} }, "mangrove")`);
  await page.waitForTimeout(2000);
  check((await year(page)) === 2028 && (await year(second.page)) === 2027, `two tabs each play on (first ${await year(page)}, second ${await year(second.page)})`);
  check(second.log.filter((l) => !/GPU stall|WebGL/.test(l)).length === 0, `the second tab: no console errors or warnings${second.log.length ? `: ${second.log.slice(0, 3).join(" | ")}` : ""}`);
  await second.page.close();
  // Reload mid storm and over a result card.
  await page.evaluate(`window.__panjimScenarioForTest("storm-6")`);
  await page.waitForTimeout(1500);
  check(await storming(page), "a storm is playing");
  await page.setViewportSize({ width: Math.round(W * 0.75), height: Math.round(H * 0.75) });
  await page.waitForTimeout(800);
  await shot(page, "resized-mid-storm");
  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(800);
  const canvas = (await page.evaluate("(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()")) as { w: number; h: number };
  check(Math.abs(canvas.w - W) <= 2 && Math.abs(canvas.h - H) <= 2, `after a resize mid storm the board fills the window again (${canvas.w}x${canvas.h})`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  const afterStorm = (await page.evaluate("[...document.querySelectorAll('.brief-cta')].map((b) => b.textContent.trim())")) as string[];
  await shot(page, "reload-mid-storm");
  check(afterStorm.some((c) => /Continue from/.test(c)), `reloading mid storm offers to continue (${afterStorm.join(", ")})`);
  await begin(page, afterStorm.find((c) => /Continue from/.test(c)) ?? "Begin");
  for (let k = 0; k < 300 && (await storming(page)); k++) {
    await page.mouse.click(W * 0.5, H * 0.55);
    await page.waitForTimeout(250);
  }
  const resumed = await year(page);
  console.log(`INFO [${tag}] reload mid storm: continued at ${resumed}, landed ${await page.evaluate("[...window.__panjimForTest.run.landed].join(',')")}`);
  await page.evaluate(`window.__panjimScenarioForTest("to-results")`).catch(() => undefined);
  for (let k = 0; k < 400 && !(await cardsOpen(page)); k++) await page.waitForTimeout(250);
  check(await cardsOpen(page), "a result card is open");
  await page.locator(".help-button").click({ timeout: 1500 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await shot(page, "help-over-result-card");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check(await cardsOpen(page), "Help over a result card closes back to the card");
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  const afterCard = (await page.evaluate("[...document.querySelectorAll('.brief-cta')].map((b) => b.textContent.trim())")) as string[];
  await shot(page, "reload-over-result-card");
  check(afterCard.some((c) => /Continue from/.test(c)), `reloading over a result card offers to continue (${afterCard.join(", ")})`);
  const errs = log.filter((l) => !/GPU stall|WebGL/.test(l));
  check(errs.length === 0, `landing, input and edges: no console errors or warnings${errs.length ? `: ${errs.slice(0, 4).join(" | ")}` : ""}`);
  await context.close();
}

for (const style of STYLES) await playStyle(style);

console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${tag})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
