/**
 * Section 11 (the owner's Panaji map edits, the north bank as scenery):
 * screenshots and browser checks.
 *
 * Usage:  npx tsx tools/section11Shots.ts [outDir]   (outDir defaults to docs/qa/section11)
 *
 * At 1366x768, 1920x1080, 2560x1440 and 1280x600:
 *   - the opening view (with the 2026 cyclone's cone on the map);
 *   - Campal and Santa Inez with the new creek; Fontainhas with the Ourem
 *     creek; Miramar beach; the Dona Paula headland;
 *   - the 2026 cyclone cone, framed on its stretch;
 *   - the north bank close up;
 *   - the 2031 flood cone (after the first storm's result cards).
 * Gray and deuteranopia copies of the 1920 opening view. Checks: a click on
 * the north bank shows only "North of the Mandovi: not part of this game"; a
 * click on a playable tile still opens a build menu; axe-core on the opening
 * view; zero console errors. Exits 1 if any check fails.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section11");
const PORT = Number(process.env.CHECK_PORT ?? 5311);
const SIZES: [number, number][] = [[1920, 1080], [1366, 768], [2560, 1440], [1280, 600]];
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/maps/panaji.json"), "utf8")) as {
  localities: { name: string; q: number; r: number }[];
  unplayable: [number, number][];
  tiles: { q: number; r: number; terrainId: string }[];
};
const world = (q: number, r: number): { x: number; z: number } => ({ x: Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r, z: 1.5 * r });
const at = (name: string) => {
  const l = MAP.localities.find((p) => p.name === name)!;
  return world(l.q, l.r);
};
/** The middle of the north bank, and one of its land tiles there. */
const NORTH = (() => {
  const xs = MAP.unplayable.map(([q, r]) => world(q, r));
  const cx = xs.reduce((s, p) => s + p.x, 0) / xs.length;
  const cz = xs.reduce((s, p) => s + p.z, 0) / xs.length;
  return { x: cx, z: cz };
})();
const NORTH_TILE = (() => {
  const land = new Set(MAP.tiles.filter((t) => t.terrainId === "land").map((t) => `${t.q},${t.r}`));
  const [q, r] = MAP.unplayable.find(([q, r]) => land.has(`${q},${r}`) && r === 4)!;
  return world(q, r);
})();

let failed = 0;
const lines: string[] = [];
const errors: string[] = [];
function check(ok: boolean, what: string): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${what}`;
  lines.push(line);
  console.log(line);
}

const DEUTERANOPIA = "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0";

async function shot(page: Page, name: string, copies = false): Promise<void> {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
  if (!copies) return;
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}-gray.jpg`), type: "jpeg", quality: 75 });
  await page.evaluate(`Array.from(document.querySelectorAll("style")).forEach(function (st) { if ((st.textContent || "").indexOf("grayscale(1) !important") >= 0) st.remove(); })`);
  await page.evaluate(`(function () {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0");
    svg.id = "qa-cvd-svg";
    svg.innerHTML = '<filter id="qa-cvd"><feColorMatrix type="matrix" values="${DEUTERANOPIA}"/></filter>';
    document.body.appendChild(svg);
    document.documentElement.style.filter = "url(#qa-cvd)";
  })()`);
  await page.screenshot({ path: path.join(OUT, `${name}-deut.jpg`), type: "jpeg", quality: 80 });
  await page.evaluate(`(function () { document.documentElement.style.filter = ""; var s = document.getElementById("qa-cvd-svg"); if (s) s.remove(); })()`);
}

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ path: path.resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  const found = (await page.evaluate(`(async () => {
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + " x" + v.nodes.length);
  })()`)) as string[];
  check(found.length === 0, `axe-core, ${label}: no serious or critical violations${found.length ? `: ${found.join(", ")}` : ""}`);
}

