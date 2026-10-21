// Wind losses in a plan: per wind storm, the homes the wind alone takes on the board as that storm comes, with the
// plan's pandanus and with them taken off; `before` drops the storms' own wind (Section 25's).
import fs from "node:fs";
import { replay, trialBoard } from "./bestPlan/plan";
import { computeWater, damageAt, floodsHouse, LANDFALL_ZONE } from "../src/core/hazardModel";
import { computeCombos } from "../src/core/combos";
import { shelterOf } from "../src/core/climate";
import type { GameState } from "../src/core/gameState";
const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const acts = (raw.goal1?.actions ?? raw).map((a: any) => ({ type: "build", ...a }));
const before = process.argv.includes("before");
for (const c of replay([]).schedule) {
  if (c.kind === "flood") continue;
  const run = replay(acts.slice(0, c.turn - 1));
  const board = trialBoard(run, acts[c.turn - 1]);
  const count = (s: GameState) => {
    const f = computeWater(s, { kind: c.kind, strength: c.strength, landfall: run.landfallOf(c), sheltered: shelterOf(c), wind: before ? undefined : c.wind, turn: c.turn - 1 }, { combos: computeCombos(s).bonus, landfallZoneTiles: run.zones!.keys(LANDFALL_ZONE) });
    let path = 0, lost = 0, wind = 0;
    for (const [k, i] of s.elements) {
      if (i.elementId !== "house" || s.isScenery(k) || i.degradeAmount >= 1) continue;
      path++;
      if (floodsHouse(damageAt(f, k))) { lost++; if (!floodsHouse(f.depth.get(k) ?? 0)) wind++; }
    }
    return { lost, wind };
  };
  const bare = board.clone();
  let n = 0;
  for (const [k, i] of [...bare.elements]) if (i.elementId === "sandy_vegetation") { bare.elements.delete(k); n++; }
  const a = count(board), b = count(bare);
  console.log(`${c.id}${before ? " (Section 25 wind)" : ""}: with the plan's ${n} pandanus: ${a.lost} lost, ${a.wind} by the wind alone; without them: ${b.lost} lost, ${b.wind} by the wind alone`);
}
