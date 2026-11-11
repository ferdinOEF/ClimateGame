/**
 * Section 41.5: the short browser pass for the shore defenses, Campal in 2050 and the nature standing at the start, on
 * the dev server with `/api` stubbed (nothing reaches the board), every page opened with `?qa=1&tag=FestTesters`.
 *
 *   start   by hand: Play Panjim, the name card, Next, Next, "Let's Play!", the guided start (a dune, then pandanus),
 *           and after it hands over Maya's line about the nature already standing; the three standing defenses.
 *   tiles   a first sea tile beside Campal offers Seawall and Breakwater (the seawall's card has its three lines); a
 *           sea tile beyond it offers neither; the four tiles on Campal's water edge hold no home and take a seawall.
 *   storm   the committed best plan (docs/qa/section41/best_plan.json) played through the game: a seawall on the water
 *           at Campal, the last card (every home saved) and "What protected your homes", which names the seawall.
 *   warning Maya's warning two years before the 2050 storm, on a run that built away from the storms (on the best
 *           plan no home is at risk by then, and she gives no warning).
 *
 * Usage: npx tsx tools/section41Shots.ts [w=1366] [h=768] [out=docs/qa/section41] [only=start,tiles,storm,warning] [port=5251]
 * (GPU=1 on a machine with one.) Exits 1 on a console error or a failed check.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";
import { letsPlay } from "./letsPlay";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section41");
const ONLY = new Set((args.get("only") ?? "start,tiles,storm,warning").split(","));
fs.mkdirSync(OUT, { recursive: true });

const STANDING_LINE = "Panjim already has mangroves and khazan land at Merces and Taleigao. Keep them standing.";
const CAMPAL_LINE = "At Campal the sea and the river rise together. Seawalls and breakwaters along the shore can hold them back.";
const SEAWALL_LINES = ["The strongest wall against cyclone surge.", "In the 2050 storm it holds back the river too.", "Costs nature, and cracks with age."];

let failures = 0;
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const posts: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const shot = async (page: Page, name: string, wait = 1500): Promise<void> => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 88 });
  console.log(`shot ${name}`);
};
const mayaText = (page: Page): Promise<string> => js<string>(page, `(() => { const b = document.querySelector(".maya-bubble"); return b && !b.hidden ? (b.querySelector(".maya-text")?.textContent ?? "") : ""; })()`);
/** The open build menu: its cards (element ids, in order), each card's lines, its note if it is one, and whether it is on screen. */
const menu = (page: Page): Promise<{ cards: string[]; lines: Record<string, string[]>; note: string; onScreen: boolean; remove: string }> =>
  js(
    page,
    `(() => {
      const el = document.querySelector(".build-popover");
      const r = el.getBoundingClientRect();
      const cards = [...el.querySelectorAll(".build-card")];
      const lines = {};
      for (const c of cards) lines[c.dataset.element] = [...c.querySelectorAll(".build-card-line, .build-card-detail")].map((s) => s.textContent);
      return { cards: cards.map((c) => c.dataset.element), lines, note: el.querySelector(".popover-note")?.textContent ?? "", onScreen: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, remove: [...el.querySelectorAll("button")].map((b) => b.textContent).find((t) => /Demolish|Remove/.test(t ?? "")) ?? "" };
    })()`
  );
