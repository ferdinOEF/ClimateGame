/**
 * The shell's pictures (Section 15), all real renders of the game itself:
 *
 *   public/art/menu-header.jpg      the Panjim board, wide, under the title
 *   public/art/level-tutorial.jpg   the Tutorial's coast (level select)
 *   public/art/level-panaji.jpg     the Panaji board (level select)
 *   public/art/help-*.jpg           the Help page's small illustrations:
 *                                   the clock, the cone, a build card, the heat, a result card
 *
 * `npx tsx tools/shellArt.ts [url=http://localhost:4173] [only=help-clock.jpg,...]`. Rerun it when the board's look
 * changes, so the pictures stay the game's own. `url` uses a server already running (a production build through
 * `vite preview`, whose fonts always load) instead of starting the dev server; `only` saves just the named pictures.
 * Software GL in the container: the render is the same scene a player sees, at the quality the page picks.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { qaUrl } from "./qaUrl";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "art");
fs.mkdirSync(OUT, { recursive: true });

/** Everything that is not the board: hidden for the board-only pictures. */
const HIDE_HUD = `
  .hud-chrome, .panjim-clock, .hud-panel, .hud-panels, .objectives-panel, .get-ready, .map-corner, .maya, .maya-figure-wrap, .maya-bubble,
  .panjim-toggles, .empty-prompt, .guidance-line, .map-labels, .map-label, .map-pin, .map-pins, .hud-tooltip, .tutorial-hint,
  .area-protected, .banner, .era-banner, .toast, [class*="field-guide"], .back-button, .help-button { visibility: hidden !important; }
`;

const errors: string[] = [];
const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const ONLY = args.get("only")?.split(",") ?? null;

async function open(page: Page, url: string): Promise<void> {
  await page.goto(qaUrl(url), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
  await page.waitForTimeout(1200);
}

async function begin(page: Page): Promise<void> {
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(2500);
}

async function hideHud(page: Page): Promise<() => Promise<void>> {
  const handle = await page.addStyleTag({ content: HIDE_HUD });
  return async () => {
    await handle.evaluate((node) => (node as Element).remove());
  };
}

async function save(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  if (ONLY && !ONLY.includes(name)) return;
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: "jpeg", quality: 82, clip });
  console.log(`${name}: ${Math.round(fs.statSync(file).size / 1024)} KB`);
}

async function saveElement(page: Page, selector: string, name: string, pad = 0): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    errors.push(`${name}: no ${selector}`);
    return;
  }
  await save(page, name, { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 });
}

const server = args.get("url") ? { url: args.get("url")!, stop: () => undefined } : await startDevServer(5371);
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  // --- Panaji: the header, its level thumbnail, and the Help pictures -------
  await open(page, `${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`);
  await begin(page);
  // The Help page's cone: the board as the first phase opens, the cone on it.
  let show = await hideHud(page);
  await page.waitForTimeout(800);
  await save(page, "help-cone.jpg", { x: 400, y: 160, width: 800, height: 560 });
  await show();
  await saveElement(page, ".panjim-clock", "help-clock.jpg", 6);
  // A build card: the cards on a beach tile, the number on each.
  const opened = await page.evaluate(() => {
    const p = (window as any).__panjimForTest;
    const tile = p.firstBuildableIn("z1", "dune");
    return tile ? (window as any).__openTileForTest(tile.q, tile.r) : false;
  });
  if (!opened) errors.push("help-cards: the build cards did not open");
  await page.waitForTimeout(900);
  await saveElement(page, ".build-popover", "help-cards.jpg", 4);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  // The header and the thumbnail: the city with some defences up, the cone gone.
  await page.evaluate(() => (window as any).__panjimScenarioForTest("prep-one"));
  await page.waitForTimeout(800);
  await page.evaluate(() => (window as any).__panjimScenarioForTest("look-campal"));
  await page.waitForTimeout(2500);
  show = await hideHud(page);
  await page.waitForTimeout(600);
  await save(page, "menu-header.jpg", { x: 0, y: 160, width: 1600, height: 560 });
  await save(page, "level-panaji.jpg", { x: 320, y: 140, width: 960, height: 600 });
  await show();
  // The heat: the cyclone's own year, red on the homes it would flood.
  await page.evaluate(() => (window as any).__panjimScenarioForTest("heat-1"));
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).__panjimScenarioForTest("look-close-miramar"));
  await page.waitForTimeout(2500);
  show = await hideHud(page);
  await page.waitForTimeout(600);
  await save(page, "help-heat.jpg", { x: 400, y: 160, width: 800, height: 560 });
  await show();
  // A result card: the storm, hurried through.
  await page.evaluate(() => (window as any).__panjimScenarioForTest("to-results"));
  await page.waitForTimeout(800);
  await saveElement(page, ".result-cards .result-card, .result-cards [class*=card]", "help-result.jpg", 0);

  // --- The Tutorial's coast -----------------------------------------------
  await open(page, `${server.url}/?qa=1&noname=1#/play/l00-tutorial`);
  await begin(page);
  show = await hideHud(page);
  await page.waitForTimeout(800);
  await save(page, "level-tutorial.jpg", { x: 320, y: 140, width: 960, height: 600 });
  await show();
} finally {
  await browser.close();
  server.stop();
}
console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "console errors: none");
process.exit(errors.length ? 1 : 0);
