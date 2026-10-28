/**
 * Section 34b.14: the art pass's before and after pictures. Each storm held at 7 s of storm time (the 2030 cyclone,
 * the 2040 flood, the 2050 cyclone and flood, each in a fresh page, the ones before it played through), and a seawall
 * and a breakwater built at Miramar, seen close. Run once against a build of the code before the pass and once after.
 *
 * Usage: npx tsx tools/section34bArt.ts url=http://localhost:4173 tag=after [sizes=1366x768,1920x1080] [out=docs/qa/section34b/art]
 *   [noblur=yes]: the page's 2D canvas has no `filter` (as in older Safari), so the cyclone's rings come from the baked
 *   files; it checks each of the four was loaded.
 * Exits 1 on a console error or a scenario that does not run.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { qaUrl } from "./qaUrl";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const URL0 = args.get("url") ?? "http://localhost:4173";
const TAG = args.get("tag") ?? "after";
const SIZES = (args.get("sizes") ?? "1366x768,1920x1080").split(",").map((s) => s.split("x").map(Number) as [number, number]);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section34b/art");
/** The storm times held, seconds (7 by default; 12 shows the cyclone near landfall, whole on screen). */
const TIMES = (args.get("at") ?? "7").split(",").map(Number);
/** Only these storms (cyclone-2030, flood-2040, finale-2050); all by default. walls=no leaves the walls out. */
const ONLY = args.get("storms")?.split(",") ?? null;
const WALLS = args.get("walls") !== "no";
const NOBLUR = args.get("noblur") === "yes";
const ringLoads: string[] = [];
fs.mkdirSync(OUT, { recursive: true });
const gpu = process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ args: gpu });
let failures = 0;
const errors: string[] = [];

async function open(W: number, H: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${W}x${H}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${W}x${H}: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("storm-ring-")) ringLoads.push(`${r.status()} ${r.url().split("/").pop()}`);
  });
  if (NOBLUR) await page.addInitScript(() => delete (CanvasRenderingContext2D.prototype as { filter?: string }).filter);
  await page.goto(qaUrl(`${URL0}/#/play/l01-first-rains`), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta").first().click({ timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.evaluate(`window.__panjimForTest.maya.setMuted(true)`);
  return page;
}
const scenario = (page: Page, name: string): Promise<boolean> => page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(name)})`) as Promise<boolean>;

for (const [W, H] of SIZES) {
  const tag = `${W}x${H}`;
  for (const at of TIMES) for (const [name, before] of [["cyclone-2030", []], ["flood-2040", ["past-storm"]], ["finale-2050", ["past-storm", "past-storm"]]] as const) {
    if (ONLY && !ONLY.includes(name)) continue;
    const page = await open(W, H);
    let ok = true;
    for (const step of before) ok = ok && (await scenario(page, step));
    ok = ok && (await scenario(page, `storm-${at}`));
    await page.waitForTimeout(1500);
    if (!ok) {
      failures++;
      console.log(`FAIL [${tag}] ${name}: the scenario did not run`);
    }
    await page.screenshot({ path: path.join(OUT, `${TAG}-${name}${at === 7 ? "" : `-${at}s`}-${tag}.jpg`), type: "jpeg", quality: 82 });
    await page.close();
  }
  // A seawall on the shore and a breakwater in the sea near Miramar, seen close.
  if (!WALLS) continue;
  const page = await open(W, H);
  const built = (await page.evaluate(`(() => { const c = window.__panjimForTest; const m = c.host.landmarks.find((l) => /Miramar/.test(l.name)); const out = [];
    for (const id of ["seawall", "breakwater"]) { let best = null; for (const t of c.run.state.placed.values()) { if (!c.run.state.canBuild(t.coord, id)) continue; const d = Math.hypot(t.coord.q - m.q, t.coord.r - m.r); if (!best || d < best.d) best = { coord: t.coord, d }; }
      if (best) { c.build(best.coord, id); out.push({ id, q: best.coord.q, r: best.coord.r }); } }
    return out; })()`)) as { id: string; q: number; r: number }[];
  if (built.length < 2) {
    failures++;
    console.log(`FAIL [${tag}] the seawall and the breakwater (${JSON.stringify(built)})`);
  }
  await page.waitForTimeout(2500);
  if (built[0]) {
    await page.evaluate(`(() => { window.__focusTileForTest(${built[0].q}, ${built[0].r}); window.__zoomForTest.zoomBy(-7); })()`);
    await page.waitForTimeout(2200);
  }
  await page.screenshot({ path: path.join(OUT, `${TAG}-walls-${tag}.jpg`), type: "jpeg", quality: 85 });
  await page.close();
  console.log(`done [${tag}] ${TAG}`);
}
await browser.close();
if (NOBLUR) {
  // Each page loads the four baked rings once; all must come back.
  const bad = ringLoads.filter((l) => !l.startsWith("200 ") && !l.startsWith("304 "));
  const seeds = new Set(ringLoads.map((l) => l.split(" ")[1]));
  console.log(`baked rings loaded: ${[...seeds].sort().join(", ") || "none"}`);
  if (seeds.size !== 4 || bad.length) {
    failures++;
    console.log(`FAIL the baked rings: ${bad.join(", ") || `${seeds.size} of 4`}`);
  }
}
if (errors.length) console.log(`console errors: ${errors.slice(0, 3).join(" | ")}`);
console.log(failures === 0 && errors.length === 0 ? "ALL PASS" : `${failures + errors.length} FAILED`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
