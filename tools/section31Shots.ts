/**
 * Section 31's targeted shots and timing (the default QA gate), at one size: the Tutorial played by following its
 * nudges (tools/tutorialPlay.ts), with a shot of each of the seven caption cards with its pulsing tiles and glowing
 * menu card, the checklist at 4 of 7, both storms mid hit, both result cards and the last card. Then "Try again" on
 * the last card restarts the Tutorial (Section 28). Timed: Begin to the last card, with Speed up (as the shots run)
 * and, with TIME_SLOW=1, without it.
 *
 * Usage: npx tsx tools/section31Shots.ts <width> <height> [outDir=docs/qa/section31]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";
import { playTutorial } from "./tutorialPlay";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section31"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });

const server = await startDevServer(Number(process.env.PORT ?? 5491));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: glArgs() });
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};

async function run(hurry: boolean, shoot: boolean): Promise<{ ms: number; problems: string[]; errors: string[] }> {
  const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${server.url}/?qa=1&noname=1#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
  const problems: string[] = [];
  const shot = async (name: string): Promise<void> => {
    if (shoot) await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  };
  let began = 0;
  let ended = 0;
  const ok = await playTutorial(page, {
    problems,
    hurry,
    log: () => undefined,
    shot: async (name) => {
      if (name === "tutorial-2-start") began = Date.now();
      if (["tutorial-4-checklist", "tutorial-final"].includes(name)) await shot(name);
    },
    onStep: async (step, id) => {
      // The caption, the pulsing tiles and the glowing card, the menu open over the board.
      await page.mouse.move(2, H - 2);
      await page.waitForTimeout(600);
      await shot(`step-${step}-${id}`);
    },
    onStorm: async (i) => {
      await shot(`storm-${i + 1}-mid-hit`);
    },
    onCard: async (i) => {
      if (i === 2) ended = Date.now();
      await shot(i === 2 ? "final-card" : `result-${i + 1}`);
    }
  });
  if (!ok) problems.push("the Tutorial did not play to its end");
  await page.close();
  return { ms: ended - began, problems, errors };
}

const fast = await run(true, true);
for (const p of fast.problems) check(false, p);
check(fast.problems.length === 0, "the Tutorial played by its nudges: seven captions, both storms 3 stars, the last card, on to Panjim");
check(fast.errors.length === 0, `console errors: ${fast.errors.length}${fast.errors.length ? ` (${fast.errors.slice(0, 2).join(" | ")})` : ""}`);
console.log(`TIME [${W}x${H}] with Speed up: ${(fast.ms / 60000).toFixed(1)} min (${Math.round(fast.ms / 1000)} s, Begin to the last card; software GL)`);

// Try again on the last card restarts the Tutorial, nothing saved.
{
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`${server.url}/?qa=1&noname=1#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
  const problems: string[] = [];
  // Play to the last card, but press Try again there instead of Play Panjim (the tool's own Play Panjim then finds no
  // card, which is expected here).
  await playTutorial(page, {
    problems,
    log: () => undefined,
    shot: async () => undefined,
    onCard: async (i) => {
      if (i !== 2) return;
      await page.locator(".result-cards .result-retry").first().click();
      await page.waitForTimeout(2500);
    }
  }).catch(() => false);
  const back = await page.evaluate(() => ({ hash: location.hash, brief: document.querySelector(".brief-card") !== null, year: (window as any).__panjimForTest?.run.year }));
  check(back.hash.includes("l00-tutorial") && back.brief && back.year === 2026, `Try again restarts the Tutorial at 2026 with its opening card (${JSON.stringify(back)})`);
  await page.close();
}

if (process.env.TIME_SLOW === "1") {
  const slow = await run(false, false);
  check(slow.problems.length === 0, `played without Speed up${slow.problems.length ? `: ${slow.problems.slice(0, 2).join(" | ")}` : ""}`);
  console.log(`TIME [${W}x${H}] without Speed up: ${(slow.ms / 60000).toFixed(1)} min (${Math.round(slow.ms / 1000)} s; software GL)`);
}

await browser.close();
await server.stop();
console.log(failed === 0 ? `ALL PASS [${W}x${H}]` : `${failed} FAILED [${W}x${H}]`);
process.exit(failed === 0 ? 0 : 1);
