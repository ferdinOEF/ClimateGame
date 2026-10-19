/**
 * Section 17b in a browser, at one window size: the states the owner listed,
 * photographed, and on each one every visible text (text nodes, aria-label,
 * title, alt, placeholder) scanned for the dots and hyphens part B removes
 * (the same rules as tests/punctuation.test.ts), and the reworded lines
 * checked to fit their boxes (no clipped or overflowing text).
 *
 *   menu (with axe), start popup, top bar, a build menu, the objective card,
 *   Help, result cards 1 and 2, the coming-up card, the final card; and the
 *   Tutorial's start popup, cards and result card.
 *
 * Usage: npx tsx tools/section17bChecks.ts <width> <height> [outDir]. Exits 1 on any failure.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { punctuationProblems } from "../tests/helpers/uiStrings";

const [w = "1366", h = "768", outDir = "docs/qa/section17b"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const ROOT = path.resolve(import.meta.dirname, "..");
fs.mkdirSync(outDir, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5427));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** The exceptions in tests/punctuation.test.ts that can be on screen. */
const ALLOWED = ["White-throated Kingfisher"];

async function open(route: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${server.url}/${route}`, { waitUntil: "domcontentloaded" });
  return page;
}

async function shot(page: Page, name: string, selector?: string): Promise<void> {
  const file = `${outDir}/${name}-${W}x${H}.jpg`;
  if (selector) await page.locator(selector).first().screenshot({ path: file, type: "jpeg", quality: 85 });
  else await page.screenshot({ path: file, type: "jpeg", quality: 82 });
}

/** Every visible text and accessible label on the page, scanned. */
async function scan(page: Page, state: string): Promise<void> {
  const texts = (await page.evaluate(`(() => {
    const out = [];
    const visible = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || e.hidden) return false; } return true; };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (!t || !n.parentElement || ["SCRIPT", "STYLE"].includes(n.parentElement.tagName)) continue;
      if (visible(n.parentElement)) out.push(n.parentElement.innerText && n.parentElement.children.length === 0 ? n.parentElement.innerText : t);
    }
    for (const el of document.querySelectorAll("[aria-label], [title], [alt], [placeholder], [data-label]")) {
      if (!visible(el)) continue;
      for (const a of ["aria-label", "title", "alt", "placeholder", "data-label"]) { const v = el.getAttribute(a); if (v && v.trim()) out.push(v); }
    }
    out.push(document.title);
    return [...new Set(out)];
  })()`)) as string[];
  const bad = texts.filter((t) => !ALLOWED.includes(t.trim()) && punctuationProblems(t).length > 0).map((t) => `"${t.slice(0, 90)}" [${punctuationProblems(t).join(", ")}]`);
  check(bad.length === 0, `${state}: no dots or hyphens between words in ${texts.length} visible texts${bad.length ? `: ${bad.join(" | ")}` : ""}`);
}

/** The reworded lines fit their boxes: no element among `selectors` overflows its own box. */
async function fits(page: Page, state: string, selectors: string[]): Promise<void> {
  const over = (await page.evaluate(`(() => {
    const out = [];
    for (const sel of ${JSON.stringify(selectors)}) for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) out.push(sel + " '" + el.textContent.trim().slice(0, 50) + "' " + el.scrollWidth + "x" + el.scrollHeight + " in " + el.clientWidth + "x" + el.clientHeight);
      if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) out.push(sel + " '" + el.textContent.trim().slice(0, 50) + "' off screen");
    }
    return out;
  })()`)) as string[];
  check(over.length === 0, `${state}: the reworded lines fit their boxes${over.length ? `: ${over.join(" | ")}` : ""}`);
}

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.join(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: no serious or critical violations${found.length ? `: ${found.join(", ")}` : ""}`);
}

async function ready(page: Page): Promise<void> {
  await page.waitForSelector(".brief-card", { timeout: 180000 });
  await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
  await wait(1500);
}

