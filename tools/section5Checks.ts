/**
 * Section 5: yearly turns, coins off, instant defences. Browser checks on
 * Panaji (software GL).
 *
 * Usage:  npx tsx tools/section5Checks.ts [outDir]   (outDir defaults to docs/qa/section5)
 *
 *   - the clock: 2026 and "Year 1 of 25" at the start, builds left, Next year;
 *   - the cap: four builds a year, a fifth refused; the build menu then says
 *     no builds are left and points to Next year, whose button works;
 *   - Next year after 0, 1 and every build;
 *   - building never changes Coin;
 *   - no coin, price, cost, reward or growing text anywhere in the DOM, in
 *     every state a player reaches: the brief, the board, both panels, help,
 *     the build menu and its tooltips, an info card, the warning years, the
 *     storm, the Aftermath and its replay, the finale and the results;
 *     and the coin jar, price column, rewards and "growing" are not drawn;
 *   - every tooltip on screen read for the same words;
 *   - the storms resolve at the end of 2030, 2040 and 2050 in the browser;
 *   - axe-core, no serious or critical issues;
 *   - screenshots at 1366x768, 1920x1080 and 2560x1440, each with a -gray
 *     copy, and a -deut (deuteranopia) copy of the key shot;
 *   - zero console errors.
 * Exits 1 if any check fails.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section5");
const PORT = Number(process.env.CHECK_PORT ?? 5305);
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

async function shot(page: Page, name: string, deut = false): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 85 });
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 75 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
  if (deut) {
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
}

async function open(browser: Browser, url: string, w: number, h: number): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${w}x${h}: ${m.text()}`);
  });
  await page.goto(`${url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForTimeout(1200);
  return page;
}

async function begin(page: Page): Promise<void> {
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3000);
}

const scenario = (page: Page, name: string): Promise<boolean> => page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(name)})`) as Promise<boolean>;
const run = <T>(page: Page, expr: string): Promise<T> => page.evaluate(`(function () { var p = window.__panjimForTest; var r = p.run; return ${expr}; })()`) as Promise<T>;

/** Words that must not appear on Panaji while coins and growth are off. */
const FORBIDDEN: [RegExp, string][] = [
  [/\bcoins?\b/i, "coin"],
  [/\b\d+\s?c\b/, "a price like 35c"],
  [/\bcosts?\b|\bprice|\bcheap|\bexpensive|\bafford|\bearns?\b|\bincome\b|\bpays?\b/i, "cost, price or earning"],
  [/\bgrowing\b|\bmatur|\bto grow\b|grows? stronger|take[s]? (a few|\d+) years/i, "growing"],
  [/\bqtr\b|\bquarters?\b|\bseasons?\b|Q[1-4] 20\d\d/, "quarters"]
];

/** Every piece of text a player can see now: the page, labels, titles, and the tooltip of every visible control. */
async function visibleText(page: Page): Promise<string[]> {
  return page.evaluate(`(async function () {
    var out = [document.body.innerText];
    document.querySelectorAll("[aria-label], [title], [placeholder], [alt]").forEach(function (el) {
      if (el.getClientRects().length === 0) return;
      ["aria-label", "title", "placeholder", "alt"].forEach(function (a) { var v = el.getAttribute(a); if (v) out.push(v); });
    });
    var tip = document.querySelector(".hud-tooltip");
    var els = Array.from(document.querySelectorAll("[data-tip]")).filter(function (el) { return el.getClientRects().length > 0; });
    for (var i = 0; i < els.length; i++) {
      els[i].dispatchEvent(new FocusEvent("focus"));
      if (tip && !tip.hidden) out.push("[tip " + els[i].getAttribute("data-tip") + "] " + tip.textContent);
      els[i].dispatchEvent(new FocusEvent("blur"));
    }
    return out;
  })()`) as Promise<string[]>;
}

