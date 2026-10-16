/**
 * P7 browser verification for the Maya / Warning Heat / town change.
 *
 * Plays the Tutorial to completion and Panaji far enough to check every
 * claim in docs/PROGRESS.md that can only be checked in a browser:
 *   - zero console errors anywhere;
 *   - the Tutorial still completes, with its own objectives panel and no
 *     Maya, heat or Get ready;
 *   - every HUD control has a tooltip, and every tooltip shows real text;
 *   - Get ready shows the model's objective on Panaji (Section 12: one row or more);
 *   - the street map defaults to 21%;
 *   - roads render, with no building on any road tile;
 *   - Maya greets with "Hello" and the first objective, mutes with M, the heat toggles with R;
 *   - the heat's previewed houses at risk cover the houses the storm then
 *     takes (exactly, for the flood; within the forecast cone, for the
 *     cyclone), in the real browser run (no builds in between);
 *   - frame cost.
 *
 * Usage: npx tsx tools/verifyMaya.ts
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import { startDevServer } from "./devServer";

const PORT = 5195;
const failures: string[] = [];
const errors: string[] = [];

function check(ok: boolean, what: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures.push(what);
}

async function evalJs<T>(page: Page, code: string): Promise<T> {
  return (await page.evaluate(code)) as T;
}

async function tooltipCheck(page: Page, label: string): Promise<void> {
  const missing = await evalJs<string[]>(page, "window.__missingTooltipsForTest()");
  check(missing.length === 0, `${label}: every HUD control has a tooltip${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  const result = await evalJs<{ total: number; empty: string[] }>(
    page,
    `(() => {
      const tips = window.__tooltipsForTest;
      const empty = [];
      const els = Array.from(document.querySelectorAll("[data-tip]")).filter((el) => el.isConnected);
      for (const el of els) {
        tips.show(el);
        const tip = document.querySelector(".hud-tooltip");
        const text = tip && !tip.hidden ? tip.textContent.trim() : "";
        if (!text || /\\{\\w+\\}/.test(text)) empty.push(el.dataset.tip);
        tips.hide();
      }
      return { total: els.length, empty };
    })()`
  );
  check(result.empty.length === 0 && result.total > 5, `${label}: all ${result.total} tooltips show real text${result.empty.length ? ` (empty: ${result.empty.join(", ")})` : ""}`);
}

async function main(): Promise<void> {
  const server = await startDevServer(PORT);
  try {
    const browser = await chromium.launch({
      executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    });
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // ---- the Tutorial ---------------------------------------------------
    await page.goto(`http://localhost:${PORT}/#/play/l00-tutorial`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card", { timeout: 60000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(1500);
    check((await page.locator(".maya").count()) === 0, "Tutorial: no Maya");
    check((await page.locator(".get-ready").count()) === 0, "Tutorial: no Get ready panel");
    check(await page.locator(".objectives-list").isVisible(), "Tutorial: its own objectives checklist is shown");
    check(await evalJs<boolean>(page, "window.__heatForTest.visibleCount === 0"), "Tutorial: no warning heat");
    await tooltipCheck(page, "Tutorial");
    const built = await evalJs<Record<string, boolean>>(
      page,
      `(() => {
        const done = {};
        for (const id of ["mangrove", "dune", "house"]) {
          done[id] = false;
          for (let q = -12; q <= 12 && !done[id]; q++) for (let r = -12; r <= 12 && !done[id]; r++) done[id] = window.__buildForTest(q, r, id, false);
        }
        return done;
      })()`
    );
    check(built.mangrove && built.dune && built.house, `Tutorial: built a mangrove, a dune and a house (${JSON.stringify(built)})`);
    await page.evaluate("window.__triggerHazardForTest.cyclone(0.25)");
    let cleared = false;
    for (let i = 0; i < 60 && !cleared; i++) {
      await page.waitForTimeout(500);
      cleared = (await page.locator(".results-screen.cleared").count()) > 0;
    }
    check(cleared, "Tutorial: completes (results screen, cleared) after surviving its cyclone");

    // ---- Panaji ---------------------------------------------------------
    await page.goto(`http://localhost:${PORT}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brief-card", { timeout: 60000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(3500);
    const jobs = await page.locator(".get-ready-row").count();
    check(jobs >= 1 && (await page.locator(".get-ready").isVisible()), `Panaji: Get ready shows ${jobs} rows`);
    const slider = await page.locator(".map-layer-opacity").inputValue();
    check(slider === "21" && (await page.locator(".map-layer-control input[type=checkbox]").isChecked()), `Panaji: street map on at ${slider}%`);
    const town = await evalJs<{ roads: number; buildingsOnRoads: number; decorMeshes: string[]; buildings: number }>(page, "window.__townForTest()");
    check(town.roads > 50 && !town.decorMeshes.some((name) => name.startsWith("town-road")), `Panaji: roads come from the street map, not drawn strips (${town.roads} road tiles; meshes ${town.decorMeshes.join(", ")})`);
    check(town.buildingsOnRoads === 0, "Panaji: no building on any road tile");
    const greeting = (await page.locator(".maya-text").textContent()) ?? "";
    // Section 6.3: her first line is the first objective's, and it still says hello.
    check(greeting === "Hello! I am Maya. Before the cyclone, our first job is to protect Kala Academy to Sharada Mandir. The steps are in the Get ready card, bottom right.", `Panaji: Maya greets: "${greeting}"`);
    await tooltipCheck(page, "Panaji");

    await page.keyboard.press("m");
    check(await evalJs<boolean>(page, "window.__panjimForTest.maya.isMuted"), "Panaji: M mutes Maya");
    await page.keyboard.press("m");
    check(await evalJs<boolean>(page, "!window.__panjimForTest.maya.isMuted"), "Panaji: M unmutes Maya");

    // Into the warning window (two years out), nothing built: heat, then the storm.
    await page.evaluate("window.__panjimScenarioForTest('heat-2')");
    await page.waitForTimeout(800);
    const heated = await evalJs<number>(page, "window.__heatForTest.visibleCount");
    check(heated > 0, `Panaji: warning heat shows two years out (${heated} tiles)`);
    await page.keyboard.press("r");
    await page.waitForTimeout(200);
    check(await evalJs<boolean>(page, "window.__heatForTest.visibleCount === 0"), "Panaji: R hides the heat");
    await page.keyboard.press("r");
    await page.waitForTimeout(200);
    check(await evalJs<boolean>(page, `window.__heatForTest.visibleCount === ${heated}`), "Panaji: R shows it again");
    // In the storm's own year the heat is exactly what it takes: the calendar and the landfall are fixed (tests/exposure.test.ts).
    await page.evaluate("window.__panjimScenarioForTest('heat-1')");
    await page.waitForTimeout(800);
    const preview = await evalJs<{ id: string; atRisk: string[] }>(
      page,
      "(() => { const c = window.__panjimForTest.run.nextChallenge(); return { id: c.id, atRisk: [...window.__panjimForTest.exposure.housesAtRisk].sort() }; })()"
    );
    await page.evaluate("window.__panjimScenarioForTest('past-storm')");
    const lost = await evalJs<string[]>(page, `[...window.__panjimForTest.run.outcomes.get(${JSON.stringify(preview.id)}).damagedHouses].sort()`);
    check(preview.atRisk.length > 0 && JSON.stringify(preview.atRisk) === JSON.stringify(lost), `Panaji: cyclone preview matches (${preview.atRisk.length} previewed at risk, ${lost.length} lost)`);

    // The next storm: the flood takes houses.
    await page.evaluate("window.__panjimScenarioForTest('heat-2')");
    await page.waitForTimeout(500);
    const flood = await evalJs<{ id: string; atRisk: string[] }>(
      page,
      "(() => { const c = window.__panjimForTest.run.nextChallenge(); return { id: c.id, atRisk: [...window.__panjimForTest.exposure.housesAtRisk].sort() }; })()"
    );
    await page.evaluate("window.__panjimScenarioForTest('past-storm')");
    const floodLost = await evalJs<string[]>(page, `[...window.__panjimForTest.run.outcomes.get(${JSON.stringify(flood.id)}).damagedHouses].sort()`);
    check(flood.atRisk.length > 0 && JSON.stringify(flood.atRisk) === JSON.stringify(floodLost), `Panaji: flood preview matches (${flood.atRisk.length} previewed at risk, ${floodLost.length} lost)`);

    const stats = await evalJs<{ frames: number; updateMs: number; renderMs: number; calls: number; triangles: number }>(page, "({ ...window.__frameStatsForTest })");
    console.log(`frame cost so far: ${(stats.updateMs / Math.max(1, stats.frames)).toFixed(2)} ms update, ${stats.calls} draw calls, ${stats.triangles} triangles`);
    await browser.close();
  } finally {
    server.stop();
  }
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
  console.log(failures.length === 0 ? "\nALL CHECKS PASSED" : `\n${failures.length} CHECK(S) FAILED`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
