/**
 * Section 34: the core fuzzed. Random action sequences (builds anywhere they fit, demolitions, repairs, and "Try this
 * storm again" after storms) are played through the game's own run (`ActionRun`, objectives on, as a session sets it
 * up), and every invariant is checked after each action and each storm:
 *
 *   - preview equals resolution: the homes a storm takes are exactly the homes at risk before the action that brought
 *     it, less the homes that action's build takes out of risk, plus those it puts at risk (the hover glow's numbers);
 *   - ruins equal homes lost: the storm adds exactly its homes destroyed as ruins, and every one is ruined;
 *   - the risk heat equals "Homes at risk" (and is never on scenery);
 *   - objective completion matches the board: "Objective complete" iff every row was done as the storm came;
 *   - stars match the thresholds: each outcome's stars equal the star rule applied to its own numbers;
 *   - try this storm again restores the exact board (the phase's start snapshot);
 *   - nothing counts on unplayable tiles: no home at risk, destroyed or built on scenery or dry tiles;
 *   - the sheltered centre is untouched in 2050: no water damage there, ever.
 *
 * Usage: npx tsx tools/fuzz34.ts [runs=200] [jobs=4] [level=l01-first-rains|l00-tutorial|both] [seed=1]
 * Prints a summary and every failure; exits 1 on any failure.
 */
import { spawn } from "node:child_process";
import { LEVEL_BY_ID, type LevelDef } from "../src/levels/levels";
import { sessionRun } from "../tests/helpers/sessionRun";
import { buildHeatView, hazardsOf } from "../src/core/exposure";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { shelterOf, type ScheduledChallenge } from "../src/core/climate";
import { prepProgress } from "../src/core/prep";
import { starsForHouses } from "../src/core/zones";
import { Rng } from "../src/core/rng";
import type { ActionRun } from "../src/core/actionRun";
import type { AxialCoord } from "../src/core/hex";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split("=") as [string, string]));
const RUNS = Number(args.get("runs") ?? 200);
const JOBS = Number(args.get("jobs") ?? 4);
const SEED = Number(args.get("seed") ?? 1);
const LEVELS = (args.get("level") ?? "both") === "both" ? ["l01-first-rains", "l00-tutorial"] : [args.get("level")!];

interface Tally {
  runs: number;
  actions: number;
  storms: number;
  retries: number;
  checks: Record<string, number>;
  failures: string[];
}

const at = (key: string): AxialCoord => {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
};

function isRuin(run: ActionRun, key: string): boolean {
  const inst = run.state.elements.get(key);
  return !!inst && ELEMENT_BY_ID.get(inst.elementId)?.kind === "building" && inst.degradeAmount >= 1;
}
const ruinCount = (run: ActionRun): number => [...run.state.elements.keys()].filter((key) => isRuin(run, key)).length;
const unplayable = (run: ActionRun, key: string): boolean => {
  const tile = run.state.placed.get(key) as { scenery?: boolean; dry?: boolean } | undefined;
  return run.state.isScenery(key) || !!tile?.dry;
};

