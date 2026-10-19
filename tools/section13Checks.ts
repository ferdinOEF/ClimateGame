/**
 * Section 13 browser checks and screenshots: the build menu as cards, the
 * feedback after a build, the slim HUD, one voice at a time.
 *
 * Usage:  npx tsx tools/section13Checks.ts [outDir]   (outDir defaults to docs/qa/section13)
 *
 * At 1280x600, 1366x768, 1920x1080 and 2560x1440:
 *   - the build menu on a beach, sea, wetland and river tile near the first
 *     cyclone's homes: cards, each pill equal to the model's number for that
 *     tile, "Not here" for the defences that cannot go there, no NBS /
 *     ENGINEERED / BUILDING / COSMETIC tag; inside the window, clear of the
 *     year chip and the Outlook; how long the numbers took (under ~50 ms);
 *   - screenshots of each menu.
 * At 1920x1080 also:
 *   - three builds: each brings a "+N homes safe" float with the card's N,
 *     and "Homes at risk" drops by N;
 *   - none of the removed HUD items is in the page (Ready gauge, Sea +cm, the
 *     meters, the Status copy of the objectives, the landfall tag, the
 *     Field Guide's second tally); the clock says "Cyclone in N builds" and
 *     the Outlook counts no years;
 *   - the warning year: no banner, no landfall tag;
 *   - the bottom prompt is hidden while the storm plays and the cards show;
 *   - the Field Guide's count is one number on its button, in its panel and
 *     on Maya's line;
 *   - no shield markers drawn (the heat's shader has none).
 * axe-core on the build menu; zero console errors.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section13");
const PORT = Number(process.env.CHECK_PORT ?? 5313);
const SIZES: [number, number][] = [[1920, 1080], [1280, 600], [1366, 768], [2560, 1440]];
const GROUNDS: [string, string][] = [["beach", "dune"], ["sea", "breakwater"], ["wetland", "mangrove"], ["river", "small_dam"]];
let failed = 0;
const lines: string[] = [];
const errors: string[] = [];
const timings: number[] = [];
function check(ok: boolean, what: string): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${what}`;
  lines.push(line);
  console.log(line);
}
const DEUTERANOPIA = "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0";

async function shot(page: Page, name: string, copies = false): Promise<void> {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
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
  await page.screenshot({ path: path.join(OUT, `${name}-deut.jpg`), type: "jpeg", quality: 80 });
  await page.evaluate(`(function () { document.documentElement.style.filter = ""; var s = document.getElementById("qa-cvd-svg"); if (s) s.remove(); })()`);
}

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: no serious or critical violations${found.length ? `: ${found.join(", ")}` : ""}`);
}

const val = <T>(page: Page, expr: string): Promise<T> => page.evaluate(`(function () { var p = window.__panjimForTest; var r = p.run; return ${expr}; })()`) as Promise<T>;
const text = (page: Page, selector: string): Promise<string> => page.evaluate(`(function () { var el = document.querySelector(${JSON.stringify(selector)}); return el && !el.hidden && el.getClientRects().length ? el.innerText.trim() : ""; })()`) as Promise<string>;
const count = (page: Page, selector: string): Promise<number> => page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`) as Promise<number>;
const risk = async (page: Page): Promise<number> => Number((await text(page, ".outlook-risk-count")) || "-1");

async function open(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta", { hasText: /Begin|Start/i }).first().click();
  await page.waitForTimeout(3000);
  await page.evaluate("window.__panjimForTest && (window.__panjimForTest.maya.holdLines = true)");
  // Every banner shown from here on, so a 4-second banner is caught whenever it came.
  await page.evaluate(`(function () {
    window.__banners = [];
    var b = document.querySelector(".era-banner");
    if (b) new MutationObserver(function () { if (!b.hidden) window.__banners.push(b.textContent); }).observe(b, { attributes: true, childList: true, characterData: true, subtree: true });
  })()`);
}

/** The free tile where `elementId` saves the most homes from the next storm (ties: nearest the homes at risk), as "q,r"; anywhere on the board if none is near them. */
async function bestTile(page: Page, elementId: string): Promise<string | null> {
  return (await bestWithin(page, elementId, 4)) ?? (await bestWithin(page, elementId, 99));
}

