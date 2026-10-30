/**
 * Section 37.1: how long a storm takes to start and to finish, as a player sees it, on the dev server
 * (`?qa=1&noname=1`, Play Panjim).
 *
 * For each of the run's three storms (the 2030 cyclone, the 2040 flood, the 2050 storm) the run is brought to the
 * storm's year by the player's own build path (`heat-1`), then the year's build is made as a click would (the tile's
 * menu, a card). Measured in the page, by `performance.now()` and a frame counter (requestAnimationFrame):
 *
 *   - lead in: the build card's click to the first visible movement, the storm clock (`__stormForTest.time()`)
 *     reaching the first water on land or in the river (`__stormForTest.firstWave().first`);
 *   - storm: that first movement to the first result card, without Speed up, or with Speed up pressed at the first
 *     movement (`hurry=1`; the replay card then plays on its own, as for a player who pressed it once);
 *   - when Speed up first shows, and the replay card's time on screen.
 *
 * Software GL draws slowly, and the storm clock caps a frame's step at 0.1 s, so the frame counter is reported too:
 * on a real GPU the wall times are the storm's own.
 *
 * Usage: npx tsx tools/section37StormTimes.ts [w=1366] [h=768] [hurry=0|1] [label=before]
 * Prints one JSON line per storm and writes them to docs/qa/section37/storm-times-<label>-<hurry>.json.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const HURRY = args.get("hurry") === "1";
const LABEL = args.get("label") ?? "run";
const PORT = Number(args.get("port") ?? 5237);
const OUT = path.resolve("docs/qa/section37");
fs.mkdirSync(OUT, { recursive: true });

const errors: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;

/** Installed once: a frame counter and the moments the storm's timeline passes, stamped as they happen. */
const PROBE = `(() => {
  const p = (window.__stormProbe = { frames: 0, marks: {}, armed: false, hurry: ${HURRY} });
  const mark = (name) => { if (p.armed && p.marks[name] === undefined) p.marks[name] = { t: performance.now(), f: p.frames }; };
  p.mark = mark;
  document.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (p.armed && t instanceof Element && t.closest(".build-card")) mark("click");
  }, true);
  const loop = () => {
    p.frames++;
    if (p.armed) {
      const s = window.__stormForTest;
      const speed = document.querySelector(".speed-up");
      if (speed && !speed.hidden) mark("speedUp");
      if (s.playing()) {
        if (p.marks.director === undefined) { p.stormStart = s.time(); p.firstWater = s.firstWave()?.first ?? null; p.duration = s.firstWave()?.duration ?? null; }
        mark("director");
      }
      const wave = s.firstWave();
      const time = s.time();
      if (wave && time !== null && time >= wave.first) {
        if (p.marks.move === undefined) {
          mark("move");
          if (p.hurry && speed && !speed.hidden) speed.click();
        }
      }
      if (document.querySelector(".replay-card:not([hidden])")) mark("replay");
      else if (p.marks.replay && !p.marks.replayEnd) mark("replayEnd");
      if (document.querySelector(".result-cards:not([hidden])")) mark("results");
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})()`;

