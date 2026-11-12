/**
 * Section 41.6.4: three full Play Panjim runs, played through the game's own screens, and the axe pass.
 *
 * Every page opens with `?qa=1&tag=FestTesters`. Every `/api` call is answered on this machine by the server's own
 * handlers (server/handlers.ts) on an in memory database (tests/helpers/memoryDb.ts), seeded with 17 untagged rows
 * stored with an old label ("Festival 2026"), so nothing reaches the real board and the board the page shows is the
 * real handler's reply. Every post must carry the test tag (checked). For run A only, the post is answered as for a
 * real player (the in memory board only), so the last card's board box can be seen scrolling from 1st place to the
 * player; the page itself sent the tag.
 *
 *   A  the perfect plan (docs/qa/section41-6/best_plan.json, goal 1), build by build through the tile menus; the
 *      guided start skipped with its own "Skip the help" (its dune is not in the plan).
 *   B  a seawall player at Campal: the guided start played (dune, then pandanus), the plan's builds to 2040, then in
 *      the 2050 phase seawalls on the first water tiles along Campal and pandanus on the sand beside them.
 *   C  a careless player: the guided start played, then builds away from every storm, and in 2031 the standing khazan
 *      at 26,6 removed through its own card.
 *   axe  axe-core on the menu, the name card, How to play, the game, a result card and the last card (serious or
 *      critical only), at each size given.
 *
 * Usage: npx tsx tools/qa41/full416.ts [w=1366] [h=768] [runs=A,B,C] [axe=1280x600,1366x768,1920x1080,2560x1440]
 *        [out=docs/qa/section41-6] [url=<a deployed base URL instead of the dev server>] [port=5261]
 * GPU=1 on a machine with one. Exits 1 on a failed check or a console error.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "../devServer";
import { letsPlay } from "../letsPlay";
import { getBoard, postBoard, type Ctx } from "../../server/handlers";
import { memoryDb } from "../../tests/helpers/memoryDb";
import { PANJIM_POINTS_MODEL } from "../../src/levels/panjimRun";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section41-6");
const RUNS = (args.get("runs") ?? "A,B,C").split(",").filter(Boolean);
const AXE = (args.get("axe") ?? "").split(",").filter(Boolean).map((s) => s.split("x").map(Number) as [number, number]);
const TARGET = args.get("url") ?? null;
const PLAN = (JSON.parse(fs.readFileSync(path.resolve(args.get("plan") ?? "docs/qa/section41-6/best_plan.json"), "utf8")) as { goal1: { actions: { action: string; elementId: string; q: number; r: number }[] } }).goal1.actions;
fs.mkdirSync(OUT, { recursive: true });

const STANDING_LINE = "Panjim already has mangroves and khazan land at Merces and Taleigao. Keep them standing.";
const CAMPAL_LINE = "At Campal the sea and the river rise together. Seawalls and breakwaters along the shore can hold them back.";
const WIND_LINE = "The cyclone brings wind onto Campal. In this game only pandanus shelters homes from the wind.";

let failures = 0;
const report: string[] = [];
const log = (text: string): void => {
  report.push(text);
  console.log(text);
};
const check = (ok: boolean, what: string): void => {
  log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const posts: string[] = [];
const texts: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const size = (): string => `${W}x${H}`;
const shot = async (page: Page, name: string, wait = 1200): Promise<void> => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(OUT, `${name}-${size()}.jpg`), type: "jpeg", quality: 86 });
  log(`shot ${name}-${size()}.jpg`);
};

// ---- the in memory board, behind the real handlers ----
const db = memoryDb();
await db.apply();
for (let i = 0; i < 17; i++) {
  await db.query("INSERT INTO board (id, season, name, points, stars, edit_token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    "Festival 2026",
    `Board ${["Ana", "Rui", "Zoe", "Kiran", "Mira"][i % 5]} ${i + 1}`,
    5600 - i * 150,
    6,
    `token-${i}-abcdefghijklmnopqrstu`,
    "2026-11-01T09:00:00Z"
  ]);
}
const ctx = (): Ctx => ({ sql: db, env: { BOARD_SEASON: "Festival 2026", RATE_SALT: "qa41", DEFAULT_TAG: undefined }, ip: `10.41.6.${Math.floor(Math.random() * 200)}`, now: new Date("2026-11-11T10:00:00Z"), model: PANJIM_POINTS_MODEL });
const serverPoints = new Map<string, number>();

async function open(browser: Browser, url: string, asPlayer = false): Promise<{ page: Page; stop: () => void }> {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const at = new URL(req.url());
    let sent: Record<string, unknown> = {};
    try {
      sent = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
    } catch {
      sent = {};
    }
    if (req.method() !== "GET") posts.push(`${req.method()} ${at.pathname}${typeof sent.tag === "string" ? ` tag=${sent.tag}` : " NO TAG"}`);
    let reply: { status: number; body: unknown } = { status: 200, body: { saved: true } };
    if (at.pathname === "/api/board" && req.method() === "GET") reply = await getBoard(ctx(), Object.fromEntries(at.searchParams));
    else if (at.pathname === "/api/board" && req.method() === "POST") {
      // The page's own post (tagged); run A's is answered as a real player's, on the in memory board only.
      const body = asPlayer ? { ...sent, tag: undefined } : sent;
      reply = await postBoard(ctx(), body);
      const points = (reply.body as { points?: number }).points;
      if (typeof sent.name === "string" && typeof points === "number") serverPoints.set(sent.name, points);
    }
    return route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Everything Maya says, with the year it was said in.
  await page.addInitScript(() => undefined);
  let x = 0;
  const wiggle = setInterval(() => void page.mouse.move(W / 2 + (x++ % 2) * 6, H - 40).catch(() => {}), 15000);
  return { page, stop: () => clearInterval(wiggle) };
}

async function listenToMaya(page: Page): Promise<void> {
  await js(
    page,
    `(() => { window.__qaSaid = []; let last = ""; setInterval(() => { const b = document.querySelector(".maya-bubble"); const t = b && !b.hidden ? (b.querySelector(".maya-text")?.textContent ?? "").trim() : ""; if (t && t !== last) { window.__qaSaid.push({ year: window.__panjimForTest?.run?.year ?? 0, text: t }); } last = t; }, 150); })()`
  );
}
const said = (page: Page): Promise<{ year: number; text: string }[]> => js(page, `window.__qaSaid ?? []`);

/** Opens a tile's build menu as a click on it does. */
async function openTile(page: Page, q: number, r: number): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await js(page, `window.__openTileForTest(${q}, ${r})`);
  await page.waitForSelector(".build-popover:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(500);
}
/** One build through the tile's own menu: the card clicked. */
async function buildByMenu(page: Page, q: number, r: number, elementId: string): Promise<boolean> {
  const year = await js<number>(page, `window.__panjimForTest.run.year`);
  await openTile(page, q, r);
  const card = page.locator(`.build-popover .build-card[data-element="${elementId}"]`);
  if ((await card.count()) === 0) return false;
  await card.first().click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(200);
    const now = await js<{ year: number; el: string }>(page, `({ year: window.__panjimForTest.run.year, el: window.__panjimForTest.run.state.elements.get("${q},${r}")?.elementId ?? "" })`);
    if (now.el === elementId && (now.year !== year || (await js<boolean>(page, `window.__panjimForTest.run.finished`)))) return true;
    if (await js<boolean>(page, `!!document.querySelector(".result-cards:not([hidden])")`)) return now.el === elementId;
  }
  return (await js<string>(page, `window.__panjimForTest.run.state.elements.get("${q},${r}")?.elementId ?? ""`)) === elementId;
}
/** Hurries a storm on (as a click on the board does) until its result cards are up. */
async function toCards(page: Page, selector = ".result-cards:not([hidden]) .result-card-body"): Promise<void> {
  for (let i = 0; i < 1600 && (await page.locator(selector).count()) === 0; i++) {
    await js(page, `document.dispatchEvent(new PointerEvent("pointerdown"))`);
    await page.waitForTimeout(250);
  }
  await page.waitForSelector(selector, { timeout: 5000 });
  await page.waitForTimeout(2200);
}
const cardText = (page: Page): Promise<string> => js<string>(page, `document.querySelector(".result-cards:not([hidden])")?.textContent?.replace(/\\s+/g, " ").trim() ?? ""`);
const protectedRows = (page: Page): Promise<string[]> => js(page, `[...document.querySelectorAll(".result-cards:not([hidden]) .result-rows li")].map((li) => (li.dataset.defence ?? "") + ": " + li.textContent.replace(/\\s+/g, " ").trim())`);

