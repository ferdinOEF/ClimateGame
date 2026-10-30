/**
 * Section 1d: one guide. Maya says every fact the Discovery card used to show.
 *
 * Usage:  npx tsx tools/section1dChecks.ts [outDir]   (outDir defaults to docs/qa/section1d)
 *
 * On Panaji at 1920x1080 (software GL), with her lines held until dismissed:
 *   - one of each of the ten nugget-eligible elements is built; Maya says one of
 *     that element's facts, in her tip state (worried for the resort, sand
 *     mining and the yacht), once, with "N of 21", a Source button on a cited
 *     fact and a "Game rule" tag on a rule; no card, no eyebrow label;
 *   - a fact and a hazard warning arriving together: the warning first;
 *   - Esc and "Got it" dismiss, with and without reduced motion; the Source is
 *     reached with the keyboard and opens the Sources screen;
 *   - the Field Guide shows her count and the fact as a note;
 *   - axe-core finds nothing serious or critical with a discovery up;
 *   - the Tutorial loads (it has no Maya, so no card and no line);
 *   - zero console errors.
 * Then, at 1366x768, 1920x1080 and 2560x1440, a discovery line on screen
 * (screenshots, with a -gray copy), her text at 12 px or more.
 * Exits 1 if any check fails.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { discoveryFacts, displayText } from "../src/core/facts";
import nuggets from "../src/data/nuggets.json";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section1d");
const PORT = Number(process.env.CHECK_PORT ?? 5298);
const CAUTION = new Set(["beachside_resort", "sand_mining", "yacht"]);

let failed = 0;
const lines: string[] = [];
function check(ok: boolean, what: string): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${what}`;
  lines.push(line);
  console.log(line);
}

const errors: string[] = [];

async function openPanaji(browser: Browser, url: string, size: [number, number], reducedMotion = false): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${size.join("x")}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${size.join("x")}: ${m.text()}`);
  });
  await page.goto(`${url}/?coinboost=20000&qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(2500);
  // Her lines stay until dismissed, and whatever she opened with is cleared.
  await page.evaluate("window.__panjimForTest.maya.holdLines = true; window.__panjimForTest.maya.withdraw(() => true); window.__panjimForTest.maya.dismiss()");
  return page;
}

/** What the bubble shows now. */
async function bubble(page: Page): Promise<{ text: string; count: string; source: boolean; rule: boolean; state: string } | null> {
  return page.evaluate(`(() => {
    var b = document.querySelector(".maya-bubble");
    if (!b || b.hidden) return null;
    function vis(sel) {
      var el = document.querySelector(sel);
      return Boolean(el) && !el.hidden && el.getClientRects().length > 0;
    }
    var root = document.querySelector(".maya");
    var state = "";
    root.classList.forEach(function (c) { if (c.indexOf("state-") === 0) state = c; });
    return {
      text: document.querySelector(".maya-text").textContent || "",
      count: vis(".maya-count") ? document.querySelector(".maya-count").textContent || "" : "",
      source: vis(".maya-source"),
      rule: vis(".maya-rule"),
      state: state
    };
  })()`) as Promise<{ text: string; count: string; source: boolean; rule: boolean; state: string } | null>;
}

