/**
 * The Section 4 balance report: every archetype on every seed, over a full
 * playthrough of Panaji, and each defence's margin in Smart's hands.
 *
 * Usage:  npm run bots            (archetypes)
 *         npm run bots -- margins (also: Smart with each defence left out)
 *         BOT_SEEDS=5 npm run bots (fewer seeds, for a quick look)
 *
 * Smart is slow (it simulates every candidate build), so the margins run in
 * parallel child processes, BOT_JOBS at a time (default 3).
 *
 * Writes the tables to stdout as Markdown; docs/qa/section4/bots.md keeps the
 * last full run. Seeds are listed so any row can be re-run.
 */
import { spawn } from "node:child_process";
import { PERSONAS, SEEDS, runBot, runSmartOnly, runSmartWithout, savedShare, type BotResult, type Persona } from "./bots";

const seeds = SEEDS.slice(0, Number(process.env.BOT_SEEDS ?? SEEDS.length));
const MARGIN_ELEMENTS = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"];

// A child process: one element left out (--without=) or the only one built (--only=), printed as JSON.
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const without = arg("without");
const only = arg("only");
if (without || only) {
  console.log(JSON.stringify(seeds.map((seed) => savedShare(without ? runSmartWithout(without, seed) : runSmartOnly(only!, seed)))));
  process.exit(0);
}

/** Runs each left-out element in its own process, `jobs` at a time. */
async function marginShares(jobs: number): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const queue = MARGIN_ELEMENTS.flatMap((id) => [`without=${id}`, `only=${id}`]);
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const text = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, process.argv[1], `--${id}`], { env: process.env, stdio: ["ignore", "pipe", "inherit"] });
        let buf = "";
        child.stdout.on("data", (d) => (buf += d));
        child.on("exit", (code) => (code === 0 ? resolve(buf) : reject(new Error(`margin ${id} exited ${code}`))));
      });
      out.set(id, JSON.parse(text.trim().split("\n").pop()!));
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  return out;
}

const margins = process.argv.includes("margins") ? marginShares(Number(process.env.BOT_JOBS ?? 3)) : null;
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const lines: string[] = [];
const results = new Map<Persona, BotResult[]>();

for (const persona of PERSONAS) results.set(persona, seeds.map((seed) => runBot(persona, seed)));

lines.push("## Archetypes", "", `${seeds.length} seeds: ${seeds.join(", ")}`, "");
lines.push("| Archetype | Houses saved (all storms) | min | median | max | Stars per storm (mean) | Index (mean) |", "|---|---|---|---|---|---|---|");
for (const persona of PERSONAS) {
  const rs = results.get(persona)!;
  const shares = rs.map(savedShare).sort((a, b) => a - b);
  const mean = shares.reduce((s, x) => s + x, 0) / shares.length;
  const stars = [0, 1, 2].map((i) => (rs.reduce((s, r) => s + (r.stars[i] ?? 0), 0) / rs.length).toFixed(1)).join(" / ");
  const index = Math.round(rs.reduce((s, r) => s + r.index, 0) / rs.length);
  lines.push(`| ${persona} | ${pct(mean)} | ${pct(shares[0])} | ${pct(shares[Math.floor(shares.length / 2)])} | ${pct(shares[shares.length - 1])} | ${stars} | ${index} |`);
}

lines.push("", "## Every run", "", "| Archetype | Seed | Storm 1 saved | Storm 2 saved | Storm 3 saved | All | Stars | Resilience | Biodiversity | Livelihoods | Population | Food |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const persona of PERSONAS) {
  for (const r of results.get(persona)!) {
    const storms = r.houses.map((h) => `${h.saved}/${h.total}`);
    while (storms.length < 3) storms.push("–");
    const c = r.components;
    lines.push(`| ${persona} | ${r.seed} | ${storms.join(" | ")} | ${pct(savedShare(r))} | ${r.stars.join("")} | ${c.resilience} | ${c.biodiversity} | ${c.livelihoods} | ${c.population} | ${c.food} |`);
  }
}

if (margins) {
  const smart = results.get("smart")!;
  const base = smart.reduce((s, r) => s + savedShare(r), 0) / smart.length;
  const shares = await margins;
  lines.push("", "## Each defence's margin (Smart, with that defence never built)", "", `Smart with everything: ${pct(base)} of houses in the storms' paths saved.`, "", "| Left out | Houses saved | Margin (points) | Per seed |", "|---|---|---|---|");
  for (const elementId of MARGIN_ELEMENTS) {
    const rs = shares.get(`without=${elementId}`)!;
    const share = rs.reduce((s, x) => s + x, 0) / rs.length;
    lines.push(`| ${elementId} | ${pct(share)} | ${((base - share) * 100).toFixed(1)} | ${rs.map(pct).join(" ")} |`);
  }
  lines.push("", "## One kind only (Smart, building nothing but that defence)", "", "No single defence should come near the mix.", "", "| Only | Houses saved | Behind Smart (points) | Per seed |", "|---|---|---|---|");
  for (const elementId of MARGIN_ELEMENTS) {
    const rs = shares.get(`only=${elementId}`)!;
    const share = rs.reduce((s, x) => s + x, 0) / rs.length;
    lines.push(`| ${elementId} | ${pct(share)} | ${((base - share) * 100).toFixed(1)} | ${rs.map(pct).join(" ")} |`);
  }
}

console.log(lines.join("\n"));
