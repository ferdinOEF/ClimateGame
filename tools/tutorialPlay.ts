/**
 * Plays the Tutorial (Section 15) start to finish in a page, the way a player
 * would: reads the opening card, presses Begin, opens a tile's build cards
 * and picks the card with the biggest number, three times, watches the
 * cyclone, reads the result card and presses "Play Panaji".
 *
 * Shared by the walkthrough (`npm run walkthrough`, which keeps it as a
 * permanent check) and the Section 15 screenshot tool. Every step is checked;
 * a failure is pushed onto `problems` and the run carries on where it can.
 */
import type { Page } from "playwright";
import maya from "../src/data/maya.json";

/** Text the Tutorial and the shell must never show (Section 15): the old economy, meters, eras and growth. */
export const FORBIDDEN_TEXT = /\bcoins?\b|\bmeters?\b|\beras?\b|tiles claimed|maturity|\bmatures?\b|resilience|biodiversity|\bcarbon\b|\bincome\b/i;

export interface TutorialPlayOptions {
  shot: (name: string) => Promise<void>;
  problems: string[];
  log?: (line: string) => void;
  /** Hurries the cyclone (a click, as a player can). Off for the screenshot tool's storm frame. */
  hurry?: boolean;
}

const LINES = maya.tutorial;

/** The page's visible text, for the forbidden-words check. */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function checkWords(page: Page, where: string, problems: string[]): Promise<void> {
  const text = await visibleText(page);
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
  const start = Date.now();
  while (Date.now() - start < 8000) {
    if ((await mayaSays(page)).includes(line.slice(0, 40))) return;
    await page.waitForTimeout(150);
  }
  problems.push(`[${where}] Maya should say "${line}" but says "${await mayaSays(page)}"`);
}

/** The year's best build for the open objective: the row tile whose card shows the most homes. */
async function bestBuild(page: Page): Promise<{ q: number; r: number; elementId: string; homes: number } | null> {
  return page.evaluate(() => {
    const p = (window as unknown as { __panjimForTest?: any }).__panjimForTest;
    if (!p) return null;
    const next = p.run.nextChallenge();
    if (!next) return null;
    let best: { q: number; r: number; elementId: string; homes: number } | null = null;
    for (const job of p.run.prep) {
      if (job.challengeId !== next.id) continue;
      // A row already done is not what the player is asked for now.
      const tiles = new Set<string>(job.tiles ?? []);
      let standing = 0;
      for (const [key, inst] of p.run.state.elements) if (inst.elementId === job.elementId && tiles.has(key)) standing++;
      if (standing - (job.baseline ?? 0) >= job.count) continue;
      for (const key of job.tiles ?? []) {
        const [q, r] = key.split(",").map(Number);
        if (!p.run.state.canBuild({ q, r }, job.elementId)) continue;
        const homes = p.run.homesSavedBy(next, { q, r }, job.elementId) ?? 0;
        if (!best || homes > best.homes) best = { q, r, elementId: job.elementId, homes };
      }
    }
    return best;
  });
}

