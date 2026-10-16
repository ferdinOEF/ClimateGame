/**
 * The balance report (Section 7, yearly turns): every archetype on every
 * seed, over a full playthrough of Panaji, with its win rate, each defence's
 * margin in Smart's hands, and Smart held to one kind of defence.
 *
 * Usage:  npm run bots            (archetypes)
 *         npm run bots -- margins (also: the margins and the one-kind runs)
 *         BOT_SEEDS=5 npm run bots (fewer seeds, for a quick look)
 *
 * Writes the tables to stdout as Markdown; docs/qa/section7/bots.md keeps the
 * last full run. Seeds are listed so any row can be re-run.
 *
 * Smart is slow (it simulates every candidate build), so its runs are split
 * by seed over BOT_JOBS child processes (default 3). Each child plays Smart
 * on its seeds, replays each Smart run with one element left out (the
 * margin), and, with margins, plays Smart limited to one kind.
 */
import { spawn } from "node:child_process";
import { PERSONAS, SEEDS, replaySmartWithout, runBot, runSmartOnly, smartRun, savedShare, survived, won, type BotResult, type Persona } from "./bots";

const seeds = SEEDS.slice(0, Number(process.env.BOT_SEEDS ?? SEEDS.length));
const ELEMENTS = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"];
const withMargins = process.argv.includes("margins");

interface SmartSeed {
  smart: BotResult;
  /** Houses saved with each element's builds replayed as waiting. */
  without: Record<string, number>;
  /** Houses saved by Smart building only that element. */
  only: Record<string, number>;
}

// A child process: Smart on the seeds it was given, printed as JSON.
const childSeeds = process.argv.find((a) => a.startsWith("--seeds="))?.slice("--seeds=".length);
if (childSeeds !== undefined) {
  const out: Record<string, SmartSeed> = {};
  for (const seed of childSeeds.split(",").filter(Boolean)) {
    const without: Record<string, number> = {};
    const only: Record<string, number> = {};
    const { result, log } = smartRun(seed);
    if (withMargins) {
      for (const id of ELEMENTS) {
        without[id] = savedShare(replaySmartWithout(id, seed, log));
        only[id] = savedShare(runSmartOnly(id, seed));
      }
    }
    out[seed] = { smart: result, without, only };
  }
  console.log(JSON.stringify(out));
  process.exit(0);
}

/** Smart's seeds, split over `jobs` child processes. */
async function smartRuns(jobs: number): Promise<Map<string, SmartSeed>> {
  const chunks: string[][] = Array.from({ length: jobs }, () => []);
  seeds.forEach((seed, i) => chunks[i % jobs].push(seed));
  const parts = await Promise.all(
    chunks
      .filter((c) => c.length > 0)
      .map(
        (chunk) =>
          new Promise<Record<string, SmartSeed>>((resolve, reject) => {
            const args = [...process.execArgv, process.argv[1], `--seeds=${chunk.join(",")}`, ...(withMargins ? ["margins"] : [])];
            const child = spawn(process.execPath, args, { env: process.env, stdio: ["ignore", "pipe", "inherit"] });
            let buf = "";
            child.stdout.on("data", (d) => (buf += d));
            child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(buf.trim().split("\n").pop()!)) : reject(new Error(`smart ${chunk} exited ${code}`))));
          })
      )
  );
  return new Map(parts.flatMap((p) => Object.entries(p)));
}

const smartPromise = smartRuns(Number(process.env.BOT_JOBS ?? 3));
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const lines: string[] = [];
const results = new Map<Persona, BotResult[]>();
for (const persona of PERSONAS) if (persona !== "smart") results.set(persona, seeds.map((seed) => runBot(persona, seed)));
const smart = await smartPromise;
results.set("smart", seeds.map((seed) => smart.get(seed)!.smart));

lines.push("## Archetypes", "", `${seeds.length} seeds: ${seeds.join(", ")}`, "");
lines.push("A run is **won** when the level ends on three stars (the storms' stars averaged and rounded: at most one storm short of three stars, none below two). **2★ every storm** is the softer reading: every storm at two stars or more.", "");
lines.push("| Archetype | Won | 2★ every storm | Houses saved (all storms) | min | median | max | Stars per storm (mean) | Index (mean) |", "|---|---|---|---|---|---|---|---|---|");
for (const persona of PERSONAS) {
  const rs = results.get(persona)!;
  const shares = rs.map(savedShare).sort((a, b) => a - b);
  const stars = [0, 1, 2].map((i) => (rs.reduce((s, r) => s + (r.stars[i] ?? 0), 0) / rs.length).toFixed(1)).join(" / ");
  const index = Math.round(rs.reduce((s, r) => s + r.index, 0) / rs.length);
  const wins = rs.filter(won).length;
  const soft = rs.filter(survived).length;
  lines.push(`| ${persona} | ${wins}/${rs.length} (${pct(wins / rs.length)}) | ${soft}/${rs.length} | ${pct(mean(shares))} | ${pct(shares[0])} | ${pct(shares[Math.floor(shares.length / 2)])} | ${pct(shares[shares.length - 1])} | ${stars} | ${index} |`);
}
const casual = results.get("casual")!;
const greedyWins = results.get("greedy")!.filter((g, i) => savedShare(g) > savedShare(casual[i])).map((g) => g.seed);
lines.push("", `Greedy beats Casual on ${greedyWins.length} of ${seeds.length} seeds${greedyWins.length ? ` (${greedyWins.join(", ")})` : ""}.`);

