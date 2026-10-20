/**
 * Section 16 (the owner's second round of Panaji map edits, the flood from the
 * Mandovi, the first cyclone onto Sharada Mandir School, Play Panjim):
 * screenshots and browser checks.
 *
 * Usage:  npx tsx tools/section16Checks.ts [outDir]   (outDir defaults to docs/qa/section16)
 *
 * At 1920x1080, 1366x768, 2560x1440 and 1280x600:
 *   - the landing page (only Tutorial and Play Panjim);
 *   - the first frame after Play Panjim (the start popup, its forecast onto the school);
 *   - the opening view after Begin, and the 2026 cone onto Sharada Mandir School close up;
 *   - result card 1 (the places in the area) and the coming-up card (the flood's forecast);
 *   - the 2031 flood cone from the Mandovi, and the same framed on Merces, St Cruz and Taleigao.
 * Gray and deuteranopia copies of the 1920 start popup and 2026 cone. Checks:
 * the menu's two buttons; Play Panjim opens the game view with Begin (and,
 * with a saved run, Continue from <year> and Begin again); the objectives'
 * titles, rows and pins; the result card's places; Maya's lines; axe-core;
 * zero console errors. Exits 1 if any check fails.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section16");
const PORT = Number(process.env.CHECK_PORT ?? 5316);
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


const mayaText = (page: Page): Promise<string> => page.evaluate(`(document.querySelector(".maya-bubble") || {}).innerText || ""`) as Promise<string>;
const pins = (page: Page): Promise<string[]> => page.evaluate(`[...document.querySelectorAll(".map-pin .map-pin-name")].map((n) => n.textContent.trim())`) as Promise<string[]>;
const getReady = (page: Page): Promise<{ title: string; rows: string[] }> =>
  page.evaluate(`({ title: (document.querySelector(".get-ready-title") || {}).textContent || "", rows: [...document.querySelectorAll(".get-ready-row .get-ready-label")].map((n) => n.textContent.trim()) })`) as Promise<{ title: string; rows: string[] }>;

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
      const full = w === 1920;
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`${tag}: ${m.text()}`);
      });

      // --- the landing page ------------------------------------------------
      await page.goto(server.url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".menu-screen", { timeout: 120000 });
      await page.waitForTimeout(1500);
      const buttons = (await page.locator(".menu-actions button").allTextContents()).map((t) => t.trim());
      check(JSON.stringify(buttons) === JSON.stringify(["Tutorial", "Play Panjim"]), `${tag} landing page: only Tutorial and Play Panjim (${buttons.join(", ")})`);
      await shot(page, `landing-${tag}`, full);
      if (full) await axe(page, "the landing page");

      // --- Play Panjim: straight to the game view, its start popup open -----
      await page.locator(".menu-actions button", { hasText: "Play Panjim" }).click();
      await page.waitForSelector(".brief-card", { timeout: 120000 });
      await page.waitForTimeout(1500);
      const first = (await page.evaluate(`({
        url: location.hash,
        grid: document.querySelectorAll(".level-grid").length,
        eyebrow: ((document.querySelector(".brief-card") || {}).innerText || "").split("\\n")[0],
        ctas: [...document.querySelectorAll(".brief-cta")].map((b) => b.textContent.trim()),
        places: [...document.querySelectorAll(".cone-preview-place text")].map((t) => t.textContent.trim()),
        line: (document.querySelector(".cone-preview-line") || {}).textContent || ""
      })`)) as { url: string; grid: number; eyebrow: string; ctas: string[]; places: string[]; line: string };
      check(first.url === "#/play/l01-first-rains" && first.grid === 0, `${tag} Play Panjim opens the Panaji game view, not the level select (${first.url})`);
      check(/PANJIM 2050/i.test(first.eyebrow), `${tag} the start popup is Panjim 2050 ("${first.eyebrow}")`);
      check(JSON.stringify(first.ctas) === JSON.stringify(["Begin"]), `${tag} with no saved run the popup offers Begin (${first.ctas.join(", ")})`);
      check(JSON.stringify(first.places) === JSON.stringify(["Sharada Mandir School", "Miramar Beach"]) && /first cyclone lands in 5 years/.test(first.line), `${tag} its forecast: "${first.line}", labelled ${first.places.join(", ")}`);
      await shot(page, `play-panjim-first-frame-${tag}`, full);
      if (full) await axe(page, "the start popup");

      // --- Begin: the board, the cone onto the school ----------------------
      await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
      await page.waitForTimeout(3500);
      const maya1 = await mayaText(page);
      check(/our first job is to protect Sharada Mandir School/.test(maya1), `${tag} Maya's first line: "${maya1}"`);
      await page.evaluate("window.__panjimForTest && (window.__panjimForTest.maya.holdLines = true)");
      const ready1 = await getReady(page);
      check(ready1.title === "Protect Sharada Mandir School" && ready1.rows.length > 0 && ready1.rows.every((r) => / in front of Sharada Mandir School$/.test(r)), `${tag} objective 1: ${ready1.title}: ${ready1.rows.join(" | ")}`);
      const pins1 = await pins(page);
      check(pins1.includes("Sharada Mandir School"), `${tag} Sharada Mandir School is pinned (${pins1.join(", ")})`);
      await shot(page, `opening-${tag}`);
      await focus(page, world(-4, 19), 5, w, h);
      await shot(page, `cone-2026-sharada-mandir-${tag}`, full);

      // --- the first cyclone, result card 1 and the coming-up card ----------
      await page.evaluate(`window.__panjimScenarioForTest("to-results")`);
      await page.waitForSelector(".result-next", { state: "visible", timeout: 180000 });
      await page.waitForTimeout(1500);
      const places = (await page.evaluate(`[...document.querySelectorAll(".result-place-name")].map((n) => n.textContent.trim())`)) as string[];
      check(places.includes("Sharada Mandir School") && !places.includes("Kala Academy"), `${tag} result card 1 lists ${places.join(", ")} (no Kala Academy)`);
      await shot(page, `result-1-${tag}`);
      for (let k = 0; k < 2 && (await page.locator(".result-next").isVisible()); k++) {
        await page.locator(".result-next").click();
        await page.waitForTimeout(1500);
      }
      const coming = (await page.evaluate(`({ text: (document.querySelector(".result-cards, .result-card") || document.body).innerText, places: [...document.querySelectorAll(".cone-preview-place text")].map((t) => t.textContent.trim()) })`)) as { text: string; places: string[] };
      check(/In this game, the flood comes down the Mandovi, through the channel at Ribandar, into Merces, St Cruz and Taleigao/.test(coming.text) && ["Taleigao", "Merces", "St Cruz"].every((n) => coming.places.includes(n)), `${tag} the coming-up card: Maya's flood line, the forecast labelled ${coming.places.join(", ")}`);
      await shot(page, `coming-up-flood-${tag}`);
      for (let k = 0; k < 3 && (await page.locator(".result-next").isVisible()); k++) {
        await page.locator(".result-next").click();
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(2500);

      // --- 2031: the flood cone from the Mandovi ----------------------------
      const year = (await page.evaluate("window.__panjimForTest.run.year")) as number;
      const cone = (await page.evaluate(`window.__coneForTest.isShown && window.__coneForTest.tileCount > 0`)) as boolean;
      check(year === 2031 && cone, `${tag} 2031 opens with the flood's cone on the map (year ${year})`);
      const ready2 = await getReady(page);
      check(ready2.title === "Protect Taleigao, Merces and St Cruz" && ready2.rows.length > 0 && ready2.rows.every((r) => / in (Taleigao|Merces|St Cruz)$/.test(r)), `${tag} objective 2: ${ready2.title}: ${ready2.rows.join(" | ")}`);
      const pins2 = await pins(page);
      check(["Taleigao", "Merces", "St Cruz"].every((n) => pins2.includes(n)), `${tag} the three are pinned (${pins2.join(", ")})`);
      await shot(page, `cone-2031-${tag}`);
      if (full) await axe(page, "the board in 2031");
      // From the source (the east-edge Mandovi) along the new channel into the three.
      await focus(page, world(18, 12), 2, w, h);
      await shot(page, `cone-2031-mandovi-${tag}`, full);

      // --- a saved run: Continue from 2031 and Begin again -----------------
      if (full) {
        await page.goto(server.url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".menu-screen", { timeout: 120000 });
        await page.locator(".menu-actions button", { hasText: "Play Panjim" }).click();
        await page.waitForSelector(".brief-card", { timeout: 120000 });
        await page.waitForTimeout(1500);
        const ctas = (await page.locator(".brief-cta").allTextContents()).map((t) => t.trim());
        check(ctas.includes("Continue from 2031") && ctas.includes("Begin again"), `with a saved run Play Panjim offers (Section 22.4: Begin again) ${ctas.join(", ")}`);
        await shot(page, `play-panjim-saved-${tag}`);
      }
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
