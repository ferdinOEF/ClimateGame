/**
 * Section 19 (the owner's third round of map edits; the east edge out of
 * Panjim): screenshots and browser checks at one window size.
 *
 *   - the opening view after Begin;
 *   - the east edge close up (Ribandar to the east of St Cruz and Merces), and a
 *     click on it: only the note "Outside Panjim, not part of this game";
 *     a click on the north bank still says its own note;
 *   - Miramar beach close up, with the 2026 cone onto Sharada Mandir School;
 *   - the 2031 flood cone, from the Mandovi through the Ribandar channel.
 * Gray and deuteranopia copies of the 1920 east edge. axe-core; zero console errors.
 *
 * Usage: npx tsx tools/section19Shots.ts <width> <height> [outDir]. Exits 1 if a check fails.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1920", h = "1080", outDir = "docs/qa/section19"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });
const DEUTERANOPIA = "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0";
const world = (q: number, r: number): { x: number; z: number } => ({ x: Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r, z: 1.5 * r });
const server = await startDevServer(Number(process.env.PORT ?? 5471));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};

async function shot(page: Page, name: string, copies = false): Promise<void> {
  await page.waitForTimeout(700);
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

async function axe(page: Page, label: string): Promise<void> {
  if (!(await page.evaluate("typeof window.axe !== 'undefined'"))) await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: no serious or critical violations${found.length ? `: ${found.join(", ")}` : ""}`);
}

/** Centres the camera on a point from the same zoom every time: fully out, then `steps` in. */
async function focus(page: Page, p: { x: number; z: number }, steps: number): Promise<void> {
  await page.evaluate(`window.__focusOnForTest(${p.x}, ${p.z}, false)`);
  await page.mouse.move(W / 2, H / 2);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(2500);
  await page.mouse.move(2, H - 2);
}

/** Clicks a tile as a player would; returns the note shown (or the build menu's first line). */
async function clickTile(page: Page, q: number, r: number): Promise<{ note: string; menu: boolean }> {
  const p = (await page.evaluate(`window.__projectTileForTest(${q}, ${r})`)) as { x: number; y: number };
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(900);
  const out = (await page.evaluate(`({
    note: Array.from(document.querySelectorAll(".build-popover, .build-note, .tile-note")).filter((el) => el.getClientRects().length && !el.hidden).map((el) => el.innerText.trim()).join(" | "),
    menu: document.querySelectorAll(".build-popover .build-card").length > 0
  })`)) as { note: string; menu: boolean };
  // Esc only when something is open: with nothing open it asks to leave Panjim.
  if (out.menu || out.note) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  return out;
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
await page.goto(`${server.url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3500);
await page.mouse.move(2, H - 2);
await shot(page, "opening");
await axe(page, "the opening board");

// The east edge: centred east of St Cruz and Merces, the band and the water through it.
await focus(page, world(26, 14), 4);
await shot(page, "east-edge", W === 1920);
const east = await clickTile(page, 27, 13);
check(east.note === "Outside Panjim, not part of this game" && !east.menu, `a click on the east edge shows only the note: "${east.note}"`);
const merces = await clickTile(page, 19, 16);
check(merces.menu || !/Outside Panjim|North of the Mandovi/.test(merces.note), `Merces stays playable: "${merces.note.replace(/\s+/g, " ").slice(0, 60)}"`);
await focus(page, world(1, 6), 4);
const north = await clickTile(page, 1, 6);
check(north.note === "North of the Mandovi: not part of this game" && !north.menu, `a click on the north bank still shows its note: "${north.note}"`);

// Miramar beach, with the 2026 cone onto Sharada Mandir School.
await focus(page, world(-4, 19), 5);
const cone2026 = (await page.evaluate(`window.__coneForTest.isShown && window.__coneForTest.tileCount > 0`)) as boolean;
check(cone2026, "2026: the cyclone's cone is on the map");
await shot(page, "miramar-cone-2026");

// 2031: the flood's cone, from the Mandovi through the Ribandar channel.
await page.evaluate(`window.__panjimScenarioForTest("year-6")`);
await page.waitForTimeout(3500);
const year = (await page.evaluate("window.__panjimForTest.run.year")) as number;
const cone2031 = (await page.evaluate(`window.__coneForTest.isShown && window.__coneForTest.tileCount > 0`)) as boolean;
check(year === 2031 && cone2031, `2031 opens with the flood's cone on the map (year ${year})`);
await page.mouse.move(2, H - 2);
await shot(page, "cone-2031");
await focus(page, world(20, 11), 2);
await shot(page, "cone-2031-mandovi");

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${W}x${H})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
