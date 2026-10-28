/**
 * Section 35.6: tunes Play Panjim's point values on the bots (20 seeds) and the best plan (tools/bestPlan's, as
 * pinned for this board in docs/qa/section34c/best_plan.json).
 *
 * Each bot's run is played once; its build log is then replayed through `newPanjimRun` with points on, which gives
 * the facts every source counts (homes saved, places saved, objectives done, living coast standing and protecting,
 * the biodiversity rise, veterans). The facts do not depend on the values, so candidate values are scored on them at
 * once. Only the values change; never the hazard model. The stars are checked to be the bots' own.
 *
 * Targets (the owner's):
 *   1. in a best play run no single source is more than 40% of the total;
 *   2. a mixed run (Smart: dunes, pandanus, mangroves, khazans and walls where they fit) beats an all seawall run
 *      (Smart limited to seawalls and breakwaters) by at least 15% on every seed;
 *   3. random play and best play are far enough apart to rank people.
 *
 * Usage: npx tsx tools/panjimBots/points35.ts [jobs=4] [seeds=20] [out=docs/qa/section35/points.md]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { playedRun, SEEDS, type Persona } from "./bots";
import { newPanjimRun } from "../../src/levels/panjimRun";
import { runPoints, type BuildEntry, type PointValues } from "../../src/core/resiliencePoints";
import { replay as replayPlan, type PlanAction } from "../bestPlan/plan";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split("=") as [string, string]));

/** What a run did, per source; the points are these times the values. */
export interface Facts {
  who: string;
  seed: string;
  stars: number[];
  homes: number;
  places: number;
  objectives: number;
  coastStanding: number;
  coastProtecting: number;
  bioRise: number;
  veterans: number;
  builds: Record<string, number>;
}

/** The facts of a build list, from a points replay. */
export function factsOf(who: string, seed: string, builds: readonly BuildEntry[], expectStars?: number[]): Facts {
  const run = newPanjimRun();
  for (const b of builds) {
    const [q, r] = b.tile.split(",").map(Number);
    const outcome = b.element === "repair" ? run.repair({ q, r }) : b.element === "demolish" ? run.demolish({ q, r }) : run.build({ q, r }, b.element);
    if (!outcome.ok) throw new Error(`${who} ${seed}: ${b.year} ${b.element} at ${b.tile} refused (${outcome.reason})`);
  }
  const points = runPoints(run);
  const stars = run.schedule.map((c) => run.outcomes.get(c.id)?.stars ?? 0);
  if (expectStars && JSON.stringify(stars) !== JSON.stringify(expectStars)) throw new Error(`${who} ${seed}: stars ${stars} with points, ${expectStars} without`);
  const built: Record<string, number> = {};
  for (const b of builds) built[b.element] = (built[b.element] ?? 0) + 1;
  return {
    who,
    seed,
    stars,
    homes: points.storms.reduce((s, p) => s + p.homes.saved, 0),
    places: points.storms.reduce((s, p) => s + p.places.names.length, 0),
    objectives: points.storms.filter((p) => p.objective.done).length,
    coastStanding: points.storms.reduce((s, p) => s + p.livingCoast.standing, 0),
    coastProtecting: points.storms.reduce((s, p) => s + p.livingCoast.protecting, 0),
    bioRise: points.end?.biodiversity.rise ?? 0,
    veterans: points.end?.veterans.count ?? 0,
    builds: built
  };
}

/** The six sources' points for `f` at `v`. */
export function sources(f: Facts, v: Readonly<PointValues>): Record<string, number> {
  return {
    Homes: f.homes * v.home,
    Places: f.places * v.place,
    Objective: f.objectives * v.objective,
    "Living coast": f.coastStanding * v.coastStanding + f.coastProtecting * v.coastProtecting,
    Biodiversity: f.bioRise * v.biodiversity,
    Veterans: f.veterans * v.veteran
  };
}

export const total = (f: Facts, v: Readonly<PointValues>): number => Object.values(sources(f, v)).reduce((a, b) => a + b, 0);

/** The brief's starting values (Section 35.1), which the search starts from; the code's POINT_VALUES are the result. */
export const START_VALUES: Readonly<PointValues> = { home: 10, place: 250, objective: 300, coastStanding: 20, coastProtecting: 30, biodiversity: 5, veteran: 50 };

const PERSONAS: Persona[] = ["random", "far", "nature", "seawalls", "smart", "guided", "best"];

