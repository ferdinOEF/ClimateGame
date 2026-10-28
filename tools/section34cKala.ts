/**
 * Section 34c.3 (owner, 28 October 2026): Kala Academy's state in the three storms, with no defences and with the best
 * plan (docs/qa/section34b/best_plan.json, goal 1), read from the game's own run headless. Run it before and after the
 * landmark moves; a tile that floods where it stood dry is the owner's call.
 *
 *   npx tsx tools/section34cKala.ts [tag]      writes docs/qa/section34c/kala-<tag>.md (default tag "now")
 *
 * For each storm: the water (m) and wind on Kala Academy's tile and on the two tiles of the move (5,11 and 5,10), and
 * whether that takes a building there by the game's rule (floodsHouse on water plus wind, as the result cards judge a
 * place).
 */
import fs from "node:fs";
import path from "node:path";
import { BOT_LEVEL, newRun } from "./panjimBots/bots";
import { replay, type PlanAction } from "./bestPlan/plan";
import { damageAt, floodsHouse } from "../src/core/hazardModel";
import { mapById } from "../src/levels/levelMap";
import type { ActionRun } from "../src/core/actionRun";

const tag = process.argv[2] ?? "now";
const map = mapById("panaji");
const kala = map?.monuments.find((m) => m.id === "kala_academy");
if (!kala) throw new Error("no Kala Academy on the map");
const KALA = `${kala.q},${kala.r}`;
const TILES = [...new Set([KALA, "5,11", "5,10"])];

const planFile = JSON.parse(fs.readFileSync("docs/qa/section34b/best_plan.json", "utf8")) as { goal1: { actions: { action: string; elementId: string; q: number; r: number }[] } };
const best: PlanAction[] = planFile.goal1.actions.map((a) => (a.action === "repair" ? { type: "repair", q: a.q, r: a.r } : { type: "build", q: a.q, r: a.r, elementId: a.elementId }));

function noDefences(): ActionRun {
  const run = newRun("kala", BOT_LEVEL);
  const endYear = (run as unknown as { endYear(): unknown }).endYear.bind(run);
  for (let i = 0; i < 40 && !run.finished; i++) endYear();
  return run;
}

const lines: string[] = [`# Kala Academy in the three storms (${tag})`, "", `Kala Academy stands on ${KALA}. Water in metres, wind in the game's units; "takes" is the game's rule for a building lost (water plus wind at or over the loss line).`, ""];
for (const [label, run] of [["No defences", noDefences()], ["Best plan (34b, goal 1)", replay(best)]] as const) {
  lines.push(`## ${label}`, "", "| Storm | Tile | Water | Wind | Takes a building |", "|---|---|---|---|---|");
  for (const challenge of run.schedule) {
    const record = run.stormRecords.get(challenge.id);
    if (!record) throw new Error(`${label}: no record for ${challenge.id}`);
    for (const key of TILES) {
      const water = record.depth.get(key) ?? 0;
      const wind = record.wind?.get(key) ?? 0;
      const mark = key === KALA ? " (Kala Academy)" : "";
      lines.push(`| ${challenge.id} | ${key}${mark} | ${water.toFixed(2)} | ${wind.toFixed(2)} | ${floodsHouse(damageAt(record, key)) ? "yes" : "no"} |`);
    }
  }
  lines.push("");
}
const out = path.join("docs/qa/section34c", `kala-${tag}.md`);
fs.writeFileSync(out, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