async function waitForBubble(page: Page, ms = 60000): Promise<NonNullable<Awaited<ReturnType<typeof bubble>>>> {
  const start = Date.now();
  for (;;) {
    const b = await bubble(page);
    if (b) return b;
    if (Date.now() - start > ms) throw new Error("Maya never spoke");
    await page.waitForTimeout(250);
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    // ---- One of each element --------------------------------------------------
    const page = await openPanaji(browser, server.url, [1920, 1080]);
    const said = new Set<string>();
    for (const element of Object.keys(nuggets as Record<string, string[]>)) {
      const built = await page.evaluate(`(async () => {
        const p = window.__panjimForTest;
        const tile = p.firstBuildable(${JSON.stringify(element)}, undefined);
        if (!tile) return "no tile";
        // Exactly what the build menu's callback does on a successful build.
        if (!p.build(tile, ${JSON.stringify(element)})) return "build refused";
        window.__nuggetPopupForTest.show(${JSON.stringify(element)});
        await p.idle();
        return "ok";
      })()`);
      if (built !== "ok") {
        check(false, `${element}: built (${built})`);
        continue;
      }
      let b: Awaited<ReturnType<typeof bubble>>;
      try {
        b = await waitForBubble(page);
      } catch {
        check(false, `${element}: Maya says a fact after the build`);
        continue;
      }
      const facts = discoveryFacts(element);
      const fact = facts.find((f) => displayText(f) === b!.text);
      check(Boolean(fact), `${element}: Maya says one of its facts ("${b.text.slice(0, 60)}${b.text.length > 60 ? "..." : ""}")`);
      if (!fact) {
        await page.evaluate("window.__panjimForTest.maya.dismiss()");
        continue;
      }
      check(b.state === (CAUTION.has(element) ? "state-worried" : "state-tip"), `${element}: state ${b.state}`);
      check(!said.has(fact.id), `${element}: ${fact.id} not said before`);
      said.add(fact.id);
      check(/^\d+ of 21$/.test(b.count), `${element}: count "${b.count}"`);
      check(b.source === (fact.kind === "fact"), `${element}: Source button ${b.source ? "shown" : "hidden"} (${fact.kind})`);
      check(b.rule === (fact.kind === "gameRule"), `${element}: "Game rule" tag ${b.rule ? "shown" : "hidden"} (${fact.kind})`);
      const leftovers = await page.evaluate(`document.querySelectorAll(".nugget-badge, .nugget-badge-eyebrow").length + (/new\\s+discovery/i.test(document.body.innerText) ? 1 : 0)`);
      check(leftovers === 0, `${element}: no card, no eyebrow label`);
      if (element === "mangrove") await page.screenshot({ path: path.join(OUT, "built-mangrove-1920x1080.jpg"), type: "jpeg", quality: 85 });
      await page.evaluate("window.__panjimForTest.maya.dismiss()");
      await page.waitForTimeout(200);
    }
    check(said.size === 10, `ten elements, ten different facts said (${said.size})`);

    // ---- A fact and a warning together ------------------------------------------
    await page.evaluate("window.__panjimForTest.maya.dismiss(); window.__panjimForTest.maya.withdraw(() => true)");
    // She says at most one line a quarter: let a quarter pass (one more build) so both are free to be said.
    await page.evaluate(`(async () => { const p = window.__panjimForTest; p.build(p.firstBuildable("sandy_vegetation", undefined), "sandy_vegetation"); await p.idle(); })()`);
    await page.evaluate(`(() => {
      const maya = window.__panjimForTest.maya;
      window.__nuggetPopupForTest.show("seawall", "seawall-fails");
      maya.say({ id: "check-warning", text: "Taleigao is exposed! Strengthen it before the storm.", state: "warning", urgent: true });
    })()`);
    const first = await waitForBubble(page);
    check(/exposed/.test(first.text), `warning first ("${first.text.slice(0, 40)}...")`);
    await page.evaluate("window.__panjimForTest.maya.dismiss()");
    // The fact waits for the next quarter (one line a quarter), behind nothing else.
    check((await page.evaluate("window.__panjimForTest.maya.peek() && window.__panjimForTest.maya.peek().id")) === "seawall-fails", "the fact is next in her queue, ahead of any ordinary tip");
    await page.evaluate(`(async () => { const p = window.__panjimForTest; p.build(p.firstBuildable("sandy_vegetation", undefined), "sandy_vegetation"); await p.idle(); })()`);
    const second = await waitForBubble(page);
    check(/seawall pushed past its limit/.test(second.text), `then the fact ("${second.text.slice(0, 40)}...")`);
    await page.evaluate("window.__panjimForTest.maya.dismiss()");

    // ---- Keyboard: Source reachable, opens the Sources screen; Esc and Got it dismiss ---
    await page.evaluate(`window.__nuggetPopupForTest.replay("mangrove-waves")`);
    await waitForBubble(page);
    await page.locator(".maya-minimise").focus();
    await page.keyboard.press("Tab");
    check(await page.evaluate(`document.activeElement && document.activeElement.classList.contains("maya-source")`), "Tab from her minimise button reaches Source");
    await page.keyboard.press("Tab");
    check(await page.evaluate(`document.activeElement && document.activeElement.classList.contains("maya-dismiss")`), "the next Tab reaches Got it");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".sources-item.highlight");
    check((await bubble(page)) === null, "opening the Source puts her line away");
    await page.screenshot({ path: path.join(OUT, "source-from-maya-1920x1080.jpg"), type: "jpeg", quality: 85 });
    await page.keyboard.press("Escape");
    check((await page.locator(".sources-backdrop").count()) === 0, "Esc closes the Sources screen");
    await page.evaluate(`window.__nuggetPopupForTest.replay("pandanus-cheap")`);
    await waitForBubble(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    check((await bubble(page)) === null, "Esc dismisses her line");
    await page.evaluate(`window.__nuggetPopupForTest.replay("seawall-holds")`);
    await waitForBubble(page);
    await page.locator(".maya-dismiss").click();
    check((await bubble(page)) === null, "Got it dismisses her line");

    // ---- Her bubble holds while the pointer or focus is in it (so Source can be reached) ---
    // (holdLines is off for this one: the timer is real.)
    await page.evaluate("window.__panjimForTest.maya.holdLines = false");
    await page.evaluate(`window.__nuggetPopupForTest.replay("mangrove-waves")`);
    await waitForBubble(page);
    await page.locator(".maya-source").focus();
    const held = await page.evaluate(`new Promise((resolve) => setTimeout(() => resolve(!document.querySelector(".maya-bubble").hidden), 9000))`);
    check(held === true, "with focus on Source, the line waits past its reading time");
    await page.evaluate("window.__panjimForTest.maya.holdLines = true; window.__panjimForTest.maya.dismiss()");

    // ---- The Field Guide: the count and the note ----------------------------------
    await page.locator(".field-guide-button").click();
    const tally = await page.locator(".field-guide-discoveries-count").textContent();
    check(/^\d+ of 21$/.test(tally ?? ""), `the Field Guide shows her count ("${tally}")`);
    const noteTexts = await page.locator(".field-guide-note p").allTextContents();
    check(noteTexts.some((t) => /mangroves cut wave height by 13% to 66%/.test(t)), "the Field Guide keeps the fact as a note");
    await page.screenshot({ path: path.join(OUT, "field-guide-1920x1080.jpg"), type: "jpeg", quality: 85 });
    await page.locator(".field-guide-close").click();

    // ---- axe, with a cited fact up ----------------------------------------------------
    await page.evaluate(`window.__nuggetPopupForTest.replay("mangrove-waves")`);
    await waitForBubble(page);
    await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
    const axeResult = await page.evaluate<string[]>(`(async () => {
      const r = await axe.run(document.querySelector(".maya"), { resultTypes: ["violations"] });
      return r.violations.map((v) => v.id + " (" + v.impact + ") x" + v.nodes.length);
    })()`);
    check(axeResult.length === 0, `axe-core on Maya with a cited fact up: ${axeResult.length ? axeResult.join(", ") : "no violations"}`);
    await page.evaluate(`window.__nuggetPopupForTest.replay("khazan-holds-floodwater")`);
    await waitForBubble(page);
    const axeRule = await page.evaluate<string[]>(`(async () => {
      const r = await axe.run(document.querySelector(".maya"), { resultTypes: ["violations"] });
      return r.violations.map((v) => v.id + " (" + v.impact + ") x" + v.nodes.length);
    })()`);
    check(axeRule.length === 0, `axe-core on Maya with a game rule up: ${axeRule.length ? axeRule.join(", ") : "no violations"}`);
    await page.context().close();

    // ---- Reduced motion: the same dismissals ---------------------------------------------
    const calm = await openPanaji(browser, server.url, [1920, 1080], true);
    await calm.evaluate(`window.__nuggetPopupForTest.replay("dunes-barrier")`);
    check(Boolean(await waitForBubble(calm)), "reduced motion: she says a fact");
    await calm.keyboard.press("Escape");
    await calm.waitForTimeout(200);
    check((await bubble(calm)) === null, "reduced motion: Esc dismisses");
    await calm.evaluate(`window.__nuggetPopupForTest.replay("dunes-barrier")`);
    await waitForBubble(calm);
    await calm.locator(".maya-dismiss").click();
    check((await bubble(calm)) === null, "reduced motion: Got it dismisses");
    await calm.context().close();

    // ---- The Tutorial loads, with no card and no line ----------------------------------------
    const tut = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    tut.on("pageerror", (e) => errors.push(`tutorial: ${e.message}`));
    tut.on("console", (m) => {
      if (m.type() === "error") errors.push(`tutorial: ${m.text()}`);
    });
    await tut.goto(`${server.url}/?qa=1&noname=1#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
    await tut.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
    await tut.locator(".brief-cta").first().click();
    await tut.waitForTimeout(2500);
    check((await tut.locator(".tutorial-coach").count()) === 1, "the Tutorial loads with its coach");
    check((await tut.locator(".nugget-badge").count()) === 0 && (await tut.locator(".maya-bubble").count()) === 0, "the Tutorial has no discovery card and no Maya bubble");
    await tut.context().close();

    // ---- Screenshots: a discovery line at each size -----------------------------------------------
    for (const size of [[1366, 768], [1920, 1080], [2560, 1440]] as [number, number][]) {
      const tag = size.join("x");
      const shot = await openPanaji(browser, server.url, size);
      for (const [name, fact] of [["fact", "khazan-what"], ["rule", "seawall-fails"]] as const) {
        await shot.evaluate(`window.__nuggetPopupForTest.replay(${JSON.stringify(fact)})`);
        await waitForBubble(shot);
        await shot.waitForTimeout(1800);
        const fonts = await shot.evaluate(`(() => {
          const px = (sel) => { const el = document.querySelector(sel); return el && !el.hidden && el.getClientRects().length ? parseFloat(getComputedStyle(el).fontSize) : null; };
          return { text: px(".maya-text"), count: px(".maya-count"), source: px(".maya-source"), rule: px(".maya-rule"), dismiss: px(".maya-dismiss"), name: px(".maya-name") };
        })()`) as Record<string, number | null>;
        const small = Object.entries(fonts).filter(([key, v]) => v !== null && v < (key === "name" ? 10 : 12));
        check(small.length === 0, `${tag} ${name}: text sizes ${JSON.stringify(fonts)}`);
        await shot.screenshot({ path: path.join(OUT, `discovery-${name}-${tag}.jpg`), type: "jpeg", quality: 85 });
        await shot.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
        await shot.screenshot({ path: path.join(OUT, `discovery-${name}-${tag}-gray.jpg`), type: "jpeg", quality: 70 });
        await shot.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
        await shot.evaluate("window.__panjimForTest.maya.dismiss()");
      }
      await shot.context().close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  fs.writeFileSync(path.join(OUT, "checks.txt"), `${lines.join("\n")}\n`);
  console.log(failed === 0 ? "\nAll checks pass." : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
