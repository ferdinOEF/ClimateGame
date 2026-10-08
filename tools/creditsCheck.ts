/**
 * The landing page's credits strip, the Sources screen and the Discovery
 * card's Source control, checked in a real browser.
 *
 * Usage:  npx tsx tools/creditsCheck.ts
 *
 * At 1366x768, 1920x1080 and 2560x1440 (and 1920x1080 at DPR 2, and a
 * narrow 760 px window) it checks that the strip does not overlap anything
 * on the menu, that both logos are 56-64 px tall with their own proportions
 * and are not links, that the label's contrast is at least 4.5:1, and that
 * the strip is absent from a level. It opens the Sources screen from the
 * strip and from a Discovery card and checks it lists every cited fact.
 * Screenshots go to docs/qa/credits/. Exits non-zero on any failure.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { CITED_FACTS } from "../src/core/facts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "qa", "credits");
const PORT = Number(process.env.SHOTS_PORT ?? 5196);
const failures: string[] = [];
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

async function menuChecks(page: Page, label: string): Promise<void> {
  const result = (await page.evaluate(`(() => {
    const plate = document.querySelector(".menu-credits-plate").getBoundingClientRect();
    const others = [...document.querySelectorAll(".menu-screen .menu-hero > *, .menu-screen .menu-actions > *, .menu-screen > .menu-stats, .menu-screen > .menu-stars, .menu-screen > .menu-footer")].map((n) => n.getBoundingClientRect());
    const gap = Math.min(...others.map((r) => plate.top - r.bottom));
    const overlaps = others.filter((r) => !(r.right <= plate.left || r.left >= plate.right || r.bottom <= plate.top || r.top >= plate.bottom)).length;
    const logos = [...document.querySelectorAll(".menu-credit-logo")].map((img) => ({
      alt: img.alt, h: img.getBoundingClientRect().height, w: img.getBoundingClientRect().width,
      nw: img.naturalWidth, nh: img.naturalHeight, complete: img.complete && img.naturalWidth > 0, inLink: Boolean(img.closest("a"))
    }));
    const rgb = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const label = document.querySelector(".menu-credits-label");
    const fg = lum(rgb(getComputedStyle(label).color));
    const bg = lum(rgb(getComputedStyle(document.querySelector(".menu-credits-plate")).backgroundColor));
    const contrast = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    return { gap, overlaps, logos, contrast, text: label.textContent, inView: plate.bottom <= innerHeight + 1 && plate.top >= 0, scrollW: document.documentElement.scrollWidth, vw: innerWidth };
  })()`)) as { gap: number; overlaps: number; logos: { alt: string; h: number; w: number; nw: number; nh: number; complete: boolean; inLink: boolean }[]; contrast: number; text: string; inView: boolean; scrollW: number; vw: number };
  check(result.overlaps === 0, `${label}: strip overlaps nothing on the menu (gap ${Math.round(result.gap)} px)`);
  check(result.text === "Brought to you by", `${label}: label reads "Brought to you by"`);
  check(result.contrast >= 4.5, `${label}: label contrast ${result.contrast.toFixed(1)}:1`);
  check(result.scrollW <= result.vw, `${label}: no horizontal scroll`);
  const alts = result.logos.map((l) => l.alt);
  check(alts.join("|") === "OneEarth Foundation logo|Gokhush Charitable Trust logo", `${label}: logos and alt text (${alts.join(", ")})`);
  for (const logo of result.logos) {
    check(logo.complete, `${label}: ${logo.alt} loaded`);
    check(logo.h >= 56 && logo.h <= 64, `${label}: ${logo.alt} is ${logo.h.toFixed(0)} px tall`);
    check(Math.abs(logo.w / logo.h - logo.nw / logo.nh) < 0.03, `${label}: ${logo.alt} keeps its proportions`);
    check(!logo.inLink, `${label}: ${logo.alt} is not a link`);
  }
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
    for (const [w, h, dpr] of [[1366, 768, 1], [1920, 1080, 1], [2560, 1440, 1], [1920, 1080, 2], [760, 900, 1]] as const) {
      const label = `${w}x${h}${dpr > 1 ? "@2x" : ""}`;
      const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage();
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${label}: ${m.text()}`); });
      page.on("requestfailed", (r) => errors.push(`${label}: failed ${r.url()}`));
      await page.goto(server.url, { waitUntil: "networkidle" });
      await page.waitForSelector(".menu-credits-plate img");
      await page.waitForTimeout(500);
      await menuChecks(page, label);
      await page.screenshot({ path: path.join(OUT, `menu-${label}.jpg`), quality: 85 });
      if (dpr > 1) await page.locator(".menu-credits-plate").screenshot({ path: path.join(OUT, `strip-${label}.png`) });
      if (w === 1920 && dpr === 1) {
        await page.locator(".menu-credits-sources").click();
        await page.waitForSelector(".sources-panel");
        const listed = await page.locator(".sources-list .sources-item").evaluateAll((items) => items.map((i) => (i as HTMLElement).dataset.factId));
        check(JSON.stringify(listed) === JSON.stringify(CITED_FACTS.map((f) => f.id)), `Sources screen lists every cited fact (${listed.length})`);
        const links = await page.locator(".sources-list .sources-link").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
        check(links.every((u) => u.startsWith("https://")), "Sources links are https");
        await page.screenshot({ path: path.join(OUT, `sources-${label}.jpg`), quality: 85 });
        await page.keyboard.press("Escape");
        check((await page.locator(".sources-panel").count()) === 0, "Esc closes the Sources screen");
        // Into a level: no strip, and a Discovery card with its Source.
        await page.goto(`${server.url}#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".brief-card", { timeout: 60000 });
        await page.locator(".brief-cta").first().click();
        await page.waitForTimeout(1500);
        check((await page.locator(".menu-credits").count()) === 0, "No credits strip inside a level");
        await page.evaluate(`(() => { const p = window.__nuggetPopupForTest; for (let i = 0; i < 6; i++) { p.show("mangrove"); if (!document.querySelector(".nugget-source-row").hidden) break; } })()`);
        const sourceShown = await page.locator(".nugget-source-row:not([hidden])").count();
        check(sourceShown === 1, "Discovery card shows a Source control on a cited fact");
        await page.locator(".nugget-source").hover();
        await page.waitForTimeout(300);
        const credit = await page.locator(".nugget-credit").textContent();
        check(/\d{4}|n\.d\./.test(credit ?? ""), `Source tooltip: "${credit}"`);
        await page.screenshot({ path: path.join(OUT, `discovery-source-${label}.jpg`), quality: 85 });
        await page.locator(".nugget-source").click();
        await page.waitForSelector(".sources-item.highlight");
        await page.screenshot({ path: path.join(OUT, `sources-from-card-${label}.jpg`), quality: 85 });
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
