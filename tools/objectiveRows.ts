/**
 * Section 17.4: the objective rows the model generates for each phase, on an
 * undefended board (the clock moved on with nothing built) and on the board a
 * player who follows each objective has. Prints Markdown.
 *
 * Usage: npx tsx tools/objectiveRows.ts [levelId ...]  (default: Panjim and the Tutorial)
 */
import { ActionRun } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { NATURE_BASED } from "../src/core/elements";
import { boardSetup } from "../src/levels/balance";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID, type LevelDef } from "../src/levels/levels";

function run(level: LevelDef): ActionRun {
  const map = mapById(level.mapId)!;
  const setup = boardSetup(level, map);
  const state = new GameState(map.tiles, setup.startingElements, level.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
  return new ActionRun(state, level.timeline!, {
    climate: level.climate,
    zones: map.zones,
    houseStars: level.houseStars,
    houseRule: level.houses?.rule,
    prep: level.prep,
    economy: level.economy,
    growth: level.growth,
    landmarks: map.landmarks,
    localities: map.localities
  });
}

const endYear = (r: ActionRun): void => void (r as unknown as { endYear(): unknown }).endYear();

function rows(r: ActionRun, challengeId: string): string[] {
  return r.prep.filter((job) => job.challengeId === challengeId).map((job) => `${job.label} (${job.count}; model: ${job.homes ?? "?"} ${job.homes === 1 ? "home" : "homes"})`);
}

let bad = 0;
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ["l01-first-rains", "l00-tutorial"]) {
  const level = LEVEL_BY_ID.get(id)!;
  for (const mode of ["undefended", "following"] as const) {
    const r = run(level);
    console.log(`\n### ${level.name}: ${mode === "undefended" ? "on an undefended board" : "following each objective"}\n`);
    for (const storm of r.schedule) {
      while (!r.finished && r.turnNumber < r.phaseStart(storm)) endYear(r);
      const objective = r.objective;
      const heading = r.prep.find((job) => job.challengeId === storm.id)?.heading ?? "(no heading)";
      console.log(`- **${storm.year} ${storm.name}** — ${heading}; homes lost ${objective?.lostBefore ?? "?"} → ${objective?.lostAfter ?? "?"} with every row built`);
      for (const line of rows(r, storm.id)) console.log(`  - ${line}`);
      for (const pick of objective?.picks ?? []) if (!(NATURE_BASED as readonly string[]).includes(pick.elementId)) (bad++, console.log(`  - NOT NATURE-BASED: ${pick.elementId} at ${pick.key}`));
      if (mode === "following") for (const pick of objective?.picks ?? []) {
        const [q, rr] = pick.key.split(",").map(Number);
        if (r.turnNumber >= storm.turn + 1) break;
        r.build({ q, r: rr }, pick.elementId);
      }
      while (!r.finished && !r.landed.has(storm.id)) endYear(r);
    }
  }
}
console.log(bad === 0 ? "\nEvery pick is nature-based." : `\n${bad} picks are not nature-based.`);
process.exit(bad === 0 ? 0 : 1);
