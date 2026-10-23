/**
 * Section 24: the best plan for Play Panjim, found by search on the game's
 * own rules (tools/bestPlan/plan.ts; never a copy of them).
 *
 * The storms are fixed (strength, landfall, year), so a run is deterministic:
 * a plan is its 25 actions, one a year, 5 before the 2030 cyclone, 10 before
 * the 2040 flood and 10 before the 2050 storm.
 *
 * BEAM SEARCH over whole phases. Each step is one year. For every plan in
 * the beam, every build and repair the game allows (each defence on each
 * free tile it fits, and each worn defence) is weighed exactly: the board
 * with it goes through the game's own resolver for every storm still to
 * come, one after the other (`assess`), as if nothing more were built. So a
 * build before 2030 is worth what it saves in 2030, 2040 and 2050 together. The best children by each goal stay in the beam
 * (duplicates, the same builds in another order within a phase, merged), and so
 * do the best by a greener order (stars, then the biodiversity still short of
 * three stars, Section 25.2), which keeps plans that build nature first alive.
 * When a phase's last build goes down its storm resolves through the real
 * run, and from then on that storm counts as it went.
 *
 *   Goal 1: 9 of 9 stars (stars first, then homes lost).
 *   Goal 2: the most homes saved over the run (homes lost first, then stars).
 *
 * The work is split over child processes like the bots (one plan each at a
 * time). Progress is printed every year.
 *
 * SEEDS (Section 26): `seed=<file>` names a JSON list of whole plans (each a
 * list of { elementId, q, r }), say a plan found by hand. Each year the seed's
 * first builds join the beam beside the search's own plans, scored the same
 * way, so the search ends no worse than the seed and can still beat it.
 *
 * Usage: npm run bestplan -- [beam=16] [keep=16] [jobs=4] [out=docs/qa/section26] [seed=file.json]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BOT_LEVEL, newRun } from "../panjimBots/bots";
import { ELEMENT_BY_ID } from "../../src/core/elements";
import { clearsLevel } from "../../src/core/panjimIndex";
import { actionKey, assess, canonical, goal1, goal2, greener, legalActions, nextFirst, placeName, previewLost, replay, trialBoard, type Assessment, type PlanAction } from "./plan";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split("=") as [string, string]));
const num = (key: string, fallback: number): number => (args.has(key) ? Number(args.get(key)) : fallback);

interface Scored {
  actions: PlanAction[];
  score: Assessment;
}

// ---- a child: expands the plans in its job file, prints the best children of each ---------------------------------

const childJob = args.get("child");
if (childJob !== undefined) {
  const job = JSON.parse(fs.readFileSync(childJob, "utf8")) as { plans: PlanAction[][]; keep: number };
  const out: Scored[][] = [];
  for (const actions of job.plans) {
    const run = replay(actions);
    const children: Scored[] = legalActions(run).map((action) => ({ actions: [...actions, action], score: assess(run, trialBoard(run, action)) }));
    // The best by each goal; the parent merges and dedupes.
    const best = new Map<string, Scored>();
    for (const order of [goal1, nextFirst, greener, goal2]) for (const c of [...children].sort((a, b) => order(a.score, b.score)).slice(0, job.keep)) best.set(actionKey(c.actions[c.actions.length - 1]), c);
    out.push([...best.values()]);
  }
  process.stdout.write(`${JSON.stringify(out)}\n`, () => process.exit(0));
  await new Promise(() => undefined);
}

// ---- the parent: the beam, year by year ------------------------------------------------------------------------------

const beamWidth = num("beam", 16);
const keep = num("keep", 16);
const jobs = num("jobs", Math.max(1, Math.min(4, os.cpus().length)));
const outDir = path.resolve(args.get("out") ?? "docs/qa/section26");
const seeds = args.has("seed") ? (JSON.parse(fs.readFileSync(args.get("seed")!, "utf8")) as PlanAction[][]) : [];
const started = Date.now();
const opening = newRun("best-plan", BOT_LEVEL);
const totalYears = opening.totalYears;
const startYear = opening.year;
/** The number of actions after which each storm resolves: 5, 15, 25. */
const phaseEnds = opening.schedule.map((c) => c.turn);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bestplan-"));

