/**
 * Frame sequences for the QA contact sheets.
 *
 *   npx tsx tools/contactSheet.ts <out-dir> freeze <scenario-prefix> <from> <to> [port]
 *     New build: plays the scenario steps (comma-separated, may be empty),
 *     then holds the storm at storm time `from`, `from + 0.25`, ... `to` and
 *     saves a frame at each.
 *
 *   npx tsx tools/contactSheet.ts <out-dir> wall <scenario> <seconds> - [port] [root]
 *     Any build (the pre-change one too): starts the scenario, waits for the
 *     storm's staging to begin (the live Houses counter), then steps a
 *     controlled clock 0.25 s per frame for `seconds`.
 *
 * Frames go to docs/qa/contact/<out-dir>/; tools/contactSheet.py lays them out.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { startDevServer } from "./devServer";

/** A Vite dev server for another checkout (the pre-change worktree), stopped with its process group. */
async function startServerAt(root: string, port: number): Promise<{ stop: () => void }> {
  const child = spawn("npx", ["vite", "--port", String(port), "--strictPort"], { cwd: root, stdio: "pipe", shell: true, detached: true });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) break;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    stop: () => {
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
  };
}

const [outName, mode, scenarioArg, a, b, portArg, rootArg] = process.argv.slice(2);
const PORT = Number(portArg ?? 5199);
const OUT = path.resolve("docs", "qa", "contact", outName);

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));
  const server = rootArg ? await startServerAt(path.resolve(rootArg), PORT) : await startDevServer(PORT);
  try {
    const browser = await chromium.launch({
      executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ...(mode === "wall" ? { recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } } : {})
    });
    const page = await context.newPage();
    // The video's clock starts with the page.
    const pageStart = Date.now();
    await page.goto(`http://localhost:${PORT}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-cta", { timeout: 90000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(3000);
    const run = (name: string): Promise<unknown> => page.evaluate(`(async () => window.__panjimScenarioForTest ? await window.__panjimScenarioForTest(${JSON.stringify(name)}) : false)()`);
    let n = 0;
    const shot = async (label: string): Promise<void> => {
      await page.screenshot({ path: path.join(OUT, `f${String(n++).padStart(3, "0")}-${label}.jpg`), type: "jpeg", quality: 72 });
    };
    if (mode === "freeze") {
      const steps = scenarioArg ? scenarioArg.split(",").filter(Boolean) : [];
      for (const step of steps) await run(step);
      const from = Number(a);
      const to = Number(b);
      await run(`storm-${from}`);
      for (let t = from; t <= to + 1e-6; t += 0.25) {
        await page.evaluate(`window.__stormForTest.freeze(${t})`);
        await page.waitForTimeout(250);
        await shot(`t${t.toFixed(2)}`);
      }
    } else {
      // The old build's staging plays in real time, and a software-GL
      // screenshot takes over a second, so this mode records a video of the
      // page instead (see `video` below); the frames are cut from it at
      // 0.25 s intervals by tools/contactSheet.py's companion ffmpeg step.
      void run(scenarioArg);
      await page.waitForSelector(".houses-counter.live", { timeout: 300000 });
      fs.writeFileSync(path.join(OUT, "staging-start.txt"), String((Date.now() - pageStart) / 1000));
      await page.waitForTimeout(Number(a) * 1000);
    }
    await context.close();
    await browser.close();
  } finally {
    server.stop();
  }
  console.log(`frames: ${fs.readdirSync(OUT).length} in ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
