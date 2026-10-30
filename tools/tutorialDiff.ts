/**
 * The Tutorial, before and after a change: the same steps on two builds, the
 * screenshots compared pixel by pixel, and the visible text compared exactly.
 *
 * Usage:  npx tsx tools/tutorialDiff.ts <pre-change-worktree> [outDir]
 *         (outDir defaults to docs/qa/tutorial-diff)
 *
 * The pre-change build is a worktree of the safety tag (`git worktree add
 * <dir> pre-section-N`, with node_modules linked in). Each build is served by
 * its own Vite. At 1920x1080, both builds walk:
 *   brief → Begin (coach step 1) → Got it (step 2) → a tile clicked (step 3)
 *   → the build menu on a beach tile → the How to Play card.
 * For each step: the share of pixels that differ by more than 24/255 (the
 * board's water and walkers move, so a little always does), a magenta diff
 * image, and whether the page's text, the build menu's text and the HUD's
 * text are identical. Text must be identical; pixels are reported.
 */
import { chromium, type Browser, type Page } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[3] ?? "docs/qa/tutorial-diff");
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

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

interface Step {
  name: string;
  text: string;
}

/** The text that says what the Tutorial shows: the page's own words, with the board's moving parts left out. */
async function visible(page: Page): Promise<string> {
  return (await page.evaluate(`document.body.innerText`)) as string;
}

async function walk(browser: Browser, port: number, label: string): Promise<Step[]> {
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage();
  const steps: Step[] = [];
  const snap = async (name: string): Promise<void> => {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `${name}-${label}.png`) });
    steps.push({ name, text: await visible(page) });
  };
  await page.goto(`http://localhost:${port}/?qa=1&noname=1#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
  await page.waitForTimeout(3000);
  await snap("1-brief");
  await page.locator(".brief-cta").first().click();
  await page.waitForSelector(".tutorial-coach", { timeout: 20000 });
  await page.waitForTimeout(2500);
  await snap("2-coach-step1");
  await page.getByText("Got it", { exact: true }).first().click();
  await snap("3-coach-step2");
  const canvas = await page.locator("canvas").first().boundingBox();
  if (canvas) await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await snap("4-tile-clicked");
  await page.mouse.click(5, 540);
  await page.waitForTimeout(500);
  await page.locator(".help-button").click();
  await snap("5-how-to-play");
  await page.close();
  return steps;
}

async function diff(browser: Browser, name: string): Promise<number> {
  const page = await browser.newPage();
  const a = fs.readFileSync(path.join(OUT, `${name}-before.png`)).toString("base64");
  const b = fs.readFileSync(path.join(OUT, `${name}-after.png`)).toString("base64");
  const result = (await page.evaluate(`(async () => {
    const load = (b64) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.src = "data:image/png;base64," + b64; });
    const [ia, ib] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
    const c = document.createElement("canvas"); c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(ia, 0, 0); const da = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.drawImage(ib, 0, 0); const db = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db.data[i]), Math.abs(da[i + 1] - db.data[i + 1]), Math.abs(da[i + 2] - db.data[i + 2]));
      if (d > 24) { n++; db.data[i] = 255; db.data[i + 1] = 0; db.data[i + 2] = 255; }
    }
    ctx.putImageData(db, 0, 0);
    return { share: n / (da.length / 4), png: c.toDataURL("image/png") };
  })()`)) as { share: number; png: string };
  fs.writeFileSync(path.join(OUT, `${name}-diff.png`), Buffer.from(result.png.split(",")[1], "base64"));
  await page.close();
  return result.share;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ARGS });
  const lines: string[] = [];
  let textChanged = 0;
  try {
    const stopBefore = await serve(path.resolve(process.argv[2]), 5221);
    let before: Step[];
    try {
      before = await walk(browser, 5221, "before");
    } finally {
      stopBefore();
    }
    const stopAfter = await serve(process.cwd(), 5222);
    let after: Step[];
    try {
      after = await walk(browser, 5222, "after");
    } finally {
      stopAfter();
    }
    for (let i = 0; i < before.length; i++) {
      const share = await diff(browser, before[i].name);
      const same = before[i].text === after[i].text;
      if (!same) textChanged++;
      lines.push(`${before[i].name}: text ${same ? "identical" : "DIFFERS"}; ${(share * 100).toFixed(3)}% of pixels differ by more than 24/255`);
    }
  } finally {
    await browser.close();
  }
  for (const line of lines) console.log(line);
  fs.writeFileSync(path.join(OUT, "diff.txt"), lines.join("\n") + "\n");
  process.exit(textChanged > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