function expand(plans: PlanAction[][]): Promise<Scored[]> {
  const chunks: PlanAction[][][] = Array.from({ length: Math.min(jobs, plans.length) }, () => []);
  plans.forEach((p, i) => chunks[i % chunks.length].push(p));
  return Promise.all(
    chunks.map(
      (chunk, i) =>
        new Promise<Scored[]>((resolve, reject) => {
          const file = path.join(tmp, `job-${i}.json`);
          fs.writeFileSync(file, JSON.stringify({ plans: chunk, keep }));
          const child = spawn(process.execPath, [...process.execArgv, process.argv[1], `child=${file}`], { stdio: ["ignore", "pipe", "inherit"] });
          let text = "";
          child.stdout.on("data", (d) => (text += d));
          child.on("exit", (code) => (code === 0 ? resolve((JSON.parse(text.trim().split("\n").pop()!) as Scored[][]).flat()) : reject(new Error(`child ${i} exited ${code}`))));
        })
    )
  ).then((parts) => parts.flat());
}

/** The next beam: the best by goal 1 and the best by goal 2, half each, duplicates merged. */
function select(children: Scored[]): Scored[] {
  const unique = new Map<string, Scored>();
  for (const c of children) unique.set(canonical(c.actions, phaseEnds), c);
  const all = [...unique.values()];
  const chosen = new Map<string, Scored>();
  const take = (order: typeof goal1, n: number): void => {
    for (const c of [...all].sort((a, b) => order(a.score, b.score))) {
      if (chosen.size >= n) break;
      chosen.set(canonical(c.actions, phaseEnds), c);
    }
  };
  // A quarter each: goal 1, the phase's own storm first, the greener order (Section 25.2), goal 2.
  take(goal1, Math.ceil(beamWidth / 4));
  take(nextFirst, Math.ceil(beamWidth / 2));
  take(greener, Math.ceil((3 * beamWidth) / 4));
  take(goal2, beamWidth);
  return [...chosen.values()];
}

const fmt = (s: Assessment): string => `${s.stars}/9 stars, ${s.lost} homes lost [${s.storms.map((x) => `${x.stars}★ ${x.saved}/${x.total}`).join(", ")}]`;
const elapsed = (): string => `${((Date.now() - started) / 1000).toFixed(0)} s`;