// ---- a child: plays its share of (persona, seed) pairs and prints their facts ---------------------------------------
const childWork = args.get("child");
if (childWork !== undefined) {
  const out: Facts[] = [];
  for (const item of childWork.split(";").filter(Boolean)) {
    const [persona, seed] = item.split("|") as [Persona, string];
    const run = playedRun(persona, seed);
    out.push(factsOf(persona, seed, run.buildLog, run.schedule.map((c) => run.outcomes.get(c.id)?.stars ?? 0)));
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ---- the parent ------------------------------------------------------------------------------------------------------
const seeds = SEEDS.slice(0, Number(args.get("seeds") ?? 20));
const jobs = Number(args.get("jobs") ?? 4);
const outFile = args.get("out") ?? "docs/qa/section35/points.md";
const started = Date.now();

const work = PERSONAS.flatMap((p) => seeds.map((s) => `${p}|${s}`));
// Slow players (Smart and best weigh every candidate) are dealt round robin so the jobs finish together.
const shares: string[][] = Array.from({ length: jobs }, () => []);
work.forEach((item, i) => shares[i % jobs].push(item));
const results = await Promise.all(
  shares.map(
    (share) =>
      new Promise<Facts[]>((resolve, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, process.argv[1], `child=${share.join(";")}`], { stdio: ["ignore", "pipe", "inherit"] });
        let text = "";
        child.stdout.on("data", (chunk) => (text += chunk));
        child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(text) as Facts[]) : reject(new Error(`child exited ${code}`))));
      })
  )
);
const facts = results.flat();

// The best plan (tools/bestPlan), as pinned for this board.
const planFile = JSON.parse(fs.readFileSync("docs/qa/section34c/best_plan.json", "utf8")) as { goal1: { actions: { action: string; elementId: string; q: number; r: number }[]; storms: { stars: number }[] } };
const planActions: PlanAction[] = planFile.goal1.actions.map((r) => (r.action === "repair" ? { type: "repair", q: r.q, r: r.r } : { type: "build", q: r.q, r: r.r, elementId: r.elementId }));
const planRun = replayPlan(planActions);
const bestPlan = factsOf("bestPlan", "plan", planRun.buildLog, planFile.goal1.storms.map((s) => s.stars));

// ---- the targets ---------------------------------------------------------------------------------------------------
const of = (who: string): Facts[] => seeds.map((s) => facts.find((f) => f.who === who && f.seed === s)!);
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

interface Check {
  maxShare: number;
  maxShareSource: string;
  mixedOverSeawallMin: number;
  randomBestGap: number;
  ok: boolean;
}

export function check(v: Readonly<PointValues>): Check {
  // 1. Best play: the best plan and the best bot on every seed.
  let maxShare = 0;
  let maxShareSource = "";
  for (const f of [bestPlan, ...of("best")]) {
    const parts = sources(f, v);
    const t = total(f, v);
    for (const [k, x] of Object.entries(parts)) if (t > 0 && x / t > maxShare) [maxShare, maxShareSource] = [x / t, k];
  }
  // 2. Mixed (Smart) over all seawall (Smart limited to seawalls and breakwaters), seed by seed.
  const mixed = of("smart");
  const walls = of("seawalls");
  const mixedOverSeawallMin = Math.min(...seeds.map((_, i) => total(mixed[i], v) / Math.max(1, total(walls[i], v)) - 1));
  // 3. Random against best: the best random run under the worst best run (no overlap), and the medians' ratio.
  const randomTop = Math.max(...of("random").map((f) => total(f, v)));
  const bestLow = Math.min(...of("best").map((f) => total(f, v)));
  const randomBestGap = bestLow / Math.max(1, randomTop);
  return { maxShare, maxShareSource, mixedOverSeawallMin, randomBestGap, ok: maxShare <= 0.4 && mixedOverSeawallMin >= 0.15 && randomBestGap > 1 };
}

/** The order of importance the values keep (the brief's starting values): each at least the one after it. */
const ORDER: (keyof PointValues)[] = ["objective", "place", "veteran", "coastProtecting", "coastStanding", "home", "biodiversity"];
function keepsOrder(v: PointValues): boolean {
  return ORDER.every((k, i) => i === 0 || v[ORDER[i - 1]] >= v[k]);
}

// A grid over the values, the starting ones included; the first that meets every target, nearest the start, wins.
const grid = {
  home: [5, 10, 15],
  place: [100, 150, 200, 250],
  objective: [250, 300, 400],
  coastStanding: [10, 20, 30],
  coastProtecting: [20, 30, 50],
  biodiversity: [5, 10],
  veteran: [30, 50, 80]
};
const distance = (v: PointValues): number => (Object.keys(grid) as (keyof PointValues)[]).reduce((s, k) => s + Math.abs(Math.log(v[k] / START_VALUES[k])), 0);
const candidates: PointValues[] = [];
for (const home of grid.home)
  for (const place of grid.place)
    for (const objective of grid.objective)
      for (const coastStanding of grid.coastStanding)
        for (const coastProtecting of grid.coastProtecting)
          for (const biodiversity of grid.biodiversity)
            for (const veteran of grid.veteran) {
              const v = { home, place, objective, coastStanding, coastProtecting, biodiversity, veteran };
              if (keepsOrder(v)) candidates.push(v);
            }
