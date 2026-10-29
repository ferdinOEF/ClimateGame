/**
 * Section 35.7: the one browser pass of Section 35 (Section 35.8: the finale cleared, by the best plan, and not cleared), on the production build (`vite preview`, `?qa=1`), at 1366x768:
 * six screenshots to docs/qa/section35/ (the name card with a top 10, the HUD card after the 2030 storm with its
 * Points box, result card 1 with its chips, the finale card with a name and its rank box, the feedback form, the
 * thank you line), and three checks: the name is gone after a reload; nothing new in localStorage or sessionStorage;
 * the server's points for the run equal the total the finale shows.
 *
 * `/api/*` is answered in the page by the real server handlers (server/handlers.ts) on an in memory Postgres
 * (pg-mem, db/schema.sql) seeded with twelve test rows, so the board post replays the run's builds exactly as Vercel
 * would. Scenario hooks jump through the run (no full play through by hand).
 *
 * Usage: npx tsx tools/section35Shots.ts [out=docs/qa/section35] [url=http://localhost:4173]
 * Exits 1 on a console error or a failed check.
 */
import { chromium, type Page, type Route } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { killTree } from "./devServer";
import { memoryDb } from "../tests/helpers/memoryDb";
import { getBoard, patchBoard, postBoard, postFeedback, postRun, type Ctx, type Reply } from "../server/handlers";
import { PANJIM_POINTS_MODEL } from "../src/levels/panjimRun";
import { KEYS_STILL_USED } from "../src/services/storagePolicy";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const OUT = path.resolve(args.get("out") ?? "docs/qa/section35");
fs.mkdirSync(OUT, { recursive: true });
const [W, H] = [1366, 768];
const gpu = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

async function startPreview(): Promise<{ url: string; child: ChildProcess | null }> {
  if (args.get("url")) return { url: args.get("url")!, child: null };
  if (!fs.existsSync("dist/index.html")) throw new Error("no dist/: run npm run build first");
  const port = await freePort();
  const child = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore", detached: true });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    if (await fetch(url).then((r) => r.ok).catch(() => false)) return { url, child };
    await new Promise((r) => setTimeout(r, 500));
  }
  killTree(child);
  throw new Error(`vite preview did not answer on ${url}`);
}

let failures = 0;
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];

// ---- the server, in memory -----------------------------------------------------------------------------------------
const db = memoryDb();
await db.apply();
for (let i = 0; i < 12; i++) {
  await db.query("INSERT INTO board (id, season, name, points, stars, edit_token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    "Festival 2026",
    `Test player ${i + 1}`,
    5200 - i * 260,
    7,
    `qa-token-${i}-abcdefghijklmnop`,
    "2026-11-01T09:00:00Z"
  ]);
}
const posts: { path: string; method: string; body: Record<string, unknown> }[] = [];
const replies: { path: string; reply: Reply }[] = [];
async function serve(route: Route): Promise<void> {
  const t0 = Date.now();
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const body = (request.postData() ? JSON.parse(request.postData()!) : {}) as Record<string, unknown>;
  const ctx: Ctx = { sql: db, env: { BOARD_SEASON: "Festival 2026", RATE_SALT: "qa" }, ip: "127.0.0.1", now: new Date(), model: PANJIM_POINTS_MODEL };
  if (method !== "GET") posts.push({ path: url.pathname, method, body });
  let reply: Reply;
  if (url.pathname === "/api/board") reply = method === "GET" ? await getBoard(ctx, Object.fromEntries(url.searchParams)) : method === "POST" ? await postBoard(ctx, body) : await patchBoard(ctx, body);
  else if (url.pathname === "/api/run") reply = await postRun(ctx, body);
  else if (url.pathname === "/api/feedback") reply = await postFeedback(ctx, body);
  else reply = { status: 404, body: { error: "no route" } };
  replies.push({ path: `${method} ${url.pathname}`, reply });
  console.log(`  api ${method} ${url.pathname}${url.search}: ${reply.status} in ${Date.now() - t0} ms`);
  await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
}

// ---- the pass ------------------------------------------------------------------------------------------------------
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const scenario = (page: Page, name: string): Promise<boolean> => js<boolean>(page, `window.__panjimScenarioForTest(${JSON.stringify(name)})`);
/**
 * Section 35.8: plays `actions` (the best plan's builds) through the game's own build path, hurrying each storm and
 * pressing through its cards as a player would; with `stopAtCards`, stops with the last storm's result cards open,
 * else at the finale card. Returns "ok" or why it stopped.
 */
