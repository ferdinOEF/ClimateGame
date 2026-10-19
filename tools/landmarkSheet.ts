/**
 * Section 18's landmark contact sheet: each of the sixteen landmarks close up
 * in the game at 1920x1080, nearer than a player can zoom, the HUD and labels
 * hidden: once from the game's own camera angle and once in a lower three
 * quarter view nearer the drawings' angle; and a sheet with each three quarter
 * view beside its approved drawing (docs/reference/landmarks_approved.png).
 *
 * Usage: npx tsx tools/landmarkSheet.ts [outDir]   (default docs/qa/section18)
 * Writes landmark-NN-<id>.jpg, landmark-NN-<id>-three-quarter.jpg and landmarks-contact-sheet.jpg. Exits 1 on a console error.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] ?? "docs/qa/section18");
const W = 1920, H = 1080;
const map = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/maps/panaji.json"), "utf8")) as { monuments: { id: string; name: string; kind: string; q: number; r: number }[] };
/** The drawings' order on the approved sheet (1 to 16). */
const ORDER = [
  "panjim_church", "idalcao_palace", "panjim_municipal_market", "institute_menezes_braganza", "mahalaxmi_temple", "jama_masjid_panaji",
  "don_bosco_high_school", "don_bosco_college", "sharada_mandir_school", "government_polytechnic_panaji", "kala_academy", "goa_state_museum",
  "campal_garden", "dhempe_college", "miramar_beach", "dona_paula_viewpoint"
];
/** Card i's box on the approved sheet (three columns of cards). */
const card = (i: number) => ({ x: [12, 330, 648][i % 3], y: [12, 343, 675, 1006, 1337, 1668][Math.floor(i / 3)], w: 306, h: 318 });
const ELEVATION = (58 * Math.PI) / 180;

fs.mkdirSync(OUT, { recursive: true });
const server = await startDevServer(Number(process.env.PORT ?? 5461));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function"`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta").first().click();
await page.waitForTimeout(2500);
await page.evaluate(`window.__panjimScenarioForTest("quality-high")`);
await page.waitForTimeout(1500);
// Only the board: every page element hidden but the canvas.
await page.addStyleTag({ content: "body * { visibility: hidden !important; } canvas { visibility: visible !important; }" });

/** Each landmark twice: the game's own angle (from the south, 58 degrees down), and a lower three quarter view from the south west, nearer the drawings' angle. */
const VIEWS = [
  { suffix: "", elevation: ELEVATION, azimuth: 0, near: 2.7, far: 3.2 },
  { suffix: "-three-quarter", elevation: (34 * Math.PI) / 180, azimuth: (-32 * Math.PI) / 180, near: 2.6, far: 3.1 }
];
/** Where a hill on the next tile hides a landmark from the south west, its three quarter view comes from the south east. */
const FROM_SOUTH_EAST = new Set(["jama_masjid_panaji", "sharada_mandir_school", "kala_academy"]);
const shots: { id: string; files: string[] }[] = [];
for (const [i, id] of ORDER.entries()) {
  const m = map.monuments.find((x) => x.id === id)!;
  const x = Math.sqrt(3) * m.q + (Math.sqrt(3) / 2) * m.r;
  const z = 1.5 * m.r;
  const open = ["park", "beach", "viewpoint"].includes(m.kind);
  const files: string[] = [];
  for (const view of VIEWS) {
    const distance = open ? view.far : view.near;
    const azimuth = view.azimuth !== 0 && FROM_SOUTH_EAST.has(id) ? -view.azimuth : view.azimuth;
    const flat = Math.cos(view.elevation) * distance;
    await page.evaluate(`(() => {
      window.__focusOnForTest(${x}, ${z}, true);
      const y = window.__tileHeightForTest(${m.q}, ${m.r});
      const cam = window.__cameraForTest;
      const lookY = y + ${open ? 0.1 : 0.32};
      cam.position.set(${x} + Math.sin(${azimuth}) * ${flat}, lookY + Math.sin(${view.elevation}) * ${distance}, ${z} + Math.cos(${azimuth}) * ${flat});
      cam.lookAt(${x}, lookY, ${z});
      cam.updateMatrixWorld();
    })()`);
    await page.waitForTimeout(1400);
    const file = path.join(OUT, `landmark-${String(i + 1).padStart(2, "0")}-${id}${view.suffix}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 85 });
    files.push(file);
  }
  shots.push({ id, files });
  console.log(`shot ${i + 1} ${m.name}`);
}

// The sheet: two pairs a row, each the drawing beside the render's middle.
const drawing = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, "docs/reference/landmarks_approved.png")).toString("base64")}`;
const cells = shots
  .map(({ id, files }, i) => {
    const file = files[1];
    const c = card(i);
    const k = 420 / c.h;
    const render = `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
    const name = map.monuments.find((m) => m.id === id)!.name;
    return `<div class="pair"><div class="draw" style="width:${Math.round(c.w * k)}px;background-image:url(${drawing});background-size:${Math.round(1265 * k)}px auto;background-position:-${Math.round(c.x * k)}px -${Math.round(c.y * k)}px"></div><div class="game" style="background-image:url(${render})"><span>${i + 1}. ${name}, in the game (three quarter view)</span></div></div>`;
  })
  .join("");
const sheet = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await sheet.setContent(`<!doctype html><style>
  body { margin: 0; background: #f3ece0; font: 600 16px system-ui, sans-serif; color: #3a2a1a; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
  .pair { display: flex; gap: 8px; height: 420px; }
  .draw { height: 420px; background-repeat: no-repeat; border-radius: 10px; }
  .game { flex: 1; height: 420px; background-size: 1100px auto; background-position: center 45%; border-radius: 10px; position: relative; }
  .game span { position: absolute; left: 8px; bottom: 8px; background: rgba(255,255,255,.85); padding: 2px 8px; border-radius: 6px; }
</style><div class="grid">${cells}</div>`);
await sheet.waitForTimeout(500);
await sheet.screenshot({ path: path.join(OUT, "landmarks-contact-sheet.jpg"), type: "jpeg", quality: 85, fullPage: true });

console.log(errors.length === 0 ? "no console errors" : `console errors: ${errors.slice(0, 5).join(" | ")}`);
await browser.close();
server.stop();
process.exit(errors.length === 0 ? 0 : 1);
