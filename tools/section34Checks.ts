/**
 * Section 34: the review's fixes checked in a browser, on the production build served by `vite preview`
 * (`npx vite preview --port 4173`, or the launch config "khazan-build-preview"). Behaviour, not source text:
 *
 *   - the start popup takes focus on Begin and keeps Tab inside; Enter begins;
 *   - a mouse click on the board, never focused before: the camera does not jump, the board does not take focus, and
 *     the menu that opens is the clicked tile's (the reviewer's B1);
 *   - a click on the open tile again, or on a house, only closes the menu; a click on another buildable tile opens
 *     that tile's menu (M2);
 *   - a second pointer click right after a menu opens builds nothing (a double click);
 *   - the map by keyboard: Tab reaches it, the cursor shows (dark ring) and stays drawn with the mouse resting on the
 *     board (M1), the camera follows the arrows, Enter opens the tile, the objective's card says "Objective", Enter
 *     on a card builds;
 *   - Help opened by keyboard takes focus and Esc closes it;
 *   - zero console errors.
 *
 * Usage: npx tsx tools/section34Checks.ts [width=1366] [height=768] [out=docs/qa/section34/checks] [url=http://localhost:4173]
 * Exits 1 on any failure. Uses the real GPU where there is one (ANGLE D3D11 on Windows).
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("width") ?? 1366);
const H = Number(args.get("height") ?? 768);
const OUT = path.resolve(args.get("out") ?? "docs/qa/section34/checks");
const URL0 = args.get("url") ?? "http://localhost:4173";
fs.mkdirSync(OUT, { recursive: true });
const tag = `${W}x${H}`;
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} [${tag}] ${what}`);
};

const gpu = process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: gpu });
const errors: string[] = [];

async function openGame(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${URL0}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 120000 });
  await page.waitForTimeout(1500);
  return page;
}
const year = (page: Page): Promise<number> => page.evaluate("window.__panjimForTest.run.year") as Promise<number>;
const menuOpen = (page: Page): Promise<boolean> => page.evaluate("(() => { const b = document.querySelector('.popover-backdrop'); return !!b && !b.hidden; })()") as Promise<boolean>;
const active = (page: Page): Promise<string> => page.evaluate("(() => { const a = document.activeElement; return a ? (a.tagName + '.' + (a.className || '')) : ''; })()") as Promise<string>;
const camera = (page: Page): Promise<number[]> => page.evaluate("window.__cameraForTest.position.toArray().map((v) => Math.round(v * 100) / 100)") as Promise<number[]>;
const cards = (page: Page): Promise<string[]> => page.evaluate("[...document.querySelectorAll('.build-popover .build-card:not(.disabled)')].map((c) => c.dataset.element).sort()") as Promise<string[]>;
const cursor = (page: Page): Promise<{ visible: boolean; dark: boolean; pos: number[] }> =>
  page.evaluate("(() => { const t = window.__tileHoverForTest(); return { visible: t.mesh.visible, dark: t.mesh.material.color.getHexString() === '1d2b3a', pos: t.mesh.position.toArray().map((v) => Math.round(v * 100) / 100) }; })()") as Promise<{ visible: boolean; dark: boolean; pos: number[] }>;

/** Buildable tiles (and houses) on screen, away from the edges and the HUD, with their screen points and options. */
async function tilesOnScreen(page: Page): Promise<{ key: string; x: number; y: number; options: string[]; house: boolean }[]> {
  return (await page.evaluate(`(() => { const c = window.__panjimForTest; const run = c.run; const out = [];
    for (const [key, t] of run.state.placed) { const s = c.host.project(t.coord); if (!s || s.x < ${W} * 0.3 || s.x > ${W} * 0.7 || s.y < ${H} * 0.3 || s.y > ${H} * 0.75) continue;
      const el = document.elementFromPoint(s.x, s.y); if (!el || el.tagName !== "CANVAS") continue;
      const inst = run.state.elements.get(key); const house = !!inst && inst.elementId === "house";
      out.push({ key, x: s.x, y: s.y, options: run.state.buildableAt(t.coord).map((o) => o.id).sort(), house }); }
    return out; })()`)) as { key: string; x: number; y: number; options: string[]; house: boolean }[];
}

