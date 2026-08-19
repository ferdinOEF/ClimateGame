import { type AxialCoord, axialKey, neighbor } from "./hex";
import { TERRAIN_BY_ID, type TerrainDef } from "./terrain";
import { DEFENSE_BY_ID } from "./defenses";
import type { GameState } from "./gameState";

const FLOOD_DECAY = 0.72;
const MIN_SEVERITY = 0.08;

const TIER_RANK: Record<TerrainDef["elevationTier"], number> = {
  coastal: 0,
  midland: 1,
  highland: 2
};

export interface FloodResult {
  /** Effective damage dealt at each affected tile (coord key -> [0, severity]). Rivers themselves are excluded. */
  tileDamage: Map<string, number>;
  /** Coord keys where an engineered defense catastrophically failed this event. */
  destroyedDefenses: string[];
  /** Coord keys where an NBS/hybrid defense was overwhelmed this event (khazan also gets a permanent degrade step). */
  overwhelmedDefenses: string[];
}

/**
 * Monsoon Flood (Section 5): originates at river tiles, flows downhill/level
 * along elevation tiers toward the coastal plain, decaying with distance.
 * Resolved as a wave-by-wave BFS so a catastrophic engineered failure's
 * redirected spike naturally reaches whatever tile is next in its path,
 * without special-casing "inland neighbor" as a separate step.
 */
export function resolveMonsoonFlood(state: GameState, baseSeverity = 1.0): FloodResult {
  const tileDamage = new Map<string, number>();
  const destroyedDefenses: string[] = [];
  const overwhelmedDefenses: string[] = [];

  let wave = new Map<string, { coord: AxialCoord; severity: number }>();
  for (const tile of state.placed.values()) {
    if (tile.terrainId === "river") {
      wave.set(axialKey(tile.coord), { coord: tile.coord, severity: baseSeverity });
    }
  }

  const visited = new Set<string>();

  while (wave.size > 0) {
    const nextWave = new Map<string, { coord: AxialCoord; severity: number }>();

    for (const { coord, severity } of wave.values()) {
      const key = axialKey(coord);
      if (visited.has(key) || severity < MIN_SEVERITY) continue;
      visited.add(key);

      const tile = state.placed.get(key)!;
      let outgoing: number;

      if (tile.terrainId === "river") {
        outgoing = severity * FLOOD_DECAY;
      } else {
        const instDefenseId = state.defenses.get(key)?.defenseId;
        const def = instDefenseId ? DEFENSE_BY_ID.get(instDefenseId) : undefined;
        const targetsFlood = def?.targetsHazards.includes("monsoon_flood");

        if (def && targetsFlood && def.category === "engineered" && def.failureThreshold !== undefined && severity > def.failureThreshold) {
          // Catastrophic failure: destroyed, full damage here, amplified spike passed onward.
          tileDamage.set(key, severity);
          state.destroyDefense(coord);
          destroyedDefenses.push(key);
          outgoing = severity * (def.failureRedirectMultiplier ?? 1);
        } else if (def && targetsFlood) {
          let absorption = state.effectiveAbsorption(coord);
          if (def.overwhelmSeverity !== undefined && severity > def.overwhelmSeverity) {
            absorption *= def.overwhelmedAbsorptionMultiplier ?? 0.5;
            overwhelmedDefenses.push(key);
            if (def.degradeGracefully && def.gracefulDegradeStep) {
              state.degradeDefense(coord, def.gracefulDegradeStep);
            }
          }
          const dealt = severity * (1 - absorption);
          tileDamage.set(key, dealt);
          outgoing = dealt * FLOOD_DECAY;
        } else {
          tileDamage.set(key, severity);
          outgoing = severity * FLOOD_DECAY;
        }
      }

      if (outgoing < MIN_SEVERITY) continue;

      const curTier = TIER_RANK[TERRAIN_BY_ID.get(tile.terrainId)!.elevationTier];
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(coord, dir);
        const nKey = axialKey(n);
        if (visited.has(nKey)) continue;
        const np = state.placed.get(nKey);
        if (!np) continue;
        const nTier = TIER_RANK[TERRAIN_BY_ID.get(np.terrainId)!.elevationTier];
        if (nTier > curTier) continue; // flood doesn't flow uphill

        const existing = nextWave.get(nKey);
        if (!existing || outgoing > existing.severity) {
          nextWave.set(nKey, { coord: n, severity: outgoing });
        }
      }
    }

    wave = nextWave;
  }

  return { tileDamage, destroyedDefenses, overwhelmedDefenses };
}
