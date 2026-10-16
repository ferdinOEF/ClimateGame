import { BOT_LEVEL } from "./tools/panjimBots/bots";
import { ActionRun } from "./src/core/actionRun";
import { GameState } from "./src/core/gameState";
import { boardSetup } from "./src/levels/balance";
import { mapById } from "./src/levels/levelMap";
import { passYear } from "./tests/helpers/passYear";
const MAP = mapById("panaji")!;
const make = () => {
  const setup = boardSetup(BOT_LEVEL, MAP);
  const state = new GameState(MAP.tiles, setup.startingElements, BOT_LEVEL.startingCoin);
  for (const [id, s] of setup.effectScale) state.effectScale.set(id, s);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const k of setup.unbuildable) state.unbuildable.add(k);
  for (const m of MAP.monuments) state.reserved.add(`${m.q},${m.r}`);
  return new ActionRun(state, BOT_LEVEL.timeline!, { climate: BOT_LEVEL.climate, zones: MAP.zones, houseStars: BOT_LEVEL.houseStars, houseRule: BOT_LEVEL.houses?.rule, prep: BOT_LEVEL.prep, economy: BOT_LEVEL.economy, growth: BOT_LEVEL.growth, landmarks: MAP.landmarks });
};
let t = performance.now();
const run = make();
console.log("phase 1 ms", Math.round(performance.now() - t));
for (const c of [...run.schedule]) {
  const o = run.objective!;
  console.log(c.id, "lost", o.lostBefore, "->", o.lostAfter, "picks", o.picks.map((p) => `${p.elementId}@${p.key}+${p.homes}`).join(" "));
  for (const row of run.prep) console.log("   ", row.label, "| homes", row.homes, "| tiles", row.tiles!.length, row.heading ?? "");
  while (!run.landed.has(c.id)) passYear(run);
  t = performance.now();
  run.refreshPrep();
  console.log("next phase gen ms", Math.round(performance.now() - t));
}
