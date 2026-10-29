/**
 * Section 36.3 and 36.6: the browser pass for the music and the build sounds, on the dev server (`?qa=1&noname=1`).
 *
 * Opens Play Panjim, clicks once (the start popup's button: the audio unlock), and checks the music's state through
 * `__audioForTest()` (audioHooks' `audioStateForTest`): full on the board, off while a storm plays, full again on
 * result card 1, soft on the finale card. With `builds=1` (Section 36.4 on) it first builds a seawall and a mangrove
 * through the build cards, as a click would, and checks the two samples asked for. Four screenshots: the board with
 * the music full, mid storm, result card 1, the finale. The mouse moves through the scripted runs, or the idle reset
 * would fire.
 *
 * Usage: npx tsx tools/section36Shots.ts [w=1366] [h=768] [out=docs/qa/section36] [builds=1]
 * Exits 1 on a console error or a failed check.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { glArgs, startDevServer } from "./devServer";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section36");
const BUILDS = args.get("builds") === "1";
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
type AudioState = { unlocked: boolean; context: boolean; enabled: boolean; master: number | null; music?: string; musicPlaying?: boolean; musicHistory?: string[]; samples?: string[] };
const audio = (page: Page): Promise<AudioState> => js<AudioState>(page, "window.__audioForTest()");
const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  console.log(`shot ${name}`);
};

const server = await startDevServer(5236, 120000);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
let wiggle: NodeJS.Timeout | null = null;
try {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  // The dev server has no /api (Vercel functions): the run's posts are answered here, as the server would.
  // The board's rank answer has its real shape (server/handlers.ts getBoard), else the finale reads "undefinedth".
  await context.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const points = Number(url.searchParams.get("points") ?? 0);
    const body = url.pathname === "/api/board" && url.searchParams.has("points") ? { season: "QA", rank: 1, points, tenth: null, above: [], below: [] } : url.pathname === "/api/board" ? { season: "QA", rows: [] } : {};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const sounds: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/sound/")) sounds.push(new URL(r.url()).pathname);
  });
  await page.goto(`${server.url}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  await page.waitForSelector(".brief-cta", { state: "visible", timeout: 60000 });
  await page.waitForTimeout(1500);
  const before = await audio(page);
  check(!before.unlocked && !before.context && sounds.length === 0, `before the first click: no audio context, no sound file fetched (${sounds.length})`);
  check(before.music === "full" && before.musicPlaying === false, `the session is open (music ${before.music}) but nothing plays before the click`);

  // The first click: the start popup's button.
  await page.locator(".brief-cta").click();
  // The mouse keeps moving (on the canvas, away from the HUD), so the 3 minute idle reset never fires.
  let x = 0;
  wiggle = setInterval(() => void page.mouse.move(W / 2 + (x++ % 2) * 6, H / 2).catch(() => {}), 20000);
  await page.waitForFunction(`window.__audioForTest().musicPlaying === true`, undefined, { timeout: 60000 }).catch(() => {});
  const playing = await audio(page);
  check(playing.unlocked && playing.music === "full" && playing.musicPlaying === true, `after the click the music plays at full (${playing.music}, playing ${playing.musicPlaying})`);
  check(sounds.length === 8 && sounds.every((s) => s.endsWith(".ogg")) && sounds[7].includes("farar_far_panjim_loop"), `the eight samples load after the click, the music last: ${sounds.map((s) => s.slice(7)).join(", ")}`);
  await js(page, "window.__panjimForTest.maya.dismiss()");
  await page.waitForTimeout(1000);

  if (BUILDS) {
    // A seawall and a mangrove, through the build cards.
    for (const element of ["seawall", "mangrove"]) {
      const tile = await js<{ q: number; r: number } | null>(page, `window.__panjimForTest.firstBuildable(${JSON.stringify(element)})`);
      check(!!tile, `a free tile for a ${element}`);
      if (!tile) continue;
      await js(page, `window.__openTileForTest(${tile.q}, ${tile.r})`);
      await page.waitForSelector(`.build-card[data-element="${element}"]`, { timeout: 10000 });
      await page.locator(`.build-card[data-element="${element}"]`).click();
      await page.waitForTimeout(2500);
      await js(page, "window.__panjimForTest.maya.dismiss()");
    }
    const built = await audio(page);
    check(
      JSON.stringify(built.samples?.slice(-2)) === JSON.stringify(["build_seawall", "bird_kingfisher"]),
      `the seawall and the mangrove ask for build_seawall and bird_kingfisher: ${built.samples?.join(", ")}`
    );
  }
  await shot(page, "1-board-music-full");

  // The sound switch: off (the master gain to 0, the music and the samples under it), then back on.
  await page.mouse.click(W / 2, 40);
  await page.keyboard.press("s");
  await page.waitForTimeout(800);
  const muted = await audio(page);
  check(muted.enabled === false && muted.master !== null && muted.master < 0.01, `S turns sound off: the master gain goes to 0 (${muted.master})`);
  await page.keyboard.press("s");
  await page.waitForTimeout(800);
  check((await audio(page)).enabled === true, "S turns it back on");

  // A storm: the music goes off while it plays.
  const toResults = js<boolean>(page, `window.__panjimScenarioForTest("to-results")`);
  await page.waitForFunction(`document.querySelector(".storm-playing") !== null`, undefined, { timeout: 120000 });
  await page.waitForTimeout(1200);
  const mid = await audio(page);
  check(mid.music === "off", `mid storm the music is off (${mid.music})`);
  await shot(page, "2-mid-storm");
  check(await toResults, "the storm hands back at its result cards");
  await page.waitForTimeout(3500);
  const card1 = await audio(page);
  check(card1.music === "full", `on result card 1 the music is back at full (${card1.music})`);
  await shot(page, "3-result-card-1");
  for (let i = 0; i < 6 && (await page.locator(".result-cards:not([hidden]) .result-next").count()) > 0; i++) {
    await page.locator(".result-cards:not([hidden]) .result-next").click();
    await page.waitForTimeout(600);
  }

  // The rest of the run, to the finale card: soft.
  check(await js<boolean>(page, `window.__panjimScenarioForTest("finale")`), "the run plays on to its finale card");
  await page.waitForTimeout(3500);
  const finale = await audio(page);
  check(finale.music === "soft" && finale.musicPlaying === true, `on the finale card the music is soft (${finale.music}; ${finale.musicHistory?.join(" ")})`);
  await shot(page, "4-finale");

} finally {
  if (wiggle) clearInterval(wiggle);
  await browser.close();
  server.stop();
}
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
process.exit(failures === 0 ? 0 : 1);
