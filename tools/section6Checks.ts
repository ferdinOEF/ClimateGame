/**
 * Section 6: the forecast cone at the start of each phase, the heat in the
 * last two years before each storm, and the first storm's objective. Browser
 * checks on Panaji (software GL).
 *
 * Usage:  npx tsx tools/section6Checks.ts [outDir]   (outDir defaults to docs/qa/section6)
 *
 *   - the cone (and its chip and legend) shows at the start of turns 1, 6 and
 *     16 and at no other turn of the run, and is gone after Next year;
 *   - each chip reads as the spec words it; "Where they meet" only for the
 *     compound storm;
 *   - after a reload, continuing from 2031 (when the flood's cone was up), no
 *     cone shows;
 *   - the heat shows only in turns 4-5, 14-15 and 24-25;
 *   - Maya: her first line is the objective; when the heat first appears in a
 *     phase she queues one line;
 *   - the objective is in the Status panel with its three steps;
 *   - axe-core on each cone;
 *   - screenshots of each cone at 1366x768, 1920x1080 and 2560x1440, each
 *     with a -gray and a -deut (deuteranopia) copy;
 *   - zero console errors.
 * Exits 1 if any check fails.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section6");
const PORT = Number(process.env.CHECK_PORT ?? 5306);
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

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 85 });
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
  await page.goto(`${url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
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
const coneShown = (page: Page): Promise<boolean> => page.evaluate(`(function () { var c = document.querySelector(".forecast-cone-card"); return Boolean(c && !c.hidden) && window.__coneForTest.isShown && window.__coneForTest.tileCount > 0; })()`) as Promise<boolean>;
const coneGone = (page: Page): Promise<boolean> => page.evaluate(`(function () { var c = document.querySelector(".forecast-cone-card"); return Boolean(c && c.hidden) && !window.__coneForTest.isShown; })()`) as Promise<boolean>;
const chip = (page: Page): Promise<string> => page.evaluate(`(document.querySelector(".cone-chip-text") || {}).textContent || ""`) as Promise<string>;
const legend = (page: Page): Promise<string> => page.evaluate(`Array.from(document.querySelectorAll(".cone-legend li")).filter(function (li) { return !li.hidden; }).map(function (li) { return li.textContent.trim(); }).join(" | ")`) as Promise<string>;

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length + " [" + v.nodes.map((n) => n.target.join(" ") + ": " + (n.failureSummary || "").replace(/\s+/g, " ").slice(0, 160)).join(" | ") + "]");
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: ${found.length ? found.join(", ") : "no serious or critical violations"}`);
}

/** Next year, playing any storm through as a player would (hurrying it, closing its Aftermath). */
async function nextYear(page: Page): Promise<void> {
  await scenario(page, "next-year");
  await page.waitForTimeout(700);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    // ---- one whole run at 1920x1080: every turn -----------------------------
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await open(browser, server.url, 1920, 1080, ctx);
    // Log every line Maya says, by id, with the moment and turn she says it in.
    await page.evaluate(`(function () {
      var m = window.__panjimForTest.maya; window.__said = [];
      var next = m.next.bind(m);
      m.next = function () { var ok = next(); if (ok && m.currentLine) window.__said.push({ id: m.currentLine.id, moment: window.__panjimForTest.run.moment, turn: window.__panjimForTest.run.turnNumber }); return ok; };
    })()`);
    await begin(page);
    const first = (await page.evaluate(`(window.__panjimForTest.maya.currentLine || {}).id || ""`)) as string;
    check(first === "first-job", `Maya's first line is the objective (${first})`);
    const firstText = (await page.evaluate(`(document.querySelector(".maya-text, .maya-bubble") || {}).textContent || ""`)) as string;
    check(/Kala Academy to Sharada Mandir/.test(firstText), `her first line names it: "${firstText.trim().slice(0, 120)}"`);
    await page.locator(".hud-panel-status .hud-panel-button").click();
    await page.waitForTimeout(500);
    const objective = (await page.evaluate(`(document.querySelector(".status-objective") || {}).innerText || ""`)) as string;
    check(/Protect Kala Academy to Sharada Mandir/.test(objective) && /pandanus/.test(objective) && /dunes/.test(objective) && /breakwater/.test(objective), `the objective is in the Status panel: "${objective.replace(/\s+/g, " ")}"`);
    await shot(page, "objective-status-1920x1080");
    await page.locator(".hud-panel-status .hud-panel-button").click();
    await page.waitForTimeout(400);

    const coneTurns: number[] = [];
    const heatTurns: number[] = [];
    const chips = new Map<number, string>();
    const legends = new Map<number, string>();
    for (let turn = 1; turn <= 25; turn++) {
      const now = await val<number>(page, "r.turnNumber");
      if (now !== turn) {
        check(false, `the run is on turn ${now}, expected ${turn}`);
        break;
      }
      await page.waitForTimeout(800);
      if (await coneShown(page)) {
        coneTurns.push(turn);
        chips.set(turn, await chip(page));
        legends.set(turn, await legend(page));
        if (turn === 1 || turn === 6 || turn === 16) await axe(page, `the cone on turn ${turn}`);
      } else if (!(await coneGone(page))) check(false, `turn ${turn}: the cone is half there`);
      if ((await page.evaluate(`window.__heatForTest.visibleCount`)) as number > 0) heatTurns.push(turn);
      if (turn === 6) {
        // Reload with the flood's cone up: continuing must not show it again.
        const reload = await open(browser, server.url, 1920, 1080, ctx);
        const resume = reload.locator(".brief-cta", { hasText: /Continue/ });
        check((await resume.count()) === 1, "after a reload in 2031 the brief offers to continue");
        await reload.waitForTimeout(1500);
        check(await coneGone(reload), "after the reload no cone shows behind the brief while it offers to continue");
        if ((await resume.count()) === 1) {
          await resume.first().click();
          await reload.waitForTimeout(3000);
          check((await val<number>(reload, "r.turnNumber")) === 6, "continuing resumes in 2031 (turn 6)");
          check(await coneGone(reload), "after the reload the flood's cone does not show again");
          await reload.waitForTimeout(4000);
          const said = (await reload.evaluate(`document.body.innerText`)) as string;
          check(!said.includes("our first job"), "after the reload Maya does not give the first objective's line again");
        }
        await reload.close();
      }
      if (turn < 25) await nextYear(page);
    }
    check(JSON.stringify(coneTurns) === "[1,6,16]", `the cone shows on turns ${coneTurns.join(", ")} (expected 1, 6, 16), and on no other`);
    check(JSON.stringify(heatTurns) === "[4,5,14,15,24,25]", `the heat shows on turns ${heatTurns.join(", ")} (expected 4, 5, 14, 15, 24, 25)`);
    check(chips.get(1) === "Cyclone lands end of 2030 · 5 years", `turn 1 chip: "${chips.get(1)}"`);
    check(chips.get(6) === "Flood in 2040 · 10 years", `turn 6 chip: "${chips.get(6)}"`);
    check(chips.get(16) === "Cyclone and flood in 2050 · 10 years", `turn 16 chip: "${chips.get(16)}"`);
    check(legends.get(1) === "Most likely | Likely | Possible | Area to protect" && legends.get(16) === "Most likely | Likely | Possible | Area to protect | Where they meet", `legends: "${legends.get(1)}" / "${legends.get(16)}"`);
    const said = (await page.evaluate("window.__said")) as { id: string; moment: number; turn: number }[];
    const heatStart: Record<string, number> = { "c1-cyclone": 4, "c2-flood": 14, "c3-compound": 24 };
    for (const [storm, turn] of Object.entries(heatStart)) {
      // In the year the heat first appears, before any build, she says one line: the warning.
      const thatYear = said.filter((s) => s.turn === turn);
      const firstMoment = thatYear[0]?.moment;
      const atThatMoment = thatYear.filter((s) => s.moment === firstMoment);
      check(atThatMoment.length === 1 && atThatMoment[0].id === `warn:${storm}`, `${storm}: when the heat first appears (turn ${turn}) Maya says one line (${atThatMoment.map((s) => s.id).join(", ") || "none"})`);
    }
    await ctx.close();

    // ---- screenshots of each cone at three sizes -----------------------------
    for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]] as const) {
      const p = await open(browser, server.url, w, h);
      await begin(p);
      await p.evaluate("window.__panjimForTest.maya.holdLines = true; window.__panjimForTest.maya.dismiss()");
      await p.waitForTimeout(1500);
      await shot(p, `cone-cyclone-${w}x${h}`);
      await scenario(p, "year-6");
      await p.evaluate("window.__panjimForTest.maya.dismiss()");
      await p.waitForTimeout(2500);
      await shot(p, `cone-flood-${w}x${h}`);
      await scenario(p, "year-16");
      await p.evaluate("window.__panjimForTest.maya.dismiss()");
      await p.waitForTimeout(2500);
      await shot(p, `cone-compound-${w}x${h}`);
      await p.close();
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