const scored = candidates.map((v) => ({ v, c: check(v), d: distance(v) })).sort((a, b) => Number(b.c.ok) - Number(a.c.ok) || a.d - b.d);
const chosen = scored[0];

// ---- the report ----------------------------------------------------------------------------------------------------
const fmt = (n: number): string => String(Math.round(n));
const pct = (n: number): string => `${Math.round(n * 100)}%`;
function table(v: Readonly<PointValues>): string {
  const who = [...PERSONAS, "bestPlan"];
  const rows = who.map((w) => {
    const list = w === "bestPlan" ? [bestPlan] : of(w);
    const totals = list.map((f) => total(f, v));
    const stars = list.map((f) => f.stars.reduce((a, b) => a + b, 0));
    const bestRun = list[totals.indexOf(Math.max(...totals))];
    const parts = sources(bestRun, v);
    return `| ${w} | ${fmt(median(totals))} | ${fmt(Math.min(...totals))} to ${fmt(Math.max(...totals))} | ${fmt(Math.max(...totals))} | ${median(stars)} | ${Object.values(parts).map(fmt).join(" | ")} |`;
  });
  return [
    "| Player | Median | Spread (min to max) | Best | Median stars of 9 | Best run: Homes | Places | Objective | Living coast | Biodiversity | Veterans |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows
  ].join("\n");
}
function bySeed(v: Readonly<PointValues>): string {
  return [
    "| Seed | Smart (mixed) | Seawalls only | Mixed over seawalls | Random | Best |",
    "|---|---|---|---|---|---|",
    ...seeds.map((s) => {
      const t = (w: string) => total(facts.find((f) => f.who === w && f.seed === s)!, v);
      return `| ${s} | ${fmt(t("smart"))} | ${fmt(t("seawalls"))} | ${pct(t("smart") / Math.max(1, t("seawalls")) - 1)} | ${fmt(t("random"))} | ${fmt(t("best"))} |`;
    })
  ].join("\n");
}
const describeCheck = (c: Check): string =>
  `largest single source in a best play run ${pct(c.maxShare)} (${c.maxShareSource}; target at most 40%); mixed over seawalls at least ${pct(c.mixedOverSeawallMin)} on every seed (target 15%); the worst best run is ${c.randomBestGap.toFixed(2)} times the best random run (target above 1)`;
const mixOf = (who: string): string => {
  const sum: Record<string, number> = {};
  for (const f of of(who)) for (const [k, n] of Object.entries(f.builds)) sum[k] = (sum[k] ?? 0) + n;
  return Object.entries(sum)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${(n / seeds.length).toFixed(1)}`)
    .join(", ");
};

const startCheck = check(START_VALUES);
const report = `# Section 35.6: the points, tuned on the bots

\`npx tsx tools/panjimBots/points35.ts jobs=${jobs}\`, ${seeds.length} seeds (\`bot-seed-1\` to \`bot-seed-${seeds.length}\`), ${Math.round((Date.now() - started) / 1000)} s. Each
bot's run was replayed with points on; the stars matched the bots' own runs on every seed (the tool stops if not).
The best plan is tools/bestPlan's for this board (\`docs/qa/section34c/best_plan.json\`, goal 1). "Smart" is the
mixed run (the defences it builds, a mean per run: ${mixOf("smart")}); "seawalls" is Smart limited to seawalls and
breakwaters (${mixOf("seawalls")}).

## The starting values

${JSON.stringify(START_VALUES)}

${describeCheck(startCheck)}: **${startCheck.ok ? "every target met" : "not every target met"}**.

${table(START_VALUES)}

## The final values

${JSON.stringify(chosen.v)}

${describeCheck(chosen.c)}: **${chosen.c.ok ? "every target met" : "not every target met"}**. Chosen as the values
nearest the starting ones (by ratio) that meet every target, keeping their order of importance
(${ORDER.join(" ≥ ")}), from ${candidates.length} candidates.

${table(chosen.v)}

### Mixed against seawalls only, seed by seed (final values)

${bySeed(chosen.v)}
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, report);
fs.writeFileSync(outFile.replace(/\.md$/, ".json"), JSON.stringify({ seeds, facts, bestPlan, start: START_VALUES, final: chosen.v }, null, 1));
console.log(report);
