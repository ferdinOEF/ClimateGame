/**
 * Section 34: a browser a playtester drives by hand, one command at a time, so a person (or an agent playing as one)
 * plays the real game by looking at the screen and clicking, never through the game's test hooks.
 *
 * It opens the game in Chromium (the real GPU when there is one, as a player's browser would) and listens on a local
 * port for plain GET requests, so `curl` is all a player needs:
 *
 *   /shot?name=x            a screenshot, saved as <out>/<n>-x.jpg; replies with its path
 *   /text                   the words on screen (what a player can read), dialogs first
 *   /click?x=&y=            a click at that point (also &button=right, &count=2)
 *   /move?x=&y=             the pointer moved there (hover)
 *   /drag?x1=&y1=&x2=&y2=   a press, a drag and a release
 *   /wheel?x=&y=&dy=        a wheel turn at that point (dy 100 is one notch down, that is zoom out)
 *   /key?k=Escape           a key press (Playwright key names: Enter, Escape, Tab, Shift+Tab, ArrowLeft, r, ...)
 *   /type?t=hello           typed text
 *   /clicktext?t=Begin      clicks the visible button or link whose words are t (as a player clicks what they read)
 *   /buttons                the visible buttons and links, with their words and where they are
 *   /wait?ms=1000           waits (at most 60 s)
 *   /waitcalm?s=90          waits until no storm is playing (at most s seconds): the one hook used, to speed waits
 *   /resize?w=&h=           the window resized
 *   /reload                 the page reloaded
 *   /newtab                 a second tab on the same address, which becomes the current one; /tab?i=0 goes back
 *   /console                console errors and warnings since the last call
 *   /quit                   closes the browser
 *
 * Every command is written with its time to <out>/actions.jsonl, with the game's year and build count read
 * alongside (for the measurements; the player never sees them).
 *
 * Usage: npx tsx tools/playtest/driver.ts port=7101 out=docs/qa/section34/round1/festival url=http://localhost:4173/ w=1366 h=768 [gpu=0] [vision=deuteranopia]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const PORT = Number(args.get("port") ?? 7101);
const OUT = path.resolve(args.get("out") ?? "playtest-out");
const URL0 = args.get("url") ?? "http://localhost:4173/";
let W = Number(args.get("w") ?? 1366);
let H = Number(args.get("h") ?? 768);
fs.mkdirSync(OUT, { recursive: true });

// The real GPU through ANGLE's D3D11 on Windows; software GL (as the other QA tools use) with gpu=0.
const GPU_ARGS = process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--ignore-gpu-blocklist", "--enable-gpu"];
const SW_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({
  executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
  args: args.get("gpu") === "0" ? SW_ARGS : GPU_ARGS
});
const context = await browser.newContext({ viewport: { width: W, height: H } });
const pages: Page[] = [];
let current = 0;
const consoleLog: string[] = [];
const started = Date.now();
let shots = 0;

async function open(url: string): Promise<Page> {
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleLog.push(`[tab ${pages.indexOf(page)}] ${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleLog.push(`[tab ${pages.indexOf(page)}] pageerror: ${e.message}`));
  pages.push(page);
  // vision=deuteranopia (or protanopia, tritanopia, achromatopsia): the page drawn as that eye sees it, screenshots too.
  if (args.has("vision")) await (await context.newCDPSession(page)).send("Emulation.setEmulatedVisionDeficiency", { type: args.get("vision") as "deuteranopia" });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}
await open(URL0);
const page = (): Page => pages[current];

/** The game's year and builds, for the log only (null outside a run). */
async function gameState(): Promise<unknown> {
  return page()
    .evaluate(`(() => { const p = window.__panjimForTest; if (!p || !p.run) return null; const r = p.run; return { level: p.level?.id ?? null, year: r.year, turn: r.turnNumber, landed: [...(r.landed ?? [])], finished: !!r.finished, storm: !!p.host?.challengeFx?.isPlaying?.() }; })()`)
    .catch(() => null);
}

const VISIBLE_TEXT = `(() => {
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const parts = [];
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog, .result-cards, .brief-card, .help-card, .modal')].filter(vis);
  for (const d of dialogs) parts.push("[dialog] " + d.innerText.replace(/\\n{2,}/g, "\\n").trim());
  const seen = new Set(parts.join("\\n").split("\\n").map((s) => s.trim()));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const rest = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent.replace(/\\s+/g, " ").trim(); if (!t || seen.has(t) || !vis(n.parentElement) || n.parentElement.closest(".sr-only, .visually-hidden")) continue; seen.add(t); rest.push(t); }
  if (rest.length) parts.push("[screen] " + rest.join(" | "));
  return parts.join("\\n\\n");
})()`;

const BUTTONS = `(() => {
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.left < innerWidth && r.bottom > 0 && r.right > 0; };
  return [...document.querySelectorAll('button, a[href], [role="button"], [role="menuitem"], [role="switch"], [role="tab"], input, select, .build-card')].filter(vis).map((el) => { const r = el.getBoundingClientRect(); const words = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.value || "").replace(/\\s+/g, " ").trim(); return { words, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled") }; }).filter((b) => b.words);
})()`;

