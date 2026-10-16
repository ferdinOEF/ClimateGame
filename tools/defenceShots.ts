/**
 * Section 14: the seven redrawn defences, each on a tile beside houses.
 *
 * Usage:  npx tsx tools/defenceShots.ts [outDir] [label]   (outDir defaults to docs/qa/section14/defences)
 *
 * Writes, for each defence:
 *   - default-<id>-<label>.jpg   the default zoom, centred on it (beside houses);
 *   - close-<id>-<label>.jpg     a close-up crop;
 * and contact-<label>.jpg (all seven close-ups) plus a grayscale copy, so
 * each can be checked by silhouette alone. Also prints the triangle count
 * per model and the frame cost with every defence built many times over.
 * `label` lets a before/after pair sit side by side (e.g. "before", "after").
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section14/defences");
const LABEL = process.argv[3] ?? "after";
const PORT = Number(process.env.CHECK_PORT ?? 5314);
const IDS = ["mangrove", "sandy_vegetation", "dune", "seawall", "breakwater", "khazan", "small_dam"];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
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
    await page.waitForTimeout(2500);
    await page.evaluate("(function () { var p = window.__panjimForTest; p.maya.holdLines = true; p.maya.withdraw(function () { return true; }); p.maya.dismiss(); window.__panjimScenarioForTest('risk-off'); if (p.hideCone) p.hideCone(); })()");
    // A tile for each defence, beside houses, as near the city as possible.
    const tiles = (await page.evaluate(`(function () {
      var r = window.__panjimForTest.run; var st = r.state; var out = {};
      var focus = { q: 6, r: 12 };
      var dist = function (a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2; };
      var all = Array.from(st.placed.values()).map(function (t) { return t.coord; }).sort(function (a, b) { return dist(a, focus) - dist(b, focus); });
      var taken = {};
      ${JSON.stringify(IDS)}.forEach(function (id) {
        for (var i = 0; i < all.length; i++) {
          var c = all[i]; var key = c.q + "," + c.r;
          if (taken[key] || !st.canBuild(c, id)) continue;
          var houses = 0;
          [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]].forEach(function (d) { var e = st.elements.get((c.q + d[0]) + "," + (c.r + d[1])); if (e && e.elementId === "house") houses++; });
          if (houses >= 2) { out[id] = c; taken[key] = 1; break; }
        }
      });
      return out;
    })()`)) as Record<string, { q: number; r: number }>;
    for (const id of IDS) if (tiles[id]) await page.evaluate(`window.__placeVisualForTest(${tiles[id].q}, ${tiles[id].r}, ${JSON.stringify(id)}, false)`);
    await page.waitForTimeout(800);
    const shots: string[] = [];
    for (const id of IDS) {
      const t = tiles[id];
      if (!t) {
        console.log(`no tile beside houses for ${id}`);
        continue;
      }
      await page.evaluate(`window.__focusTileForTest(${t.q}, ${t.r})`);
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(OUT, `default-${id}-${LABEL}.jpg`), type: "jpeg", quality: 82 });
      // Close up: zoom in on it, then crop round it.
      await page.mouse.move(960, 540);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -400);
        await page.waitForTimeout(120);
      }
      await page.evaluate(`window.__focusTileForTest(${t.q}, ${t.r})`);
      // The pointer off the board, so the hover outline is not in the shot.
      await page.mouse.move(2, 1078);
      await page.waitForTimeout(1600);
      const at = (await page.evaluate(`window.__projectTileForTest(${t.q}, ${t.r})`)) as { x: number; y: number };
      const w = 560;
      const h = 420;
      const file = path.join(OUT, `close-${id}-${LABEL}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 88, clip: { x: Math.max(0, Math.min(1920 - w, at.x - w / 2)), y: Math.max(0, Math.min(1080 - h, at.y - h * 0.62)), width: w, height: h } });
      shots.push(file);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(120);
      }
    }
    // Frame cost with every defence built many times over.
    const perf = (await page.evaluate(`(async function () {
      var st = window.__panjimForTest.run.state; var ids = ${JSON.stringify(IDS)}; var n = 0;
      st.placed.forEach(function (t) {
        if (n >= 140) return;
        for (var i = 0; i < ids.length; i++) if (st.canBuild(t.coord, ids[i])) { window.__placeVisualForTest(t.coord.q, t.coord.r, ids[i], false); n++; break; }
      });
      var s = window.__frameStatsForTest; var f0 = s.frames, u0 = s.updateMs, r0 = s.renderMs;
      await new Promise(function (res) { setTimeout(res, 4000); });
      return { placed: n, calls: s.calls, triangles: s.triangles, updateMs: (s.updateMs - u0) / Math.max(1, s.frames - f0), renderMs: (s.renderMs - r0) / Math.max(1, s.frames - f0) };
    })()`)) as { placed: number; calls: number; triangles: number; updateMs: number; renderMs: number };
    const counts = (await page.evaluate(`(function () {
      var out = {}; var m = window.__elementsForTest.meshes;
      m.forEach(function (mesh, id) { if (${JSON.stringify(IDS)}.indexOf(id) >= 0) out[id] = mesh.geometry.getAttribute("position").count / 3; });
      return out;
    })()`)) as Record<string, number>;
    const report = [
      `triangles per model (with ring): ${IDS.map((id) => `${id} ${counts[id]}`).join(", ")}`,
      `${perf.placed} defences on the board: ${perf.calls} draw calls, ${perf.triangles} triangles a frame, update ${perf.updateMs.toFixed(2)} ms, render ${perf.renderMs.toFixed(2)} ms a frame (software GL)`,
      `console errors: ${errors.length ? errors.slice(0, 3).join(" | ") : "none"}`
    ];
    fs.writeFileSync(path.join(OUT, `report-${LABEL}.txt`), report.join("\n") + "\n");
    console.log(report.join("\n"));
    execFileSync("python3", ["-I", "-c", `
import sys
from PIL import Image, ImageOps, ImageDraw
files = sys.argv[3:]
out = sys.argv[1]; gray = sys.argv[2]
ims = [Image.open(f) for f in files]
w, h = 560, 420
cols = 4
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + 26)), (24, 28, 26))
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * (h + 26)
    sheet.paste(im.resize((w, h)), (x, y + 26))
    d.text((x + 8, y + 6), f.split("close-")[1].rsplit("-", 1)[0], fill=(240, 230, 210))
sheet.save(out, quality=88)
ImageOps.grayscale(sheet).save(gray, quality=85)
`, path.join(OUT, `contact-${LABEL}.jpg`), path.join(OUT, `contact-${LABEL}-gray.jpg`), ...shots]);
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