export async function playTutorial(page: Page, options: TutorialPlayOptions): Promise<boolean> {
  const { shot, problems } = options;
  const log = options.log ?? ((line: string) => console.log(line));

  // 1. The opening card: one line and the forecast cone, nothing else.
  await page.waitForSelector(".brief-card", { timeout: 30000 });
  await page.waitForTimeout(800);
  const brief = (await page.locator(".brief-card").textContent()) ?? "";
  if (!brief.includes("Each build is one year. A cyclone comes in 3 years.")) problems.push(`[tutorial-brief] the card does not open with the line: "${brief.slice(0, 120)}"`);
  if ((await page.locator(".brief-card .brief-feature").count()) === 0) problems.push("[tutorial-brief] no forecast cone on the opening card");
  if ((await page.locator(".brief-card .brief-goals:visible").count()) > 0) problems.push("[tutorial-brief] the card still lists goals");
  await checkWords(page, "tutorial-brief", problems);
  await shot("tutorial-1-brief");

  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(1200);
  const coneAtStart = await page.evaluate(() => Boolean((window as any).__panjimForTest?.coneShown));
  if (!coneAtStart) problems.push("[tutorial-start] the cone is not on the board at the start");
  await waitForMaya(page, LINES.start, "tutorial-start", problems);
  await checkWords(page, "tutorial-start", problems);
  await shot("tutorial-2-start");

  // 2. Three builds, each the biggest number on the cards for the open objective.
  for (let build = 1; build <= 3; build++) {
    const where = `tutorial-build-${build}`;
    const pick = await bestBuild(page);
    if (!pick) {
      problems.push(`[${where}] no objective tile to build on`);
      return false;
    }
    const opened = await page.evaluate(({ q, r }) => (window as any).__openTileForTest(q, r), pick);
    if (!opened) {
      problems.push(`[${where}] the build cards did not open at ${pick.q},${pick.r}`);
      return false;
    }
    await page.waitForTimeout(700);
    if (build === 1) {
      await waitForMaya(page, LINES.cards, where, problems);
      if ((await page.locator(".build-popover .build-card-pill.coach-pulse").count()) === 0) problems.push(`[${where}] the cards' "Protects N homes here" is not pointed at`);
      await checkWords(page, where, problems);
      await shot("tutorial-3-cards");
    }
    const card = page.locator(`.build-popover .build-card[data-element="${pick.elementId}"]`);
    if ((await card.count()) === 0) {
      problems.push(`[${where}] no ${pick.elementId} card`);
      return false;
    }
    await card.first().click();
    log(`tutorial build ${build}: ${pick.elementId} at ${pick.q},${pick.r} (protects ${pick.homes})`);
    if (build === 1) {
      await page.waitForTimeout(1600);
      const coneGone = await page.evaluate(() => !(window as any).__panjimForTest?.coneShown);
      if (!coneGone) problems.push(`[${where}] the cone is still on the board after the first build`);
      await waitForMaya(page, LINES.outline, where, problems);
      await checkWords(page, where, problems);
      await shot("tutorial-4-outline");
    } else if (build === 2) {
      await page.waitForTimeout(1600);
      await waitForMaya(page, LINES.heat, where, problems);
      await checkWords(page, where, problems);
      await shot("tutorial-5-heat");
    }
  }

  // 3. The cyclone, then its one result card.
  // The cyclone itself, once its water is on the board.
  const stormStart = Date.now();
  while (Date.now() - stormStart < 20000 && !(await page.evaluate(() => Boolean((window as any).__panjimForTest?.host.challengeFx.isPlaying())))) await page.waitForTimeout(200);
  await page.waitForTimeout(2200);
  await shot("tutorial-6-cyclone");
  const start = Date.now();
  while (Date.now() - start < 120000) {
    if ((await page.locator(".result-cards:not([hidden]) .result-next").count()) > 0) break;
    if (options.hurry !== false) await page.mouse.click(40, 500);
    await page.waitForTimeout(400);
  }
  if ((await page.locator(".result-cards:not([hidden])").count()) === 0) {
    problems.push("[tutorial-result] no result card after the cyclone");
    return false;
  }
  await page.waitForTimeout(600);
  const card = (await page.locator(".result-cards").textContent()) ?? "";
  for (const want of ["homes saved", "What protected them", "Play Panaji"]) if (!card.includes(want)) problems.push(`[tutorial-result] the card does not say "${want}"`);
  if ((await page.locator(".result-cards .result-stars").count()) === 0) problems.push("[tutorial-result] no stars on the card");
  await checkWords(page, "tutorial-result", problems);
  await shot("tutorial-7-result");
  log(`tutorial result: ${card.replace(/\s+/g, " ").trim().slice(0, 160)}`);

  // 4. Play Panaji: the Tutorial is recorded and Panaji's opening card shows.
  await page.locator(".result-cards .result-next").first().click();
  try {
    await page.waitForFunction(() => location.hash.includes("l01-first-rains") && document.querySelector(".brief-title")?.textContent === "Panaji", undefined, { timeout: 30000 });
  } catch {
    problems.push(`[tutorial-next] "Play Panaji" did not open Panaji (at ${page.url()})`);
    return false;
  }
  const recorded = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.includes("progress")) continue;
      const value = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (value.levels?.["l00-tutorial"]?.completed) return true;
    }
    return false;
  });
  if (!recorded) problems.push("[tutorial-next] the Tutorial was not recorded as completed");
  log("tutorial: played start to finish, on to Panaji");
  return true;
}