const num = (q: URLSearchParams, k: string, d = 0): number => (q.has(k) ? Number(q.get(k)) : d);

async function handle(cmd: string, q: URLSearchParams): Promise<unknown> {
  const p = page();
  switch (cmd) {
    case "shot": {
      const name = (q.get("name") ?? "shot").replace(/[^a-z0-9_-]/gi, "_");
      const file = path.join(OUT, `${String(++shots).padStart(3, "0")}-${name}.jpg`);
      await p.screenshot({ path: file, type: "jpeg", quality: 70 });
      return { file };
    }
    case "text":
      return { text: await p.evaluate(VISIBLE_TEXT) };
    case "buttons":
      return { buttons: await p.evaluate(BUTTONS) };
    case "click":
      await p.mouse.click(num(q, "x"), num(q, "y"), { button: (q.get("button") as "left" | "right") ?? "left", clickCount: num(q, "count", 1) });
      await p.waitForTimeout(250);
      return { ok: true };
    case "move":
      await p.mouse.move(num(q, "x"), num(q, "y"), { steps: 4 });
      await p.waitForTimeout(200);
      return { ok: true };
    case "drag":
      await p.mouse.move(num(q, "x1"), num(q, "y1"));
      await p.mouse.down();
      await p.mouse.move(num(q, "x2"), num(q, "y2"), { steps: 12 });
      await p.mouse.up();
      await p.waitForTimeout(250);
      return { ok: true };
    case "wheel":
      await p.mouse.move(num(q, "x", W / 2), num(q, "y", H / 2));
      await p.mouse.wheel(0, num(q, "dy", 100));
      await p.waitForTimeout(300);
      return { ok: true };
    case "key":
      await p.keyboard.press(q.get("k") ?? "Escape");
      await p.waitForTimeout(250);
      return { ok: true };
    case "type":
      await p.keyboard.type(q.get("t") ?? "");
      return { ok: true };
    case "clicktext": {
      const t = (q.get("t") ?? "").trim();
      const buttons = (await p.evaluate(BUTTONS)) as { words: string; x: number; y: number; disabled: boolean }[];
      const hit = buttons.find((b) => b.words === t) ?? buttons.find((b) => b.words.toLowerCase().includes(t.toLowerCase()));
      if (!hit) return { ok: false, error: `no visible button reads "${t}"`, buttons: buttons.map((b) => b.words) };
      await p.mouse.click(hit.x, hit.y);
      await p.waitForTimeout(300);
      return { ok: true, clicked: hit };
    }
    case "wait":
      await p.waitForTimeout(Math.min(60000, num(q, "ms", 1000)));
      return { ok: true };
    case "waitcalm": {
      const limit = Math.min(300, num(q, "s", 90)) * 1000;
      const t0 = Date.now();
      // Polls whether a storm plays; nothing is pressed or sped up.
      while (Date.now() - t0 < limit) {
        const playing = await p.evaluate("!!window.__panjimForTest?.host?.challengeFx?.isPlaying?.()").catch(() => false);
        if (!playing) break;
        await p.waitForTimeout(500);
      }
      await p.waitForTimeout(800);
      return { ok: true, waitedMs: Date.now() - t0 };
    }
    case "resize":
      W = num(q, "w", W);
      H = num(q, "h", H);
      await p.setViewportSize({ width: W, height: H });
      await p.waitForTimeout(600);
      return { ok: true };
    case "reload":
      await p.reload({ waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1500);
      return { ok: true };
    case "newtab":
      await open(p.url());
      current = pages.length - 1;
      await page().waitForTimeout(1500);
      return { ok: true, tab: current, tabs: pages.length };
    case "tab":
      current = Math.max(0, Math.min(pages.length - 1, num(q, "i")));
      await page().bringToFront();
      return { ok: true, tab: current };
    case "console": {
      const out = consoleLog.splice(0);
      return { messages: out };
    }
    case "quit":
      setTimeout(() => void browser.close().then(() => process.exit(0)), 100);
      return { ok: true };
    default:
      return { ok: false, error: `unknown command ${cmd}` };
  }
}

const log = fs.createWriteStream(path.join(OUT, "actions.jsonl"), { flags: "a" });
http
  .createServer((req, res) => {
    const u = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const cmd = u.pathname.replace(/^\//, "");
    const t = Date.now() - started;
    handle(cmd, u.searchParams)
      .then(async (out) => {
        const state = await gameState();
        log.write(`${JSON.stringify({ t, cmd, q: Object.fromEntries(u.searchParams), state, chars: cmd === "text" ? String((out as { text?: string }).text ?? "").length : undefined })}\n`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(out, null, 1));
      })
      .catch((e: Error) => {
        log.write(`${JSON.stringify({ t, cmd, error: e.message })}\n`);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });
  })
  .listen(PORT, () => console.log(`playtest driver on http://localhost:${PORT} (${W}x${H}), out ${OUT}`));