/** One fuzzed run; every failed check pushed to `t.failures` with the run and year. */
function fuzzRun(level: LevelDef, seed: number, t: Tally): void {
  const rng = new Rng(seed);
  const run = sessionRun(level);
  const tag = (what: string): string => `${level.id} seed ${seed} ${run.year}: ${what}`;
  const check = (name: string, ok: boolean, what: string): void => {
    t.checks[name] = (t.checks[name] ?? 0) + 1;
    if (!ok && t.failures.length < 200) t.failures.push(`${name}: ${tag(what)}`);
  };
  const retried = new Set<string>();
  let guard = 0;
  while (!run.finished && guard++ < 80) {
    const next = run.nextChallenge();
    // The heat equals Homes at risk, never on scenery.
    if (next) {
      const now = run.exposureFor(next)!;
      const bare = run.exposureFor(next, true);
      const hazards = hazardsOf(next.kind);
      const defences = [...run.state.elements].filter(([, inst]) => {
        const def = ELEMENT_BY_ID.get(inst.elementId);
        return !!def && (def.effects.resilience ?? 0) > 0 && !!def.targetsHazards?.some((h) => hazards.includes(h as "cyclone" | "flood"));
      }).map(([key]) => key);
      const hot = buildHeatView(now, bare, run.yearsUntil(next), defences, (key) => run.state.placed.get(key)?.terrainId).filter((tile) => tile.heat > 0).map((tile) => tile.key);
      check("heat = homes at risk", hot.length === run.homesAtRisk(next), `heat ${hot.length}, homes at risk ${run.homesAtRisk(next)}`);
      check("nothing on unplayable tiles", now.housesAtRisk.every((key) => !unplayable(run, key)) && hot.every((key) => !unplayable(run, key)), "a home at risk on an unplayable tile");
    }
    // The action: mostly a build on a random tile it fits; sometimes one on the storm's path; a demolish or repair.
    const tiles = [...run.state.placed.values()].filter((tile) => run.state.buildableAt(tile.coord).length > 0);
    for (const tile of run.state.placed.values()) {
      const key = `${tile.coord.q},${tile.coord.r}`;
      if (unplayable(run, key)) check("nothing on unplayable tiles", run.state.buildableAt(tile.coord).length === 0, `${key} is unplayable but buildable`);
    }
    const path = next ? [...(run.exposureFor(next, true)?.exposure.keys() ?? [])] : [];
    const roll = rng.next();
    const stormNow = next && run.buildsUntil(next) === 1 ? next : null;
    const before = stormNow ? new Set(run.exposureFor(stormNow)!.housesAtRisk) : null;
    const ruinsBefore = ruinCount(run);
    const jobsDone = stormNow && run.prep.length > 0 && run.prep.every((job) => job.challengeId === stormNow.id && prepProgress(job, run.state, run.zones!).done);
    let expected: Set<string> | null = null;
    let acted = false;
    const builtByPlayer = [...run.state.elements.keys()].filter((key) => run.canDemolish(at(key)) && !isRuin(run, key));
    const worn = builtByPlayer.filter((key) => run.needsRepair(at(key)));
    if (roll < 0.06 && builtByPlayer.length > 0) {
      const key = rng.pick(builtByPlayer);
      acted = run.demolish(at(key)).ok;
      check("action accepted", acted, `demolish ${key} refused`);
    } else if (roll < 0.1 && worn.length > 0) {
      const key = rng.pick(worn);
      acted = run.repair(at(key)).ok;
      check("action accepted", acted, `repair ${key} refused`);
    } else {
      const pool = roll < 0.55 ? tiles.filter((tile) => path.includes(`${tile.coord.q},${tile.coord.r}`)) : tiles;
      if (tiles.length === 0) break;
      const tile = rng.pick(pool.length > 0 ? pool : tiles);
      const options = run.state.buildableAt(tile.coord);
      const pick = rng.pick(options);
      if (stormNow && before) {
        const change = run.riskChangeBy(stormNow, tile.coord, pick.id);
        if (change) expected = new Set([...[...before].filter((key) => !change.saved.includes(key)), ...change.added]);
      }
      acted = run.build(tile.coord, pick.id).ok;
      check("action accepted", acted, `build ${pick.id} at ${tile.coord.q},${tile.coord.r} refused`);
    }
    if (!acted) {
      (run as unknown as { endYear(): unknown }).endYear();
      continue;
    }
    t.actions++;
    if (!stormNow || !run.landed.has(stormNow.id)) continue;
    // A storm came.
    t.storms++;
    const outcome = run.outcomes.get(stormNow.id)!;
    const lost = new Set(outcome.damagedHouses);
    if (expected) check("preview = resolution", lost.size === expected.size && [...lost].every((key) => expected!.has(key)), `took ${lost.size}, preview said ${expected.size}`);
    // A storm brought by a demolition or a repair: the preview of a build does not apply; counted, not compared.
    else if (before) t.checks["storm year action not a build (not compared)"] = (t.checks["storm year action not a build (not compared)"] ?? 0) + 1;
    check("ruins = homes lost", ruinCount(run) - ruinsBefore === outcome.housesDamaged && [...lost].every((key) => isRuin(run, key)), `ruins +${ruinCount(run) - ruinsBefore}, card ${outcome.housesDamaged}`);
    check("card adds up", outcome.housesSaved + outcome.housesDamaged === outcome.housesTotal, `${outcome.housesSaved} + ${outcome.housesDamaged} != ${outcome.housesTotal}`);
    const stars = run.houseStarsFor(stormNow);
    if (stars) check("stars = thresholds", outcome.stars === starsForHouses(outcome.housesSaved, outcome.housesTotal, stars, outcome.biodiversityChange ?? 0), `stars ${outcome.stars} for ${outcome.housesSaved}/${outcome.housesTotal}, bio ${outcome.biodiversityChange}`);
    check("objective = board", run.objectivesComplete.has(stormNow.id) === !!jobsDone, `objective complete ${run.objectivesComplete.has(stormNow.id)}, rows done ${!!jobsDone}`);
    check("nothing on unplayable tiles", [...lost].every((key) => !unplayable(run, key)), "a home lost on an unplayable tile");
    const shelter = shelterOf(stormNow as ScheduledChallenge);
    if (shelter) {
      const record = run.stormRecords.get(stormNow.id);
      const wet = record ? [...shelter].filter((key) => (record.depth.get(key) ?? 0) > 0 || (record.wind.get(key) ?? 0) > 0) : [];
      check("sheltered centre untouched", [...lost].every((key) => !shelter.has(key)) && wet.length === 0, `${[...lost].filter((key) => shelter.has(key)).length} homes lost and ${wet.length} wet tiles in the shelter`);
    }
    // Sometimes: try this storm again, and check the board is back exactly.
    if (!retried.has(stormNow.id) && rng.next() < 0.3) {
      const saved = run.phaseSnapshots.get(stormNow.id)?.snapshot;
      const ok = run.retry(stormNow.id);
      check("retry restores the board", ok && !!saved && JSON.stringify(run.snapshot()) === JSON.stringify(saved) && !run.landed.has(stormNow.id), "the board after a retry differs from the phase's start");
      retried.add(stormNow.id);
      t.retries++;
    }
  }
  check("run reaches its end", run.finished, `stopped at ${run.year}`);
  t.runs++;
}

