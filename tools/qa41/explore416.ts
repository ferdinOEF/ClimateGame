/**
 * Section 41.6: a quick look at the numbers the 41.6.1 rules give (the standing nature in the storm's path), before the
 * tests pin them. Throwaway; run with `npx tsx tools/qa41/explore416.ts`.
 */
import { newPanjimRun } from "../../src/levels/panjimRun";
import { playedRun, runBot, housesOf } from "../panjimBots/bots";
import { phaseResult } from "../../src/core/phaseResult";

const STANDING = ["26,6", "16,15", "7,21"];

const fresh = newPanjimRun({ objectives: false, points: false });
for (const c of fresh.schedule) {
  const base = fresh.readinessFor(c)!.outcome;
  const line = [`${c.id}: path ${base.housesTotal}`];
  for (const key of STANDING) {
    const run = newPanjimRun({ objectives: false, points: false });
    const [q, r] = key.split(",").map(Number);
    run.demolish({ q, r });
    const o = run.readinessFor(run.schedule.find((x) => x.id === c.id)!)!.outcome;
    line.push(`without ${key}: path ${o.housesTotal} (+${o.housesTotal - base.housesTotal})`);
  }
  console.log(line.join("; "));
}

const far = playedRun("far", "s1");
for (const c of far.schedule) {
  const rec = far.stormRecords.get(c.id)!;
  const pts = far.stormPoints.get(c.id);
  const phase = phaseResult(c, rec, far.areas.get(c.id) ?? [], [], far.phaseBuilds.get(c.id) ?? []);
  console.log(`far ${c.id}: saved ${rec.outcome.housesSaved} of ${rec.outcome.housesTotal}, lost ${rec.outcome.housesDamaged}; standing ${JSON.stringify(rec.standing)}; savedBy ${JSON.stringify(rec.savedBy)}; rows ${JSON.stringify(phase.defences)}; points homes ${pts?.homes.points} places ${pts?.places.points}`);
}

for (const persona of ["nature", "smart"] as const) {
  for (const seed of ["s1", "s2", "s3"]) {
    const res = runBot(persona, seed);
    console.log(`${persona} ${seed}: ${housesOf(res).map((h) => `${h.saved}/${h.total}`).join(" ")} stars ${res.stars.join(",")}`);
  }
}