// ---- 1. The start popup, and the mouse on a board that never had focus ----
{
  const page = await openGame();
  check((await active(page)).includes("brief-cta"), `the start popup puts focus on Begin (${await active(page)})`);
  await page.keyboard.press("Tab");
  check((await page.evaluate("!!document.activeElement?.closest('.brief-card')")) as boolean, "Tab stays inside the start popup");
  await page.mouse.click(10, 10); // a press outside, as a player might, then Begin by mouse
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(2500);
  const tiles = await tilesOnScreen(page);
  const target = tiles.find((t) => t.options.length > 0 && !t.house);
  if (target) {
    const before = await camera(page);
    await page.mouse.move(target.x, target.y, { steps: 3 });
    await page.mouse.down();
    await page.waitForTimeout(60);
    const atPress = await camera(page);
    await page.mouse.up();
    await page.waitForTimeout(700);
    check(JSON.stringify(before) === JSON.stringify(atPress), `a mouse press on the board does not move the camera (${before} then ${atPress})`);
    check(!(await active(page)).startsWith("CANVAS"), `a mouse click does not give the board keyboard focus (${await active(page)})`);
    check(await menuOpen(page), "the click opens a menu");
    check(JSON.stringify(await cards(page)) === JSON.stringify(target.options), `the menu is the clicked tile's ${target.key} (${(await cards(page)).join(", ")}; want ${target.options.join(", ")})`);
    await page.screenshot({ path: path.join(OUT, `mouse-first-click-${tag}.jpg`), type: "jpeg", quality: 75 });
    // The same tile again: it only closes.
    const screen = (await page.evaluate(`window.__panjimForTest.host.project({ q: ${target.key.split(",")[0]}, r: ${target.key.split(",")[1]} })`)) as { x: number; y: number };
    await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(600);
    check(!(await menuOpen(page)), "a click on the open tile again closes its menu (and opens nothing)");
    // From here each step sets the menu's state first (Esc only with a menu open: with nothing open it asks Leave).
    const closeMenu = async (): Promise<void> => {
      if (await menuOpen(page)) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }
    };
    const openTarget = async (): Promise<boolean> => {
      await closeMenu();
      await page.mouse.click(screen.x, screen.y);
      await page.waitForTimeout(700);
      return menuOpen(page);
    };
    const clear = (x: number, y: number): Promise<boolean> => page.evaluate(`!!document.elementFromPoint(${x}, ${y})?.classList.contains("popover-backdrop")`) as Promise<boolean>;
    const around = await tilesOnScreen(page);
    // A house, with a menu open: it only closes.
    if (await openTarget()) {
      const house = (await Promise.all(around.filter((t) => t.house).map(async (t) => ((await clear(t.x, t.y)) ? t : null)))).find(Boolean) ?? null;
      if (house) {
        await page.mouse.click(house.x, house.y);
        await page.waitForTimeout(600);
        check(!(await menuOpen(page)), `with a menu open, a click on a house (${house.key}) only closes it`);
      } else console.log(`INFO [${tag}] no house clear of the open menu for the close check`);
    }
    // Another buildable tile, with a menu open: it opens that tile's menu.
    if (await openTarget()) {
      const other = (await Promise.all(around.filter((t) => t.options.length > 0 && !t.house && t.key !== target.key).map(async (t) => ((await clear(t.x, t.y)) ? t : null)))).find(Boolean) ?? null;
      if (other) {
        await page.mouse.click(other.x, other.y);
        await page.waitForTimeout(800);
        check((await menuOpen(page)) && JSON.stringify(await cards(page)) === JSON.stringify(other.options), `with a menu open, a click on another buildable tile (${other.key}) opens its menu (${(await cards(page)).join(", ")})`);
        await page.screenshot({ path: path.join(OUT, `click-through-${tag}.jpg`), type: "jpeg", quality: 75 });
      } else console.log(`INFO [${tag}] no other buildable tile clear of the open menu`);
    }
    // A double click: the second click lands on the card that opened under the pointer, and must not build.
    await closeMenu();
    const y0 = await year(page);
    await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(120);
    const box = await page.locator(".build-popover .build-card:not(.disabled)").first().boundingBox({ timeout: 3000 }).catch(() => null);
    check(box !== null, "the menu is open 120 ms after the click");
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
    check((await year(page)) === y0, `a pointer click on a card 120 ms after the menu opened builds nothing (year ${y0} to ${await year(page)})`);
    // Waited out, the same card builds.
    if (box && (await menuOpen(page))) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1200);
      check((await year(page)) === y0 + 1, `after the first moment, a click on a card builds (year ${y0} to ${await year(page)})`);
    }
  } else console.log(`INFO [${tag}] no buildable tile in the middle of the screen`);
  await page.close();
}