function blank(): Tally {
  return { runs: 0, actions: 0, storms: 0, retries: 0, checks: {}, failures: [] };
}

const child = args.get("child");
if (child !== undefined) {
  const t = blank();
  for (const item of child.split(";").filter(Boolean)) {
    const [levelId, seed] = item.split("|");
    try {
      fuzzRun(LEVEL_BY_ID.get(levelId)!, Number(seed), t);
    } catch (e) {
      t.failures.push(`crash: ${levelId} seed ${seed}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" ")}`);
    }
  }
  process.stdout.write(`${JSON.stringify(t)}\n`, () => process.exit(0));
  await new Promise(() => undefined);
}

const items: string[] = [];
for (const level of LEVELS) for (let i = 0; i < RUNS; i++) items.push(`${level}|${SEED * 100000 + i}`);
const chunks: string[][] = Array.from({ length: JOBS }, () => []);
items.forEach((item, i) => chunks[i % JOBS].push(item));
const t0 = Date.now();
const parts = await Promise.all(
  chunks.map(
    (chunk) =>
      new Promise<Tally>((resolve, reject) => {
        const proc = spawn(process.execPath, [...process.execArgv, process.argv[1], `child=${chunk.join(";")}`], { stdio: ["ignore", "pipe", "inherit"] });
        let text = "";
        proc.stdout.on("data", (d) => (text += d));
        proc.on("exit", (code) => (code === 0 ? resolve(JSON.parse(text.trim().split("\n").pop()!)) : reject(new Error(`child exited ${code}`))));
      })
  )
);
const all = blank();
for (const p of parts) {
  all.runs += p.runs;
  all.actions += p.actions;
  all.storms += p.storms;
  all.retries += p.retries;
  for (const [k, v] of Object.entries(p.checks)) all.checks[k] = (all.checks[k] ?? 0) + v;
  all.failures.push(...p.failures);
}
console.log(`Fuzzed ${all.runs} runs (${LEVELS.join(", ")}), ${all.actions} actions, ${all.storms} storms, ${all.retries} retries, in ${Math.round((Date.now() - t0) / 1000)} s.`);
console.log("| Invariant | Checks |\n|---|---|");
for (const [k, v] of Object.entries(all.checks).sort()) console.log(`| ${k} | ${v} |`);
console.log(`\nFailures: ${all.failures.length}`);
for (const f of all.failures.slice(0, 60)) console.log(`- ${f}`);
process.exit(all.failures.length > 0 ? 1 : 0);
