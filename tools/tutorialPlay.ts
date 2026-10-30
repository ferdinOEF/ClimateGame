/**
 * Plays the Tutorial (Section 31) start to finish in a page, the way a player following its nudges would: reads the
 * opening card, presses Begin, and for each of the seven years opens the suggested defence's best pulsing tile and
 * picks its glowing card; watches the cyclone after the fourth build and the river flood after the seventh (hurried
 * with Speed up unless `hurry` is false); reads both result cards and the last card; and presses "Play Panjim".
 *
 * Shared by the walkthrough (`npm run walkthrough`, which keeps it as a permanent check), the Section 15 tool and the
 * Section 31 screenshots. Every step is checked; a failure is pushed onto `problems` and the run carries on where it can.
 */
import type { Page } from "playwright";
import maya from "../src/data/maya.json";

/** Text the Tutorial and the shell must never show (Section 15): the old economy, meters, eras and growth. Section 31: biodiversity shows (the HUD counter). */
export const FORBIDDEN_TEXT = /\bcoins?\b|\bmeters?\b|\beras?\b|tiles claimed|maturity|\bmatures?\b|resilience|\bcarbon\b|\bincome\b/i;

/** Section 31.2: the nudged order. */
export const TUTORIAL_ORDER = ["dune", "sandy_vegetation", "breakwater", "seawall", "mangrove", "khazan", "small_dam"];

export interface TutorialPlayOptions {
  shot: (name: string) => Promise<void>;
  problems: string[];
  log?: (line: string) => void;
  /** Hurries each storm with Speed up (as a player can). Off: the storms play at their own pace (for timing). */
  hurry?: boolean;
  /** Called each year with the caption showing and the menu open (the Section 31 screenshots). */
  onStep?: (step: number, elementId: string) => Promise<void>;
  /** Called once each storm is mid hit. */
  onStorm?: (index: number) => Promise<void>;
  /** Called on each result card, and on the last card (index 2). */
  onCard?: (index: number) => Promise<void>;
}

const LINES = maya.tutorial;

async function checkWords(page: Page, where: string, problems: string[]): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText);
  const match = text.match(FORBIDDEN_TEXT);
  if (match) problems.push(`[${where}] shows "${match[0]}"`);
}

async function mayaSays(page: Page): Promise<string> {
  return page.evaluate(() => {
    const bubble = document.querySelector(".maya-bubble:not([hidden])");
    return bubble ? (bubble.textContent ?? "").replace(/\s+/g, " ").trim() : "";
  });
}

async function waitForMaya(page: Page, line: string, where: string, problems: string[]): Promise<void> {
  const hidden = await page.evaluate(() => Boolean(document.querySelector(".no-maya")));
  if (hidden) return;
  const start = Date.now();
  while (Date.now() - start < 8000) {
    if ((await mayaSays(page)).includes(line.slice(0, 30))) return;
    await page.waitForTimeout(150);
  }
  problems.push(`[${where}] Maya should say "${line}" but says "${await mayaSays(page)}"`);
}

