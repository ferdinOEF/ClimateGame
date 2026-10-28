/**
 * Section 17c: Maya hidden. At one window size: the Panjim first frame, a result card and a Tutorial step (its
 * first build cards), photographed, each checked to show no Maya figure, bubble or full figure; ☰ checked to hold
 * no Maya item; M checked to do nothing. Usage: npx tsx tools/section17cShots.ts <width> <height> [outDir].
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";
import { qaUrl } from "./qaUrl";

const [w = "1366", h = "768", outDir = "docs/qa/section17c"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
fs.mkdirSync(outDir, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5437));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(route: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(qaUrl(`${server.url}/${route}`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 180000 });
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 180000 });
  await wait(1500);
  return page;
}

async function noMaya(page: Page, state: string): Promise<void> {
  const seen = (await page.evaluate(`[...document.querySelectorAll(".maya, .maya-bubble, .maya-figure-wrap, .maya-full-figure, .result-maya")].filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"; }).map((el) => el.className)`)) as string[];
  const named = (await page.evaluate(`/\\bMaya\\b/.test(document.body.innerText)`)) as boolean;
  check(seen.length === 0 && !named, `${state}: no Maya on screen${seen.length ? ` (${seen.join(", ")})` : ""}${named ? " (her name is in the text)" : ""}`);
}

// ---- Panjim: start popup, first frame, ☰, M, a result card --------------------
{
  const page = await open("#/play/l01-first-rains");
  await noMaya(page, "start popup");
  await page.screenshot({ path: `${outDir}/start-popup-${W}x${H}.jpg`, type: "jpeg", quality: 82 });
  await page.locator(".brief-cta").first().click();
  await wait(3500);
  await page.screenshot({ path: `${outDir}/first-frame-${W}x${H}.jpg`, type: "jpeg", quality: 82 });
  await noMaya(page, "first frame");
  await page.locator(".hud-panel-settings .hud-panel-button").click();
  await wait(800);
  const menu = (await page.evaluate(`document.querySelector(".hud-panel-settings .hud-panel-body").innerText`)) as string;
  check(!/Maya/.test(menu) && (await page.locator(".maya-toggle").count()) === 0, "☰ has no Maya item");
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await wait(600);
  await noMaya(page, "after pressing M");
  await page.evaluate(`window.__panjimScenarioForTest("to-results")`);
  await wait(2000);
  await page.screenshot({ path: `${outDir}/result-card-${W}x${H}.jpg`, type: "jpeg", quality: 82 });
  await noMaya(page, "result card 1");
  await page.locator(".result-next").click();
  await wait(900);
  await noMaya(page, "result card 2");
  await page.locator(".result-next").click();
  await wait(1200);
  await noMaya(page, "the coming-up card");
  await page.close();
}

// ---- The Tutorial: a step (its first build cards) ------------------------------
{
  const page = await open("#/play/l00-tutorial");
  await noMaya(page, "Tutorial start popup");
  await page.locator(".brief-cta").first().click();
  await wait(2500);
  await page.evaluate(`(() => { const p = window.__panjimForTest; const job = p.run.prep.find((j) => !j.done); const t = job.tiles[0].split(",").map(Number); return window.__openTileForTest(t[0], t[1]); })()`);
  await page.mouse.move(2, H - 2);
  await wait(1500);
  await page.screenshot({ path: `${outDir}/tutorial-step-${W}x${H}.jpg`, type: "jpeg", quality: 82 });
  await noMaya(page, "Tutorial step (first build cards)");
  await page.close();
}

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${W}x${H})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
