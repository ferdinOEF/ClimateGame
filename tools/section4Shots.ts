/**
 * Section 4 screenshots: a human-paced playthrough of Panaji's three storms.
 *
 * Usage:  npx tsx tools/section4Shots.ts [outDir] [size]
 *   outDir defaults to docs/qa/section4; size to 1920x1080.
 *
 * For each storm: the warning five quarters out (the forecast cone wide at
 * sea, the heat on the town), the player's answer (defences beside the red
 * houses, through the real build path), the last quarter (the cone narrowed
 * to its bounded jitter), the storm at its height, and the Aftermath. Then
 * the ending. A `-gray` twin of each cone shot is written for the grayscale
 * check. Prints what each step built and saved. Exits 1 on any console error.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section4");
const [W, H] = (process.argv[3] ?? "1920x1080").split("x").map(Number);
const PORT = Number(process.env.SHOTS_PORT ?? 5293);

async function shot(page: Page, name: string, gray = false): Promise<void> {
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 80 });
  if (!gray) return;
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 70 });
  await page.evaluate(() => {
    for (const style of Array.from(document.querySelectorAll("style"))) if (style.textContent?.includes("grayscale(1) !important")) style.remove();
  });
}

const scenario = (page: Page, name: string): Promise<boolean> => page.evaluate(`window.__panjimScenarioForTest(${JSON.stringify(name)})`) as Promise<boolean>;

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const errors: string[] = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${server.url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card", { timeout: 120000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(2500);
    await page.evaluate("window.__panjimForTest && (window.__panjimForTest.maya.holdLines = true)");
    await scenario(page, "quality-medium");
    for (let storm = 1; storm <= 3; storm++) {
      const tag = `s4-storm${storm}`;
      const info = await page.evaluate(
        "(() => { const run = window.__panjimForTest.run; const c = run.nextChallenge(); return { id: c.id, kind: c.kind, name: c.name }; })()"
      );
      console.log(`${tag}: ${JSON.stringify(info)}`);
      await scenario(page, "heat-5");
      await page.waitForTimeout(2500);
      const wide = await page.evaluate("window.__landfallConeForTest ? window.__landfallConeForTest.tileCount : -1");
      await shot(page, `${tag}-1-warning`, storm === 1);
      const built = await scenario(page, "defend-risk");
      await page.waitForTimeout(1500);
      await shot(page, `${tag}-2-defended`);
      await scenario(page, "heat-1");
      await page.waitForTimeout(2500);
      const narrow = await page.evaluate("window.__landfallConeForTest ? window.__landfallConeForTest.tileCount : -1");
      await shot(page, `${tag}-3-last-quarter`, storm === 1);
      console.log(`  cone tiles at sea: ${wide} five quarters out, ${narrow} on the last quarter; defended: ${built}`);
      await scenario(page, "storm-14");
      await shot(page, `${tag}-4-storm`);
      await scenario(page, "storm-release");
      // Hurry the storm along as a player's click does, then read the Aftermath.
      for (let i = 0; i < 600 && !(await page.locator(".aftermath-continue").isVisible().catch(() => false)); i++) {
        await page.evaluate('document.dispatchEvent(new PointerEvent("pointerdown"))');
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(2000);
      await shot(page, `${tag}-5-aftermath`);
      const outcome = await page.evaluate(
        `(() => { const o = window.__panjimForTest.run.outcomes.get(${JSON.stringify((info as { id: string }).id)}); return o && { saved: o.housesSaved, total: o.housesTotal, stars: o.stars }; })()`
      );
      console.log(`  outcome: ${JSON.stringify(outcome)}`);
      await page.locator(".aftermath-continue").click();
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(4000);
    await shot(page, "s4-ending");
  } finally {
    await browser.close();
    server.stop();
  }
  if (errors.length > 0) {
    console.error(`Console errors:\n${errors.join("\n")}`);
    process.exit(1);
  }
  console.log("No console errors.");
}

void main();