async function until(page: Page, code: string, ms: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await page.evaluate(code)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

export async function playTutorial(page: Page, options: TutorialPlayOptions): Promise<boolean> {
  const { shot, problems } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const hurry = options.hurry !== false;

  // 1. The opening card.
  await page.waitForSelector(".brief-card, .howto-card", { timeout: 30000 });
  await page.waitForTimeout(800);
  const brief = (await page.locator(".brief-card").textContent()) ?? "";
  if (!brief.includes("Each build is one year.")) problems.push(`[tutorial-brief] the card does not open with the line: "${brief.slice(0, 120)}"`);
  if ((await page.locator(".brief-card .brief-feature").count()) === 0) problems.push("[tutorial-brief] no forecast cone on the opening card");
  await checkWords(page, "tutorial-brief", problems);
  await shot("tutorial-1-brief");

  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(1200);
  await waitForMaya(page, LINES.start, "tutorial-start", problems);
  await checkWords(page, "tutorial-start", problems);
  if ((await page.locator(".tutorial-panel .tutorial-check").count()) !== 7) problems.push("[tutorial-start] the checklist does not list the seven defences");
  await shot("tutorial-2-start");

  // 2. Seven builds, each the suggested defence on its best pulsing tile.
  let stormsSeen = 0;
  for (let build = 1; build <= 7; build++) {
    const where = `tutorial-build-${build}`;
    const expected = TUTORIAL_ORDER[build - 1];
    if (!(await until(page, `!window.__panjimForTest.busy && !document.querySelector(".result-cards:not([hidden])")`, 180000))) {
      problems.push(`[${where}] the year never settled`);
      return false;
    }
    // The last caption says "Built" for a moment, then this year's slides in.
    await until(page, `document.querySelector(".tutorial-card")?.getAttribute("data-defence") === "${expected}"`, 5000);
    await page.waitForTimeout(400);
    const caption = await page.evaluate(() => document.querySelector(".tutorial-card")?.getAttribute("data-defence") ?? null);
    if (caption !== expected) problems.push(`[${where}] the caption shows ${caption}, not ${expected}`);
    const count = (await page.locator(".tutorial-count").textContent()) ?? "";
    if (count !== `${build - 1} of 7`) problems.push(`[${where}] the checklist reads "${count}", not "${build - 1} of 7"`);
    const pulsing = await page.evaluate(() => [...((window as any).__objectivePulseForTest?.tiles ?? [])] as string[]);
    if (pulsing.length < 1 || pulsing.length > 3) problems.push(`[${where}] ${pulsing.length} tiles pulse (want 2 or 3, at least 1)`);
    const tile = pulsing[0];
    if (!tile) return false;
    const [q, r] = tile.split(",").map(Number);
    if (!(await page.evaluate(({ q, r }) => (window as any).__openTileForTest(q, r), { q, r }))) {
      problems.push(`[${where}] the build cards did not open at ${tile}`);
      return false;
    }
    await page.waitForTimeout(700);
    const glowing = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".build-popover .build-card.coach-pulse")].map((el) => el.dataset.element));
    if (glowing.length !== 1 || glowing[0] !== expected) problems.push(`[${where}] the glowing card is ${glowing.join(", ") || "none"}, not ${expected}`);
    if (build === 1) await waitForMaya(page, maya.tutorial.cards, where, problems);
    await checkWords(page, where, problems);
    await options.onStep?.(build, expected);
    if (build === 1) await shot("tutorial-3-cards");
    const card = page.locator(`.build-popover .build-card[data-element="${expected}"]`);
    if ((await card.count()) === 0) {
      problems.push(`[${where}] no ${expected} card at ${tile}`);
      return false;
    }
    await card.first().click();
    log(`tutorial build ${build}: ${expected} at ${tile}`);
    // The checklist ticks it.
    await page.waitForTimeout(400);
    if (!(await page.evaluate((id) => document.querySelector(`.tutorial-check[data-defence="${id}"]`)?.classList.contains("done") ?? false, expected))) problems.push(`[${where}] the checklist did not tick ${expected}`);
    if (build === 4) await shot("tutorial-4-checklist");

    // After builds 4 and 7, a storm: watch it (Speed up), then its card(s).
    if (build === 4 || build === 7) {
      const index = stormsSeen++;
      if (!(await until(page, `Boolean(window.__panjimForTest?.host.challengeFx.isPlaying())`, 30000))) problems.push(`[storm-${index + 1}] the storm did not start`);
      await page.waitForTimeout(2200);
      if ((await page.locator(".speed-up:visible").count()) !== 1) problems.push(`[storm-${index + 1}] no Speed up button during the storm`);
      if (index === 0 && (await page.locator(".speed-up.coach-pulse:visible").count()) !== 1) problems.push("[storm-1] Speed up does not pulse in the Tutorial");
      await options.onStorm?.(index);
      await shot(`tutorial-storm-${index + 1}`);
      const start = Date.now();
      while (Date.now() - start < 180000) {
        if ((await page.locator(".result-cards:not([hidden]) .result-next").count()) > 0) break;
        if (hurry && (await page.locator(".speed-up:visible").count()) > 0) await page.locator(".speed-up").click().catch(() => undefined);
        await page.waitForTimeout(400);
      }
      if ((await page.locator(".result-cards:not([hidden])").count()) === 0) {
        problems.push(`[storm-${index + 1}] no result card`);
        return false;
      }
      await page.waitForTimeout(700);
      const text = ((await page.locator(".result-cards").textContent()) ?? "").replace(/\s+/g, " ");
      for (const want of ["homes saved", "What protected your homes"]) if (!text.includes(want)) problems.push(`[storm-${index + 1}] the card does not say "${want}"`);
      const stars = await page.evaluate(() => (document.querySelector(".result-cards:not([hidden]) .result-stars")?.getAttribute("aria-label") ?? "").split(" ")[0]);
      if (stars !== "3") problems.push(`[storm-${index + 1}] ${stars} stars, not 3, following the nudges`);
      await checkWords(page, `storm-${index + 1}-card`, problems);
      await options.onCard?.(index);
      await shot(`tutorial-result-${index + 1}`);
      log(`tutorial storm ${index + 1}: ${text.slice(0, 140)}`);
      if (index === 0) {
        await page.locator(".result-cards .result-next").first().click();
        await page.waitForTimeout(900);
      }
    }
  }

  // 3. The last card: the defences tried, then Play Panjim.
  await page.locator(".result-cards .result-next").first().click();
  await page.waitForTimeout(900);
  const final = ((await page.locator(".result-cards").textContent()) ?? "").replace(/\s+/g, " ");
  if (!final.includes("You tried 7 of 7 defenses")) problems.push(`[tutorial-final] the last card does not say "You tried 7 of 7 defenses": ${final.slice(0, 120)}`);
  for (const want of ["Play Panjim", "Try again", "Back to the menu"]) if (!final.includes(want)) problems.push(`[tutorial-final] no "${want}"`);
  if ((await page.locator(".result-cards .tutorial-final-list li").count()) !== 7) problems.push("[tutorial-final] not seven defences on the last card");
  await options.onCard?.(2);
  await shot("tutorial-final");
  await page.locator(".result-cards .result-next").first().click();
  try {
    await page.waitForFunction(() => location.hash.includes("l01-first-rains") && document.querySelector(".brief-title")?.textContent === "Panjim", undefined, { timeout: 30000 });
  } catch {
    problems.push(`[tutorial-next] "Play Panjim" did not open Panaji (at ${page.url()})`);
    return false;
  }
  // Section 28.2 (owner decision): nothing about progress is saved on the machine, the Tutorial's "done" included.
  const saved = await page.evaluate(() => Object.keys(localStorage).filter((key) => /progress|panjim2050|field-guide|maya-notes/.test(key)));
  if (saved.length > 0) problems.push(`[tutorial-next] progress was saved on the machine: ${saved.join(", ")}`);
  log("tutorial: played start to finish, on to Panaji");
  return true;
}
