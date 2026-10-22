/**
 * Section 28's targeted shots and checks (the default QA gate), at one size:
 *   - each storm's result card with "Try this storm again" beside its button;
 *   - the board right after "Try this storm again" on the 2040 flood (back in 2031, the state equal to the phase's
 *     start snapshot), then the flood's build years played again;
 *   - the final card ("Play again");
 *   - a reload mid run: the start popup with Begin only, the run at 2026, and the menu with Tutorial and Play Panjim;
 *   - the Tutorial's result card ("Try again"), which starts the Tutorial over.
 * Every localStorage key the page holds at the end is printed. Console errors must be 0.
 *
 * With FULL=1 (the full browser check): axe-core (no serious or critical violations) on the menu, the start popup,
 * a result card with the retry button, the board after a retry, the final card and the Tutorial's card; and
 * grayscale and deuteranopia copies of the 2040 result card (the key shot).
 *
 * Usage: [FULL=1] npx tsx tools/section28Shots.ts <width> <height> [outDir=docs/qa/section28]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { BOT_LEVEL, newRun } from "./panjimBots/bots";
import { axialKey } from "../src/core/hex";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section28"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });

// ---- the run, planned headless: each year the first build on a tile in the next storm's path ---------------------
const plan = newRun("section28-shots", BOT_LEVEL);
const actions: { q: number; r: number; elementId: string }[] = [];
while (!plan.finished) {
  const next = plan.nextChallenge();
  const reach = new Set(next ? plan.exposureFor(next, true)?.exposure.keys() ?? [] : []);
  const tiles = [...plan.state.placed.values()].filter((t) => plan.state.buildableAt(t.coord).length > 0);
  const tile = tiles.find((t) => reach.has(axialKey(t.coord))) ?? tiles[0];
  const elementId = plan.state.buildableAt(tile.coord)[0].id;
  if (!plan.build(tile.coord, elementId).ok) throw new Error("refused");
  actions.push({ q: tile.coord.q, r: tile.coord.r, elementId });
}
const expected = plan.schedule.map((c) => plan.outcomes.get(c.id)!);
console.log(`planned: ${expected.map((o) => `${o.stars} stars ${o.housesSaved}/${o.housesTotal}`).join(", ")}`);

// ---- the browser ---------------------------------------------------------------------------------------------------
const server = await startDevServer(Number(process.env.PORT ?? 5478));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};
const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
// A machine that played an older version: its saved run, stars and Field Guide must be gone on load.
await page.addInitScript(() => {
  try {
    if (sessionStorage.getItem("s28-seeded")) return;
    sessionStorage.setItem("s28-seeded", "1");
    localStorage.clear();
    localStorage.setItem("riptide-rising:panjim2050:v3:l01-first-rains", JSON.stringify({ snapshot: { version: 3, turn: 5 } }));
    localStorage.setItem("root-and-ruin:progress:v1", JSON.stringify({ levels: { "l00-tutorial": { completed: true, stars: 3 } }, achievements: ["x"] }));
    localStorage.setItem("riptide-rising:field-guide:v1", JSON.stringify(["kingfisher"]));
  } catch {
    /* blocked */
  }
});
const shot = (name: string) => page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
const FULL = process.env.FULL === "1";
async function axe(label: string): Promise<void> {
  if (!FULL) return;
  await page.addScriptTag({ path: path.join(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length + " " + v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", "));
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: no serious or critical violations${found.length ? `: ${found.join("; ")}` : ""}`);
}
const DEUTERANOPIA = "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0";
/** Grayscale and deuteranopia (Machado 2009) copies of what is on screen. */
async function copies(name: string): Promise<void> {
  if (!FULL) return;
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray-${W}x${H}.jpg`), type: "jpeg", quality: 80 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
  await page.evaluate(`(function () {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0"); svg.id = "qa-cvd-svg";
    svg.innerHTML = '<filter id="qa-cvd"><feColorMatrix type="matrix" values="${DEUTERANOPIA}"/></filter>';
    document.body.appendChild(svg); document.documentElement.style.filter = "url(#qa-cvd)";
  })()`);
  await page.screenshot({ path: path.join(OUT, `${name}-deut-${W}x${H}.jpg`), type: "jpeg", quality: 80 });
  await page.evaluate(`(function () { document.documentElement.style.filter = ""; var s = document.getElementById("qa-cvd-svg"); if (s) s.remove(); })()`);
}
const T = "window.__panjimForTest";

