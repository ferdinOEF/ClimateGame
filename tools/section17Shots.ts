/**
 * Section 17's screenshots and browser checks, at one window size:
 *   - the build menu on a beach, a wetland (estuary) and a river tile: no home
 *     count, no "Best here", nature-based cards first, no sand mining;
 *   - the objective card at the start of each phase (2026, 2031, 2041): every
 *     row asks for a dune, pandanus, mangrove or khazan;
 *   - How to play.
 * Usage: npx tsx tools/section17Shots.ts <width> <height> [outDir]. Exits 1 if a check fails.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const [w = "1366", h = "768", outDir = "docs/qa/section17"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
fs.mkdirSync(outDir, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5417));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = (page: Page, name: string) => page.screenshot({ path: `${outDir}/${name}-${W}x${H}.jpg`, type: "jpeg", quality: 82 });
const NATURE = ["dune", "sandy_vegetation", "mangrove", "khazan"];
const ORDER = ["dune", "sandy_vegetation", "mangrove", "khazan", "seawall", "breakwater", "small_dam"];

const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${server.url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await wait(1500);
await page.locator(".brief-cta").first().click();
await wait(3000);

// ---- The build menu on three kinds of ground --------------------------------
for (const [ground, element] of [["beach", "dune"], ["wetland", "mangrove"], ["river", "small_dam"]] as const) {
  const opened = await page.evaluate(`(() => {
    const p = window.__panjimForTest;
    const t = p.firstBuildable(${JSON.stringify(element)});
    if (!t) return false;
    return window.__openTileForTest(t.q, t.r);
  })()`);
  check(opened === true, `the build menu opens on a ${ground} tile`);
  await page.mouse.move(2, H - 2);
  await wait(900);
  await shot(page, `build-menu-${ground}`);
  const menu = (await page.evaluate(`({
    cards: Array.from(document.querySelectorAll(".build-popover .build-card")).map((b) => b.dataset.element),
    text: document.querySelector(".build-popover").innerText,
    pills: document.querySelectorAll(".build-popover .build-card-pill, .build-popover .build-card-best").length,
    notHere: document.querySelector(".build-popover .build-card-elsewhere")?.textContent ?? ""
  })`)) as { cards: string[]; text: string; pills: number; notHere: string };
  check(menu.pills === 0 && !/Protects \d|Best here|homes? here/i.test(menu.text), `${ground}: no home count and no Best here (${menu.cards.join(", ")})`);
  const ranks = menu.cards.map((id) => ORDER.indexOf(id));
  check(ranks.every((rank, i) => rank >= 0 && (i === 0 || rank > ranks[i - 1])), `${ground}: the cards in the fixed order, nature-based first`);
  check(!/sand mining/i.test(menu.text) && !menu.cards.includes("sand_mining"), `${ground}: no sand mining, on a card or the Not here line ("${menu.notHere}")`);
  await page.keyboard.press("Escape");
  await wait(400);
}

// ---- The objective card at each phase's start --------------------------------
async function objectiveCard(name: string): Promise<void> {
  await page.evaluate(`document.querySelector(".maya-bubble .maya-dismiss, .maya-bubble button")?.click()`).catch(() => undefined);
  await wait(800);
  await shot(page, name);
  const rows = (await page.evaluate(`(() => {
    const p = window.__panjimForTest;
    const next = p.run.nextChallenge();
    return { year: p.run.year, rows: p.run.prep.filter((j) => next && j.challengeId === next.id).map((j) => ({ id: j.elementId, label: j.label })), card: document.querySelector(".objectives-panel")?.innerText ?? "" };
  })()`)) as { year: number; rows: { id: string; label: string }[]; card: string };
  check(rows.rows.length > 0, `${rows.year}: the objective has rows (${rows.rows.map((r) => r.label).join("; ")})`);
  check(rows.rows.every((r) => NATURE.includes(r.id)) && !/seawall|breakwater|small dam/i.test(rows.card), `${rows.year}: every row asks for a dune, pandanus, mangrove or khazan`);
}
await objectiveCard("objective-phase-1");
await page.evaluate(`window.__panjimScenarioForTest("year-6")`);
await wait(2500);
await objectiveCard("objective-phase-2");
await page.evaluate(`window.__panjimScenarioForTest("year-16")`);
await wait(2500);
await objectiveCard("objective-phase-3");

// ---- Help --------------------------------------------------------------------
await page.locator(".help-button").click();
await wait(1500);
await shot(page, "help");
const help = (await page.evaluate(`document.querySelector(".help-card").innerText`)) as string;
check(!/biggest|numbers? on the cards|Protects \d|sand mining/i.test(help), "Help never tells the player to pick the biggest number, and never names sand mining");
check(/The cards/.test(help) && /Nature based ones come first/.test(help), "Help's cards section says nature-based ones come first");

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${W}x${H})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