const focus = async (page: Page, p: { x: number; z: number }, zoomSteps: number, w: number, h: number): Promise<void> => {
  await page.evaluate(`window.__focusOnForTest(${p.x}, ${p.z}, false)`);
  await page.mouse.move(w / 2, h / 2);
  // From the same zoom every time: fully out, then `zoomSteps` in.
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  for (let i = 0; i < zoomSteps; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(2500);
};

const popoverText = (page: Page): Promise<string> =>
  page.evaluate(`(function () { var b = document.querySelector(".popover-backdrop"); var p = document.querySelector(".build-popover"); return b && !b.hidden && p ? p.innerText.trim() : ""; })()`) as Promise<string>;

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startDevServer(PORT);
  const browser = await chromium.launch({
    executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    for (const [w, h] of SIZES) {
      const tag = `${w}x${h}`;
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`${tag}: ${m.text()}`);
      });
      await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".brief-card", { timeout: 120000 });
      await page.waitForTimeout(1200);
      await page.locator(".brief-cta", { hasText: /Begin|Start/i }).first().click();
      await page.waitForTimeout(3500);
      await page.evaluate("window.__panjimForTest && (window.__panjimForTest.maya.holdLines = true)");

      await shot(page, `opening-${tag}`, w === 1920);
      if (w === 1920) {
        check((await page.evaluate(`window.__coneForTest.isShown && window.__coneForTest.tileCount > 0`)) as boolean, "the 2026 cyclone's cone is on the map at the start");
        await axe(page, "the opening view");
      }

      // The 2026 cone, framed on its stretch (Kala Academy to Sharada Mandir).
      await focus(page, world(1, 14), 4, w, h);
      await shot(page, `cone-2026-${tag}`);
      // Campal and Santa Inez with the new creek.
      await focus(page, world(4, 13), 6, w, h);
      await shot(page, `campal-santa-inez-${tag}`);
      // Fontainhas with the Ourem creek.
      await focus(page, at("Fontainhas"), 6, w, h);
      await shot(page, `fontainhas-${tag}`);
      // Miramar beach.
      await focus(page, at("Miramar"), 6, w, h);
      await shot(page, `miramar-${tag}`);
      // The Dona Paula headland.
      await focus(page, at("Dona Paula"), 6, w, h);
      await shot(page, `dona-paula-${tag}`);
      // The north bank, close.
      await focus(page, NORTH, 6, w, h);
      await shot(page, `north-bank-${tag}`);

      if (w === 1920) {
        // A click on the north bank: one line, no build menu.
        await focus(page, NORTH_TILE, 8, w, h);
        await page.mouse.click(w / 2, h / 2);
        await page.waitForTimeout(800);
        const north = await popoverText(page);
        check(north === "North of the Mandovi: not part of this game", `a click on the north bank shows only the note: "${north}"`);
        await shot(page, `north-bank-click-${tag}`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(600);
        // A click on playable ground still opens a build menu.
        const beach = MAP.tiles.find((t) => t.q === -4 && t.r === 18)!;
        await focus(page, world(beach.q, beach.r), 8, w, h);
        await page.mouse.click(w / 2, h / 2);
        await page.waitForTimeout(800);
        const south = await popoverText(page);
        check(south.length > 0 && !/North of the Mandovi/.test(south), `a click on the playable beach opens its menu: "${south.replace(/\s+/g, " ").slice(0, 80)}"`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(600);
      }

      // The 2031 flood cone: past the first storm and its result cards.
      await page.evaluate(`window.__panjimScenarioForTest("to-results")`);
      await page.waitForSelector(".result-next", { state: "visible", timeout: 180000 });
      // Through the three cards ("On to 2031" is the last button).
      for (let k = 0; k < 6 && (await page.locator(".result-next").isVisible()); k++) {
        await page.locator(".result-next").click();
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(2500);
      const year = (await page.evaluate("window.__panjimForTest.run.year")) as number;
      const cone = (await page.evaluate(`window.__coneForTest.isShown && window.__coneForTest.tileCount > 0`)) as boolean;
      check(year === 2031 && cone, `${tag}: 2031 opens with the flood's cone on the map (year ${year})`);
      await shot(page, `cone-2031-${tag}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  check(errors.length === 0, `zero console errors${errors.length ? `: ${errors.slice(0, 5).join(" | ")}` : ""}`);
  fs.writeFileSync(path.join(OUT, "checks.txt"), lines.join("\n") + "\n");
  console.log(`\n${lines.length - failed} of ${lines.length} checks pass.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
