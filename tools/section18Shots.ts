/**
 * Section 18's screenshots and checks at one window size: the start popup (the
 * first frame), the board at the default zoom after it (the key shot: grayscale
 * and deuteranopia copies at 1920x1080), a landmark's name card on hover, and
 * the Field Guide's humpback dolphin page with its cited fact; axe-core on each.
 * Usage: npx tsx tools/section18Shots.ts <width> <height> [outDir]. Exits 1 if a check fails.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1920", h = "1080", outDir = "docs/qa/section18"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });
const DEUTERANOPIA = "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0";
const server = await startDevServer(Number(process.env.PORT ?? 5465));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function shot(page: Page, name: string, copies = false): Promise<void> {
  await wait(700);
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
await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await wait(2500);
await shot(page, "first-frame");
await axe(page, "the start popup");
await page.locator(".brief-cta").first().click();
await wait(3500);
await page.mouse.move(2, H - 2);
await shot(page, "board-after", W === 1920);
await axe(page, "the board");
const counts = (await page.evaluate("window.__monumentsForTest()")) as Record<string, number>;
const total = Object.values(counts).reduce((a, b) => a + b, 0);
check(total === 16 && Object.keys(counts).length === 16, `16 landmarks on the board, each its own model (${Object.keys(counts).length} models)`);
check(!(await page.evaluate("Array.from(document.querySelectorAll('.maya, .maya-full-figure')).some((el) => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none')")), "Maya stays hidden");

// A landmark's name card on hover: the church, over its own model.
const church = (await page.evaluate("window.__projectTileForTest(11, 8)")) as { x: number; y: number };
await page.mouse.move(church.x, church.y - 20);
await wait(1500);
const card = (await page.evaluate("Array.from(document.querySelectorAll('.map-label, .monument-card, .name-card')).filter((el) => el.getClientRects().length && /Immaculate/.test(el.textContent || '')).length")) as number;
check(card > 0, "hovering the church's model names it");
await shot(page, "hover-church");
await page.mouse.move(2, H - 2);

// The Field Guide's dolphin page, once spotted.
await page.evaluate(`window.__panjimForTest.spotted(["humpback_dolphin"])`);
await wait(500);
await page.evaluate(`document.querySelector(".field-guide-button").click()`);
await wait(900);
const guide = (await page.evaluate(`document.querySelector(".field-guide-card").innerText`)) as string;
check(/Humpback Dolphin/.test(guide) && /500 metres of the coast/.test(guide) && /Source: Mongabay India, 2018/.test(guide), "the Field Guide's dolphin page carries its cited fact");
check(!/(mangrove|dune|khazan|defence)s? (bring|draw|attract)/i.test(guide), "the Field Guide never says a defence brings dolphins");
await shot(page, "field-guide-dolphin");
await axe(page, "the Field Guide");

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${W}x${H})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