lines.push("", "## How often the wind decides a home (Section 12)", "", "Homes lost whose water alone stayed under the house-loss line: the wind tipped them. Mean per run, and as a share of the homes lost in that storm.", "", "| Archetype | 2030 cyclone | 2040 flood | 2050 compound |", "|---|---|---|---|");
for (const persona of PERSONAS) {
  const rs = results.get(persona)!;
  const cells = [0, 1, 2].map((i) => {
    const decided = rs.reduce((s, r) => s + (r.windDecided[i] ?? 0), 0);
    const lost = rs.reduce((s, r) => s + ((r.houses[i]?.total ?? 0) - (r.houses[i]?.saved ?? 0)), 0);
    return `${(decided / rs.length).toFixed(1)} (${lost > 0 ? pct(decided / lost) : "0%"})`;
  });
  lines.push(`| ${persona} | ${cells.join(" | ")} |`);
}

lines.push("", "## Every run", "", "| Archetype | Seed | Storm 1 saved | Storm 2 saved | Storm 3 saved | All | Stars | Won | Builds | Resilience | Biodiversity | Population | Food |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const persona of PERSONAS) {
  for (const r of results.get(persona)!) {
    const storms = r.houses.map((h) => `${h.saved}/${h.total}`);
    while (storms.length < 3) storms.push("–");
    const c = r.components;
    lines.push(`| ${persona} | ${r.seed} | ${storms.join(" | ")} | ${pct(savedShare(r))} | ${r.stars.join("")} | ${won(r) ? "yes" : "no"} | ${r.decisions} | ${c.resilience} | ${c.biodiversity} | ${c.population} | ${c.food} |`);
  }
}

const smartRows = results.get("smart")!;
lines.push("", "## What each builds (mean per run)", "", "Away: builds made where no storm's water reaches (they protect nothing, so they are not counted as defences).", "", `| Archetype | ${ELEMENTS.join(" | ")} | away |`, `|---|${ELEMENTS.map(() => "---").join("|")}|---|`);
for (const persona of PERSONAS) {
  const rs = results.get(persona)!;
  lines.push(`| ${persona} | ${ELEMENTS.map((id) => (rs.reduce((s, r) => s + (r.built[id] ?? 0), 0) / rs.length).toFixed(1)).join(" | ")} | ${(rs.reduce((s, r) => s + r.buildsAway, 0) / rs.length).toFixed(1)} |`);
}

if (withMargins) {
  const base = mean(smartRows.map(savedShare));
  lines.push(
    "",
    "## Each defence's margin (Smart's own run, replayed with that defence left out)",
    "",
    `Smart with everything: ${pct(base)} of houses in the storms' paths saved. Each build of the left-out defence is made away from the storms instead (it is still the year's build); every other action is replayed as it was, so nothing re-plans round the gap.`,
    "",
    "| Left out | Houses saved | Margin (points) | Margin per seed (points) |",
    "|---|---|---|---|"
  );
  for (const id of ELEMENTS) {
    const per = seeds.map((seed) => savedShare(smart.get(seed)!.smart) - smart.get(seed)!.without[id]);
    lines.push(`| ${id} | ${pct(base - mean(per))} | ${(mean(per) * 100).toFixed(1)} | ${per.map((x) => (x * 100).toFixed(0)).join(" ")} |`);
  }
  lines.push("", "## One kind only (Smart, building nothing but that defence)", "", "No single defence should come near the mix.", "", "| Only | Houses saved | Behind Smart (points) | Per seed |", "|---|---|---|---|");
  for (const id of ELEMENTS) {
    const rs = seeds.map((seed) => smart.get(seed)!.only[id]);
    lines.push(`| ${id} | ${pct(mean(rs))} | ${((base - mean(rs)) * 100).toFixed(1)} | ${rs.map(pct).join(" ")} |`);
  }
}

console.log(lines.join("\n"));
