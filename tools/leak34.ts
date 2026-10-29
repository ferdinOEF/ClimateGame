/**
 * Section 34: what grows in the JS heap run over run. Plays full Panjim runs in one tab (as tools/health34.ts does,
 * hurried through the game's own build path), takes a heap snapshot after run 1 and after the last, and prints the
 * constructors whose count and self size grew the most, with a few of their retainer paths.
 *
 * retain=<constructor> also prints retainer chains (up to the GC roots) for a sample of that constructor's objects in
 * the last snapshot, to find what keeps an old run alive.
 *
 * Usage: npx tsx tools/leak34.ts [runs=3] [url=http://localhost:4173] [retain=InstancedMesh]
 */
import { chromium, type CDPSession, type Page } from "playwright";
import fs from "node:fs";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2) as [string, string]));
const RUNS = Number(args.get("runs") ?? 3);
const URL0 = args.get("url") ?? "http://localhost:4173";
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] : [] });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

let lastRaw = "";
async function snapshot(session: CDPSession): Promise<Map<string, { count: number; size: number }>> {
  await session.send("HeapProfiler.enable");
  await session.send("HeapProfiler.collectGarbage");
  let json = "";
  const onChunk = (e: { chunk: string }): void => {
    json += e.chunk;
  };
  session.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await session.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  session.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  lastRaw = json;
  const snap = JSON.parse(json) as { snapshot: { meta: { node_fields: string[]; node_types: [string[]] } }; nodes: number[]; strings: string[] };
  const fields = snap.snapshot.meta.node_fields;
  const n = fields.length;
  const typeIdx = fields.indexOf("type");
  const nameIdx = fields.indexOf("name");
  const sizeIdx = fields.indexOf("self_size");
  const types = snap.snapshot.meta.node_types[0];
  const out = new Map<string, { count: number; size: number }>();
  for (let i = 0; i < snap.nodes.length; i += n) {
    const type = types[snap.nodes[i + typeIdx]];
    if (type !== "object" && type !== "closure" && type !== "array") continue;
    const name = `${type}:${snap.strings[snap.nodes[i + nameIdx]]}`;
    const e = out.get(name) ?? { count: 0, size: 0 };
    e.count++;
    e.size += snap.nodes[i + sizeIdx];
    out.set(name, e);
  }
  return out;
}

async function playRun(p: Page): Promise<void> {
  await p.waitForFunction(`!!window.__panjimForTest?.run`, undefined, { timeout: 60000 });
  for (let guard = 0; guard < 60; guard++) {
    if ((await p.evaluate("window.__panjimForTest.run.finished")) as boolean) break;
    await p.evaluate(`(() => { const c = window.__panjimForTest; const run = c.run; if (c.isBusy) return; const at = (k) => ({ q: +k.split(",")[0], r: +k.split(",")[1] });
      const pk = (run.objective?.picks ?? []).find((x) => run.state.canBuild(at(x.key), x.elementId));
      if (pk) { c.build(at(pk.key), pk.elementId); return; }
      for (const t of run.state.placed.values()) { const o = run.state.buildableAt(t.coord); if (o.length) { c.build(t.coord, o[o.length - 1].id); return; } } })()`);
    for (let k = 0; k < 600; k++) {
      await p.waitForTimeout(250);
      const speed = p.locator(".speed-up:visible");
      if (await speed.count()) await speed.first().click().catch(() => undefined);
      const next = p.locator(".result-cards:not([hidden]) .result-next");
      if (await next.isVisible().catch(() => false)) {
        if (/Play again|Restart|menu/i.test((await next.textContent()) ?? "")) break;
        await next.click().catch(() => undefined);
        continue;
      }
      if (!((await p.evaluate("window.__panjimForTest.isBusy || window.__panjimForTest.host.challengeFx.isPlaying()")) as boolean)) break;
    }
  }
  await p.waitForFunction(`[...document.querySelectorAll("button")].some((b) => /^(Play again|Restart)$/.test(b.textContent) && b.getClientRects().length)`, undefined, { timeout: 120000 }).catch(() => undefined);
}

