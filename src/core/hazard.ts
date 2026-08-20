import { type AxialCoord, axialKey, neighbor } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";

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
 * Shared wave-by-wave BFS spread engine: a hazard originates at `sources`
 * and decays by `decay` per hop across adjacent tiles — v2.2 (Section 4)
 * retired the elevation-tier system along with every non-coastal terrain,
 * so there is no longer any uphill/downhill gate to apply; every hazard now
 * spreads by adjacency/distance from its source alone, which is exactly
 * what hop-count decay over a hex-adjacency graph already models. A
 * catastrophic engineered failure's redirected spike falls out of this same
 * propagation — no special-cased "inland neighbor" step needed.
 */
function resolveHazardWave(
  state: GameState,
  hazardId: string,
  sources: Map<string, WaveNode>,
  decay: number,
  skipDamage: (terrainId: string, key: string) => boolean
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

      if (skipDamage(tile.terrainId, key)) {
        outgoing = severity * decay;
      } else {
        const instElementId = state.elements.get(key)?.elementId;
        const def = instElementId ? ELEMENT_BY_ID.get(instElementId) : undefined;
        const targets = def?.targetsHazards?.includes(hazardId);

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
 * Monsoon Flood (Section 5): originates at the river, spreads outward by
 * adjacency, decaying with distance. An undefended river tile never "takes
 * damage" — it's the source, not a victim — but a Small Dam is built
 * directly on the river itself (Section 4's terrain roster), so a dammed
 * river tile is the one exception: it stops being skipped and goes through
 * the normal defense check instead, engaging at the source's full,
 * undecayed severity.
 */
export function resolveMonsoonFlood(state: GameState, baseSeverity = 1.0): HazardResult {
  const sources = new Map<string, WaveNode>();
  for (const tile of state.placed.values()) {
    if (tile.terrainId === "river") sources.set(axialKey(tile.coord), { coord: tile.coord, severity: baseSeverity });
  }

  const result = resolveHazardWave(
    state,
    "monsoon_flood",
    sources,
    FLOOD_DECAY,
    (t, key) => t === "river" && !state.elements.has(key)
  );
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
const DAMAGE_TRUST_THRESHOLD = 0.3;

export interface CycloneResult extends HazardResult {
  trustLost: number;
}

/**
 * Cyclone (Section 5): hits coast/estuary tiles first (wind+surge combined
 * into one hazard for this pilot), attenuates inland by distance from the
 * sea.
 */
export function resolveCyclone(state: GameState, baseSeverity = 1.0): CycloneResult {
  const sources = new Map<string, WaveNode>();
  for (const tile of state.placed.values()) {
    if (tile.terrainId === "coast" || tile.terrainId === "estuary") {
      sources.set(axialKey(tile.coord), { coord: tile.coord, severity: baseSeverity });
    }
  }

  const result = resolveHazardWave(state, "cyclone", sources, CYCLONE_DECAY, () => false);
  state.applyHazardOutcome(sumDamage(result), result.destroyedDefenses.length);

  let trustLost = 0;
  for (const [key, damage] of result.tileDamage) {
    if (damage < DAMAGE_TRUST_THRESHOLD || !state.hasBuildingAt(key)) continue;
    trustLost += TRUST_LOSS_PER_DAMAGED_BUILDING;
  }
  state.trust = Math.max(0, state.trust - trustLost);

  return { ...result, trustLost };
}
