/**
 * Plays the game in a headless browser, end to end, and screenshots every
 * stage.
 *
 * `smoke.ts` was written when the whole game was one scene built at import
 * time, so it loads the page and waits for a canvas. That stopped being
 * correct the moment the app grew a menu: there is no canvas until a level
 * starts, and there is now a registration sheet in between. Rather than
 * loosen that script into something that passes without checking anything,
 * this one walks the actual route a player takes —
 *
 *   menu -> Play -> email -> tutorial board -> build on it
 *
 * and then starts every campaign level in turn so each real-world map gets
 * rendered and photographed at least once. It fails on any console error on
 * any screen, which is the part that earns its keep: a map file with a tile
 * the renderer cannot place, or a level pointing at a map id that does not
 * exist, surfaces here rather than in front of a playtester.
 *
 * `npm run walkthrough`. Screenshots land in tools/screenshots/walkthrough/.
 */
import { chromium, type Page } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "tools", "screenshots", "walkthrough");
const DEV_PORT = 5184;

/**
 * Where to point the browser.
 *
 * `--url=https://...` runs the whole walkthrough against an already-deployed
 * site instead of a local dev server, which is how you confirm a deploy
 * actually works rather than merely that the upload finished. Matching asset
 * hashes prove the right files are on the host; they prove nothing about
 * whether the thing runs.
 *
 * Without the flag it boots a dev server and tests the working tree, which is
 * the normal case.
 */
const urlArg = process.argv.find((arg) => arg.startsWith("--url="));
const TARGET_URL = urlArg ? urlArg.slice("--url=".length).replace(/\/+$/, "") : null;

/** Every campaign level, in order. Kept in step with src/data/levels.json by the assertion in `main`. */
const LEVEL_IDS = ["l00-tutorial", "l01-first-rains"];

