/**
 * Section 1f: the minimal HUD. Two panels, each shut to a small button.
 *
 * Usage:  npx tsx tools/section1fChecks.ts [outDir]   (outDir defaults to docs/qa/section1f)
 *
 * On Panaji (software GL):
 *   - at 1366x768, 1920x1080 and 2560x1440: shut on load, Status open,
 *     Settings open, both shut again (screenshots, each with a -gray copy);
 *   - both buttons: 36 px or more, no text or number, the right accessible
 *     names, aria-expanded, a tooltip only on hover and focus;
 *   - everything in the panels is out of the way while they are shut;
 *   - the keyboard: Tab reaches both buttons, Enter and Space open, Esc closes
 *     (and returns focus), R, M and S work shut and open; one panel at a time;
 *     a press on the map closes an open panel;
 *   - axe-core, shut and with each panel open;
 *   - the danger mark: shown for a storm warning, and for a fall in Resilience
 *     until the panel is opened; it has a shape and a ring (a grayscale shot);
 *   - the coin jar's gain floats beside the shut Status button;
 *   - the Tutorial still loads, with its HUD as it was;
 *   - zero console errors.
 * Exits 1 if any check fails.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section1f");
const PORT = Number(process.env.CHECK_PORT ?? 5303);
let failed = 0;
const lines: string[] = [];
const errors: string[] = [];

function check(ok: boolean, what: string): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${what}`;
  lines.push(line);
  console.log(line);
}

async function open(browser: Browser, url: string, w: number, h: number): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${w}x${h}: ${m.text()}`);
  });
  await page.goto(`${url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".brief-card", { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator(".brief-cta").first().click();
  await page.waitForTimeout(3500);
  await page.evaluate("window.__panjimForTest.maya.holdLines = true; window.__panjimForTest.maya.withdraw(function () { return true; }); window.__panjimForTest.maya.dismiss()");
  await page.waitForTimeout(800);
  return page;
}

/** Waits for an opening panel to finish growing (under software GL its 180 ms takes a few frames). */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(`Array.from(document.querySelectorAll(".hud-panel-body")).every(function (b) { return b.getAnimations().length === 0; })`, undefined, { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(300);
}

async function shot(page: Page, name: string): Promise<void> {
  await settled(page);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 85 });
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 75 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
}

