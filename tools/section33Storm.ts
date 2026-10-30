/**
 * Section 33.2's check in the browser: <html> takes `storm` when a storm starts playing and drops it when its result
 * cards open, in Panjim and the Tutorial; --panel fades between its calm and storm values over about 600 ms, and with
 * Calm motion on it changes at once.
 *
 * Usage: npx tsx tools/section33Storm.ts
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const server = await startDevServer(Number(process.env.PORT ?? 5497));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
const errors: string[] = [];

const CALM = "rgb(242, 235, 221)";
const STORM = "rgb(233, 220, 195)";

/** --panel as the browser has it now (a registered colour: rgb()), and whether <html> has `storm`. */
const sample = (page: Page): Promise<{ storm: boolean; panel: string; cards: boolean }> =>
  page.evaluate(() => ({
    storm: document.documentElement.classList.contains("storm"),
    panel: getComputedStyle(document.documentElement).getPropertyValue("--panel").trim(),
    cards: Boolean(document.querySelector(".result-cards:not([hidden])"))
  }));

async function run(level: string, calm: boolean): Promise<void> {
  const tag = `${level}${calm ? " (Calm motion)" : ""}`;
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  await page.addInitScript((calm) => {
    try {
      localStorage.clear();
      if (calm) localStorage.setItem("riptide-rising:calm-motion", "1");
    } catch {
      /* blocked */
    }
  }, calm);
  await page.goto(`${server.url}/?qa=1&noname=1#/play/${level}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
  await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(2000);
  const before = await sample(page);
  check(!before.storm && before.panel === CALM, `${tag}: calm before the storm (${JSON.stringify(before)})`);
  // Build until the storm starts: Panjim builds away from it; the Tutorial follows its nudge (its own pulsing tile).
  if (level === "l00-tutorial") {
    void page.evaluate(`(async () => {
      const c = window.__panjimForTest;
      while (!c.host.challengeFx.isPlaying()) {
        if (!c.busy && !document.querySelector(".result-cards:not([hidden])")) {
          const id = document.querySelector(".tutorial-card")?.getAttribute("data-defence");
          const tile = [...(window.__objectivePulseForTest?.tiles ?? [])][0];
          if (id && tile) { const [q, r] = tile.split(",").map(Number); c.build({ q, r }, id); }
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    })()`).catch(() => undefined);
  } else void page.evaluate(`window.__panjimForTest.scenario("to-results")`).catch(() => undefined);
  let started: { storm: boolean; panel: string } | null = null;
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const s = await sample(page);
    if (s.storm) {
      started = s;
      break;
    }
    await page.waitForTimeout(100);
  }
  check(started !== null, `${tag}: <html> took "storm" when the storm started playing`);
  const playing = await page.evaluate(() => Boolean((window as any).__panjimForTest?.host.challengeFx.isPlaying()));
  check(playing, `${tag}: the storm is playing then`);
  // Software GL draws a storm frame in about a second, and the animation clock moves with the frames: wait a few.
  await page.waitForTimeout(calm ? 300 : 5000);
  const settled = (await sample(page)).panel;
  if (calm) check(started?.panel === STORM, `${tag}: with Calm motion --panel was the storm's at once (${started?.panel})`);
  check(settled === STORM, `${tag}: --panel settled on its storm value (${settled})`);
  // On to the result cards: the class goes as they open.
  const end = Date.now() + 300000;
  let atCards: { storm: boolean; panel: string; cards: boolean } | null = null;
  while (Date.now() < end) {
    const s = await sample(page);
    if (s.cards) {
      atCards = s;
      break;
    }
    await page.waitForTimeout(100);
  }
  check(!!atCards && !atCards.storm, `${tag}: "storm" is gone when the result cards open (${JSON.stringify(atCards)})`);
  await page.waitForTimeout(calm ? 0 : 4000);
  const back = (await sample(page)).panel;
  check(back === CALM, `${tag}: --panel back to calm under the cards (${back})`);
  await page.close();
}

// The fade itself, on a page with only the tokens (read from disk) (no board drawing, so the animation clock runs freely).
{
  const page = await browser.newPage();
  const css = fs.readFileSync("src/ui/theme.css", "utf8");
  await page.setContent(`<html><head><style>${css}</style></head><body></body></html>`);
  const at = async (): Promise<string> => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--panel").trim());
  check((await at()) === CALM, `the plain page starts calm (${await at()})`);
  await page.evaluate(() => document.documentElement.classList.add("storm"));
  const t0 = Date.now();
  const seen: [number, string][] = [];
  while (Date.now() - t0 < 900) {
    seen.push([Date.now() - t0, await at()]);
    await page.waitForTimeout(30);
  }
  const between = seen.filter(([, v]) => v !== CALM && v !== STORM);
  const done = seen.find(([, v]) => v === STORM)?.[0] ?? -1;
  check(between.length >= 3 && done >= 450 && done <= 800, `--panel fades calm to storm in about 600 ms: ${between.length} in between values, the storm value from ${done} ms (${between.slice(0, 3).map(([t, v]) => `${t} ms ${v}`).join(", ")})`);
  await page.evaluate(() => document.documentElement.classList.add("storm-instant"));
  await page.evaluate(() => document.documentElement.classList.remove("storm"));
  check((await at()) === CALM, `with storm-instant (Calm motion) it goes back at once (${await at()})`);
  await page.close();
}

if (process.env.FADE_ONLY) { await browser.close(); await server.stop(); console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`); process.exit(failed ? 1 : 0); }
await run("l01-first-rains", false);
await run("l00-tutorial", false);
await run("l01-first-rains", true);
check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 2).join(" | ")})` : ""}`);
await browser.close();
await server.stop();
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
