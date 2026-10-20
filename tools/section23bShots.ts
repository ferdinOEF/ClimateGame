/**
 * Section 23b's targeted shots (the default QA gate): walkers near the Santa
 * Inez creek, the Taleigao wetland and the Ourem creek, on land and on the
 * bridges, never on the water. For each place a few walkers are set on the
 * road graph's tile nearest it (the walkers' own graph, `walkerLinks`), the
 * camera is brought close, and they walk on by themselves. Every frame the
 * tool watches, it counts the walkers standing on a water tile that is not a
 * drawn bridge (must be 0), and logs console errors (must be 0).
 *
 * Usage: npx tsx tools/section23bShots.ts <width> <height> [outDir=docs/qa/section23b]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1920", h = "1080", outDir = "docs/qa/section23b"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });
const map = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/maps/panaji.json"), "utf8")) as { bridges: [number, number][] };
const bridges = map.bridges.map(([q, r]) => `${q},${r}`);

/** The three places, and the tile each shot is centred on. */
const PLACES = [
  { name: "santa-inez-creek", label: "Santa Inez creek (the bridge at Campal, 6,11)", centre: { q: 7, r: 11 } },
  { name: "taleigao-wetland", label: "Taleigao wetland (the road ends at 6,23, its causeway gone)", centre: { q: 6, r: 23 } },
  { name: "ourem-creek", label: "Ourem creek by Patto (its roads stop at the bank)", centre: { q: 15, r: 10 } }
];

const server = await startDevServer(Number(process.env.PORT ?? 5474));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};

const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
});