const scenario = (page: Page, name: string) => page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(name)})`);

// ---- The menu ---------------------------------------------------------------
{
  const page = await open("#/");
  await page.waitForSelector(".menu-sources-link", { timeout: 120000 });
  await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>(".menu-art img"); return !img || (img.complete && img.naturalWidth > 0); }, undefined, { timeout: 15000 }).catch(() => undefined);
  await wait(600);
  await shot(page, "menu");
  await scan(page, "menu");
  await fits(page, "menu", [".menu-art-credit", ".menu-sources-link", ".menu-tagline", ".menu-actions button"]);
  const credit = (await page.evaluate(`document.querySelector(".menu-art-credit")?.textContent ?? ""`)) as string;
  check(credit === "Board render, map data © OpenStreetMap contributors", `menu: the OpenStreetMap credit reads "${credit}"`);
  check((await page.evaluate(`document.querySelectorAll(".menu-credits, .menu-credit-logo").length`)) === 0, "menu: no partner plate or logos");
  await axe(page, "the menu");
  await page.close();
}

// ---- Panjim: start popup, top bar, build menu, objective card, Help, the result cards, coming up ----
{
  const page = await open("#/play/l01-first-rains");
  await ready(page);
  await shot(page, "start-popup");
  await scan(page, "start popup");
  await fits(page, "start popup", [".brief-title", ".brief-goal-line", ".brief-cta", ".cone-preview-line", ".brief-eyebrow"]);
  await page.locator(".brief-cta").first().click();
  await wait(3000);
  await shot(page, "top-bar", ".panjim-clock");
  await scan(page, "first frame");
  await fits(page, "top bar", [".outlook-countdown", ".outlook-marker", ".clock-face", ".outlook-risk"]);
  await page.evaluate(`(() => { const t = window.__panjimForTest.run.prep[0].tiles[0].split(",").map(Number); return window.__openTileForTest(t[0], t[1]); })()`);
  await page.mouse.move(2, H - 2);
  await wait(900);
  await shot(page, "build-menu");
  await scan(page, "build menu");
  await fits(page, "build menu", [".build-card-name", ".build-card-line", ".build-card-elsewhere"]);
  await page.keyboard.press("Escape");
  await wait(400);
  await shot(page, "objective-card", ".objectives-panel");
  await fits(page, "objective card", [".objectives-panel .get-ready-title, .objectives-panel [class*=title]", ".get-ready-row, .objectives-panel li"]);
  await page.locator(".help-button").click();
  await wait(1200);
  await shot(page, "help");
  await scan(page, "Help");
  await page.keyboard.press("Escape");
  await wait(400);
  await scenario(page, "to-results");
  await wait(2000);
  await shot(page, "result-1");
  await scan(page, "result card 1");
  await fits(page, "result card 1", [".result-eyebrow", ".result-title", ".result-homes-text", ".result-place-name", ".result-places-more", ".result-next"]);
  await page.locator(".result-next").click();
  await wait(900);
  await shot(page, "result-2");
  await scan(page, "result card 2");
  await fits(page, "result card 2", [".result-eyebrow", ".result-title", ".result-row-name", ".result-maya", ".result-next"]);
  await page.locator(".result-next").click();
  await wait(1200);
  await shot(page, "coming-up");
  await scan(page, "coming-up card");
  const title = (await page.evaluate(`document.querySelector(".result-title")?.textContent ?? ""`)) as string;
  check(title === "Monsoon flood in 2040, 10 years away", `coming-up heading: "${title}"`);
  await fits(page, "coming-up card", [".result-title", ".result-eyebrow", ".result-maya", ".result-next"]);
  await page.close();
}

// ---- Panjim: the final card ---------------------------------------------------
{
  const page = await open("#/play/l01-first-rains");
  await ready(page);
  await page.locator(".brief-cta").first().click();
  await wait(2500);
  await scenario(page, "finale");
  await wait(2000);
  await shot(page, "final-card");
  await scan(page, "final card");
  await fits(page, "final card", [".result-title", ".result-phases li span", ".result-homes-text", ".result-next", ".result-link"]);
  const phases = (await page.evaluate(`[...document.querySelectorAll(".result-phases li span:first-child")].map((s) => s.textContent)`)) as string[];
  check(phases.join("|") === "Cyclone in 2030|Monsoon flood in 2040|Cyclone and flood in 2050", `final card's storms: ${phases.join(", ")}`);
  await page.close();
}

// ---- The Tutorial: start popup, cards, result card -----------------------------
{
  const page = await open("#/play/l00-tutorial");
  await ready(page);
  await scan(page, "Tutorial start popup");
  await page.locator(".brief-cta").first().click();
  await wait(2500);
  await page.evaluate(`(() => { const p = window.__panjimForTest; const job = p.run.prep.find((j) => !j.done); const t = job.tiles[0].split(",").map(Number); return window.__openTileForTest(t[0], t[1]); })()`);
  await wait(1200);
  await scan(page, "Tutorial cards and Maya's line");
  await page.keyboard.press("Escape");
  await wait(400);
  await scenario(page, "to-results");
  await wait(2000);
  await shot(page, "tutorial-result");
  await scan(page, "Tutorial result card");
  const eyebrow = (await page.evaluate(`document.querySelector(".result-eyebrow")?.textContent ?? ""`)) as string;
  check(eyebrow === "Tutorial, Cyclone in 2028", `Tutorial result eyebrow: "${eyebrow}"`);
  await fits(page, "Tutorial result card", [".result-eyebrow", ".result-title", ".result-sub", ".result-next", ".result-link"]);
  await page.close();
}

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${W}x${H})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
