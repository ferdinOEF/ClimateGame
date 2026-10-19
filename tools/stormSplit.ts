/**
 * Each Panjim storm with nothing built, played through the real rules
 * (`ActionRun`): its strength, landfall, homes lost and the split by locality
 * (a home takes the name of its nearest locality label; ties go to the name
 * first in the alphabet). Unplayable tiles (the north bank, the east edge) are
 * scenery and never count. The 2050 numbers come from a run that lost the
 * earlier storms' homes too, as in the game. Also the playable house count.
 *
 * Usage: npx tsx tools/stormSplit.ts   (Markdown to stdout)
 */
import { ActionRun } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { homesLost } from "../src/core/phaseObjectives";
import { LANDFALL_ZONE, waterBoard } from "../src/core/hazardModel";
import { axialDistance } from "../src/core/hex";
import { boardSetup } from "../src/levels/balance";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID } from "../src/levels/levels";

const level = LEVEL_BY_ID.get("l01-first-rains")!;
const map = mapById(level.mapId)!;
const setup = boardSetup(level, map);
const state = new GameState(map.tiles, setup.startingElements, level.startingCoin);
for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
for (const id of setup.excluded) state.excludedElements.add(id);
for (const key of setup.unbuildable) state.unbuildable.add(key);
for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
const run = new ActionRun(state, level.timeline!, {
  climate: level.climate, zones: map.zones, houseStars: level.houseStars, houseRule: level.houses?.rule, prep: level.prep,
  economy: level.economy, growth: level.growth, landmarks: map.landmarks, localities: map.localities
});
const endYear = (r: ActionRun): void => void (r as unknown as { endYear(): unknown }).endYear();

function locality(key: string): string {
  const [q, r] = key.split(",").map(Number);
  let best = "";
  let bestD = Infinity;
  for (const l of [...map.localities].sort((a, b) => a.name.localeCompare(b.name))) {
    const d = axialDistance({ q, r }, { q: l.q, r: l.r });
    if (d < bestD) (bestD = d), (best = l.name);
  }
  return best;
}

const houses = [...state.elements].filter(([key, inst]) => inst.elementId === "house" && !state.isScenery(key));
const scenery = [...state.elements].filter(([key, inst]) => inst.elementId === "house" && state.isScenery(key));
console.log(`Playable houses at the start: ${houses.length} (scenery houses, never counted: ${scenery.length}).\n`);
console.log("| Storm | Strength | Landfall | Homes lost | By locality |\n|---|---|---|---|---|");
const lists: string[] = [];
const lz = run.zones!.keys(LANDFALL_ZONE);
for (const challenge of run.schedule) {
  while (!run.finished && run.turnNumber < run.phaseStart(challenge)) endYear(run);
  const landfall = run.landfallOf(challenge);
  const lost = [...homesLost(run.state, { kind: challenge.kind, strength: challenge.strength, landfall }, lz)].sort();
  const split: Record<string, number> = {};
  for (const key of lost) split[locality(key)] = (split[locality(key)] ?? 0) + 1;
  const ordered = Object.entries(split).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n, c]) => `${n} ${c}`).join(", ");
  console.log(`| ${challenge.year} ${challenge.name} | ${challenge.strength} | ${landfall !== null && landfall !== undefined ? waterBoard(run.state, lz).sites[landfall] : "-"} | ${lost.length} | ${ordered} |`);
  lists.push(`**${challenge.year} ${challenge.name}:** ${lost.map((k) => `${k}(${locality(k)})`).join(" ")}`);
  while (!run.finished && !run.landed.has(challenge.id)) endYear(run);
}
console.log(`\n${lists.join("\n\n")}`);