// A plain string, not a function: tsx would add its `__name` helper to a function, and the page has none.
const PLAY_PLAN = `async ({ actions, stopAtCards }) => {
  const c = window.__panjimForTest;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cardsOpen = () => !!document.querySelector(".result-cards:not([hidden]) .result-next");
  const settle = async (pressCards) => {
    for (let i = 0; i < 3000; i++) {
      if (c.atFinalCard()) return;
      if (cardsOpen()) {
        if (!pressCards) return;
        document.querySelector(".result-cards:not([hidden]) .result-next").click();
        await wait(300);
        continue;
      }
      if (c.isBusy) {
        document.dispatchEvent(new PointerEvent("pointerdown"));
        await wait(200);
        continue;
      }
      if (c.maya.speaking) c.maya.dismiss();
      return;
    }
  };
  for (const a of actions) {
    await settle(true);
    if (!c.build({ q: a.q, r: a.r }, a.elementId)) return "refused " + a.elementId + " at " + a.q + "," + a.r;
    await wait(150);
  }
  for (let i = 0; i < 600; i++) {
    if (stopAtCards ? cardsOpen() : c.atFinalCard()) return "ok";
    await settle(!stopAtCards);
    await wait(200);
  }
  return "timed out";
}`;
const playPlan = (page: Page, actions: { elementId: string; q: number; r: number }[], stopAtCards: boolean): Promise<string> =>
  js<string>(page, `(${PLAY_PLAN})(${JSON.stringify({ actions: actions.map(({ elementId, q, r }) => ({ elementId, q, r })), stopAtCards })})`);
const BEST = (JSON.parse(fs.readFileSync("docs/qa/section34c/best_plan.json", "utf8")) as { goal1: { actions: { elementId: string; q: number; r: number }[] } }).goal1.actions;

const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  console.log(`shot ${name}`);
};

