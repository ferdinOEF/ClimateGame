/**
 * Section 15 browser checks and screenshots: the menu, the level select, the
 * Help page and every step of the Tutorial, at 1280x600, 1366x768, 1920x1080
 * and 2560x1440, with grayscale and deuteranopia copies of the key shots (the
 * menu and the Tutorial's build cards).
 *
 * Usage:  npx tsx tools/section15Checks.ts [outDir]   (outDir defaults to docs/qa/section15)
 *
 * Checks, at every size: no partner plate on the menu and its "Facts &
 * sources" link on screen without scrolling (Section 17b); the menu shows only
 * Tutorial and Play Panjim, with the tagline; the
 * level cards each have their board's picture, centred; Help has its five
 * pictures, loaded, and labels each section a game rule; the Tutorial plays
 * start to finish (tools/tutorialPlay.ts); no coin, meter or era text on any
 * of these screens. axe on the menu, the level select, Help and the Tutorial's
 * cards and result card (1920x1080). Zero console errors.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { FORBIDDEN_TEXT, playTutorial } from "./tutorialPlay";
import { qaUrl } from "./qaUrl";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section15");
const PORT = Number(process.env.CHECK_PORT ?? 5319);
const SIZES: [number, number][] = [[1920, 1080], [1280, 600], [1366, 768], [2560, 1440]];
let failed = 0;
const lines: string[] = [];
const errors: string[] = [];
function check(ok: boolean, what: string): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${what}`;
  lines.push(line);
  console.log(line);
}
const DEUTERANOPIA = "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0";

async function shot(page: Page, name: string, copies = false): Promise<void> {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 80 });
  if (!copies) return;
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 75 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
  await page.evaluate(`(function () {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0"); svg.id = "qa-cvd-svg";
    svg.innerHTML = '<filter id="qa-cvd"><feColorMatrix type="matrix" values="${DEUTERANOPIA}"/></filter>';
    document.body.appendChild(svg); document.documentElement.style.filter = "url(#qa-cvd)";
  })()`);
  await page.screenshot({ path: path.join(OUT, `${name}-deut.jpg`), type: "jpeg", quality: 78 });
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

async function noForbidden(page: Page, label: string): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText);
  const match = text.match(FORBIDDEN_TEXT);
  check(!match, `${label}: no coin, meter or era text${match ? ` (shows "${match[0]}")` : ""}`);
}

fs.mkdirSync(OUT, { recursive: true });
const server = await startDevServer(PORT);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const full = w === 1920;
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${tag}: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));

    // --- the menu ---------------------------------------------------------
    await page.goto(qaUrl(server.url), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".menu-screen", { timeout: 30000 });
    await page.waitForFunction(() => {
      const img = document.querySelector<HTMLImageElement>(".menu-art img");
      return Boolean(img?.complete && img.naturalWidth > 0);
    }, undefined, { timeout: 15000 });
    await page.waitForTimeout(600);
    const menu = await page.evaluate(() => {
      // Section 17b: the partner plate is hidden (SHOW_PARTNER_CREDITS, off); "Facts & sources" is a corner link.
      const link = document.querySelector(".menu-sources-link")?.getBoundingClientRect() ?? null;
      const layer = document.querySelector(".menu-screen")!.parentElement!;
      return {
        buttons: [...document.querySelectorAll(".menu-actions button")].map((b) => b.textContent?.trim()),
        tagline: document.querySelector(".menu-tagline")?.textContent ?? "",
        plates: document.querySelectorAll(".menu-credits, .menu-credits-plate, .menu-credit-logo").length,
        linkTop: link ? link.top : -1,
        linkBottom: link ? link.bottom : Infinity,
        scrollTop: layer.scrollTop,
        title: document.querySelector(".menu-title")?.textContent,
        credit: (document.querySelector(".menu-art-credit")?.textContent ?? "").includes("OpenStreetMap")
      };
    });
    check(menu.plates === 0, `${tag} menu: no "Brought to you by" plate or partner logo`);
    check(menu.linkTop >= 0 && menu.linkBottom <= h + 0.5 && menu.scrollTop === 0, `${tag} menu: the "Facts & sources" link is on screen without scrolling (${Math.round(menu.linkTop)} to ${Math.round(menu.linkBottom)} of ${h})`);
    // Section 16.3: the menu's second button is Play Panjim; the level select keeps its own address.
    check(JSON.stringify(menu.buttons) === JSON.stringify(["Tutorial", "Play Panjim"]), `${tag} menu: only Tutorial and Play Panjim (${menu.buttons.join(", ")})`);
    check(menu.title === "Riptide Rising" && menu.tagline === "Twenty five years of Panjim. Three storms. One build a year." && menu.credit, `${tag} menu: the name, the tagline, and the header render's OpenStreetMap credit`);
    await noForbidden(page, `${tag} menu`);
    await shot(page, `menu-${tag}`, full);
    if (full) await axe(page, "menu");

    // --- the level select -------------------------------------------------
    await page.goto(`${server.url}/?qa=1#/levels`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".level-grid", { timeout: 10000 });
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".level-card-thumb img")].every((img) => img.complete && img.naturalWidth > 0), undefined, { timeout: 15000 });
    const cards = await page.evaluate(() => {
      const grid = document.querySelector(".level-grid")!.getBoundingClientRect();
      const boxes = [...document.querySelectorAll(".level-card")].map((c) => c.getBoundingClientRect());
      const left = Math.min(...boxes.map((b) => b.left)) - grid.left;
      const right = grid.right - Math.max(...boxes.map((b) => b.right));
      return { count: boxes.length, thumbs: document.querySelectorAll(".level-card-thumb img").length, left, right, text: [...document.querySelectorAll(".level-card")].map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ")) };
    });
    check(cards.count === 2 && cards.thumbs === 2, `${tag} level select: two cards, each with its board's picture`);
    check(Math.abs(cards.left - cards.right) <= 2, `${tag} level select: the cards are centred (${Math.round(cards.left)} px left, ${Math.round(cards.right)} px right)`);
    if (full) lines.push(`      cards: ${cards.text.join(" | ")}`);
    await noForbidden(page, `${tag} level select`);
    await shot(page, `levels-${tag}`);
    if (full) await axe(page, "level select");

    // --- Help (from inside the Tutorial, where the ? button is) -------------
    await page.goto(`${server.url}/?qa=1#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card", { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(800);
    await page.locator(".help-button, [aria-label='How to play'], .hud-help").first().click();
    await page.waitForSelector(".help-backdrop:not([hidden]) .panjim-help", { timeout: 5000 });
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".panjim-help-pic")].every((img) => img.complete && img.naturalWidth > 0), undefined, { timeout: 15000 });
    const help = await page.evaluate(() => ({
      pics: document.querySelectorAll(".panjim-help-pic").length,
      rules: document.querySelectorAll(".panjim-help-item .result-rule").length,
      sections: document.querySelectorAll(".panjim-help-item").length,
      words: (document.querySelector(".panjim-help") as HTMLElement).innerText.split(/\s+/).length,
      overflowX: (() => {
        const card = document.querySelector(".help-card")!;
        return card.scrollWidth > card.clientWidth + 1;
      })()
    }));
    check(help.pics === 5 && help.sections === 5 && help.rules === 5, `${tag} Help: five sections, each with a game render and labelled a game rule`);
    check(help.words < 260 && !help.overflowX, `${tag} Help: short (${help.words} words) and no sideways scroll`);
    await noForbidden(page, `${tag} Help`);
    await shot(page, `help-${tag}`);
    if (full) await axe(page, "Help");
    await page.keyboard.press("Escape");
    await page.locator(".help-close").first().click().catch(() => undefined);

    // --- the Tutorial, start to finish -----------------------------------
    await page.goto(`${server.url}/?qa=1#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    const problems: string[] = [];
    let axed = false;
    const ok = await playTutorial(page, {
      problems,
      log: (line) => lines.push(`      ${tag} ${line}`),
      shot: async (name) => {
        await shot(page, `${name}-${tag}`, full && name === "tutorial-3-cards");
        if (full && (name === "tutorial-3-cards" || name === "tutorial-7-result")) {
          await axe(page, `Tutorial ${name.slice(11)}`);
          axed = true;
        }
      }
    });
    check(ok && problems.length === 0, `${tag} Tutorial: played start to finish${problems.length ? `: ${problems.join("; ")}` : ""}`);
    if (full) check(axed, "axe ran on the Tutorial");
    await shot(page, `tutorial-8-panaji-${tag}`);
    await context.close();
  }
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
} finally {
  await browser.close();
  server.stop();
}
fs.writeFileSync(path.join(OUT, "checks.txt"), `${lines.join("\n")}\n`);
console.log(`\n${lines.filter((l) => l.startsWith("PASS")).length} of ${lines.filter((l) => /^(PASS|FAIL)/.test(l)).length} checks pass.`);
process.exit(failed ? 1 : 0);
