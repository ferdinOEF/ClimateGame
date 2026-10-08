/**
 * Pixel diff of the menu and the Tutorial's first screen against the
 * pre-change build (a worktree of the safety tag), at 1920x1080.
 *
 * Usage: npx tsx tools/pixelDiff.ts <pre-change-worktree>
 * Saves docs/qa/pixeldiff/{menu,tutorial}-{before,after}.png; the diff
 * figures are computed by tools/pixelDiff.py.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const OUT = path.resolve("docs", "qa", "pixeldiff");

async function serve(root: string, port: number): Promise<() => void> {
  const child = spawn("npx", ["vite", "--port", String(port), "--strictPort"], { cwd: root, stdio: "pipe", shell: true, detached: true });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) break;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return () => {
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      // Gone.
    }
  };
}

async function shoot(port: number, label: string): Promise<void> {
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".menu-screen", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `menu-${label}.png`) });
  await page.goto(`http://localhost:${port}/#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, `tutorial-${label}.png`) });
  await browser.close();
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const before = await serve(path.resolve(process.argv[2]), 5201);
  try {
    await shoot(5201, "before");
  } finally {
    before();
  }
  const after = await serve(process.cwd(), 5202);
  try {
    await shoot(5202, "after");
  } finally {
    after();
  }
  console.log("saved", fs.readdirSync(OUT).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
