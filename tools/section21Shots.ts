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
 *   - a damaged landmark close up (after 2030, 2040 or a partly defended 2050) and a destroyed one.
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
const DEUTERANOPIA = "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0";
/** A screenshot; with `copies`, a grayscale and a deuteranopia twin too (the QA gate's key shots). */
async function shot(page: Page, name: string, copies = false): Promise<void> {
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 82 });
  if (!copies) return;
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}-gray.jpg`), type: "jpeg", quality: 75 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
  await page.evaluate(`(function () {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0"); svg.id = "qa-cvd-svg";
    svg.innerHTML = '<filter id="qa-cvd"><feColorMatrix type="matrix" values="${DEUTERANOPIA}"/></filter>';
    document.body.appendChild(svg); document.documentElement.style.filter = "url(#qa-cvd)";
  })()`);
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}-deut.jpg`), type: "jpeg", quality: 80 });
  await page.evaluate(`(function () { document.documentElement.style.filter = ""; var s = document.getElementById("qa-cvd-svg"); if (s) s.remove(); })()`);
}

/** axe-core: no serious or critical violations on what is open now. */
async function axe(page: Page, label: string): Promise<void> {
  if (!(await page.evaluate("typeof window.axe !== 'undefined'"))) await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: no serious or critical violations${found.length ? `: ${found.join(", ")}` : ""}`);
}

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
await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
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
await shot(page, "risk-heat-year", true);
await axe(page, "the board in a heat year, Show risk on");

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
// Homes go as the water reaches them: none at the start, the first some seconds in (this run's dune saved most).
check(ruinedAt[0] === 0 && ruinedAt[ruinedAt.length - 1] > 0 && ruinedAt.findIndex((n) => n > 0) > 2, `homes drop into ruins during the storm, as the water reaches them (ruins by storm second: ${ruinedAt.join(" ")})`);
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
  if (name === "2030") await axe(page, "the 2030 result card");
  check(!!card && card.total - card.saved === outcome.total - outcome.saved && ruined - ruinsBefore === outcome.damaged, `${name}: the card reads ${card?.saved} of ${card?.total} homes saved; ${ruined - ruinsBefore} new ruins on the board, the ${outcome.damaged} homes the storm destroyed (${ruined} in all)`);
  // The cards shut, the board behind them.
  for (let k = 0; k < 4 && (await page.locator(".result-next").isVisible().catch(() => false)); k++) {
    await page.locator(".result-next").click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(1500);
  await focus(page, frame, steps);
  await shot(page, `ruins-${name}`, name === "2050");
  return ruined;
}

type Landmark = { id: string; name: string; kind: string; q: number; r: number; damage: number };
const damagedNow = (): Promise<Landmark[]> => page.evaluate("window.__ruinsForTest().landmarks") as Promise<Landmark[]>;
const shotLevels = new Set<number>();
/** A damaged (1) or destroyed (2) landmark close up (the contact sheet's three quarter view), the cards and the HUD hidden; the camera goes back after. */
async function closeUp(level: 1 | 2, landmarks: Landmark[]): Promise<void> {
  if (shotLevels.has(level)) return;
  const l = landmarks.find((x) => x.damage === level && !["park", "beach", "viewpoint"].includes(x.kind)) ?? landmarks.find((x) => x.damage === level);
  if (!l) return;
  shotLevels.add(level);
  const hide = await page.addStyleTag({ content: "body * { visibility: hidden !important; } canvas { visibility: visible !important; }" });
  await page.evaluate(`(() => {
    const cam = window.__cameraForTest;
    const x = ${world(l.q, l.r).x}, z = ${world(l.q, l.r).z};
    const y = window.__tileHeightForTest(${l.q}, ${l.r}) + 0.3;
    window.__focusOnForTest(x, z, true);
    const el = 34 * Math.PI / 180, az = -32 * Math.PI / 180, d = 3.4;
    cam.position.set(x + Math.sin(az) * Math.cos(el) * d, y + Math.sin(el) * d, z + Math.cos(az) * Math.cos(el) * d);
    cam.lookAt(x, y, z);
    cam.updateMatrixWorld();
  })()`);
  await page.waitForTimeout(1500);
  await shot(page, `landmark-${level === 2 ? "destroyed" : "damaged"}-${l.id}`);
  await hide.evaluate((el) => (el as Element).remove());
  console.log(`INFO ${l.name}: ${level === 2 ? "destroyed" : "damaged"}, close up`);
}

let ruins = await afterStorm("2030", world(-3, 19), 5, 0);
await closeUp(1, await damagedNow());
// The 2040 flood, undefended, frame by frame on Merces and St Cruz: the homes drop into ruins as the water comes.
await page.evaluate(`window.__panjimScenarioForTest("storm-2")`);
await focus(page, world(15, 17), 4);
const floodRuins: number[] = [];
for (let t = 2; t <= 40; t += 2) {
  await page.evaluate(`window.__panjimForTest.host.challengeFx.freeze(${t})`);
  await page.waitForTimeout(600);
  const n = (await page.evaluate("window.__ruinsForTest().ruined")) as number;
  floodRuins.push(n - ruins);
  await page.screenshot({ path: path.join(OUT, "frames", `flood-2040-t${String(t).padStart(2, "0")}-${W}x${H}.jpg`), type: "jpeg", quality: 78 });
}
check(floodRuins[0] === 0 && floodRuins[floodRuins.length - 1] > 10 && floodRuins.some((n) => n > 0 && n < floodRuins[floodRuins.length - 1]), `the flood's homes drop into ruins as the water spreads, not all at once (new ruins every 2 s of storm time: ${floodRuins.join(" ")})`);
await page.evaluate(`window.__panjimForTest.host.challengeFx.freeze(null)`);
ruins = await afterStorm("2040", world(14, 18), 3, ruins);
await closeUp(1, await damagedNow());
// 2050 partly defended (eight defences beside the homes at risk, as a player answering the warning): undefended,
// every landmark ends destroyed; defended in part, some are only damaged (Section 21.3's two looks).
await page.evaluate(`window.__panjimScenarioForTest("defend-risk")`).catch(() => undefined);
await page.evaluate(`window.__panjimScenarioForTest("to-results")`).catch(() => undefined);
ruins = await afterStorm("2050", world(4, 20), 3, ruins);
const landmarks = await damagedNow();
check(landmarks.length > 0, `landmarks damaged over the run: ${landmarks.map((l) => `${l.name} (${l.damage === 2 ? "destroyed" : "damaged"})`).join(", ")}`);
await closeUp(1, landmarks);
await closeUp(2, landmarks);
check(shotLevels.size === 2, `a damaged and a destroyed landmark close up (${[...shotLevels].join(", ") || "none"})`);

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${W}x${H})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
