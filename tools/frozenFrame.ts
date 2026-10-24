/**
 * A storm frame that two runs of the same code draw alike (Section 33b), for the before and after pixel diff of the
 * map, the storm and the birds outside the interface. Time is Playwright's fake clock, stepped by the tool, and
 * Math.random is seeded, so rain, clouds, water, the cone and the wildlife are where they were on the last run. Plays
 * Panjim to the 2030 cyclone and holds it at 7 s, then the 2040 flood at 12 s; saves each frame as a PNG and the boxes
 * of every interface element on screen as JSON.
 *
 * Usage: npx tsx tools/frozenFrame.ts <width> <height> <outDir>
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const [w = "1366", h = "768", outDir = "docs/qa/section33b/after"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(outDir);
fs.mkdirSync(OUT, { recursive: true });

const server = await startDevServer(Number(process.env.PORT ?? 5493));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
  // A seeded random: the same rain, the same flocks.
  let seed = 0x5eed33b;
  Math.random = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});
await page.clock.install({ time: new Date("2026-06-01T09:00:00Z") });
await page.clock.pauseAt(new Date("2026-06-01T09:00:01Z"));

/** Steps the fake clock 50 ms at a time (each step lets real work run in between) until `code` is true. */
async function stepUntil(code: string, maxSteps = 4000): Promise<boolean> {
  for (let i = 0; i < maxSteps; i++) {
    if (await page.evaluate(code).catch(() => false)) return true;
    await page.clock.runFor(50);
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
}
async function steps(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await page.clock.runFor(50);
    await new Promise((r) => setTimeout(r, 15));
  }
}
const boxes = (): Promise<unknown> =>
  page.evaluate(() =>
    [...document.body.querySelectorAll("*")]
      .filter((el) => !(el instanceof HTMLCanvasElement) && !el.closest("svg, .map-labels, .map-pins"))
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
        const painted = s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.borderTopWidth !== "0px" || s.boxShadow !== "none" || (el.childNodes.length > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()));
        return painted;
      })
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      })
      .filter((b) => b.width > 0 && b.height > 0 && b.width * b.height < 0.5 * innerWidth * innerHeight)
  );

await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
if (!(await stepUntil(`!!document.querySelector(".brief-card") && !!window.__panjimForTest`))) throw new Error("the game did not load");
await steps(40);
// A DOM click: with the clock held, Playwright's own click waits for animation frames that never come.
await page.evaluate(() => (document.querySelector(".brief-cta") as HTMLButtonElement).click());
await steps(60);
await page.evaluate(() => (window as any).__panjimForTest.maya.dismiss());

async function hold(scenario: string, name: string, seconds: number): Promise<void> {
  await page.evaluate((s) => void (window as any).__panjimForTest.scenario(s), scenario);
  if (!(await stepUntil(`!!window.__stormForTest?.playing() && (window.__stormForTest.time() ?? 0) >= ${seconds - 0.05}`, 20000))) throw new Error(`${name}: the storm did not reach ${seconds} s`);
  await steps(60);
  await page.evaluate(() => (window as any).__panjimForTest.maya.dismiss());
  await page.mouse.move(2, H - 2);
  await steps(10);
  // Straight from the compositor: Playwright's own screenshot waits for an animation frame, which the held clock withholds.
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, `${name}-${W}x${H}.png`), Buffer.from(data, "base64"));
  await cdp.detach();
  fs.writeFileSync(path.join(OUT, `${name}-${W}x${H}.json`), JSON.stringify(await boxes()));
  console.log(`${name}: storm time ${await page.evaluate(() => (window as any).__stormForTest.time())}`);
}

await hold("storm-7", "frozen-cyclone", 7);
// On through the cyclone's cards to the flood.
await page.evaluate(() => (window as any).__panjimForTest.scenario("storm-release"));
// Hurried, as a click on the board does.
for (let i = 0; i < 20000; i++) {
  if (await page.locator(".result-cards:not([hidden]) .result-next").count()) break;
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerdown")));
  await page.clock.runFor(100);
  await new Promise((r) => setTimeout(r, 10));
}
for (let i = 0; i < 6; i++) {
  if (!(await page.locator(".result-cards:not([hidden]) .result-next").count())) break;
  await page.evaluate(() => (document.querySelector(".result-cards:not([hidden]) .result-next") as HTMLButtonElement).click());
  await steps(30);
}
await stepUntil(`!window.__panjimForTest.busy`, 20000);
await hold("storm-12", "frozen-flood", 12);

await browser.close();
await server.stop();
console.log(`console errors [${W}x${H}]: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
process.exit(errors.length ? 1 : 0);