let shotIndex = 0;
async function shot(page: Page, name: string): Promise<void> {
  shotIndex++;
  const file = path.join(OUT_DIR, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  shot: ${path.relative(ROOT, file)}`);
}

/** The first line of an error's message. Playwright's timeouts carry a multi-line call log, which is useful in a stack trace and noise in a summary list. */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const breakAt = message.search(/[\r\n]/);
  return breakAt === -1 ? message : message.slice(0, breakAt);
}

/** Clicks the button whose visible text contains `text`. Throws with the available labels, which is far more useful than a bare timeout. */
async function clickByText(page: Page, text: string): Promise<void> {
  const button = page.locator("button", { hasText: text }).first();
  if ((await button.count()) === 0) {
    const labels = await page.locator("button").allTextContents();
    throw new Error(`No button matching "${text}". Buttons on screen: ${JSON.stringify(labels)}`);
  }
  await button.click();
}

async function main(): Promise<void> {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Cross-check the list above against the real level data, so this script
  // cannot quietly stop covering a level somebody added.
  const levels = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/levels.json"), "utf8")) as { id: string }[];
  const actual = levels.map((level) => level.id);
  if (JSON.stringify(actual) !== JSON.stringify(LEVEL_IDS)) {
    throw new Error(`LEVEL_IDS is out of date.\n  levels.json: ${JSON.stringify(actual)}\n  this script: ${JSON.stringify(LEVEL_IDS)}`);
  }

  const problems: string[] = [];
  // Against a deployed site there is no server to start, and nothing to tear
  // down afterwards.
  const devServer = TARGET_URL ? null : await startDevServer(DEV_PORT);
  const baseUrl = TARGET_URL ?? `http://localhost:${DEV_PORT}`;
  console.log(`Target: ${baseUrl}${TARGET_URL ? " (deployed)" : " (local dev server)"}
`);

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });

    // Collected per-stage so a failure says WHERE it happened. A bare list of
    // console errors with no screen attached is nearly useless for a map bug,
    // because the message rarely names the map.
    let stage = "boot";
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(`[${stage}] console: ${msg.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`[${stage}] pageerror: ${String(error)}`));

    // ---- 1. the menu ------------------------------------------------
    stage = "menu";
    // `domcontentloaded`, not `networkidle`. With a Firebase project
    // configured, the Firestore and Auth SDKs hold a long-lived connection
    // open from boot, so the network never goes idle and `networkidle` simply
    // times out — which looks exactly like the app failing to start.
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".menu-screen", { timeout: 15000 });
    console.log("menu");
    await shot(page, "menu");

    // ---- 2. Start -> the level (or the registration sheet) ----------
    // The sheet only exists in a build made with VITE_REQUIRE_EMAIL=true (see
    // src/services/features.ts). Which one this is gets read off the page,
    // not this process's environment: the flag can come from `.env.local`,
    // and a `--url` target was built somewhere else entirely.
    stage = "registration";
    const forbidden = /e-?mail|sign[ -]?in|signed in|account/i;
    const menuText = (await page.locator(".menu-screen").textContent()) ?? "";
    // By class, not by label. The primary button is "Tutorial" and starts
    // l00-tutorial in every build (see src/ui/screens/menuModel.ts), but the
    // copy has changed before, and the class is what marks it as the one to
    // press.
    await page.locator(".menu-actions .btn-primary").first().click();
    await page.waitForSelector(".brief-card, .setup-screen", { timeout: 15000 });
    if ((await page.locator(".setup-screen").count()) > 0) {
      console.log("registration gate appeared (build has VITE_REQUIRE_EMAIL=true)");
      await shot(page, "registration-empty");

      // Submit it empty first: the form must mark the field rather than letting
      // a blank registration through.
      await clickByText(page, "Start playing");
      await page.waitForTimeout(150);
      const visibleErrors = await page.locator(".field-error.visible").count();
      if (visibleErrors !== 1) {
        problems.push(`[registration] empty submit flagged ${visibleErrors} fields, expected 1`);
      }
      if (await page.locator(".setup-screen").count() === 0) {
        problems.push("[registration] an empty form was accepted");
      }
      await shot(page, "registration-errors");

      // Now fill it properly.
      await page.locator(".setup-form input").nth(0).fill("pilot@example.com");
      await shot(page, "registration-filled");
      await clickByText(page, "Start playing");
    } else {
      // No email anywhere: the menu must not have mentioned it either.
      if (forbidden.test(menuText)) problems.push(`[menu] mentions email or accounts: "${menuText.match(forbidden)?.[0]}"`);
      console.log("Start went straight to the level — no email sheet");
    }

    // ---- 3. the tutorial board --------------------------------------
    stage = "tutorial";
    await page.waitForSelector("canvas", { timeout: 15000 });
    await page.waitForSelector(".brief-card", { timeout: 10000 });
    await shot(page, "tutorial-brief");
    await clickByText(page, "Begin");
    await page.waitForTimeout(900); // let the settle animations land
    await page.waitForSelector(".tutorial-coach", { timeout: 5000 });
    const coachTitle = await page.locator(".coach-title").textContent();
    console.log(`tutorial coach: "${coachTitle?.trim()}"`);
    await shot(page, "tutorial-coach");

    // Walk the coach's first explanatory step.
    await clickByText(page, "Got it");
    await page.waitForTimeout(200);

    // Step 2 waits for the player to open a tile's menu, and a click is the
    // only thing that satisfies it. Worth driving for real rather than through
    // a hook: opening a popover changes no game state, so it does not reach
    // the HUD refresh the coach is normally driven from, and the step sat
    // there repeating itself until the player happened to build something.
    stage = "tutorial-tile-click";
    const stepBeforeClick = (await page.locator(".coach-step").textContent())?.trim();
    const canvasBox = await page.locator("canvas").boundingBox();
    if (!canvasBox) problems.push("[tutorial-tile-click] no canvas to click");
    else {
      await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape"); // close whatever popover opened
      await page.waitForTimeout(200);
    }
    const stepAfterClick = (await page.locator(".coach-step").textContent())?.trim();
    console.log(`coach: "${stepBeforeClick}" -> "${stepAfterClick}" after a tile click`);
    if (stepBeforeClick === stepAfterClick) {
      problems.push(`[tutorial-tile-click] the coach did not advance past "${stepBeforeClick}" when a tile was clicked`);
    }
    await shot(page, "tutorial-after-tile-click");

    // Now build through the real build path: the test hook places the element
    // and refreshes the HUD exactly as a click would, which is what makes the
    // remaining build steps advance.

    stage = "tutorial-build";
    const built = await page.evaluate(() => {
      const hooks = window as unknown as {
        __buildForTest?: (q: number, r: number, elementId: string) => boolean;
        __levelForTest?: () => { mapId: string };
      };
      if (!hooks.__buildForTest || !hooks.__levelForTest) return null;
      // Tutorial Cove's landmark anchors, from src/data/maps/tutorial.json.
      return {
        mapId: hooks.__levelForTest().mapId,
        dune: hooks.__buildForTest(-2, 0, "dune"),
        mangrove: hooks.__buildForTest(0, 0, "mangrove"),
        house: hooks.__buildForTest(2, -3, "house")
      };
    });
    console.log(`tutorial builds: ${JSON.stringify(built)}`);
    if (!built) problems.push("[tutorial-build] test hooks missing — the session did not expose them");
    else {
      if (built.mapId !== "tutorial") problems.push(`[tutorial-build] expected the tutorial map, got "${built.mapId}"`);
      for (const [elementId, ok] of Object.entries(built)) {
        if (elementId !== "mapId" && ok !== true) {
          problems.push(`[tutorial-build] could not build ${elementId} on the tutorial map`);
        }
      }
    }
    await page.waitForTimeout(900);
    await shot(page, "tutorial-built");

    // ---- 3b. getting out of a level ---------------------------------
    // Two ways out, and they have to agree. Both were broken before this was
    // written: there was no visible exit control in a level at all, and the
    // browser's own Back button left the site entirely because the shell
    // never wrote a history entry.
    stage = "in-level-back-button";
    const backButton = page.locator(".back-button");
    if ((await backButton.count()) === 0) {
      problems.push("[in-level-back-button] no Back control on the board");
    } else {
      await backButton.first().click();
      await page.waitForTimeout(600);
      if ((await page.locator(".menu-screen").count()) === 0) {
        problems.push("[in-level-back-button] Back did not return to the menu");
      } else {
        console.log("in-level Back button returns to the menu");
      }
      await shot(page, "after-back-button");
    }

    stage = "browser-back";
    // Start a level again, then press the browser's own Back.
    await page.locator(".menu-actions .btn-primary").first().click();
    await page.waitForSelector("canvas", { timeout: 15000 });
    await page.waitForTimeout(500);
    const urlInLevel = page.url();

    await page.goBack();
    await page.waitForTimeout(900);

    const stillInApp = page.url().startsWith(baseUrl);
    const backAtMenu = (await page.locator(".menu-screen").count()) > 0;
    console.log(`browser Back: ${urlInLevel} -> ${page.url()} (menu: ${backAtMenu})`);
    if (!stillInApp) {
      problems.push("[browser-back] browser Back left the app entirely");
    } else if (!backAtMenu) {
      problems.push(`[browser-back] browser Back landed on ${page.url()} rather than the menu`);
    }
    await shot(page, "after-browser-back");

    // ---- 4. every campaign map --------------------------------------
    // Unlock the whole campaign so the level list will start any of them,
    // then open each in turn. The point is to render every real-world map
    // once and catch anything that only fails on a particular board.
    stage = "unlock";
    await page.evaluate((ids: string[]) => {
      const levels: Record<string, unknown> = {};
      for (const id of ids) {
        levels[id] = { levelId: id, bestScore: 500, stars: 2, bestTurns: 20, attempts: 1, completed: true };
      }
      localStorage.setItem(
        "root-and-ruin:progress:v1",
        JSON.stringify({ displayName: "Playtest Pilot", levels, achievements: [], schemaVersion: 1 })
      );
    }, LEVEL_IDS);

    for (const levelId of LEVEL_IDS.slice(1)) {
      stage = levelId;
      // Each level is wrapped on its own, so one bad board is recorded and
      // the run carries on to the rest. Aborting the whole walkthrough at the
      // first failure would hide every problem after it — which is precisely
      // backwards for a script whose job is to survey all nine maps.
      try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".menu-screen", { timeout: 15000 });
        await clickByText(page, "Choose a level");
        await page.waitForSelector(".level-grid", { timeout: 10000 });

        // Nothing should be padlocked while the campaign is open for
        // playtesting (`ALL_LEVELS_UNLOCKED`). Checked on every pass rather
        // than once, because a locked card is not clickable and the failure
        // would otherwise surface as a confusing click timeout.
        const lockedCards = await page.locator(".level-card.locked").count();
        if (lockedCards > 0) {
          problems.push(`[${levelId}] ${lockedCards} level cards are locked, but the campaign should be open`);
        }

        // Level cards are in campaign order, so the card index is the level
        // index. Clicking by name would break on two levels sharing a word.
        const index = LEVEL_IDS.indexOf(levelId);
        await page.locator(".level-card").nth(index).click();

        await page.waitForSelector("canvas", { timeout: 15000 });
        await page.waitForSelector(".brief-card", { timeout: 15000 });
        const place = (await page.locator(".brief-title").textContent())?.trim();
        await clickByText(page, "Begin");
        await page.waitForTimeout(1100);

        const board = await page.evaluate(() => {
          const hooks = window as unknown as { __levelForTest?: () => { id: string; mapId: string } };
          return hooks.__levelForTest ? hooks.__levelForTest() : null;
        });
        const labelCount = await page.locator(".map-label").count();
        // Monuments are instanced inside the WebGL scene, so they cannot be
        // counted from the DOM. The scene graph names each pool
        // `monument-<kind>`, which is enough to confirm they were built and
        // how many instances each holds.
        const monuments = await page.evaluate(() => {
          const hooks = window as unknown as { __monumentsForTest?: () => Record<string, number> };
          return hooks.__monumentsForTest ? hooks.__monumentsForTest() : null;
        });
        const monumentTotal = monuments ? Object.values(monuments).reduce((a, b) => a + b, 0) : 0;
        console.log(
          `${levelId}: "${place}" on map "${board?.mapId}", ${labelCount} place labels, ${monumentTotal} monuments`
        );
        if (board?.mapId === "panaji" && monumentTotal !== 16) {
          problems.push(`[${levelId}] expected 16 monuments on Panaji, found ${monumentTotal}`);
        }
        if (!board) problems.push(`[${levelId}] no level test hook — the session never started`);
        else if (board.id !== levelId) problems.push(`[${levelId}] started "${board.id}" instead`);
        if (labelCount === 0) problems.push(`[${levelId}] no place labels on the board`);
        await shot(page, `level-${levelId}`);
      } catch (error) {
        problems.push(`[${levelId}] ${error instanceof Error ? firstLine(error) : String(error)}`);
        await shot(page, `level-${levelId}-FAILED`);
      }
    }

    await browser.close();
  } catch (error) {
    // Recorded rather than rethrown, so the problem list below is printed
    // either way. A stack trace with no list of what already passed makes a
    // mid-run failure much harder to place than it needs to be.
    problems.push(`[fatal] ${error instanceof Error ? firstLine(error) : String(error)}`);
  } finally {
    devServer?.stop();
  }

  console.log("");
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s):`);
    for (const problem of problems) console.error(` - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`Walkthrough clean: ${shotIndex} screenshots, no console errors.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