const { url, child } = await startPreview();
// The sandbox's Chromium when the pinned Playwright's own is missing (Section 35.7 ran in one).
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: gpu, ...(executablePath ? { executablePath } : {}) });
try {
  // Playwright's routing does not see requests a service worker handles: the worker is off in this pass.
  const context = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: "block" });
  await context.route("**/api/**", serve);
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  await js(page, "(() => { localStorage.clear(); sessionStorage.clear(); })()");
  const game = `${url}/?qa=1#/play/l01-first-rains`;
  await page.goto(game, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });

  // 1. The name card with the top 10.
  await page.waitForSelector(".name-card .name-card-top-rows li", { timeout: 20000 }).catch(async (e: Error) => {
    console.log(`direct fetch: ${await js(page, `fetch("/api/board", { headers: { "content-type": "application/json" } }).then(async (r) => r.status + " " + (await r.text()).slice(0, 80)).catch((e) => "error " + e)`)}`);
    console.log(`name card: ${await page.locator(".name-card").textContent().catch(() => "none")}; replies ${JSON.stringify(replies).slice(0, 300)}; errors ${errors.join(" | ")}`);
    throw e;
  });
  await page.waitForTimeout(800);
  check((await page.locator(".name-card-top-rows li").count()) === 10, "the name card shows a top 10");
  check(await page.locator(".name-card-field").evaluate((el) => el === document.activeElement), "the name field has focus");
  check((await page.locator(".brief-card").isVisible()) === false, "the start popup waits behind the name card");
  await shot(page, "1-name-card");

  // Enter in the field is Play.
  await page.locator(".name-card-field").fill("test_oef");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".brief-cta", { state: "visible", timeout: 10000 });
  check((await page.locator(".name-card").count()) === 0, "Enter in the field plays: the name card closes, the start popup opens");
  await page.locator(".brief-cta").click();
  await page.waitForTimeout(2000);
  await js(page, "window.__panjimForTest.maya.dismiss()");

  // 3. Result card 1 with its chips (the 2030 cyclone), the best plan's first five builds (tools/bestPlan, 9 of 9).
  const first = await playPlan(page, BEST.slice(0, 5), true);
  check(first === "ok", `the best plan's first five builds bring the 2030 storm to its result cards (${first})`);
  await page.waitForTimeout(1500);
  const chips = await page.locator(".result-points-chip").allTextContents();
  check(chips.length > 0, `card 1 shows its points chips: ${chips.join(" | ")}`);
  await shot(page, "3-result-card-1");

  // 2. The HUD card after the 2030 storm, the cards closed: the Points box.
  for (let i = 0; i < 4 && (await page.locator(".result-cards:not([hidden])").count()) > 0; i++) {
    await page.locator(".result-next").click();
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1500);
  await js(page, "window.__panjimForTest.maya.dismiss()");
  const hudPoints = await page.locator(".clock-points-count").textContent();
  check(Number(hudPoints) > 0, `the HUD card's Points box reads ${hudPoints} after the 2030 storm`);
  const card = await page.locator(".panjim-clock").boundingBox();
  check(!!card && Math.round(card.width) === 300, `the HUD card stays 300 px wide (${card?.width})`);
  await shot(page, "2-hud-points");

  // 4. The finale card with the name and its rank box: the best plan to 2050, a cleared run.
  const rest = await playPlan(page, BEST.slice(5), false);
  check(rest === "ok", `the best plan plays on to its finale card (${rest})`);
  await page.waitForSelector(".finale-rank-rows li.me", { timeout: 60000 });
  await page.waitForTimeout(3500);
  const title = await page.locator(".finale-main .result-title").textContent();
  check(title === "Panjim held, test_oef." && (await page.locator(".finale-clear .result-clear.cleared").count()) === 1, `a cleared run's finale: ${title}`);
  const shown = Number(await page.locator(".finale-total b").textContent());
  const boardPost = posts.find((p) => p.path === "/api/board" && p.method === "POST");
  check(!!boardPost && !("points" in boardPost.body) && Array.isArray(boardPost.body.builds) && boardPost.body.name === "test_oef", "the board post sends the run id, the name and the builds, never a score");
  const boardReply = replies.find((r) => r.path === "POST /api/board")?.reply;
  check(boardReply?.body.points === shown, `the server's replay counts ${boardReply?.body.points}, the finale shows ${shown}`);
  const runRows = await db.query<Record<string, unknown>>("SELECT * FROM runs");
  check(runRows.length === 1 && runRows[0].finished === true && !JSON.stringify(runRows[0]).includes("test_oef"), "the run is saved finished, without its name");
  await shot(page, "4-finale-named");

  // 5. The feedback form.
  await page.locator(".result-next", { hasText: "Your feedback" }).click();
  await page.waitForSelector(".feedback-form", { timeout: 5000 });
  // The card's 220 ms fade takes seconds of frames in software GL.
  await page.waitForTimeout(3500);
  check((await page.locator('.feedback-form input[name="name"]').inputValue()) === "test_oef", "the form's name field holds the run's name");
  await shot(page, "5-feedback-form");

  // 6. Answer a few, submit: the thank you line on the finale's buttons row.
  await page.locator('.feedback-form input[name="s1_before"][value="2"]').check({ force: true });
  await page.locator('.feedback-form input[name="s1_now"][value="4"]').check({ force: true });
  await page.locator('.feedback-form input[name="s2_feeling"][value="Hopeful"]').check({ force: true });
  await page.locator('.feedback-form input[name="s4_enjoy"][value="5"]').check({ force: true });
  await page.locator('.feedback-form input[name="s5_actions"][value="Visit a mangrove or a khazan"]').check({ force: true });
  await page.locator('.feedback-form textarea[name="s6_remember"]').fill("Mangroves hold the river back.");
  await page.locator(".result-next", { hasText: "Submit feedback" }).click();
  await page.waitForSelector(".result-note", { timeout: 10000 });
  await page.waitForTimeout(3500);
  const feedback = posts.find((p) => p.path === "/api/feedback");
  const sent = feedback?.body.answers as Record<string, unknown> | undefined;
  check(!!sent && Object.keys(sent).sort().join(",") === "s1_before,s1_now,s2_feeling,s4_enjoy,s5_actions,s6_remember" && !("name" in feedback!.body), `the form posts only the answered items: ${sent ? Object.keys(sent).join(", ") : "none"}`);
  check(!posts.some((p) => p.method === "PATCH"), "no rename when the name did not change");
  check((await page.locator(".result-note").textContent()) === "Thank you.", "the thank you line");
  await shot(page, "6-thank-you");

  // Nothing new on the machine: only the preference keys the game already kept.
  const stored = await js<{ local: string[]; session: string[]; values: string }>(page, "(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), values: JSON.stringify({ ...localStorage, ...sessionStorage }) }))()");
  check(stored.local.every((k) => k in KEYS_STILL_USED), `localStorage holds preferences only: ${stored.local.join(", ") || "nothing"}`);
  check(stored.session.length === 0, `sessionStorage is empty: ${stored.session.join(", ") || "nothing"}`);
  check(!/test_oef|runId|editToken/.test(stored.values), "no name, run id or edit token in storage");

  // The name is gone after a reload.
  await page.goto(game, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".name-card-field", { timeout: 120000 });
  check((await page.locator(".name-card-field").inputValue()) === "", "after a reload the name field is empty");

  // 4b. Section 35.8: a run that is not cleared: "Panjim made it to 2050, {name}." (the smart hook: 3 of 9 stars).
  await page.waitForSelector(".name-card .name-card-top-rows li", { timeout: 20000 });
  await page.locator(".name-card-field").fill("test_oef_2");
  await page.locator(".name-card-play").click();
  await page.waitForSelector(".brief-cta", { state: "visible", timeout: 10000 });
  await page.locator(".brief-cta").click();
  await page.waitForTimeout(2000);
  await js(page, "window.__panjimForTest.maya.dismiss()");
  check(await scenario(page, "smart-finale"), "a second run plays to its finale card");
  await page.waitForSelector(".finale-rank-rows li.me", { timeout: 60000 });
  await page.waitForTimeout(3500);
  const notCleared = await page.locator(".finale-main .result-title").textContent();
  check(notCleared === "Panjim made it to 2050, test_oef_2." && (await page.locator(".finale-clear .result-clear.not-cleared").count()) === 1, `a run not cleared: ${notCleared}`);
  await shot(page, "4b-finale-not-cleared");
} finally {
  await browser.close();
  killTree(child);
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 4).join(" | ")}` : ""}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