const status = (page: Page) => page.locator(".hud-panel-status .hud-panel-button");
const settings = (page: Page) => page.locator(".hud-panel-settings .hud-panel-button");
const isOpen = (page: Page, which: "status" | "settings"): Promise<boolean> => page.evaluate(`!document.querySelector(".hud-panel-${which} .hud-panel-body").hidden`) as Promise<boolean>;
const shown = (page: Page, selector: string): Promise<boolean> => page.evaluate(`(function () { var el = document.querySelector(${JSON.stringify(selector)}); return Boolean(el) && el.getClientRects().length > 0; })()`) as Promise<boolean>;
const pressed = (page: Page, selector: string): Promise<string | null> => page.evaluate(`(document.querySelector(${JSON.stringify(selector)}) || {getAttribute: function () { return null; }}).getAttribute("aria-pressed")`) as Promise<string | null>;

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = await page.evaluate<string[]>(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
  })()`);
  check(found.length === 0, `axe-core, ${label}: ${found.length ? found.join(", ") : "no serious or critical violations"}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    // ---- Screenshots at three sizes ---------------------------------------------------------
    for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]] as [number, number][]) {
      const tag = `${w}x${h}`;
      const page = await open(browser, server.url, w, h);
      await shot(page, `shut-${tag}`);
      await status(page).click();
      await page.waitForTimeout(700);
      await shot(page, `status-open-${tag}`);
      await settings(page).click();
      await page.waitForTimeout(700);
      check((await isOpen(page, "settings")) && !(await isOpen(page, "status")), `${tag}: opening Settings closes Status`);
      await shot(page, `settings-open-${tag}`);
      await settings(page).click();
      await page.waitForTimeout(500);
      check(!(await isOpen(page, "settings")) && !(await isOpen(page, "status")), `${tag}: both shut again`);
      await shot(page, `both-shut-${tag}`);
      if (w === 1920) {
        // ---- The buttons ----------------------------------------------------------------------
        for (const [which, name] of [["status", "Status"], ["settings", "Settings"]] as const) {
          const btn = page.locator(`.hud-panel-${which} .hud-panel-button`);
          const box = (await btn.boundingBox())!;
          check(box.width >= 36 && box.height >= 36, `${name}: button ${box.width} x ${box.height} px (36 or more)`);
          check((await btn.getAttribute("aria-label")) === name, `${name}: accessible name "${await btn.getAttribute("aria-label")}"`);
          check((await btn.getAttribute("aria-expanded")) === "false", `${name}: aria-expanded false while shut`);
          check(((await btn.textContent()) ?? "").trim() === "", `${name}: no text and no number on the shut button`);
          const root = (await page.locator(`.hud-panel-${which}`).boundingBox())!;
          check(root.width <= 48 && root.height <= 48, `${name}: the shut panel is just its button (${root.width} x ${root.height})`);
        }
        const tooltip = async (which: string): Promise<number> => Number(await page.evaluate(`getComputedStyle(document.querySelector(".hud-panel-${which} .hud-panel-button"), "::before").opacity`));
        check((await tooltip("status")) === 0, "the tooltip is hidden until hover or focus");
        await status(page).hover();
        // Under software GL the 120 ms fade takes a few frames: wait for it.
        await page.waitForFunction(`getComputedStyle(document.querySelector(".hud-panel-status .hud-panel-button"), "::before").opacity === "1"`, undefined, { timeout: 15000 }).catch(() => undefined);
        check((await tooltip("status")) === 1, "the tooltip shows on hover");
        await page.mouse.move(600, 600);
        // ---- Out of the way while shut ----------------------------------------------------------
        for (const selector of [".instrument-cluster", ".coin-jar", ".field-guide-button", ".panjim-toggles", ".risk-toggle", ".maya-toggle", ".sound-toggle", ".quality-control"]) {
          check(!(await shown(page, selector)), `shut: ${selector} is out of the way`);
        }
        // ---- The keyboard ---------------------------------------------------------------------------
        const reached = new Set<string>();
        await page.evaluate("document.activeElement && document.activeElement.blur()");
        for (let i = 0; i < 80 && reached.size < 2; i++) {
          await page.keyboard.press("Tab");
          const name = (await page.evaluate(`(function () { var e = document.activeElement; return e && e.classList.contains("hud-panel-button") ? e.getAttribute("aria-label") : ""; })()`)) as string;
          if (name) reached.add(name);
        }
        check(reached.has("Status") && reached.has("Settings"), `Tab reaches both buttons (${[...reached].join(", ")})`);
        await status(page).focus();
        const ring = await page.evaluate(`(function () { var s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; })()`);
        check(ring === true, "a visible focus ring on the focused button");
        await page.keyboard.press("Enter");
        check(await isOpen(page, "status"), "Enter opens Status");
        check((await status(page).getAttribute("aria-expanded")) === "true", "aria-expanded true while open");
        await page.keyboard.press("Escape");
        check(!(await isOpen(page, "status")), "Esc closes it");
        check(await page.evaluate(`document.activeElement && document.activeElement.classList.contains("hud-panel-button")`), "focus is back on the button");
        await settings(page).focus();
        await page.keyboard.press("Space");
        check(await isOpen(page, "settings"), "Space opens Settings");
        await page.keyboard.press("Escape");
        check(!(await isOpen(page, "settings")), "Esc closes Settings");
        // R, M and S, with both panels shut, Status open and Settings open.
        for (const state of ["both shut", "Status open", "Settings open"]) {
          if (state === "Status open") await status(page).click();
          if (state === "Settings open") await settings(page).click();
          for (const [key, selector] of [["r", ".risk-toggle"], ["m", ".maya-toggle"], ["s", ".sound-toggle"]] as const) {
            const before = await pressed(page, selector);
            await page.keyboard.press(key);
            await page.waitForTimeout(120);
            const after = await pressed(page, selector);
            await page.keyboard.press(key);
            await page.waitForTimeout(120);
            check(before !== null && before !== after && (await pressed(page, selector)) === before, `${key.toUpperCase()} toggles ${selector} with ${state}`);
          }
        }
        // A press on the map closes an open panel.
        check(await isOpen(page, "settings"), "Settings is open before the map is pressed");
        await page.mouse.click(960, 600);
        await page.waitForTimeout(300);
        check(!(await isOpen(page, "settings")), "a press on the map closes the open panel");
        // (The press may have opened the build menu; Esc closes that, but Esc with nothing open is the level's quit key.)
        if ((await page.locator(".build-popover:not([hidden])").count()) > 0) await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        // ---- axe ----------------------------------------------------------------------------------------
        await axe(page, "both shut");
        await status(page).click();
        await page.waitForTimeout(300);
        await axe(page, "Status open");
        await settings(page).click();
        await page.waitForTimeout(300);
        await axe(page, "Settings open");
        await settings(page).click();
        // ---- The coin jar's gain floats beside the shut button -----------------------------------------------
        await page.evaluate(`(function () { var p = window.__panjimForTest; p.jar.render(p.run.jar + 40, 100); })()`);
        await page.waitForTimeout(400);
        const pop = await page.evaluate(`(function () { var el = document.querySelector(".hud-panel-status .hud-panel-pop"); if (!el) return null; var r = el.getBoundingClientRect(), b = document.querySelector(".hud-panel-status .hud-panel-button").getBoundingClientRect(); return { text: el.textContent, right: r.left >= b.right - 1, y: Math.abs((r.top + r.height / 2) - (b.top + b.height / 2)) < 30 }; })()`) as { text: string; right: boolean; y: boolean } | null;
        check(pop !== null && /^\+\d+$/.test(pop.text) && pop.right && pop.y, `the jar's gain floats beside the shut Status button (${JSON.stringify(pop)})`);
        await page.screenshot({ path: path.join(OUT, "gain-pop-1920x1080.jpg"), type: "jpeg", quality: 85, clip: { x: 0, y: 0, width: 400, height: 120 } });
        await page.waitForTimeout(2200);
        check((await page.locator(".hud-panel-pop").count()) === 0, "and it is gone again");
      }
      await page.context().close();
    }

    // ---- The danger mark ---------------------------------------------------------------------------------------
    const danger = await open(browser, server.url, 1920, 1080);
    const dot = async (): Promise<boolean> => (await danger.locator(".hud-panel-danger:not([hidden])").count()) === 1;
    check(!(await dot()), "no danger mark on a calm load");
    // A fall in Resilience, no storm in sight.
    await danger.evaluate(`(function () { var p = window.__panjimForTest; p.host.state.resilience = Math.max(0, p.host.state.resilience - 6); })()`);
    await danger.waitForTimeout(3500);
    check(await dot(), "a fall in Resilience shows the danger mark on the shut Status button");
    check((await status(danger).getAttribute("aria-label")) === "Status: danger", `its accessible name says so ("${await status(danger).getAttribute("aria-label")}")`);
    await danger.screenshot({ path: path.join(OUT, "danger-resilience-1920x1080.jpg"), type: "jpeg", quality: 90, clip: { x: 0, y: 0, width: 220, height: 100 } });
    await danger.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
    await danger.screenshot({ path: path.join(OUT, "danger-resilience-1920x1080-gray.jpg"), type: "jpeg", quality: 90, clip: { x: 0, y: 0, width: 220, height: 100 } });
    await danger.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
    const diamond = await danger.evaluate(`(function () { var s = getComputedStyle(document.querySelector(".hud-panel-danger")); return { transform: s.transform !== "none", ring: s.borderTopStyle === "solid" && parseFloat(s.borderTopWidth) >= 2 }; })()`) as { transform: boolean; ring: boolean };
    check(diamond.transform && diamond.ring, "the mark is a ringed diamond, not only a colour");
    await status(danger).click();
    await danger.waitForTimeout(600);
    await status(danger).click();
    await danger.waitForTimeout(3500);
    check(!(await dot()), "opening Status marks the fall as seen: the mark is gone");
    // A storm warning: heat-3 stops the clock three quarters before the next storm.
    check(Boolean(await danger.evaluate(`window.__panjimScenarioForTest("heat-3")`)), "reached a storm warning (heat-3)");
    await danger.waitForTimeout(3500);
    check(await dot(), "a storm warning shows the danger mark");
    await status(danger).click();
    await danger.waitForTimeout(600);
    await status(danger).click();
    await danger.waitForTimeout(3500);
    check(await dot(), "opening the panel does not hide a warning that is still up");
    await shot(danger, "danger-warning-1920x1080");
    await danger.context().close();

    // ---- The Tutorial -----------------------------------------------------------------------------------------------
    const tut = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    tut.on("pageerror", (e) => errors.push(`tutorial: ${e.message}`));
    tut.on("console", (m) => {
      if (m.type() === "error") errors.push(`tutorial: ${m.text()}`);
    });
    await tut.goto(`${server.url}/?qa=1#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
    await tut.waitForSelector(".brief-card", { timeout: 120000 });
    await tut.locator(".brief-cta").first().click();
    await tut.waitForTimeout(2500);
    check((await tut.locator(".tutorial-coach").count()) === 1, "the Tutorial loads with its coach");
    check((await tut.locator(".hud-panel").count()) === 0 && (await shown(tut, ".instrument-cluster")), "the Tutorial's HUD is as it was (no panels, its own cluster)");
    await tut.screenshot({ path: path.join(OUT, "tutorial-1920x1080.jpg"), type: "jpeg", quality: 80 });
    await tut.context().close();
  } finally {
    await browser.close();
    server.stop();
  }
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  fs.writeFileSync(path.join(OUT, "checks.txt"), `${lines.join("\n")}\n`);
  console.log(failed === 0 ? "\nAll checks pass." : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