/** A storm's cards: card 1 and "What protected your homes" shot and read; then on. Returns card 1's text and the rows. */
async function stormCards(page: Page, run: string, year: number, last: boolean): Promise<{ text: string; rows: string[] }> {
  await toCards(page, last ? ".result-cards:not([hidden]) .last-card" : ".result-cards:not([hidden]) .result-card-body");
  const text = await cardText(page);
  texts.push(text);
  await shot(page, `run${run}-${year}-card1`, 600);
  let rows: string[] = [];
  const link = page.locator(".result-cards:not([hidden]) .result-detail-link");
  if ((await link.count()) > 0) {
    await link.first().click();
    await page.waitForTimeout(900);
    rows = await protectedRows(page);
    texts.push(await cardText(page));
    await shot(page, `run${run}-${year}-what-protected`, 500);
    await page.locator(".result-cards:not([hidden]) .result-detail-back").first().click();
    await page.waitForTimeout(700);
  }
  if (!last) {
    for (let n = 0; n < 8 && (await page.locator(".result-cards:not([hidden]) .result-next").count()) > 0; n++) {
      if (n === 1) {
        texts.push(await cardText(page));
        await shot(page, `run${run}-${year}-card${n + 1}`, 400);
      }
      await page.locator(".result-cards:not([hidden]) .result-next").first().click();
      await page.waitForTimeout(1100);
    }
  }
  return { text, rows };
}

