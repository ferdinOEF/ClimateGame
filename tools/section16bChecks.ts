/**
 * Section 16 part B: the HUD and the flow, in a browser. Screenshots of every
 * state the spec lists, at one window size, and the checks that need a page:
 *
 *   - play shows at most five HUD groups plus the OpenStreetMap credit
 *     (top bar; ? and ☰; Maya; the objective card; the credit), and nothing
 *     else, after the first build (before it, the hint as well);
 *   - no two HUD groups overlap (also at 125% and 150% browser zoom);
 *   - during a storm the objective card, Maya's bubble and the hint are gone,
 *     and the top bar says "Homes lost N";
 *   - Esc closes Help; "Leave Panjim?" never opens over another layer;
 *   - "Play again" lands on the game view with the start popup.
 *
 * Usage: npx tsx tools/section16bChecks.ts <width> <height> [outDir] [--zoom] [--final]
 *   --zoom   only the 125% / 150% zoom overlap check (at 1366x768)
 *   --final  also play the whole run for the final card and Play again (slow)
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [w = "1366", h = "768", outDir = "docs/qa/section16b"] = args.filter((a) => !a.startsWith("--"));
const W = Number(w);
const H = Number(h);
fs.mkdirSync(outDir, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5390));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(width: number, height: number, route: string, scale = 1): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${server.url}/${route}`, { waitUntil: "domcontentloaded" });
  return page;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${outDir}/${name}-${W}x${H}.jpg`, type: "jpeg", quality: 82 });
}

async function begin(page: Page): Promise<void> {
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForFunction(`!document.getElementById("boot-splash")`, undefined, { timeout: 120000 }).catch(() => undefined);
  await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 120000 });
  await wait(1200);
  await page.locator(".brief-cta").first().click();
  await wait(3000);
}

const scenario = (page: Page, name: string) => page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(name)})`, undefined);

/**
 * The visible top-level HUD elements, each put in its group. Board overlays
 * (place names, pins, the build float) are the map's, not the HUD's.
 */
async function hudGroups(page: Page): Promise<{ group: string; cls: string; box: { x: number; y: number; w: number; h: number } }[]> {
  return (await page.evaluate(`(() => {
    const out = [];
    const seen = new Set();
    const canvas = document.querySelector("canvas");
    const board = ".map-labels, .map-label, .map-pins, .map-pin, .map-note, .build-floats, .build-float, .cone-label, .forecast-label, .hud-tooltip";
    const groups = [
      ["top bar", ".panjim-clock"],
      ["? and menu", ".hud-chrome, .hud-corner.top-right, .hud-panel-settings"],
      ["Maya", ".maya, .maya-figure-wrap, .maya-bubble"],
      ["objective", ".objectives-panel"],
      ["credit", ".map-corner"],
      ["hint", ".empty-prompt"]
    ];
    for (const el of document.querySelectorAll("body *")) {
      if (el === canvas || el.closest("canvas")) continue;
      const s = getComputedStyle(el);
      if (s.position !== "fixed" && s.position !== "absolute") continue;
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      if (r.width >= innerWidth - 2 && r.height >= innerHeight - 2) continue;
      let p = el.parentElement, inner = false;
      while (p) { if (seen.has(p)) { inner = true; break; } p = p.parentElement; }
      if (inner) continue;
      seen.add(el);
      if (el.matches(board) || el.closest(board)) continue;
      const hit = groups.find(([, sel]) => el.matches(sel) || el.closest(sel));
      const cls = typeof el.className === "string" ? el.className : el.tagName;
      out.push({ group: hit ? hit[0] : "other: " + cls, cls, box: { x: r.left, y: r.top, w: r.width, h: r.height } });
    }
    return out;
  })()`)) as { group: string; cls: string; box: { x: number; y: number; w: number; h: number } }[];
}

/** Pairs of different HUD groups whose boxes overlap (1 px of slack). */
function overlaps(items: { group: string; box: { x: number; y: number; w: number; h: number } }[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.group === b.group) continue;
      const x = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
      const y = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
      if (x > 1 && y > 1) out.push(`${a.group} x ${b.group} (${Math.round(x)}x${Math.round(y)})`);
    }
  }
  return out;
}

async function buildOnce(page: Page): Promise<void> {
  await scenario(page, "pass-year");
  await wait(1500);
}

const layersOpen = (page: Page) =>
  page.evaluate(`({ help: !document.querySelector(".help-backdrop").hidden, leave: !document.querySelector(".leave-confirm-backdrop").hidden, menu: !document.querySelector(".hud-panel-settings .hud-panel-body").hidden })`) as Promise<{ help: boolean; leave: boolean; menu: boolean }>;

