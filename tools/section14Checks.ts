/**
 * Section 14 browser checks and screenshots (the defences' own close-ups and
 * before/after pairs are tools/defenceShots.ts; the wildlife's are
 * tools/wildlifeShots.ts).
 *
 * Usage:  npx tsx tools/section14Checks.ts [outDir]   (outDir defaults to docs/qa/section14)
 *
 * At 1920x1080 and 1280x600: the cone at the start of each phase and result
 * card 1 of each phase (the first cyclone with its objective followed, so it
 * says "Every home in the path survived"). At 1366x768 and 2560x1440: the
 * first phase's cone and result card. At 1920 also: the hover outline on a
 * buildable tile (and none on a built one), a build's pop, ring and puff as a
 * contact sheet of frames, the board edge, and grayscale and deuteranopia
 * copies of the cone. axe on result card 1; zero console errors.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section14");
const PORT = Number(process.env.CHECK_PORT ?? 5315);
const SIZES: [number, number, boolean][] = [[1920, 1080, true], [1280, 600, true], [1366, 768, false], [2560, 1440, false]];
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

async function shot(page: Page, name: string, copies = false): Promise<void> {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
  if (!copies) return;
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 75 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
  await page.evaluate(`(function () {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0"); svg.id = "qa-cvd-svg";
    svg.innerHTML = '<filter id="qa-cvd"><feColorMatrix type="matrix" values="${DEUTERANOPIA}"/></filter>';
    document.body.appendChild(svg); document.documentElement.style.filter = "url(#qa-cvd)";
  })()`);
  await page.screenshot({ path: path.join(OUT, `${name}-deut.jpg`), type: "jpeg", quality: 80 });
  await page.evaluate(`(function () { document.documentElement.style.filter = ""; var s = document.getElementById("qa-cvd-svg"); if (s) s.remove(); })()`);
}

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: no serious or critical violations${found.length ? `: ${found.join(", ")}` : ""}`);
}

const val = <T>(page: Page, expr: string): Promise<T> => page.evaluate(`(function () { var p = window.__panjimForTest; var r = p.run; return ${expr}; })()`) as Promise<T>;
const text = (page: Page, selector: string): Promise<string> => page.evaluate(`(function () { var el = document.querySelector(${JSON.stringify(selector)}); return el && !el.hidden && el.getClientRects().length ? el.innerText.trim() : ""; })()`) as Promise<string>;

/** Plays to the storm and stops on result card 1. */
async function toResults(page: Page): Promise<void> {
  await page.evaluate("window.__toResults = window.__panjimScenarioForTest('to-results')");
  for (let k = 0; k < 600 && !(await page.evaluate("!!document.querySelector('.result-cards:not([hidden]) .result-next')")); k++) await page.waitForTimeout(400);
}

