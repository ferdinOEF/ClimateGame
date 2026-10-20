/**
 * Section 23's targeted shots (the default QA gate): the 2050 forecast cone
 * and the 2050 risk heat with the sheltered middle of Taleigao clear, the
 * 2050 storm's water held mid-storm, and a build going down with no pop-up.
 * Counts in the browser what the shots show: heat, cone and drawn water on the
 * sheltered tiles (all 0), pop-ups after the build (0), console errors (0).
 *
 * Usage: npx tsx tools/section23Shots.ts <width> <height> [outDir=docs/qa/section23]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1920", h = "1080", outDir = "docs/qa/section23"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5473));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
const results: Record<string, unknown> = {};
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};

const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
});
const scenario = (name: string): Promise<unknown> => page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(name)})`);
const shot = (name: string): Promise<Buffer> => page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 82 });
const closeCards = async (): Promise<void> => {
  for (let k = 0; k < 12; k++) {
    const next = page.locator(".result-cards:not([hidden]) .result-next");
    if (!(await next.isVisible().catch(() => false))) return;
    await next.click();
    await page.waitForTimeout(900);
  }
};
/** What the 2050 storm shows on the sheltered tiles: heat, cone bands, area and homes at risk. */
const onShelter = (): Promise<Record<string, number>> =>
  page.evaluate(`(() => {
    const run = window.__panjimForTest.run;
    const c3 = run.schedule.find((c) => c.id === "c3-compound");
    const shelter = new Set(c3.shelteredTiles.map(([q, r]) => q + "," + r));
    const ex = run.exposureFor(c3);
    const cone = run.forecastCone(c3);
    const n = (keys) => [...keys].filter((k) => shelter.has(k)).length;
    return { sheltered: shelter.size, heat: n(ex.exposure.keys()), homesAtRisk: n(ex.housesAtRisk), coneBands: n(cone.bands.keys()), coneArea: n(cone.area), coneMeet: n(cone.meet), next: run.nextChallenge().id };
  })()`) as Promise<Record<string, number>>;

await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);

// ---- 23.2 a build going down: no pop-up rises from the tile ----------------------------------------------------
const spot = (await page.evaluate(`(() => {
  const run = window.__panjimForTest.run;
  for (const key of run.zones.keys("z1")) {
    const [q, r] = key.split(",").map(Number);
    if (run.state.canBuild({ q, r }, "dune")) return { q, r };
  }
  return null;
})()`)) as { q: number; r: number } | null;
check(spot !== null, "23.2: a beach tile to build a dune on");
if (spot) {
  await page.evaluate(`window.__panjimForTest.host.focusCamera(${JSON.stringify(spot)}, true, 0.6)`);
  await page.waitForTimeout(3500);
  await page.mouse.move(2, H - 2);
  await page.evaluate(`window.__panjimForTest.build(${JSON.stringify(spot)}, "dune")`);
  // Where the float used to stand: 0.3 s to 1.2 s after the build.
  let floats = 0;
  for (let k = 0; k < 4; k++) {
    await page.waitForTimeout(300);
    floats = Math.max(floats, (await page.evaluate("document.querySelectorAll('.build-float, .build-floats').length")) as number);
    if (k === 1) await shot("build-no-popup");
  }
  const text = (await page.evaluate("document.body.innerText")) as string;
  results.build = { at: spot, floats, homesSafeText: /homes? safe|more homes? at risk/.test(text) };
  check(floats === 0 && !/homes? safe/.test(text), "23.2: no pop-up and no '+N homes safe' after the build");
}

// ---- 23.1 the 2050 cone: after the first two storms, at the start of the 2050 storm's years ----------------------
await scenario("past-storm");
await closeCards();
await scenario("past-storm");
await closeCards();
await page.waitForTimeout(1500);
await page.keyboard.press("Home");
await page.waitForTimeout(3500);
await page.mouse.move(2, H - 2);
const cone = await onShelter();
results.cone = cone;
await shot("cone-2050");
check(cone.next === ("c3-compound" as never) && cone.coneBands === 0 && cone.coneArea === 0 && cone.coneMeet === 0, `23.1: the 2050 cone leaves the shelter clear (${JSON.stringify(cone)})`);

// ---- 23.1 the 2050 heat: the last two years before it ------------------------------------------------------------
await scenario("heat-2");
await page.waitForTimeout(1500);
await page.keyboard.press("Home");
await page.waitForTimeout(3500);
await page.mouse.move(2, H - 2);
const heat = await onShelter();
results.heat = heat;
const heatTiles = (await page.evaluate("window.__panjimForTest.run.homesAtRisk(window.__panjimForTest.run.nextChallenge())")) as number;
results.homesAtRisk2050 = heatTiles;
await shot("heat-2050");
check(heat.heat === 0 && heat.homesAtRisk === 0, `23.1: the 2050 heat and Homes at risk leave the shelter clear (${JSON.stringify(heat)}, Homes at risk ${heatTiles})`);

// ---- 23.1 the 2050 storm's water, held mid-storm -----------------------------------------------------------------
await scenario("storm-16");
await page.keyboard.press("Home");
await page.waitForTimeout(4000);
await shot("storm-2050");
const drawn = (await page.evaluate(`(() => {
  const run = window.__panjimForTest.run;
  const c3 = run.schedule.find((c) => c.id === "c3-compound");
  const record = run.stormRecords.get(c3.id);
  if (!record) return null;
  let wet = 0;
  for (const [q, r] of c3.shelteredTiles) {
    const t = record.field.tiles.get(q + "," + r);
    if (t && t.surgePeak + t.floodPeak + t.windPeak > 0) wet++;
  }
  return { wet, lostThere: [...record.outcome.damagedHouses].filter((k) => c3.shelteredTiles.some(([q, r]) => q + "," + r === k)).length };
})()`)) as { wet: number; lostThere: number } | null;
results.storm = drawn;
check(drawn !== null && drawn.wet === 0 && drawn.lostThere === 0, `23.1: the 2050 storm draws no water there and takes no home there (${JSON.stringify(drawn)})`);
await scenario("storm-release");

const errs = errors.filter((l) => !/Download the React DevTools|GPU stall|WebGL/.test(l));
check(errs.length === 0, `no console errors${errs.length ? `: ${errs.slice(0, 3).join(" | ")}` : ""}`);
console.log(JSON.stringify({ size: `${W}x${H}`, results, errors: errs }));
console.log(failed === 0 ? `ALL PASS (${W}x${H})` : `${failed} FAILED (${W}x${H})`);
await browser.close();
server.stop();
process.exit(failed === 0 ? 0 : 1);
