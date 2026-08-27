import { axialKey, neighbor } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";

export interface HazardResult {
  /** Effective damage dealt at each affected tile (coord key -> severity). */
  tileDamage: Map<string, number>;
  /** Coord keys where an engineered defense catastrophically failed this event. */
  destroyedDefenses: string[];
  /** Coord keys where an NBS/hybrid defense was overwhelmed this event. */
  overwhelmedDefenses: string[];
  /**
   * STEP_PROMPT_hazard_science.md Section 6: which BFS round each damaged
   * tile was first reached in (0 = a source tile). The render layer uses
   * this to sequence the wave-sweep/river-flood animations so they visibly
   * match the actual hop-by-hop resolution — a river-connected tile several
   * hops away lighting up later than an equally-distant Beach/Land tile
   * would, exactly because the channel's shallower decay keeps the wave
   * alive for more rounds there — instead of a generic decorative sweep
   * disconnected from the real propagation.
   */
  arrivalRound: Map<string, number>;
}

/** The per-hop decay multiplier for one specific edge (from one tile's terrain to its neighbor's) — lets a hazard give the river channel its own shallower decay (Section 2) without a special-cased branch in the propagation loop itself. */
type DecayFn = (fromTerrainId: string, toTerrainId: string) => number;

const MIN_SEVERITY = 0.08;

/**
 * Shared wave-by-wave BFS spread engine: a hazard originates at `sources`
 * and decays hop-by-hop across adjacent tiles, per-edge decay decided by
 * `decayFor` (river-channel funneling — Section 2). v2.2 (Section 4)
 * retired the elevation-tier system along with every non-coastal terrain,
 * so there is no longer any uphill/downhill gate to apply; every hazard now
 * spreads by adjacency/distance from its source(s) alone. A catastrophic
 * engineered failure's redirected spike falls out of this same
 * propagation — no special-cased "inland neighbor" step needed.
 */
function resolveHazardWave(
  state: GameState,
  hazardId: string,
  sources: Map<string, number>,
  decayFor: DecayFn,
  skipDamage: (terrainId: string, key: string) => boolean
): HazardResult {
  const tileDamage = new Map<string, number>();
  const destroyedDefenses: string[] = [];
  const overwhelmedDefenses: string[] = [];
  const arrivalRound = new Map<string, number>();
  const visited = new Set<string>();

  let wave = sources;
  let round = 0;

  while (wave.size > 0) {
    const nextWave = new Map<string, number>();

    for (const [key, severity] of wave) {
      if (visited.has(key) || severity < MIN_SEVERITY) continue;
      visited.add(key);
      arrivalRound.set(key, round);

      const tile = state.placed.get(key);
      if (!tile) continue;

      let passthrough: number; // severity continuing onward, before the next hop's own decay

      if (skipDamage(tile.terrainId, key)) {
        passthrough = severity;
      } else {
        const instElementId = state.elements.get(key)?.elementId;
        const def = instElementId ? ELEMENT_BY_ID.get(instElementId) : undefined;
        const targets = def?.targetsHazards?.includes(hazardId);

        if (def && targets && def.floodBufferCapacityM3 !== undefined) {
          // Reservoir mechanic (STEP_PROMPT_hazard_science.md Section 4,
          // extended to engineered structures by STEP_PROMPT_small_dam_
          // reservoir.md): a Khazan or Small Dam doesn't attenuate a wave's
          // energy the way vegetation does, it STORES water up to a
          // capacity — draw that down first, regardless of category. Only
          // once you know what actually overtopped the buffer does a
          // catastrophic-breach test make physical sense, so an engineered
          // reservoir's own failureThreshold check moves in here too,
          // evaluated against the post-buffer overflowSeverity rather than
          // the raw incoming severity — a dam breach releases what
          // overtopped it, not the raw incoming pulse. Khazan has no
          // failureThreshold, so it always falls to the plain overwhelm/
          // absorption branch below, unaffected by this restructuring.
          const volume = severity * HEX_AREA_M2 * FLOOD_VOLUME_DEPTH_M;
          const overflowVolume = state.drawDownFloodBuffer(tile.coord, volume);
          const overflowSeverity = severity * (overflowVolume / volume);

          if (overflowSeverity < MIN_SEVERITY) {
            passthrough = 0; // fully absorbed by the reservoir this event — no damage, nothing propagates onward
          } else if (def.category === "engineered" && def.failureThreshold !== undefined && overflowSeverity > def.failureThreshold) {
            tileDamage.set(key, overflowSeverity);
            state.destroyDefense(tile.coord);
            destroyedDefenses.push(key);
            passthrough = overflowSeverity * (def.failureRedirectMultiplier ?? 1);
          } else {
            let absorption = state.effectiveAbsorption(tile.coord);
            if (def.overwhelmSeverity !== undefined && overflowSeverity > def.overwhelmSeverity) {
              absorption *= def.overwhelmedAbsorptionMultiplier ?? 0.5;
              overwhelmedDefenses.push(key);
              if (def.degradeGracefully && def.gracefulDegradeStep) {
                state.degradeDefense(tile.coord, def.gracefulDegradeStep);
              }
            }
            const dealt = overflowSeverity * (1 - absorption);
            tileDamage.set(key, dealt);
            passthrough = dealt;
          }
        } else if (def && targets && def.category === "engineered" && def.failureThreshold !== undefined && severity > def.failureThreshold) {
          // Unchanged — Seawall's own path (no floodBufferCapacityM3, so
          // it never enters the branch above). Still tests against raw
          // severity exactly as before.
          tileDamage.set(key, severity);
          state.destroyDefense(tile.coord);
          destroyedDefenses.push(key);
          passthrough = severity * (def.failureRedirectMultiplier ?? 1);
        } else if (def && targets) {
          let absorption = state.effectiveAbsorption(tile.coord);
          if (def.overwhelmSeverity !== undefined && severity > def.overwhelmSeverity) {
            absorption *= def.overwhelmedAbsorptionMultiplier ?? 0.5;
            overwhelmedDefenses.push(key);
            if (def.degradeGracefully && def.gracefulDegradeStep) {
              state.degradeDefense(tile.coord, def.gracefulDegradeStep);
            }
          }
          const dealt = severity * (1 - absorption);
          tileDamage.set(key, dealt);
          passthrough = dealt;
        } else {
          tileDamage.set(key, severity);
          passthrough = severity;
        }
      }

      if (passthrough < MIN_SEVERITY) continue;

      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(tile.coord, dir);
        const nKey = axialKey(n);
        if (visited.has(nKey) || !state.placed.has(nKey)) continue;
        const nTile = state.placed.get(nKey)!;
        const hopSeverity = passthrough * decayFor(tile.terrainId, nTile.terrainId);
        if (hopSeverity < MIN_SEVERITY) continue;

        const existing = nextWave.get(nKey);
        if (existing === undefined || hopSeverity > existing) nextWave.set(nKey, hopSeverity);
      }
    }

    wave = nextWave;
    round++;
  }

  return { tileDamage, destroyedDefenses, overwhelmedDefenses, arrivalRound };
}

