/**
 * Section 40.6: proof that the game's own screen did not change. Two in game frames that two runs of the same code
 * draw alike (the fake clock of tools/frozenFrame.ts, and one fixed value for Math.random), taken on a checkout of master and on
 * this one with `noname=1&noguide=1`, then compared pixel by pixel.
 *
 *   calm   Play Panjim's first year: the board, the HUD card and Maya with her line.
 *   menu   the build menu open on the objective's tile (the keyboard's O, then Enter).
 *
 * Software GL by default (about a frame a second); `GPU=1` in the environment draws on the real GPU, which is only a
 * proof when the same checkout shot twice gives the same pixels (shoot master twice and compare the two first).
 *
 * Usage: npx tsx tools/section40Frames.ts shoot root=<checkout> out=<dir> [w=1366] [h=768] [port=5261]
 *        npx tsx tools/section40Frames.ts compare a=<dir> b=<dir> [out=<dir for the difference pictures>]
 * `compare` exits 1 when any frame differs.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { glArgs } from "./devServer";

const [mode, ...rest] = process.argv.slice(2);
const args = new Map(rest.filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const W = Number(args.get("w") ?? 1366);
const H = Number(args.get("h") ?? 768);
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;

async function shoot(): Promise<void> {
  const root = path.resolve(args.get("root") ?? ".");
  const out = path.resolve(args.get("out") ?? "docs/qa/section40/frames");
  const port = Number(args.get("port") ?? 5261);
  fs.mkdirSync(out, { recursive: true });
  // The checkout's own Vite config, served from here. `fs.strict` is off so a checkout whose node_modules is a link to
  // another folder (a second worktree) can still serve its fonts; both checkouts are served the same way.
  const server = await createServer({ root, configFile: path.join(root, "vite.config.ts"), logLevel: "error", server: { port, strictPort: true, fs: { strict: false } } });
  await server.listen();
  const url = `http://localhost:${port}`;
  try {
    const browser = await chromium.launch({ args: glArgs(), ...(executablePath ? { executablePath } : {}) });
    const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    // The board is not asked: the dev server has no /api, and both runs must see the same answer.
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"rows":[],"season":"QA"}' }));
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* blocked */
      }
      // One fixed value for Math.random: the clouds (and their shadows on the sea), the walkers and the boats are
      // placed with it as the game loads, in an order that follows how fast the files arrive. A seeded sequence gave
      // three different skies in five runs of the same code; one value gives the same sky every run.
      Math.random = () => 0.5;
    });
    await page.clock.install({ time: new Date("2026-06-01T09:00:00Z") });
    await page.clock.pauseAt(new Date("2026-06-01T09:00:01Z"));
    const steps = async (n: number): Promise<void> => {
      for (let i = 0; i < n; i++) {
        await page.clock.runFor(50);
        await new Promise((r) => setTimeout(r, 15));
      }
    };
    const stepUntil = async (code: string, max = 6000): Promise<boolean> => {
      for (let i = 0; i < max; i++) {
        if (await page.evaluate(code).catch(() => false)) return true;
        await steps(1);
      }
      return false;
    };
    const frame = async (name: string): Promise<void> => {
      // Straight from the compositor: Playwright's own screenshot waits for an animation frame the held clock withholds.
      const cdp = await page.context().newCDPSession(page);
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
      await cdp.detach();
      fs.writeFileSync(path.join(out, `${name}-${W}x${H}.png`), Buffer.from(data, "base64"));
      console.log(`frame ${name}`);
    };

    // Warm the server first (a cold Vite transforms every module on the first request), on a page of its own.
    const warm = await browser.newPage({ viewport: { width: W, height: H } });
    await warm.goto(`${url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    await warm.waitForSelector(".brief-cta", { state: "attached", timeout: 180000 });
    await warm.close();
    await page.goto(`${url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
    // The game loads with the fake clock standing still (real time passes, the game's time does not), so its clock
    // reads the same on a fast checkout and a slow one when the steps below begin. Stepped only if it will not load so.
    let loaded = false;
    for (let i = 0; i < 600 && !loaded; i++) {
      loaded = Boolean(await page.evaluate(`!!document.querySelector(".brief-cta") && !!window.__panjimForTest`).catch(() => false));
      if (!loaded) await new Promise((r) => setTimeout(r, 100));
    }
    if (!loaded) {
      console.log("WARNING: the game needed the clock to load; the two checkouts may not be in step");
      if (!(await stepUntil(`!!document.querySelector(".brief-cta") && !!window.__panjimForTest`))) throw new Error("the game did not load");
    }
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.evaluate("document.fonts.ready");
    // CSS animations and transitions run on the compositor's own clock, not the fake one: they end at once here.
    await page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition: none !important; }" });
    console.log(`the game's clock at the first step: ${await page.evaluate("Date.now() - Date.parse('2026-06-01T09:00:00Z')")} ms`);
    await steps(40);
    // DOM clicks (with the clock held Playwright's own click waits for frames that never come). How to play's Next,
    // where there is one (Section 40.3), then "Let's Play!".
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) {
        const next = document.querySelector<HTMLButtonElement>(".howto-next");
        if (next && !next.hidden) next.click();
      }
      document.querySelector<HTMLButtonElement>(".brief-cta")!.click();
    });
    // The same number of steps on both checkouts: the year's opening plays out (8 s of the game's clock).
    await steps(160);
    await page.mouse.move(2, H - 2);
    await steps(20);
    await frame("calm");
    // The build menu, on the objective's first pulsing tile, by the keyboard: O goes to it, Enter opens it.
    await page.evaluate(() => document.querySelector<HTMLCanvasElement>(".game-layer canvas")!.focus());
    await page.keyboard.press("o");
    await steps(60);
    await page.keyboard.press("Enter");
    await steps(40);
    if (!(await page.evaluate(`!!document.querySelector(".build-popover .build-card")`))) throw new Error("the build menu did not open");
    await steps(20);
    await frame("menu");
    console.log(`the game's clock at the last frame: ${await page.evaluate("Date.now() - Date.parse('2026-06-01T09:00:00Z')")} ms`);
    await browser.close();
    if (errors.length) console.log(`console errors: ${errors.slice(0, 3).join(" | ")}`);
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await server.close();
  }
}