async function openLevel(id: string): Promise<void> {
  await page.goto(`${server.url}/#/play/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForFunction(`!!${T}`, undefined, { timeout: 180000 });
  await page.waitForTimeout(1500);
}
async function begin(): Promise<void> {
  await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
  await page.waitForTimeout(2500);
}
const cardsOpen = (): Promise<boolean> => page.locator(".result-cards:not([hidden])").isVisible().catch(() => false);
const ready = (): Promise<boolean> => page.evaluate(`!!${T} && !${T}.busy`) as Promise<boolean>;
const build = (a: { q: number; r: number; elementId: string }): Promise<boolean> => page.evaluate(`${T}.build({ q: ${a.q}, r: ${a.r} }, ${JSON.stringify(a.elementId)})`) as Promise<boolean>;

/**
 * Waits for the year to settle, going through any result cards. `onCard` sees each card 1 (the one with the retry
 * button) and may answer "retry" to press it; the final card ends the wait.
 */
async function settle(onCard: (text: string) => Promise<"retry" | "next">): Promise<"ready" | "retried" | "final"> {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    if (await cardsOpen()) {
      const card = (await page.evaluate(`(() => {
        const c = document.querySelector(".result-cards:not([hidden]) .result-card");
        return { retry: !!c.querySelector(".result-retry"), retryText: c.querySelector(".result-retry")?.textContent ?? "", next: c.querySelector(".result-next")?.textContent ?? "", final: !!c.querySelector(".result-stars-total"), text: (c.textContent || "").replace(/\\s+/g, " ").trim() };
      })()`)) as { retry: boolean; retryText: string; next: string; final: boolean; text: string };
      if (card.final) return "final";
      if (card.retry && (await onCard(`${card.retryText}|${card.next}|${card.text}`)) === "retry") {
        await page.locator(".result-cards:not([hidden]) .result-retry").click();
        await page.waitForTimeout(1500);
        while (!(await ready())) await page.waitForTimeout(300);
        return "retried";
      }
      await page.locator(".result-cards:not([hidden]) .result-next").click();
      await page.waitForTimeout(700);
      continue;
    }
    if (await ready()) return "ready";
    await page.waitForTimeout(400);
  }
  throw new Error("the year never settled");
}

await openLevel("l01-first-rains");
const keysAtStart = (await page.evaluate("Object.keys(localStorage)")) as string[];
check(!keysAtStart.some((k) => /panjim2050|progress:v1|field-guide|maya-notes/.test(k)), `the old saved run, stars and Field Guide are cleared on load (left: ${keysAtStart.join(", ") || "none"})`);
const ctas = (await page.evaluate(`[...document.querySelectorAll(".brief-cta")].map((b) => b.textContent.trim())`)) as string[];
check(ctas.length === 1 && ctas[0] === "Begin", `the start popup offers Begin only (${ctas.join(", ")})`);
await axe("the start popup");
await begin();

const cardsSeen: string[] = [];
let retried = false;
let snapshotMatch: string | null = null;
let i = 0;
const onCard = async (text: string): Promise<"retry" | "next"> => {
    const stormYear = /in (20\d\d)/.exec(text)?.[1] ?? "?";
    if (!cardsSeen.includes(stormYear)) {
      cardsSeen.push(stormYear);
      check(text.startsWith("Try this storm again|See what protected your city"), `${stormYear}: card 1 has "Try this storm again" beside "See what protected your city"`);
      await page.waitForTimeout(600);
      await shot(`result-card-${stormYear}`);
      if (stormYear === "2040") {
        await axe("a result card with Try this storm again");
        await copies("result-card-2040");
      }
    }
    if (stormYear === "2040" && !retried) {
      retried = true;
      return "retry";
    }
    return "next";
};
while (i < actions.length) {
  const result = await settle(onCard);
  if (result === "retried") {
    // Back at 2031, exactly as the phase began.
    const state = (await page.evaluate(`(() => {
      const run = ${T}.run;
      const flood = run.schedule[1];
      const saved = run.phaseSnapshots.get(flood.id).snapshot;
      return { year: run.year, landed: [...run.landed], equal: JSON.stringify(run.snapshot()) === JSON.stringify(saved), turn: saved.turn, outcomes: run.outcomes.size, clock: document.querySelector(".clock-year, .panjim-clock")?.textContent ?? "" };
    })()`)) as { year: number; landed: string[]; equal: boolean; turn: number; outcomes: number; clock: string };
    snapshotMatch = JSON.stringify(state);
    check(state.year === 2031 && state.equal && state.landed.length === 1 && state.outcomes === 1, `after "Try this storm again" on the 2040 flood: ${2026 + state.turn}, the run equals the phase's start snapshot (${snapshotMatch})`);
    await page.mouse.move(2, H - 2);
    await page.waitForTimeout(2500);
    await shot("board-after-retry-2040");
    await axe("the board after a retry");
    i = 5; // the flood's build years again: builds 6 to 15
    continue;
  }
  if (result === "final") break;
  const ok = await build(actions[i]);
  if (!ok) {
    check(false, `build ${i + 1} (${actions[i].elementId} at ${actions[i].q},${actions[i].r}) refused`);
    break;
  }
  i++;
  await page.waitForTimeout(300);
}
const end = await settle(onCard);
check(cardsSeen.join(",") === "2030,2040,2050", `a card 1 with the retry button for every storm (${cardsSeen.join(", ")})`);
check(end === "final", "the final card is shown");
const finalButtons = (await page.evaluate(`[...document.querySelectorAll(".result-cards:not([hidden]) button")].map((b) => b.textContent.trim())`)) as string[];
check(finalButtons.includes("Play again") && !finalButtons.includes("Try this storm again"), `the final card: ${finalButtons.join(", ")}`);
const outcomes = (await page.evaluate(`${T}.run.schedule.map((c) => { const o = ${T}.run.outcomes.get(c.id); return o.housesSaved + "/" + o.housesTotal; })`)) as string[];
check(outcomes.join(",") === expected.map((o) => `${o.housesSaved}/${o.housesTotal}`).join(","), `the replayed flood goes as planned: ${outcomes.join(", ")}`);
await page.waitForTimeout(800);
await shot("final-card");
await axe("the final card");
// "Play again": a new run from 2026.
await page.locator(".result-cards:not([hidden]) .result-next").click();
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!${T} && ${T}.run.turnNumber === 1`, undefined, { timeout: 180000 });
check((await page.evaluate(`${T}.run.year`)) === 2026, "Play again starts a new run in 2026");

// ---- a reload mid run ------------------------------------------------------------------------------------------------
await page.waitForTimeout(1500);
await begin();
for (const a of actions.slice(0, 3)) {
  await settle(async () => "next");
  await build(a);
  await page.waitForTimeout(300);
}
await settle(async () => "next");
check((await page.evaluate(`${T}.run.year`)) === 2029, "three builds in: 2029");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!${T}`, undefined, { timeout: 180000 });
await page.waitForTimeout(2500);
const ctasAfter = (await page.evaluate(`[...document.querySelectorAll(".brief-cta")].map((b) => b.textContent.trim())`)) as string[];
check(ctasAfter.length === 1 && ctasAfter[0] === "Begin", `after a reload the start popup offers Begin only (${ctasAfter.join(", ")})`);
check((await page.evaluate(`${T}.run.year`)) === 2026 && (await page.evaluate(`${T}.run.turnNumber`)) === 1, "after a reload Play Panjim is at 2026, the first build");
await shot("start-popup-after-reload");
await page.goto(`${server.url}/#/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".menu-actions", { timeout: 60000 });
const menu = (await page.evaluate(`[...document.querySelectorAll(".menu-actions button")].map((b) => b.textContent.trim())`)) as string[];
check(menu.length === 2 && /Tutorial/.test(menu[0]) && /Play Panjim/.test(menu[1]), `after a reload the menu: ${menu.join(" | ")}`);
await axe("the menu");
await page.locator(".menu-actions button", { hasText: "Play Panjim" }).click();
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!${T}`, undefined, { timeout: 180000 });
check((await page.evaluate(`${T}.run.year`)) === 2026 && (await page.evaluate(`${T}.run.turnNumber`)) === 1, "Play Panjim from the menu starts at 2026, the first build");

