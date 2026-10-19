import { ActionRun } from "../../src/core/actionRun";
import { GameState } from "../../src/core/gameState";
import { boardSetup } from "../../src/levels/balance";
import { mapById } from "../../src/levels/levelMap";
import type { LevelDef } from "../../src/levels/levels";

/** A run set up as the session sets it up, objectives on (the bots' newRun turns them off). */
export function sessionRun(level: LevelDef): ActionRun {
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