await page.goto(`${URL0}/?qa=1&noname=1#/play/l01-first-rains`, { waitUntil: "load" });
await page.waitForFunction(`typeof window.__panjimScenarioForTest === "function" && !!document.querySelector(".brief-cta")`, undefined, { timeout: 120000 });
await page.locator(".brief-cta").first().click();
await page.waitForTimeout(2000);
let first: Map<string, { count: number; size: number }> | null = null;
for (let i = 1; i <= RUNS; i++) {
  await playRun(page);
  if (i === 1) first = await snapshot(cdp);
  if (i < RUNS) {
    await page.locator("button", { hasText: /^(Play again|Restart)$/ }).first().click();
    await page.waitForFunction(`!!document.querySelector(".brief-cta")`, undefined, { timeout: 120000 });
    await page.locator(".brief-cta").first().click();
    await page.waitForTimeout(2000);
  }
}
const last = await snapshot(cdp);
const rows = [...last].map(([name, e]) => ({ name, count: e.count - (first!.get(name)?.count ?? 0), size: e.size - (first!.get(name)?.size ?? 0) })).sort((a, b) => b.size - a.size);
console.log(`Heap growth from the end of run 1 to the end of run ${RUNS}, by constructor (self size):`);
console.log("| constructor | count delta | self size delta, KB |\n|---|---|---|");
for (const r of rows.slice(0, 30)) console.log(`| ${r.name} | ${r.count} | ${Math.round(r.size / 1024)} |`);
const total = rows.reduce((s, r) => s + r.size, 0);
console.log(`\nTotal self size delta: ${Math.round(total / 1024)} KB`);

const retain = args.get("retain");
if (retain) {
  const snap = JSON.parse(lastRaw) as { snapshot: { meta: { node_fields: string[]; node_types: [string[]]; edge_fields: string[]; edge_types: [string[]] } }; nodes: number[]; edges: number[]; strings: string[] };
  const nf = snap.snapshot.meta.node_fields, ef = snap.snapshot.meta.edge_fields;
  const N = nf.length, E = ef.length;
  const nType = nf.indexOf("type"), nName = nf.indexOf("name"), nEdges = nf.indexOf("edge_count"), nId = nf.indexOf("id");
  const eType = ef.indexOf("type"), eName = ef.indexOf("name_or_index"), eTo = ef.indexOf("to_node");
  const nodeTypes = snap.snapshot.meta.node_types[0], edgeTypes = snap.snapshot.meta.edge_types[0];
  const count = snap.nodes.length / N;
  const retainers: { from: number; label: string }[][] = Array.from({ length: count }, () => []);
  let edge = 0;
  for (let i = 0; i < count; i++) {
    const ec = snap.nodes[i * N + nEdges];
    for (let k = 0; k < ec; k++, edge += E) {
      const t = edgeTypes[snap.edges[edge + eType]];
      if (t === "weak" || t === "shortcut") continue;
      const to = snap.edges[edge + eTo] / N;
      const nm = t === "element" || t === "hidden" ? String(snap.edges[edge + eName]) : snap.strings[snap.edges[edge + eName]];
      retainers[to].push({ from: i, label: `${t}:${nm}` });
    }
  }
  const label = (i: number): string => `${nodeTypes[snap.nodes[i * N + nType]]}:${snap.strings[snap.nodes[i * N + nName]].slice(0, 60)}@${snap.nodes[i * N + nId]}`;
  const targets: number[] = [];
  for (let i = 0; i < count && targets.length < 400; i++) if (snap.strings[snap.nodes[i * N + nName]] === retain && nodeTypes[snap.nodes[i * N + nType]] === "object") targets.push(i);
  // Shortest path from the roots (node 0) to each target, by BFS over forward edges.
  const prev = new Int32Array(count).fill(-1);
  const prevLabel: string[] = new Array(count);
  const forward: { to: number; label: string }[][] = Array.from({ length: count }, () => []);
  for (let to = 0; to < count; to++) for (const r of retainers[to]) forward[r.from].push({ to, label: r.label });
  const queue = [0];
  prev[0] = 0;
  for (let q = 0; q < queue.length; q++) for (const e of forward[queue[q]]) if (prev[e.to] === -1) { prev[e.to] = queue[q]; prevLabel[e.to] = e.label; queue.push(e.to); }
  const seen = new Set<string>();
  console.log(`
Retainer chains for ${retain} (${targets.length} found), grouped by the chain's top:`);
  for (const t of targets) {
    const chain: string[] = [];
    let at = t;
    for (let d = 0; d < 30 && at !== 0 && prev[at] !== -1; d++) { chain.push(`${prevLabel[at]} <- ${label(prev[at])}`); at = prev[at]; }
    const key = chain.slice(-6).join(" | ");
    if (seen.has(key) || !/canvas data-engine|onMaterialDispose|onTextureDispose|onGeometryDispose|WeakMap|_listeners/.test(chain.join(" "))) continue;
    seen.add(key);
    console.log(`- ${label(t)}\n    ${chain.slice(0, 30).join("\n    ")}`);
    if (seen.size >= 12) break;
  }
}
await browser.close();
