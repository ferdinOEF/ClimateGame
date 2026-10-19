/**
 * Section 21.3 and 21.4 in the browser, at one window size, on a run with
 * nothing built (every year's build away from the storms):
 *   - Show risk off at the start; on in 2027 by R: the heat on the homes the
 *     next storm would take today, as many as the top bar's Homes at risk;
 *     a dune in front of Sharada Mandir School, and the heat drops with it;
 *   - a heat year (two years out): Show risk on by itself;
 *   - each storm: frames as its homes drop into ruins (2030 only, every
 *     second of storm time); after it, the ruins round its path, and the
 *     ruins on the board equal the homes lost on the result card;
 *   - after 2050: a damaged landmark close up.
 * Usage: npx tsx tools/section21Shots.ts <width> <height> [outDir]. Exits 1 if a check fails.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1920", h = "1080", outDir = "docs/qa/section21"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
const world = (q: number, r: number): { x: number; z: number } => ({ x: Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r, z: 1.5 * r });
const server = await startDevServer(Number(process.env.PORT ?? 5481));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 82 });

async function focus(page: Page, p: { x: number; z: number }, steps: number): Promise<void> {
  await page.evaluate(`window.__focusOnForTest(${p.x}, ${p.z}, false)`);
  await page.mouse.move(W / 2, H / 2);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(2200);
  await page.mouse.move(2, H - 2);
}

/** Show risk's state, the heat drawn and the top bar's Homes at risk. */
async function risk(page: Page): Promise<{ on: boolean; hot: number; homes: number; year: number }> {
  return (await page.evaluate(`({
    on: document.querySelector(".risk-toggle")?.getAttribute("aria-pressed") === "true",
    hot: window.__heatForTest.hot,
    homes: Number(document.querySelector(".outlook-risk-count")?.textContent ?? "-1"),
    year: window.__panjimForTest.run.year
  })`)) as { on: boolean; hot: number; homes: number; year: number };
}

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
await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);
await page.mouse.move(2, H - 2);

// ---- 21.4: live risk ---------------------------------------------------------
const start = await risk(page);
check(!start.on && start.hot === 0, `2026, the phase's start: Show risk is off, no heat (${JSON.stringify(start)})`);
await page.evaluate(`window.__panjimScenarioForTest("pass-year")`);
await page.waitForTimeout(2500);
await page.keyboard.press("r");
await page.waitForTimeout(1200);
const before = await risk(page);
check(before.year === 2027 && before.on && before.hot > 0 && before.hot === before.homes, `2027, R: the heat shows the homes at risk, as many as the top bar says (${JSON.stringify(before)})`);
await focus(page, world(-3, 18), 5);
await shot(page, "risk-2027-before");
// Through the player's build path (the year's build): the heat and the top bar are worked out again at once.
await page.evaluate(`window.__panjimForTest.buildNow({ q: -4, r: 18 }, "dune")`);
await page.waitForTimeout(2500);
const after = await risk(page);
check(after.on && after.hot < before.hot && after.hot === after.homes, `after a dune in front of the school: fewer homes at risk, heat and top bar agree (${before.hot} → ${after.hot}, top bar ${after.homes})`);
await shot(page, "risk-2027-after");
await page.keyboard.press("r");
await page.waitForTimeout(800);
const off = await risk(page);
check(!off.on && off.hot === 0, "R again: the heat goes");
await page.evaluate(`window.__panjimScenarioForTest("heat-2")`);
await page.waitForTimeout(3000);
const heatYear = await risk(page);
check(heatYear.on && heatYear.hot === heatYear.homes, `a heat year (${heatYear.year}): Show risk is on by itself, heat and top bar agree (${heatYear.hot}, ${heatYear.homes})`);
await focus(page, world(-3, 18), 4);
await shot(page, "risk-heat-year");

