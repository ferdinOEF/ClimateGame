/**
 * Section 40.6: the browser pass for the five colours, How to play in three screens and the scrolling board box, on
 * the dev server with `/api` stubbed (nothing reaches the board).
 *
 *   menu    the main screen: the five bars, the card clear of the quote band; Facts & sources.
 *   name    Play Panjim, the name card with its Top 10 (stubbed rows).
 *   howto   How to play 1, 2 and 3: each fits, nothing scrolls, focus on the main button, Next and Back, Esc.
 *   play    by hand: name card, Next, Next, "Let's Play!", and the guided start runs to the first build.
 *   result  the 2030 result card and its detail card.
 *   last    the last card: the board box from 1st place down to the player, the nudge.
 *   leave   Leave Panjim?
 *
 * The parts through `play` open with `?qa=1&tag=FestTesters`. `result`, `last` and `leave` open without the tag: a
 * tagged run's board box says "Test session: not on the board.", and the box is what `last` shoots; every `/api` call
 * is answered here, and the dev server has no `/api` of its own.
 *
 * Usage: npx tsx tools/section40Shots.ts [w=1366] [h=768] [out=docs/qa/section40] [only=menu,howto] [port=5250]
 * Exits 1 on a console error or a failed check.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";
import { letsPlay } from "./letsPlay";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section40");
const ONLY = new Set((args.get("only") ?? "menu,name,howto,play,result,last,leave").split(","));
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const posts: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const shot = async (page: Page, name: string, wait = 1500): Promise<void> => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 88 });
  console.log(`shot ${name}`);
};
const textOf = (page: Page, selector: string): Promise<string> => js<string>(page, `document.querySelector(${JSON.stringify(selector)})?.textContent?.replace(/\\s+/g, " ").trim() ?? ""`);
/** A computed colour, as the browser gives it ("rgb(74, 51, 88)"). */
const colour = (page: Page, selector: string, prop = "backgroundColor"): Promise<string> => js<string>(page, `getComputedStyle(document.querySelector(${JSON.stringify(selector)}))[${JSON.stringify(prop)}]`);
const rgb = (hex: string): string => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

/** The stubbed board: 14 rows above a run of 4000 points, 3 below. */
const ROWS = Array.from({ length: 17 }, (_, i) => ({ rank: i + 1, name: ["Test Ana", "Test Rui", "Test Zoe", "Test Kiran", "Test Mira"][i % 5] + (i >= 5 ? ` ${i + 1}` : ""), points: 5400 - i * 100, stars: 7, season: "QA" }));
const rankReply = (points: number, name?: string): Record<string, unknown> => {
  const above = ROWS.filter((r) => r.points > points);
  const below = ROWS.filter((r) => r.points < points).map((r) => ({ ...r, rank: r.rank + 1 }));
  return { season: "QA", rank: above.length + 1, points, tenth: ROWS[9].points, top: above, above: above.slice(-2), below: below.slice(0, 2), ...(name ? { editToken: "qa-token-0123456789abcdef", name } : {}) };
};

