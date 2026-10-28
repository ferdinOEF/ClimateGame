/**
 * Section 34c: the HUD card at half its size (34c.1) and the new corners (34c.2), shot on the production build through
 * `vite preview` at one or more sizes. Each scene opens a fresh page; beside the shots, `boxes-<size>.json` holds the
 * boxes of the HUD card, Maya and her bubble, the street map control and the build menu in every scene.
 *
 * Usage: npx tsx tools/section34cShots.ts [sizes=1366x768,1920x1080] [scenes=start,four-rows,storm,large-text]
 *   [out=docs/qa/section34c/after] [url=http://localhost:4173]
 * Scenes: start, four-rows (the 2031 phase, four objective rows), storm (the 2030 cyclone at 7 s), large-text (four
 * rows, Larger text on), bubble (Maya's line open), menu-miramar (the build menu on a Miramar beach tile), result (the
 * first result card), final (the last card of the run), tutorial (the Tutorial with its caption).
 * Exits 1 on a console error or a scene that does not run.
 */
import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { killTree } from "./devServer";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const SIZES = (args.get("sizes") ?? "1366x768,1920x1080").split(",").map((s) => s.split("x").map(Number) as [number, number]);
const SCENES = (args.get("scenes") ?? "start,four-rows,storm,large-text").split(",");
const OUT = path.resolve(args.get("out") ?? "docs/qa/section34c/after");
fs.mkdirSync(OUT, { recursive: true });
const gpu = process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

async function startPreview(): Promise<{ url: string; child: ChildProcess | null }> {
  if (args.get("url")) return { url: args.get("url")!, child: null };
  if (!fs.existsSync("dist/index.html")) throw new Error("no dist/: run npm run build first");
  const port = await freePort();
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    if (await fetch(url).then((r) => r.ok).catch(() => false)) return { url, child };
    await new Promise((r) => setTimeout(r, 500));
  }
  killTree(child);
  throw new Error(`vite preview did not answer on ${url}`);
}

const errors: string[] = [];
let failures = 0;

async function open(browser: Browser, url: string, W: number, H: number, level = "l01-first-rains"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${W}x${H}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${W}x${H}: ${e.message}`));
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* blocked */
    }
  });
  await page.goto(`${url}/?qa=1#/play/${level}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(`typeof window.__panjimForTest === "object" && window.__panjimForTest !== null`, undefined, { timeout: 120000 });
  await page.waitForTimeout(1500);
  return page;
}

