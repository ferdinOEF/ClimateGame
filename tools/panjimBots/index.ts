/**
 * The Section 4 balance report: every archetype on every seed, over a full
 * playthrough of Panaji, and each defence's margin in Smart's hands.
 *
 * Usage:  npm run bots            (archetypes)
 *         npm run bots -- margins (also: Smart with each defence left out)
 *         BOT_SEEDS=5 npm run bots (fewer seeds, for a quick look)
 *
 * Writes the tables to stdout as Markdown; docs/qa/section4/bots.md keeps the
 * last full run. Seeds are listed so any row can be re-run.
 */
import { PERSONAS, SEEDS, runBot, runSmartWithout, savedShare, type BotResult, type Persona } from "./bots";

const seeds = SEEDS.slice(0, Number(process.env.BOT_SEEDS ?? SEEDS.length));
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

if (process.argv.includes("margins")) {
  const smart = results.get("smart")!;
  const base = smart.reduce((s, r) => s + savedShare(r), 0) / smart.length;
  lines.push("", "## Each defence's margin (Smart, with that defence never built)", "", `Smart with everything: ${pct(base)} of houses in the storms' paths saved.`, "", "| Left out | Houses saved | Margin (points) |", "|---|---|---|");
  for (const elementId of ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"]) {
    const rs = seeds.map((seed) => runSmartWithout(elementId, seed));
    const share = rs.reduce((s, r) => s + savedShare(r), 0) / rs.length;
    lines.push(`| ${elementId} | ${pct(share)} | ${((base - share) * 100).toFixed(1)} |`);
  }
}

console.log(lines.join("\n"));
