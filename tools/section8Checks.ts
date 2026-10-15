/**
 * Section 8: one build a year, the forecast on the start popup, a cleaner
 * HUD. Browser checks on Panaji (software GL). Replaces the Section 5 and 6
 * checks, whose clock (several builds a year, Next year) is gone.
 *
 * Usage:  npx tsx tools/section8Checks.ts [outDir]   (outDir defaults to docs/qa/section8)
 *
 *   - the start popup: "The first cyclone lands in 5 years", the cone's map
 *     (bands, track, area to protect, Kala Academy and Sharada Mandir named)
 *     and its legend; no scrolling at 1366x768;
 *   - each build advances exactly one year; the storms hit straight after
 *     builds 5, 15 and 25 while the clock still shows 2030, 2040 and 2050;
 *   - the clock: "Year N of 25" and "N builds until the cyclone" (or flood,
 *     or both); no "Next year" and no "Houses standing" anywhere on screen;
 *   - the cone on the map at turns 1, 6 and 16 only, with no chip and no
 *     legend on the game screen in any turn;
 *   - after a reload in 2031, continuing shows no cone and no opening line;
 *   - the heat only in turns 4-5, 14-15 and 24-25; Maya says one line when
 *     it first appears in a phase;
 *   - the first objective (2 pandanus, 2 dunes, 1 breakwater) is Maya's
 *     first line and in the Status panel;
 *   - no coin or cost words on screen;
 *   - axe-core on the popup and each phase start;
 *   - screenshots of the popup (with -gray and -deut copies) and of turns 1,
 *     4, 5, 6 and 16 at 1366x768, 1920x1080 and 2560x1440;
 *   - zero console errors.
 * Exits 1 if any check fails.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section8");
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

/** The year's build, away from the storms, playing any storm through as a player would (hurrying it, closing its Aftermath). */
async function passYear(page: Page): Promise<void> {
  await scenario(page, "pass-year");
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
    // ---- the start popup at three sizes ------------------------------------
    for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]] as const) {
      const p = await open(browser, server.url, w, h);
      const popup = (await p.evaluate(`(function () {
        var card = document.querySelector(".brief-card");
        var fig = card && card.querySelector(".cone-preview");
        var svg = fig && fig.querySelector("svg");
        return {
          line: fig ? (fig.querySelector(".cone-preview-line") || {}).textContent : "",
          legend: fig ? Array.from(fig.querySelectorAll(".cone-legend li")).map(function (li) { return li.textContent.trim(); }).join(" | ") : "",
          bands: svg ? Array.from(svg.querySelectorAll("path[fill='#821a1c'], path[fill='#dc5a4a'], path[fill='#fdc2b4']")).length : 0,
          track: svg ? svg.querySelectorAll("path[marker-end]").length : 0,
          dashed: svg ? svg.querySelectorAll("path[stroke-dasharray]").length : 0,
          places: svg ? Array.from(svg.querySelectorAll(".cone-preview-place text")).map(function (t) { return t.textContent; }).join(" | ") : "",
          scrolls: card ? card.scrollHeight > card.clientHeight + 1 : true,
          fits: card ? card.getBoundingClientRect().bottom <= innerHeight && card.getBoundingClientRect().top >= 0 : false
        };
      })()`)) as { line: string; legend: string; bands: number; track: number; dashed: number; places: string; scrolls: boolean; fits: boolean };
      check(popup.line === "The first cyclone lands in 5 years", `${w}x${h} popup line: "${popup.line}"`);
      check(popup.legend === "Most likely | Likely | Possible | Area to protect", `${w}x${h} popup legend: "${popup.legend}"`);
      check(popup.bands > 20 && popup.track >= 1 && popup.dashed >= 2, `${w}x${h} popup map: ${popup.bands} band tiles, ${popup.track} track with arrowhead, ${popup.dashed} dashed lines`);
      check(/Kala Academy/.test(popup.places) && /Sharada Mandir/.test(popup.places), `${w}x${h} popup map names: ${popup.places}`);
      check(!popup.scrolls && popup.fits, `${w}x${h} popup fits with no scrolling`);
      if (w === 1920) await axe(p, "the start popup");
      await shot(p, `popup-${w}x${h}`);
      await p.close();
    }

    // ---- one whole run at 1920x1080: every turn -----------------------------
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await open(browser, server.url, 1920, 1080, ctx);
    // Log every line Maya says, by id, with the moment and turn she says it in;
    // and what the clock reads when each storm begins.
    await page.evaluate(`(function () {
      var m = window.__panjimForTest.maya; window.__said = [];
      var next = m.next.bind(m);
      m.next = function () { var ok = next(); if (ok && m.currentLine) window.__said.push({ id: m.currentLine.id, moment: window.__panjimForTest.run.moment, turn: window.__panjimForTest.run.turnNumber }); return ok; };
      var fx = window.__panjimForTest.host.challengeFx; window.__stormClock = [];
      var begin = fx.begin.bind(fx);
      fx.begin = function (c) { window.__stormClock.push({ id: c.id, clock: document.querySelector(".clock-year").textContent, builds: window.__builds }); return begin(c); };
      var p = window.__panjimForTest; window.__builds = 0;
      var build = p.build.bind(p);
      p.build = function (coord, id) { var ok = build(coord, id); if (ok) window.__builds++; return ok; };
    })()`);
    await begin(page);
    const first = (await page.evaluate(`(window.__panjimForTest.maya.currentLine || {}).id || ""`)) as string;
    check(first === "first-job", `Maya's first line is the objective (${first})`);
    const firstText = (await page.evaluate(`(document.querySelector(".maya-text, .maya-bubble") || {}).textContent || ""`)) as string;
    check(/Kala Academy to Sharada Mandir/.test(firstText), `her first line names it: "${firstText.trim().slice(0, 120)}"`);
    await page.locator(".hud-panel-status .hud-panel-button").click();
    await page.waitForTimeout(500);
    const objective = (await page.evaluate(`(document.querySelector(".status-objective") || {}).innerText || ""`)) as string;
    check(/Protect Kala Academy to Sharada Mandir/.test(objective) && /2 pandanus/.test(objective) && /2 dunes/.test(objective) && /1 breakwater/.test(objective), `the objective is in the Status panel, 5 builds: "${objective.replace(/\s+/g, " ")}"`);
    await shot(page, "objective-status-1920x1080");
    await page.locator(".hud-panel-status .hud-panel-button").click();
    await page.waitForTimeout(400);

    const coneTurns: number[] = [];
    const heatTurns: number[] = [];
    let oneYearEach = true;
    let wordsOnGame = 0;
    let badText = "";
    let clockOk = true;
    for (let turn = 1; turn <= 25; turn++) {
      const now = await val<number>(page, "r.turnNumber");
      if (now !== turn) {
        check(false, `the run is on turn ${now}, expected ${turn}`);
        break;
      }
      await page.waitForTimeout(800);
      if (await coneShown(page)) {
        coneTurns.push(turn);
        if (turn === 6 || turn === 16) await axe(page, `the cone on turn ${turn}`);
      } else if (!(await coneGone(page))) check(false, `turn ${turn}: the cone is half there`);
      wordsOnGame += await coneWords(page);
      const text = await screenText(page);
      if (/Next year|Houses standing|builds left|\bcoins?\b|\bcost\b/i.test(text)) badText ||= `turn ${turn}: ${(/Next year|Houses standing|builds left|\bcoins?\b|\bcost\b/i.exec(text) || [""])[0]}`;
      if ((await page.locator(".houses-counter, .clock-next-year").count()) > 0) badText ||= `turn ${turn}: an old HUD element`;
      const clock = (await page.evaluate(`document.querySelector(".panjim-clock").innerText`)) as string;
      const storm = turn <= 5 ? "the cyclone" : turn <= 15 ? "the flood" : "the cyclone and flood";
      const until = turn <= 5 ? 6 - turn : turn <= 15 ? 16 - turn : 26 - turn;
      const want = `${until} ${until === 1 ? "build" : "builds"} until ${storm}`;
      if (!clock.includes(`Year ${turn} of 25`) || !clock.includes(want)) {
        clockOk = false;
        check(false, `turn ${turn}: the clock reads "${clock.replace(/\s+/g, " ")}" (wanted "Year ${turn} of 25" and "${want}")`);
      }
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
          check(!(await screenText(reload)).includes("our first job"), "after the reload Maya does not give the first objective's line again");
        }
        await reload.close();
      }
      if (turn < 25) {
        const builds = (await page.evaluate("window.__builds")) as number;
        await passYear(page);
        if ((await val<number>(page, "r.turnNumber")) !== turn + 1 || (await page.evaluate("window.__builds")) !== builds + 1) oneYearEach = false;
      }
    }
    check(oneYearEach, "each build advanced exactly one year, turns 1 to 25");
    check(clockOk, "the clock read \"Year N of 25\" and \"N builds until …\" on every turn");
    check(wordsOnGame === 0, `no forecast chip or legend on the game screen in any turn (${wordsOnGame} seen)`);
    check(badText === "", `no "Next year", "Houses standing", builds-left, coin or cost text on the game screen in any turn${badText ? ` (${badText})` : ""}`);
    check(JSON.stringify(coneTurns) === "[1,6,16]", `the cone shows on the map on turns ${coneTurns.join(", ")} (expected 1, 6, 16), and on no other`);
    check(JSON.stringify(heatTurns) === "[4,5,14,15,24,25]", `the heat shows on turns ${heatTurns.join(", ")} (expected 4, 5, 14, 15, 24, 25)`);
    // The last build: the storm in 2050, straight after the 25th build.
    await scenario(page, "pass-year");
    await page.waitForTimeout(1500);
    const storms = (await page.evaluate("window.__stormClock")) as { id: string; clock: string; builds: number }[];
    check(
      JSON.stringify(storms.map((s) => `${s.id}@${s.clock}`)) === JSON.stringify(["c1-cyclone@2030", "c2-flood@2040", "c3-compound@2050"]),
      `each storm plays while the clock still shows its year: ${storms.map((s) => `${s.id} at ${s.clock}`).join(", ")}`
    );
    check(storms.map((s) => s.builds).join(",") === "5,15,25", `the storms come straight after builds ${storms.map((s) => s.builds).join(", ")} (expected 5, 15, 25)`);
    const said = (await page.evaluate("window.__said")) as { id: string; moment: number; turn: number }[];
    const heatStart: Record<string, number> = { "c1-cyclone": 4, "c2-flood": 14, "c3-compound": 24 };
    for (const [storm, turn] of Object.entries(heatStart)) {
      // Once the heat first appears, the first thing she says is the warning, alone at its moment. (This
      // check moves a year every ~1.5 s while her lines stay up for 7 s or more, so a line still showing
      // can hold the warning into the next year: it is checked as the first line since the heat, not
      // as a line in that exact year.)
      const since = said.filter((s) => s.turn >= turn && s.turn <= turn + 1);
      const firstMoment = since[0]?.moment;
      const atThatMoment = since.filter((s) => s.moment === firstMoment);
      check(atThatMoment.length === 1 && atThatMoment[0].id === `warn:${storm}`, `${storm}: when the heat first appears (turn ${turn}) the first line Maya says is the warning, alone (${atThatMoment.map((s) => `${s.id} on turn ${s.turn}`).join(", ") || "none"})`);
    }
    await ctx.close();

    // ---- turns 1, 4, 5, 6 and 16 at three sizes ------------------------------
    for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]] as const) {
      const p = await open(browser, server.url, w, h);
      await begin(p);
      await p.evaluate("window.__panjimForTest.maya.holdLines = true; window.__panjimForTest.maya.dismiss()");
      await p.waitForTimeout(1500);
      for (const turn of [1, 4, 5, 6, 16]) {
        if (turn > 1) await scenario(p, `year-${turn}`);
        await p.evaluate("window.__panjimForTest.maya.dismiss()");
        await p.waitForTimeout(turn === 1 ? 500 : 2500);
        await plainShot(p, `turn${turn}-${w}x${h}`);
      }
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
