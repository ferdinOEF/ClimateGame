/**
 * Headless smoke test: boots the dev server, loads the app, screenshots it,
 * and fails on any console error.
 *
 * SCOPE, SINCE IT NARROWED
 *
 * This was written when the whole game was one scene built at import time, so
 * loading the page WAS loading the board. It is not any more: the app opens on
 * a menu, there is a registration sheet behind Start, and no canvas exists
 * until a level begins. Rather than quietly pass by waiting for something that
 * no longer appears on the first screen, this now does the smaller job
 * honestly — "does the app boot clean" — and drives a board only when asked.
 *
 * For the whole route a player takes, and every map rendered in turn, use
 * `npm run walkthrough` (tools/walkthrough.ts). That is the one to reach for
 * when something is actually broken.
 *
 * Usage:
 *   npm run smoke                      boot the app, screenshot the menu
 *   npm run smoke -- mylabel           the same, under a chosen screenshot name
 *   npm run smoke -- mylabel play      also start the first level and shoot the board
 *   npm run smoke -- mylabel play simpan   ...and exercise a drag-pan and wheel-zoom first
 */
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCREENSHOT_DIR = path.join(ROOT, "tools", "screenshots");
const DEV_PORT = 5183;
const DEV_URL = `http://localhost:${DEV_PORT}`;

async function main(): Promise<void> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const devServer = await startDevServer(DEV_PORT);

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    // `domcontentloaded`, not `networkidle`: with a Firebase project
    // configured the SDKs hold a connection open from boot, so the network
    // never goes idle and `networkidle` just times out.
    await page.goto(DEV_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".menu-screen", { timeout: 15000 });

    // "play" starts the first level, which is the only way to get a board on
    // screen now. The registration sheet is seeded rather than filled in, so
    // this stays a smoke test of the RENDERER and does not quietly become a
    // second, worse copy of the walkthrough's form check.
    if (process.argv[3] === "play") {
      await page.evaluate(() => {
        localStorage.setItem(
          "root-and-ruin:player:v1",
          JSON.stringify({
            declaredEmail: "smoke@example.com",
            registeredAt: new Date().toISOString(),
            schemaVersion: 2
          })
        );
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".menu-screen", { timeout: 15000 });
      await page.locator(".menu-actions .btn-primary").first().click();
      await page.waitForSelector("canvas", { timeout: 15000 });
      await page.locator("button", { hasText: "Begin" }).first().click();
    }

    // Let a few frames render (and any settle animations finish).
    await page.waitForTimeout(800);

    // Tool-only flag (not read by the app): simulate a drag-pan + wheel-zoom
    // to verify Bucket A's camera controls, since there's no other headless
    // way to exercise pointer/wheel-driven camera movement.
    if (process.argv[4] === "simpan") {
      await page.mouse.move(760, 500);
      await page.mouse.down();
      await page.mouse.move(500, 300, { steps: 12 });
      await page.mouse.up();
      await page.mouse.wheel(0, -400); // zoom in
      await page.waitForTimeout(200);
    }

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
    devServer.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
