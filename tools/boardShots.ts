/**
 * Screenshots of the Panaji board in named states, at any resolution: the
 * QA camera for the hazard visuals and the road restyle.
 *
 * Usage:  npx tsx tools/boardShots.ts <out-dir> <shot> [<shot> ...]
 *
 * Each shot is `name@WxH=step;step;...`. A fresh page is opened for every
 * shot (so states never leak between them), Panaji is started, and the
 * steps run in order:
 *   - `s:<scenario>`  a `__panjimScenarioForTest` scenario ("heat-2", "look-close-miramar");
 *   - `osm:off` / `osm:on`  the Street map switch;
 *   - `wait:<ms>`;
 *   - `js:<expression>`  evaluated in the page (awaited).
 * Saves `<out-dir>/<name>-<W>x<H>.jpg` and a grayscale twin, both under
 * docs/qa/. A console error or a failed step fails the run.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 5193;
const [outName, ...shotArgs] = process.argv.slice(2);
const OUT_DIR = path.join(ROOT, "docs", "qa", outName ?? "adhoc");

interface Shot {
  name: string;
  width: number;
  height: number;
  steps: string[];
}

function parse(arg: string): Shot {
  const match = /^([\w-]+)@(\d+)x(\d+)=?(.*)$/.exec(arg);
  if (!match) throw new Error(`bad shot "${arg}" (want name@WxH=step;step)`);
  return { name: match[1], width: Number(match[2]), height: Number(match[3]), steps: match[4] ? match[4].split(";").filter(Boolean) : [] };
}

async function step(page: Page, text: string): Promise<boolean> {
  const [kind, ...rest] = text.split(":");
  const arg = rest.join(":");
  if (kind === "s") return (await page.evaluate(`(async () => window.__panjimScenarioForTest ? await window.__panjimScenarioForTest(${JSON.stringify(arg)}) : false)()`)) as boolean;
  if (kind === "wait") {
    await page.waitForTimeout(Number(arg));
    return true;
  }
  if (kind === "osm") {
    const box = page.locator(".map-layer-toggle input");
    if ((await box.isChecked()) !== (arg === "on")) await box.click();
    return true;
  }
  if (kind === "js") {
    await page.evaluate(`(async () => (${arg}))()`);
    return true;
  }
  throw new Error(`unknown step "${text}"`);
}

async function main(): Promise<void> {
  const shots = shotArgs.map(parse);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await startDevServer(PORT);
  const errors: string[] = [];
  try {
    const browser = await chromium.launch({
      executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    });
    for (const shot of shots) {
      const page = await (await browser.newContext({ viewport: { width: shot.width, height: shot.height } })).newPage();
      page.on("pageerror", (err) => errors.push(`${shot.name}: ${err}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`${shot.name}: ${msg.text()}`);
      });
      await page.goto(`http://localhost:${PORT}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-cta", { timeout: 90000 });
      await page.locator(".brief-cta").first().click();
      await page.waitForTimeout(3500);
      for (const s of shot.steps) {
        if (!(await step(page, s))) errors.push(`${shot.name}: step "${s}" failed`);
      }
      await page.waitForTimeout(1200);
      const file = path.join(OUT_DIR, `${shot.name}-${shot.width}x${shot.height}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 80 });
      await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
      await page.screenshot({ path: file.replace(/\.jpg$/, "-gray.jpg"), type: "jpeg", quality: 70 });
      console.log(`shot: ${path.relative(ROOT, file)} (+ gray)`);
      await page.context().close();
    }
    await browser.close();
  } finally {
    server.stop();
  }
  console.log(`console errors: ${errors.length === 0 ? "none" : ""}`);
  for (const error of errors) console.log(`  ${error}`);
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