console.log(`Best plan for Play Panjim: beam ${beamWidth}, ${keep} children kept a plan by each goal, ${jobs} child processes. Storms after builds ${phaseEnds.join(", ")}.`);
let beam: Scored[] = [{ actions: [], score: assess(opening, opening.state) }];
console.log(`opening board: ${fmt(beam[0].score)}`);
try {
  for (let step = 1; step <= totalYears; step++) {
    beam = select(await expand(beam.map((b) => b.actions)));
    for (const seed of seeds) {
      const prefix = seed.slice(0, step);
      if (beam.some((b) => canonical(b.actions, phaseEnds) === canonical(prefix, phaseEnds))) continue;
      const run = replay(prefix);
      beam.push({ actions: prefix, score: assess(run, run.state) });
    }
    const b1 = [...beam].sort((a, b) => goal1(a.score, b.score))[0];
    const b2 = [...beam].sort((a, b) => goal2(a.score, b.score))[0];
    const storm = phaseEnds.includes(step) ? ` (storm ${phaseEnds.indexOf(step) + 1} resolves)` : "";
    console.log(`year ${step}/${totalYears} (${startYear + step - 1})${storm}, ${elapsed()}: goal 1 best ${fmt(b1.score)}; goal 2 best ${fmt(b2.score)}`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const searchSeconds = (Date.now() - started) / 1000;

// ---- the result: every finished plan replayed through the real run -------------------------------------------------

interface Played {
  actions: PlanAction[];
  storms: { id: string; year: number; name: string; stars: number; saved: number; total: number; lost: number; biodiversityChange?: number }[];
  stars: number;
  lost: number;
}
function play(actions: PlanAction[]): Played {
  const run = replay(actions);
  const storms = run.schedule.map((c) => {
    const o = run.outcomes.get(c.id)!;
    return { id: c.id, year: startYear + c.turn - 1, name: c.name ?? c.id, stars: o.stars, saved: o.housesSaved, total: o.housesTotal, lost: o.housesTotal - o.housesSaved, biodiversityChange: o.biodiversityChange };
  });
  return { actions, storms, stars: storms.reduce((s, x) => s + x.stars, 0), lost: storms.reduce((s, x) => s + x.lost, 0) };
}
// A seed plan cut short (Section 30: builds the new board refuses were left out of it) never reaches the last storm:
// only whole runs are results.
const finals = beam.filter((b) => replay(b.actions).finished).map((b) => play(b.actions));
if (finals.length === 0) throw new Error("no plan in the beam reaches the end of the run");
// Ties go to the plan with the most biodiversity at the end of 2050 (Section 26.2).
const endBioOf = (p: Played): number => p.storms[p.storms.length - 1].biodiversityChange ?? 0;
const byGoal1 = [...finals].sort((a, b) => b.stars - a.stars || a.lost - b.lost || endBioOf(b) - endBioOf(a))[0];
const byGoal2 = [...finals].sort((a, b) => a.lost - b.lost || b.stars - a.stars || endBioOf(b) - endBioOf(a))[0];

/**
 * What stops the plan saving the homes it loses, tested with the game's own
 * preview: on the board just before each storm that took homes, up to
 * EXTRA_BUILDS more builds are added, each the one (of every build the game
 * allows there) that saves the most. If they save every home, the limit is
 * the number of builds before that storm; if not, those homes are lost even
 * with that many more.
 */
const EXTRA_BUILDS = 3;
function blockers(p: Played): { id: string; lost: number; homes: string[]; extraBuildsToSaveAll: number | null; savedWithExtra: number }[] {
  return p.storms.flatMap((s, i) => {
    if (s.lost === 0) return [];
    const run = replay(p.actions.slice(0, phaseEnds[i] - 1));
    const challenge = run.schedule[i];
    const last = p.actions[phaseEnds[i] - 1];
    let board = trialBoard(run, last);
    const homes = previewLost(run, board, challenge);
    let lostNow = homes.length;
    let needed: number | null = null;
    for (let extra = 1; extra <= EXTRA_BUILDS && lostNow > 0; extra++) {
      let best: { board: typeof board; lost: number } | null = null;
      for (const tile of board.placed.values()) {
        for (const def of board.buildableAt(tile.coord)) {
          const trial = board.clone();
          trial.build(tile.coord, def.id, false);
          const l = previewLost(run, trial, challenge).length;
          if (!best || l < best.lost) best = { board: trial, lost: l };
        }
      }
      if (!best || best.lost >= lostNow) break;
      board = best.board;
      lostNow = best.lost;
      if (lostNow === 0) needed = extra;
    }
    return [{ id: s.id, lost: s.lost, homes, extraBuildsToSaveAll: needed, savedWithExtra: homes.length - lostNow }];
  });
}

const why1 = blockers(byGoal1);
const why2 = blockers(byGoal2);
fs.mkdirSync(outDir, { recursive: true });

/**
 * Which actions change neither stars nor homes lost (nor the water over the
 * loss line on the homes lost): the whole run scores the same with and
 * without it. One build a year is the rule, so a plan still builds when it
 * has nothing left to gain.
 */
function spareActions(p: Played): boolean[] {
  const start = replay([]);
  let before = assess(start, start.state);
  return p.actions.map((_, i) => {
    const run = replay(p.actions.slice(0, i + 1));
    const now = assess(run, run.state);
    // Section 26.5: the end of 2050's biodiversity counts too.
    const spare = now.stars === before.stars && now.lost === before.lost && now.endBio === before.endBio && Math.abs(now.excess - before.excess) < 1e-9;
    before = now;
    return spare;
  });
}

const rowCache = new Map<Played, ReturnType<typeof rowsOf>>();
function rows(p: Played): ReturnType<typeof rowsOf> {
  if (!rowCache.has(p)) rowCache.set(p, rowsOf(p));
  return rowCache.get(p)!;
}
function rowsOf(p: Played): { year: number; action: string; elementId: string; q: number; r: number; place: string; spare: boolean }[] {
  const spare = spareActions(p);
  return p.actions.map((a, i) => ({
    year: startYear + i,
    action: a.type,
    elementId: a.type === "build" ? a.elementId : "repair",
    q: a.q,
    r: a.r,
    place: placeName({ q: a.q, r: a.r }),
    spare: spare[i]
  }));
}
const nameOf = (id: string): string => (id === "repair" ? "Repair" : (ELEMENT_BY_ID.get(id)?.name ?? id));
const same = canonical(byGoal1.actions, phaseEnds) === canonical(byGoal2.actions, phaseEnds);
const json = {
  level: BOT_LEVEL.id,
  generatedBy: "npm run bestplan (tools/bestPlan)",
  search: { beam: beamWidth, keep, jobs, seconds: Math.round(searchSeconds) },
  goal1: { stars: byGoal1.stars, of: 9, nineOfNine: byGoal1.stars === 9, clears: clearsLevel(byGoal1.storms.map((s) => s.stars)), lost: byGoal1.lost, storms: byGoal1.storms, blockers: why1, actions: rows(byGoal1) },
  goal2: { sameAsGoal1: same, stars: byGoal2.stars, lost: byGoal2.lost, everyHomeSaved: byGoal2.lost === 0, storms: byGoal2.storms, blockers: why2, actions: rows(byGoal2) }
};
fs.writeFileSync(path.join(outDir, "best_plan.json"), `${JSON.stringify(json, null, 2)}\n`);

const table = (p: Played): string[] => [
  "| # | Year | Defence | Tile (q,r) | Place | Changes stars, homes or end biodiversity |",
  "|---|---|---|---|---|---|",
  ...rows(p).map((r, i) => `| ${i + 1} | ${r.year} | ${nameOf(r.elementId)} | ${r.q},${r.r} | ${r.place} | ${r.spare ? "no" : "yes"} |`)
];
const bioCell = (v: number | undefined): string => (v === undefined ? "" : `${v > 0 ? "+" : ""}${v}`);
const stormTable = (p: Played): string[] => [
  "| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |",
  "|---|---|---|---|---|---|",
  ...p.storms.map((s) => `| ${s.name} | ${s.year} | ${s.stars} | ${s.saved} of ${s.total} | ${s.lost} | ${bioCell(s.biodiversityChange)} |`),
  `| **Whole run** | | **${p.stars} of 9** | | **${p.lost}** | |`
];
/** For each storm short of three stars, which line it missed: the homes or the biodiversity (the level's own lines). */
const starLines = (p: Played): string[] => {
  const hs = opening.houseStars!;
  return p.storms
    .filter((s) => s.stars < 3)
    .map((s) => {
      const share = s.total > 0 ? s.saved / s.total : 1;
      const homes = share >= hs.three ? "homes enough" : `homes ${Math.round(share * 100)}% (three stars need ${Math.round(hs.three * 100)}%)`;
      const bio = hs.bioThree === undefined || (s.biodiversityChange ?? 0) >= hs.bioThree ? "biodiversity enough" : `biodiversity ${bioCell(s.biodiversityChange) || "0"} (three stars need +${hs.bioThree})`;
      return `- ${s.name} ${s.year}: ${s.stars} stars; ${homes}; ${bio}.`;
    });
};
const whyLines = (w: typeof why1): string[] =>
  w.map((b) => {
    const named = b.homes.map((key) => `${key} (${placeName({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) })})`).join(", ");
    const limit =
      b.extraBuildsToSaveAll !== null
        ? `With ${b.extraBuildsToSaveAll} more build${b.extraBuildsToSaveAll > 1 ? "s" : ""} before that storm (the best the game allows, each tried) every one would stand: what limits it is the number of builds, one a year.`
        : `Even ${EXTRA_BUILDS} more builds before that storm (the best the game allows, each tried) save ${b.savedWithExtra} of them.`;
    return `- ${b.id}: ${b.lost} lost: ${named}. ${limit}`;
  });
const md = [
  "# The best plan found for Play Panjim",
  "",
  `Found by \`npm run bestplan\` (tools/bestPlan): a beam search over the game's own run code and hazard model, ${beamWidth} plans kept a year, every build and repair the game allows weighed by running the game's own resolver for every storm to come; ${Math.round(searchSeconds)} s with ${jobs} child processes. In this game the storms are fixed, so the run is deterministic. A beam search is not proof of the optimum: the plan below is the best it found.`,
  "",
  `## Goal 1: 9 of 9 stars — ${byGoal1.stars === 9 ? "reached" : `not reached (best ${byGoal1.stars} of 9)`}`,
  "",
  ...table(byGoal1),
  "",
  ...stormTable(byGoal1),
  "",
  ...(byGoal1.stars === 9 ? [] : ["What blocks 9 of 9:", "", ...starLines(byGoal1), ...whyLines(why1), ""]),
  `## Goal 2: the most homes saved — ${byGoal2.lost === 0 ? "every home saved" : `${byGoal2.lost} homes lost over the run, so saving every home is not reached`}`,
  "",
  ...(same ? ["The same plan as goal 1.", ""] : [...table(byGoal2), ""]),
  ...stormTable(byGoal2),
  "",
  ...(byGoal2.lost === 0 ? [] : ["What blocks saving every home:", "", ...whyLines(why2), ""])
].join("\n");
fs.writeFileSync(path.join(outDir, "best_plan.md"), `${md}\n`);
console.log(`\nsearch took ${Math.round(searchSeconds)} s (${(searchSeconds / 60).toFixed(1)} min)`);
console.log(md);