// ---- 21.3: the 2030 cyclone, frame by frame -----------------------------------
await page.evaluate(`window.__panjimScenarioForTest("storm-2")`);
await focus(page, world(-3, 19), 5);
let lastRuined = -1;
const ruinedAt: number[] = [];
for (let t = 2; t <= 30; t += 1) {
  await page.evaluate(`window.__panjimForTest.host.challengeFx.freeze(${t})`);
  await page.waitForTimeout(600);
  const ruined = (await page.evaluate("window.__ruinsForTest().ruined")) as number;
  ruinedAt.push(ruined);
  if (ruined !== lastRuined || t % 4 === 0) await page.screenshot({ path: path.join(OUT, "frames", `cyclone-2030-t${String(t).padStart(2, "0")}-${W}x${H}.jpg`), type: "jpeg", quality: 78 });
  lastRuined = ruined;
}
check(ruinedAt[0] < ruinedAt[ruinedAt.length - 1] && ruinedAt.some((n, i) => i > 0 && n > ruinedAt[0] && n < ruinedAt[ruinedAt.length - 1]), `homes drop into ruins during the storm, a few at a time (ruins by storm second: ${ruinedAt.join(" ")})`);
await page.evaluate(`window.__panjimForTest.host.challengeFx.freeze(null)`);

/** Waits for the result cards, reads the first card's homes, checks the ruins agree, shoots the ruins, and closes the cards. */
async function afterStorm(name: string, frame: { x: number; z: number }, steps: number, ruinsBefore: number): Promise<number> {
  for (let k = 0; k < 600 && !(await page.evaluate("!!document.querySelector('.result-cards:not([hidden]) .result-next')")); k++) {
    if ((await page.evaluate("window.__panjimForTest.host.challengeFx.isPlaying()")) as boolean) await page.evaluate(`document.dispatchEvent(new PointerEvent("pointerdown"))`);
    await page.waitForTimeout(300);
  }
  const card = (await page.evaluate(`(() => {
    const t = document.querySelector(".result-homes-text")?.textContent ?? "";
    const m = /(\\d+) of (\\d+) homes saved/.exec(t);
    return m ? { saved: Number(m[1]), total: Number(m[2]) } : null;
  })()`)) as { saved: number; total: number } | null;
  const id = (await page.evaluate("[...window.__panjimForTest.run.landed].pop()")) as string;
  const outcome = (await page.evaluate(`(() => { const o = window.__panjimForTest.run.outcomes.get(${JSON.stringify(id)}); return { damaged: o.housesDamaged, saved: o.housesSaved, total: o.housesTotal }; })()`)) as { damaged: number; saved: number; total: number };
  const ruined = (await page.evaluate("window.__ruinsForTest().ruined")) as number;
  check(!!card && card.total - card.saved === outcome.total - outcome.saved && ruined - ruinsBefore === outcome.damaged, `${name}: the card reads ${card?.saved} of ${card?.total} homes saved; ${ruined - ruinsBefore} new ruins on the board, the ${outcome.damaged} homes the storm destroyed (${ruined} in all)`);
  // The cards shut, the board behind them.
  for (let k = 0; k < 4 && (await page.locator(".result-next").isVisible().catch(() => false)); k++) {
    await page.locator(".result-next").click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(1500);
  await focus(page, frame, steps);
  await shot(page, `ruins-${name}`);
  return ruined;
}

let ruins = await afterStorm("2030", world(-3, 19), 5, 0);
await page.evaluate(`window.__panjimScenarioForTest("to-results")`).catch(() => undefined);
ruins = await afterStorm("2040", world(14, 18), 3, ruins);
await page.evaluate(`window.__panjimScenarioForTest("to-results")`).catch(() => undefined);
ruins = await afterStorm("2050", world(4, 20), 3, ruins);

const landmarks = (await page.evaluate("window.__ruinsForTest().landmarks")) as { id: string; name: string; kind: string; q: number; r: number; damage: number }[];
check(landmarks.length > 0, `landmarks damaged over the run: ${landmarks.map((l) => `${l.name} (${l.damage === 2 ? "destroyed" : "damaged"})`).join(", ")}`);
const building = landmarks.find((l) => !["park", "beach", "viewpoint"].includes(l.kind)) ?? landmarks[0];
if (building) {
  await page.evaluate(`(() => {
    const cam = window.__cameraForTest;
    const x = ${world(building.q, building.r).x}, z = ${world(building.q, building.r).z};
    const y = window.__tileHeightForTest(${building.q}, ${building.r}) + 0.3;
    window.__focusOnForTest(x, z, true);
    cam.position.set(x - 1.4, y + 1.5, z + 2.2);
    cam.lookAt(x, y, z);
    cam.updateMatrixWorld();
  })()`);
  await page.waitForTimeout(1500);
  await shot(page, `landmark-damaged-${building.id}`);
}

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${W}x${H})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