// ---- the Tutorial's "Try again" -----------------------------------------------------------------------------------
await openLevel("l00-tutorial");
await begin();
let tutorialCard = "";
for (let n = 0; n < 3; n++) {
  await settle(async () => "next").catch(() => "ready");
  const spot = (await page.evaluate(`(() => { const s = ${T}.host.state; for (const t of s.placed.values()) { const o = s.buildableAt(t.coord); if (o.length) return { q: t.coord.q, r: t.coord.r, elementId: o[0].id }; } return null; })()`)) as { q: number; r: number; elementId: string } | null;
  if (spot) await build(spot);
  await page.waitForTimeout(400);
}
for (let k = 0; k < 600 && !(await cardsOpen()); k++) await page.waitForTimeout(500);
tutorialCard = (await page.evaluate(`[...document.querySelectorAll(".result-cards:not([hidden]) button")].map((b) => b.textContent.trim()).join(" | ")`)) as string;
check(/Try again/.test(tutorialCard) && /Play Panjim/.test(tutorialCard), `the Tutorial's card: ${tutorialCard}`);
await page.waitForTimeout(600);
await shot("tutorial-card");
await axe("the Tutorial's result card");
await page.locator(".result-cards:not([hidden]) .result-retry").click();
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!${T} && ${T}.tutorial && ${T}.run.turnNumber === 1 && ${T}.run.landed.size === 0`, undefined, { timeout: 180000 });
check(true, "Try again starts the Tutorial over: its start popup, the first build, no storm landed");
await page.waitForTimeout(1200);
await begin();
check((await page.evaluate(`${T}.run.year`)) === 2026, "the Tutorial plays again from 2026");

const keysAtEnd = (await page.evaluate("Object.keys(localStorage).sort()")) as string[];
console.log(`localStorage at the end: ${keysAtEnd.join(", ") || "(none)"}`);
check(!keysAtEnd.some((k) => /panjim2050|progress|field-guide|maya-notes/.test(k)), "no key about progress was written");
check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
await server.stop();
process.exit(failed > 0 ? 1 : 0);
