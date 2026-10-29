/**
 * Section 37.8: the browser pass for the playtest fixes, on the dev server (`?qa=1&noname=1`; the finale with a name).
 *
 *   1. 37.2: the build menu on the top Miramar beach tile in 2026: its last line ("Not here: ...") under nothing, the
 *      bottom banner hidden while it is open. Screenshot.
 *   2. 37.5: a build, then the pointer to the next pulsing tile within a second and a click: that tile's menu opens
 *      (the camera held still under the moving pointer). Screenshot.
 *   3. 37.6: O and Enter by keyboard: the cursor on a pulsing tile, the menu on the objective's card, Down and Up move,
 *      Enter builds the focused card there. Screenshot.
 *   4. 37.1: the 2030 storm timed from the build's click: Speed up on screen from the first frame, the first water
 *      (frames and storm clock), then result card 1 with its "Objective done" badge. Screenshot.
 *   5. 37.3: the finale's board line with two test names round the run (the board's answer stubbed with dense ranks).
 *      Screenshot.
 *
 * The mouse moves through the scripted runs, or the idle reset would fire.
 *
 * Usage: npx tsx tools/section37Shots.ts [w=1366] [h=768] [out=docs/qa/section37] [finale=1]
 * Exits 1 on a console error or a failed check.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section37");
const FINALE = args.get("finale") !== "0";
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  console.log(`shot ${name}`);
};
type Pt = { x: number; y: number };
const project = (page: Page, key: string): Promise<Pt | null> => js<Pt | null>(page, `(() => { const [q, r] = ${JSON.stringify(key)}.split(",").map(Number); return window.__panjimForTest.host.project({ q, r }); })()`);
const pulsing = (page: Page): Promise<string[]> => js<string[]>(page, "[...window.__objectivePulseForTest.tiles]");
const elementAt = (page: Page, key: string): Promise<string | null> => js<string | null>(page, `window.__panjimForTest.host.state.elements.get(${JSON.stringify(key)})?.elementId ?? null`);

/** The board's answer, stubbed: a named post lands 2nd, between two test names (dense ranks). */
async function stubApi(page: Page): Promise<void> {
  await page.context().route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let body: Record<string, unknown> = {};
    if (url.pathname === "/api/board" && req.method() === "POST") {
      const name = (JSON.parse(req.postData() ?? "{}") as { name?: string }).name ?? "QA";
      body = { season: "QA", rank: 2, points: 4000, tenth: null, above: [{ rank: 1, name: "Test Ana", points: 4300, stars: 7, season: "QA" }], below: [{ rank: 3, name: "Test Rui", points: 3900, stars: 6, season: "QA" }], editToken: "qa-token-0123456789abcdef", name };
    } else if (url.pathname === "/api/board") body = url.searchParams.has("points") ? { season: "QA", rank: 1, points: 0, tenth: null, above: [], below: [] } : { season: "QA", rows: [] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function open(browser: Browser, url: string): Promise<{ page: Page; stop: () => void }> {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  await stubApi(page);
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  let x = 0;
  const wiggle = setInterval(() => void page.mouse.move(W / 2 + (x++ % 2) * 6, H - 40).catch(() => {}), 20000);
  return { page, stop: () => clearInterval(wiggle) };
}

const server = await startDevServer(5238, 120000);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
try {
  const { page, stop } = await open(browser, `${server.url}/?qa=1&noname=1#/play/l01-first-rains`);
  await page.waitForSelector(".brief-cta", { state: "visible", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.locator(".brief-cta").click();
  await page.waitForTimeout(2500);
  await js(page, "window.__panjimForTest.maya.dismiss()");

  // 1. 37.2: the top Miramar beach tile (the beach tile highest on the screen among the objective's), its menu.
  const pulse = await pulsing(page);
  const points = await Promise.all(pulse.map(async (key) => ({ key, at: await project(page, key) })));
  const top = points.filter((p) => p.at).sort((a, b) => a.at!.y - b.at!.y)[0];
  check(!!top, `a pulsing beach tile on screen: ${top?.key}`);
  await page.mouse.click(top.at!.x, top.at!.y);
  await page.waitForSelector(".build-popover .build-card", { timeout: 10000 });
  // The banner fades over 320 ms; software GL draws about a frame a second, so the style lands a frame or two later.
  await page.waitForFunction(`getComputedStyle(document.querySelector(".empty-prompt")).visibility === "hidden"`, undefined, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const menu = await js<{ banner: string; covered: string[]; last: string }>(
    page,
    `(() => {
      const last = document.querySelector(".build-popover .build-card-elsewhere") ?? [...document.querySelectorAll(".build-popover > *")].pop();
      const r = last.getBoundingClientRect();
      const covered = [];
      for (const [x, y] of [[r.left + 4, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 4, r.top + r.height / 2]]) {
        const hit = document.elementFromPoint(x, y);
        if (hit && !hit.closest(".build-popover")) covered.push(hit.className || hit.tagName);
      }
      const banner = getComputedStyle(document.querySelector(".empty-prompt")).visibility;
      return { banner, covered, last: last.textContent };
    })()`
  );
  check(menu.covered.length === 0, `37.2: the menu's last line ("${menu.last}") is under nothing${menu.covered.length ? `: ${menu.covered.join(", ")}` : ""}`);
  check(menu.banner === "hidden", `37.2: the bottom banner is hidden while the menu is open (${menu.banner})`);
  await shot(page, "1-beach-menu");
  await page.keyboard.press("Escape");
  await page.waitForFunction(`getComputedStyle(document.querySelector(".empty-prompt")).visibility === "visible"`, undefined, { timeout: 8000 }).catch(() => {});
  check((await js<string>(page, `getComputedStyle(document.querySelector(".empty-prompt")).visibility`)) === "visible", "37.2: the banner is back once the menu closes");

  // 2. 37.5: build the dune the objective asks for, then go straight for the next pulsing tile and click it.
  const dune = (await js<{ key: string; elementId: string }[]>(page, "window.__panjimForTest.run.objective.picks")).find((p) => p.elementId === "dune")!;
  const at = (await project(page, dune.key))!;
  await page.mouse.click(at.x, at.y);
  await page.waitForSelector('.build-card[data-element="dune"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator('.build-card[data-element="dune"]').click();
  const next = (await pulsing(page)).filter((k) => k !== dune.key)[0];
  const before = (await project(page, next))!;
  await page.mouse.move(before.x, before.y, { steps: 6 });
  await page.waitForTimeout(500);
  const still = (await project(page, next))!;
  check(Math.hypot(still.x - before.x, still.y - before.y) < 2, `37.5: the camera holds while the pointer moves to the next pulse (moved ${Math.round(Math.hypot(still.x - before.x, still.y - before.y))} px)`);
  await page.mouse.click(still.x, still.y);
  await page.waitForSelector(".build-popover .build-card", { timeout: 10000 });
  await page.waitForTimeout(500);
  const chip = await js<string | null>(page, `document.querySelector(".build-popover .objective-chip")?.closest(".build-card")?.dataset.element ?? null`);
  check(chip === "sandy_vegetation", `37.5: the click opens that tile's menu (its objective card: ${chip})`);
  check((await elementAt(page, dune.key)) === "dune", "the dune stands");
  await shot(page, "2-quick-click-menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  // The camera's held move is made once the pointer has been still for 1.5 s.
  await page.waitForTimeout(2200);

  // 3. 37.6: O and Enter by keyboard.
  await page.mouse.move(W - 4, H / 2);
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    if ((await js<string>(page, "document.activeElement?.tagName")) === "CANVAS") break;
  }
  check((await js<string>(page, "document.activeElement?.tagName")) === "CANVAS", "37.6: Tab reaches the board");
  await page.keyboard.press("o");
  await page.waitForTimeout(800);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".build-popover .build-card", { timeout: 10000 });
  await page.waitForTimeout(500);
  const focus = (): Promise<string | null> => js<string | null>(page, "document.activeElement?.dataset?.element ?? null");
  const first = await focus();
  check(first === "sandy_vegetation", `37.6: O and Enter open a pulsing tile on its objective's card (${first})`);
  await page.keyboard.press("ArrowDown");
  const down = await focus();
  await page.keyboard.press("ArrowUp");
  const up = await focus();
  check(down !== first && up === first, `37.6: Down and Up move between the cards (${first}, ${down}, ${up})`);
  await shot(page, "3-keyboard-o-enter");
  const beforeKeys = await js<string[]>(page, "[...window.__panjimForTest.host.state.elements.keys()]");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  const built = (await js<[string, string][]>(page, "[...window.__panjimForTest.host.state.elements.entries()].map(([k, v]) => [k, v.elementId])")).filter(([k]) => !beforeKeys.includes(k));
  const pulseNow = await js<{ key: string; elementId: string }[]>(page, "window.__panjimForTest.run.objective.picks");
  check(built.length === 1 && built[0][1] === "sandy_vegetation" && pulseNow.some((p) => p.key === built[0][0]), `37.6: Enter builds the focused card on that tile (${built.map((b) => b.join(" ")).join(", ")})`);

  // The objective's last row (the second pandanus), so result card 1 has its badge.
  for (const left of await js<{ key: string; elementId: string }[]>(page, "window.__panjimForTest.run.objective.picks")) {
    if ((await elementAt(page, left.key)) !== null) continue;
    const [q, r] = left.key.split(",").map(Number);
    await js(page, `window.__openTileForTest(${q}, ${r})`);
    await page.waitForSelector(`.build-card[data-element="${left.elementId}"]`, { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.locator(`.build-card[data-element="${left.elementId}"]`).click();
    await page.waitForTimeout(2500);
    await js(page, "window.__panjimForTest.maya.dismiss()");
  }

  // 4. 37.1: the 2030 storm, timed from the build's click, then result card 1 with its badge.
  await js(page, `window.__panjimScenarioForTest("heat-1")`);
  await js(page, "window.__panjimForTest.maya.dismiss()");
  await page.waitForTimeout(1500);
  await js(
    page,
    `(() => {
      const p = (window.__lead = { frames: 0, marks: {} });
      const mark = (n) => { if (p.marks[n] === undefined) p.marks[n] = { t: performance.now(), f: p.frames, clock: window.__stormForTest.time() }; };
      document.addEventListener("pointerdown", (e) => { if (e.target instanceof Element && e.target.closest(".build-card")) mark("click"); }, true);
      const loop = () => {
        p.frames++;
        if (p.marks.click) {
          const s = window.__stormForTest;
          const speed = document.querySelector(".speed-up");
          if (speed && !speed.hidden) mark("speedUp");
          if (s.playing()) mark("director");
          const wave = s.firstWave();
          if (wave && s.time() !== null && s.time() >= wave.first) mark("move");
          if (document.querySelector(".result-cards:not([hidden])")) { mark("results"); return; }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    })()`
  );
  const pick = await js<{ q: number; r: number; element: string } | null>(page, `(() => { for (const e of ["mangrove", "khazan", "dune"]) { const t = window.__panjimForTest.firstBuildable(e); if (t) return { ...t, element: e }; } return null; })()`);
  await js(page, `window.__openTileForTest(${pick!.q}, ${pick!.r})`);
  await page.waitForSelector(`.build-card[data-element="${pick!.element}"]`, { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator(`.build-card[data-element="${pick!.element}"]`).click();
  await page.waitForFunction("window.__lead.marks.results !== undefined", undefined, { timeout: 900000 });
  const lead = await js<Record<string, { t: number; f: number; clock: number | null }>>(page, "window.__lead.marks");
  check(!!lead.speedUp && lead.speedUp.f - lead.click.f <= 1, `37.1: Speed up shows on the first frame after the build (${lead.speedUp ? lead.speedUp.f - lead.click.f : "never"} frames)`);
  check(lead.director?.clock === 5, `37.1: the storm clock starts at 5 s, 2 s before the first water at 7 s (${lead.director?.clock})`);
  // A frame moves the storm clock at most 0.1 s (fewer seconds on a fast frame), so this is read off the clock.
  check(!!lead.move && (lead.move.clock ?? 0) - (lead.director.clock ?? 0) <= 2.15, `37.1: the first water 2 s of storm clock after the start (${lead.move ? ((lead.move.clock ?? 0) - (lead.director.clock ?? 0)).toFixed(2) : "?"} s, ${lead.move ? lead.move.f - lead.director.f : "?"} frames)`);
  console.log(`timing 2030: click to director ${Math.round(lead.director.t - lead.click.t)} ms, director to first water ${lead.move.f - lead.director.f} frames, first water to result card ${lead.results.f - lead.move.f} frames`);
  await page.waitForTimeout(3500);
  const badge = await js<string | null>(page, `document.querySelector(".result-cards:not([hidden]) .result-badge")?.textContent ?? null`);
  check(badge === "Objective done", `37.7: result card 1's badge says Objective done (${badge})`);
  await shot(page, "4-result-card-1");
  stop();
  await page.context().close();

  // 5. 37.3: the finale's board line, a named run between two test names.
  if (FINALE) {
    const named = await open(browser, `${server.url}/?qa=1#/play/l01-first-rains`);
    const p = named.page;
    await p.waitForSelector(".name-card-field", { state: "visible", timeout: 60000 });
    check((await p.locator(".name-card-field").inputValue()) === "", "37.4: the name card opens empty");
    await p.locator(".name-card-field").fill("QA Tester");
    await p.keyboard.press("Enter");
    await p.waitForSelector(".brief-cta", { state: "visible", timeout: 60000 });
    await p.waitForTimeout(800);
    await p.locator(".brief-cta").click();
    await p.waitForTimeout(1500);
    check(await js<boolean>(p, `window.__panjimScenarioForTest("finale")`), "the run plays on to its finale card");
    await p.waitForSelector(".finale-rank-rows", { timeout: 60000 });
    await p.waitForTimeout(3500);
    const rows = await js<string[]>(p, `[...document.querySelectorAll(".finale-rank-rows li")].map((li) => li.textContent.replace(/\\s+/g, " ").trim())`);
    const head = await js<string>(p, `document.querySelector(".finale-rank-head")?.textContent ?? ""`);
    const note = await js<string>(p, `document.querySelector(".finale-rank-note")?.textContent ?? ""`);
    check(head === "2nd on the board" && /behind 1st/.test(note) && rows.length === 3 && /Test Ana/.test(rows[0]) && /QA Tester/.test(rows[1]) && /Test Rui/.test(rows[2]), `37.3: the finale's board line: ${head}; ${note}; ${rows.join(" | ")}`);
    await shot(p, "5-finale-board");
    named.stop();
  }
} finally {
  await browser.close();
  server.stop();
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
process.exit(failures === 0 ? 0 : 1);