const openTile = async (page: Page, q: number, r: number): Promise<void> => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await js(page, `window.__openTileForTest(${q}, ${r})`);
  await page.waitForTimeout(1600);
};
const zoomIn = async (page: Page, clicks = 5): Promise<void> => {
  await page.mouse.move(W / 2, H / 2);
  for (let i = 0; i < clicks; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
};
const zoomOut = async (page: Page, clicks = 5): Promise<void> => {
  await page.mouse.move(W / 2, H / 2);
  for (let i = 0; i < clicks; i++) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
};

async function open(browser: Browser, url: string): Promise<{ page: Page; stop: () => void }> {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  // Every /api call is answered here: a tagged post gets the server's own answer for a test session.
  await context.route("**/api/**", (route) => {
    const req = route.request();
    const at = new URL(req.url());
    let sent: Record<string, unknown> = {};
    try {
      sent = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
    } catch {
      sent = {};
    }
    if (req.method() !== "GET") posts.push(`${req.method()} ${at.pathname}${typeof sent.tag === "string" ? ` tag=${sent.tag}` : " NO TAG"}`);
    let body: Record<string, unknown> = { saved: true };
    if (at.pathname === "/api/board" && req.method() === "POST") body = { season: "QA", tagged: true, points: 0, name: sent.name, editToken: "" };
    else if (at.pathname === "/api/board") body = { season: "QA", rows: [] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // The mouse moves through the scripted runs, or the idle reset would fire.
  let x = 0;
  const wiggle = setInterval(() => void page.mouse.move(W / 2 + (x++ % 2) * 6, H - 40).catch(() => {}), 20000);
  return { page, stop: () => clearInterval(wiggle) };
}

const server = await startDevServer(Number(args.get("port") ?? 5251), 120000);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
try {
  // ---- The start by hand, Maya's line, the three standing defenses; then the tile menus at Campal ----
  if (ONLY.has("start") || ONLY.has("tiles")) {
    const { page, stop } = await open(browser, `${server.url}/?qa=1&tag=FestTesters`);
    await page.waitForSelector(".menu-quote", { timeout: 60000 });
    await page.click(".menu-actions .btn-primary");
    await page.waitForSelector(".name-card-field", { state: "visible", timeout: 120000 });
    await page.locator(".name-card-field").fill("QA Shore");
    await page.keyboard.press("Enter");
    await letsPlay(page);
    await page.waitForFunction(`window.__guideForTest && window.__guideForTest.step() === "1"`, null, { timeout: 60000 });
    check(true, "Play Panjim, the name card, Next, Next, Let's Play!: the guided start runs (step 1)");
    const standing = await js<string>(page, `(() => { const s = window.__panjimForTest.run.state; return ["26,6", "16,15", "7,21"].map((k) => { const e = s.elements.get(k); return e ? e.elementId + (e.fromStart ? "*" : "") : "none"; }).join(" "); })()`);
    check(standing === "khazan* khazan* mangrove*", `the three standing defenses are on the board from the first turn (${standing})`);
    const drawn = await js<boolean[]>(page, `["26,6", "16,15", "7,21"].map((k) => window.__elementsForTest.byCoord?.has ? window.__elementsForTest.byCoord.has(k) : true)`);
    check(drawn.every(Boolean), "each has its model on the board");
    const said: string[] = [];
    if (ONLY.has("start")) {
      await page.waitForTimeout(3000);
      said.push(await mayaText(page));
      let ring = await js<{ x: number; y: number }>(page, `(() => { const r = document.querySelector(".guide-ring").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await page.mouse.click(ring.x, ring.y);
      await page.waitForFunction(`window.__guideForTest.step() === "1b"`, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      said.push(await mayaText(page));
      await shot(page, "1-guided-start-dune", 800);
      await page.click('.build-popover .build-card[data-element="dune"]');
      await page.waitForFunction(`window.__guideForTest.step() === "2"`, null, { timeout: 60000 });
      check((await js<string>(page, `window.__panjimForTest.run.state.elements.get("-4,18")?.elementId ?? ""`)) === "dune", "the guided dune is built at -4,18, the tile in front of the school where a dune saves the most homes");
      await page.waitForTimeout(6000);
      said.push(await mayaText(page));
      ring = await js<{ x: number; y: number }>(page, `(() => { const r = document.querySelector(".guide-ring").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await page.mouse.click(ring.x, ring.y);
      await page.waitForFunction(`window.__guideForTest.step() === "2b"`, null, { timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.click('.build-popover .build-card[data-element="sandy_vegetation"]');
      await page.waitForFunction(`window.__guideForTest.step() === "3"`, null, { timeout: 60000 });
      check((await js<string>(page, `window.__panjimForTest.run.state.elements.get("-3,17")?.elementId ?? ""`)) === "sandy_vegetation", "the guided pandanus is the objective's first pick, -3,17");
      await page.waitForTimeout(5000);
      said.push(await mayaText(page));
      check(said.every((t) => t !== STANDING_LINE), "Maya never says the standing nature's line over the guided start");
      await page.locator(".maya-dismiss:visible").click();
      await page.waitForFunction(`window.__guideForTest.step() === "none"`, null, { timeout: 30000 });
      // Her own lines come back now. The standing nature's line was queued first; a build's fact may come before or after.
      let heard = "";
      for (let i = 0; i < 40 && heard !== STANDING_LINE; i++) {
        await page.waitForTimeout(500);
        heard = await mayaText(page);
        if (heard && heard !== STANDING_LINE && (await page.locator(".maya-dismiss:visible").count()) > 0) await page.locator(".maya-dismiss:visible").click();
      }
      check(heard === STANDING_LINE, `after the guided start hands over, Maya says: "${heard}"`);
      const bubble = await js<{ ok: boolean; w: number; h: number }>(page, `(() => { const r = document.querySelector(".maya-bubble").getBoundingClientRect(); return { ok: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, w: r.width, h: r.height }; })()`);
      check(bubble.ok, `her bubble is on screen (${Math.round(bubble.w)} x ${Math.round(bubble.h)})`);
      await shot(page, "2-maya-standing-line", 600);
      await page.locator(".maya-dismiss:visible").click().catch(() => {});
      // The three standing defenses, close up.
      for (const [q, r, name] of [[16, 15, "3a-standing-khazan-merces"], [26, 6, "3b-standing-khazan-merces-east"], [7, 21, "3c-standing-mangrove-taleigao"]] as const) {
        await page.keyboard.press("Escape");
        await js(page, `window.__focusTileForTest(${q}, ${r})`);
        await page.waitForTimeout(1800);
        await zoomIn(page);
        await shot(page, name, 1200);
        await zoomOut(page);
      }
      // A standing khazan's card: the game's normal remove action.
      await openTile(page, 16, 15);
      const card = await menu(page);
      check(card.remove === "Demolish (uses this year's build)", `a standing khazan's card offers the normal remove action ("${card.remove}")`);
      await shot(page, "3d-standing-khazan-card", 600);
      await page.keyboard.press("Escape");
    } else {
      await js(page, `window.__guideForTest.skip()`);
      await page.waitForTimeout(1500);
      await page.locator(".maya-dismiss:visible").click().catch(() => {});
    }

    if (ONLY.has("tiles")) {
      // A first sea tile beside Campal: Seawall and Breakwater.
      await openTile(page, 6, 8);
      const first = await menu(page);
      check(JSON.stringify(first.cards) === '["seawall","breakwater"]', `a first sea tile beside Campal (6,8) offers ${JSON.stringify(first.cards)}`);
      check(JSON.stringify(first.lines.seawall) === JSON.stringify(SEAWALL_LINES), `the seawall's card has its three lines (${JSON.stringify(first.lines.seawall)})`);
      check(first.lines.breakwater?.[0] === "Breaks cyclone waves just off the shore.", `the breakwater's card: "${first.lines.breakwater?.[0]}"`);
      check(first.onScreen, "the menu with the three line card is on screen");
      await shot(page, "4-first-sea-tile-campal", 800);
      // The sea beyond the first tile: neither.
      const deep = await js<{ q: number; r: number; far: boolean }>(
        page,
        `(() => { const s = window.__panjimForTest.run.state; let best = null; for (const t of s.placed.values()) { if (t.terrainId !== "coast" || t.scenery || s.isFirstSea(t.coord) || s.unbuildable.has(t.coord.q + "," + t.coord.r)) continue; const d = (Math.abs(t.coord.q - 6) + Math.abs(t.coord.r - 10) + Math.abs(t.coord.q + t.coord.r - 16)) / 2; if (!best || d < best.d) best = { q: t.coord.q, r: t.coord.r, d }; } return best; })()`
      );
      await openTile(page, deep.q, deep.r);
      const out = await menu(page);
      check(out.cards.length === 0 && out.note === "Nothing can be built out here.", `a sea tile beyond the first (${deep.q},${deep.r}) offers no card and says "${out.note}"`);
      await shot(page, "5-deep-sea-tile", 800);
      // Campal's water edge: no home on the four tiles; as shore land each takes a seawall.
      const edge = await js<string>(page, `(() => { const s = window.__panjimForTest.run.state; return [[6, 9], [8, 7], [4, 11], [3, 12]].map(([q, r]) => (s.elements.has(q + "," + r) ? "home" : "open") + ":" + s.buildableAt({ q, r }).map((d) => d.id).join("/")).join(" "); })()`);
      check(edge === "open:seawall open:seawall open:seawall open:seawall", `the four tiles on Campal's water edge hold no home and take a seawall (${edge})`);
      await openTile(page, 6, 9);
      const land = await menu(page);
      check(JSON.stringify(land.cards) === '["seawall"]', `the water edge tile 6,9 offers ${JSON.stringify(land.cards)}`);
      await shot(page, "6-campal-water-edge", 800);
      await page.keyboard.press("Escape");
      await js(page, `window.__focusTileForTest(5, 10)`);
      await page.waitForTimeout(1500);
      await zoomIn(page, 4);
      await shot(page, "6b-campal-water-edge-close", 1200);
    }
    stop();
    await page.context().close();
  }

  // ---- The best plan played through the game: the seawall on the water at Campal, the 2050 warning, the last card ----
  if (ONLY.has("storm")) {
    const plan = (JSON.parse(fs.readFileSync("docs/qa/section41/best_plan.json", "utf8")) as { goal2: { actions: { elementId: string; q: number; r: number }[] } }).goal2.actions;
    const { page, stop } = await open(browser, `${server.url}/?qa=1&tag=FestTesters&noname=1&noguide=1#/play/l01-first-rains`);
    await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
    await letsPlay(page);
    await page.waitForTimeout(2500);
    /** Hurries a storm on (as a click on the board does) until its result card is up. */
    const toCards = async (selector: string): Promise<void> => {
      for (let i = 0; i < 1200 && (await page.locator(selector).count()) === 0; i++) {
        await js(page, `document.dispatchEvent(new PointerEvent("pointerdown"))`);
        await page.waitForTimeout(250);
      }
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.waitForTimeout(2500);
    };
    const cardText = (): Promise<string> => js<string>(page, `document.querySelector(".result-cards:not([hidden])")?.textContent?.replace(/\\s+/g, " ").trim() ?? ""`);
    for (const [i, a] of plan.entries()) {
      const year = 2026 + i;
      const ok = await js<boolean>(page, `window.__panjimForTest.build({ q: ${a.q}, r: ${a.r} }, ${JSON.stringify(a.elementId)})`);
      if (!ok) check(false, `${year}: ${a.elementId} at ${a.q},${a.r} was refused`);
      if (i === 4 || i === 14) {
        await toCards(".result-cards:not([hidden]) .result-card-body");
        const text = await cardText();
        const want = i === 4 ? "8 of 8 homes saved" : "56 of 56 homes saved";
        check(text.includes(want), `${year}: the storm's card says "${want}"`);
        if (i === 4) await shot(page, "7-result-2030", 800);
        for (let n = 0; n < 8 && (await page.locator(".result-cards:not([hidden]) .result-next").count()) > 0; n++) {
          await page.locator(".result-cards:not([hidden]) .result-next").first().click();
          await page.waitForTimeout(1200);
        }
      }
      if (i < 24) await page.evaluate(`window.__panjimForTest.idle()`);
      await page.waitForTimeout(400);
      if (a.elementId === "seawall") {
        const at = await js<string>(page, `(() => { const s = window.__panjimForTest.run.state; return s.placed.get("${a.q},${a.r}").terrainId + ":" + (s.elements.get("${a.q},${a.r}")?.elementId ?? "none") + ":" + s.isFirstSea({ q: ${a.q}, r: ${a.r} }); })()`);
        check(at === "coast:seawall:true", `${year}: a seawall stands on the water at Campal, on the first sea tile ${a.q},${a.r} (${at})`);
        await page.locator(".maya-dismiss:visible").click().catch(() => {});
        await js(page, `window.__focusTileForTest(${a.q}, ${a.r})`);
        await page.waitForTimeout(1800);
        await zoomIn(page, 4);
        await shot(page, "8-seawall-on-the-water-campal", 1200);
        await zoomOut(page, 4);
      }
    }
    await toCards(".result-cards:not([hidden]) .last-card");
    const last = await cardText();
    check(last.includes("58 of 58 homes saved"), `2050: the last card says "58 of 58 homes saved"`);
    check(/9 of 9 stars/.test(last), "and 9 of 9 stars");
    await shot(page, "10-last-card", 1500);
    await page.locator(".result-cards:not([hidden]) .result-detail-link").first().click();
    await page.waitForTimeout(1200);
    const rows = await js<{ title: string; rows: string[] }>(page, `(() => { const c = document.querySelector(".result-cards:not([hidden])"); return { title: c.querySelector(".result-title")?.textContent ?? "", rows: [...c.querySelectorAll(".result-rows li")].map((li) => (li.dataset.defence ?? "") + ": " + li.textContent.replace(/\\s+/g, " ").trim()) }; })()`);
    check(rows.title === "What protected your homes" && rows.rows.some((r) => r.startsWith("seawall: ") && /[1-9]/.test(r)), `"What protected your homes" names the seawall (${rows.rows.join(" | ")})`);
    await shot(page, "11-what-protected-2050", 800);
    stop();
    await page.context().close();
  }

  // ---- Maya's warning two years before the 2050 storm, on a run that left homes at risk ----
  if (ONLY.has("warning")) {
    const { page, stop } = await open(browser, `${server.url}/?qa=1&tag=FestTesters&noname=1&noguide=1#/play/l01-first-rains`);
    await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
    await letsPlay(page);
    await page.waitForTimeout(2500);
    // Builds away from the storms through 2030 and 2040, then on until two years remain before 2050.
    for (const step of ["past-storm", "past-storm", "heat-2"]) check(await js<boolean>(page, `window.__panjimScenarioForTest(${JSON.stringify(step)})`), `the run plays on (${step})`);
    let warned = "";
    for (let n = 0; n < 80 && !warned.includes(CAMPAL_LINE); n++) {
      await page.waitForTimeout(500);
      warned = await mayaText(page);
    }
    check(warned.endsWith(CAMPAL_LINE) && warned.includes("The cyclone brings wind onto Campal."), `Maya's warning before the 2050 storm ends with the sea and the river at Campal ("${warned}")`);
    const bubble = await js<{ ok: boolean; w: number; h: number; clear: boolean }>(
      page,
      `(() => { const r = document.querySelector(".maya-bubble").getBoundingClientRect(); const c = document.querySelector(".panjim-clock").getBoundingClientRect(); return { ok: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, w: r.width, h: r.height, clear: r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom }; })()`
    );
    check(bubble.ok && bubble.clear, `her warning's bubble is on screen and clear of the HUD card (${Math.round(bubble.w)} x ${Math.round(bubble.h)}, ${warned.split(/\s+/).length} words)`);
    await shot(page, "9-maya-2050-warning", 600);
    stop();
    await page.context().close();
  }
} catch (e) {
  console.log(`FAIL ${String(e)}`);
  failures++;
} finally {
  await browser.close();
  server.stop();
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
check(posts.every((p) => p.includes("tag=FestTesters")), `every post carried the test tag (${posts.length ? posts.join(", ") : "none"})`);
console.log(`posts answered by the stub (none left the machine): ${posts.length ? posts.join(", ") : "none"}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