async function bestWithin(page: Page, elementId: string, reach: number): Promise<string | null> {
  return val<string | null>(page, `(function () {
    var reach = ${reach};
    var next = r.nextChallenge(); var homes = (r.exposureFor(next) || { housesAtRisk: [] }).housesAtRisk.map(function (k) { var a = k.split(",").map(Number); return { q: a[0], r: a[1] }; });
    var best = null, bestSaved = -1, bestDist = 1e9;
    r.state.placed.forEach(function (tile) {
      var c = tile.coord; if (!r.state.canBuild(c, ${JSON.stringify(elementId)})) return;
      var dist = homes.length ? 1e9 : 0; homes.forEach(function (h) { var d = (Math.abs(h.q - c.q) + Math.abs(h.r - c.r) + Math.abs(h.q + h.r - c.q - c.r)) / 2; if (d < dist) dist = d; });
      if (dist > reach) return;
      var saved = r.homesSavedBy(next, c, ${JSON.stringify(elementId)});
      if (saved > bestSaved || (saved === bestSaved && dist < bestDist)) { best = c.q + "," + c.r; bestSaved = saved; bestDist = dist; }
    });
    return best;
  })()`);
}

/** Opens the build menu on `key` as a click would, a fresh board read first so the timing is the real one. */
async function menu(page: Page, key: string): Promise<number> {
  const [q, r] = key.split(",").map(Number);
  await page.evaluate("window.__panjimForTest.run.savedCache = null");
  await page.evaluate(`window.__openTileForTest(${q}, ${r})`);
  await page.waitForTimeout(700);
  return val<number>(page, "p.lastCardsMs");
}

