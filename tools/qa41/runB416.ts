/**
 * Section 41.6.4: run B (the seawall player at Campal) replayed headless, to see whether the 2050 storm's preview
 * (Homes at risk) equals what the storm then does, year by year through the 2050 phase. Throwaway.
 *   npx tsx tools/qa41/runB416.ts
 */
import fs from "node:fs";
import { newPanjimRun } from "../../src/levels/panjimRun";

const plan = (JSON.parse(fs.readFileSync("docs/qa/section41-6/best_plan.json", "utf8")) as { goal1: { actions: { elementId: string; q: number; r: number }[] } }).goal1.actions;
const early = plan.filter((a) => !(a.q === -3 && a.r === 17)).slice(0, 13).map((a) => [`${a.q},${a.r}`, a.elementId] as [string, string]);
const late: [string, string][] = [["6,8", "seawall"], ["5,9", "seawall"], ["4,10", "seawall"], ["7,7", "seawall"], ["3,11", "seawall"], ["5,7", "seawall"], ["2,13", "sandy_vegetation"], ["1,13", "sandy_vegetation"], ["0,14", "sandy_vegetation"], ["-1,15", "sandy_vegetation"]];
const builds: [string, string][] = [["-4,18", "dune"], ["-3,17", "sandy_vegetation"], ...early, ...late];
const run = newPanjimRun();
const storm = run.schedule[2];
for (const [i, [key, el]] of builds.entries()) {
  const [q, r] = key.split(",").map(Number);
  const before = run.landed.has(storm.id) ? null : [...run.homesAtRiskKeys(storm)].sort();
  const ok = run.build({ q, r }, el);
  if (!ok.ok) console.log(`refused ${run.year} ${el} ${key}: ${ok.reason}`);
  if (i >= 15) {
    const after = run.landed.has(storm.id) ? [...run.outcomes.get(storm.id)!.damagedHouses].sort() : [...run.homesAtRiskKeys(storm)].sort();
    console.log(`${2026 + i} ${el} ${key}: at risk before ${before?.length} (${before?.join(" ")}); ${run.landed.has(storm.id) ? "STORM LOST" : "at risk after"} ${after.length} (${after.join(" ")})`);
  }
}
const o = run.outcomes.get(storm.id)!;
console.log(`2050: saved ${o.housesSaved} of ${o.housesTotal}, lost ${o.housesDamaged}: ${o.damagedHouses.join(" ")}`);
