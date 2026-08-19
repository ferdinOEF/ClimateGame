/**
 * Headless smoke test (Section 10): boots the dev server if needed, loads
 * the build, takes a screenshot every run, and fails on any console error.
 * This is the primary way to verify the render without a human watching an
 * interactive browser pane — run it from the command line any time.
 */
import { chromium } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCREENSHOT_DIR = path.join(ROOT, "tools", "screenshots");
const DEV_PORT = 5183;
const DEV_URL = `http://localhost:${DEV_PORT}`;

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
          else setTimeout(tryOnce, 250);
        });
    };
    tryOnce();
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let devServer: ChildProcess | undefined;
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  devServer = spawn(npmCmd, ["run", "dev", "--", "--port", String(DEV_PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: "pipe",
    shell: true
  });

  const serverLogs: string[] = [];
  devServer.stdout?.on("data", (d) => serverLogs.push(d.toString()));
  devServer.stderr?.on("data", (d) => serverLogs.push(d.toString()));

  try {
    await waitForServer(DEV_URL, 20000);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    const query = process.argv[3] ? `?${process.argv[3]}` : "";
    await page.goto(DEV_URL + query, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas", { timeout: 10000 });
    // Let a few frames render (and any dev autoplace / settle animations finish).
    await page.waitForTimeout(800);

    const label = process.argv[2] ?? "phase0";
    const screenshotPath = path.join(SCREENSHOT_DIR, `${label}.png`);
    await page.screenshot({ path: screenshotPath });

    const canvasInfo = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      return c ? { width: c.width, height: c.height } : null;
    });

    await browser.close();

    console.log(`Screenshot saved: ${screenshotPath}`);
    console.log(`Canvas: ${JSON.stringify(canvasInfo)}`);

    if (consoleErrors.length > 0) {
      console.error("Console errors detected:");
      for (const e of consoleErrors) console.error(` - ${e}`);
      process.exitCode = 1;
    } else {
      console.log("No console errors.");
    }
  } finally {
    devServer?.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