if (flags.has("--zoom")) {
  // Browser zoom at 1366x768: the CSS viewport shrinks by the zoom, the device pixels grow by it.
  for (const zoom of [1, 1.25, 1.5]) {
    const page = await open(Math.round(1366 / zoom), Math.round(768 / zoom), "#/play/l01-first-rains", zoom);
    await begin(page);
    await buildOnce(page);
    const items = await hudGroups(page);
    const bad = overlaps(items);
    check(bad.length === 0, `1366x768 at ${Math.round(zoom * 100)}%: no HUD groups overlap${bad.length ? `: ${bad.join("; ")}` : ""}`);
    await page.screenshot({ path: `${outDir}/zoom-${Math.round(zoom * 100)}-1366x768.jpg`, type: "jpeg", quality: 82 });
    await page.close();
  }
} else {
  // ---- The landing page, Play Panjim, the start popup, the first frame -----
  const page = await open(W, H, "#/");
  await page.waitForSelector("text=Play Panjim", { timeout: 120000 });
  await page.waitForFunction(`!document.getElementById("boot-splash")`, undefined, { timeout: 120000 }).catch(() => undefined);
  await wait(800);
  await shot(page, "01-landing");
  const menuButtons = (await page.evaluate(`Array.from(document.querySelectorAll("button")).filter((b) => b.offsetParent).map((b) => b.textContent.trim())`)) as string[];
  check(menuButtons.includes("Tutorial") && menuButtons.includes("Play Panjim"), `the menu offers Tutorial and Play Panjim (${menuButtons.join(", ")})`);
  await page.getByText("Play Panjim", { exact: true }).click();
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await wait(1500);
  check(/#\/play\//.test(page.url()), `Play Panjim goes straight to the game view (${page.url().replace(server.url, "")})`);
  await shot(page, "02-start-popup");
  const popup = (await page.evaluate(`(() => { const c = document.querySelector(".brief-card").getBoundingClientRect(); return { top: c.top, bottom: c.bottom, mayas: document.querySelectorAll(".brief-card .maya, .brief-card [class*=maya]").length, osm: /OpenStreetMap/.test(document.querySelector(".brief-card").innerText), goal: document.querySelector(".brief-goal-line")?.textContent ?? "" }; })()`)) as { top: number; bottom: number; mayas: number; osm: boolean; goal: string };
  check(popup.top >= 0 && popup.bottom <= H, `the start popup fits the window (${Math.round(popup.top)} to ${Math.round(popup.bottom)} of ${H})`);
  check(!popup.osm, "the start popup has no OpenStreetMap box");
  check(popup.goal === "Save as many homes as you can from three storms.", `the start popup's goal line: "${popup.goal}"`);
  await page.locator(".brief-cta").first().click();
  await wait(3500);
  await shot(page, "03-first-frame");
  const before = await hudGroups(page);
  const beforeGroups = [...new Set(before.map((i) => i.group))];
  check(beforeGroups.every((g) => !g.startsWith("other")), `before the first build: only HUD groups (${beforeGroups.join(", ")})`);

  // ---- The build menu -------------------------------------------------------
  await page.evaluate(`(() => { const t = window.__panjimForTest.run.prep[0].tiles[0].split(",").map(Number); return window.__openTileForTest(t[0], t[1]); })()`);
  await wait(900);
  await shot(page, "04-build-menu");
  const notHere = (await page.evaluate(`document.querySelectorAll(".build-card-elsewhere").length`)) as number;
  check(notHere <= 1 && (await page.evaluate(`document.querySelectorAll(".build-card-not-here").length`)) === 0, "the build menu's Not here options are one line");
  await page.keyboard.press("Escape");
  await wait(400);

  // ---- ☰ and Help, and Esc --------------------------------------------------
  await page.locator(".hud-panel-settings .hud-panel-button").click();
  await wait(500);
  await shot(page, "05-menu");
  const menuText = (await page.evaluate(`document.querySelector(".hud-panel-settings .hud-panel-body").innerText`)) as string;
  for (const item of ["Field Guide", "Street map", "Show risk", "Sound", "Maya", "Calm motion", "Quality", "Start again", "Leave Panjim"]) check(menuText.includes(item), `☰ holds ${item}`);
  await page.keyboard.press("Escape");
  await wait(300);
  check(!(await layersOpen(page)).menu, "Esc closes ☰");
  await page.locator(".help-button").click();
  await wait(600);
  await shot(page, "06-help");
  await page.keyboard.press("Escape");
  await wait(300);
  let layers = await layersOpen(page);
  check(!layers.help && !layers.leave, "Esc closes Help, and only Help (no Leave prompt on top)");
  // Help, then ☰ over it is not possible (the press outside closes ☰): Help is the only layer; Esc twice from a clean board asks to leave once.
  await page.locator("canvas").first().click({ position: { x: 5, y: H / 2 } }).catch(() => undefined);
  await page.keyboard.press("Escape");
  await wait(300);
  layers = await layersOpen(page);
  check(layers.leave, "with nothing open, Esc asks Leave Panjim?");
  const leaveLine = (await page.evaluate(`document.querySelector(".leave-confirm-text").textContent`)) as string;
  check(leaveLine === "You haven't built anything yet.", `the leave line before any build: "${leaveLine}"`);
  await page.keyboard.press("Escape");
  await wait(300);

  // ---- The first build, then the HUD in play --------------------------------
  await buildOnce(page);
  const after = await hudGroups(page);
  const afterGroups = [...new Set(after.map((i) => i.group))];
  const counted = afterGroups.filter((g) => g !== "credit");
  check(afterGroups.every((g) => !g.startsWith("other")) && counted.length <= 5 && !afterGroups.includes("hint"), `in play: at most 5 HUD groups plus the credit (${afterGroups.join(", ")})`);
  const bad = overlaps(after);
  check(bad.length === 0, `in play: no HUD groups overlap${bad.length ? `: ${bad.join("; ")}` : ""}`);
  await page.keyboard.press("Escape");
  await wait(300);
  const savedLine = (await page.evaluate(`document.querySelector(".leave-confirm-text").textContent`)) as string;
  check(/^Your run is saved\. You can continue from 20\d\d\.$/.test(savedLine), `the leave line after a build: "${savedLine}"`);
  await page.keyboard.press("Escape");
  await wait(300);

  // ---- A heat year ----------------------------------------------------------
  await scenario(page, "forecast");
  await wait(1500);
  await shot(page, "07-heat-year");

  // ---- The storm ------------------------------------------------------------
  void scenario(page, "stage");
  await page.waitForFunction(`!!document.querySelector(".storm-playing")`, undefined, { timeout: 120000 }).catch(() => undefined);
  await wait(2500);
  await shot(page, "08-storm");
  const storm = (await page.evaluate(`(() => {
    const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05 && r.width > 0; };
    return { objective: vis(".objectives-panel"), bubble: vis(".maya-bubble"), hint: vis(".empty-prompt"), risk: document.querySelector(".outlook-risk")?.textContent ?? "" };
  })()`)) as { objective: boolean; bubble: boolean; hint: boolean; risk: string };
  check(!storm.objective && !storm.bubble && !storm.hint, `during the storm: no objective card, Maya bubble or hint (${JSON.stringify(storm)})`);
  check(/Homes lost/.test(storm.risk), `during the storm the top bar says Homes lost (${storm.risk.trim()})`);

  // ---- The result cards and the 2031 flood cone ------------------------------
  while (!(await page.evaluate(`!!document.querySelector(".result-cards:not([hidden])")`))) {
    await page.evaluate(`document.dispatchEvent(new PointerEvent("pointerdown"))`);
    await wait(300);
  }
  await wait(2000);
  await shot(page, "09-result-1");
  const places = (await page.evaluate(`document.querySelectorAll(".result-places li:not(.result-places-more)").length`)) as number;
  check(places <= 4, `result card 1 lists at most 4 places (${places})`);
  await page.locator(".result-next").click();
  await wait(900);
  await shot(page, "10-result-2");
  await page.locator(".result-next").click();
  await wait(1200);
  await shot(page, "11-coming-up");
  const coming = (await page.evaluate(`({ title: document.querySelector(".result-title")?.textContent ?? "", lines: document.querySelectorAll(".result-card .cone-preview-line").length, labels: document.querySelectorAll(".result-card .cone-preview-place").length })`)) as { title: string; lines: number; labels: number };
  check(/^Monsoon flood · 2040 · in \d+ years?$/.test(coming.title) && coming.lines === 0, `the coming-up card has one heading: "${coming.title}"`);
  check(coming.labels <= 3, `the coming-up map names at most 3 places (${coming.labels})`);
  const held = (await page.evaluate(`!!document.querySelector(".storm-hold")`)) as boolean;
  check(held, "the HUD stays on the storm until On to 2031");
  await page.locator(".result-next").click();
  await wait(2500);
  await shot(page, "12-flood-cone");
  await page.close();
}

if (flags.has("--final")) {
  const page = await open(W, H, "#/play/l01-first-rains");
  await begin(page);
  await scenario(page, "finale");
  await wait(2000);
  await shot(page, "13-final-card");
  const link = (await page.evaluate(`document.querySelector(".result-link")?.textContent ?? ""`)) as string;
  check(link === "Back to the menu", `the final card's quieter link: "${link}"`);
  await page.locator(".result-next").click();
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await wait(2000);
  check(/#\/play\//.test(page.url()), `Play again lands on the game view (${page.url().replace(server.url, "")})`);
  check((await page.evaluate(`!!document.querySelector(".brief-backdrop:not([hidden])")`)) as boolean, "Play again shows the start popup");
  await shot(page, "14-after-play-again");
  await page.close();
}

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${W}x${H}${flags.size ? " " + [...flags].join(" ") : ""})`);
await browser.close();
server.stop();
process.exit(failures === 0 ? 0 : 1);