/** Menu, Play Panjim, the name card, How to play's three screens. */
async function startFromMenu(page: Page, name: string, shotName: boolean): Promise<void> {
  await page.waitForSelector(".menu-quote", { timeout: 90000 });
  await page.click(".menu-actions .btn-primary");
  await page.waitForSelector(".name-card-field", { state: "visible", timeout: 120000 });
  await page.waitForFunction(`!!document.querySelector(".name-card-top-rows, .name-card-top-note")`, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const top = await js<{ text: string; season: number; rows: number }>(page, `(() => { const t = document.querySelector(".name-card-top"); return { text: t.textContent.replace(/\\s+/g, " ").trim(), season: t.querySelectorAll(".name-card-season").length, rows: t.querySelectorAll("li").length }; })()`);
  check(top.rows === 10 && top.season === 0 && !/festival|season/i.test(top.text), `name card: the Top 10 has ${top.rows} rows, no season element, no festival or season word ("${top.text.slice(0, 80)}...")`);
  texts.push(top.text);
  if (shotName) await shot(page, "name-card", 400);
  await page.locator(".name-card-field").fill(name);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".brief-cta", { state: "attached", timeout: 120000 });
  let screens = 1;
  for (let i = 0; i < 6; i++) {
    const next = page.locator(".howto-next:visible");
    if ((await next.count()) === 0) break;
    texts.push(await js<string>(page, `document.querySelector(".howto-card")?.textContent?.replace(/\\s+/g, " ").trim() ?? ""`));
    await next.first().click();
    screens++;
    await page.waitForTimeout(250);
  }
  texts.push(await js<string>(page, `document.querySelector(".howto-card")?.textContent?.replace(/\\s+/g, " ").trim() ?? ""`));
  const cta = await js<string>(page, `document.querySelector(".brief-cta:not([hidden])")?.textContent?.trim() ?? ""`);
  check(screens === 3 && /Let.s Play!/.test(cta), `How to play: ${screens} screens (Next, Next), then "${cta}"`);
  await page.locator(".brief-cta:visible").first().click();
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  await listenToMaya(page);
}

/** After the guide hands over, Maya's standing nature line: waited for (20 s at most) before the first build, as a reader would. */
async function awaitStandingLine(page: Page, run: string): Promise<void> {
  let heard = false;
  for (let i = 0; i < 80 && !heard; i++) {
    await page.waitForTimeout(250);
    heard = (await said(page)).some((l) => l.text === STANDING_LINE);
  }
  check(heard, `run ${run}: after the guided start hands over, Maya says the standing nature line`);
  await page.waitForTimeout(1500);
  await page.locator(".maya-dismiss:visible").click().catch(() => {});
}

