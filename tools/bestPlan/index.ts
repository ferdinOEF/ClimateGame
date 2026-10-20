/**
 * Section 24: the best plan for Play Panjim, found by search on the game's
 * own rules (tools/bestPlan/plan.ts; never a copy of them).
 *
 * The storms are fixed (strength, landfall, year), so a run is deterministic:
 * a plan is its 25 actions, one a year, 5 before the 2030 cyclone, 10 before
 * the 2040 flood and 10 before the 2050 storm.
 *
 * BEAM SEARCH over whole phases. Each step is one year. For every plan in
 * the beam, every legal action (each defence on each free tile it fits, and
 * each repair) is weighed exactly: the board with it is scored against every
 * storm still to come (`assess`): the next storm exactly, the later ones on
 * the same board. So a build before 2030 is worth what it saves in 2030,
 * 2040 and 2050 together. The best children by each goal stay in the beam
 * (duplicates, the same builds in another order within a phase, merged).
 * When a phase's last build goes down its storm resolves through the real
 * run, and from then on that storm counts as it went.
 *
 *   Goal 1: 9 of 9 stars (stars first, then homes lost).
 *   Goal 2: the most homes saved over the run (homes lost first, then stars).
 *
 * The work is split over child processes like the bots (one plan each at a
 * time). Progress is printed every year.
 *
 * Usage: npm run bestplan -- [beam=16] [keep=16] [jobs=4] [out=docs/qa/section24]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BOT_LEVEL, newRun } from "../panjimBots/bots";
import { computeWater, floodsHouse, HAZARD_MODEL, LANDFALL_ZONE } from "../../src/core/hazardModel";
import { computeCombos } from "../../src/core/combos";
import { shelterOf } from "../../src/core/climate";
import { ELEMENT_BY_ID } from "../../src/core/elements";
import { clearsLevel } from "../../src/core/panjimIndex";
import { ZoneIndex } from "../../src/core/zones";
import { actionKey, assess, canonical, goal1, goal2, legalActions, MAP, placeName, replay, trialBoard, type Assessment, type PlanAction } from "./plan";

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
    for (const order of [goal1, goal2]) for (const c of [...children].sort((a, b) => order(a.score, b.score)).slice(0, job.keep)) best.set(actionKey(c.actions[c.actions.length - 1]), c);
    out.push([...best.values()]);
  }
  process.stdout.write(`${JSON.stringify(out)}\n`, () => process.exit(0));
  await new Promise(() => undefined);
}

// ---- the parent: the beam, year by year ------------------------------------------------------------------------------

const beamWidth = num("beam", 16);
const keep = num("keep", 16);
const jobs = num("jobs", Math.max(1, Math.min(4, os.cpus().length)));
const outDir = path.resolve(args.get("out") ?? "docs/qa/section24");
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
  take(goal1, Math.ceil(beamWidth / 2));
  take(goal2, beamWidth);
  return [...chosen.values()];
}

const fmt = (s: Assessment): string => `${s.stars}/9 stars, ${s.lost} homes lost [${s.storms.map((x) => `${x.stars}★ ${x.saved}/${x.total}${x.exact ? "" : "~"}`).join(", ")}]`;
const elapsed = (): string => `${((Date.now() - started) / 1000).toFixed(0)} s`;

console.log(`Best plan for Play Panjim: beam ${beamWidth}, ${keep} children kept a plan by each goal, ${jobs} child processes. Storms after builds ${phaseEnds.join(", ")}.`);
let beam: Scored[] = [{ actions: [], score: assess(opening, opening.state) }];
console.log(`opening board: ${fmt(beam[0].score)}`);
for (let step = 1; step <= totalYears; step++) {
  beam = select(await expand(beam.map((b) => b.actions)));
  const b1 = [...beam].sort((a, b) => goal1(a.score, b.score))[0];
  const b2 = [...beam].sort((a, b) => goal2(a.score, b.score))[0];
  const storm = phaseEnds.includes(step) ? ` (storm ${phaseEnds.indexOf(step) + 1} resolves)` : "";
  console.log(`year ${step}/${totalYears} (${startYear + step - 1})${storm}, ${elapsed()}: goal 1 best ${fmt(b1.score)}; goal 2 best ${fmt(b2.score)}`);
}
const searchSeconds = (Date.now() - started) / 1000;
fs.rmSync(tmp, { recursive: true, force: true });

// ---- the result: every finished plan replayed through the real run -------------------------------------------------

interface Played {
  actions: PlanAction[];
  storms: { id: string; year: number; name: string; stars: number; saved: number; total: number; lost: number }[];
  stars: number;
  lost: number;
}
function play(actions: PlanAction[]): Played {
  const run = replay(actions);
  const storms = run.schedule.map((c) => {
    const o = run.outcomes.get(c.id)!;
    return { id: c.id, year: startYear + c.turn - 1, name: c.name ?? c.id, stars: o.stars, saved: o.housesSaved, total: o.housesTotal, lost: o.housesTotal - o.housesSaved };
  });
  return { actions, storms, stars: storms.reduce((s, x) => s + x.stars, 0), lost: storms.reduce((s, x) => s + x.lost, 0) };
}
const finals = beam.map((b) => play(b.actions));
const byGoal1 = [...finals].sort((a, b) => b.stars - a.stars || a.lost - b.lost)[0];
const byGoal2 = [...finals].sort((a, b) => a.lost - b.lost || b.stars - a.stars)[0];

/** Why the homes the plan loses were lost: past the defences' ceiling, or within reach but out of builds. */
function blockers(p: Played): { id: string; lost: number; pastCeiling: number; withinReach: number }[] {
  const zones = new ZoneIndex(MAP.zones);
  const landfallTiles = zones.keys(LANDFALL_ZONE);
  const ceiling = HAZARD_MODEL.defence.engineeredMaxProtectionM ?? HAZARD_MODEL.defence.maxProtectionM;
  return p.storms.map((s, i) => {
    // The homes standing before the storm are those after the phase's last-but-one build (a build adds none).
    const run = replay(p.actions.slice(0, phaseEnds[i] - 1));
    const challenge = run.schedule[i];
    // On the bare board (every defence gone) each home the plan loses: is its water deeper than any defence can take off?
    const bare = run.state.clone();
    for (const [key, inst] of [...bare.elements]) if ((ELEMENT_BY_ID.get(inst.elementId)?.effects.resilience ?? 0) > 0) bare.elements.delete(key);
    const water = computeWater(bare, { kind: challenge.kind, strength: challenge.strength, landfall: run.landfallOf(challenge), sheltered: shelterOf(challenge) }, { combos: computeCombos(bare).bonus, landfallZoneTiles: landfallTiles });
    const after = replay(p.actions.slice(0, phaseEnds[i]));
    const lostKeys = after.outcomes.get(challenge.id)!.damagedHouses;
    // Past any defence: still lost with the water lowered by the full ceiling and the wind cut to what always gets through.
    const minKeep = HAZARD_MODEL.wind?.minKeep ?? 1;
    let pastCeiling = 0;
    for (const key of lostKeys) if (floodsHouse(Math.max(0, (water.depth.get(key) ?? 0) - ceiling) + (water.wind?.get(key) ?? 0) * minKeep)) pastCeiling++;
    return { id: s.id, lost: lostKeys.length, pastCeiling, withinReach: lostKeys.length - pastCeiling };
  });
}

