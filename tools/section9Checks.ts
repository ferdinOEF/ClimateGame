/**
 * Section 9: the result cards after each storm. Browser checks on Panaji
 * (software GL).
 *
 * Usage:  npx tsx tools/section9Checks.ts [outDir]   (outDir defaults to docs/qa/section9)
 *
 *   - after each of the three storms, in order: card 1 (eyebrow, headline by
 *     stars, stars, "N of M homes saved" with a bar, places with Stood or
 *     Damaged and no heading), card 2 ("What protected your homes", one row
 *     per kind built, or "Nothing stood in the way this time."), card 3 for
 *     phases 1 and 2 (Coming up, the next storm, its line, map and legend);
 *     after the third, the final card (the three phases, the total, the
 *     stars, Play again and a link to the menu);
 *   - each button names what comes next; Back on every card after the first;
 *     Enter goes on; Esc jumps to the last card; focus stays in the cards;
 *   - no "Iconic places" heading, no note about overlap or the model, no wind;
 *   - Maya's bubble never over a card;
 *   - phase 2 starts in 2031 and phase 3 in 2041, with the cone on the map;
 *   - reduced motion: no card animation;
 *   - axe-core on every card;
 *   - screenshots of every card at 1366x768, 1920x1080 and 2560x1440, with
 *     gray (and deuteranopia) copies of card 1;
 *   - zero console errors.
 * Exits 1 if any check fails.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section9");
const PORT = Number(process.env.CHECK_PORT ?? 5309);
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

async function plainShot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 85 });
}

async function shot(page: Page, name: string): Promise<void> {
  await plainShot(page, name);
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 75 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
  await page.evaluate(`(function () {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0");
    svg.id = "qa-cvd-svg";
    svg.innerHTML = '<filter id="qa-cvd"><feColorMatrix type="matrix" values="${DEUTERANOPIA}"/></filter>';
    document.body.appendChild(svg);
    document.documentElement.style.filter = "url(#qa-cvd)";
  })()`);
  await page.screenshot({ path: path.join(OUT, `${name}-deut.jpg`), type: "jpeg", quality: 80 });
  await page.evaluate(`(function () { document.documentElement.style.filter = ""; var s = document.getElementById("qa-cvd-svg"); if (s) s.remove(); })()`);
}

async function open(browser: Browser, url: string, w: number, h: number, context?: Awaited<ReturnType<Browser["newContext"]>>): Promise<Page> {
  const ctx = context ?? (await browser.newContext({ viewport: { width: w, height: h } }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${w}x${h}: ${m.text()}`);
  });
  await page.goto(`${url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForTimeout(1200);
  return page;
}

async function begin(page: Page, label = /Begin|Start/i): Promise<void> {
  await page.locator(".brief-cta", { hasText: label }).first().click();
  await page.waitForTimeout(3000);
}

const scenario = (page: Page, name: string): Promise<boolean> => page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(name)})`) as Promise<boolean>;
const val = <T>(page: Page, expr: string): Promise<T> => page.evaluate(`(function () { var p = window.__panjimForTest; var r = p.run; return ${expr}; })()`) as Promise<T>;
const coneShown = (page: Page): Promise<boolean> => page.evaluate(`window.__coneForTest.isShown && window.__coneForTest.tileCount > 0`) as Promise<boolean>;
const coneGone = (page: Page): Promise<boolean> => page.evaluate(`!window.__coneForTest.isShown`) as Promise<boolean>;
/** Anything on the game screen (outside the start popup) that is a forecast chip or legend. */
const coneWords = (page: Page): Promise<number> =>
  page.evaluate(`Array.from(document.querySelectorAll(".cone-chip, .cone-legend, .forecast-cone-card, .cone-preview")).filter(function (el) { return !el.closest(".brief-backdrop[hidden]") && !el.closest(".brief-backdrop") && el.getClientRects().length > 0; }).length`) as Promise<number>;
