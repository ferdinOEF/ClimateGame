/**
 * Section 14: the wildlife in the game, beside the defences (the models alone
 * are tools/wildlifeShots.ts). A mangrove and a khazan are drawn near the
 * city; each moment is forced in turn and filmed, zoomed in a little, every
 * 0.7 s, so the flight towards the camera is caught; then the frames of each
 * moment as a contact sheet.
 *
 * Usage:  npx tsx tools/wildlifeInGame.ts [outDir]   (defaults to docs/qa/section14/wildlife-ingame)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section14/wildlife-ingame");
const KINDS = ["kingfisher", "egret", "otter", "fish", "prawn"] as const;

async function main(): Promise<void> {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(Number(process.env.CHECK_PORT ?? 5352));
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  const report: string[] = [];
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
    await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
    await page.waitForTimeout(1200);
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(3000);
    await page.evaluate("(function () { var p = window.__panjimForTest; p.maya.holdLines = true; p.maya.withdraw(function () { return true; }); p.maya.dismiss(); if (p.hideCone) p.hideCone(); })()");
    const spots = (await page.evaluate(`(function () {
      var r = window.__panjimForTest.run; var m = null, k = null; var f = { q: 8, r: 16 };
      var d = function (a) { return (Math.abs(a.q - f.q) + Math.abs(a.r - f.r) + Math.abs(a.q + a.r - f.q - f.r)) / 2; };
      var all = Array.from(r.state.placed.values()).map(function (t) { return t.coord; }).sort(function (a, b) { return d(a) - d(b); });
      for (var i = 0; i < all.length; i++) { var c = all[i]; if (!m && r.state.canBuild(c, "mangrove")) m = c; else if (!k && r.state.canBuild(c, "khazan") && d(c) > 0) k = c; }
      return { m: m, k: k };
    })()`)) as { m: { q: number; r: number }; k: { q: number; r: number } };
    await page.evaluate(`window.__placeVisualForTest(${spots.m.q}, ${spots.m.r}, "mangrove", false)`);
    await page.evaluate(`window.__placeVisualForTest(${spots.k.q}, ${spots.k.r}, "khazan", false)`);
    for (const kind of KINDS) {
      const spot = kind === "fish" || kind === "prawn" ? spots.k : spots.m;
      await page.evaluate(`window.__focusTileForTest(${spot.q}, ${spot.r})`);
      await page.waitForTimeout(1500);
      await page.mouse.move(960, 540);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, -400);
        await page.waitForTimeout(150);
      }
      await page.evaluate(`window.__focusTileForTest(${spot.q}, ${spot.r})`);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(2200);
      await page.evaluate("window.__wildlifeStepForTest(0)");
      const started = (await page.evaluate(`window.__wildlifeForTest().forceMoment(${JSON.stringify(kind)}, 0)`)) as boolean;
      report.push(`${kind}: ${started ? "started" : "DID NOT START"} ${JSON.stringify(await page.evaluate("(function () { var w = window.__wildlifeForTest(); return { busy: w.busy, current: w.current, sources: w.sources }; })()"))}`);
      // The moment on a hand-stepped clock: a frame every `step` ms of its own time, however slow the renderer.
      // Fine steps: the close pass towards the camera lasts well under a second.
      const step = kind === "fish" || kind === "prawn" ? 100 : 150;
      for (let f = 0; f < 90 && ((await page.evaluate("window.__wildlifeForTest().busy")) as boolean); f++) {
        await page.evaluate(`window.__wildlifeStepForTest(${step})`);
        await page.waitForTimeout(160);
        await page.screenshot({ path: path.join(OUT, `${kind}-${String(f).padStart(2, "0")}.jpg`), type: "jpeg", quality: 82 });
      }
      await page.evaluate("window.__wildlifeStepForTest(20000)");
      await page.mouse.move(960, 540);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(150);
      }
    }
    report.push(`triangles: ${JSON.stringify(await page.evaluate("window.__wildlifeForTest().triangleCounts"))}`);
  } finally {
    await browser.close();
    server.stop();
  }
  for (const kind of KINDS) {
    execFileSync("python3", ["-I", "-c", `
import os, sys
from PIL import Image, ImageDraw
src, kind, out = sys.argv[1], sys.argv[2], sys.argv[3]
files = sorted(f for f in os.listdir(src) if f.startswith(kind + "-") and f.endswith(".jpg"))
if not files:
    sys.exit(0)
# A spread of the moment, then its last frames (the bird closest to the camera).
if len(files) > 16:
    head = files[:-6]
    files = [head[i * len(head) // 10] for i in range(10)] + files[-6:]
w, h = 480, 270
cols = 4
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + 20)), (24, 28, 26))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    x, y = (i % cols) * w, (i // cols) * (h + 20)
    sheet.paste(Image.open(os.path.join(src, f)).resize((w, h)), (x, y + 20))
    d.text((x + 6, y + 4), f, fill=(240, 230, 210))
sheet.save(out, quality=84)
`, OUT, kind, path.join(OUT, `sheet-${kind}.jpg`)]);
  }
  // Keep the sheets and four frames a moment (first, middle, the close pass); the rest is too big for the repository.
  for (const kind of KINDS) {
    const frames = fs.readdirSync(OUT).filter((f) => f.startsWith(`${kind}-`)).sort();
    const keep = new Set([frames[0], frames[Math.floor(frames.length / 2)], frames[frames.length - 3], frames[frames.length - 2]]);
    for (const f of frames) if (!keep.has(f)) fs.rmSync(path.join(OUT, f));
  }
  report.push(`console errors: ${errors.length ? errors.slice(0, 3).join(" | ") : "none"}`);
  fs.writeFileSync(path.join(OUT, "report.txt"), report.join("\n") + "\n");
  console.log(report.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