/** From result card 1 through the cards to the next phase's first year. */
async function onToNextPhase(page: Page): Promise<void> {
  for (let k = 0; k < 3; k++) {
    if (!(await page.evaluate("!!document.querySelector('.result-cards:not([hidden]) .result-next')"))) break;
    await page.locator(".result-next").click();
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(3000);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, "pop"), { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    for (const [w, h, allPhases] of SIZES) {
      const tag = `${w}x${h}`;
      const full = w === 1920;
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`${tag}: ${m.text()}`);
      });
      await page.addInitScript(() => {
        try {
          localStorage.clear();
        } catch {
          /* blocked */
        }
      });
      await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-card", { timeout: 120000 });
      await page.waitForTimeout(1200);
      await page.locator(".brief-cta", { hasText: /Begin|Start/i }).first().click();
      await page.waitForTimeout(3500);
      await page.evaluate("(function () { var p = window.__panjimForTest; p.maya.holdLines = true; p.maya.withdraw(function () { return true; }); p.maya.dismiss(); })()");
      await shot(page, `cone-p1-${tag}`, full);

      if (full) {
        // The hover outline: on a free beach tile, and gone on a built one.
        const beach = (await val<{ q: number; r: number } | null>(page, `(function () { var best = null; r.state.placed.forEach(function (t) { if (!best && t.terrainId === "beach" && r.state.canBuild(t.coord, "dune")) best = t.coord; }); return best; })()`))!;
        await page.evaluate(`window.__focusTileForTest(${beach.q}, ${beach.r})`);
        await page.waitForTimeout(1500);
        const at = (await page.evaluate(`window.__projectTileForTest(${beach.q}, ${beach.r})`)) as { x: number; y: number };
        await page.mouse.move(at.x, at.y + 2);
        await page.waitForTimeout(500);
        await page.mouse.move(at.x + 1, at.y + 3);
        await page.waitForTimeout(500);
        const hover = (await page.evaluate("(function () { var t = window.__tileHoverForTest(); return t ? { visible: t.mesh.visible, x: t.mesh.position.x, z: t.mesh.position.z } : null; })()")) as { visible: boolean } | null;
        check(!!hover?.visible, `the hover outline shows on a free beach tile (${beach.q},${beach.r})`);
        await page.screenshot({ path: path.join(OUT, "hover-1920x1080.jpg"), type: "jpeg", quality: 85, clip: { x: Math.max(0, at.x - 300), y: Math.max(0, at.y - 220), width: 600, height: 440 } });
        // The build pop, its ring drawing in and the puff: frames 0.1 s apart.
        await page.mouse.move(5, 5);
        const pop = { q: beach.q, r: beach.r };
        await page.evaluate(`window.__placeVisualForTest(${pop.q}, ${pop.r}, "dune", true)`);
        // Its build moment, then the shader's clock held at each age in turn (a screenshot takes longer than the pop).
        const born = (await page.evaluate(`(function () { var m = window.__elementsForTest.meshes.get("dune"); var a = m.geometry.getAttribute("aBorn"); var max = -1e9; for (var i = 0; i < m.count; i++) max = Math.max(max, a.getX(i)); return max; })()`)) as number;
        for (let i = 0; i < 10; i++) {
          await page.evaluate(`window.__freezeShaderTimeForTest(${born} + ${i} * 0.1)`);
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(OUT, "pop", `pop-${String(i).padStart(2, "0")}.jpg`), type: "jpeg", quality: 85, clip: { x: Math.max(0, at.x - 200), y: Math.max(0, at.y - 170), width: 400, height: 300 } });
        }
        await page.evaluate("window.__freezeShaderTimeForTest(null)");
        // The wildlife, in the game, beside the defences: a mangrove and a khazan drawn near the city, each moment forced in turn.
        fs.mkdirSync(path.join(OUT, "wildlife-ingame"), { recursive: true });
        const spots = (await val<{ m: { q: number; r: number } | null; k: { q: number; r: number } | null }>(page, `(function () {
          var m = null, k = null; var f = { q: 6, r: 14 };
          var d = function (a) { return (Math.abs(a.q - f.q) + Math.abs(a.r - f.r) + Math.abs(a.q + a.r - f.q - f.r)) / 2; };
          var all = Array.from(r.state.placed.values()).map(function (t) { return t.coord; }).sort(function (a, b) { return d(a) - d(b); });
          for (var i = 0; i < all.length; i++) { var c = all[i]; if (!m && r.state.canBuild(c, "mangrove")) m = c; else if (!k && r.state.canBuild(c, "khazan") && (!m || c.q !== m.q || c.r !== m.r)) k = c; }
          return { m: m, k: k };
        })()`))!;
        if (spots.m) await page.evaluate(`window.__placeVisualForTest(${spots.m.q}, ${spots.m.r}, "mangrove", false)`);
        if (spots.k) await page.evaluate(`window.__placeVisualForTest(${spots.k.q}, ${spots.k.r}, "khazan", false)`);
        for (const [kind, spot] of [["kingfisher", spots.m], ["egret", spots.m], ["otter", spots.m], ["fish", spots.k], ["prawn", spots.k]] as [string, { q: number; r: number } | null][]) {
          if (!spot) continue;
          await page.evaluate(`window.__focusTileForTest(${spot.q}, ${spot.r})`);
          await page.waitForTimeout(2200);
          const started = (await page.evaluate(`(function () { var w = window.__wildlifeForTest(); return !!w && w.forceMoment(${JSON.stringify(kind)}); })()`)) as boolean;
          check(started, `the ${kind} moment starts in the game`);
          for (let f = 0; f < 8; f++) {
            await page.waitForTimeout(kind === "fish" || kind === "prawn" ? 180 : 650);
            await page.screenshot({ path: path.join(OUT, "wildlife-ingame", `${kind}-${f}.jpg`), type: "jpeg", quality: 82 });
          }
          for (let k = 0; k < 40 && ((await page.evaluate("(function () { var w = window.__wildlifeForTest(); return !!w && w.busy; })()")) as boolean); k++) await page.waitForTimeout(250);
        }
        await page.mouse.move(at.x, at.y + 2);
        await page.waitForTimeout(400);
        // The game state still says the tile is free (the dune was drawn only), so the outline may still show; a real build is checked below.
        await page.mouse.move(5, 5);
      }

      // Phase 1: follow the objective, so its result card says every home survived.
      const picks = await val<{ key: string; elementId: string }[]>(page, "r.objective ? r.objective.picks.map(function (p) { return { key: p.key, elementId: p.elementId }; }) : []");
      for (const pick of picks) {
        const [q, r] = pick.key.split(",").map(Number);
        await page.evaluate(`window.__panjimForTest.build({ q: ${q}, r: ${r} }, ${JSON.stringify(pick.elementId)})`);
        await page.waitForTimeout(1200);
      }
      if (full && picks.length > 0) {
        const [q, r] = picks[0].key.split(",").map(Number);
        const at = (await page.evaluate(`window.__projectTileForTest(${q}, ${r})`)) as { x: number; y: number };
        await page.mouse.move(at.x, at.y + 2);
        await page.waitForTimeout(400);
        await page.mouse.move(at.x + 1, at.y + 3);
        await page.waitForTimeout(400);
        const built = (await page.evaluate("(function () { var t = window.__tileHoverForTest(); return t ? t.mesh.visible : null; })()")) as boolean | null;
        check(built === false, `no hover outline on a built tile (${picks[0].key})`);
        await page.mouse.move(5, 5);
      }
      if (full && picks.length > 0) {
        // The storm, held at 4 s: the defences answering it (foliage whipping, foam up), close on the first pick.
        await page.evaluate("window.__panjimScenarioForTest('storm-4')");
        await page.waitForTimeout(1500);
        const [q, r] = picks[0].key.split(",").map(Number);
        await page.evaluate(`window.__focusTileForTest(${q}, ${r})`);
        await page.waitForTimeout(1500);
        const at = (await page.evaluate(`window.__projectTileForTest(${q}, ${r})`)) as { x: number; y: number };
        await page.screenshot({ path: path.join(OUT, "storm-defences-1920x1080.jpg"), type: "jpeg", quality: 84, clip: { x: Math.max(0, at.x - 480), y: Math.max(0, at.y - 300), width: 960, height: 600 } });
        await page.evaluate("window.__panjimScenarioForTest('storm-release')");
        for (let k = 0; k < 600 && !(await page.evaluate("!!document.querySelector('.result-cards:not([hidden]) .result-next')")); k++) {
          await page.evaluate("(function () { var s = window.__stormForTest; if ((s && s.playing()) || document.querySelector('.replay-card:not([hidden])')) document.dispatchEvent(new PointerEvent('pointerdown')); })()");
          await page.waitForTimeout(400);
        }
      } else await toResults(page);
      const all = await text(page, ".result-homes-all");
      check(all === "Every home in the path survived", `${tag}: phase 1 result card says "${all}" above "${await text(page, ".result-homes-text")}"`);
      const places = await text(page, ".result-places");
      check(places.length > 0, `${tag}: phase 1 result card lists the landmarks in its area: ${places.replace(/\s+/g, " ")}`);
      await shot(page, `result1-p1-${tag}`, full);
      if (full) await axe(page, "result card 1");
      if (allPhases) {
        for (const phase of [2, 3]) {
          await onToNextPhase(page);
          await page.evaluate("(function () { var p = window.__panjimForTest; p.maya.withdraw(function () { return true; }); p.maya.dismiss(); })()");
          await shot(page, `cone-p${phase}-${tag}`, full);
          await toResults(page);
          const ok = (await text(page, ".result-homes-text")) !== "";
          check(ok, `${tag}: phase ${phase} result card: "${(await text(page, ".result-homes-all")) || "(some homes lost)"}" / "${await text(page, ".result-homes-text")}", places: ${(await text(page, ".result-places")).replace(/\s+/g, " ") || "none in the area"}`);
          await shot(page, `result1-p${phase}-${tag}`);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  // The pop's frames as one sheet.
  execFileSync("python3", ["-I", "-c", `
import os, sys
from PIL import Image, ImageDraw
src = sys.argv[1]; out = sys.argv[2]
files = sorted(f for f in os.listdir(src) if f.endswith(".jpg"))
w, h = 400, 300
cols = 5
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + 22)), (24, 28, 26))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    sheet.paste(Image.open(os.path.join(src, f)).resize((w, h)), (x, y + 22))
    d.text((x + 6, y + 5), "%.1f s" % (i * 0.1), fill=(240, 230, 210))
sheet.save(out, quality=86)
`, path.join(OUT, "pop"), path.join(OUT, "build-pop-contact.jpg")]);
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
  fs.writeFileSync(path.join(OUT, "checks.txt"), lines.join("\n") + "\n");
  console.log(`\n${lines.length - failed} of ${lines.length} checks pass.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
