/**
 * The builds-needed table (Section 16.6), for the owner's call on each phase's
 * number of builds: per storm, on the board a best-play run has when the
 * storm's phase begins (each earlier phase's objective built, one a year),
 * the hazard model's own greedy choice (core/phaseObjectives.ts, the same
 * that picks the objectives, here free of any area restriction and 25 deep):
 * how many builds reach 60% and 90% of the storm's homes saved, and the
 * homes saved with 5, 10 and 15 builds.
 *
 * `npx tsx tools/buildsNeeded.ts`. Writes Markdown to stdout.
 */
import { shelterOf } from "../src/core/climate";
import { ActionRun } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { generatePhaseObjective, homesLost } from "../src/core/phaseObjectives";
import { LANDFALL_ZONE } from "../src/core/hazardModel";
import { boardSetup } from "../src/levels/balance";
import { mapById } from "../src/levels/levelMap";
import { BOT_LEVEL } from "./panjimBots/bots";
import { passYear } from "../tests/helpers/passYear";

const MAP = mapById("panaji")!;
const DEPTH = 25;

function newSessionRun(): ActionRun {
  const setup = boardSetup(BOT_LEVEL, MAP);
  const state = new GameState(MAP.tiles, setup.startingElements, BOT_LEVEL.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  for (const m of MAP.monuments) state.reserved.add(`${m.q},${m.r}`);
  return new ActionRun(state, BOT_LEVEL.timeline!, {
    climate: BOT_LEVEL.climate, zones: MAP.zones, houseStars: BOT_LEVEL.houseStars, houseRule: BOT_LEVEL.houses?.rule, prep: BOT_LEVEL.prep,
    economy: BOT_LEVEL.economy, growth: BOT_LEVEL.growth, landmarks: MAP.landmarks, localities: MAP.localities
  });
}

const run = newSessionRun();
const lz = run.zones!.keys(LANDFALL_ZONE);
const rows: string[] = [];
for (const challenge of [...run.schedule]) {
  while (run.turnNumber < run.phaseStart(challenge)) passYear(run);
  const storm = { kind: challenge.kind, strength: challenge.strength, landfall: run.landfallOf(challenge), sheltered: shelterOf(challenge) };
  const area = [...homesLost(run.state, storm, lz)];
  const best = generatePhaseObjective({ state: run.state, zones: run.zones!, challenge, storm, landfallZoneTiles: lz, area, budget: DEPTH, places: BOT_LEVEL.prep!.places, localities: MAP.landmarks });
  const curve: number[] = [];
  for (const pick of best.picks) curve.push((curve[curve.length - 1] ?? 0) + pick.homes);
  const reach = (share: number): string => {
    const i = curve.findIndex((saved) => saved >= share * area.length);
    return i < 0 ? `not in ${DEPTH} (best ${curve[curve.length - 1] ?? 0})` : String(i + 1);
  };
  const at = (n: number): string => `${curve[Math.min(n, curve.length) - 1] ?? 0} (${area.length ? Math.round((100 * (curve[Math.min(n, curve.length) - 1] ?? 0)) / area.length) : 0}%)`;
  const builds = run.buildsUntil(challenge);
  rows.push(`| ${challenge.year} ${challenge.name.toLowerCase()} | ${builds} | ${area.length} | ${reach(0.6)} | ${reach(0.9)} | ${at(5)} | ${at(10)} | ${at(15)} |`);
  // Best play into the next phase: this phase's own objective, one build a year, then the storm.
  for (const pick of run.objective?.picks ?? []) {
    if (run.landed.has(challenge.id)) break;
    const [q, r] = pick.key.split(",").map(Number);
    run.build({ q, r }, pick.elementId);
  }
  while (!run.landed.has(challenge.id)) passYear(run);
}
console.log("| Storm | Builds in its phase | Homes at risk at its start | Builds to save 60% | Builds to save 90% | Saved with 5 | Saved with 10 | Saved with 15 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const row of rows) console.log(row);