function sumDamage(result: HazardResult): number {
  let total = 0;
  for (const d of result.tileDamage.values()) total += d;
  return total;
}

// STEP_PROMPT_hazard_science.md Section 2: a storm surge (and, per Section
// 3, Flood too — "the same physical channel") funnels up/down a tidal
// river/estuary channel with markedly less energy loss than spreading over
// open Beach/Land, because the channel constrains and directs the flow
// instead of letting it spread and dissipate in two dimensions. PLACEHOLDER
// constant (same "flag it, let the balance harness refine it" convention as
// every other number in this project) — noticeably shallower than either
// hazard's general-terrain decay, so a wave measured in hops-to-reach
// carries much further up/down the channel than the same hop count would
// over Beach/Land. Applies strictly to River-to-River hops, per the step
// prompt's own literal wording — the one hop where the channel meets the
// Estuary still uses the hazard's general decay.
const RIVER_CHANNEL_DECAY = 0.82;

function channelAwareDecay(generalDecay: number): DecayFn {
  return (fromTerrainId, toTerrainId) =>
    fromTerrainId === "river" && toTerrainId === "river" ? RIVER_CHANNEL_DECAY : generalDecay;
}

/**
 * BFS hop-distance from `sourceKeys`, restricted to River/Estuary tiles
 * only — used to find "the river tile(s) at the map's inland extreme" and
 * "the river tile(s) nearest the Estuary" (Section 3) by actual channel
 * distance rather than raw axial coordinates, which aren't directly
 * comparable across rows once the map's row-offset grid (see `tools/
 * mapgen/generate.ts`) or a winding river shape (see the map-reshape pass)
 * is in play.
 */