await page.goto(`${server.url}/#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card", { timeout: 120000 });
await page.waitForFunction(`typeof window.__ambientLifeForTest === "function" && !!window.__ambientLifeForTest()`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);

const town = await page.evaluate(`window.__townForTest()`);
console.log(`town: ${JSON.stringify(town)}`);
check(((town as { decorMeshes: string[] }).decorMeshes ?? []).includes("town-bridges"), "the bridge decks are drawn");

/** Walkers on water that is not a drawn bridge, and walkers on a bridge, read from the drawn instances. */
const census = (): Promise<{ wet: string[]; onBridge: number; total: number }> =>
  page.evaluate(
    ([bridgeKeys]) => {
      const life = (window as unknown as { __ambientLifeForTest: () => { group: { children: { name: string; count: number; instanceMatrix: { array: Float32Array } }[] } } }).__ambientLifeForTest();
      const run = (window as unknown as { __panjimForTest: { run: { state: { placed: Map<string, { terrainId: string }> } } } }).__panjimForTest.run;
      const people = life.group.children.find((c) => c.name === "ambient-people")!;
      const bridgeSet = new Set(bridgeKeys as string[]);
      const wet: string[] = [];
      let onBridge = 0;
      for (let i = 0; i < people.count; i++) {
        const x = people.instanceMatrix.array[i * 16 + 12];
        const z = people.instanceMatrix.array[i * 16 + 14];
        // worldToAxial (hex size 1) with cube rounding.
        const fr = (2 / 3) * z;
        const fq = x / Math.sqrt(3) - fr / 2;
        const fs = -fq - fr;
        let q = Math.round(fq);
        let r = Math.round(fr);
        const s = Math.round(fs);
        const dq = Math.abs(q - fq);
        const dr = Math.abs(r - fr);
        const ds = Math.abs(s - fs);
        if (dq > dr && dq > ds) q = -r - s;
        else if (dr > ds) r = -q - s;
        const key = `${q},${r}`;
        const terrain = run.state.placed.get(key)?.terrainId;
        if (bridgeSet.has(key)) onBridge++;
        else if (terrain !== "land" && terrain !== "beach") wet.push(`walker ${i} on ${terrain} at ${key}`);
      }
      return { wet, onBridge, total: people.count };
    },
    [bridges] as const
  );

/** The census, with how many walkers are within 4 tiles of `centre` (in the shot). */
async function censusAt(centre: { q: number; r: number }): Promise<{ wet: string[]; onBridge: number; near: number; total: number }> {
  const all = await census();
  const near = (await page.evaluate(
    ([c]) => {
      const life = (window as unknown as { __ambientLifeForTest: () => { group: { children: { name: string; count: number; instanceMatrix: { array: Float32Array } }[] } } }).__ambientLifeForTest();
      const people = life.group.children.find((child) => child.name === "ambient-people")!;
      const centre = c as { q: number; r: number };
      const cx = Math.sqrt(3) * centre.q + (Math.sqrt(3) / 2) * centre.r;
      const cz = 1.5 * centre.r;
      let n = 0;
      for (let i = 0; i < people.count; i++) if (Math.hypot(people.instanceMatrix.array[i * 16 + 12] - cx, people.instanceMatrix.array[i * 16 + 14] - cz) < 4 * 1.732) n++;
      return n;
    },
    [centre] as const
  )) as number;
  return { ...all, near };
}
let wetEver = 0;
for (const place of PLACES) {
  // Four walkers set on the graph's tile nearest the place (and its neighbour on the graph), then left to walk.
  const placed = (await page.evaluate(
    ([c]) => {
      const centre = c as { q: number; r: number };
      const life = (window as unknown as { __ambientLifeForTest: () => { graph: Map<string, string[]>; walkers: { from: { q: number; r: number }; to: { q: number; r: number }; t: number; active: boolean; shown: number }[] } }).__ambientLifeForTest();
      const keys = [...life.graph.keys()].filter((k) => (life.graph.get(k) ?? []).length > 0);
      // Hex distance to the place (written inline: a named helper here would not survive the page boundary).
      const far = new Map(
        keys.map((k) => {
          const [q, r] = k.split(",").map(Number);
          return [k, (Math.abs(q - centre.q) + Math.abs(r - centre.r) + Math.abs(q + r - centre.q - centre.r)) / 2];
        })
      );
      keys.sort((a, b) => far.get(a)! - far.get(b)!);
      const used: string[] = [];
      for (let i = 0; i < 4 && i < life.walkers.length; i++) {
        const start = keys[i % Math.min(3, keys.length)];
        const next = life.graph.get(start)![i % life.graph.get(start)!.length];
        const [q, r] = start.split(",").map(Number);
        const [nq, nr] = next.split(",").map(Number);
        const walker = life.walkers[i];
        walker.from = { q, r };
        walker.to = { q: nq, r: nr };
        walker.t = 0.15 * i;
        walker.active = true;
        walker.shown = 1;
        used.push(`${start}->${next}`);
      }
      return used;
    },
    [place.centre] as const
  )) as string[];
  console.log(`${place.name}: walkers set on ${placed.join(" ")}`);
  await page.evaluate(`window.__panjimForTest.host.focusCamera(${JSON.stringify(place.centre)}, true, 0.32)`);
  await page.mouse.move(2, H - 2);
  // Let them walk, watching every half second.
  let wet: string[] = [];
  let bridgeSeen = 0;
  let nearMax = 0;
  for (let k = 0; k < 24; k++) {
    await page.waitForTimeout(500);
    const now = await censusAt(place.centre);
    wet = wet.concat(now.wet);
    bridgeSeen = Math.max(bridgeSeen, now.onBridge);
    nearMax = Math.max(nearMax, now.near);
  }
  wetEver += wet.length;
  await page.screenshot({ path: path.join(OUT, `walkers-${place.name}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
  check(wet.length === 0, `${place.label}: no walker on water without a bridge over 12 s (${wet.length}${wet.length ? `: ${[...new Set(wet)].slice(0, 4).join("; ")}` : ""})`);
  check(nearMax > 0, `${place.label}: walkers in the shot (up to ${nearMax} within 4 tiles; on a bridge anywhere: up to ${bridgeSeen})`);
}

check(wetEver === 0, `no walker on water anywhere in the run`);
check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
await server.stop();
process.exit(failed > 0 ? 1 : 0);
