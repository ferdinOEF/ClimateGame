/**
 * Section 33b.5's camera check, at one size: Panjim at the start of each phase (the camera settled) and each storm
 * held at a few moments while it plays, so the forecast arrow and cone, the landfall, Sharada Mandir School and the
 * 2040 flood path into Merces and St Cruz can be checked against the HUD card and Maya (Section 34c.2: top right and
 * bottom left).
 * Saves the shots and, beside each, the boxes of the HUD card and Maya and of the named place labels on screen.
 *
 * Usage: npx tsx tools/section33bViews.ts <width> <height> [outDir=docs/qa/section33b/views]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const [w = "1366", h = "768", outDir = "docs/qa/section33b/views"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(outDir);
fs.mkdirSync(OUT, { recursive: true });

// Section 34c: URL=http://localhost:4173 uses a server already running (a production build through vite preview).
const server = process.env.URL ? { url: process.env.URL, stop: async (): Promise<void> => undefined } : await startDevServer(Number(process.env.PORT ?? 5499));
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
});
const js = <T>(code: string): Promise<T> => page.evaluate(code) as Promise<T>;

/** Waits until the camera has stopped gliding. */
async function settle(): Promise<void> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    const now = await js<string>(`(() => { const c = window.__cameraForTest; return [c.position.x, c.position.y, c.position.z].map((v) => v.toFixed(3)).join(","); })()`);
    if (now === last) return;
    last = now;
    await page.waitForTimeout(500);
  }
}

async function shot(name: string): Promise<void> {
  await js(`window.__panjimForTest.maya.dismiss()`);
  await page.mouse.move(W / 2, 2);
  await page.waitForTimeout(700);
  // Section 34c: on this laptop a storm frame at 1920x1080 can stall the screenshot past its timeout; skip that frame
  // and go on, so the next phase's opening view is still taken.
  const taken = await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85, timeout: 60000 }).then(() => true, (e: Error) => (console.log(`${name}: no screenshot (${e.message.split("\n")[0]})`), false));
  if (!taken) return;
  const boxes = await js<unknown>(`(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const seen = (el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && el.getBoundingClientRect().width > 0; };
    const one = (sel) => { const el = document.querySelector(sel); return el && seen(el) ? box(el) : null; };
    return {
      card: one(".panjim-clock"),
      maya: one(".maya-figure-wrap") ?? one(".maya-badge"),
      labels: [...document.querySelectorAll(".map-labels *, .map-pin")].filter((el) => seen(el) && el.children.length === 0 && (el.textContent ?? "").trim()).map((el) => ({ text: el.textContent.trim(), box: box(el) }))
    };
  })()`);
  fs.writeFileSync(path.join(OUT, `${name}-${W}x${H}.json`), JSON.stringify(boxes));
  console.log(`${name}: ${JSON.stringify(boxes).slice(0, 160)}`);
}

/** Holds the next storm at a few moments, then plays it through its cards to the next phase. */
async function storm(name: string, moments: number[], last: boolean): Promise<void> {
  if (!(await js<boolean>(`window.__panjimForTest.scenario("storm-${moments[0]}")`))) throw new Error(`${name}: did not start`);
  for (const t of moments) {
    await js(`window.__panjimForTest.host.challengeFx.freeze(${t})`);
    await page.waitForTimeout(2500);
    await shot(`${name}-${t}s`);
  }
  await js(`window.__panjimForTest.scenario("storm-release")`);
  if (last) return;
  const end = Date.now() + 240000;
  while (Date.now() < end && !(await page.locator(".result-cards:not([hidden]) .result-next").count())) {
    await js(`document.dispatchEvent(new PointerEvent("pointerdown"))`);
    await page.waitForTimeout(300);
  }
  for (let i = 0; i < 8 && (await page.locator(".result-cards:not([hidden]) .result-next").count()); i++) {
    await page.locator(".result-cards:not([hidden]) .result-next").first().click();
    await page.waitForTimeout(800);
  }
  await page.waitForFunction(`!window.__panjimForTest.busy`, undefined, { timeout: 120000 });
}

await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta").first().click();
await page.waitForTimeout(1500);
await settle();
console.log(`phase1 pan: ${JSON.stringify(await js("window.__keepClearForTest()"))}`);
await shot("phase1-start");
await storm("cyclone2030", [2, 5, 9], false);
await settle();
console.log(`phase2 pan: ${JSON.stringify(await js("window.__keepClearForTest()"))}`);
await shot("phase2-start");
await storm("flood2040", [3, 8, 12, 16], false);
await settle();
console.log(`phase3 pan: ${JSON.stringify(await js("window.__keepClearForTest()"))}`);
await shot("phase3-start");
await storm("storm2050", [3, 7, 11], true);

await browser.close();
await server.stop();
console.log(`console errors [${W}x${H}]: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
process.exit(errors.length ? 1 : 0);