function riverChannelHopsFrom(state: GameState, sourceKeys: string[]): Map<string, number> {
  const subgraph = new Set<string>();
  for (const tile of state.placed.values()) {
    if (tile.terrainId === "river" || tile.terrainId === "estuary") subgraph.add(axialKey(tile.coord));
  }
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const key of sourceKeys) {
    if (!subgraph.has(key)) continue;
    dist.set(key, 0);
    queue.push(key);
  }
  let qi = 0;
  while (qi < queue.length) {
    const key = queue[qi++];
    const d = dist.get(key)!;
    const [q, r] = key.split(",").map(Number);
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbor({ q, r }, dir);
      const nKey = axialKey(n);
      if (!subgraph.has(nKey) || dist.has(nKey)) continue;
      dist.set(nKey, d + 1);
      queue.push(nKey);
    }
  }
  return dist;
}

const FLOOD_CAP_MULTIPLIER = 3; // PLACEHOLDER ceiling (Section 3: "2.5-3x base severity")

/**
 * Merges two independent hazard passes into one compound result — Section
 * 3's "where the two wavefronts overlap, combine their severities (sum,
 * capped) rather than resolving them as two independent, unaware layers."
 * Deliberately implemented as "run each front's full resolution
 * separately, then sum the resulting DAMAGE at tiles both reached" rather
 * than a single interleaved BFS that sums SEVERITY before defenses see it —
 * a simpler, always-terminating model that still produces the real,
 * observable "the overlap zone fares worse" outcome the science calls for.
 * The one honest fidelity gap this trades away: a defense sitting exactly
 * in the overlap zone judges its own overwhelm/catastrophic-failure
 * threshold against each front's severity independently, not the true
 * combined severity — so a defense that would realistically be overwhelmed
 * only by the SUM of both fronts might not register as overwhelmed here.
 * Flagged as a known simplification, not silently glossed over.
 */
function mergeCompoundResults(a: HazardResult, b: HazardResult, severityCap: number): HazardResult {
  const tileDamage = new Map<string, number>();
  const keys = new Set([...a.tileDamage.keys(), ...b.tileDamage.keys()]);
  for (const key of keys) {
    const da = a.tileDamage.get(key) ?? 0;
    const db = b.tileDamage.get(key) ?? 0;
    tileDamage.set(key, Math.min(severityCap, da + db));
  }

  const arrivalRound = new Map<string, number>();
  for (const key of new Set([...a.arrivalRound.keys(), ...b.arrivalRound.keys()])) {
    const ra = a.arrivalRound.get(key);
    const rb = b.arrivalRound.get(key);
    arrivalRound.set(key, Math.min(ra ?? Infinity, rb ?? Infinity));
  }

  return {
    tileDamage,
    destroyedDefenses: [...new Set([...a.destroyedDefenses, ...b.destroyedDefenses])],
    overwhelmedDefenses: [...new Set([...a.overwhelmedDefenses, ...b.overwhelmedDefenses])],
    arrivalRound
  };
}

const FLOOD_DECAY = 0.72;
// Section 4's severity-to-volume conversion (PLACEHOLDER, flagged same as
// every other number here): one hex = 100m x 100m = 1 hectare (10,000 m2,
// matching the mapgen's own scale assumption). FLOOD_VOLUME_DEPTH_M is
// chosen so a baseSeverity-1.0 event over one hex works out to ~1,500 m3 —
// deliberately equal to Khazan's own placeholder floodBufferCapacityM3, a
// clean reference point (an empty Khazan exactly absorbs one full-severity
// event) rather than an independently-tuned number.
const HEX_AREA_M2 = 10000;
const FLOOD_VOLUME_DEPTH_M = 0.15;

/**
 * Flood (Section 3): redefined as genuinely directional/two-sided rather
 * than "the whole river materializing at full severity everywhere at once."
 * Upstream source: the river tile(s) farthest along the river/estuary
 * channel itself (not straight-line hex distance) from the Estuary —
 * catchment discharge arriving from upstream, off-map. This alone is the
 * Flood on its own, no Storm Surge Wave required. Downstream/tidal-push
 * source: the river tile(s) nearest the Estuary, added ONLY when
 * `stormSurgeActive` (Section 5 — the caller, `main.ts`, decides whether a
 * Storm Surge Wave is currently active/telegraphing or resolved within the
 * last turn or two) — representing the sea pushing back into the river
 * mouth during a concurrent surge. When both sources are active, each
 * resolves as its own full pass and `mergeCompoundResults` combines them —
 * the direct mechanical expression of compound-flooding science (Section
 * 1: Wahl et al. 2015, Moftakhari et al. 2017), not just two hazards
 * happening to share a calendar.
 *
 * A map with no Estuary tile at all (isolated defense-mechanic test
 * fixtures, mainly) has no channel to measure "farthest from" against —
 * every river tile simply becomes its own upstream source (the same
 * "whole river at once" behavior this redefinition otherwise replaces),
 * and no tidal source is possible without an estuary to push from.
 */