const js = <T>(page: Page, code: string): Promise<T> => page.evaluate(code) as Promise<T>;
const begin = async (page: Page): Promise<void> => {
  await page.locator(".brief-cta").first().click({ timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
};
const scenario = (page: Page, name: string): Promise<boolean> => js<boolean>(page, `window.__panjimScenarioForTest(${JSON.stringify(name)})`);
const quiet = (page: Page): Promise<unknown> => js(page, `window.__panjimForTest.maya.dismiss()`);

async function boxes(page: Page): Promise<Record<string, number[] | null>> {
  return js(page, `(() => {
    const seen = (el) => { if (!el || el.closest("[hidden]")) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const one = (sel) => { const el = document.querySelector(sel); if (!seen(el)) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    return { card: one(".panjim-clock"), menu: one(".panjim-clock .hud-panel-body:not([hidden])"), maya: one(".maya-figure-wrap") ?? one(".maya-badge"), bubble: one(".maya-bubble:not([hidden])"), street: one(".hud-menu-street"), credit: one(".map-corner"), popover: one(".build-popover"), banner: one(".era-banner:not([hidden])"), speed: one(".speed-up:not([hidden])") };
  })()`);
}

/** A free tile of `terrain` near the middle of the screen, or null. */
async function tileOnScreen(page: Page, W: number, H: number, terrains: string[], locality?: string): Promise<{ x: number; y: number } | null> {
  return js(page, `(() => { const c = window.__panjimForTest; const run = c.run; const box = c.host.container.getBoundingClientRect();
    const near = ${JSON.stringify(locality ?? null)}; const mark = near ? c.host.landmarks.find((l) => l.name.includes(near)) : null; const place = mark ? (mark.coord ?? mark) : null;
    const out = [];
    for (const [key, t] of run.state.placed) { if (!${JSON.stringify(terrains)}.includes(t.terrainId) || run.state.elements.has(key)) continue;
      if (!run.state.buildableAt(t.coord).length) continue;
      const p = c.host.project(t.coord); if (!p) continue; const x = p.x + box.left, y = p.y + box.top;
      if (x < ${W} * 0.3 || x > ${W} * 0.7 || y < ${H} * 0.25 || y > ${H} * 0.75) continue;
      const el = document.elementFromPoint(x, y); if (!el || el.tagName !== "CANVAS") continue;
      const d = place ? Math.max(Math.abs(t.coord.q - place.q), Math.abs(t.coord.r - place.r), Math.abs(t.coord.q + t.coord.r - place.q - place.r)) : 0;
      out.push({ x, y, d }); }
    out.sort((a, b) => a.d - b.d); return out[0] ?? null; })()`);
}

type Scene = (page: Page, W: number, H: number) => Promise<boolean>;
const SCENE: Record<string, { level?: string; run: Scene }> = {
  start: { run: async (page) => (await begin(page), await quiet(page), true) },
  "four-rows": { run: async (page) => (await begin(page), await scenario(page, "past-storm")) && (await page.waitForTimeout(3000), await quiet(page), true) },
  storm: { run: async (page) => (await begin(page), await scenario(page, "storm-7")) && (await page.waitForTimeout(1500), true) },
  "large-text": {
    run: async (page) => {
      await begin(page);
      const ok = await scenario(page, "past-storm");
      await page.waitForTimeout(3000);
      await js(page, `window.__panjimForTest.host.container.classList.add("large-text")`);
      await quiet(page);
      await page.waitForTimeout(600);
      return ok;
    }
  },
  bubble: {
    run: async (page) => {
      await begin(page);
      await js(page, `(() => { const m = window.__panjimForTest.maya; m.say({ id: "qa:34c", text: "The cyclone is coming in from the sea. Build on the beach first to keep the homes behind it standing.", state: "tip" }); m.next(); })()`);
      await page.waitForTimeout(1500);
      return true;
    }
  },
  "menu-miramar": {
    run: async (page, W, H) => {
      await begin(page);
      await quiet(page);
      const tile = await tileOnScreen(page, W, H, ["beach"], "Miramar");
      if (!tile) return false;
      await page.mouse.click(tile.x, tile.y);
      await page.waitForTimeout(1200);
      return (await page.locator(".build-popover:not([hidden])").count()) > 0;
    }
  },
  result: { run: async (page) => (await begin(page), await scenario(page, "to-results")) && (await page.waitForTimeout(1500), true) },
  // The app's own "finale" scenario: the whole run played, each Aftermath accepted, handed back at the last card.
  final: { run: async (page) => (await begin(page), await scenario(page, "finale")) && (await page.waitForTimeout(1500), true) },
  tutorial: { level: "l00-tutorial", run: async (page) => (await begin(page), true) }
};

const { url, child } = await startPreview();
const browser = await chromium.launch({ args: gpu });
try {
  for (const [W, H] of SIZES) {
    const tag = `${W}x${H}`;
    const record: Record<string, unknown> = {};
    for (const name of SCENES) {
      const scene = SCENE[name];
      if (!scene) throw new Error(`no scene ${name}`);
      const page = await open(browser, url, W, H, scene.level);
      const ok = await scene.run(page, W, H).catch((e: Error) => (console.log(`  ${name}: ${e.message.split("\n")[0]}`), false));
      if (!ok) {
        failures++;
        console.log(`FAIL [${tag}] ${name}: the scene did not run`);
      }
      record[name] = await boxes(page);
      await page.screenshot({ path: path.join(OUT, `${name}-${tag}.jpg`), type: "jpeg", quality: 85 });
      console.log(`[${tag}] ${name}: ${JSON.stringify(record[name])}`);
      await page.close();
    }
    fs.writeFileSync(path.join(OUT, `boxes-${tag}.json`), JSON.stringify(record, null, 1));
  }
} finally {
  await browser.close();
  killTree(child);
}
if (errors.length) console.log(`console errors: ${errors.slice(0, 4).join(" | ")}`);
console.log(failures === 0 && errors.length === 0 ? "ALL PASS" : `${failures + errors.length} FAILED`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
