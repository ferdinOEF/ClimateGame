import { type AxialCoord, axialDistance, axialKey, neighbor } from "./hex";
import { TERRAIN_BY_ID, type TerrainDef } from "./terrain";
import { DEFENSE_BY_ID } from "./defenses";
import type { GameState } from "./gameState";

const TIER_RANK: Record<TerrainDef["elevationTier"], number> = {
  coastal: 0,
  midland: 1,
  highland: 2
};

export interface HazardResult {
  /** Effective damage dealt at each affected tile (coord key -> severity). */
  tileDamage: Map<string, number>;
  /** Coord keys where an engineered defense catastrophically failed this event. */
  destroyedDefenses: string[];
  /** Coord keys where an NBS/hybrid defense was overwhelmed this event. */
  overwhelmedDefenses: string[];
}

interface WaveNode {
  coord: AxialCoord;
  severity: number;
}

/**
 * Shared wave-by-wave BFS spread engine: a hazard originates at `sources`,
 * decays by `decay` per hop, and only continues onto a neighbor when
 * `canPropagate` allows it (flood: downhill/level only; cyclone: anywhere).
 * A catastrophic engineered failure's redirected spike falls out of this
 * same propagation — no special-cased "inland neighbor" step needed.
 */
function resolveHazardWave(
  state: GameState,
  hazardId: string,
  sources: Map<string, WaveNode>,
  decay: number,
  canPropagate: (fromCoord: AxialCoord, toCoord: AxialCoord) => boolean,
  skipDamage: (terrainId: string) => boolean
): HazardResult {
  const tileDamage = new Map<string, number>();
  const destroyedDefenses: string[] = [];
  const overwhelmedDefenses: string[] = [];
  const visited = new Set<string>();

  let wave = sources;
  const MIN_SEVERITY = 0.08;

  while (wave.size > 0) {
    const nextWave = new Map<string, WaveNode>();

    for (const { coord, severity } of wave.values()) {
      const key = axialKey(coord);
      if (visited.has(key) || severity < MIN_SEVERITY) continue;
      visited.add(key);

      const tile = state.placed.get(key);
      if (!tile) continue;
      let outgoing: number;

      if (skipDamage(tile.terrainId)) {
        outgoing = severity * decay;
      } else {
        const instDefenseId = state.defenses.get(key)?.defenseId;
        const def = instDefenseId ? DEFENSE_BY_ID.get(instDefenseId) : undefined;
        const targets = def?.targetsHazards.includes(hazardId);

        if (def && targets && def.category === "engineered" && def.failureThreshold !== undefined && severity > def.failureThreshold) {
          tileDamage.set(key, severity);
          state.destroyDefense(coord);
          destroyedDefenses.push(key);
          outgoing = severity * (def.failureRedirectMultiplier ?? 1);
        } else if (def && targets) {
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
          outgoing = dealt * decay;
        } else {
          tileDamage.set(key, severity);
          outgoing = severity * decay;
        }
      }

      if (outgoing < MIN_SEVERITY) continue;

      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(coord, dir);
        const nKey = axialKey(n);
        if (visited.has(nKey) || !state.placed.has(nKey)) continue;
        if (!canPropagate(coord, n)) continue;

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

const FLOOD_DECAY = 0.72;

/**
 * Monsoon Flood (Section 5): originates at river tiles, flows downhill/level
 * along elevation tiers toward the coastal plain, decaying with distance.
 * The river itself never "takes damage" — it's the source, not a victim.
 */
export function resolveMonsoonFlood(state: GameState, baseSeverity = 1.0): HazardResult {
  const sources = new Map<string, WaveNode>();
  for (const tile of state.placed.values()) {
    if (tile.terrainId === "river") sources.set(axialKey(tile.coord), { coord: tile.coord, severity: baseSeverity });
  }

  const canPropagate = (from: AxialCoord, to: AxialCoord): boolean => {
    const fromTile = state.placed.get(axialKey(from))!;
    const toTile = state.placed.get(axialKey(to))!;
    const fromTier = TIER_RANK[TERRAIN_BY_ID.get(fromTile.terrainId)!.elevationTier];
    const toTier = TIER_RANK[TERRAIN_BY_ID.get(toTile.terrainId)!.elevationTier];
    return toTier <= fromTier; // never flows uphill
  };

  const result = resolveHazardWave(state, "monsoon_flood", sources, FLOOD_DECAY, canPropagate, (t) => t === "river");
  state.applyHazardOutcome(sumDamage(result), result.destroyedDefenses.length);
  return result;
}

function sumDamage(result: HazardResult): number {
  let total = 0;
  for (const d of result.tileDamage.values()) total += d;
  return total;
}

const CYCLONE_DECAY = 0.6; // attenuates faster than the flood — a sudden, more localized hazard
const TRUST_LOSS_PER_DAMAGED_BUILDING = 3;
const SHELTER_PROTECTION_FACTOR = 0.15; // sheltered buildings keep 85% of the trust they'd otherwise lose
const DAMAGE_TRUST_THRESHOLD = 0.3;

export interface CycloneResult extends HazardResult {
  trustLost: number;
  shelteredBuildings: string[];
}

/**
 * Cyclone (Section 5): hits coast/estuary tiles first (wind+surge combined
 * into one hazard for this pilot), attenuates inland — no elevation gating,
 * since wind reaches uphill just as readily as down. Cyclone Shelter is
 * deliberately unlike every other defense here: it does nothing to
 * `tileDamage` (see its `absorptionAtMaturity: 0`) and instead protects
 * Trust for buildings within its radius.
 */
export function resolveCyclone(state: GameState, baseSeverity = 1.0): CycloneResult {
  const sources = new Map<string, WaveNode>();
  for (const tile of state.placed.values()) {
    if (tile.terrainId === "coast" || tile.terrainId === "estuary") {
      sources.set(axialKey(tile.coord), { coord: tile.coord, severity: baseSeverity });
    }
  }

  const result = resolveHazardWave(state, "cyclone", sources, CYCLONE_DECAY, () => true, () => false);
  state.applyHazardOutcome(sumDamage(result), result.destroyedDefenses.length);

  const shelterCoords: AxialCoord[] = [];
  for (const [key, inst] of state.defenses) {
    if (inst.defenseId === "cyclone_shelter") {
      const [q, r] = key.split(",").map(Number);
      shelterCoords.push({ q, r });
    }
  }
  const shelterRadius = DEFENSE_BY_ID.get("cyclone_shelter")?.protectionRadius ?? 0;

  let trustLost = 0;
  const shelteredBuildings: string[] = [];
  for (const [key, damage] of result.tileDamage) {
    if (damage < DAMAGE_TRUST_THRESHOLD || !state.buildings.has(key)) continue;
    const [q, r] = key.split(",").map(Number);
    const coord = { q, r };
    const sheltered = shelterCoords.some((s) => axialDistance(s, coord) <= shelterRadius);
    if (sheltered) {
      shelteredBuildings.push(key);
      trustLost += TRUST_LOSS_PER_DAMAGED_BUILDING * SHELTER_PROTECTION_FACTOR;
    } else {
      trustLost += TRUST_LOSS_PER_DAMAGED_BUILDING;
    }
  }

  state.trust = Math.max(0, state.trust - trustLost);

  return { ...result, trustLost, shelteredBuildings };
}
