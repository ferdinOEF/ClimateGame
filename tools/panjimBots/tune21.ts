/**
 * Section 21.2: the six play styles (bots.ts STYLES) over many seeds, with
 * the storms' strengths and the star thresholds given on the command line,
 * changed inside this process only (never the data on disk). For each storm
 * and for the whole run: homes saved (mean, and the 10th to 90th percentile
 * across seeds), the stars (share of seeds on 1, 2 and 3), landmarks lost,
 * and the share of seeds that clear the level (at least 5 stars of 9).
 *
 * Usage: npx tsx tools/panjimBots/tune21.ts [s1=1.2] [s2=1.8] [s3=2.6] [three=0.79] [two=0.5] [seeds=200] [jobs=4] [styles=far,random,...]
 * Writes Markdown to stdout.
 */
import { spawn } from "node:child_process";
import { BOT_LEVEL, STYLES, runBot, percentile, type BotResult, type Persona } from "./bots";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split("=") as [string, string]));
const num = (key: string, fallback: number): number => (args.has(key) ? Number(args.get(key)) : fallback);
const challenges = BOT_LEVEL.climate!.challenges;
const strengths = [num("s1", challenges[0].strength), num("s2", challenges[1].strength), num("s3", challenges[2].strength)];
const stars = { three: num("three", BOT_LEVEL.houseStars!.three), two: num("two", BOT_LEVEL.houseStars!.two) };
strengths.forEach((s, i) => (challenges[i].strength = s));
BOT_LEVEL.houseStars!.three = stars.three;
BOT_LEVEL.houseStars!.two = stars.two;
const styles = (args.get("styles")?.split(",") ?? STYLES) as Persona[];
const seedCount = num("seeds", 200);
const jobs = num("jobs", 4);

type Slim = Pick<BotResult, "persona" | "seed" | "stars" | "houses" | "landmarksLost" | "built">;

// A child: its share of the (style, seed) runs, as JSON.
const childJobs = args.get("child");
if (childJobs !== undefined) {
  const out: Slim[] = [];
  for (const item of childJobs.split(";").filter(Boolean)) {
    const [persona, seed] = item.split("|") as [Persona, string];
    const r = runBot(persona, seed);
    out.push({ persona: r.persona, seed: r.seed, stars: r.stars, houses: r.houses, landmarksLost: r.landmarksLost, built: r.built });
  }
  console.log(JSON.stringify(out));
  process.exit(0);
}

const items: string[] = [];
for (const style of styles) for (let i = 1; i <= seedCount; i++) items.push(`${style}|tune-seed-${i}`);
const chunks: string[][] = Array.from({ length: jobs }, () => []);
items.forEach((item, i) => chunks[i % jobs].push(item));
const passOn = [...args].filter(([k]) => k !== "child" && k !== "jobs" && k !== "seeds" && k !== "styles").map(([k, v]) => `${k}=${v}`);
const results: Slim[] = (
  await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<Slim[]>((resolve, reject) => {
          const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...passOn, `child=${chunk.join(";")}`], { stdio: ["ignore", "pipe", "inherit"] });
          let text = "";
          child.stdout.on("data", (d) => (text += d));
          child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(text.trim().split("\n").pop()!)) : reject(new Error(`child exited ${code}`))));
        })
    )
  )
).flat();

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const share = (h: { saved: number; total: number }): number => (h.total > 0 ? h.saved / h.total : 1);
console.log(`Strengths ${strengths.join(" / ")}; stars at ${stars.three} (three) and ${stars.two} (two); ${seedCount} seeds a style.\n`);
console.log("| Style | Storm | Homes saved, mean (p10 to p90) | Stars 1 / 2 / 3 | Landmarks lost, mean (max) |\n|---|---|---|---|---|");
const summary: string[] = [];
for (const style of styles) {
  const runs = results.filter((r) => r.persona === style);
  for (let s = 0; s <= challenges.length; s++) {
    const whole = s === challenges.length;
    const shares = runs.map((r) => (whole ? share({ saved: r.houses.reduce((a, h) => a + h.saved, 0), total: r.houses.reduce((a, h) => a + h.total, 0) }) : share(r.houses[s])));
    const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
    const starCounts = whole ? null : [1, 2, 3].map((k) => runs.filter((r) => r.stars[s] === k).length / runs.length);
    const lost = runs.map((r) => (whole ? r.landmarksLost.reduce((a, b) => a + b, 0) : r.landmarksLost[s]));
    const label = whole ? "whole run" : `${challenges[s].year} ${challenges[s].name.toLowerCase()}`;
    const starText = starCounts ? starCounts.map(pct).join(" / ") : `total ${(runs.reduce((a, r) => a + r.stars.reduce((x, y) => x + y, 0), 0) / runs.length).toFixed(1)} of 9`;
    console.log(`| ${style} | ${label} | ${pct(mean)} (${pct(percentile(shares, 10))} to ${pct(percentile(shares, 90))}) | ${starText} | ${(lost.reduce((a, b) => a + b, 0) / lost.length).toFixed(1)} (${Math.max(...lost)}) |`);
  }
  const cleared = runs.filter((r) => r.stars.reduce((a, b) => a + b, 0) >= 5).length / runs.length;
  const nine = runs.filter((r) => r.stars.every((x) => x === 3)).length / runs.length;
  summary.push(`| ${style} | ${pct(cleared)} | ${pct(nine)} |`);
}
console.log(`\n| Style | Clears the level (at least 5 stars of 9) | 3 stars in every storm |\n|---|---|---|\n${summary.join("\n")}`);
