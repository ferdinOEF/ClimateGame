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
 *   menu -> Play -> email -> the Tutorial, played to its end -> Panaji
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
import { playTutorial } from "./tutorialPlay";
import { qaUrl } from "./qaUrl";

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
    // The container's Chromium when it has one (the bundled headless shell may not match this Playwright).
    const browser = await chromium.launch({
      executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    });
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
    await page.goto(qaUrl(baseUrl), { waitUntil: "domcontentloaded" });
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
    // Section 39.2: the menu shows only Play Panjim (the Tutorial button is
    // hidden by SHOW_TUTORIAL_BUTTON), so the Tutorial is reached by its route.
    if ((await page.locator(".menu-actions button").count()) !== 1) problems.push("[menu] expected one button, Play Panjim");
    await page.evaluate(() => { location.hash = "#/play/l00-tutorial"; });
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

    // ---- 3. the Tutorial, played start to finish (Section 15) -------
    // Three builds through the real build cards, the cyclone, its result
    // card, and "Play Panjim" (tools/tutorialPlay.ts).
    stage = "tutorial";
    await page.waitForSelector("canvas", { timeout: 15000 });
    await playTutorial(page, {
      problems,
      shot: (name) => shot(page, name),
      log: (line) => {
        stage = line.startsWith("tutorial build") ? "tutorial-build" : stage;
        console.log(line);
      }
    });
    stage = "tutorial-next";
    // "Play Panjim" opened Panaji's own card: Begin, so the board's ☰ menu is reachable.
    if (await page.locator(".brief-cta:visible").count()) await page.locator(".brief-cta:visible").first().click();
    await page.waitForTimeout(600);
    // Section 16 review: no state from the Tutorial's run carries over (the game layer is shared), so Panjim's
    // first-build hint is up before its first build.
    await page.waitForTimeout(1500);
    const hint = await page.evaluate(() => { const el = document.querySelector<HTMLElement>(".empty-prompt"); if (!el) return false; const st = getComputedStyle(el); return st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity) > 0.05; });
    const stale = await page.evaluate(() => ["has-built", "storm-hold", "storm-playing"].filter((c) => document.querySelector(`.${c}`)));
    if (!hint || stale.length) problems.push(`[tutorial-next] after the Tutorial, Panjim's hint ${hint ? "shows" : "is hidden"}; stale classes: ${stale.join(", ") || "none"}`);
    else console.log("after the Tutorial: Panjim's first-build hint shows, no stale state classes");

    // ---- 3b. getting out of a level ---------------------------------
    // Two ways out, and they have to agree. Both were broken before this was
    // written: there was no visible exit control in a level at all, and the
    // browser's own Back button left the site entirely because the shell
    // never wrote a history entry. Section 16 B3: the ← Back button is gone;
    // the way out is ☰ → "Leave Panjim", which asks first.
    stage = "in-level-leave";
    const menuButton = page.locator(".hud-panel-settings .hud-panel-button");
    if ((await page.locator(".back-button:visible").count()) > 0) problems.push("[in-level-leave] the ← Back button is still on the board");
    if ((await menuButton.count()) === 0) {
      problems.push("[in-level-leave] no ☰ menu on the board");
    } else {
      await menuButton.first().click();
      await page.waitForTimeout(400);
      await page.locator(".hud-menu-leave").click();
      await page.waitForTimeout(400);
      const title = (await page.locator(".leave-confirm-title").textContent())?.trim();
      if (title !== "Leave Panjim?") problems.push(`[in-level-leave] the confirm reads "${title}", not "Leave Panjim?"`);
      await page.locator(".leave-confirm-leave").click();
      await page.waitForTimeout(600);
      if ((await page.locator(".menu-screen").count()) === 0) {
        problems.push("[in-level-leave] ☰ → Leave Panjim did not return to the menu");
      } else {
        console.log("☰ → Leave Panjim → Leave returns to the menu");
      }
      await shot(page, "after-leave");
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
    // The header picture decodes asynchronously: wait for it, so the shot shows the menu as a player sees it.
    await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>(".menu-art img"); return !img || (img.complete && img.naturalWidth > 0); }, undefined, { timeout: 10000 }).catch(() => problems.push("[browser-back] the menu's header picture did not load"));
    await page.waitForTimeout(300);
    await shot(page, "after-browser-back");

    // ---- 3c. Play Panjim (Section 16.3) --------------------------------
    // Section 39.2: the menu offers exactly Play Panjim; Play Panjim opens the
    // Panaji game view with How to play (noname=1 skips the name card), never the level select.
    stage = "play-panjim";
    await page.goto(qaUrl(baseUrl), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".menu-screen", { timeout: 15000 });
    const menuButtons = (await page.locator(".menu-actions button").allTextContents()).map((t) => t.trim());
    if (JSON.stringify(menuButtons) !== JSON.stringify(["Play Panjim"])) problems.push(`[play-panjim] the menu offers ${JSON.stringify(menuButtons)}, not Play Panjim alone`);
    await clickByText(page, "Play Panjim");
    await page.waitForSelector(".brief-card, .howto-card", { timeout: 15000 });
    if ((await page.locator(".level-grid").count()) > 0) problems.push("[play-panjim] Play Panjim showed the level select");
    if (!page.url().endsWith("#/play/l01-first-rains")) problems.push(`[play-panjim] Play Panjim went to ${page.url()}`);
    const briefCtas = (await page.locator(".brief-cta").allTextContents()).map((t) => t.trim());
    if (!briefCtas.includes("Let's Play!")) problems.push(`[play-panjim] How to play offers ${JSON.stringify(briefCtas)}, not Let's Play!`);
    console.log(`Play Panjim: ${page.url()}, How to play offers ${briefCtas.join(" | ")}`);
    await shot(page, "play-panjim");

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
        // No menu button leads to the level select (Section 16.3): it is reached by its own address.
        await page.goto(`${baseUrl.replace(/#.*$/, "")}/?qa=1&noname=1#/levels`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".level-grid", { timeout: 15000 });

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

        // Section 34: 60 s, not 15: under software GL on a laptop the Panjim board takes longer than 15 s to draw.
        await page.waitForSelector("canvas", { timeout: 60000 });
        await page.waitForSelector(".brief-card, .howto-card", { timeout: 60000 });
        // Section 39.3: Panjim opens on How to play (no title); the Tutorial on its brief.
        const place = (await page.locator(".brief-title:visible").count()) ? (await page.locator(".brief-title:visible").textContent())?.trim() : "How to play";
        await page.locator(".brief-cta:visible").first().click();
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
