/**
 * Section 26's targeted shots (the default QA gate), at one size:
 *   - a cracked seawall with its tooltip: a seawall built in 2027 is 10 years old in 2037 and cracked;
 *   - a broken breakwater: one built in 2026 breaks with age in 2036 and stays on the board, drawn broken;
 *   - the 2030 result card with the homes the wind alone took (a dune in front of the school, no pandanus);
 *   - the final card with the end-of-2050 biodiversity.
 * The run is planned headless on the game's own rules (every build legal), then played in the browser through the
 * player's own build path (`window.__panjimForTest.build`). Checks the cards against the headless run, the cracked
 * and broken defences in the game state, and console errors (0).
 *
 * Usage: npx tsx tools/section26Shots.ts <width> <height> [outDir=docs/qa/section26]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";
import { BOT_LEVEL, newRun } from "./panjimBots/bots";
import { axialKey, neighbors } from "../src/core/hex";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section26"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });

// ---- the run, planned headless ----------------------------------------------------------------------------------
const plan = newRun("section26-shots", BOT_LEVEL);
const near = new Set<string>();
for (const c of plan.schedule) for (const k of plan.exposureFor(c, true)?.exposure.keys() ?? []) {
  const [q, r] = k.split(",").map(Number);
  near.add(k);
  for (const n of neighbors({ q, r })) for (const m of neighbors(n)) near.add(axialKey(m));
}
const actions: { q: number; r: number; elementId: string }[] = [];
const build = (q: number, r: number, elementId: string): void => {
  if (!plan.build({ q, r }, elementId).ok) throw new Error(`refused ${elementId} at ${q},${r}`);
  actions.push({ q, r, elementId });
};
const far = (id: string) => [...plan.state.placed.values()].find((t) => !near.has(axialKey(t.coord)) && plan.state.canBuild(t.coord, id))!;
const bw = far("breakwater");
build(bw.coord.q, bw.coord.r, "breakwater");
const sw = far("seawall");
build(sw.coord.q, sw.coord.r, "seawall");
// A dune in front of Sharada Mandir School holds the 2030 water, so the card shows the homes the wind alone takes.
build(-4, 18, "dune");
const breakwater = axialKey(bw.coord);
const seawall = axialKey(sw.coord);
// Builds far from every storm (never pandanus), so the wind meets the 2030 homes on its own.
// The broken breakwater's tile stays as it is for the shot.
near.add(breakwater);
near.add(seawall);
const kinds = (c: { q: number; r: number }) => plan.state.buildableAt(c).filter((d) => d.id !== "sandy_vegetation").sort((a, b) => (b.effects.biodiversity ?? 0) - (a.effects.biodiversity ?? 0));
const spare = (): void => {
  const tile = [...plan.state.placed.values()].find((t) => !near.has(axialKey(t.coord)) && kinds(t.coord).length > 0)!;
  build(tile.coord.q, tile.coord.r, kinds(tile.coord)[0].id);
};
// The shot of the aged defences comes after build PAUSE (the year is then 2026 + PAUSE).
const PAUSE = 12;
while (actions.length < PAUSE) spare();
const agedAtPause = { breakwater: !!plan.state.elements.get(breakwater)?.broken, seawall: !plan.state.elements.get(seawall)?.broken };
while (!plan.finished) spare();
const expected = plan.schedule.map((c) => plan.outcomes.get(c.id)!);
console.log(`planned: breakwater ${breakwater}, seawall ${seawall}; storms ${expected.map((o) => `${o.stars} stars ${o.housesSaved}/${o.housesTotal} bio ${o.biodiversityChange}`).join(", ")}`);

// ---- played in the browser --------------------------------------------------------------------------------------
const server = await startDevServer(Number(process.env.PORT ?? 5477));
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
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
});
await page.goto(`${server.url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);

const cardsOpen = (): Promise<boolean> => page.locator(".result-cards:not([hidden])").isVisible().catch(() => false);
const ready = (): Promise<boolean> => page.evaluate(`!window.__panjimForTest.busy`) as Promise<boolean>;
const seen: { stars: number; text: string }[] = [];
let finalText = "";
async function settle(): Promise<void> {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    if (await cardsOpen()) {
      const card = (await page.evaluate(`(() => {
        const c = document.querySelector(".result-cards:not([hidden]) .result-card");
        const s = c.querySelector(".result-stars");
        return { stars: s ? Number((s.getAttribute("aria-label") || "").split(" ")[0]) : null, total: !!c.querySelector(".result-stars-total"), text: (c.textContent || "").replace(/\\s+/g, " ").trim() };
      })()`)) as { stars: number | null; total: boolean; text: string };
      if (card.total) {
        finalText = card.text;
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `final-card-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
        return;
      }
      if (card.stars !== null) {
        seen.push({ stars: card.stars, text: card.text });
        if (seen.length === 1) {
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(OUT, `result-card-2030-wind-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
        }
      }
      await page.locator(".result-cards:not([hidden]) .result-next").click();
      await page.waitForTimeout(700);
      continue;
    }
    if (await ready()) return;
    await page.waitForTimeout(400);
  }
  throw new Error("the year never settled");
}
type Probe = { __panjimForTest: { build: (c: { q: number; r: number }, id: string) => boolean; host: { state: { turn: number; elements: Map<string, { broken?: boolean }>; canBuild: (c: { q: number; r: number }, id: string) => boolean } } } };
async function shootAged(): Promise<void> {
  const s = (await page.evaluate(([b, sw2]) => {
    const st = (window as unknown as Probe).__panjimForTest.host.state;
    const [q, r] = (b as string).split(",").map(Number);
    return { turn: st.turn, broken: !!st.elements.get(b as string)?.broken, rebuild: st.canBuild({ q, r }, "breakwater"), wall: !!st.elements.get(sw2 as string) && !st.elements.get(sw2 as string)?.broken };
  }, [breakwater, seawall] as const)) as { turn: number; broken: boolean; rebuild: boolean; wall: boolean };
  check(agedAtPause.breakwater && s.broken, `${2026 + s.turn}: the 2026 breakwater is broken with age (headless and in the game)`);
  check(s.rebuild, "its tile takes a new breakwater");
  check(agedAtPause.seawall && s.wall, "the 2027 seawall still stands");
  const [bq, br] = breakwater.split(",").map(Number);
  await page.evaluate(`window.__panjimForTest.host.focusCamera({ q: ${bq}, r: ${br} }, true, 0.3)`);
  await page.mouse.move(2, H - 2);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, `broken-breakwater-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  const [sq, sr] = seawall.split(",").map(Number);
  await page.evaluate(`window.__openTileForTest(${sq}, ${sr})`);
  await page.waitForTimeout(3500);
  const note = (await page.evaluate(`document.querySelector(".built-info-note")?.textContent ?? ""`)) as string;
  check(note.startsWith("Cracked: breaks in the next cyclone"), `the cracked seawall's card: "${note}"`);
  await page.screenshot({ path: path.join(OUT, `cracked-seawall-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}
for (const [i, a] of actions.entries()) {
  await settle();
  if (i === PAUSE) await shootAged();
  const ok = (await page.evaluate(([act]) => (window as unknown as Probe).__panjimForTest.build({ q: act.q, r: act.r }, act.elementId), [a] as const)) as boolean;
  if (!ok) {
    check(false, `build ${i + 1} (${a.elementId} at ${a.q},${a.r}) refused`);
    break;
  }
  await page.waitForTimeout(300);
}
await settle();

expected.forEach((o, i) => {
  const got = seen[i];
  check(!!got && got.stars === o.stars && got.text.includes(`${o.housesSaved} of ${o.housesTotal} homes saved`), `storm ${i + 1}: card ${got ? `${got.stars} stars, "${got.text.slice(0, 160)}"` : "missing"}; run ${o.stars} stars, ${o.housesSaved} of ${o.housesTotal}`);
});
check(!!seen[0] && /The wind alone took (one|\d+) of the homes lost/.test(seen[0].text), `the 2030 card names the homes the wind alone took: "${seen[0]?.text.match(/The wind alone took[^.]*\./)?.[0] ?? "missing"}"`);
const last = expected[expected.length - 1].biodiversityChange ?? 0;
const bioText = `${last > 0 ? "+" : last < 0 ? "−" : ""}${Math.abs(last)} biodiversity at the end of 2050`;
check(finalText.includes(bioText), `the final card: "${bioText}" (${finalText.slice(0, 200)})`);
check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
await server.stop();
process.exit(failed > 0 ? 1 : 0);