export function resolveMonsoonFlood(state: GameState, baseSeverity = 1.0, stormSurgeActive = false): HazardResult {
  const riverKeys: string[] = [];
  const estuaryKeys: string[] = [];
  for (const tile of state.placed.values()) {
    const key = axialKey(tile.coord);
    if (tile.terrainId === "river") riverKeys.push(key);
    else if (tile.terrainId === "estuary") estuaryKeys.push(key);
  }

  const upstream = new Map<string, number>();
  const downstream = new Map<string, number>();

  if (estuaryKeys.length === 0) {
    for (const key of riverKeys) upstream.set(key, baseSeverity);
  } else {
    const distFromEstuary = riverChannelHopsFrom(state, estuaryKeys);
    let maxDist = -1;
    for (const key of riverKeys) {
      const d = distFromEstuary.get(key);
      if (d !== undefined && d > maxDist) maxDist = d;
    }
    for (const key of riverKeys) {
      if (distFromEstuary.get(key) === maxDist) upstream.set(key, baseSeverity);
    }

    if (stormSurgeActive) {
      let minDist = Infinity;
      for (const key of riverKeys) {
        const d = distFromEstuary.get(key);
        if (d !== undefined && d < minDist) minDist = d;
      }
      for (const key of riverKeys) {
        if (distFromEstuary.get(key) === minDist) downstream.set(key, baseSeverity);
      }
    }
  }

  const skipDamage = (t: string, key: string) => t === "river" && !state.elements.has(key);
  const upstreamResult = resolveHazardWave(state, "flood", upstream, channelAwareDecay(FLOOD_DECAY), skipDamage);
  const result =
    downstream.size > 0
      ? mergeCompoundResults(upstreamResult, resolveHazardWave(state, "flood", downstream, channelAwareDecay(FLOOD_DECAY), skipDamage), baseSeverity * FLOOD_CAP_MULTIPLIER)
      : upstreamResult;

  state.applyHazardOutcome(sumDamage(result), result.destroyedDefenses.length);
  return result;
}

const CYCLONE_DECAY = 0.6; // attenuates faster than the flood — a sudden, more localized hazard
const TRUST_LOSS_PER_DAMAGED_BUILDING = 3;
const DAMAGE_TRUST_THRESHOLD = 0.3;

export interface CycloneResult extends HazardResult {
  trustLost: number;
  /**
   * STEP_PROMPT_test_slider_resort_damage.md Section 3: coord keys of
   * every House/Resort tile that just took meaningful damage — the exact
   * same condition (`damage >= DAMAGE_TRUST_THRESHOLD` and `hasBuildingAt`)
   * that already deducts Trust below, reused directly rather than
   * computing a second, possibly-inconsistent notion of "damaged enough
   * to show."
   */
  damagedBuildings: string[];
}

/**
 * Storm Surge Wave (Section 0: the display name changes, the id stays
 * "cyclone" in code — renaming it is more churn than it's worth for a
 * display-name/mechanics fix, per the step prompt's own explicit call).
 * Hits Coast/Estuary tiles first (wind+surge combined into one hazard for
 * this pilot), attenuates inland by distance from the sea — but funnels up
 * the River channel with much less decay than spreading over Beach/Land
 * (Section 2), the same channel-funneling mechanism Flood's own upstream/
 * downstream sources now use too (Section 3).
 */
export function resolveCyclone(state: GameState, baseSeverity = 1.0): CycloneResult {
  const sources = new Map<string, number>();
  for (const tile of state.placed.values()) {
    if (tile.terrainId === "coast" || tile.terrainId === "estuary") {
      sources.set(axialKey(tile.coord), baseSeverity);
    }
  }

  const result = resolveHazardWave(state, "cyclone", sources, channelAwareDecay(CYCLONE_DECAY), () => false);
  state.applyHazardOutcome(sumDamage(result), result.destroyedDefenses.length);

  let trustLost = 0;
  const damagedBuildings: string[] = [];
  for (const [key, damage] of result.tileDamage) {
    if (damage < DAMAGE_TRUST_THRESHOLD || !state.hasBuildingAt(key)) continue;
    trustLost += TRUST_LOSS_PER_DAMAGED_BUILDING;
    damagedBuildings.push(key);
  }
  state.trust = Math.max(0, state.trust - trustLost);

  return { ...result, trustLost, damagedBuildings };
}