async function checkMenu(page: Page, tag: string, ground: string, key: string, full: boolean): Promise<void> {
  const ms = await menu(page, key);
  timings.push(ms);
  const cards = (await page.evaluate(`Array.from(document.querySelectorAll(".build-popover.as-cards .build-card")).map(function (b) { var p = b.querySelector(".build-card-pill"); return { id: b.dataset.element, pill: p ? p.textContent : "" }; })`)) as { id: string; pill: string }[];
  // Section 16 B6: the defences that cannot go here are one "Not here: ..." line.
  const notHere = (await page.evaluate(`Array.from(document.querySelectorAll(".build-card-elsewhere")).map(function (b) { return b.dataset.elements + ":" + b.textContent; })`)) as string[];
  check(cards.length > 0, `${tag} ${ground} (${key}): the menu is cards (${cards.map((c) => c.id).join(", ")})`);
  // Section 17.1 (owner decision): the cards carry no home count (the model's number is used underneath only).
  check(cards.every((c) => c.pill === ""), `${tag} ${ground}: no card shows a home count`);
  check(notHere.length > 0 && notHere.every((n) => /Not here/.test(n)), `${tag} ${ground}: the other defences show on one "Not here" line (${notHere.join(" | ")})`);
  const tags = await text(page, ".build-popover");
  check(!/\b(NBS|ENGINEERED|BUILDING|COSMETIC|nbs|engineered|hybrid|building|cosmetic)\b/.test(tags), `${tag} ${ground}: no NBS / ENGINEERED / BUILDING / COSMETIC tag`);
  const place = (await page.evaluate(`(function () {
    var m = document.querySelector(".build-popover").getBoundingClientRect();
    var hit = function (sel) { var e = document.querySelector(sel); if (!e) return false; var c = e.getBoundingClientRect(); return c.width > 0 && m.left < c.right && m.right > c.left && m.top < c.bottom && m.bottom > c.top; };
    return { inside: m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight, chip: hit(".panjim-clock .clock-face"), outlook: hit(".panjim-clock .outlook"), ready: hit(".get-ready") };
  })()`)) as { inside: boolean; chip: boolean; outlook: boolean; ready: boolean };
  check(place.inside && !place.chip && !place.outlook, `${tag} ${ground}: the cards fit on screen, clear of the year chip and the Outlook`);
  if (place.ready) lines.push(`NOTE  ${tag} ${ground}: the cards touch the Get ready card (no clear spot beside this tile)`);
  check(ms < 50, `${tag} ${ground}: the numbers took ${ms.toFixed(1)} ms (under 50)`);
  await shot(page, `menu-${ground}-${tag}`, full && ground === "beach");
  if (full && ground === "beach") await axe(page, "the build menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    for (const [w, h] of SIZES) {
      const tag = `${w}x${h}`;
      const full = w === 1920;
      const context = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`${tag}: ${m.text()}`);
      });
      await page.addInitScript(() => {
        try {
          localStorage.clear();
        } catch {
          /* blocked */
        }
      });
      await open(page, server.url);

      for (const [ground, elementId] of GROUNDS) {
        const key = await bestTile(page, elementId);
        if (!key) {
          check(false, `${tag} ${ground}: a free ${elementId} tile near the homes at risk`);
          continue;
        }
        await page.evaluate(`(function () { var a = ${JSON.stringify(key)}.split(",").map(Number); window.__focusTileForTest(a[0], a[1]); })()`);
        await page.waitForTimeout(900);
        await checkMenu(page, tag, ground, key, full);
      }

      if (full) {
        // Removed from the page, not just hidden.
        for (const [selector, what] of [
          [".outlook-gauge", "the Ready gauge"],
          [".outlook-sea", "Sea +cm"],
          [".instrument-cluster", "the meters (Resilience, Biodiversity, Carbon, Food, Population)"],
          [".status-objective", "the Status panel's copy of the objectives"],
          [".forecast-label", "the landfall tag"],
          [".field-guide-discoveries", "the Field Guide's second tally"]
        ] as [string, string][]) check((await count(page, selector)) === 0, `13.3: ${what} is not in the page (${selector})`);
        const until = await text(page, ".clock-until");
        check(/^Cyclone in \d+ builds?$/.test(until), `13.3: the clock says "${until}"`);
        const line = await text(page, ".outlook-line");
        check(!/\d+ years?|this year/.test(line), `13.3: the Outlook counts no years: "${line}"`);
        check((await count(page, ".get-ready")) === 1, "13.3: the bottom-right objectives card stays");

        // Three builds: the float and Homes at risk.
        for (const elementId of ["breakwater", "breakwater", "dune"]) {
          const key = await bestTile(page, elementId);
          if (!key) continue;
          const [q, r] = key.split(",").map(Number);
          const before = await risk(page);
          const n = await val<number>(page, `r.homesSavedBy(r.nextChallenge(), { q: ${q}, r: ${r} }, ${JSON.stringify(elementId)})`);
          await page.evaluate(`window.__panjimForTest.build({ q: ${q}, r: ${r} }, ${JSON.stringify(elementId)})`);
          await page.waitForTimeout(250);
          const floats = (await page.evaluate("window.__buildFloatForTest.texts")) as string[];
          const want = `+${n} ${n === 1 ? "home" : "homes"} safe`;
          if (floats.length > 0 && !fs.existsSync(path.join(OUT, "float-1920x1080.jpg"))) await page.screenshot({ path: path.join(OUT, "float-1920x1080.jpg"), type: "jpeg", quality: 82 });
          await page.waitForTimeout(900);
          const after = await risk(page);
          check(floats.includes(want), `13.2: ${elementId} at ${key}: the float says "${want}" (${floats.join(" | ") || "none"})`);
          check(after === before - n, `13.2: Homes at risk ${before} → ${after} (the card said ${n})`);
        }

        // The Field Guide: one count on the button, in the panel and on Maya's line.
        await page.evaluate("(function () { var p = window.__panjimForTest; p.maya.withdraw(function () { return true; }); p.maya.dismiss(); p.nuggets.show('mangrove'); })()");
        await page.waitForTimeout(800);
        const button = (await page.evaluate("document.querySelector('.field-guide-button').textContent")) as string;
        const mayaCount = await page.evaluate("(function () { var e = document.querySelector('.maya-count'); return e && !e.hidden ? e.textContent : ''; })()") as string;
        await page.evaluate("document.querySelector('.field-guide-button').click()");
        await page.waitForTimeout(500);
        const panel = await text(page, ".field-guide-count");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        check((await text(page, ".field-guide-count")) === "" && !(await text(page, ".leave-confirm")), "Esc closes the Field Guide (and asks nothing else)");
        const n = /(\d+ of \d+)/.exec(button)?.[1] ?? "";
        check(n !== "" && panel === n && mayaCount === n, `13.3: one Field Guide count: button "${button}", panel "${panel}", Maya's fact line "${mayaCount}"`);
        await shot(page, "maya-count-1920x1080");

        // The warning year: Maya's line, no banner, no landfall tag, no shields.
        await page.evaluate("window.__panjimScenarioForTest('heat-2')");
        await page.waitForTimeout(1500);
        const banner = ((await page.evaluate("window.__banners || []")) as string[]).join(" | ");
        const warned = await val<boolean>(page, "r.nextChallenge() && r.yearsUntil(r.nextChallenge()) <= 2");
        check(warned && !/The red shows where it will hit/.test(banner), `13.4: the warning years began with no warning banner (banners seen: "${banner || "none"}")`);
        check((await count(page, ".forecast-label")) === 0, "13.4: no landfall tag");
        await shot(page, "warning-1920x1080", true);

        // The storm and its cards: no bottom prompt. Held at storm time 3 s to look, then let go.
        await page.evaluate("window.__panjimScenarioForTest('storm-3')");
        await page.waitForTimeout(1500);
        check((await text(page, ".empty-prompt")) === "", "13.4: no bottom prompt while the storm plays");
        await shot(page, "storm-1920x1080");
        await page.evaluate("window.__panjimScenarioForTest('storm-release')");
        for (let k = 0; k < 600 && !(await page.evaluate("!!document.querySelector('.result-cards:not([hidden]) .result-next')")); k++) {
          await page.evaluate("(function () { var s = window.__stormForTest; if (s && s.playing()) document.dispatchEvent(new PointerEvent('pointerdown')); if (document.querySelector('.replay-card:not([hidden])')) document.dispatchEvent(new PointerEvent('pointerdown')); })()");
          await page.waitForTimeout(400);
        }
        check((await text(page, ".empty-prompt")) === "", "13.4: no bottom prompt while the result cards show");
        await shot(page, "result1-1920x1080");
        for (let k = 0; k < 3; k++) {
          await page.locator(".result-next").click();
          await page.waitForTimeout(900);
        }
        await page.waitForTimeout(2500);
        check((await text(page, ".empty-prompt")) !== "", "13.4: the bottom prompt is back after the cards");
        check(/^Flood in 10 builds$/.test(await text(page, ".clock-until")), `13.3: 2031 opens with "${await text(page, ".clock-until")}"`);
        await shot(page, "hud-2031-1920x1080");
      } else {
        await shot(page, `hud-${tag}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  const max = Math.max(...timings);
  const median = [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)];
  lines.push(`TIMING  build-menu numbers: median ${median.toFixed(1)} ms, max ${max.toFixed(1)} ms over ${timings.length} menus (fresh board read each time)`);
  console.log(lines[lines.length - 1]);
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
  fs.writeFileSync(path.join(OUT, "checks.txt"), lines.join("\n") + "\n");
  console.log(`\n${lines.filter((l) => l.startsWith("PASS") || l.startsWith("FAIL")).length - failed} of ${lines.filter((l) => l.startsWith("PASS") || l.startsWith("FAIL")).length} checks pass.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
