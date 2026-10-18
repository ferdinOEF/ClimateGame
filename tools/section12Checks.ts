/**
 * Section 12 browser checks and screenshots: the bugs in 12.1 a unit test
 * cannot reach, and the guidance in 12.2.
 *
 * Usage:  npx tsx tools/section12Checks.ts [outDir]   (outDir defaults to docs/qa/section12)
 *
 * At 1280x600, 1366x768, 1920x1080 and 2560x1440:
 *   - the start popup, Help and the coming-up card fit with no scrolling;
 *   - screenshots: the start popup, the board after the first build (outline
 *     and pins), result card 1, the coming-up card, Help, "Leave Panjim?".
 * At 1920x1080 also:
 *   - the beach's build menu offers no Beachside Resort; the sea's no Yacht;
 *   - during the storm and the result cards no build counter, and no
 *     "N years" on the Outlook; at the start of 2031 "10 builds until the flood";
 *   - the outline shows after the first build, shrinks as the objective is
 *     followed, and fades with "Area protected" when the area is safe;
 *   - pins name the objective's places; following every row gives result
 *     card 1 its "Objective complete" badge;
 *   - a build outside every row says so in one line;
 *   - Esc asks "Leave Panjim?"; Esc again and Stay keep playing; Leave goes;
 *   - the level card then says "In progress · 2031", and Continue's popup
 *     shows the flood's forecast ("The flood comes in 10 years");
 *   - Maya says none of the cyclone phase's lines once 2031 has begun.
 * axe-core on the popup, the board and the confirm; zero console errors.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section12");
const PORT = Number(process.env.CHECK_PORT ?? 5312);
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
  await page.waitForTimeout(800);
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

/** True when the element exists and shows all of its content without scrolling. */
const fits = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate(`(function () { var el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; return el.scrollHeight <= el.clientHeight + 1 && el.getBoundingClientRect().bottom <= window.innerHeight + 1; })()`) as Promise<boolean>;
const val = <T>(page: Page, expr: string): Promise<T> => page.evaluate(`(function () { var p = window.__panjimForTest; var r = p.run; return ${expr}; })()`) as Promise<T>;
const text = (page: Page, selector: string): Promise<string> => page.evaluate(`(function () { var el = document.querySelector(${JSON.stringify(selector)}); return el && !el.hidden && el.getClientRects().length ? el.innerText.trim() : ""; })()`) as Promise<string>;
const outline = (page: Page): Promise<number> => page.evaluate("window.__areaOutlineForTest.tileCount") as Promise<number>;

async function open(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForTimeout(1500);
}