// ---- 2. The map by keyboard, with the mouse resting on the board ----
{
  const page = await openGame();
  await page.keyboard.press("Enter"); // Begin has focus
  await page.waitForTimeout(2500);
  await page.mouse.move(W * 0.5, H * 0.5, { steps: 3 }); // the mouse rests on the board
  await page.waitForTimeout(400);
  for (let i = 0; i < 14 && !(await active(page)).startsWith("CANVAS"); i++) await page.keyboard.press("Tab");
  check((await active(page)).startsWith("CANVAS"), "Tab reaches the map");
  await page.waitForTimeout(500);
  const c0 = await cursor(page);
  check(c0.visible && c0.dark, `the map's cursor shows as the dark ring (${JSON.stringify(c0)})`);
  const cam0 = await camera(page);
  for (const key of ["ArrowLeft", "ArrowLeft", "ArrowDown"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(900);
  const c1 = await cursor(page);
  check(c1.visible && c1.dark && JSON.stringify(c1.pos) !== JSON.stringify(c0.pos), `with the mouse resting on the board, the arrows move the cursor and it stays drawn (${JSON.stringify(c1)})`);
  check(JSON.stringify(await camera(page)) !== JSON.stringify(cam0), "the camera follows the cursor");
  await page.screenshot({ path: path.join(OUT, `keyboard-cursor-${tag}.jpg`), type: "jpeg", quality: 75 });
  // Back to the objective's tile: Shift+Tab then Tab gives focus back; the cursor keeps its tile. Open it.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  check(await menuOpen(page), "Enter on the cursor opens the tile's build menu");
  const chip = (await page.evaluate("[...document.querySelectorAll('.build-popover .build-card')].filter((c) => c.querySelector('.objective-chip')).map((c) => c.dataset.element)")) as string[];
  console.log(`INFO [${tag}] objective chip on: ${chip.join(", ") || "none (not an objective tile)"}`);
  const focusedCard = (await page.evaluate("document.activeElement?.closest('.build-card')?.dataset.element ?? null")) as string | null;
  check(focusedCard !== null, `the first card has focus (${focusedCard})`);
  const before = await year(page);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  check((await year(page)) === before + 1, `Enter on a card builds it and the year moves on (${before} to ${await year(page)})`);
  // Focus goes back to the map after a build by keyboard.
  check((await active(page)).startsWith("CANVAS"), `after a build by keyboard, focus is back on the map (${await active(page)})`);
  // Help by keyboard.
  await page.focus(".help-button").catch(() => undefined);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  check((await page.evaluate("!!document.activeElement?.closest('.help-card')")) as boolean, "Help opened by keyboard takes focus");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check(!(await page.evaluate("!!document.querySelector('.help-backdrop:not([hidden])')")), "Esc closes Help opened by keyboard");
  await page.close();
}

// ---- 3. The objective's card says so, opened by keyboard on its tile ----
{
  const page = await openGame();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  for (let i = 0; i < 14 && !(await active(page)).startsWith("CANVAS"); i++) await page.keyboard.press("Tab");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter"); // the cursor starts on the objective's first open tile
  await page.waitForTimeout(800);
  const chip = (await page.evaluate("[...document.querySelectorAll('.build-popover .build-card')].filter((c) => c.querySelector('.objective-chip')).map((c) => c.dataset.element)")) as string[];
  check(chip.length === 1, `on a pulsing tile one card says "Objective" (${chip.join(", ")})`);
  await page.screenshot({ path: path.join(OUT, `objective-chip-${tag}.jpg`), type: "jpeg", quality: 75 });
  await page.close();
}

const real = errors.filter((l) => !/GPU stall|WebGL|Automatic fallback/.test(l));
check(real.length === 0, `no console errors or warnings${real.length ? `: ${real.slice(0, 3).join(" | ")}` : ""}`);
await browser.close();
console.log(failures === 0 ? `ALL PASS [${tag}]` : `${failures} FAILED [${tag}]`);
process.exit(failures === 0 ? 0 : 1);