const why1 = blockers(byGoal1);
const why2 = blockers(byGoal2);
fs.mkdirSync(outDir, { recursive: true });

/**
 * Which actions change nothing any storm does: the whole run scores the same
 * (stars, homes lost and the water over the loss line) with and without it.
 * One build a year is the rule, so a plan with nothing left to save still builds.
 */
function spareActions(p: Played): boolean[] {
  let before = assess(replay([]), replay([]).state);
  return p.actions.map((_, i) => {
    const run = replay(p.actions.slice(0, i + 1));
    const now = assess(run, run.state);
    const spare = now.stars === before.stars && now.lost === before.lost && Math.abs(now.excess - before.excess) < 1e-9;
    before = now;
    return spare;
  });
}

function rows(p: Played): { year: number; action: string; elementId: string; q: number; r: number; place: string; spare: boolean }[] {
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
  "| # | Year | Defence | Tile (q,r) | Place | Changes a storm |",
  "|---|---|---|---|---|---|",
  ...rows(p).map((r, i) => `| ${i + 1} | ${r.year} | ${nameOf(r.elementId)} | ${r.q},${r.r} | ${r.place} | ${r.spare ? "no (spare: nothing left to save)" : "yes"} |`)
];
const stormTable = (p: Played): string[] => [
  "| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost |",
  "|---|---|---|---|---|",
  ...p.storms.map((s) => `| ${s.name} | ${s.year} | ${s.stars} | ${s.saved} of ${s.total} | ${s.lost} |`),
  `| **Whole run** | | **${p.stars} of 9** | | **${p.lost}** |`
];
const whyLines = (w: typeof why1): string[] => w.filter((b) => b.lost > 0).map((b) => `- ${b.id}: ${b.lost} lost. ${b.pastCeiling} past the maximum protection: in this game defences hold back at most ${HAZARD_MODEL.defence.engineeredMaxProtectionM} m of water (an engineered structure; ${HAZARD_MODEL.defence.maxProtectionM} m without one) and the wind never drops below ${Math.round((HAZARD_MODEL.wind?.minKeep ?? 1) * 100)}%, and even then the water and wind there take the home. ${b.withinReach} lie within what defences can hold back, but no plan the search found saved them with the builds before that storm.`);
const md = [
  "# Section 24: the best plan found for Play Panjim",
  "",
  `Found by \`npm run bestplan\` (tools/bestPlan): a beam search over the game's own run code and hazard model, ${beamWidth} plans kept a year, every legal action weighed exactly against every storm to come; ${Math.round(searchSeconds)} s with ${jobs} child processes. In this game the storms are fixed, so the run is deterministic. A beam search is not proof of the optimum: the plan below is the best it found.`,
  "",
  `## Goal 1: 9 of 9 stars — ${byGoal1.stars === 9 ? "reached" : `not reached (best ${byGoal1.stars} of 9)`}`,
  "",
  ...table(byGoal1),
  "",
  ...stormTable(byGoal1),
  "",
  ...(byGoal1.stars === 9 ? [] : ["What blocks 9 of 9:", "", ...whyLines(why1), ""]),
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
