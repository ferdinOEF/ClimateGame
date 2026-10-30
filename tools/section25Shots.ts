/**
 * Section 25's targeted shots (the default QA gate), at one size:
 *   - a result card with both lines (homes saved, and biodiversity with its reason): five seawalls on the beach
 *     before the 2030 cyclone, so it reads "Seawalls cost nature";
 *   - a broken seawall after 2050: those walls come through the 2030 cyclone and break in the 2050 storm, and stay on
 *     the board, drawn broken (the cards hidden for the shot);
 *   - the Field Guide's defence entries, each a game rule.
 * The run is planned headless on the game's own rules (every build legal), then played in the browser through the
 * player's own build path (`window.__panjimForTest.build`). Checks the cards' numbers against the headless run, the
 * broken walls in the game state, and console errors (0).
 *
 * Usage: npx tsx tools/section25Shots.ts <width> <height> [outDir=docs/qa/section25]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { BOT_LEVEL, newRun } from "./panjimBots/bots";
import { axialKey, neighbors } from "../src/core/hex";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section25"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });

// ---- the run, planned headless ----------------------------------------------------------------------------------
const plan = newRun("section25-shots", BOT_LEVEL);
const cyclone = plan.schedule[0];
const reach = new Set(plan.exposureFor(cyclone, true)!.exposure.keys());
const near = new Set<string>();
for (const c of plan.schedule) for (const k of plan.exposureFor(c, true)?.exposure.keys() ?? []) {
  const [q, r] = k.split(",").map(Number);
  near.add(k);
  for (const n of neighbors({ q, r })) for (const m of neighbors(n)) near.add(axialKey(m));
}
const actions: { q: number; r: number; elementId: string }[] = [];
const walls: string[] = [];
const build = (q: number, r: number, elementId: string): void => {
  if (!plan.build({ q, r }, elementId).ok) throw new Error(`refused ${elementId} at ${q},${r}`);
  actions.push({ q, r, elementId });
};
for (const tile of plan.state.placed.values()) {
  if (walls.length >= 5) break;
  if (tile.terrainId === "beach" && reach.has(axialKey(tile.coord)) && plan.state.canBuild(tile.coord, "seawall")) {
    walls.push(axialKey(tile.coord));
    build(tile.coord.q, tile.coord.r, "seawall");
  }
}
// The other twenty years: builds far from every storm, so the walls are what the storms meet.
while (!plan.finished) {
  const tile = [...plan.state.placed.values()].find((t) => !near.has(axialKey(t.coord)) && plan.state.buildableAt(t.coord).length > 0)!;
  build(tile.coord.q, tile.coord.r, plan.state.buildableAt(tile.coord)[0].id);
}
const expected = plan.schedule.map((c) => plan.outcomes.get(c.id)!);
console.log(`planned: walls at ${walls.join(" ")}; storms ${expected.map((o) => `${o.stars} stars ${o.housesSaved}/${o.housesTotal} bio ${o.biodiversityChange}`).join(", ")}; broken after 2050: ${walls.filter((k) => plan.state.elements.get(k)?.broken).length}`);

// ---- played in the browser --------------------------------------------------------------------------------------
const server = await startDevServer(Number(process.env.PORT ?? 5476));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};
const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
});
await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);

const cardsOpen = (): Promise<boolean> => page.locator(".result-cards:not([hidden])").isVisible().catch(() => false);
const ready = (): Promise<boolean> => page.evaluate(`!window.__panjimForTest.busy`) as Promise<boolean>;
const seen: { stars: number; text: string }[] = [];
let finalShown = false;
async function settle(): Promise<void> {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    if (await cardsOpen()) {
      const card = (await page.evaluate(`(() => {
        const c = document.querySelector(".result-cards:not([hidden]) .result-card");
        const s = c.querySelector(".result-stars");
        return { stars: s ? Number((s.getAttribute("aria-label") || "").split(" ")[0]) : null, total: !!c.querySelector(".result-stars-total"), text: (c.textContent || "").replace(/\\s+/g, " ").trim() };
      })()`)) as { stars: number | null; total: boolean; text: string };
      if (card.total) {
        finalShown = true;
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `final-card-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
        return;
      }
      if (card.stars !== null) {
        seen.push({ stars: card.stars, text: card.text });
        if (seen.length === 1) {
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(OUT, `result-card-seawall-run-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
        }
      }
      await page.locator(".result-cards:not([hidden]) .result-next").click();
      await page.waitForTimeout(700);
      continue;
    }
    if (await ready()) return;
    await page.waitForTimeout(400);
  }
  throw new Error("the year never settled");
}
for (const [i, a] of actions.entries()) {
  await settle();
  const ok = (await page.evaluate(([act]) => (window as unknown as { __panjimForTest: { build: (c: { q: number; r: number }, id: string) => boolean } }).__panjimForTest.build({ q: act.q, r: act.r }, act.elementId), [a] as const)) as boolean;
  if (!ok) {
    check(false, `build ${i + 1} (${a.elementId} at ${a.q},${a.r}) refused`);
    break;
  }
  await page.waitForTimeout(300);
}
await settle();

expected.forEach((o, i) => {
  const got = seen[i];
  const bio = o.biodiversityChange ?? 0;
  const bioText = `${bio > 0 ? "+" : bio < 0 ? "−" : ""}${Math.abs(bio)} biodiversity since 2026`;
  check(!!got && got.stars === o.stars && got.text.includes(`${o.housesSaved} of ${o.housesTotal} homes saved`) && got.text.includes(bioText), `storm ${i + 1}: card ${got ? `${got.stars} stars, "${got.text.slice(0, 140)}"` : "missing"}; run ${o.stars} stars, ${o.housesSaved} of ${o.housesTotal}, ${bioText}`);
});
check(!!seen[0] && seen[0].text.includes("Seawalls cost nature"), `the 2030 card says why: "Seawalls cost nature"`);
check(finalShown, "the final card is shown");

// The broken seawalls, after 2050, the cards hidden for the shot.
const broken = (await page.evaluate(([keys]) => (keys as string[]).filter((k) => (window as unknown as { __panjimForTest: { host: { state: { elements: Map<string, { broken?: boolean }> } } } }).__panjimForTest.host.state.elements.get(k)?.broken), [walls] as const)) as string[];
check(broken.length === walls.length, `broken seawalls after 2050: ${broken.length} of ${walls.length}, still on the board`);
await page.addStyleTag({ content: ".result-cards, .finale-card, .finale-title { display: none !important; }" });
const [bq, br] = walls[0].split(",").map(Number);
await page.evaluate(`window.__panjimForTest.host.focusCamera({ q: ${bq}, r: ${br} }, true, 0.3)`);
await page.mouse.move(2, H - 2);
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT, `broken-seawall-${W}x${H}.jpg`), type: "jpeg", quality: 85 });

// The Field Guide's defence entries.
await page.addStyleTag({ content: ".result-cards { display: none !important; } .field-guide-backdrop { z-index: 99999 !important; }" });
await page.evaluate(`document.querySelector(".field-guide-button").click()`);
await page.waitForTimeout(800);
await page.evaluate(`document.querySelector(".field-guide-defences-head").scrollIntoView({ block: "start" })`);
await page.waitForTimeout(400);
const entries = (await page.evaluate(`[...document.querySelectorAll(".field-guide-defence p")].map((p) => p.textContent)`)) as string[];
check(entries.length === 8 && entries.every((t) => t.startsWith("In this game")), `Field Guide: ${entries.length} defence entries, each "In this game…"`);
await page.screenshot({ path: path.join(OUT, `field-guide-defences-${W}x${H}.jpg`), type: "jpeg", quality: 85 });

check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
await server.stop();
process.exit(failed > 0 ? 1 : 0);
