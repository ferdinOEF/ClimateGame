/**
 * Section 30's targeted shots (the default QA gate), at one size:
 *   - the greyed creek corner east of Merces (30.1); a river tile's build menu (30.2);
 *   - the build cards with both lines and their leaf chips (30.3, 30.4); the HUD's biodiversity counter (30.4);
 *   - a card hovered, the homes it saves glowing (30.8); the objective's tiles pulsing (30.9);
 *   - the faint storm track in year 3 (30.7); Speed up during the 2030 cyclone (30.10);
 *   - the 2030 result card from review bug 1: the objective done with a seawall beside the school (30.11);
 *   - the 2050 forecast map on the 2040 storm's last card (30.11 bug 2).
 * The kingfisher fly-in and the khazan people have their own frames (tools/section30Birds.ts, tools/section30Khazan.ts output,
 * kept in docs/qa/section30). Checks what each shot is about, and console errors (0).
 *
 * Usage: npx tsx tools/section30Shots.ts <width> <height> [outDir=docs/qa/section30]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", outDir = "docs/qa/section30"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });

const server = await startDevServer(Number(process.env.PORT ?? 5478));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};
const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
});
const shot = (name: string, clip?: { x: number; y: number; width: number; height: number }) =>
  page.screenshot({ path: path.join(OUT, `${name}-${W}x${H}.jpg`), type: "jpeg", quality: 85, ...(clip ? { clip } : {}) });
const js = <T>(code: string): Promise<T> => page.evaluate(code) as Promise<T>;

await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);
await js(`window.__panjimForTest.maya.dismiss()`);
const focus = async (q: number, r: number, close = true, zoom = 1): Promise<void> => {
  await js(`window.__panjimForTest.host.focusCamera({ q: ${q}, r: ${r} }, ${close}, ${zoom})`);
  await page.mouse.move(2, H - 2);
  await page.waitForTimeout(2500);
};
const settle = async (): Promise<void> => {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && (await js<boolean>(`window.__panjimForTest.busy`))) await page.waitForTimeout(300);
  await page.waitForTimeout(800);
};

// 30.9: the objective's tiles pulse (2030: in front of Sharada Mandir School).
await focus(-3, 18, true, 1);
const pulsing = await js<string[]>(`[...window.__objectivePulseForTest.tiles]`);
check(pulsing.includes("-4,18") && pulsing.length === 3, `the objective's 3 tiles pulse (${pulsing.join(" ")})`);
await shot("objective-pulse");

// 30.4: the biodiversity counter, beside Homes at risk.
const bio = await page.locator(".outlook-bio").boundingBox();
check(!!bio && (await page.locator(".outlook-bio").isVisible()), "the biodiversity counter is on the HUD");
if (bio) await shot("hud-counter", { x: Math.max(0, bio.x - 260), y: 0, width: Math.min(W - Math.max(0, bio.x - 260), 520), height: Math.ceil(bio.y + bio.height + 14) });

// 30.3 / 30.4: the cards on a beach tile; 30.8: the dune card hovered.
await js(`window.__openTileForTest(-4, 18)`);
await page.waitForTimeout(1500);
const cards = await js<{ id: string; lines: number; clipped: boolean; chip: boolean }[]>(`[...document.querySelectorAll(".build-popover .build-card")].map((c) => ({ id: c.dataset.element, lines: c.querySelectorAll(".build-card-line, .build-card-detail").length, clipped: [...c.querySelectorAll(".build-card-line, .build-card-detail")].some((l) => l.scrollWidth > l.clientWidth + 1 || l.getBoundingClientRect().right > c.getBoundingClientRect().right + 0.5), chip: !!c.querySelector(".leaf-chip") }))`);
check(cards.length >= 3 && cards.every((c) => c.lines === 2 && !c.clipped && c.chip), `each card shows both lines unclipped and a leaf chip (${cards.map((c) => c.id).join(", ")})`);
check((await page.locator(".build-popover .build-card-pill").count()) === 0, "no home counts on the cards");
await shot("cards");
await page.locator('.build-popover .build-card[data-element="dune"]').hover();
await page.waitForTimeout(900);
const note = await page.locator(".build-hover-note:not([hidden])").count();
check(note === 0, "the dune here changes the next storm (no \"doesn't change\" line)");
await shot("card-hover");
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

// 30.2: a river tile's build menu: a small dam only.
const river = await js<{ q: number; r: number }>(`window.__panjimForTest.firstBuildable("small_dam")`);
await js(`window.__openTileForTest(${river.q}, ${river.r})`);
await page.waitForTimeout(1500);
const riverCards = await js<string[]>(`[...document.querySelectorAll(".build-popover .build-card")].map((c) => c.dataset.element)`);
check(riverCards.length === 1 && riverCards[0] === "small_dam", `a river tile offers a small dam only (${riverCards.join(", ")})`);
await shot("river-menu");
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

// 30.1: the creek corner east of Merces, grey and out of the game.
// Beside it, the east edge's older grey (30,7) and the estuary that stays in play (25,6).
await focus(27, 8, true, 1.5);
const dry = await js<{ scenery: boolean; dry: boolean; build: boolean; old: boolean; oldDry: boolean; kept: boolean }>(`(() => { const s = window.__panjimForTest.host.state; const t = s.placed.get("25,8"); const o = s.placed.get("30,7"); const k = s.placed.get("25,6"); return { scenery: !!t.scenery, dry: !!t.dry, build: s.buildableAt({ q: 25, r: 8 }).length > 0, old: !!o.scenery, oldDry: !!o.dry, kept: !k.scenery && s.buildableAt({ q: 25, r: 6 }).length > 0 }; })()`);
check(dry.scenery && dry.dry && !dry.build, "25,8 is grey, dry and takes no build");
check(dry.old && !dry.oldDry, "30,7 beside it is the older grey: the same scenery layer, so the same shade");
check(dry.kept, "the estuary at 25,6 stays in play and takes a build");
await shot("creek-corner");

// 30.7: two builds of the objective, then the faint storm track in year 3.
for (const [q, r, id] of [[-4, 18, "dune"], [-5, 21, "sandy_vegetation"]] as const) {
  check(await js<boolean>(`window.__panjimForTest.build({ q: ${q}, r: ${r} }, "${id}")`), `build ${id} at ${q},${r}`);
  await settle();
}
await js(`window.__panjimForTest.maya.dismiss()`);
await focus(-3, 16, true, 2.2);
const year = await js<number>(`window.__panjimForTest.run.year`);
check(await js<boolean>(`window.__coneOverlayForTest.trailShown`), `${year}: the storm's faint track is on the board`);
check(!(await js<boolean>(`window.__panjimForTest.coneShown`)), "the full cone is gone");
await shot("storm-trail");

// Bug 1's board: the objective done, a seawall beside the school, a breakwater; the fifth build brings the cyclone.
for (const [q, r, id] of [[-3, 17, "seawall"], [-2, 16, "sandy_vegetation"]] as const) {
  check(await js<boolean>(`window.__panjimForTest.build({ q: ${q}, r: ${r} }, "${id}")`), `build ${id} at ${q},${r}`);
  await settle();
}
check(await js<boolean>(`window.__panjimForTest.build({ q: -5, r: 19 }, "breakwater")`), "build breakwater at -5,19 (brings the 2030 cyclone)");
const stormStart = Date.now();
while (Date.now() - stormStart < 60000 && !(await js<boolean>(`window.__panjimForTest.host.challengeFx.isPlaying()`))) await page.waitForTimeout(200);
await page.waitForTimeout(1500);
check(await page.locator(".speed-up:visible").count() === 1, "Speed up is on screen during the storm");
await shot("speed-up");
await page.locator(".speed-up").click();
const cardStart = Date.now();
while (Date.now() - cardStart < 120000 && !(await page.locator(".result-cards:not([hidden]) .result-next").count())) {
  if (await page.locator(".speed-up:visible").count()) await page.locator(".speed-up").click();
  await page.waitForTimeout(400);
}
await page.waitForTimeout(900);
const card1 = ((await page.locator(".result-cards:not([hidden]) .result-card").first().textContent()) ?? "").replace(/\s+/g, " ");
check(/Objective done/.test(card1) && !/Objective complete/.test(card1), "the card says Objective done (2 stars)");
check(/three stars need/.test(card1), "with one line on what stopped the third star");
check(/a seawall pushes water round its ends: it reached Sharada Mandir School/.test(card1), "and names the seawall's push on the school");
await shot("result-2030-bug1");

// On through the cards, then to the 2040 flood's cards: the last one carries the 2050 forecast map.
const throughCards = async (stop: () => Promise<boolean>): Promise<boolean> => {
  for (let i = 0; i < 12; i++) {
    if (await stop()) return true;
    const next = page.locator(".result-cards:not([hidden]) .result-next");
    if (!(await next.count())) return false;
    await next.click();
    await page.waitForTimeout(900);
  }
  return false;
};
await throughCards(async () => !(await page.locator(".result-cards:not([hidden])").count()));
await settle();
await js(`window.__panjimForTest.scenario("to-results")`);
await page.waitForTimeout(800);
const mapShown = await throughCards(async () => (await page.locator(".result-cards:not([hidden]) .result-preview .cone-preview-map").count()) > 0);
check(mapShown, "the 2040 storm's last card carries the 2050 forecast map");
if (mapShown) {
  await page.waitForTimeout(1200);
  const labels = await js<{ name: string; inside: boolean; overlaps: boolean; shown: boolean }[]>(`(() => {
    const svg = document.querySelector(".result-cards:not([hidden]) .result-preview .cone-preview-map");
    const box = svg.getBoundingClientRect();
    const groups = [...svg.querySelectorAll(".cone-preview-place")];
    const rects = groups.map((g) => g.style.display === "none" ? null : g.querySelector("text").getBoundingClientRect());
    return groups.map((g, i) => {
      const r = rects[i];
      if (!r) return { name: g.textContent, inside: true, overlaps: false, shown: false };
      const overlaps = rects.some((o, j) => j !== i && o && r.left < o.right && o.left < r.right && r.top < o.bottom && o.top < r.bottom);
      return { name: g.textContent, inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5, overlaps, shown: true };
    });
  })()`);
  console.log(`  2050 map labels: ${labels.map((l) => `${l.name}${l.shown ? "" : " (left off)"}`).join("; ")}`);
  check(labels.some((l) => l.shown) && labels.every((l) => l.inside && !l.overlaps), "no name clips at the map's edge or covers another");
  await shot("brief-2050");
}

check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
await server.stop();
console.log(failed === 0 ? `ALL PASS [${W}x${H}]` : `${failed} FAILED [${W}x${H}]`);
process.exit(failed === 0 ? 0 : 1);
