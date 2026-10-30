/**
 * Section 39.5: the browser pass for the first minute, on the dev server (`?qa=1&tag=FestTesters`, `/api` stubbed, so
 * nothing reaches the board).
 *
 *   1. 39.2: the main screen: Play Panjim alone, the quote band clear of the card, Facts & sources in the band.
 *   2. 39.3: Play Panjim, the name card, "Play without a name", How to play (focus on Let's Play!, Esc does nothing,
 *      no scroll), Let's Play! with Enter.
 *   3. 39.4: the guided start, steps 1, 1b, 2, 2b and 3 by clicking the glowing tiles and the cards; Esc on its menu
 *      goes back to step 1; Esc with no menu keeps the step's bubble; Got it ends it and the dune's fact follows.
 *   4. 39.4: a second run: Skip the help goes to step 3 with Got it focused; M (mute) ends the guide.
 *   5. The Tutorial by its route keeps its own brief, with Begin.
 *
 * Usage: npx tsx tools/section39Shots.ts [w=1366] [h=768] [out=docs/qa/section39] [only=screens] [port=5249]
 * `only=screens` shoots the main screen and How to play alone (the other sizes). Exits 1 on a console error or a failed
 * check.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section39");
const ONLY = args.get("only") ?? "";
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const posts: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const shot = async (page: Page, name: string, wait = 4000): Promise<void> => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
};

async function open(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") posts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"rows":[]}' });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

const step = (page: Page): Promise<string> => js<string>(page, "window.__guideForTest.step()");
const bubble = (page: Page): Promise<string> => js<string>(page, `(document.querySelector(".maya-bubble:not([hidden])")?.innerText ?? "").replace(/\\n+/g, " | ")`);
const ring = async (page: Page): Promise<{ x: number; y: number }> =>
  js(page, `(() => { const r = document.querySelector(".guide-ring").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const clickRing = async (page: Page): Promise<void> => {
  const c = await ring(page);
  await page.mouse.click(c.x, c.y);
  await page.waitForSelector(".build-popover .build-card", { timeout: 30000 });
};
const waitStep = (page: Page, s: string): Promise<unknown> => page.waitForFunction(`window.__guideForTest.step() === "${s}"`, null, { timeout: 60000 });

const server = await startDevServer(Number(args.get("port") ?? 5249), 120000);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
try {
  const page = await open(browser, `${server.url}/?qa=1&tag=FestTesters`);
  // 1. The main screen.
  await page.waitForSelector(".menu-quote", { timeout: 60000 });
  const menu = await js<{ buttons: string[]; cardBottom: number; bandTop: number; bandH: number; linkInBand: boolean; scroll: number }>(
    page,
    `(() => { const g = (s) => document.querySelector(s).getBoundingClientRect(); return { buttons: [...document.querySelectorAll(".menu-actions button")].map((b) => b.textContent.trim()), cardBottom: g(".menu-card").bottom, bandTop: g(".menu-quote").top, bandH: g(".menu-quote").height, linkInBand: !!document.querySelector(".menu-quote .menu-sources-link"), scroll: document.querySelector(".screen-layer").scrollHeight - innerHeight }; })()`
  );
  check(JSON.stringify(menu.buttons) === '["Play Panjim"]', `the menu offers ${JSON.stringify(menu.buttons)}`);
  check(menu.cardBottom <= menu.bandTop, `the card (bottom ${Math.round(menu.cardBottom)}) clears the quote band (top ${Math.round(menu.bandTop)}, ${Math.round(menu.bandH)} px tall)`);
  check(menu.linkInBand && menu.scroll <= 0, "Facts & sources is in the band; the page does not scroll");
  await shot(page, "1-main-screen", 1500);

  // 2. The name card, then How to play.
  if (ONLY !== "screens") {
    await page.click(".menu-actions .btn-primary");
    await page.waitForSelector(".name-card", { timeout: 60000 });
    check((await page.locator(".howto-card:visible").count()) === 0, "the name card comes first, How to play under it");
    await shot(page, "2-name-card");
    await page.click(".name-card-skip");
  } else await page.goto(`${server.url}/?qa=1&noname=1&tag=FestTesters#/play/l01-first-rains`), await page.reload();
  await page.waitForSelector(".howto-card:visible", { timeout: 60000 });
  await page.waitForTimeout(1000);
  const howto = await js<{ x: number; y: number; w: number; h: number; focus: string; over: number }>(
    page,
    `(() => { const r = document.querySelector(".howto-card").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, focus: document.activeElement?.textContent ?? "", over: [...document.querySelectorAll(".howto-card *")].filter((e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible").length }; })()`
  );
  check(howto.x >= 0 && howto.y >= 0 && howto.x + howto.w <= W && howto.y + howto.h <= H && howto.over === 0, `How to play fits: ${Math.round(howto.w)} x ${Math.round(howto.h)} at ${Math.round(howto.x)},${Math.round(howto.y)}, nothing scrolls`);
  check(howto.focus === "Let's Play!", `focus on "${howto.focus}"`);
  await shot(page, "3-how-to-play");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check((await page.locator(".howto-card:visible").count()) === 1, "Esc does nothing on How to play");
  if (ONLY === "screens") throw new Error("done");
  await page.keyboard.press("Enter");

  // 3. The guided start.
  await waitStep(page, "1");
  check((await bubble(page)).includes("Click the glowing tile.") && (await bubble(page)).includes("Step 1 of 2"), "step 1: her line, Click the glowing tile, Step 1 of 2");
  check((await js<string>(page, `getComputedStyle(document.querySelector(".empty-prompt")).display`)) === "none", "the bottom banner is hidden");
  await shot(page, "4-guide-step1", 6000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  check((await bubble(page)).includes("Click the glowing tile."), "Esc with no menu open keeps the step's bubble");
  await clickRing(page);
  await waitStep(page, "1b");
  check((await bubble(page)).includes("Pick Dune."), "step 1b: Pick Dune");
  check((await page.locator(".build-card.guide-pick[data-element=dune]").count()) === 1 && (await page.locator(".guide-pick-tag:visible").count()) === 1, "the gold ring on Dune, and its tag");
  await shot(page, "5-guide-step1b");
  await page.keyboard.press("Escape");
  await waitStep(page, "1");
  check(!(await bubble(page)).includes("Hello!"), "Esc on the menu goes back to step 1 (without saying hello again)");
  await page.waitForTimeout(1500);
  await clickRing(page);
  await page.waitForTimeout(2500);
  await page.click('.build-popover .build-card[data-element="dune"]');
  await waitStep(page, "2");
  // The overlay draws on the next frame (about a second in software GL): checked after the shot's wait.
  await shot(page, "6-guide-step2", 7000);
  check((await page.locator(".guide-chip:visible").count()) === 1 && (await bubble(page)).includes("Step 2 of 2"), "step 2: the built chip, Step 2 of 2");
  await clickRing(page);
  await waitStep(page, "2b");
  check((await bubble(page)).includes("Pick Pandanus."), "step 2b: Pick Pandanus");
  await shot(page, "7-guide-step2b");
  await page.click('.build-popover .build-card[data-element="sandy_vegetation"]');
  await waitStep(page, "3");
  check((await bubble(page)).includes("The cyclone comes in 3 builds.") && (await bubble(page)).includes("Got it"), "step 3: 3 builds, Got it");
  await shot(page, "8-guide-step3", 7000);
  check((await page.locator(".guide-dim:visible").count()) === 0 && (await js<boolean>(page, `document.body.querySelector(".guide-step-3") !== null`)), "the dim lifts; the objective is outlined");
  await page.click(".maya-bubble .maya-dismiss");
  await page.waitForTimeout(2500);
  check((await step(page)) === "none", "Got it ends the guide");
  check(/dune/i.test(await bubble(page)), `the dune's fact follows: ${(await bubble(page)).slice(0, 60)}`);
  await page.close();

  // 4. Skip, and M.
  {
    const p = await open(browser, `${server.url}/?qa=1&noname=1&tag=FestTesters#/play/l01-first-rains`);
    await p.waitForSelector(".howto-card .brief-cta", { timeout: 60000 });
    await p.waitForTimeout(2000);
    await p.click(".howto-card .brief-cta");
    await waitStep(p, "1");
    await p.waitForTimeout(2000);
    await p.click(".maya-skip");
    await waitStep(p, "3");
    await p.waitForTimeout(800);
    check((await js<string>(p, "document.activeElement?.textContent ?? ''")) === "Got it", "Skip the help: step 3, Got it focused");
    await p.close();
    const q = await open(browser, `${server.url}/?qa=1&noname=1&tag=FestTesters#/play/l01-first-rains`);
    await q.waitForSelector(".howto-card .brief-cta", { timeout: 60000 });
    await q.waitForTimeout(2000);
    await q.click(".howto-card .brief-cta");
    await waitStep(q, "1");
    await q.keyboard.press("m");
    await q.waitForTimeout(2000);
    check((await step(q)) === "none" && (await q.locator(".guide-layer").count()) === 0, "M (mute) ends the guide and its dim");
    await q.close();
  }

  // 5. The Tutorial by its route.
  {
    const t = await open(browser, `${server.url}/?qa=1&tag=FestTesters#/play/l00-tutorial`);
    await t.waitForSelector(".brief-card", { timeout: 60000 });
    await t.waitForTimeout(1000);
    check((await t.locator(".howto-card").count()) === 0 && (await t.locator(".brief-cta:visible").textContent())?.trim() === "Begin", "the Tutorial keeps its brief and Begin");
    await t.click(".brief-cta");
    await t.waitForTimeout(3000);
    check((await step(t)) === "none", "no guided start in the Tutorial");
    await t.close();
  }
} catch (e) {
  if (!(e instanceof Error && e.message === "done")) {
    console.log(`FAIL ${String(e)}`);
    failures++;
  }
} finally {
  await browser.close();
  server.stop();
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
check(posts.length === 0, `nothing posted${posts.length ? `: ${posts.join(", ")}` : ""}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
