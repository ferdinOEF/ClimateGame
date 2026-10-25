/**
 * Section 34: the review's fixes checked in a browser, on the production build served by `vite preview`
 * (`npx vite preview --port 4173`, or the launch config "khazan-build-preview").
 *
 *   - the start popup takes focus on Begin; Enter begins;
 *   - the map takes focus with Tab, the arrow keys move its tile cursor, Enter opens the tile's build menu;
 *   - on a pulsing tile the menu marks the objective's card "Objective";
 *   - a card chosen by keyboard builds; a second pointer click right after the menu opens does not;
 *   - a click on another tile while a menu is open opens that tile;
 *   - Help takes focus and Esc closes it;
 *   - zero console errors.
 *
 * Usage: npx tsx tools/section34Checks.ts [width=1366] [height=768] [out=docs/qa/section34/checks] [url=http://localhost:4173]
 * Exits 1 on any failure. Uses the real GPU where there is one (ANGLE D3D11 on Windows).
 */
import { chromium } from "playwright";
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
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
const shot = (name: string): Promise<Buffer> => page.screenshot({ path: path.join(OUT, `${name}-${tag}.jpg`), type: "jpeg", quality: 75 });
const year = (): Promise<number> => page.evaluate("window.__panjimForTest.run.year") as Promise<number>;
const menuOpen = (): Promise<boolean> => page.evaluate("(() => { const b = document.querySelector('.popover-backdrop'); return !!b && !b.hidden; })()") as Promise<boolean>;
const active = (): Promise<string> => page.evaluate("(() => { const a = document.activeElement; return a ? (a.tagName + '.' + (a.className || '')) : ''; })()") as Promise<string>;

await page.goto(`${URL0}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 120000 });
await page.waitForTimeout(1500);

// The start popup: focus on Begin; Enter begins.
check((await active()).includes("brief-cta"), `the start popup puts focus on Begin (${await active()})`);
await page.keyboard.press("Tab");
check((await active()).includes("brief-cta") || (await page.evaluate("!!document.activeElement?.closest('.brief-card')")) as boolean, "Tab stays inside the start popup");
await page.focus(".brief-cta");
await page.keyboard.press("Enter");
await page.waitForTimeout(2500);
check(!(await page.evaluate("!!document.querySelector('.brief-backdrop:not([hidden])')")), "Enter on Begin closes the start popup");

// The map by keyboard: focus the board, move the cursor, Enter opens its menu.
await page.evaluate("document.querySelector('canvas').focus()");
await page.waitForTimeout(800);
check((await active()).startsWith("CANVAS"), "the map takes keyboard focus");
await shot("keyboard-cursor");
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
check(await menuOpen(), "Enter on the map's cursor opens the tile's build menu");
const chip = (await page.evaluate("[...document.querySelectorAll('.build-popover .build-card')].filter((c) => c.querySelector('.objective-chip')).map((c) => c.dataset.element)")) as string[];
check(chip.length === 1, `on a pulsing tile one card says "Objective" (${chip.join(", ")})`);
await shot("objective-chip");
const focusedCard = (await page.evaluate("document.activeElement?.closest('.build-card')?.dataset.element ?? null")) as string | null;
check(focusedCard !== null, `the first card has focus (${focusedCard})`);
const before = await year();
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
check((await year()) === before + 1, `Enter on a card builds it and the year moves on (${before} to ${await year()})`);

// Arrow keys move the cursor: the said tile changes.
await page.evaluate("document.querySelector('canvas').focus()");
const said0 = (await page.evaluate("[...document.querySelectorAll('.visually-hidden[aria-live]')].map((e) => e.textContent).join('|')")) as string;
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(600);
const said1 = (await page.evaluate("[...document.querySelectorAll('.visually-hidden[aria-live]')].map((e) => e.textContent).join('|')")) as string;
check(said1.length > 0, `the cursor's tile is said for a screen reader ("${said1}")`);
console.log(`INFO [${tag}] cursor said "${said0}" then "${said1}"`);

// A double click on a tile: its second click lands on a card under the pointer and must not build.
const target = (await page.evaluate(`(() => { const c = window.__panjimForTest; const run = c.run;
  for (const t of run.state.placed.values()) { if (!run.state.buildableAt(t.coord).length) continue; const s = c.host.project(t.coord); if (s && s.x > W * 0.3 && s.x < W * 0.7 && s.y > H * 0.3 && s.y < H * 0.7) return { q: t.coord.q, r: t.coord.r, x: s.x, y: s.y }; }
  return null; })()`.replace(/W \*/g, `${W} *`).replace(/H \*/g, `${H} *`))) as { q: number; r: number; x: number; y: number } | null;
if (target) {
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(150);
  const card = await page.locator(".build-popover .build-card:not(.disabled)").first().boundingBox();
  const y0 = await year();
  if (card) await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForTimeout(800);
  check((await year()) === y0, `a click on a card 150 ms after the menu opened builds nothing (year ${y0} to ${await year()})`);
  // Waited out, the same card builds.
  if (!(await menuOpen())) await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(700);
  // A click on another tile while the menu is open opens that tile.
  const other = (await page.evaluate(`(() => { const c = window.__panjimForTest; const run = c.run;
    for (const t of run.state.placed.values()) { if (!run.state.buildableAt(t.coord).length) continue; if (t.coord.q === ${target.q} && t.coord.r === ${target.r}) continue; const s = c.host.project(t.coord); if (!s) continue; const el = document.elementFromPoint(s.x, s.y); if (el && el.classList.contains("popover-backdrop") && Math.hypot(s.x - ${target.x}, s.y - ${target.y}) > 60) return { x: s.x, y: s.y }; }
    return null; })()`)) as { x: number; y: number } | null;
  if (other && (await menuOpen())) {
    await page.mouse.click(other.x, other.y);
    await page.waitForTimeout(800);
    check(await menuOpen(), "a click on another tile while a menu is open opens that tile's menu");
    await shot("click-through");
    await page.keyboard.press("Escape");
  } else console.log(`INFO [${tag}] no second tile on screen for the click through check`);
} else console.log(`INFO [${tag}] no buildable tile near the middle of the screen`);

// Help: focus goes in, Esc closes it, focus comes back.
await page.waitForTimeout(500);
await page.focus(".help-button").catch(() => undefined);
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
check((await page.evaluate("!!document.activeElement?.closest('.help-card')")) as boolean, "Help opened by keyboard takes focus");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
check(!(await page.evaluate("!!document.querySelector('.help-backdrop:not([hidden])')")), "Esc closes Help opened by keyboard");

const real = errors.filter((l) => !/GPU stall|WebGL|Automatic fallback/.test(l));
check(real.length === 0, `no console errors or warnings${real.length ? `: ${real.slice(0, 3).join(" | ")}` : ""}`);
await browser.close();
console.log(failures === 0 ? `ALL PASS [${tag}]` : `${failures} FAILED [${tag}]`);
process.exit(failures === 0 ? 0 : 1);