/** The guided start by its own clicks: the glowing tile, the dune card, the next glowing tile, the pandanus card, Got it. */
async function playGuide(page: Page): Promise<void> {
  await page.waitForFunction(`window.__guideForTest && window.__guideForTest.step() === "1"`, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const ringAt = (): Promise<{ x: number; y: number }> => js(page, `(() => { const r = document.querySelector(".guide-ring").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  let ring = await ringAt();
  await page.mouse.click(ring.x, ring.y);
  await page.waitForFunction(`window.__guideForTest.step() === "1b"`, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.click('.build-popover .build-card[data-element="dune"]');
  await page.waitForFunction(`window.__guideForTest.step() === "2"`, null, { timeout: 60000 });
  await page.waitForTimeout(5000);
  ring = await ringAt();
  await page.mouse.click(ring.x, ring.y);
  await page.waitForFunction(`window.__guideForTest.step() === "2b"`, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.click('.build-popover .build-card[data-element="sandy_vegetation"]');
  await page.waitForFunction(`window.__guideForTest.step() === "3"`, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.locator(".maya-dismiss:visible").click();
  await page.waitForFunction(`window.__guideForTest.step() === "none"`, null, { timeout: 30000 });
  const built = await js<string>(page, `["-4,18", "-3,17"].map((k) => window.__panjimForTest.run.state.elements.get(k)?.elementId ?? "none").join(" ")`);
  check(built === "dune sandy_vegetation", `the guided start by its own clicks: dune at -4,18, pandanus at -3,17 (${built})`);
}
async function skipGuide(page: Page): Promise<void> {
  await page.waitForFunction(`window.__guideForTest && window.__guideForTest.step() === "1"`, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.locator(".maya-skip:visible").first().click();
  await page.waitForTimeout(800);
  await page.locator(".maya-dismiss:visible").first().click();
  await page.waitForFunction(`window.__guideForTest.step() === "none"`, null, { timeout: 30000 });
  check((await js<number>(page, `window.__panjimForTest.run.buildLog.length`)) === 0, `"Skip the help", then Got it: the guided start ends with nothing built`);
}

/** Maya's lines over a run: the standing line once, after the guide; the Campal sentence once, in 2041; the 2050 warning without it. */
async function checkMaya(page: Page, run: string): Promise<void> {
  const lines = await said(page);
  const standing = lines.filter((l) => l.text === STANDING_LINE);
  check(standing.length === 1, `run ${run}: Maya's standing nature line said once (${standing.map((l) => l.year).join(", ") || "never"})`);
  const campal = lines.filter((l) => l.text.includes(CAMPAL_LINE));
  check(campal.length === 1 && campal[0].year === 2041 && /^On to 2041\./.test(campal[0].text), `run ${run}: the Campal sentence said once, as the 2050 phase begins (${campal.map((l) => `${l.year}: "${l.text}"`).join(" | ") || "never"})`);
  const warning = lines.filter((l) => l.text.includes(WIND_LINE));
  check(warning.every((l) => !l.text.includes(CAMPAL_LINE)), `run ${run}: the 2050 warning (${warning.length ? warning.map((l) => l.year).join(", ") : "not said: no home at risk"}) keeps the wind and has no Campal sentence`);
  for (const l of lines) texts.push(l.text);
  fs.writeFileSync(path.join(OUT, `run${run}-maya-${size()}.txt`), lines.map((l) => `${l.year}  ${l.text}`).join("\n") + "\n");
}

/** The last card: homes, stars, points on the HUD and the server's. */
async function lastCard(page: Page, run: string, name: string): Promise<{ text: string; rows: string[]; hud: number }> {
  const out = await stormCards(page, run, 2050, true);
  // The HUD card's own number (its label holds the total; the count up may still be running).
  await page.waitForTimeout(1500);
  const hud = await js<number>(page, `Number((document.querySelector(".clock-points")?.getAttribute("aria-label") ?? "").replace(/\\D+/g, "") || -1)`);
  log(`run ${run}: HUD points ${hud}; server's (its replay of the build list) ${serverPoints.get(name) ?? "none"}`);
  return { ...out, hud };
}

const textRules = (all: string[]): string[] => {
  const bad: string[] = [];
  for (const t of all) {
    if (/·/.test(t)) bad.push(`middle dot: "${t.slice(0, 80)}"`);
    if (/\s[-–—]\s/.test(t)) bad.push(`spaced dash: "${t.slice(0, 80)}"`);
    if (/[A-Za-z]-[A-Za-z]/.test(t)) bad.push(`hyphen joining words: "${(t.match(/\S*[A-Za-z]-[A-Za-z]\S*/) ?? [""])[0]}"`);
    if (/\bdefence/i.test(t)) bad.push(`"defence": "${t.slice(0, 80)}"`);
    if (/festival|Season 1/i.test(t)) bad.push(`festival or season: "${t.slice(0, 80)}"`);
    if (/\b(fund|grant|money)\b/i.test(t)) bad.push(`money: "${t.slice(0, 80)}"`);
  }
  return [...new Set(bad)];
};

const server = TARGET ? null : await startDevServer(Number(args.get("port") ?? 5261), 120000);
const BASE = TARGET ?? server!.url;
const browser = await chromium.launch({ args: glArgs() });
const url = `${BASE}/?qa=1&tag=FestTesters`;
const results: string[] = [];
try {
  // ---- Run A: the perfect plan ----
  if (RUNS.includes("A")) {
    const name = "qa41_A";
    const { page, stop } = await open(browser, url, true);
    await startFromMenu(page, name, true);
    await skipGuide(page);
    await awaitStandingLine(page, "A");
    const cards: string[] = [];
    for (const [i, a] of PLAN.entries()) {
      const ok = a.action === "repair" ? await js<boolean>(page, `window.__panjimForTest.repair({ q: ${a.q}, r: ${a.r} })`) : await buildByMenu(page, a.q, a.r, a.elementId);
      if (!ok) check(false, `run A ${2026 + i}: ${a.elementId} at ${a.q},${a.r} refused`);
      if (i === 4 || i === 14) cards.push((await stormCards(page, "A", i === 4 ? 2030 : 2040, false)).text);
      await page.locator(".maya-dismiss:visible").click().catch(() => {});
    }
    const last = await lastCard(page, "A", name);
    const outcomes = await js<{ id: string; lost: number; saved: number; total: number; stars: number }[]>(page, `window.__panjimForTest.run.schedule.map((c) => { const o = window.__panjimForTest.run.outcomes.get(c.id); return { id: c.id, lost: o.housesDamaged, saved: o.housesSaved, total: o.housesTotal, stars: o.stars }; })`);
    check(outcomes.every((o) => o.lost === 0) && outcomes.reduce((s, o) => s + o.stars, 0) === 9, `run A: homes lost ${outcomes.map((o) => o.lost).join(", ")}; stars ${outcomes.map((o) => o.stars).join(", ")}`);
    check(/9 of 9 stars/.test(last.text), `run A: the last card says 9 of 9 stars`);
    check(serverPoints.get(name) === last.hud, `run A: the points on the HUD (${last.hud}) equal the server's (${serverPoints.get(name)})`);
    check(last.rows.length > 0 && last.rows[last.rows.length - 1].startsWith("standing_nature: Standing nature"), `run A 2050: "Standing nature" is the last row (${last.rows.join(" | ")})`);
    // The board box: from 1st place down to the player, scrolled to the player's row.
    const box = await js<{ first: string; last: string; me: boolean; scrolled: boolean; hint: string; text: string }>(
      page,
      `(() => { const l = document.querySelector(".finale-rank-rows"); const lis = l ? [...l.querySelectorAll("li")] : []; return { first: lis[0]?.textContent ?? "", last: lis[lis.length - 1]?.textContent ?? "", me: lis[lis.length - 1]?.classList.contains("me") ?? false, scrolled: l ? Math.abs(l.scrollTop + l.clientHeight - l.scrollHeight) <= 2 : false, hint: document.querySelector(".finale-rank-hint")?.textContent ?? "", text: document.querySelector(".finale-rank")?.textContent?.replace(/\\s+/g, " ") ?? "" }; })()`
    );
    check(box.first.startsWith("1") && box.me && box.scrolled && !/festival|season/i.test(box.text), `run A: the board box runs from 1st place ("${box.first}") down to the player ("${box.last}"), scrolled to the player's row, "${box.hint}", no season or festival label`);
    await js(page, `document.querySelector(".finale-rank-rows").scrollTop = 0`);
    await shot(page, "runA-2050-board-box-top", 400);
    texts.push(box.text);
    await checkMaya(page, "A");
    results.push(`A: lost ${outcomes.map((o) => o.lost).join("/")}, saved ${outcomes.map((o) => `${o.saved} of ${o.total}`).join(", ")}, stars ${outcomes.map((o) => o.stars).join("+")}, HUD ${last.hud}, server ${serverPoints.get(name)}`);
    stop();
    await page.context().close();
  }

  // ---- Run B: the seawall player at Campal ----
  if (RUNS.includes("B")) {
    const name = "qa41_B";
    const RUN_ID = "B";
    const { page, stop } = await open(browser, url);
    await startFromMenu(page, name, false);
    await playGuide(page);
    await awaitStandingLine(page, RUN_ID);
    // The plan's builds to the 2040 flood (its first, the pandanus at -3,17, is the guide's; its second is kept).
    const early = PLAN.filter((a) => !(a.q === -3 && a.r === 17)).slice(0, 13);
    for (const [i, a] of early.entries()) {
      const ok = await buildByMenu(page, a.q, a.r, a.elementId);
      if (!ok) check(false, `run B: ${a.elementId} at ${a.q},${a.r} refused`);
      const built = await js<number>(page, `window.__panjimForTest.run.buildLog.length`);
      if (built === 5) await stormCards(page, "B", 2030, false);
      if (built === 15) await stormCards(page, "B", 2040, false);
      void i;
      await page.locator(".maya-dismiss:visible").click().catch(() => {});
    }
    check((await js<number>(page, `window.__panjimForTest.run.year`)) === 2041, "run B: the 2050 phase begins (2041)");
    // The tile menus at Campal: a first sea tile offers Seawall and Breakwater, the tile beyond nothing.
    await openTile(page, 6, 8);
    const first = await js<string[]>(page, `[...document.querySelectorAll(".build-popover .build-card")].map((c) => c.dataset.element)`);
    check(JSON.stringify(first) === '["seawall","breakwater"]', `a first sea tile beside Campal (6,8) offers ${JSON.stringify(first)}`);
    await shot(page, "runB-first-sea-tile-menu", 500);
    const deep = await js<{ q: number; r: number }>(page, `(() => { const s = window.__panjimForTest.run.state; let best = null; for (const t of s.placed.values()) { if (t.terrainId !== "coast" || t.scenery || s.isFirstSea(t.coord) || s.unbuildable.has(t.coord.q + "," + t.coord.r)) continue; const d = (Math.abs(t.coord.q - 6) + Math.abs(t.coord.r - 10) + Math.abs(t.coord.q + t.coord.r - 16)) / 2; if (!best || d < best.d) best = { q: t.coord.q, r: t.coord.r, d }; } return best; })()`);
    await openTile(page, deep.q, deep.r);
    const note = await js<{ cards: number; note: string }>(page, `({ cards: document.querySelectorAll(".build-popover .build-card").length, note: document.querySelector(".build-popover .popover-note")?.textContent ?? "" })`);
    check(note.cards === 0 && note.note === "Nothing can be built out here.", `the tile beyond it (${deep.q},${deep.r}): ${note.cards} cards, "${note.note}"`);
    await shot(page, "runB-deep-sea-tile", 500);
    await page.keyboard.press("Escape");
    // Seawalls on the first water tiles along Campal, pandanus on the sand beside them: ten builds.
    const picks = await js<{ walls: string[]; sand: string[] }>(
      page,
      `(() => { const s = window.__panjimForTest.run.state; const d = (k) => { const [q, r] = k.split(",").map(Number); return (Math.abs(q - 6) + Math.abs(r - 10) + Math.abs(q + r - 16)) / 2; }; const keys = [...s.placed.keys()]; const walls = keys.filter((k) => { const [q, r] = k.split(",").map(Number); return s.isFirstSea({ q, r }) && s.canBuild({ q, r }, "seawall"); }).sort((a, b) => d(a) - d(b)).slice(0, 6); const sand = keys.filter((k) => { const [q, r] = k.split(",").map(Number); return s.placed.get(k).terrainId === "beach" && s.canBuild({ q, r }, "sandy_vegetation"); }).sort((a, b) => d(a) - d(b)).slice(0, 4); return { walls, sand }; })()`
    );
    log(`run B 2041 to 2050: seawalls on ${picks.walls.join(" ")}; pandanus on ${picks.sand.join(" ")}`);
    const order = [...picks.walls.map((k) => [k, "seawall"]), ...picks.sand.map((k) => [k, "sandy_vegetation"])] as [string, string][];
    let atRiskCampal: string[] = [];
    for (const [i, [key, el]] of order.entries()) {
      const [q, r] = key.split(",").map(Number);
      const ok = await buildByMenu(page, q, r, el);
      if (!ok) check(false, `run B: ${el} at ${key} refused`);
      if (el === "seawall" && i === 0) {
        await js(page, `window.__focusTileForTest(${q}, ${r})`);
        await page.waitForTimeout(1500);
        await page.mouse.move(W / 2, H / 2);
        for (let z = 0; z < 5; z++) {
          await page.mouse.wheel(0, -240);
          await page.waitForTimeout(120);
        }
        await shot(page, "runB-seawall-on-the-water", 1200);
        for (let z = 0; z < 5; z++) {
          await page.mouse.wheel(0, 240);
          await page.waitForTimeout(120);
        }
      }
      if (i === order.length - 2) atRiskCampal = await js<string[]>(page, `(() => { const r = window.__panjimForTest.run; const c = r.schedule[2]; return [...r.homesAtRiskKeys(c)].sort(); })()`);
      await page.locator(".maya-dismiss:visible").click().catch(() => {});
    }
    const last = await lastCard(page, "B", name);
    const outcome = await js<{ lost: string[]; saved: number; total: number; stars: number[] }>(page, `(() => { const r = window.__panjimForTest.run; const o = r.outcomes.get(r.schedule[2].id); return { lost: [...o.damagedHouses].sort(), saved: o.housesSaved, total: o.housesTotal, stars: r.schedule.map((c) => r.outcomes.get(c.id).stars) }; })()`);
    check(JSON.stringify(atRiskCampal) === JSON.stringify(outcome.lost), `run B 2050: the model's homes at risk the year before (with nine of the ten builds; the tenth is pandanus) are the homes the storm took: at risk ${atRiskCampal.length} (${atRiskCampal.join(" ")}), lost ${outcome.lost.length} (${outcome.lost.join(" ")})`);
    check(last.rows.some((r) => r.startsWith("seawall: ") && /[1-9]/.test(r)), `run B: "What protected your homes" names the seawalls (${last.rows.join(" | ")})`);
    check(last.rows[last.rows.length - 1]?.startsWith("standing_nature: "), "run B: the Standing nature row is last");
    check(serverPoints.get(name) === last.hud, `run B: HUD points ${last.hud} equal the server's ${serverPoints.get(name)}`);
    const walls = await js<string>(page, `${JSON.stringify(picks.walls)}.map((k) => { const s = window.__panjimForTest.run.state; return k + ":" + s.placed.get(k).terrainId + ":" + (s.elements.get(k)?.elementId ?? "none") + (s.elements.get(k)?.broken ? "(broken)" : ""); }).join(" ")`);
    log(`run B: the seawalls after 2050: ${walls}`);
    await checkMaya(page, "B");
    const run = await js<{ lost: number[]; saved: string[]; stars: number[] }>(page, `(() => { const r = window.__panjimForTest.run; return { lost: r.schedule.map((c) => r.outcomes.get(c.id).housesDamaged), saved: r.schedule.map((c) => r.outcomes.get(c.id).housesSaved + " of " + r.outcomes.get(c.id).housesTotal), stars: r.schedule.map((c) => r.outcomes.get(c.id).stars) }; })()`);
    results.push(`B: lost ${run.lost.join("/")}, saved ${run.saved.join(", ")}, stars ${run.stars.join("+")}, HUD ${last.hud}, server ${serverPoints.get(name)}`);
    stop();
    await page.context().close();
  }

  // ---- Run C: the careless player who removes a standing khazan in 2031 ----
  if (RUNS.includes("C")) {
    const name = "qa41_C";
    const RUN_ID = "C";
    const { page, stop } = await open(browser, url);
    await startFromMenu(page, name, false);
    await playGuide(page);
    await awaitStandingLine(page, RUN_ID);
    const away = async (): Promise<boolean> => {
      const pick = await js<{ q: number; r: number; el: string } | null>(
        page,
        `(() => { const r = window.__panjimForTest.run; const s = r.state; const reach = new Set(); for (const c of r.schedule) if (!r.landed.has(c.id)) for (const k of r.exposureFor(c, true)?.exposure.keys() ?? []) reach.add(k); for (const [k, t] of s.placed) { if (t.scenery || reach.has(k)) continue; const [q, rr] = k.split(",").map(Number); let near = false; for (const k2 of reach) { const [q2, r2] = k2.split(",").map(Number); if ((Math.abs(q - q2) + Math.abs(rr - r2) + Math.abs(q + rr - q2 - r2)) / 2 <= 3) { near = true; break; } } if (near) continue; for (const el of ["mangrove", "khazan", "sandy_vegetation", "dune", "seawall"]) if (s.canBuild({ q, r: rr }, el)) return { q, r: rr, el }; } return null; })()`
      );
      return !!pick && (await buildByMenu(page, pick.q, pick.r, pick.el));
    };
    while ((await js<number>(page, `window.__panjimForTest.run.buildLog.length`)) < 5) {
      if (!(await away())) break;
    }
    await stormCards(page, "C", 2030, false);
    // 2031: the standing khazan at 26,6, through its own card.
    const before = await js<{ year: number; path: number }>(page, `(() => { const r = window.__panjimForTest.run; return { year: r.year, path: r.readinessFor(r.schedule[1]).outcome.housesTotal }; })()`);
    await openTile(page, 26, 6);
    const remove = page.locator(".build-popover button", { hasText: "Demolish (uses this year's build)" });
    check((await remove.count()) === 1, `run C 2031: the standing khazan's card offers "Demolish (uses this year's build)"`);
    await shot(page, "runC-2031-standing-khazan-card", 400);
    await remove.first().click();
    await page.waitForTimeout(1500);
    const confirm = page.locator("button", { hasText: /^(Demolish|Remove|Yes)/ });
    if ((await page.locator(".confirm-dialog:visible, .demolish-confirm:visible").count()) > 0) await confirm.last().click();
    await page.waitForTimeout(1500);
    const after = await js<{ year: number; path: number; there: string }>(page, `(() => { const r = window.__panjimForTest.run; return { year: r.year, path: r.readinessFor(r.schedule[1]).outcome.housesTotal, there: r.state.elements.get("26,6")?.elementId ?? "none" }; })()`);
    check(before.year === 2031 && after.year === 2032 && after.there === "none" && after.path > before.path, `run C: removing the standing khazan cost 2031 (year ${before.year} -> ${after.year}); the 2040 path ${before.path} -> ${after.path} homes`);
    while ((await js<boolean>(page, `!window.__panjimForTest.run.finished`)) && (await js<number>(page, `window.__panjimForTest.run.buildLog.length`)) < 15) {
      if (!(await away())) break;
    }
    const c2040 = await stormCards(page, "C", 2040, false);
    check(c2040.rows.filter((r) => !r.startsWith("standing_nature")).every((r) => !/: \S+ [1-9]/.test(r.replace(/^[^:]+: /, ""))) && (c2040.rows.at(-1) ?? "").startsWith("standing_nature"), `run C 2040: the player's own rows credit no home; Standing nature last (${c2040.rows.join(" | ")})`);
    while ((await js<boolean>(page, `!window.__panjimForTest.run.finished`)) && (await js<number>(page, `window.__panjimForTest.run.buildLog.length`)) < 25) {
      if (!(await away())) break;
    }
    const last = await lastCard(page, "C", name);
    const run = await js<{ lost: number[]; saved: number[]; total: number[]; stars: number[]; homesPts: number[] }>(page, `(() => { const r = window.__panjimForTest.run; return { lost: r.schedule.map((c) => r.outcomes.get(c.id).housesDamaged), saved: r.schedule.map((c) => r.outcomes.get(c.id).housesSaved), total: r.schedule.map((c) => r.outcomes.get(c.id).housesTotal), stars: r.schedule.map((c) => r.outcomes.get(c.id).stars), homesPts: r.schedule.map((c) => r.stormPoints.get(c.id)?.homes.points ?? -1) }; })()`);
    // The guided dune and pandanus are the player's own (2030); from 2031 the player builds only away from the storms.
    check(run.saved[1] === 0 && run.homesPts[1] === 0, `run C: homes saved ${run.saved.join(", ")} of ${run.total.join(", ")}, home points ${run.homesPts.join(", ")}: in 2040, with only the standing nature doing any work, nothing saved and no home points`);
    check(serverPoints.get(name) === last.hud, `run C: HUD points ${last.hud} equal the server's ${serverPoints.get(name)}`);
    await checkMaya(page, "C");
    results.push(`C: lost ${run.lost.join("/")}, saved ${run.saved.map((s, i) => `${s} of ${run.total[i]}`).join(", ")}, stars ${run.stars.join("+")}, HUD ${last.hud}, server ${serverPoints.get(name)}`);
    stop();
    await page.context().close();
  }

  // ---- axe ----
  for (const [w, h] of AXE) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
    });
    await context.route("**/api/**", async (route) => {
      const at = new URL(route.request().url());
      // The same answers as the runs: the real handlers on the in memory board (a tagged post gets "Test session").
      let sent: Record<string, unknown> = {};
      try {
        sent = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      } catch {
        sent = {};
      }
      if (route.request().method() !== "GET") posts.push(`${route.request().method()} ${at.pathname}${typeof sent.tag === "string" ? ` tag=${sent.tag}` : " NO TAG"}`);
      const reply =
        at.pathname === "/api/board" && route.request().method() === "GET"
          ? await getBoard(ctx(), Object.fromEntries(at.searchParams))
          : at.pathname === "/api/board" && route.request().method() === "POST"
            ? await postBoard(ctx(), sent)
            : { status: 200, body: { saved: true } };
      return route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
    });
    const axe = async (where: string): Promise<void> => {
      await page.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") });
      const found = await js<{ id: string; impact: string; nodes: number }[]>(page, `axe.run(document, { resultTypes: ["violations"] }).then((r) => r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })))`);
      check(found.length === 0, `axe ${w}x${h} ${where}: ${found.length ? found.map((v) => `${v.id} (${v.impact}, ${v.nodes})`).join(", ") : "no serious or critical"}`);
    };
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".menu-quote", { timeout: 90000 });
    await axe("menu");
    await page.click(".menu-actions .btn-primary");
    await page.waitForSelector(".name-card-field", { state: "visible", timeout: 120000 });
    await page.waitForTimeout(1200);
    await axe("name card");
    await page.locator(".name-card-field").fill("qa41_axe");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".brief-cta", { state: "attached", timeout: 120000 });
    await axe("How to play");
    await letsPlay(page);
    await page.waitForFunction(`window.__guideForTest && window.__guideForTest.step() === "1"`, null, { timeout: 60000 });
    await page.waitForTimeout(2000);
    await axe("the game, the guided start up");
    await js(page, `window.__guideForTest.skip()`);
    await page.waitForTimeout(800);
    await page.locator(".maya-dismiss:visible").first().click().catch(() => {});
    // The game's own scenarios: the next storm hurried through to its result cards, then the whole run to the last card.
    await js(page, `window.__panjimScenarioForTest("to-results")`);
    await page.waitForSelector(".result-cards:not([hidden]) .result-card-body", { timeout: 120000 });
    await page.waitForTimeout(1500);
    await axe("a result card");
    for (let n = 0; n < 8 && (await page.locator(".result-cards:not([hidden]) .result-next").count()) > 0; n++) {
      await page.locator(".result-cards:not([hidden]) .result-next").first().click();
      await page.waitForTimeout(1000);
    }
    await js(page, `window.__panjimScenarioForTest("finale")`);
    await page.waitForSelector(".result-cards:not([hidden]) .last-card", { timeout: 300000 });
    await page.waitForTimeout(2500);
    await axe("the last card");
    await context.close();
  }
} catch (e) {
  check(false, `stopped: ${String(e)}`);
} finally {
  await browser.close();
  server?.stop();
}
for (const r of results) log(`RESULT ${r}`);
const bad = textRules(texts.filter(Boolean));
check(bad.length === 0, `every player text read against the rules (${texts.length} texts)${bad.length ? `: ${bad.slice(0, 8).join("; ")}` : ""}`);
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 4).join(" | ")}` : ""}`);
check(posts.every((p) => p.includes("tag=FestTesters")), `every post carried the test tag (${posts.length}: ${[...new Set(posts)].join(", ")})`);
log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
fs.writeFileSync(path.join(OUT, `full416-${RUNS.join("") || "axe"}-${size()}.log`), report.join("\n") + "\n");
process.exit(failures === 0 ? 0 : 1);