async function open(browser: Browser, url: string): Promise<{ page: Page; stop: () => void }> {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/api/**", (route) => {
    const req = route.request();
    const at = new URL(req.url());
    let sent: Record<string, unknown> = {};
    try {
      sent = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
    } catch {
      sent = {};
    }
    if (req.method() !== "GET") posts.push(`${req.method()} ${at.pathname}${typeof sent.tag === "string" ? ` tag=${sent.tag}` : ""}`);
    let body: Record<string, unknown> = { saved: true };
    if (at.pathname === "/api/board" && req.method() === "POST") body = typeof sent.tag === "string" ? { season: "QA", tagged: true, points: 4050, name: sent.name, editToken: "" } : rankReply(4050, String(sent.name ?? "QA"));
    else if (at.pathname === "/api/board") body = at.searchParams.has("points") ? rankReply(Number(at.searchParams.get("points"))) : { season: "QA", rows: ROWS.slice(0, 10) };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // The mouse moves through the scripted runs, or the idle reset would fire.
  let x = 0;
  const wiggle = setInterval(() => void page.mouse.move(W / 2 + (x++ % 2) * 6, H - 40).catch(() => {}), 20000);
  return { page, stop: () => clearInterval(wiggle) };
}

/** How to play's card: where it is, what scrolls inside it, which screen shows and what has focus. */
const howTo = (page: Page): Promise<{ x: number; y: number; w: number; h: number; over: string[]; screen: string; count: string; focus: string; back: boolean; next: boolean; play: boolean; heading: string }> =>
  js(
    page,
    `(() => {
      const card = document.querySelector(".howto-card");
      const r = card.getBoundingClientRect();
      const shown = (s) => { const e = card.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; };
      const live = card.querySelector(".howto-screen:not([hidden])");
      const cr = live.getBoundingClientRect();
      // Anything that scrolls, or that reaches past its screen's box (the foot row is below it).
      const over = [...live.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); return e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible" || b.bottom > cr.bottom + 0.5 || b.right > cr.right + 0.5; }).map((e) => e.className || e.tagName);
      return { x: r.x, y: r.y, w: r.width, h: r.height, over, screen: card.dataset.screen, count: card.querySelector(".howto-count").textContent, focus: document.activeElement?.textContent ?? "", back: shown(".howto-back"), next: shown(".howto-next"), play: shown(".brief-cta"), heading: live.querySelector(".howto-title").textContent };
    })()`
  );

const server = await startDevServer(Number(args.get("port") ?? 5250), 120000);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
try {
  // ---- The main screen, Facts & sources, the name card, How to play, and the first build by hand ----
  if (["menu", "name", "howto", "play"].some((p) => ONLY.has(p))) {
    const { page, stop } = await open(browser, `${server.url}/?qa=1&tag=FestTesters`);
    await page.waitForSelector(".menu-quote", { timeout: 60000 });
    if (ONLY.has("menu")) {
      const menu = await js<{ buttons: string[]; cardBottom: number; bandTop: number; bars: number[][]; scroll: number; layer: boolean }>(
        page,
        `(() => { const g = (s) => document.querySelector(s).getBoundingClientRect(); return { buttons: [...document.querySelectorAll(".menu-actions button")].map((b) => b.textContent.trim()), cardBottom: g(".menu-card").bottom, bandTop: g(".menu-quote").top, bars: [...document.querySelectorAll(".menu-bars .menu-bar")].map((b) => [b.getBoundingClientRect().width, b.getBoundingClientRect().height]), scroll: document.querySelector(".screen-layer").scrollHeight - innerHeight, layer: document.querySelector(".screen-layer").classList.contains("five-colours") }; })()`
      );
      check(JSON.stringify(menu.buttons) === '["Play Panjim"]', `the menu offers ${JSON.stringify(menu.buttons)}`);
      check(menu.cardBottom <= menu.bandTop && menu.scroll <= 0, `the card (bottom ${Math.round(menu.cardBottom)}) clears the quote band (top ${Math.round(menu.bandTop)}); the page does not scroll`);
      check(menu.bars.length === 5 && menu.bars.every(([w, h]) => w === 44 && h === 6), `five bars, 44 x 6 px (${JSON.stringify(menu.bars)})`);
      check((await js<string>(page, `document.querySelector(".menu-bars").getAttribute("aria-hidden")`)) === "true", "the bars are hidden from screen readers");
      check(menu.layer && (await colour(page, ".screen-layer")) === rgb("#76adbc"), "the page under the board render is the blue ground");
      check((await colour(page, ".menu-actions .btn-primary")) === rgb("#4fc8b7") && (await colour(page, ".menu-actions .btn-primary", "color")) === rgb("#2a2038"), "Play Panjim is teal with dark ink");
      check((await colour(page, ".menu-quote-mark", "color")) === rgb("#a075ae"), "the quote mark is purple");
      await shot(page, "1-main-screen");
      await page.click(".menu-sources-link");
      await page.waitForSelector(".sources-panel", { timeout: 10000 });
      check((await colour(page, ".sources-head")) === rgb("#4a3358") && (await colour(page, ".sources-panel")) === rgb("#f7f5f9") && (await colour(page, ".sources-link", "color")) === rgb("#4a3358"), "Facts & sources: plum head, light panel, plum links");
      await shot(page, "1b-facts-and-sources", 800);
      await page.keyboard.press("Escape");
    }
    if (["name", "howto", "play"].some((p) => ONLY.has(p))) {
      await page.click(".menu-actions .btn-primary");
      await page.waitForSelector(".name-card", { timeout: 120000 });
      await page.waitForSelector(".name-card-top-rows li", { timeout: 30000 });
      if (ONLY.has("name")) {
        check((await page.locator(".howto-card:visible").count()) === 0, "the name card comes first, How to play under it");
        check((await colour(page, ".name-card-top")) === rgb("#4a3358") && (await colour(page, ".name-card-top-rows b", "color")) === rgb("#d2ad68"), "the Top 10 is the plum band, its points gold");
        check((await page.locator(".name-card-rank.top").count()) === 3 && (await colour(page, ".name-card-rank.top")) === rgb("#d2ad68"), "ranks 1 to 3 sit in a gold chip");
        const fits = await js<boolean>(page, `(() => { const c = document.querySelector(".name-card"); const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && c.scrollHeight <= c.clientHeight + 1; })()`);
        check(fits, "the name card fits and does not scroll");
        // The game behind the name card keeps its own colours (the HUD card is drawn from :root).
        check((await colour(page, ".panjim-clock")) !== rgb("#f7f5f9"), `the HUD card behind keeps its colour (${await colour(page, ".panjim-clock")})`);
        await shot(page, "2-name-card", 2500);
      }
      await page.click(".name-card-skip");
      await page.waitForSelector(".howto-card:visible", { timeout: 60000 });
      await page.waitForTimeout(800);
      if (ONLY.has("howto")) {
        const one = await howTo(page);
        check(one.x >= 0 && one.y >= 0 && one.x + one.w <= W && one.y + one.h <= H, `How to play fits the window: ${Math.round(one.w)} x ${Math.round(one.h)} at ${Math.round(one.x)},${Math.round(one.y)}`);
        check(one.screen === "1" && one.count === "1 of 3" && one.heading === "Three disasters are coming", `screen 1: ${one.heading} (${one.count})`);
        check(one.focus === "Next" && one.next && !one.back && !one.play, `screen 1: focus on "${one.focus}", no Back, no Let's Play!`);
        check(one.over.length === 0, `screen 1: nothing scrolls or runs past its box${one.over.length ? `: ${one.over.slice(0, 4).join(", ")}` : ""}`);
        check((await colour(page, ".howto-band")) === rgb("#4a3358") && (await colour(page, ".howto-marks i.on")) === rgb("#d2ad68"), "the band is plum, the current mark gold");
        await shot(page, "3-how-to-play-1");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        check((await page.locator(".howto-card:visible").count()) === 1 && (await howTo(page)).screen === "1", "Esc does nothing on How to play");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
        const two = await howTo(page);
        check(two.screen === "2" && two.count === "2 of 3" && two.heading === "Each year" && two.focus === "Next" && two.back && two.next && !two.play, `screen 2 by Enter: ${two.heading}, focus on "${two.focus}", Back and Next`);
        check(two.over.length === 0, `screen 2: nothing scrolls or runs past its box${two.over.length ? `: ${two.over.slice(0, 4).join(", ")}` : ""}`);
        check((await page.locator(".howto-builds .howto-build").count()) === 8 && (await page.locator(".howto-build-icon svg").count()) === 7, "seven defenses and the eighth cell");
        check((await js<number>(page, `document.querySelector(".howto-build-icon svg").getBoundingClientRect().width / ${one.w / 1286}`)) > 51.5, "the icons are 52 px at the card's scale");
        await shot(page, "4-how-to-play-2");
        // Tab order: Back, then the main button.
        await page.keyboard.press("Tab");
        const afterTab = await js<string>(page, "document.activeElement?.textContent ?? ''");
        await page.keyboard.press("Tab");
        check(afterTab === "Back" && (await js<string>(page, "document.activeElement?.textContent ?? ''")) === "Next", `Tab stays in the card: ${afterTab}, then Next`);
        await page.click(".howto-next");
        await page.waitForTimeout(300);
        const three = await howTo(page);
        check(three.screen === "3" && three.count === "3 of 3" && three.heading === "Know these icons" && three.focus === "Let's Play!" && three.back && !three.next && three.play, `screen 3: ${three.heading}, focus on "${three.focus}"`);
        check(three.over.length === 0, `screen 3: nothing scrolls or runs past its box${three.over.length ? `: ${three.over.slice(0, 4).join(", ")}` : ""}`);
        await shot(page, "5-how-to-play-3");
        await page.click(".howto-back");
        await page.waitForTimeout(200);
        check((await howTo(page)).screen === "2", "Back goes to screen 2");
        await page.click(".howto-back");
        await page.waitForTimeout(200);
        check((await howTo(page)).screen === "1", "and to screen 1");
      }
      if (ONLY.has("play")) {
        // By hand: Next, Next, Let's Play!, and the guided start runs to the first build.
        while ((await howTo(page)).screen !== "1") await page.click(".howto-back");
        await page.click(".howto-next");
        await page.click(".howto-next");
        await page.waitForTimeout(300);
        await page.click(".brief-cta");
        await page.waitForFunction(`window.__guideForTest.step() === "1"`, null, { timeout: 60000 });
        check(true, "Next, Next, Let's Play!: the game starts and the guided start runs (step 1)");
        await page.waitForTimeout(3000);
        const ring = await js<{ x: number; y: number }>(page, `(() => { const r = document.querySelector(".guide-ring").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        await page.mouse.click(ring.x, ring.y);
        await page.waitForSelector(".build-popover .build-card", { timeout: 30000 });
        await page.waitForFunction(`window.__guideForTest.step() === "1b"`, null, { timeout: 30000 });
        await page.waitForTimeout(2500);
        // The guided start and the build menu are the game's: drawn from :root, not from the five colours.
        check((await colour(page, ".build-popover")) !== rgb("#f7f5f9"), `the build menu keeps its colour (${await colour(page, ".build-popover")})`);
        await page.click('.build-popover .build-card[data-element="dune"]');
        await page.waitForFunction(`window.__guideForTest.step() === "2"`, null, { timeout: 60000 });
        check(true, "the first build by hand: the dune is built and the guide goes to step 2");
        await shot(page, "6-first-build", 6000);
      }
    }
    stop();
    await page.context().close();
  }

  // ---- The 2030 result card and its detail card ----
  if (ONLY.has("result")) {
    const { page, stop } = await open(browser, `${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`);
    await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
    await letsPlay(page);
    await page.waitForTimeout(1500);
    check(await js<boolean>(page, `window.__panjimScenarioForTest("smart-aftermath")`), "the run plays to the 2030 storm's card");
    await page.waitForSelector(".result-cards:not([hidden]) .result-card-body", { timeout: 120000 });
    await page.waitForTimeout(2500);
    const card = ".result-cards:not([hidden])";
    check((await colour(page, `${card} .result-eyebrow`)) === rgb("#e696a6") && (await colour(page, `${card} .result-eyebrow`, "color")) === rgb("#2a2038"), "the card's band is pink with dark ink");
    check((await colour(page, `${card} .result-stars`)) === rgb("#2a2038") && (await colour(page, `${card} .result-stars`, "color")) === rgb("#d2ad68"), "the stars are gold on a dark pill");
    check((await colour(page, `${card} .result-bar span`)) === rgb("#4fc8b7") && (await colour(page, `${card} .result-bar`)) === rgb("#fae3e8"), "the homes saved bar: teal on the soft pink track");
    check((await colour(page, `${card} .result-points`)) === rgb("#f5ead3"), "Points this storm sits in the soft gold box");
    check((await colour(page, `${card} .result-next`)) === rgb("#4fc8b7") && (await colour(page, `${card} .result-retry`)) === "rgba(0, 0, 0, 0)", "the main button is teal; Try again is the quiet style");
    const fits = await js<boolean>(page, `(() => { const c = document.querySelector(".result-cards:not([hidden]) .result-card"); const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && c.scrollHeight <= c.clientHeight + 1; })()`);
    check(fits, "the 2030 card fits and does not scroll");
    await shot(page, "7-result-2030");
    await page.locator(`${card} .result-detail-link`).click();
    await page.waitForTimeout(600);
    check((await textOf(page, `${card} .result-title`)) === "What protected your homes", "the detail card opens from its link");
    await shot(page, "7b-result-2030-detail", 800);
    stop();
    await page.context().close();
  }

  // ---- The last card: the board box from 1st place down to the player; the nudge; Leave Panjim? ----
  if (ONLY.has("last") || ONLY.has("leave")) {
    const { page, stop } = await open(browser, `${server.url}/?qa=1&noguide=1#/play/l01-first-rains`);
    await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
    await page.waitForSelector(".name-card-field", { state: "visible", timeout: 60000 });
    await page.locator(".name-card-field").fill("QA Tester");
    await page.keyboard.press("Enter");
    await letsPlay(page);
    await page.waitForTimeout(2500);
    if (ONLY.has("leave")) {
      await page.evaluate("window.__panjimForTest.maya.dismiss()");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".leave-confirm-backdrop:not([hidden])", { timeout: 10000 });
      await page.waitForTimeout(400);
      const leave = ".leave-confirm-backdrop:not([hidden])";
      check((await textOf(page, `${leave} .leave-confirm-title`)) === "Leave Panjim?" && (await js<string>(page, "document.activeElement?.textContent ?? ''")) === "Stay", "Leave Panjim? opens on Esc with Stay focused");
      check((await colour(page, `${leave} .leave-confirm`)) === rgb("#f7f5f9") && (await colour(page, `${leave} .leave-confirm`, "borderTopColor")) === rgb("#e696a6") && (await js<string>(page, `getComputedStyle(document.querySelector(".leave-confirm-backdrop .leave-confirm")).borderTopWidth`)) === "8px", "a light card with an 8 px pink bar along its top");
      check((await colour(page, `${leave} .leave-confirm-stay`)) === rgb("#4fc8b7") && (await colour(page, `${leave} .leave-confirm-leave`)) === "rgba(0, 0, 0, 0)", "Stay is the teal button, Leave the quiet one");
      await shot(page, "9-leave-panjim", 600);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      check((await page.locator(".leave-confirm-backdrop:not([hidden])").count()) === 0, "Esc closes it and the game goes on");
    }
    if (ONLY.has("last")) {
      check(await js<boolean>(page, `window.__panjimScenarioForTest("finale")`), "the run plays on to its last card");
      await page.waitForSelector(".result-cards:not([hidden]) .last-card", { timeout: 180000 });
      await page.waitForSelector(".last-rank .finale-rank-rows li.me", { timeout: 60000 });
      await page.waitForTimeout(3000);
      const box = await js<{ rows: number; first: string; last: string; lastMe: boolean; listH: number; rowH: number; scrollTop: number; maxScroll: number; meVisible: boolean; tab: string | null; label: string | null; hint: string; head: string; below: boolean }>(
        page,
        `(() => {
          const list = document.querySelector(".last-rank .finale-rank-rows");
          const rows = [...list.querySelectorAll("li")];
          const me = list.querySelector("li.me");
          const lr = list.getBoundingClientRect(), mr = me.getBoundingClientRect();
          return { rows: rows.length, first: rows[0].textContent, last: rows[rows.length - 1].textContent, lastMe: rows[rows.length - 1] === me, listH: list.clientHeight, rowH: rows[0].getBoundingClientRect().height, scrollTop: list.scrollTop, maxScroll: list.scrollHeight - list.clientHeight, meVisible: mr.top >= lr.top - 0.5 && mr.bottom <= lr.bottom + 0.5, tab: list.getAttribute("tabindex"), label: list.getAttribute("aria-label"), hint: document.querySelector(".last-rank .finale-rank-hint")?.textContent ?? "", head: document.querySelector(".last-rank .finale-rank-head").textContent, below: rows.some((r) => /Test .* 16|Test .* 17/.test(r.textContent)) };
        })()`
      );
      check(box.rows === 15 && /^1Test Ana5400$/.test(box.first) && box.lastMe && /QA Tester/.test(box.last), `the box lists 1st place down to the player, the player last (${box.rows} rows: "${box.first}" to "${box.last}")`);
      check(!box.below, "no row below the player is drawn");
      check(box.maxScroll > 0 && Math.abs(box.scrollTop - box.maxScroll) <= 1 && box.meVisible, `it opens scrolled to the player's row (scrollTop ${Math.round(box.scrollTop)} of ${Math.round(box.maxScroll)})`);
      check(box.listH >= box.rowH * 3 - 1 && box.listH < box.rowH * 4, `the list is three rows high (${Math.round(box.listH)} px, rows ${Math.round(box.rowH)} px)`);
      check(box.tab === "0" && box.label === "The board from 1st place down to you", `it can take focus (${box.label})`);
      check(box.hint === "Scroll up to see 1st place", `the line under it: "${box.hint}"`);
      check(box.head === "15th on the board", `the head line is as before: "${box.head}"`);
      const last = ".result-cards:not([hidden])";
      check((await colour(page, ".last-rank")) === rgb("#4a3358") && (await colour(page, ".last-rank li.me")) === rgb("#d2ad68") && (await colour(page, ".last-rank li.me", "color")) === rgb("#2a2038"), "the board box is plum, the player's row gold with dark ink");
      check((await colour(page, `${last} .result-eyebrow`)) === rgb("#e696a6"), "the last card's band is pink");
      check((await colour(page, `${last} .last-right`)) === rgb("#ffffff") && (await colour(page, `${last} .fb-submit`)) === rgb("#4fc8b7"), "the feedback column is white, Submit feedback teal");
      const fits = await js<{ ok: boolean; w: number; h: number }>(page, `(() => { const c = document.querySelector(".result-cards:not([hidden]) .result-card"); const r = c.getBoundingClientRect(); return { ok: r.top >= 0 && r.bottom <= innerHeight && c.scrollHeight <= c.clientHeight + 1, w: r.width, h: r.height }; })()`);
      check(fits.ok, `the last card fits and does not scroll (${Math.round(fits.w)} x ${Math.round(fits.h)})`);
      await shot(page, "8-last-card");
      // The arrow keys scroll the list.
      await page.focus(".last-rank .finale-rank-rows");
      for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(600);
      check((await js<number>(page, `document.querySelector(".last-rank .finale-rank-rows").scrollTop`)) === 0, "the arrow keys scroll it up to 1st place");
      await shot(page, "8b-last-card-board-top", 400);
      // A chosen feedback star.
      await page.click('.fb-row .fb-star[data-value="4"]');
      check((await colour(page, ".fb-row .fb-star.on")) === rgb("#d2ad68") && (await colour(page, ".fb-row .fb-star:not(.on)")) === rgb("#f7f5f9"), "a chosen star button is gold, an empty one light");
      // The nudge, from a footer button.
      await page.click('.last-action[data-action="exit"]');
      await page.waitForSelector(".result-nudge", { timeout: 10000 });
      check((await colour(page, ".result-nudge-card")) === rgb("#f7f5f9") && (await colour(page, ".result-nudge-answer")) === rgb("#4fc8b7"), "the nudge: a light card, Answer now teal");
      await shot(page, "8c-nudge", 600);
      await page.click(".result-nudge-answer");
    }
    stop();
    await page.context().close();
  }
} catch (e) {
  console.log(`FAIL ${String(e)}`);
  failures++;
} finally {
  await browser.close();
  server.stop();
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
console.log(`posts answered by the stub (none left the machine): ${posts.length ? posts.join(", ") : "none"}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
