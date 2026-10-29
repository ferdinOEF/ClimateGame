/**
 * Section 38.6: the browser pass for the last result card, on the dev server (`?qa=1&noname=1`, `/api` stubbed).
 *
 *   1. 38.2: the whole run to its last card: every element on screen and nothing clipped. Screenshot.
 *   2. 38.1 on the last card: card 2 from its link, Back returns.
 *   3. 38.2: four stars tapped (one a row), a name typed, Submit turning into "Thank you." with the place. Screenshot.
 *   4. 38.2: View map (the card closes, the board shows) and "Back to your result" (the stars still on). Screenshot.
 *   5. 38.3: a fresh run to its last card, Exit without a Submit: the nudge, once; Exit anyway reaches the menu.
 *      Screenshot.
 *   6. 38.1: the 2030 storm's card 1 with its link and its new main button; the link opens card 2, Back returns.
 *      Screenshot.
 *   7. 38.4b: a tagged run (`?tag=FestTesters`): the chip on the name card (screenshot); the run, board and feedback
 *      posts carry the tag, the board's reply has no rank, and the card says so.
 *
 * The mouse moves through the scripted runs, or the idle reset would fire.
 *
 * Usage: npx tsx tools/section38Shots.ts [w=1366] [h=768] [out=docs/qa/section38] [only=card] [port=5239]
 * `only=card` runs step 1 alone (the 1920x1080 pass). Exits 1 on a console error or a failed check.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section38");
const ONLY = args.get("only") ?? "";
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  console.log(`shot ${name}`);
};
const textOf = (page: Page, selector: string): Promise<string> => js<string>(page, `document.querySelector(${JSON.stringify(selector)})?.textContent?.replace(/\\s+/g, " ").trim() ?? ""`);

/** What the stubbed API was sent: method, path and body, in order. */
interface Sent {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

/** The board's answers, stubbed: a named post lands 2nd between two test names; a tagged post gets no rank. */
async function stubApi(page: Page, sent: Sent[]): Promise<void> {
  await page.context().route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let posted: Record<string, unknown> = {};
    try {
      posted = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
    } catch {
      posted = {};
    }
    sent.push({ method: req.method(), path: url.pathname, body: posted });
    let body: Record<string, unknown> = {};
    if (url.pathname === "/api/board" && req.method() === "POST") {
      const name = (posted.name as string | undefined) ?? "QA";
      body = typeof posted.tag === "string"
        ? { season: "QA", tagged: true, points: 4000, name, editToken: "" }
        : { season: "QA", rank: 2, points: 4000, tenth: null, above: [{ rank: 1, name: "Test Ana", points: 4300, stars: 7, season: "QA" }], below: [{ rank: 3, name: "Test Rui", points: 3900, stars: 6, season: "QA" }], editToken: "qa-token-0123456789abcdef", name };
    } else if (url.pathname === "/api/board") body = url.searchParams.has("points") ? { season: "QA", rank: 5, points: Number(url.searchParams.get("points")), tenth: null, above: [{ rank: 4, name: "Test Zoe", points: 4100, stars: 6, season: "QA" }], below: [] } : { season: "QA", rows: [{ rank: 1, name: "Test Ana", points: 4300, stars: 7, season: "QA" }] };
    else body = { saved: true };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function open(browser: Browser, url: string): Promise<{ page: Page; sent: Sent[]; stop: () => void }> {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  const sent: Sent[] = [];
  await stubApi(page, sent);
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  let x = 0;
  const wiggle = setInterval(() => void page.mouse.move(W / 2 + (x++ % 2) * 6, H - 40).catch(() => {}), 20000);
  return { page, sent, stop: () => clearInterval(wiggle) };
}

/** Starts Play Panjim past its start popup (the name card first when `name` is given), and plays to the last card. */
async function toLastCard(page: Page, name: string | null): Promise<void> {
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  if (name !== null) {
    await page.waitForSelector(".name-card-field", { state: "visible", timeout: 60000 });
    if (name) {
      await page.locator(".name-card-field").fill(name);
      await page.keyboard.press("Enter");
    } else await page.locator(".name-card-skip").click();
  }
  await page.waitForSelector(".brief-cta", { state: "visible", timeout: 60000 });
  await page.waitForTimeout(800);
  await page.locator(".brief-cta").click();
  await page.waitForTimeout(1500);
  check(await js<boolean>(page, `window.__panjimScenarioForTest("finale")`), "the run plays on to its last card");
  await page.waitForSelector(".result-cards:not([hidden]) .last-card", { timeout: 60000 });
  await page.waitForTimeout(4000);
}

/** The card's rectangle and whether it clips (scrolls) or runs off the screen, with every named part on screen. */
async function cardFit(page: Page): Promise<{ w: number; h: number; clipped: boolean; off: string[]; missing: string[] }> {
  return js(
    page,
    `(() => {
      const card = document.querySelector(".result-cards:not([hidden]) .result-card");
      const r = card.getBoundingClientRect();
      const parts = [".last-head", ".last-title", ".last-homes .result-detail-link", ".result-points", ".last-total", ".last-rows", ".finale-clear", ".last-rank", ".fb-title", ".fb-line", ".fb-questions", ".fb-scale-ends", ".fb-remember-field", ".fb-age", ".fb-submit", ".last-action[data-action=map]", ".last-action[data-action=restart]", ".last-action[data-action=exit]"];
      const off = [];
      const missing = [];
      for (const sel of parts) {
        const el = card.querySelector(sel);
        if (!el) { missing.push(sel); continue; }
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0 || b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth) off.push(sel);
      }
      return { w: Math.round(r.width), h: Math.round(r.height), clipped: card.scrollHeight > card.clientHeight + 1, off, missing };
    })()`
  );
}

const server = await startDevServer(Number(args.get("port") ?? 5239), 120000);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
try {
  // 1 to 4: a run without a name to its last card.
  {
    const { page, sent, stop } = await open(browser, `${server.url}/?qa=1&noname=1#/play/l01-first-rains`);
    await toLastCard(page, null);
    const fit = await cardFit(page);
    check(!fit.clipped && fit.off.length === 0 && fit.missing.length === 0, `38.2: the last card (${fit.w}x${fit.h}) with every element on screen and nothing clipped${fit.off.length ? `; off: ${fit.off.join(", ")}` : ""}${fit.missing.length ? `; missing: ${fit.missing.join(", ")}` : ""}`);
    const head = await textOf(page, ".last-head");
    check(/CYCLONE AND FLOOD IN 2050/i.test(head) && /THE LAST STORM/i.test(head), `the header row: ${head}`);
    const rankNote = await textOf(page, ".last-rank .finale-rank-note");
    check(/With a name, this run would be 5th on the board\. Add one on the right\./.test(rankNote), `the board box without a name: ${rankNote}`);
    const rows = await js<number[]>(page, `[...document.querySelectorAll(".last-rows li b")].map((b) => Number(b.textContent))`);
    const total = await js<number>(page, `Number(document.querySelector(".last-total b").textContent)`);
    check(rows.length === 4 && rows.reduce((a, b) => a + b, 0) === total, `the four rows (${rows.join(" + ")}) add up to the total (${total})`);
    check(sent.some((s) => s.path === "/api/run" && s.method === "POST"), "the run is reported as the card opens");
    await shot(page, "1-last-card");
    if (ONLY === "card") {
      stop();
      await page.context().close();
    } else {
      // 2. Card 2 from its link, and Back.
      await page.locator(".last-card .result-detail-link").click();
      // Software GL draws about a frame a second: the shot waits for the card to paint.
      await page.waitForTimeout(2000);
      const card2 = await textOf(page, ".result-cards:not([hidden]) .result-title");
      const backOnly = await js<string[]>(page, `[...document.querySelectorAll(".result-cards:not([hidden]) .result-actions button")].map((b) => b.textContent)`);
      check(card2 === "What protected your homes" && backOnly.join("|") === "Back", `38.1: the link opens card 2 (${card2}); its only button is Back (${backOnly.join(", ")})`);
      await shot(page, "2-card-2-from-last");
      await page.locator(".result-detail-back").click();
      await page.waitForTimeout(600);
      check((await js<boolean>(page, `!!document.querySelector(".result-cards:not([hidden]) .last-card")`)), "Back returns to the last card");

      // 3. Four stars (star 4 on each row), a name, Submit.
      for (const key of ["q1", "q2", "q3", "q4"]) await page.locator(`.fb-row[data-question="${key}"] .fb-star[data-value="4"]`).click();
      const on = await js<number>(page, `document.querySelectorAll(".fb-star.on").length`);
      check(on === 16, `a tap on star 4 fills 1 to 4 on each row (${on} filled)`);
      await page.locator('.fb-age-box input[value="18_30"]').check();
      await page.locator('.fb-age-box input[value="31_plus"]').check();
      const ages = await js<string[]>(page, `[...document.querySelectorAll('input[name="age"]:checked')].map((i) => i.value)`);
      check(ages.join(",") === "31_plus", `one age box at a time (${ages.join(",")})`);
      await page.locator(".fb-remember-field").fill("The mangroves at Chimbel");
      await page.locator(".fb-name-field").fill("QA Tester");
      await page.locator(".fb-submit").click();
      await page.waitForSelector(".fb-thanks", { timeout: 30000 });
      await page.waitForFunction(`/board/.test(document.querySelector(".fb-thanks")?.textContent ?? "")`, undefined, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(800);
      const thanks = await textOf(page, ".fb-thanks");
      check(thanks === "Thank you. You’re 2nd on the board.", `Submit turns into the line in place: ${thanks}`);
      const feedback = sent.find((s) => s.path === "/api/feedback");
      check(!!feedback && JSON.stringify(feedback.body.answers) === JSON.stringify({ q1: 4, q2: 4, q3: 4, q4: 4, remember: "The mangroves at Chimbel", age: "31_plus" }) && !("name" in (feedback.body as object)), `the answers posted without a name: ${JSON.stringify(feedback?.body.answers)}`);
      check(sent.filter((s) => s.path === "/api/board" && s.method === "POST").length === 1, "the name goes on the board once");
      const rankHead = await textOf(page, ".last-rank .finale-rank-head");
      check(rankHead === "2nd on the board", `the board box shows the place: ${rankHead}`);
      await shot(page, "3-submitted");

      // 4. View map, then Back to your result.
      await page.locator('.last-action[data-action="map"]').click();
      await page.waitForTimeout(800);
      const mapState = await js<{ cards: boolean; back: boolean }>(page, `({ cards: !!document.querySelector(".result-cards:not([hidden])"), back: !!document.querySelector(".result-return") })`);
      check(!mapState.cards && mapState.back, `View map closes the card and shows Back to your result (cards ${mapState.cards}, button ${mapState.back})`);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(600);
      await shot(page, "4-view-map");
      await page.locator(".result-return").click();
      await page.waitForTimeout(800);
      const kept = await js<{ card: boolean; on: number; thanks: string; back: boolean }>(page, `({ card: !!document.querySelector(".result-cards:not([hidden]) .last-card"), on: document.querySelectorAll(".fb-star.on").length, thanks: document.querySelector(".fb-thanks")?.textContent ?? "", back: !!document.querySelector(".result-return") })`);
      check(kept.card && kept.on === 16 && /Thank you/.test(kept.thanks) && !kept.back, `Back to your result brings the card back with its answers kept (${kept.on} stars, "${kept.thanks}")`);
      // Exit after a Submit: no nudge.
      await page.locator('.last-action[data-action="exit"]').click();
      await page.waitForTimeout(1500);
      check(!(await js<boolean>(page, `!!document.querySelector(".result-nudge")`)), "38.3: no nudge after a Submit");
      await page.waitForSelector(".menu-card, .menu", { timeout: 30000 }).catch(() => {});
      check(await js<boolean>(page, `location.hash === "" || location.hash === "#/"`), `Exit reaches the menu (${await js<string>(page, "location.hash")})`);
      stop();
      await page.context().close();
    }
  }

  if (ONLY !== "card") {
    // 5. A fresh run, Exit without a Submit: the nudge, once.
    {
      const { page, sent, stop } = await open(browser, `${server.url}/?qa=1&noname=1#/play/l01-first-rains`);
      await toLastCard(page, null);
      await page.locator('.last-action[data-action="map"]').click();
      await page.waitForTimeout(2000);
      const nudge = await js<{ up: boolean; title: string; line: string; buttons: string[] }>(page, `(() => { const n = document.querySelector(".result-nudge"); return { up: !!n, title: n?.querySelector(".result-nudge-title")?.textContent ?? "", line: n?.querySelector(".result-nudge-line")?.textContent ?? "", buttons: [...(n?.querySelectorAll("button") ?? [])].map((b) => b.textContent) }; })()`);
      check(nudge.up && nudge.title === "Before you go, five taps?" && nudge.buttons.join("|") === "Answer now|View map anyway", `38.3: the nudge on View map: ${nudge.title}; ${nudge.buttons.join(", ")}`);
      await shot(page, "5-nudge");
      await page.locator(".result-nudge-answer").click();
      await page.waitForTimeout(400);
      const focused = await js<string>(page, `document.activeElement?.className ?? ""`);
      check(!(await js<boolean>(page, `!!document.querySelector(".result-nudge")`)) && /fb-star/.test(focused), `Answer now closes the box and focuses the first star row (${focused})`);
      await page.locator('.last-action[data-action="exit"]').click();
      await page.waitForTimeout(600);
      check(!(await js<boolean>(page, `!!document.querySelector(".result-nudge")`)), "the nudge is never shown twice in a run");
      await page.waitForTimeout(1200);
      const left = sent.filter((s) => s.path === "/api/feedback");
      check(left.length === 1 && (left[0].body.answers as Record<string, unknown>).nudge === "shown_left" && typeof (left[0].body.answers as Record<string, unknown>).cardSeconds === "number", `leaving posts the empty form with the nudge's outcome: ${JSON.stringify(left[0]?.body.answers)}`);
      stop();
      await page.context().close();
    }

    // 6. The 2030 storm's card 1.
    {
      const { page, stop } = await open(browser, `${server.url}/?qa=1&noname=1#/play/l01-first-rains`);
      await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
      await page.waitForSelector(".brief-cta", { state: "visible", timeout: 60000 });
      await page.waitForTimeout(800);
      await page.locator(".brief-cta").click();
      await page.waitForTimeout(1500);
      check(await js<boolean>(page, `window.__panjimScenarioForTest("smart-aftermath")`), "the run plays to the 2030 storm's card 1");
      await page.waitForSelector(".result-cards:not([hidden]) .result-card-body", { timeout: 60000 });
      await page.waitForTimeout(2500);
      const link = await textOf(page, ".result-cards:not([hidden]) .result-detail-link");
      const main = await textOf(page, ".result-cards:not([hidden]) .result-next");
      const retry = await textOf(page, ".result-cards:not([hidden]) .result-retry");
      check(link === "What protected your homes" && main === "Next: the flood in 2040" && retry === "Try again from 2026", `38.1: card 1's link (${link}), main button (${main}) and retry (${retry})`);
      const linkUnderBar = await js<boolean>(page, `(() => { const bar = document.querySelector(".result-cards:not([hidden]) .result-homes"); const link = document.querySelector(".result-cards:not([hidden]) .result-detail-link"); return !!bar && !!link && link.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom - 1; })()`);
      check(linkUnderBar, "the link sits under the homes saved bar");
      await shot(page, "6-card-1-2030");
      await page.locator(".result-cards:not([hidden]) .result-detail-link").click();
      await page.waitForTimeout(600);
      const title2 = await textOf(page, ".result-cards:not([hidden]) .result-title");
      const buttons2 = await js<string[]>(page, `[...document.querySelectorAll(".result-cards:not([hidden]) .result-actions button")].map((b) => b.textContent)`);
      check(title2 === "What protected your homes" && buttons2.join("|") === "Back", `card 2 from the link, Back its only button (${buttons2.join(", ")})`);
      await page.locator(".result-detail-back").click();
      await page.waitForTimeout(600);
      check((await textOf(page, ".result-cards:not([hidden]) .result-next")) === "Next: the flood in 2040", "Back returns to card 1");
      await page.locator(".result-cards:not([hidden]) .result-next").click();
      await page.waitForTimeout(800);
      const outlook = await textOf(page, ".result-cards:not([hidden]) .result-eyebrow");
      check(/Coming up/i.test(outlook), `then the outlook card (${outlook})`);
      stop();
      await page.context().close();
    }

    // 7. A tagged run.
    {
      const { page, sent, stop } = await open(browser, `${server.url}/?qa=1&tag=FestTesters#/play/l01-first-rains`);
      await page.waitForSelector(".name-card-field", { state: "visible", timeout: 120000 });
      await page.waitForTimeout(1500);
      const chip = await textOf(page, ".name-card-tag");
      check(chip === "Test session: FestTesters. Not on the board.", `38.4b: the chip on the name card: ${chip}`);
      const top = await textOf(page, ".name-card-top-rows");
      check(/Test Ana/.test(top), `the Top 10 still shows the real board (${top})`);
      await shot(page, "7-name-card-tagged");
      await toLastCard(page, "QA Tagged");
      const tagNote = await textOf(page, ".last-rank");
      check(/Test session: not on the board\./.test(tagNote), `a tagged run's board box: ${tagNote}`);
      for (const key of ["q1"]) await page.locator(`.fb-row[data-question="${key}"] .fb-star[data-value="5"]`).click();
      await page.locator(".fb-submit").click();
      await page.waitForSelector(".fb-thanks", { timeout: 30000 });
      await page.waitForTimeout(500);
      const posts = sent.filter((s) => s.method === "POST");
      const tagged = posts.filter((s) => s.body.tag === "FestTesters").map((s) => s.path);
      check(posts.length > 0 && posts.every((s) => s.body.tag === "FestTesters") && tagged.includes("/api/board") && tagged.includes("/api/feedback"), `every post carries the tag: ${posts.map((s) => `${s.path}=${s.body.tag}`).join(", ")}`);
      check((await textOf(page, ".fb-thanks")) === "Thank you.", "a tagged Submit says Thank you without a place");
      stop();
      await page.context().close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
process.exit(failures === 0 ? 0 : 1);