const screenText = (page: Page): Promise<string> => page.evaluate(`document.body.innerText`) as Promise<string>;

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length + " [" + v.nodes.map((n) => n.target.join(" ") + ": " + (n.failureSummary || "").replace(/\s+/g, " ").slice(0, 160)).join(" | ") + "]");
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: ${found.length ? found.join(", ") : "no serious or critical violations"}`);
}

interface CardInfo {
  open: boolean;
  eyebrow: string;
  title: string;
  button: string;
  back: boolean;
  link: string;
  text: string;
  places: string[];
  rows: string[];
  bar: boolean;
  stars: string;
  preview: boolean;
  legend: string;
  line: string;
  scrolls: boolean;
}

const card = (page: Page): Promise<CardInfo> =>
  page.evaluate(`(function () {
    var box = document.querySelector(".result-cards");
    var c = document.querySelector(".result-card");
    var q = function (sel) { var e = c && c.querySelector(sel); return e ? e.textContent.trim() : ""; };
    return {
      open: Boolean(box && !box.hidden),
      eyebrow: q(".result-eyebrow"),
      title: q(".result-title"),
      button: q(".result-next"),
      back: Boolean(c && c.querySelector(".result-back")),
      link: q(".result-link"),
      text: c ? c.innerText : "",
      places: c ? Array.from(c.querySelectorAll(".result-places li")).map(function (li) { return li.innerText.replace(/\\s+/g, " ").trim(); }) : [],
      rows: c ? Array.from(c.querySelectorAll(".result-rows li")).map(function (li) { return li.innerText.replace(/\\s+/g, " ").trim(); }) : [],
      bar: Boolean(c && c.querySelector(".result-bar span")),
      stars: c && c.querySelector(".result-stars") ? c.querySelector(".result-stars").getAttribute("aria-label") : "",
      preview: Boolean(c && c.querySelector(".cone-preview svg")),
      legend: c ? Array.from(c.querySelectorAll(".cone-legend li")).map(function (li) { return li.textContent.trim(); }).join(" | ") : "",
      line: q(".cone-preview-line"),
      scrolls: c ? c.scrollHeight > c.clientHeight + 1 : false
    };
  })()`) as Promise<CardInfo>;

/** True when Maya's bubble is drawn over the card. */
const mayaOverCard = (page: Page): Promise<boolean> =>
  page.evaluate(`(function () {
    var b = document.querySelector(".maya-bubble"), c = document.querySelector(".result-card");
    if (!b || !c || b.getClientRects().length === 0 || getComputedStyle(b).visibility === "hidden" || getComputedStyle(b).opacity === "0") return false;
    var r = b.getBoundingClientRect(), s = c.getBoundingClientRect();
    var overlap = r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top;
    if (!overlap) return false;
    var cx = Math.max(r.left, s.left) + 2, cy = Math.max(r.top, s.top) + 2;
    var top = document.elementFromPoint(cx, cy);
    return Boolean(top && b.contains(top));
  })()`) as Promise<boolean>;

/** Tab round the card several times: focus never leaves it. */
async function focusStays(page: Page): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const inside = (await page.evaluate(`Boolean(document.activeElement && document.activeElement.closest(".result-cards"))`)) as boolean;
    if (!inside) return false;
  }
  await page.keyboard.press("Shift+Tab");
  return (await page.evaluate(`Boolean(document.activeElement && document.activeElement.closest(".result-cards"))`)) as boolean;
}

const BANNED = /iconic places|overlap|counted twice|\bmodel\b|\bwind\b/i;
const PHASES = [
  { eyebrow: "2030 · Cyclone", next: "Next: the flood in 2040", comingTitle: "Monsoon flood in 2040", line: "The flood comes in 10 years", on: "On to 2031", year: 2031, turn: 6 },
  { eyebrow: "2040 · Monsoon flood", next: "Next: cyclone and flood in 2050", comingTitle: "Cyclone and flood in 2050", line: "The cyclone and flood arrive together in 10 years", on: "On to 2041", year: 2041, turn: 16 },
  { eyebrow: "2050 · Cyclone and flood", next: "Panjim in 2050", comingTitle: "", line: "", on: "", year: 0, turn: 0 }
];
const HEADLINES: Record<string, string> = { "3": "Your city came through.", "2": "Most of your city held.", "1": "Your city took a heavy hit.", "0": "Your city took a heavy hit." };

/** One phase's cards: checks (when `full`) and screenshots. Leaves the next phase started, or the final card up. */
async function phase(page: Page, i: number, tag: string, full: boolean): Promise<void> {
  const p = PHASES[i];
  const n = i + 1;
  check(await scenario(page, "to-results"), `${tag} phase ${n}: the result cards open after the storm`);
  await page.waitForTimeout(800);
  // Card 1.
  let c = await card(page);
  await shot(page, `p${n}-card1-${tag}`);
  if (full) {
    const stars = /^(\d) of 3 stars$/.exec(c.stars)?.[1] ?? "?";
    check(c.eyebrow === p.eyebrow, `phase ${n} card 1 eyebrow: "${c.eyebrow}"`);
    check(c.title === HEADLINES[stars], `phase ${n} card 1 headline "${c.title}" for ${c.stars}`);
    check(/\d+ of \d+ homes saved/.test(c.text) && c.bar, `phase ${n} card 1 says "N of M homes saved" with a bar`);
    check(c.places.every((pl) => /(Stood|Damaged)$/.test(pl)), `phase ${n} card 1 places, each Stood or Damaged, with no heading: ${c.places.join("; ") || "(none in the area)"}`);
    check(!BANNED.test(c.text), `phase ${n} card 1 has no "Iconic places", overlap, model or wind wording`);
    check(c.button === "See what protected your city" && !c.back, `phase ${n} card 1 button "${c.button}", no Back`);
    check(!c.scrolls, `phase ${n} card 1 fits without scrolling`);
    check(!(await mayaOverCard(page)), `phase ${n}: Maya's bubble is not over the card`);
    await axe(page, `phase ${n} card 1`);
  }
  // Enter: card 2.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  c = await card(page);
  await plainShot(page, `p${n}-card2-${tag}`);
  if (full) {
    check(c.title === "What protected your homes", `phase ${n} Enter goes on to card 2: "${c.title}"`);
    const rowsOk = c.rows.length > 0 ? /Homes that would have been lost without each defence\./.test(c.text) && c.rows.every((r) => /\d+$/.test(r)) : /Nothing stood in the way this time\./.test(c.text);
    check(rowsOk, `phase ${n} card 2 rows: ${c.rows.join("; ") || "Nothing stood in the way this time."}`);
    check(!BANNED.test(c.text), `phase ${n} card 2 has no overlap, model or wind wording`);
    check(c.button === p.next && c.back, `phase ${n} card 2 button "${c.button}" with Back`);
    await axe(page, `phase ${n} card 2`);
    // Back, then Enter again.
    await page.locator(".result-back").click();
    await page.waitForTimeout(400);
    check((await card(page)).title === HEADLINES[/^(\d)/.exec((await card(page)).stars)?.[1] ?? "?"], `phase ${n} Back returns to card 1`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    // Esc: the last card.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    c = await card(page);
    check(c.open, `phase ${n} Esc keeps the cards open and the level`);
  } else {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    c = await card(page);
  }
  if (i < 2) {
    await plainShot(page, `p${n}-card3-${tag}`);
    if (full) {
      check(c.eyebrow === "Coming up" && c.title === p.comingTitle, `phase ${n} Esc jumps to the last card, card 3: "${c.eyebrow}" / "${c.title}"`);
      check(c.line === p.line, `phase ${n} card 3 line: "${c.line}"`);
      check(c.preview && c.legend.startsWith("Most likely | Likely | Possible | Area to protect"), `phase ${n} card 3 forecast map and legend: ${c.legend}`);
      check(/Maya/.test(c.text), `phase ${n} card 3 has Maya's one line`);
      check(c.button === p.on && c.back, `phase ${n} card 3 button "${c.button}" with Back`);
      check(await focusStays(page), `phase ${n} focus stays in the cards (Tab and Shift+Tab)`);
      await axe(page, `phase ${n} card 3`);
    }
    await page.locator(".result-next").click();
    await page.waitForTimeout(2500);
    if (full) {
      const now = await val<{ year: number; turn: number; open: boolean }>(page, "({ year: r.year, turn: r.turnNumber, open: document.querySelector('.result-cards') && !document.querySelector('.result-cards').hidden })");
      check(!now.open && now.year === p.year && now.turn === p.turn, `phase ${n + 1} starts in ${now.year} (turn ${now.turn}), the cards closed`);
      check(await coneShown(page), `phase ${n + 1} starts with its cone on the map`);
    }
  } else {
    if (full) check(c.title === "What protected your homes" && c.button === "Panjim in 2050", `phase 3 has no card 3: Esc stays on card 2, its button "${c.button}"`);
    await page.locator(".result-next").click();
    // The finale's title plays, then the final card.
    for (let k = 0; k < 120 && !(await card(page)).title.startsWith("Panjim, 2026"); k++) await page.waitForTimeout(250);
    c = await card(page);
    await shot(page, `final-${tag}`);
    if (full) {
      check(c.title === "Panjim, 2026 to 2050", `the final card: "${c.title}"`);
      const phases = (await page.evaluate(`Array.from(document.querySelectorAll(".result-phases li")).map(function (li) { return li.innerText.replace(/\\s+/g, " ").trim(); })`)) as string[];
      check(phases.length === 3 && phases.every((t) => /homes saved/.test(t)), `the final card lists the three phases: ${phases.join("; ")}`);
      check(/\d+ of \d+ homes saved/.test(c.text) && /of 3 stars/.test(c.stars), `the final card has the total and the stars (${c.stars})`);
      check(c.button === "Play again" && c.link === "Back to the menu", `the final card: "${c.button}" and the link "${c.link}"`);
      check(await focusStays(page), "the final card keeps focus");
      await axe(page, "the final card");
    }
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    for (const [w, h] of [[1920, 1080], [1366, 768], [2560, 1440]] as const) {
      const page = await open(browser, server.url, w, h);
      await begin(page);
      for (let i = 0; i < 3; i++) await phase(page, i, `${w}x${h}`, w === 1920);
      if (w === 1920) {
        // Play again starts the level afresh.
        await page.locator(".result-next").click();
        await page.waitForSelector(".brief-card", { timeout: 120000 });
        await page.waitForTimeout(1500);
        check((await val<number>(page, "r.turnNumber")) === 1, "Play again starts a new run in 2026");
      }
      await page.close();
    }
    // Reduced motion: the cards appear with no animation.
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
    const page = await open(browser, server.url, 1920, 1080, ctx);
    await begin(page);
    await scenario(page, "to-results");
    const anim = (await page.evaluate(`getComputedStyle(document.querySelector(".result-card")).animationName`)) as string;
    check(anim === "none", `reduced motion: the cards do not animate (${anim})`);
    await ctx.close();
  } finally {
    await browser.close();
    server.stop();
  }
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
  fs.writeFileSync(path.join(OUT, "checks.txt"), lines.join("\n") + "\n");
  console.log(`\n${lines.length - failed} of ${lines.length} checks pass.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
