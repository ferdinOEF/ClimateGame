/**
 * Section 33's before and after screenshots (Harbour Morning), at one size: the main menu, the start popup, Maya's
 * bubble, the top bar calm and during a cyclone (held with the storm frozen), the build menu with a hovered card,
 * Help, a result card, the finale card and a Tutorial caption. The cyclone moment is also saved as a PNG with the
 * shader clock held, so tools/section33Diff.ts can compare the map, storm and birds outside the panels; the panels'
 * boxes go beside it as JSON.
 *
 * Usage: npx tsx tools/section33Shots.ts <width> <height> [outDir=docs/qa/section33/after]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section33/after"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

const server = await startDevServer(Number(process.env.PORT ?? 5495));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
const missed: string[] = [];

async function newPage(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* blocked */
    }
  });
  return page;
}
const shot = async (page: Page, name: string, clip?: string): Promise<void> => {
  if (clip) {
    const box = await page.locator(clip).first().boundingBox().catch(() => null);
    if (!box) {
      missed.push(`${name}: no ${clip}`);
      return;
    }
    const pad = 12;
    await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.png`), clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(W, box.width + pad * 2), height: Math.min(H, box.height + pad * 2) } });
    return;
  }
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 88 });
};
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const want = (name: string): boolean => !ONLY || ONLY.has(name);

async function startPanjim(page: Page, level: string): Promise<void> {
  await page.goto(`${server.url}/#/play/${level}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
  await page.waitForTimeout(2000);
}

// ---- the main menu ---------------------------------------------------------------------------------------------
if (want("menu")) {
  const page = await newPage();
  await page.goto(`${server.url}/#/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.mouse.move(2, 2);
  await shot(page, "menu");
  await page.close();
}

// ---- Panjim: the start popup, Maya, the top bar, the build menu, Help, the cyclone, a result card, the finale ----
if (want("panjim")) {
  const page = await newPage();
  await startPanjim(page, "l01-first-rains");
  await page.mouse.move(2, H - 2);
  await shot(page, "start-popup");
  // STOP=popup: only the start popup (a quick look while restyling).
  if (process.env.STOP === "popup") {
    await page.close();
  } else {
  await page.locator(".brief-cta").first().click();
  // Maya's opening line.
  await page.waitForSelector(".maya-bubble:not([hidden])", { timeout: 15000 }).catch(() => missed.push("maya: no bubble"));
  await page.waitForTimeout(1200);
  await shot(page, "maya-bubble");
  await shot(page, "maya-bubble-clip", ".maya-bubble:not([hidden])");
  await js(page, `window.__panjimForTest.maya.dismiss()`);
  await page.waitForTimeout(800);
  await shot(page, "topbar-calm");
  await shot(page, "topbar-calm-clip", ".panjim-clock");
  // The build menu on a beach tile in front of Sharada Mandir School, its first card hovered.
  await js(page, `window.__openTileForTest(-4, 18)`);
  await page.waitForTimeout(1500);
  const card = page.locator(".build-popover .build-card").first();
  if ((await card.count()) > 0) {
    await card.hover();
    await page.waitForTimeout(900);
    await shot(page, "build-menu-hover");
  } else missed.push("build menu: no card");
  await page.keyboard.press("Escape");
  await page.mouse.move(2, H - 2);
  await page.waitForTimeout(600);
  // Help.
  const help = page.locator(".help-button").first();
  if ((await help.count()) > 0) {
    await help.click();
    await page.waitForTimeout(1200);
    await shot(page, "help");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  } else missed.push("help: no button");
  // The cyclone, held 7 s in with the shader clock held, Maya quiet.
  await js(page, `window.__freezeShaderTimeForTest && window.__freezeShaderTimeForTest(12)`);
  const stormed = await js<boolean>(page, `window.__panjimForTest.scenario("storm-7")`);
  if (!stormed) missed.push("storm: did not start");
  await page.waitForTimeout(2500);
  await js(page, `window.__panjimForTest.maya.dismiss()`);
  await page.mouse.move(2, H - 2);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `storm-moment-${W}x${H}.png`) });
  await shot(page, "topbar-storm-clip", ".panjim-clock");
  // The boxes of every panel on screen (the diff leaves them out).
  const boxes = await js<{ x: number; y: number; width: number; height: number }[]>(page, `[...document.querySelectorAll(".panjim-clock, .panjim-toggles, .hud-corner, .help-button, .hud-panel, .get-ready, .objectives-panel, .maya, .maya-bubble, .speed-up, .storm-card, .map-note, .map-pin, .attribution, .osm-attribution, [class*='attribution'], .tutorial-panel, .empty-prompt, .storm-caption, .storm-phase, .storm-word, .map-label, .map-pin, .label-layer *")].filter((el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden"; }).map((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }).filter((b) => b.width > 0 && b.height > 0)`);
  fs.writeFileSync(path.join(OUT, `storm-moment-${W}x${H}.json`), JSON.stringify(boxes));
  await js(page, `window.__freezeShaderTimeForTest && window.__freezeShaderTimeForTest(null)`);
  await js(page, `window.__panjimForTest.scenario("storm-release")`);
  // On to its result card, hurried.
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline && !(await page.locator(".result-cards:not([hidden]) .result-next").count())) {
    if ((await page.locator(".speed-up:visible").count()) > 0) await page.locator(".speed-up").click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
  await page.mouse.move(2, H - 2);
  if (await page.locator(".result-cards:not([hidden])").count()) await shot(page, "result-card");
  else missed.push("result card: never opened");
  if (want("finale") && !process.env.NO_FINALE) {
    await page.locator(".result-cards:not([hidden]) .result-next").first().click().catch(() => undefined);
    await page.waitForTimeout(1000);
    // Every storm but the last played through; the last one hurried to its cards, then on to the finale.
    await js(page, `(async () => { const c = window.__panjimForTest; while (c.run.nextChallenge() && c.run.schedule.filter((s) => !c.run.landed.has(s.id)).length > 1) await c.scenario("past-storm"); return c.scenario("to-results"); })()`);
    // Through the last storm's cards (never the final card's own button, which is Play again) to the 2050 title and
    // the final card with its stars total.
    const end = Date.now() + 240000;
    let titled = false;
    let final = false;
    while (Date.now() < end) {
      if (!titled && (await page.locator(".finale-title:visible").count())) {
        titled = true;
        await page.waitForTimeout(700);
        await shot(page, "finale-title");
      }
      if (await page.locator(".result-cards:not([hidden]) .result-stars-total").count()) {
        final = true;
        break;
      }
      const next = page.locator(".result-cards:not([hidden]) .result-next").first();
      if (await next.count()) await next.click().catch(() => undefined);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500);
    await page.mouse.move(2, H - 2);
    if (final) await shot(page, "finale-card");
    else missed.push("finale: the final card never opened");
  }
  await page.close();
  }
}

// ---- the Tutorial's first caption, the build menu open on a pulsing tile ----------------------------------------
if (want("tutorial")) {
  const page = await newPage();
  await startPanjim(page, "l00-tutorial");
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3000);
  const tile = await js<string | undefined>(page, `[...(window.__objectivePulseForTest?.tiles ?? [])][0]`);
  if (tile) {
    const [q, r] = tile.split(",").map(Number);
    await js(page, `window.__openTileForTest(${q}, ${r})`);
    await page.waitForTimeout(1500);
  }
  await page.mouse.move(2, H - 2);
  await page.waitForTimeout(600);
  await shot(page, "tutorial-caption");
  await page.close();
}

await browser.close();
await server.stop();
for (const m of missed) console.log(`MISSED [${W}x${H}] ${m}`);
console.log(`console errors [${W}x${H}]: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
process.exit(missed.length || errors.length ? 1 : 0);
