/**
 * Section 37.9: one shot of the feedback form after the board refused a rename onto a name another run holds.
 *
 * A named run ("QA Tester") plays to its finale on the dev server (`?qa=1`); the board's answers are stubbed: the
 * finale's post lands 2nd, and the rename to "Test Ana" is refused with 409 "name taken", as the server answers.
 * Checks the line under the name field and that the run's name on the finale is unchanged.
 *
 * Usage: npx tsx tools/section37RenameShot.ts [w=1366] [h=768] [out=docs/qa/section37]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section37");
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;

const server = await startDevServer(5239, 120000);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
let wiggle: NodeJS.Timeout | null = null;
const patches: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  await context.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === "/api/board" && req.method() === "PATCH") {
      patches.push(req.postData() ?? "");
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "name taken" }) });
    }
    let body: Record<string, unknown> = {};
    if (url.pathname === "/api/board" && req.method() === "POST") {
      body = { season: "QA", rank: 2, points: 4000, tenth: null, above: [{ rank: 1, name: "Test Ana", points: 4300, stars: 7, season: "QA" }], below: [{ rank: 3, name: "Test Rui", points: 3900, stars: 6, season: "QA" }], editToken: "qa-token-0123456789abcdef", name: "QA Tester" };
    } else if (url.pathname === "/api/board") body = url.searchParams.has("points") ? { season: "QA", rank: 1, points: 0, tenth: null, above: [], below: [] } : { season: "QA", rows: [] };
    else if (url.pathname === "/api/feedback") body = { saved: true };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    // The stubbed 409 is the browser's own network line, not the game's.
    if (m.type() === "error" && !/409/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  let x = 0;
  wiggle = setInterval(() => void page.mouse.move(W / 2 + (x++ % 2) * 6, H - 40).catch(() => {}), 20000);
  await page.waitForSelector(".name-card-field", { state: "visible", timeout: 60000 });
  await page.locator(".name-card-field").fill("QA Tester");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".brief-cta", { state: "visible", timeout: 60000 });
  await page.waitForTimeout(800);
  await page.locator(".brief-cta").click();
  await page.waitForTimeout(1500);
  check(await js<boolean>(page, `window.__panjimScenarioForTest("finale")`), "the run plays on to its finale card");
  await page.waitForSelector(".finale-rank-rows", { timeout: 60000 });
  await page.waitForTimeout(2500);
  // The finale's "Your feedback", then the name field to a name another run holds, and Submit.
  await page.locator(".result-cards:not([hidden]) .result-next", { hasText: "Your feedback" }).click();
  await page.waitForSelector('.result-cards:not([hidden]) input[name="name"]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.locator('.result-cards:not([hidden]) input[name="name"]').fill("Test Ana");
  await page.locator(".result-cards:not([hidden]) .result-next", { hasText: "Submit feedback" }).click();
  await page.waitForFunction(`document.querySelector(".result-cards:not([hidden]) .fb-error:not([hidden])") !== null`, undefined, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const line = await js<string | null>(page, `document.querySelector(".result-cards:not([hidden]) .fb-error:not([hidden])")?.textContent ?? null`);
  check(line === "That name is already on the board.", `the line under the name field: ${line}`);
  check(patches.length === 1 && /Test Ana/.test(patches[0]), `one rename asked of the server (${patches.length})`);
  await page.screenshot({ path: path.join(OUT, `6-rename-refused-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  console.log("shot 6-rename-refused");
} finally {
  if (wiggle) clearInterval(wiggle);
  await browser.close();
  server.stop();
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
process.exit(failures === 0 ? 0 : 1);
