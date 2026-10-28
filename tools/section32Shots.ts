/**
 * Section 32's targeted shots (the default QA gate), at one size: a build off the objective's tiles, in Panjim and in
 * the Tutorial, goes down with no note beside it. Each run opens a tile that is not pulsing (on screen, buildable),
 * picks a card in the build menu as a player would, and checks for a second and a half that no note shows (the old
 * one stayed about 3 s), that the build went down and that the objective's tiles still pulse. Console errors counted.
 *
 * Usage: npx tsx tools/section32Shots.ts <width> <height> [outDir=docs/qa/section32]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section32"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });

const server = await startDevServer(Number(process.env.PORT ?? 5492));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};

/** A buildable tile on screen that is not pulsing, and a defence for it other than the ones the pulse asks for. */
async function offTile(page: Page, avoid: string[]): Promise<{ q: number; r: number; id: string } | null> {
  return page.evaluate(({ avoid, W, H }) => {
    const c = (window as any).__panjimForTest;
    // Off every objective tile: the pulsing ones and every tile of an objective row (only some pulse at once).
    const pulsing = new Set<string>([...((window as any).__objectivePulseForTest?.tiles ?? []), ...c.run.prep.flatMap((job: { tiles?: string[] }) => job.tiles ?? [])]);
    const ids = ["mangrove", "khazan", "dune", "sandy_vegetation", "small_dam", "seawall", "breakwater"].filter((id) => !avoid.includes(id));
    let best: { q: number; r: number; id: string; d: number } | null = null;
    for (const tile of c.run.state.placed.values()) {
      const key = `${tile.coord.q},${tile.coord.r}`;
      if (pulsing.has(key)) continue;
      const id = ids.find((e) => c.host.state.canBuild(tile.coord, e));
      if (!id) continue;
      const p = c.host.project(tile.coord);
      if (!p || p.x < W * 0.3 || p.x > W * 0.7 || p.y < H * 0.3 || p.y > H * 0.75) continue;
      const d = Math.hypot(p.x - W / 2, p.y - H / 2);
      if (!best || d < best.d) best = { q: tile.coord.q, r: tile.coord.r, id, d };
    }
    return best ? { q: best.q, r: best.r, id: best.id } : null;
  }, { avoid, W, H });
}

async function buildOff(page: Page, where: string, avoid: string[]): Promise<void> {
  const pulseBefore = await page.evaluate(() => [...((window as any).__objectivePulseForTest?.tiles ?? [])].length);
  check(pulseBefore > 0, `${where}: the objective's tiles pulse before the build (${pulseBefore})`);
  const tile = await offTile(page, avoid);
  check(tile !== null, `${where}: a buildable tile off the pulsing ones, on screen (${JSON.stringify(tile)})`);
  if (!tile) return;
  const year = await page.evaluate(() => (window as any).__panjimForTest.run.year);
  await page.evaluate(({ q, r }) => (window as any).__openTileForTest(q, r), tile);
  await page.waitForTimeout(800);
  await page.locator(`.build-popover .build-card[data-element="${tile.id}"]`).first().click();
  // Watch for a note for 1.5 s (the old note showed at once and stayed about 3 s); shoot half way.
  const notes = new Set<string>();
  let beside = false;
  for (let i = 0; i < 10; i++) {
    beside ||= await page.evaluate(() => Boolean(document.querySelector(".map-note.beside")));
    for (const t of await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".map-note, .banner, .hud-banner")].map((e) => e.innerText.trim()).filter(Boolean))) notes.add(t);
    if (i === 5) await page.screenshot({ path: path.join(OUT, `${where}-build-off-objective-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
    await page.waitForTimeout(150);
  }
  const after = await page.evaluate(({ q, r }) => ({ built: (window as any).__panjimForTest.run.state.elements.get(`${q},${r}`)?.elementId ?? null, year: (window as any).__panjimForTest.run.year }), tile);
  check(after.built === tile.id && after.year > year, `${where}: ${tile.id} went down at ${tile.q},${tile.r} and the year moved on (${JSON.stringify(after)})`);
  const text = [...notes].join(" | ");
  check(!/outside the area|count for the objective/i.test(text), `${where}: no "outside the area" note`);
  check(!beside, `${where}: no note beside the tile (seen: "${text.slice(0, 100)}")`);
}

async function open(page: Page, level: string): Promise<void> {
  await page.goto(`${server.url}/?qa=1&noname=1#/play/${level}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => (window as any).__panjimForTest.maya.dismiss());
  await page.mouse.move(2, H - 2);
  await page.waitForTimeout(800);
}

const errors: string[] = [];
for (const [where, level] of [["panjim", "l01-first-rains"], ["tutorial", "l00-tutorial"]] as const) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => m.type() === "error" && errors.push(`${where}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${where}: ${e.message}`));
  await open(page, level);
  // In the Tutorial, not the defence its caption suggests (its glowing card): something else, somewhere else.
  const avoid = where === "tutorial" ? [await page.evaluate(() => document.querySelector(".tutorial-card")?.getAttribute("data-defence") ?? "")] : [];
  await buildOff(page, where, avoid);
  await page.close();
}
check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 2).join(" | ")})` : ""}`);

await browser.close();
await server.stop();
console.log(failed === 0 ? `ALL PASS [${W}x${H}]` : `${failed} FAILED [${W}x${H}]`);
process.exit(failed === 0 ? 0 : 1);
