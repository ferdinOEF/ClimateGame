/**
 * Screenshots of the wildlife models and moments, for judging them by eye.
 *
 * Usage:  npx tsx tools/wildlifeShots.ts [only-prefix]
 * Writes JPEGs to docs/qa/section14/wildlife/. Opens tools/wildlifePreview.html
 * in headless Chromium (software GL) and drives it through `window.__wl`.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, "docs/qa/section14/wildlife");
const PORT = Number(process.env.SHOT_PORT ?? 5341);
const PAGE = process.env.WL_PAGE ?? "tools/wildlifePreview.html";
const ONLY = process.argv[2] ?? "";

type Shot = { name: string; run: string };

const MODEL: Shot[] = [
  // The game's sun comes from -X, +Y, +Z: views from that side show the lit flank.
  { name: "kingfisher-perched-side", run: `__wl.model("kingfisher","perch",-90,6)` },
  { name: "kingfisher-perched-34", run: `__wl.model("kingfisher","perch",-40,16)` },
  { name: "kingfisher-perched-back", run: `__wl.model("kingfisher","perch",200,40)` },
  { name: "kingfisher-flight-fish", run: `__wl.model("kingfisher","flight",-25,20)` },
  { name: "kingfisher-flight-above", run: `__wl.model("kingfisher","flightUp",-160,55)` },
  { name: "kingfisher-dive", run: `__wl.model("kingfisher","dive",-90,10)` },
  { name: "egret-wading-side", run: `__wl.model("egret","wade",-90,5)` },
  { name: "egret-wading-34", run: `__wl.model("egret","wade",-35,15)` },
  { name: "egret-flight", run: `__wl.model("egret","flight",-50,20)` },
  { name: "egret-flight-side", run: `__wl.model("egret","flightUp",-90,8)` },
  { name: "otter", run: `__wl.model("otter","rest",-55,20)` },
  { name: "otter-look", run: `__wl.model("otter","look",-80,12)` },
  { name: "fish", run: `__wl.model("fish","",-70,15)` },
  { name: "prawn", run: `__wl.model("prawn","",-60,35)` }
];

/**
 * Moments: frames are chosen from the moment's own timeline (stage changes),
 * so they land on the dive, the splash, the take-off and points along the
 * flight whatever the timings. [stage, offset ms into it or fraction of it].
 */
const MOMENTS: { kind: string; picks: [string, number][] }[] = [
  { kind: "kingfisher", picks: [["kf-perch", 1500], ["kf-dive", 200], ["kf-under", 80], ["kf-emerge", 250], ["kf-fly", 0.15], ["kf-fly", 0.45], ["kf-fly", 0.7], ["kf-fly", 0.85]] },
  { kind: "egret", picks: [["eg-wade", 1500], ["eg-wade", 2100], ["eg-crouch", 300], ["eg-takeoff", 400], ["eg-fly", 0.1], ["eg-fly", 0.4], ["eg-fly", 0.65], ["eg-fly", 0.8]] },
  { kind: "otter", picks: [["otter", 500], ["otter", 2000], ["otter", 4300], ["otter", 4800]] },
  { kind: "fish", picks: [["jump", 120], ["jump", 330], ["jump", 560], ["jump", 760]] },
  { kind: "prawn", picks: [["jump", 120], ["jump", 300], ["jump", 520], ["jump", 700]] }
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${server.url}/${PAGE}`);
    await page.waitForFunction("window.__wl && window.__wl.ready", null, { timeout: 60000 });
    console.log("counts", JSON.stringify(await page.evaluate("__wl.counts()")));
    for (const s of MODEL) {
      if (ONLY && !s.name.startsWith(ONLY)) continue;
      const r = await page.evaluate(s.run);
      await page.screenshot({ path: path.join(OUT, `${s.name}.jpg`), type: "jpeg", quality: 88 });
      console.log("wrote", s.name, r);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(400);
    for (const m of MOMENTS) {
      const name = `moment-${m.kind}`;
      if (ONLY && !name.startsWith(ONLY)) continue;
      const timeline = (await page.evaluate(`__wl.timeline(${JSON.stringify(m.kind)})`)) as [number, string][];
      console.log(name, JSON.stringify(timeline));
      const times: number[] = [];
      for (const [stage, off] of m.picks) {
        const i = timeline.findIndex(([, st]) => st === stage);
        if (i < 0) continue;
        const t0 = timeline[i][0];
        const t1 = timeline[i + 1]?.[0] ?? t0 + 1000;
        times.push(Math.round(off <= 1 ? t0 + (t1 - t0) * off : t0 + off));
      }
      const ok = await page.evaluate(`__wl.moment(${JSON.stringify(m.kind)})`);
      if (!ok) {
        console.log("moment refused", name);
        continue;
      }
      // Step in fake time at 60 fps (the director sees ordinary frames).
      let t = 0;
      let n = 0;
      for (const f of times) {
        await page.evaluate(`(function(){ for (var t=${t}; t<=${f}; t+=1000/60) __wl.at(t); })()`);
        t = f + 1000 / 60;
        const tag = `${name}-${++n}-${String(f).padStart(5, "0")}`;
        await page.screenshot({ path: path.join(OUT, `${tag}.jpg`), type: "jpeg", quality: 85 });
        // A close-up crop around the animal while it is still small on screen.
        const fpos = (await page.evaluate("__wl.focus()")) as { x: number; y: number } | null;
        if (fpos) {
          const w = 480, h = 300;
          const x = Math.max(0, Math.min(1920 - w, fpos.x - w / 2));
          const y = Math.max(0, Math.min(1080 - h, fpos.y - h / 2));
          await page.screenshot({ path: path.join(OUT, `${tag}-crop.jpg`), type: "jpeg", quality: 90, clip: { x, y, width: w, height: h } });
        }
      }
      console.log("wrote", name, times.join(","));
    }
  } finally {
    await browser.close();
    server.stop();
  }
  if (errors.length) {
    console.log("CONSOLE ERRORS:\n" + errors.join("\n"));
    process.exitCode = 1;
  } else console.log("console: clean");
}

void main();
