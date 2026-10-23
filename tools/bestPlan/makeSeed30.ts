// Section 30: the Section 26 seed plans made legal on Section 30's board (a mangrove a river tile no longer takes
// becomes a small dam there; a build on a dropped tile is left out), for `npm run bestplan -- seed=tools/bestPlan/seed30.json`.
import fs from "node:fs";
import { newRun, BOT_LEVEL } from "../panjimBots/bots";
const plans = JSON.parse(fs.readFileSync("tools/bestPlan/seed26.json", "utf8")) as { type: string; elementId: string; q: number; r: number }[][];
const out = plans.map((plan) => {
  const run = newRun("seed30", BOT_LEVEL);
  const kept: typeof plan = [];
  for (const a of plan) {
    if (a.type !== "build") continue;
    const at = { q: a.q, r: a.r };
    let id = a.elementId;
    if (!run.state.canBuild(at, id)) id = ["small_dam", "khazan", "mangrove"].find((alt) => run.state.canBuild(at, alt)) ?? "";
    if (!id || !run.build(at, id).ok) continue;
    kept.push({ ...a, elementId: id });
    if (run.finished) break;
  }
  console.log(`plan: ${plan.length} -> ${kept.length} builds, ${plan.filter((a, i) => kept[i] && kept[i].elementId !== a.elementId).length} changed`);
  return kept;
});
fs.writeFileSync("tools/bestPlan/seed30.json", JSON.stringify(out, null, 1) + "\n");
