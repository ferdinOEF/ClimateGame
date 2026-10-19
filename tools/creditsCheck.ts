/**
 * The landing page's credits, the Sources screen and the Discovery card's
 * Source control, checked in a real browser.
 *
 * Usage:  npx tsx tools/creditsCheck.ts [outDir]
 *
 * Section 17b (owner decision): the "Brought to you by" plate and its logos
 * are hidden (`SHOW_PARTNER_CREDITS`, off by default). At 1280x600, 1366x768,
 * 1920x1080 and 2560x1440 (and 1920x1080 at DPR 2, and a narrow 760 px
 * window) it checks that no plate or logo is drawn, that the "Facts &
 * sources" link is on screen in the bottom corner, clear of the menu and
 * readable, and that the board render's OpenStreetMap credit is there,
 * unchanged. It opens the Sources screen from the link and from a Discovery
 * card and checks it lists every cited fact, and runs axe-core on the menu.
 * Screenshots go to docs/qa/credits/ (or outDir). Exits non-zero on any failure.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { CITED_FACTS } from "../src/core/facts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? path.join("docs", "qa", "credits"));
const PORT = Number(process.env.SHOTS_PORT ?? 5196);
const failures: string[] = [];
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

async function menuChecks(page: Page, label: string): Promise<void> {
  const result = (await page.evaluate(`(() => {
    const shown = (el) => { if (!el) return false; const st = getComputedStyle(el); const r = el.getBoundingClientRect(); return st.display !== "none" && st.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const link = document.querySelector(".menu-sources-link");
    const box = link ? link.getBoundingClientRect() : null;
    const others = [...document.querySelectorAll(".menu-screen .menu-hero > *, .menu-screen .menu-actions > *, .menu-screen > .menu-stats, .menu-screen > .menu-stars, .menu-screen > .menu-footer")].map((n) => n.getBoundingClientRect());
    const overlaps = box ? others.filter((r) => !(r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom)).length : -1;
    const credit = document.querySelector(".menu-art-credit");
    const cbox = credit ? credit.getBoundingClientRect() : null;
    return {
      plate: document.querySelectorAll(".menu-credits, .menu-credits-plate").length,
      logos: [...document.querySelectorAll(".menu-credit-logo")].filter(shown).length,
      brought: /Brought to you by/.test(document.body.innerText),
      link: shown(link), linkText: link ? link.textContent : "", linkInView: !!box && box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
      linkCorner: !!box && box.right >= innerWidth - 40 && box.bottom >= innerHeight - 40, overlaps,
      linkSize: link ? parseFloat(getComputedStyle(link).fontSize) : 0,
      credit: shown(credit), creditText: credit ? credit.textContent : "", creditHref: credit ? credit.getAttribute("href") : "",
      creditInView: !!cbox && cbox.top >= 0 && cbox.right <= innerWidth,
      scrollW: document.documentElement.scrollWidth, vw: innerWidth
    };
  })()`)) as { plate: number; logos: number; brought: boolean; link: boolean; linkText: string; linkInView: boolean; linkCorner: boolean; overlaps: number; linkSize: number; credit: boolean; creditText: string; creditHref: string; creditInView: boolean; scrollW: number; vw: number };
  check(result.plate === 0 && result.logos === 0 && !result.brought, `${label}: no "Brought to you by" plate and no partner logo`);
  check(result.link && result.linkText === "Facts & sources" && result.linkInView, `${label}: the "Facts & sources" link is on screen`);
  check(result.linkCorner, `${label}: the link sits in the bottom corner`);
  check(result.overlaps === 0, `${label}: the link overlaps nothing on the menu`);
  check(result.linkSize >= 12, `${label}: the link is at least 12 px (${result.linkSize} px)`);
  check(result.credit && result.creditText === "Board render · map data © OpenStreetMap contributors" && result.creditHref === "https://www.openstreetmap.org/copyright" && result.creditInView, `${label}: the board render's OpenStreetMap credit, unchanged`);
  check(result.scrollW <= result.vw, `${label}: no horizontal scroll`);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  try {
    for (const [w, h, dpr] of [[1280, 600, 1], [1366, 768, 1], [1920, 1080, 1], [2560, 1440, 1], [1920, 1080, 2], [760, 900, 1]] as const) {
      const label = `${w}x${h}${dpr > 1 ? "@2x" : ""}`;
      const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage();
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${label}: ${m.text()}`); });
      page.on("requestfailed", (r) => errors.push(`${label}: failed ${r.url()}`));
      await page.goto(server.url, { waitUntil: "networkidle" });
      await page.waitForSelector(".menu-sources-link");
      await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>(".menu-art img"); return !img || (img.complete && img.naturalWidth > 0); }, undefined, { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      await menuChecks(page, label);
      await page.screenshot({ path: path.join(OUT, `menu-${label}.jpg`), quality: 85 });
      if (w === 1920 && dpr === 1) {
        // axe-core on the menu itself, before the Sources screen opens.
        await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
        const menuAxe = await page.evaluate<string[]>(`(async () => {
          const r = await axe.run(document, { resultTypes: ["violations"] });
          return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
        })()`);
        check(menuAxe.length === 0, `axe-core: the menu, no serious or critical violations${menuAxe.length ? ": " + menuAxe.join(", ") : ""}`);
        await page.locator(".menu-sources-link").click();
        await page.waitForSelector(".sources-panel");
        const listed = await page.locator(".sources-list:not(.sources-map-data) .sources-item").evaluateAll((items) => items.map((i) => (i as HTMLElement).dataset.factId));
        check(JSON.stringify(listed) === JSON.stringify(CITED_FACTS.map((f) => f.id)), `Sources screen lists every cited fact (${listed.length})`);
        const links = await page.locator(".sources-list:not(.sources-map-data) .sources-link").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
        check(links.every((u) => u.startsWith("https://")), "Sources links are https");
        await page.screenshot({ path: path.join(OUT, `sources-${label}.jpg`), quality: 85 });
        // axe-core with the Sources screen open over the menu.
        const axeResult = await page.evaluate<string[]>(`(async () => {
          const r = await axe.run(document, { resultTypes: ["violations"] });
          return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
        })()`);
        check(axeResult.length === 0, `axe-core: the Sources screen over the menu, no serious or critical violations${axeResult.length ? ": " + axeResult.join(", ") : ""}`);
        await page.keyboard.press("Escape");
        check((await page.locator(".sources-panel").count()) === 0, "Esc closes the Sources screen");
        // Into a level: no credits strip (the switch off or on).
        await page.goto(`${server.url}#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".brief-card", { timeout: 60000 });
        await page.locator(".brief-cta").first().click();
        await page.waitForTimeout(1500);
        check((await page.locator(".menu-credits").count()) === 0, "No credits strip inside a level");
        // On Panaji Maya tells the fact: her bubble carries its count and a Source button.
        await page.goto(`${server.url}#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".brief-card", { timeout: 60000 });
        await page.locator(".brief-cta").first().click();
        await page.waitForTimeout(1500);
        await page.evaluate(`(() => { window.__panjimForTest.maya.holdLines = true; window.__nuggetPopupForTest.replay("mangrove-waves"); })()`);
        await page.waitForSelector(".maya-source:not([hidden])");
        check((await page.locator(".maya-source").count()) === 1, "Maya's bubble shows a Source button on a cited fact");
        const credit = await page.locator(".maya-source").getAttribute("title");
        check(/\d{4}|n\.d\./.test(credit ?? ""), `Source credit: "${credit}"`);
        check(/^\d+ of \d+$/.test((await page.locator(".maya-count").textContent()) ?? ""), "the bubble shows the running count");
        await page.screenshot({ path: path.join(OUT, `discovery-source-${label}.jpg`), quality: 85 });
        await page.locator(".maya-source").click();
        await page.waitForSelector(".sources-item.highlight");
        await page.screenshot({ path: path.join(OUT, `sources-from-maya-${label}.jpg`), quality: 85 });
        // Keyboard: Tab stays inside the dialog; one Esc closes it.
        for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
        check(await page.evaluate<boolean>(`Boolean(document.activeElement && document.activeElement.closest(".sources-backdrop"))`), "Tab stays inside the Sources screen");
        await page.keyboard.press("Escape");
        check((await page.locator(".sources-backdrop").count()) === 0, "one Esc closes the Sources screen in a level");
        check(await page.evaluate<boolean>(`[...document.body.children].every((el) => !el.inert)`), "the page is reachable again after it closes");
        // With Maya talking: one Esc still closes the Sources screen first.
        await page.evaluate(`window.__nuggetPopupForTest.replay("dunes-barrier")`);
        await page.locator(".maya-source").click();
        await page.waitForSelector(".sources-panel");
        await page.keyboard.press("Escape");
        check((await page.locator(".sources-backdrop").count()) === 0, "with Maya talking, one Esc closes the Sources screen");
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  check(errors.length === 0, `no console errors, warnings or failed requests${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  if (failures.length) {
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