/** Nothing that names a price may be drawn. */
const NOT_DRAWN = [".coin-jar", ".coin-value", ".coin-row", ".income-row", ".pill-coin", ".get-ready-reward", ".get-ready-pop", ".build-option .cost", ".gauge-growing", ".time-cost"];

async function scan(page: Page, state: string): Promise<void> {
  const texts = await visibleText(page);
  const hits: string[] = [];
  for (const text of texts) {
    for (const [pattern, what] of FORBIDDEN) {
      const m = pattern.exec(text);
      if (m) hits.push(`${what}: "...${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}..."`);
    }
  }
  const drawn = (await page.evaluate(`${JSON.stringify(NOT_DRAWN)}.filter(function (s) { return Array.from(document.querySelectorAll(s)).some(function (el) { return el.getClientRects().length > 0; }); })`)) as string[];
  check(hits.length === 0 && drawn.length === 0, `no coin, price, cost, reward or growing text, ${state}${hits.length ? `: ${hits.slice(0, 4).join(" | ")}` : ""}${drawn.length ? `; drawn: ${drawn.join(", ")}` : ""}`);
}

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: ${found.length ? found.join(", ") : "no serious or critical violations"}`);
}

/** Free tiles of a terrain near the city, best first. */
async function freeTiles(page: Page, element: string, n: number): Promise<{ q: number; r: number }[]> {
  return page.evaluate(`(function () {
    var p = window.__panjimForTest; var out = []; var state = p.run.state;
    var keys = Array.from(state.placed.keys());
    for (var i = 0; i < keys.length && out.length < ${n}; i++) {
      var c = state.placed.get(keys[i]).coord;
      if (state.canBuild(c, ${JSON.stringify(element)})) out.push({ q: c.q, r: c.r });
    }
    return out;
  })()`) as Promise<{ q: number; r: number }[]>;
}

async function closePopover(page: Page): Promise<void> {
  await page.evaluate(`(function () { var b = document.querySelector(".popover-backdrop"); if (b && !b.hidden) b.click(); })()`);
  await page.waitForTimeout(200);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    // ---- the full run at 1920x1080: every state scanned -------------------
    const page = await open(browser, server.url, 1920, 1080);
    await scan(page, "the brief");
    await begin(page);
    const face = (await page.evaluate(`document.querySelector(".clock-face").innerText`)) as string;
    check(/2026/.test(face) && /Year 1 of 25/.test(face), `the clock reads 2026, Year 1 of 25 ("${face.replace(/\s+/g, " ")}")`);
    const builds = (await page.evaluate(`document.querySelector(".clock-builds").innerText`)) as string;
    check(/Builds left this year\s*4 of 4/.test(builds), `builds left: "${builds.replace(/\s+/g, " ")}"`);
    const nextLine = (await page.evaluate(`document.querySelector(".outlook-line").innerText`)) as string;
    check(/Cyclone · end of 2030 · \w+ · 5 years/.test(nextLine), `years until the next storm: "${nextLine}"`);
    check((await page.locator(".clock-next-year").count()) === 1 && (await page.locator(".clock-ff-event, .clock-ff-year").count()) === 0, "one Next year button; +1 year and Next event are gone");
    await scan(page, "the board at the start");
    await axe(page, "the board at the start");
    const coin0 = await run<number>(page, "r.state.coin");

    // Both panels and help.
    await page.locator(".hud-panel-status .hud-panel-button").click();
    await page.waitForTimeout(500);
    await scan(page, "Status open");
    await axe(page, "Status open");
    await page.locator(".hud-panel-settings .hud-panel-button").click();
    await page.waitForTimeout(500);
    await scan(page, "Settings open");
    // Shut with its own button: Esc with nothing open is the level's Back.
    await page.locator(".hud-panel-settings .hud-panel-button").click();
    await page.waitForTimeout(400);
    await page.locator(".help-button").click();
    await page.waitForTimeout(300);
    await scan(page, "How to Play open");
    const help = (await page.evaluate(`document.querySelector(".help-card").innerText`)) as string;
    check(/2026 to 2050/.test(help) && /up to 4 times a year/.test(help) && /end of 2030/.test(help), "How to Play describes years, the cap and the calendar from the data");
    await page.locator(".help-backdrop:not([hidden]) .help-close").first().click();
    await page.waitForTimeout(300);

    // The build menu and its tooltips.
    const beach = await freeTiles(page, "dune", 6);
    await page.evaluate(`window.__openTileForTest(${beach[0].q}, ${beach[0].r})`);
    await page.waitForTimeout(500);
    await scan(page, "the build menu");
    const options = (await page.evaluate(`Array.from(document.querySelectorAll(".build-popover .build-option")).map(function (b) { return b.innerText; })`)) as string[];
    check(options.length > 0 && options.every((o) => !/\d/.test(o)), `build menu options carry no number: ${options.map((o) => o.replace(/\s+/g, " ")).join("; ")}`);
    await closePopover(page);

    // The cap: four builds, then a fifth is refused; the menu says so and points to Next year.
    const built: boolean[] = [];
    for (let i = 0; i < 4; i++) built.push(await page.evaluate(`window.__panjimForTest.build({ q: ${beach[i].q}, r: ${beach[i].r} }, "dune")`) as boolean);
    check(built.every(Boolean), "four builds in 2026 go through");
    check((await run<number>(page, "r.state.coin")) === coin0, `building changes no coin value (${coin0} before and after)`);
    const fifth = (await page.evaluate(`window.__panjimForTest.build({ q: ${beach[4].q}, r: ${beach[4].r} }, "dune")`)) as boolean;
    check(!fifth && (await run<number>(page, "r.buildsLeft")) === 0, "a fifth build in the same year is refused");
    await page.waitForTimeout(400);
    await page.evaluate(`window.__openTileForTest(${beach[4].q}, ${beach[4].r})`);
    await page.waitForTimeout(500);
    const notice = (await page.evaluate(`(document.querySelector(".build-notice") || {}).innerText || ""`)) as string;
    check(/No builds left this year/.test(notice) && /Next year/.test(notice), `the build menu says no builds are left and points to Next year ("${notice.replace(/\s+/g, " ")}")`);
    const blocked = (await page.evaluate(`Array.from(document.querySelectorAll(".build-popover .build-option")).every(function (b) { return b.classList.contains("disabled") && b.getAttribute("aria-disabled") === "true"; })`)) as boolean;
    check(blocked, "every option in that menu is disabled");
    await scan(page, "the build menu with no builds left");
    await shot(page, "cap-1920x1080", true);
    await axe(page, "the build menu with no builds left");
    await page.locator(".build-notice-action").click();
    await page.waitForTimeout(1500);
    check((await run<number>(page, "r.turnNumber")) === 2 && (await run<number>(page, "r.buildsLeft")) === 4, "the menu's Next year moves to 2027 with four fresh builds");

    // An info card on a built tile.
    await page.evaluate(`window.__openTileForTest(${beach[0].q}, ${beach[0].r})`);
    await page.waitForTimeout(500);
    const card = (await page.evaluate(`(document.querySelector(".build-popover") || {}).innerText || ""`)) as string;
    check(/Dune/.test(card) && !/money/i.test(card), `the info card names no money ("${card.replace(/\s+/g, " ")}")`);
    await scan(page, "an info card");
    await closePopover(page);

    // Next year at 0, 1 and the full number of builds.
    const before0 = await run<number>(page, "r.turnNumber");
    await page.locator(".clock-next-year").click();
    await page.waitForTimeout(1200);
    check((await run<number>(page, "r.turnNumber")) === before0 + 1, "Next year with 0 builds made");
    const one = await freeTiles(page, "mangrove", 1);
    await page.evaluate(`window.__panjimForTest.build({ q: ${one[0].q}, r: ${one[0].r} }, "mangrove")`);
    await page.locator(".clock-next-year").click();
    await page.waitForTimeout(1200);
    check((await run<number>(page, "r.turnNumber")) === before0 + 2 && (await run<number>(page, "r.buildsLeft")) === 4, "Next year with 1 build made");
    check((await run<number>(page, "r.state.coin")) === coin0, "Coin still unchanged after more builds and years");

    // The warning years, the storm, the Aftermath and its replay.
    await scenario(page, "heat-2");
    await page.waitForTimeout(1500);
    await scan(page, "two years before the cyclone (heat on)");
    await scenario(page, "heat-1");
    await page.waitForTimeout(1500);
    await scan(page, "the cyclone's year");
    check((await run<number>(page, "r.year")) === 2030 && (await run<number>(page, "r.turnNumber")) === 5, "the cyclone's year is 2030, turn 5");
    await scenario(page, "storm-5");
    await scan(page, "mid-storm");
    await scenario(page, "storm-release");
    for (let i = 0; i < 200 && !(await page.evaluate(`Boolean(document.querySelector(".replay-card:not([hidden]), .aftermath-card:not([hidden])"))`)); i++) {
      await page.evaluate(`document.dispatchEvent(new PointerEvent("pointerdown"))`);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(600);
    await scan(page, "the storm's replay or Aftermath");
    for (let i = 0; i < 200 && !(await page.evaluate(`Boolean(document.querySelector(".aftermath-continue"))`)); i++) {
      await page.evaluate(`document.dispatchEvent(new PointerEvent("pointerdown"))`);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1500);
    await scan(page, "the Aftermath card");
    const title = (await page.evaluate(`(document.querySelector(".aftermath-card") || {}).innerText || ""`)) as string;
    check(/end of 2030/.test(title), `the Aftermath says end of 2030`);
    check(/Replay from 2029/.test(title), `Replay rewinds to the start of the warning, 2029`);
    await page.locator(".aftermath-continue").click();
    await page.waitForTimeout(1500);
    check((await run<string>(page, "Array.from(r.landed).join()")) === "c1-cyclone" && (await run<number>(page, "r.turnNumber")) === 6, "the cyclone resolved when Next year was pressed in 2030; now 2031");
    await scan(page, "after the cyclone");

    // On to the finale, then the results.
    await scenario(page, "finale");
    await page.waitForTimeout(2500);
    const resolvedAt = (await run<string>(page, "r.schedule.map(function (c) { return c.id + ':' + r.outcomes.has(c.id); }).join()")) as string;
    check(resolvedAt === "c1-cyclone:true,c2-flood:true,c3-compound:true", `all three storms resolved (${resolvedAt})`);
    await scan(page, "the finale card");
    for (let i = 0; i < 30 && !(await page.evaluate(`Boolean(document.querySelector(".results-screen, .results"))`)); i++) {
      await page.evaluate(`(function () { var b = document.querySelector(".finale-card button"); if (b) b.click(); })()`);
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(1000);
    await scan(page, "the results screen");
    await page.close();

    // ---- screenshots at three sizes ----------------------------------------
    for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]] as const) {
      const p = await open(browser, server.url, w, h);
      await shot(p, `brief-${w}x${h}`);
      await begin(p);
      await p.evaluate("window.__panjimForTest.maya.holdLines = true");
      await shot(p, `start-${w}x${h}`, w === 1920);
      const tiles = await freeTiles(p, "dune", 1);
      await p.evaluate(`window.__openTileForTest(${tiles[0].q}, ${tiles[0].r})`);
      await shot(p, `menu-${w}x${h}`);
      await closePopover(p);
      await p.locator(".hud-panel-status .hud-panel-button").click();
      await p.waitForTimeout(500);
      await shot(p, `status-${w}x${h}`);
      await p.locator(".hud-panel-status .hud-panel-button").click();
      await p.waitForTimeout(400);
      await scenario(p, "heat-1");
      await p.waitForTimeout(1200);
      await shot(p, `heat-${w}x${h}`, w === 1920);
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