type Mark = { t: number; f: number };
const server = await startDevServer(PORT, 120000);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
let wiggle: NodeJS.Timeout | null = null;
const rows: Record<string, unknown>[] = [];
try {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  await context.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const points = Number(url.searchParams.get("points") ?? 0);
    const body = url.pathname === "/api/board" && url.searchParams.has("points") ? { season: "QA", rank: 1, points, tenth: null, above: [], below: [] } : url.pathname === "/api/board" ? { season: "QA", rows: [] } : {};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  await page.waitForSelector(".brief-cta", { state: "visible", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.locator(".brief-cta").click();
  let x = 0;
  wiggle = setInterval(() => void page.mouse.move(W / 2 + (x++ % 2) * 6, H - 60).catch(() => {}), 20000);
  await js(page, PROBE);
  await page.waitForTimeout(800);

  for (let storm = 0; storm < 3; storm++) {
    const next = await js<{ name: string; kind: string; year: number } | null>(
      page,
      `(() => { const c = window.__panjimForTest.run.nextChallenge(); return c ? { name: c.name, kind: c.kind, year: window.__panjimForTest.run.config.startYear + c.turn - 1 } : null; })()`
    );
    if (!next) break;
    // To the storm's own year, through the player's build path (storms before it played through).
    await js(page, `window.__panjimScenarioForTest("heat-1")`);
    await js(page, "window.__panjimForTest.maya.dismiss()");
    await page.waitForTimeout(1500);
    // The year's build, as a click: a dune if one fits, else a mangrove, else a khazan, away from nothing in particular.
    const pick = await js<{ q: number; r: number; element: string } | null>(
      page,
      `(() => { for (const e of ["dune", "mangrove", "khazan", "sandy_vegetation"]) { const t = window.__panjimForTest.firstBuildable(e); if (t) return { ...t, element: e }; } return null; })()`
    );
    if (!pick) throw new Error("nowhere to build");
    await js(page, `window.__openTileForTest(${pick.q}, ${pick.r})`);
    await page.waitForSelector(`.build-card[data-element="${pick.element}"]`, { timeout: 10000 });
    await page.waitForTimeout(400);
    await js(page, `(() => { const p = window.__stormProbe; p.marks = {}; p.stormStart = undefined; p.armed = true; })()`);
    await page.locator(`.build-card[data-element="${pick.element}"]`).click();
    await page.waitForFunction(`window.__stormProbe.marks.results !== undefined`, undefined, { timeout: 600000 });
    const m = await js<Record<string, Mark>>(page, `(() => { const p = window.__stormProbe; p.armed = false; return p.marks; })()`);
    const clock = await js<{ stormStart: number | null; firstWater: number | null; duration: number | null }>(page, `(() => { const p = window.__stormProbe; return { stormStart: p.stormStart ?? null, firstWater: p.firstWater ?? null, duration: p.duration ?? null }; })()`);
    const s = (a: string, b: string): number | null => (m[a] && m[b] ? Math.round(m[b].t - m[a].t) / 1000 : null);
    const f = (a: string, b: string): number | null => (m[a] && m[b] ? m[b].f - m[a].f : null);
    const row = {
      storm: `${next.year} ${next.kind}`,
      hurry: HURRY,
      leadInS: s("click", "move"),
      leadInFrames: f("click", "move"),
      speedUpAfterClickS: s("click", "speedUp"),
      directorAfterClickS: s("click", "director"),
      moveToResultsS: s("move", "results"),
      moveToResultsFrames: f("move", "results"),
      replayS: s("replay", "replayEnd"),
      // The storm clock: where it started and when the first water comes (storm seconds; 1x unless hurried, 4x hurried).
      stormClockStart: clock.stormStart,
      firstWater: clock.firstWater,
      stormDuration: clock.duration,
      fps: m.click && m.results ? Math.round(((m.results.f - m.click.f) / ((m.results.t - m.click.t) / 1000)) * 10) / 10 : null
    };
    rows.push(row);
    console.log(JSON.stringify(row));
    // Through the result cards, as a player pressing their buttons would.
    for (let i = 0; i < 8 && (await page.locator(".result-cards:not([hidden]) .result-next").count()) > 0; i++) {
      await page.locator(".result-cards:not([hidden]) .result-next").first().click();
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(1500);
  }
} finally {
  if (wiggle) clearInterval(wiggle);
  await browser.close();
  server.stop();
}
fs.writeFileSync(path.join(OUT, `storm-times-${LABEL}-${HURRY ? "hurry" : "plain"}.json`), JSON.stringify(rows, null, 2) + "\n");
if (errors.length) console.log(`console errors: ${errors.slice(0, 5).join(" | ")}`);
process.exit(errors.length === 0 && rows.length === 3 ? 0 : 1);
