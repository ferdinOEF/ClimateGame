// Section 34b.9: Section 30's best plans (goal 1 and goal 2) and its seeds, made legal on Section 34b's rules (a seawall
// on the shore line only, a small dam on the narrow upstream river only), for
// `npm run bestplan -- seed=tools/bestPlan/seed34b.json`. A build its tile no longer takes moves to the nearest free
// tile within two hexes that takes it (the same defence); failing that it is left out.
import fs from "node:fs";
import { newRun, BOT_LEVEL } from "../panjimBots/bots";
import { axialDistance } from "../../src/core/hex";

type Build = { type: string; elementId: string; q: number; r: number };
const best = JSON.parse(fs.readFileSync("docs/qa/section30/best_plan.json", "utf8")) as Record<"goal1" | "goal2", { actions: { action: string; elementId: string; q: number; r: number }[] }>;
const seeds = JSON.parse(fs.readFileSync("tools/bestPlan/seed30.json", "utf8")) as Build[][];
const plans: Build[][] = [
  ...(["goal1", "goal2"] as const).map((goal) => best[goal].actions.map((a) => ({ type: a.action, elementId: a.elementId, q: a.q, r: a.r }))),
  ...seeds
];
const out = plans.map((plan) => {
  const run = newRun("seed34b", BOT_LEVEL);
  const kept: Build[] = [];
  let moved = 0;
  for (const a of plan) {
    if (a.type !== "build") continue;
    let at = { q: a.q, r: a.r };
    if (!run.state.canBuild(at, a.elementId)) {
      const near = [...run.state.placed.values()]
        .filter((t) => axialDistance(t.coord, at) <= 2 && run.state.canBuild(t.coord, a.elementId))
        .sort((x, y) => axialDistance(x.coord, at) - axialDistance(y.coord, at) || x.coord.q - y.coord.q || x.coord.r - y.coord.r)[0];
      if (!near) continue;
      at = near.coord;
      moved++;
    }
    if (!run.build(at, a.elementId).ok) continue;
    kept.push({ ...a, q: at.q, r: at.r });
    if (run.finished) break;
  }
  console.log(`plan: ${plan.length} -> ${kept.length} builds, ${moved} moved`);
  return kept;
});
fs.writeFileSync("tools/bestPlan/seed34b.json", JSON.stringify(out, null, 1) + "\n");
