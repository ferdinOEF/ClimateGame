/**
 * Section 31: the Tutorial run headless (its own map, tutorial.json), for tuning its two storms and for the tests:
 * nothing built; each defence alone on its best tile; and the nudged order, each on the tile that saves most.
 *
 * Usage: npx tsx tools/tutorial/sim.ts [cyclone=1.3] [flood=1.5]
 */
import { ActionRun } from "../../src/core/actionRun";
import { GameState } from "../../src/core/gameState";
import { boardSetup } from "../../src/levels/balance";
import { mapById } from "../../src/levels/levelMap";
import { LEVEL_BY_ID } from "../../src/levels/levels";
import type { AxialCoord } from "../../src/core/hex";

export const TUTORIAL_LEVEL = LEVEL_BY_ID.get("l00-tutorial")!;
const MAP = mapById("tutorial")!;
import { NUDGE_ORDER, goodTiles } from "../../src/core/tutorialNudge";
export { NUDGE_ORDER, goodTiles };

export function tutorialRun(strengths?: { cyclone?: number; flood?: number }): ActionRun {
  const level = JSON.parse(JSON.stringify(TUTORIAL_LEVEL)) as typeof TUTORIAL_LEVEL;
  for (const c of level.climate!.challenges) {
    if (c.kind === "cyclone" && strengths?.cyclone !== undefined) c.strength = strengths.cyclone;
    if (c.kind === "flood" && strengths?.flood !== undefined) c.strength = strengths.flood;
  }
  const setup = boardSetup(level, MAP);
  const state = new GameState(MAP.tiles, setup.startingElements, level.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  return new ActionRun(state, level.timeline!, {
    climate: level.climate,
    zones: MAP.zones,
    houseStars: level.houseStars,
    houseRule: level.houses?.rule,
    prep: level.prep,
    economy: level.economy,
    growth: level.growth,
    landmarks: MAP.landmarks,
    generateObjectives: false
  });
}

/** The tile where `elementId` saves the most homes from the next storm (ties: the first), with that count. */
export function bestTile(run: ActionRun, elementId: string): { coord: AxialCoord; saves: number } | null {
  const next = run.nextChallenge();
  let best: { coord: AxialCoord; saves: number } | null = null;
  for (const tile of run.state.placed.values()) {
    if (!run.state.canBuild(tile.coord, elementId)) continue;
    const saves = next ? (run.homesSavedBy(next, tile.coord, elementId) ?? 0) : 0;
    if (!best || saves > best.saves) best = { coord: tile.coord, saves };
  }
  return best;
}

/** Any free tile far from both storms (a build that does nothing), for "nothing built". */
function idleTile(run: ActionRun): AxialCoord | null {
  for (const tile of run.state.placed.values()) {
    const ids = run.state.buildableAt(tile.coord).map((d) => d.id);
    for (const id of ids) {
      const next = run.nextChallenge();
      if (!next || (run.homesSavedBy(next, tile.coord, id) ?? 0) === 0) return tile.coord;
    }
  }
  return null;
}

export interface StormResult {
  id: string;
  stars: number;
  saved: number;
  total: number;
}
const results = (run: ActionRun): StormResult[] => run.schedule.map((c) => ({ id: c.id, stars: run.outcomes.get(c.id)?.stars ?? -1, saved: run.outcomes.get(c.id)?.housesSaved ?? 0, total: run.outcomes.get(c.id)?.housesTotal ?? 0 }));

/** The nudges followed: each year the suggested defence on its best tile. */
export function playNudges(strengths?: { cyclone?: number; flood?: number }): { run: ActionRun; storms: StormResult[]; builds: { elementId: string; key: string; saves: number }[] } {
  const run = tutorialRun(strengths);
  const builds: { elementId: string; key: string; saves: number }[] = [];
  for (const id of NUDGE_ORDER) {
    const best = bestTile(run, id);
    if (!best) throw new Error(`${id} cannot be built anywhere`);
    builds.push({ elementId: id, key: `${best.coord.q},${best.coord.r}`, saves: best.saves });
    const ok = run.build(best.coord, id);
    if (!ok.ok) throw new Error(`${id} refused: ${ok.reason}`);
  }
  return { run, storms: results(run), builds };
}

/** Nothing that helps: each year a build that saves nothing. */
export function playNothing(strengths?: { cyclone?: number; flood?: number }): StormResult[] {
  const run = tutorialRun(strengths);
  while (!run.finished) {
    const tile = idleTile(run);
    if (!tile) throw new Error("no idle tile");
    const id = run.state.buildableAt(tile).map((d) => d.id).find((e) => (run.homesSavedBy(run.nextChallenge()!, tile, e) ?? 0) === 0)!;
    if (!run.build(tile, id).ok) throw new Error("idle build refused");
  }
  return results(run);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Map(process.argv.slice(2).map((a) => a.split("=") as [string, string]));
  const strengths = { cyclone: args.has("cyclone") ? Number(args.get("cyclone")) : undefined, flood: args.has("flood") ? Number(args.get("flood")) : undefined };
  const bare = tutorialRun(strengths);
  for (const c of bare.schedule) console.log(`${c.id} (${c.kind}, ${c.year}, strength ${c.strength}): undefended homes at risk ${bare.homesAtRisk(c)}`);
  for (const id of NUDGE_ORDER) {
    const run = tutorialRun(strengths);
    // Each defence alone, on the bare board, against each storm: the most homes it saves on one tile.
    const per = run.schedule.map((c) => {
      let most = 0;
      for (const t of run.state.placed.values()) if (run.state.canBuild(t.coord, id)) most = Math.max(most, run.homesSavedBy(c, t.coord, id) ?? 0);
      return `${c.id} ${most}`;
    });
    console.log(`${id}: alone saves at most ${per.join(", ")}`);
  }
  const n = playNudges(strengths);
  console.log("nudges:", n.builds.map((b) => `${b.elementId}@${b.key} (+${b.saves})`).join(" "), "|", n.storms.map((s) => `${s.id} ${s.stars}★ ${s.saved}/${s.total}`).join(", "));
  console.log("nothing:", playNothing(strengths).map((s) => `${s.id} ${s.stars}★ ${s.saved}/${s.total}`).join(", "));
}

/** The nudges followed on the weakest of the pulsing tiles each year (the hardest a nudged player can do). */
export function playNudgesWeakest(): StormResult[] {
  const run = tutorialRun();
  for (const id of NUDGE_ORDER) {
    const tiles = goodTiles(run, id);
    const pick = tiles[tiles.length - 1]?.coord ?? bestTile(run, id)!.coord;
    if (!run.build(pick, id).ok) throw new Error(`${id} refused`);
  }
  return results(run);
}