async function compare(): Promise<void> {
  const a = path.resolve(args.get("a") ?? "");
  const b = path.resolve(args.get("b") ?? "");
  const out = args.get("out") ? path.resolve(args.get("out")!) : null;
  if (out) fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage();
  // tsx names the arrow functions below with a helper the page does not have.
  await page.evaluate("globalThis.__name = (f) => f");
  let differing = 0;
  for (const file of fs.readdirSync(a).filter((f) => f.endsWith(".png")).sort()) {
    if (!fs.existsSync(path.join(b, file))) {
      console.log(`${file}: missing in ${b}`);
      differing++;
      continue;
    }
    const data = [a, b].map((dir) => `data:image/png;base64,${fs.readFileSync(path.join(dir, file)).toString("base64")}`);
    const result = await page.evaluate(async ([one, two]) => {
      const load = (src: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("not a picture"));
          img.src = src;
        });
      const [x, y] = await Promise.all([load(one), load(two)]);
      if (x.width !== y.width || x.height !== y.height) return { width: x.width, height: x.height, sameSize: false, different: -1, maxDelta: -1, box: null as number[] | null, picture: "" };
      const pixels = (img: HTMLImageElement): ImageData => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const p = pixels(x);
      const q = pixels(y);
      const marks = new ImageData(x.width, x.height);
      let different = 0;
      let maxDelta = 0;
      let box: number[] | null = null;
      for (let i = 0; i < p.data.length; i += 4) {
        const delta = Math.max(Math.abs(p.data[i] - q.data[i]), Math.abs(p.data[i + 1] - q.data[i + 1]), Math.abs(p.data[i + 2] - q.data[i + 2]), Math.abs(p.data[i + 3] - q.data[i + 3]));
        const grey = Math.round((p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3 / 3) + 160;
        marks.data.set(delta > 0 ? [220, 0, 60, 255] : [grey, grey, grey, 255], i);
        if (delta === 0) continue;
        different++;
        maxDelta = Math.max(maxDelta, delta);
        const px = (i / 4) % x.width;
        const py = Math.floor(i / 4 / x.width);
        box = box ? [Math.min(box[0], px), Math.min(box[1], py), Math.max(box[2], px), Math.max(box[3], py)] : [px, py, px, py];
      }
      const canvas = document.createElement("canvas");
      canvas.width = x.width;
      canvas.height = x.height;
      canvas.getContext("2d")!.putImageData(marks, 0, 0);
      return { width: x.width, height: x.height, sameSize: true, different, maxDelta, box, picture: different > 0 ? canvas.toDataURL("image/png") : "" };
    }, data);
    const total = result.width * result.height;
    if (!result.sameSize) {
      console.log(`${file}: the sizes differ`);
      differing++;
    } else if (result.different === 0) console.log(`${file}: identical, 0 of ${total} pixels differ (${result.width} x ${result.height})`);
    else {
      differing++;
      console.log(`${file}: ${result.different} of ${total} pixels differ (${((100 * result.different) / total).toFixed(4)}%), largest step ${result.maxDelta} of 255, inside x ${result.box![0]} to ${result.box![2]}, y ${result.box![1]} to ${result.box![3]}`);
      if (out) fs.writeFileSync(path.join(out, file.replace(/\.png$/, "-difference.png")), Buffer.from(result.picture.split(",")[1], "base64"));
    }
  }
  await browser.close();
  console.log(differing === 0 ? "ALL IDENTICAL" : `${differing} DIFFER`);
  process.exitCode = differing === 0 ? 0 : 1;
}

if (mode === "shoot") await shoot();
else if (mode === "compare") await compare();
else {
  console.log("usage: section40Frames.ts shoot root=<checkout> out=<dir> | compare a=<dir> b=<dir>");
  process.exitCode = 1;
}