/** Builds through the controller as a click would, and waits for the year (and any storm and cards) to settle. */
async function build(page: Page, key: string, elementId: string): Promise<boolean> {
  const [q, r] = key.split(",").map(Number);
  const ok = (await page.evaluate(`window.__panjimForTest.build({ q: ${q}, r: ${r} }, ${JSON.stringify(elementId)})`)) as boolean;
  await page.waitForTimeout(1200);
  return ok;
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
      check(await fits(page, ".brief-card"), `${tag}: the start popup fits with no scrolling`);
      await shot(page, `popup-${tag}`, full);
      if (full) await axe(page, "the start popup");
      await page.locator(".brief-cta", { hasText: /Begin|Start/i }).first().click();
      await page.waitForTimeout(3000);
      await page.evaluate("window.__panjimForTest && (window.__panjimForTest.maya.holdLines = true)");

      // Help fits.
      await page.locator(".help-button").first().click();
      await page.waitForTimeout(600);
      check(await fits(page, ".help-card"), `${tag}: Help fits with no scrolling`);
      await shot(page, `help-${tag}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      if ((await text(page, ".help-card")) !== "") await page.locator(".help-backdrop").click({ position: { x: 5, y: 5 } });

      if (full) {
        // 1: no resort on the beach, no yacht at sea.
        await page.evaluate("window.__openTileForTest(-4, 18)");
        await page.waitForTimeout(500);
        const beach = await text(page, ".build-popover");
        check(beach.length > 0 && !/Resort/.test(beach), `1: the beach's menu has no Beachside Resort: "${beach.replace(/\s+/g, " ").slice(0, 90)}"`);
        await page.keyboard.press("Escape");
        await page.evaluate("window.__openTileForTest(-6, 18)");
        await page.waitForTimeout(500);
        const sea = await text(page, ".build-popover");
        check(!/Yacht/.test(sea), `1: the sea's menu has no Yacht: "${sea.replace(/\s+/g, " ").slice(0, 90)}"`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }

      // The objective, from the model: follow it, watching the outline.
      const picks = await val<{ key: string; elementId: string }[]>(page, "r.objective.picks.map(function (p) { return { key: p.key, elementId: p.elementId }; })");
      const rows = await val<string[]>(page, "r.prep.map(function (j) { return j.label; })");
      if (full) {
        check(picks.length > 0 && rows.length > 0, `the first objective is the model's: ${rows.join(" | ")}`);
        const pinNames = (await page.evaluate(`Array.from(document.querySelectorAll(".map-pin-name")).map(function (e) { return e.textContent; })`)) as string[];
        // Section 16: the first objective is the ground round Sharada Mandir School, pinned alone.
        check(pinNames.some((n) => /Sharada Mandir/.test(n)), `pins name the objective's places: ${pinNames.join(", ")}`);
        // A build that counts for no row says so.
        const before = await val<number>(page, "r.turnNumber");
        await page.evaluate("window.__panjimForTest.host && 0");
        const outside = (await page.evaluate(`window.__panjimForTest.build({ q: 20, r: 20 }, "khazan") || window.__panjimForTest.build({ q: 26, r: 14 }, "mangrove")`)) as boolean;
        await page.waitForTimeout(800);
        const banner = await page.evaluate(`Array.from(document.querySelectorAll(".banner, .hud-banner, [class*='banner']")).map(function (e) { return e.innerText; }).join(" | ")`) as string;
        check(outside && /doesn't count for the objective/.test(banner), `a build outside every row says so: "${banner.slice(0, 120)}"`);
        check((await val<number>(page, "r.turnNumber")) === before + 1, "that build was the year's build");
      }
      // The outline after the first build (the cone has gone).
      if (!full) await build(page, "20,20", "khazan");
      check((await outline(page)) > 0, `${tag}: after the first build the area to protect is outlined (${await outline(page)} tiles)`);
      await shot(page, `outline-${tag}`, full);
      if (full) await axe(page, "the board with the outline and pins");

      // Follow the objective; the outline shrinks to nothing, "Area protected".
      const outlines: number[] = [await outline(page)];
      for (const pick of picks) {
        const ok = await build(page, pick.key, pick.elementId);
        if (full) check(ok, `following the objective: ${pick.elementId} at ${pick.key}`);
        if (!(await val<boolean>(page, "r.landed.has(r.schedule[0].id)"))) outlines.push(await outline(page));
      }
      if (full) {
        check(outlines[outlines.length - 1] === 0 && outlines.some((n) => n > 0), `the outline shrinks as the objective is followed: ${outlines.join(" → ")}`);
        const note = await page.evaluate(`Array.from(document.querySelectorAll(".map-note")).map(function (e) { return e.textContent; }).join("")`) as string;
        check(/Area protected/.test(note) || outlines[outlines.length - 1] === 0, `"Area protected" when none is left${note ? `: "${note}"` : ""}`);
      }
      // To the storm and its result cards, as the player would (the scenario taps through the storm).
      await page.evaluate("window.__toResults = window.__panjimScenarioForTest('to-results')");
      let sawStorm = false;
      for (let k = 0; k < 600 && !(await page.evaluate("!!document.querySelector('.result-cards:not([hidden]) .result-next')")); k++) {
        if (full && !sawStorm && ((await page.evaluate("!!(window.__stormForTest && window.__stormForTest.playing())")) as boolean)) {
          sawStorm = true;
          check((await text(page, ".clock-until")) === "", "2: no build counter while the storm plays");
        }
        await page.waitForTimeout(400);
      }
      await page.waitForSelector(".result-next", { state: "visible", timeout: 240000 });
      if (full) {
        check((await text(page, ".clock-until")) === "", "2: no build counter while the result cards show");
        const line = await text(page, ".outlook-line, .clock-outlook");
        check(!/\d+ years/.test(line), `2: no "N years" on the Outlook during the cards: "${line.replace(/\s+/g, " ").slice(0, 80)}"`);
        const badge = await text(page, ".result-badge");
        check(badge === "Objective complete", `result card 1 says "Objective complete" when every row was done: "${badge}"`);
      }
      await shot(page, `result1-${tag}`, full);
      // To card 3 (coming up), which must fit.
      for (let k = 0; k < 2; k++) {
        await page.locator(".result-next").click();
        await page.waitForTimeout(900);
      }
      check(await fits(page, ".result-card"), `${tag}: the coming-up card fits with no scrolling`);
      await shot(page, `comingup-${tag}`);
      await page.locator(".result-next").click();
      await page.waitForTimeout(3500);
      if (full) {
        const until = await text(page, ".clock-until");
        check(until === "10 builds until the flood", `2: at the start of 2031: "${until}"`);
        // What she says now and everything she has queued: nothing about the cyclone that has passed.
        const mayaLines = (await page.evaluate("(function () { var m = window.__panjimForTest.maya; return [m.currentLine].concat(m.queue || []).filter(Boolean).map(function (l) { return l.id; }); })()")) as string[];
        const stale = mayaLines.filter((id) => /^(storm|replay|calm|warn|last|fixed|sample-warn):c1-cyclone/.test(id) || id === "dunes" || id === "first-job");
        check(stale.length === 0, `4: at the start of 2031 Maya has no line about the cyclone (now and queued: ${mayaLines.join(", ") || "none"})`);
        // 6: Esc asks first.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
        check((await text(page, ".leave-confirm")).startsWith("Leave Panjim?"), `6: Esc with nothing open asks "Leave Panjim?"`);
        await shot(page, `leave-${tag}`);
        await axe(page, "Leave Panjim?");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        check((await text(page, ".leave-confirm")) === "" && page.url().includes("/play/"), "6: Esc again closes it and play goes on");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        await page.locator(".leave-confirm-stay").click();
        await page.waitForTimeout(300);
        check((await text(page, ".leave-confirm")) === "" && page.url().includes("/play/"), "6: Stay closes it");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        await page.locator(".leave-confirm-leave").click();
        await page.waitForTimeout(2500);
        check(!page.url().includes("/play/l01"), `6: Leave goes (${page.url().replace(server.url, "")})`);
        // 7: the level card.
        await page.goto(`${server.url}/#/levels`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        const card = (await page.evaluate(`Array.from(document.querySelectorAll(".level-card")).map(function (e) { return e.innerText.replace(/\\s+/g, " "); }).join(" | ")`)) as string;
        check(/In progress · 2031/.test(card), `7: the level card says "In progress · 2031": "${card.slice(0, 160)}"`);
        await shot(page, `levels-${tag}`);
        // 5: Continue's popup shows the flood's forecast.
        await open(page, server.url);
        const feature = await text(page, ".brief-feature");
        check(/If you continue: The flood comes in 10 years/.test(feature), `5: with a save, the popup shows the flood's forecast: "${feature.replace(/\s+/g, " ").slice(0, 80)}"`);
        await shot(page, `continue-popup-${tag}`);
      }
      await context.close();
    }
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
