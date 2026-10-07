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
  /**
   * How much incoming severity each defence family took out of the wave,
   * keyed by `ElementCategory` ("nbs", "engineered", "hybrid").
   *
   * This exists for teaching, not for scoring. The game's claim is that
   * mangroves absorb a surge, and until now the only evidence a player had
   * was that the numbers were smaller than they might otherwise have been —
   * which is not evidence at all, because they never saw the counterfactual.
   * Tallying it here, inside the resolver that actually does the arithmetic,
   * means the aftermath can state what each kind of defence did without the
   * UI estimating anything.
   */
  absorbedByCategory: Map<string, number>;
  /** Severity that arrived at tiles with nothing standing on them. The size of the gap in the defences. */
  unprotectedSeverity: number;
  /** Total severity that reached any damageable tile, protected or not. The denominator for the two figures above. */
  arrivedSeverity: number;
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
  const absorbedByCategory = new Map<string, number>();
  let unprotectedSeverity = 0;
  let arrivedSeverity = 0;
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

        /*
         * One accounting step for every branch above, rather than a line
         * inside each.
         *
         * Whatever a branch decided, the energy that did NOT become damage
         * here was absorbed here — by a reservoir drawing it down, by roots
         * taking it out of the wave, or by a wall holding. Deriving it from
         * the damage each branch already recorded means this can never
         * disagree with the damage the player actually sees, which a second
         * parallel calculation eventually would.
         */
        const dealtHere = tileDamage.get(key) ?? 0;
        arrivedSeverity += severity;
        if (def && targets && def.category) {
          absorbedByCategory.set(
            def.category,
            (absorbedByCategory.get(def.category) ?? 0) + Math.max(0, severity - dealtHere)
          );
        } else {
          // Nothing here that answers this hazard. A seawall facing a river
          // flood counts as unprotected too, which is the point: it is the
          // defence being in the wrong place, not the tile being empty.
          unprotectedSeverity += severity;
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

  return {
    tileDamage,
    destroyedDefenses,
    overwhelmedDefenses,
    arrivalRound,
    absorbedByCategory,
    unprotectedSeverity,
    arrivedSeverity
  };
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

  // The two components are summed rather than capped like `tileDamage`,
  // because these are energy totals across the whole event, not a per-tile
  // severity that has to stay inside the cap.
  const absorbedByCategory = new Map<string, number>();
  for (const source of [a.absorbedByCategory, b.absorbedByCategory]) {
    for (const [category, amount] of source) {
      absorbedByCategory.set(category, (absorbedByCategory.get(category) ?? 0) + amount);
    }
  }

  return {
    tileDamage,
    destroyedDefenses: [...new Set([...a.destroyedDefenses, ...b.destroyedDefenses])],
    overwhelmedDefenses: [...new Set([...a.overwhelmedDefenses, ...b.overwhelmedDefenses])],
    arrivalRound,
    absorbedByCategory,
    unprotectedSeverity: a.unprotectedSeverity + b.unprotectedSeverity,
    arrivedSeverity: a.arrivedSeverity + b.arrivedSeverity
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

// ---------------------------------------------------------------------------
// Water depth over time: the one source the hazard visuals draw from.
// ---------------------------------------------------------------------------

/**
 * How deep the water stands on every tile, second by second, during a
 * storm, built from the storm's own resolution.
 *
 * Depth is in "damage units": 1 is the depth at which a house is lost. A
 * tile's peak depth is the hazard's local intensity there (what the zone
 * resolver worked out, house by house) divided by the house rule's
 * resilience, so a house is hit exactly when its peak depth is above 1, and
 * the water drawn over it is exactly what decided its fate. The timing (when
 * the water arrives at each tile, how fast it rises and drains) is
 * presentation, laid out from where the water comes from: tile by tile inland
 * from the sea for a surge, down the channel and then out over the banks for
 * a river flood.
 *
 * Water tiles (sea, river, wetland channel) carry the hazard's incoming
 * strength rather than a resolved local intensity: that is the swollen sea or
 * river before any defence has answered it. No house stands on them.
 *
 * Pure: no renderer, no DOM. Rendering calls `surgeDepth`, `floodDepth` and
 * `combinedDepth`; the tests check those against the resolution.
 */
export type StormKind = "cyclone" | "flood" | "compound";

export const DAMAGE_DEPTH = 1;

/** The storm's script, in seconds of storm time. Presentation only: none of it changes an outcome. */
export const STORM_TIMING = {
  cyclone: {
    /** The spiral reaches the coast. */
    landfall: 16,
    /** Seconds from landfall to the surge reaching the first row of land. */
    surgeLead: 0.5,
    /** Seconds per hex the surge takes to push further inland, shortened when it reaches far inland. */
    perHex: 0.7,
    /** The surge's push inland never takes longer than this. */
    maxInland: 7,
    rise: 2,
    hold: 3,
    drain: 5,
    /** The sea draws back before the hit: from, to (seconds before landfall). */
    drawBack: [4, 0.5] as const,
    /** How far it draws back, in damage units. */
    drawBackDepth: 0.35
  },
  flood: {
    /** Rain and the cloud band come first; the swell starts upstream after this. */
    rainLead: 6,
    /** Seconds per channel tile the swell takes downriver ("about 0.8 s"), shortened on a long channel. */
    perRiverIndex: 0.8,
    /** The swell's whole trip down the channel never takes longer than this. */
    maxTravel: 12,
    rise: 2.5,
    hold: 4,
    drain: 6,
    /** Seconds per hex the overflow takes to spread from the channel over the banks, shortened on wide banks. */
    perBankHex: 0.6,
    /** The overflow's spread over the banks never takes longer than this. */
    maxBank: 5,
    /** Seconds from the swell passing to the first overflow on the nearest bank. */
    bankLead: 1
  },
  compound: {
    /** The surge lands sooner in the finale, while the river is already rising. */
    landfall: 12,
    /** Seconds per channel tile the surge's backwater takes to push upriver from the mouth. */
    backwaterPerIndex: 0.45,
    /** Backwater ∝ surge × (riverIndex / mouthIndex)^this (see `backwaterShare`). */
    backwaterExponent: 1.6
  }
};

export interface DepthTile {
  key: string;
  terrainId: string;
  /** Peak depth of each hazard's water here, damage units. */
  surgePeak: number;
  floodPeak: number;
  /** Storm time the surge / flood water starts rising here (Infinity: never). */
  surgeArrival: number;
  floodArrival: number;
  /** Channel tiles only: position along the channel, 0 upstream to `mouthIndex` at the sea. */
  riverIndex: number | null;
  /** Channel tiles in a compound storm: the surge's backwater pushed up the river. */
  backwaterPeak: number;
  backwaterArrival: number;
  /** A house stood here when the storm came. */
  house: boolean;
}

export interface DepthField {
  kind: StormKind;
  tiles: Map<string, DepthTile>;
  mouthIndex: number;
  /** Seconds per channel index the swell actually uses on this board. */
  perRiverIndex: number;
  /** Storm time of landfall (cyclone or compound), else null. */
  landfall: number | null;
  /** Storm time by which all the water has drained. */
  duration: number;
}

export interface DepthFieldInput {
  kind: StormKind;
  /** Every tile on the board. */
  tiles: { key: string; terrainId: string }[];
  /** The resolver's local intensity at each tile it reported, per hazard (`resolveChallenge`'s probe). */
  samples: Map<string, { cyclone?: number; flood?: number }>;
  /** The house rule's resilience: the local intensity at which a house is lost. */
  resilience: number;
  /** The strength each front set out with (intensity × share): the swollen sea and river. */
  frontStrength: { cyclone?: number; flood?: number };
  /** Coord keys of the houses standing when the storm came. */
  houses: ReadonlySet<string>;
}

const SEA = new Set(["coast"]);
const CHANNEL = new Set(["river", "estuary"]);

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** Rise, hold, drain: 0 → 1 → 1 → 0. Exactly 1 through the hold, so the peak drawn is the peak resolved. */
export function waterEnvelope(tau: number, rise: number, hold: number, drain: number): number {
  if (tau <= 0) return 0;
  if (tau < rise) return smooth(tau / rise);
  if (tau <= rise + hold) return 1;
  if (tau < rise + hold + drain) return 1 - smooth((tau - rise - hold) / drain);
  return 0;
}

/** Hex rings outward from `sources`, through tiles `through` allows. */
function hexRings(keys: ReadonlySet<string>, sources: string[], through: (key: string) => boolean): Map<string, number> {
  const distance = new Map<string, number>();
  const queue: string[] = [];
  for (const key of sources) {
    distance.set(key, 0);
    queue.push(key);
  }
  for (let i = 0; i < queue.length; i++) {
    const [q, r] = queue[i].split(",").map(Number);
    for (let dir = 0; dir < 6; dir++) {
      const next = axialKey(neighbor({ q, r }, dir));
      if (distance.has(next) || !keys.has(next) || !through(next)) continue;
      distance.set(next, distance.get(queue[i])! + 1);
      queue.push(next);
    }
  }
  return distance;
}

/** The share of the surge that backs up a channel tile: (riverIndex / mouthIndex)^1.6, so it is strongest at the mouth. */
export function backwaterShare(riverIndex: number, mouthIndex: number): number {
  if (mouthIndex <= 0) return 1;
  return Math.pow(Math.min(1, Math.max(0, riverIndex / mouthIndex)), STORM_TIMING.compound.backwaterExponent);
}

export function buildDepthField(input: DepthFieldInput): DepthField {
  const { kind } = input;
  const terrain = new Map(input.tiles.map((t) => [t.key, t.terrainId]));
  const keys = new Set(terrain.keys());
  const hasSurge = kind !== "flood";
  const hasFlood = kind !== "cyclone";
  const c = STORM_TIMING.cyclone;
  const f = STORM_TIMING.flood;
  const landfall = kind === "cyclone" ? c.landfall : kind === "compound" ? STORM_TIMING.compound.landfall : null;

  // The channel, measured from the sea: the mouth is index `mouthIndex`, the
  // farthest point upstream is 0.
  const mouth = [...keys].filter((key) => {
    if (!CHANNEL.has(terrain.get(key)!)) return false;
    const [q, r] = key.split(",").map(Number);
    for (let dir = 0; dir < 6; dir++) if (SEA.has(terrain.get(axialKey(neighbor({ q, r }, dir))) ?? "")) return true;
    return false;
  });
  const fromMouth = hexRings(keys, mouth, (key) => CHANNEL.has(terrain.get(key)!));
  let mouthIndex = 0;
  for (const d of fromMouth.values()) mouthIndex = Math.max(mouthIndex, d);
  const perRiverIndex = mouthIndex > 0 ? Math.min(f.perRiverIndex, f.maxTravel / mouthIndex) : f.perRiverIndex;
  const riverIndexOf = (key: string): number | null => {
    if (!CHANNEL.has(terrain.get(key)!)) return null;
    // A pocket of channel not joined to the sea counts as upstream.
    return mouthIndex - (fromMouth.get(key) ?? mouthIndex);
  };

  // Surge timing: inland from the sea, one ring at a time.
  const seaKeys = [...keys].filter((key) => SEA.has(terrain.get(key)!));
  const fromSea = hexRings(keys, seaKeys, () => true);
  let deepestInland = 0;
  for (const [key, sample] of input.samples) if (sample.cyclone !== undefined) deepestInland = Math.max(deepestInland, (fromSea.get(key) ?? 1) - 1);
  const perHex = deepestInland > 0 ? Math.min(c.perHex, c.maxInland / deepestInland) : c.perHex;
  // Flood timing: the swell passes each channel tile, then spreads out over the banks.
  const channelArrival = new Map<string, number>();
  for (const key of keys) {
    const index = riverIndexOf(key);
    if (index !== null) channelArrival.set(key, f.rainLead + index * perRiverIndex);
  }
  const bankArrival = new Map<string, number>(channelArrival);
  const fromChannel = hexRings(keys, [...channelArrival.keys()], (key) => !SEA.has(terrain.get(key)!));
  let widestBank = 0;
  for (const [key, sample] of input.samples) if (sample.flood !== undefined) widestBank = Math.max(widestBank, fromChannel.get(key) ?? 0);
  const perBankHex = widestBank > 0 ? Math.min(f.perBankHex, f.maxBank / widestBank) : f.perBankHex;
  {
    // Rings outward from the channel, each tile taking the earliest neighbour's time.
    let frontier = [...channelArrival.keys()];
    const seen = new Set(frontier);
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const key of frontier) {
        const [q, r] = key.split(",").map(Number);
        const t = bankArrival.get(key)! + (CHANNEL.has(terrain.get(key)!) ? f.bankLead : perBankHex);
        for (let dir = 0; dir < 6; dir++) {
          const n = axialKey(neighbor({ q, r }, dir));
          if (!keys.has(n) || SEA.has(terrain.get(n)!)) continue;
          if (!seen.has(n)) {
            seen.add(n);
            next.push(n);
            bankArrival.set(n, t);
          } else if (!channelArrival.has(n) && t < bankArrival.get(n)!) {
            bankArrival.set(n, t);
          }
        }
      }
      frontier = next;
    }
  }

  const toDepth = (intensity: number | undefined): number => (intensity === undefined || input.resilience <= 0 ? 0 : Math.max(0, intensity) / input.resilience);
  const seaSurge = toDepth(input.frontStrength.cyclone);
  const riverFlood = toDepth(input.frontStrength.flood);

  const tiles = new Map<string, DepthTile>();
  let duration = 0;
  for (const key of keys) {
    const terrainId = terrain.get(key)!;
    const sample = input.samples.get(key);
    const isSea = SEA.has(terrainId);
    const riverIndex = riverIndexOf(key);
    let surgePeak = 0;
    let surgeArrival = Infinity;
    if (hasSurge && landfall !== null) {
      const d = fromSea.get(key) ?? Infinity;
      if (isSea) {
        // The sea itself swells toward the shore: full surge on the coast, easing offshore.
        surgePeak = seaSurge;
        surgeArrival = landfall - 1.5;
      } else if (sample?.cyclone !== undefined) {
        surgePeak = toDepth(sample.cyclone);
        surgeArrival = landfall + c.surgeLead + Math.max(0, d - 1) * perHex;
      } else if (riverIndex !== null && d <= 1) {
        // Channel tiles at the shore take the surge too.
        surgePeak = seaSurge;
        surgeArrival = landfall + c.surgeLead;
      }
    }
    let floodPeak = 0;
    let floodArrival = Infinity;
    if (hasFlood) {
      if (riverIndex !== null && terrainId === "river") {
        floodPeak = Math.max(riverFlood, toDepth(sample?.flood));
        floodArrival = channelArrival.get(key)!;
      } else if (sample?.flood !== undefined) {
        floodPeak = toDepth(sample.flood);
        floodArrival = bankArrival.get(key) ?? f.rainLead;
      }
    }
    let backwaterPeak = 0;
    let backwaterArrival = Infinity;
    if (kind === "compound" && riverIndex !== null && terrainId === "river" && landfall !== null) {
      backwaterPeak = seaSurge * backwaterShare(riverIndex, mouthIndex);
      backwaterArrival = landfall + c.surgeLead + (mouthIndex - riverIndex) * STORM_TIMING.compound.backwaterPerIndex;
    }
    const tile: DepthTile = { key, terrainId, surgePeak, floodPeak, surgeArrival, floodArrival, riverIndex, backwaterPeak, backwaterArrival, house: input.houses.has(key) };
    tiles.set(key, tile);
    if (surgePeak > 0) duration = Math.max(duration, surgeArrival + c.rise + c.hold + c.drain);
    if (floodPeak > 0) duration = Math.max(duration, floodArrival + f.rise + f.hold + f.drain);
    if (backwaterPeak > 0) duration = Math.max(duration, backwaterArrival + c.rise + c.hold + c.drain);
  }
  if (landfall !== null) duration = Math.max(duration, landfall + c.rise + c.hold + c.drain + 2);
  return { kind, tiles, mouthIndex, perRiverIndex, landfall, duration: duration + 1 };
}

/** The surge's water on a tile at storm time `t`, damage units. On the sea it dips before landfall (the draw-back). */
export function surgeDepth(field: DepthField, key: string, t: number): number {
  const tile = field.tiles.get(key);
  if (!tile || tile.surgePeak <= 0) return 0;
  const c = STORM_TIMING.cyclone;
  let depth = tile.surgePeak * waterEnvelope(t - tile.surgeArrival, c.rise, c.hold, c.drain);
  if (field.landfall !== null && SEA.has(tile.terrainId)) {
    const [from, to] = c.drawBack;
    const start = field.landfall - from;
    const end = field.landfall - to;
    if (t > start && t < end + 1.5) {
      // Out over three seconds, then back in with the surge.
      const out = smooth((t - start) / (end - start - 1)) * (1 - smooth((t - end) / 1.5));
      depth -= c.drawBackDepth * out;
    }
  }
  return depth;
}

/** The flood's water on a tile at storm time `t`, damage units, including (in a compound storm) the surge backing up the river. */
export function floodDepth(field: DepthField, key: string, t: number): number {
  const tile = field.tiles.get(key);
  if (!tile) return 0;
  const f = STORM_TIMING.flood;
  const c = STORM_TIMING.cyclone;
  let depth = tile.floodPeak > 0 ? tile.floodPeak * waterEnvelope(t - tile.floodArrival, f.rise, f.hold, f.drain) : 0;
  if (tile.backwaterPeak > 0) depth += tile.backwaterPeak * waterEnvelope(t - tile.backwaterArrival, c.rise, c.hold, c.drain);
  return depth;
}

/** All the water on a tile at storm time `t`. A house is hit when this passes `DAMAGE_DEPTH`. */
export function combinedDepth(field: DepthField, key: string, t: number): number {
  return Math.max(0, surgeDepth(field, key, t)) + floodDepth(field, key, t);
}

/** The deepest the water gets on a tile over the whole storm. */
export function peakDepth(field: DepthField, key: string): number {
  const tile = field.tiles.get(key);
  if (!tile) return 0;
  const parts = [tile.surgePeak, tile.floodPeak, tile.backwaterPeak].filter((p) => p > 0);
  if (parts.length === 0) return 0;
  // One kind of water: its envelope holds at exactly 1, so the peak is the resolved peak.
  if (parts.length === 1) return parts[0];
  // Surge and river water overlapping (a compound storm's channel): sample the overlap.
  let best = 0;
  for (let t = 0; t <= field.duration; t += 0.05) best = Math.max(best, combinedDepth(field, key, t));
  return best;
}

/** Storm time the water on a house first passes `DAMAGE_DEPTH` (null: it never does, the house stands). */
export function hitTime(field: DepthField, key: string): number | null {
  const tile = field.tiles.get(key);
  if (!tile || peakDepth(field, key) <= DAMAGE_DEPTH) return null;
  const start = Math.min(tile.surgeArrival, tile.floodArrival, tile.backwaterArrival);
  for (let t = start; t <= field.duration; t += 0.02) if (combinedDepth(field, key, t) > DAMAGE_DEPTH) return t;
  return null;
}

/** Storm time the water first reaches a tile (any hazard), or null if it never does. */
export function arrivalTime(field: DepthField, key: string): number | null {
  const tile = field.tiles.get(key);
  if (!tile) return null;
  const times = [tile.surgeArrival, tile.floodArrival, tile.backwaterArrival].filter((t, i) => Number.isFinite(t) && [tile.surgePeak, tile.floodPeak, tile.backwaterPeak][i] > 0);
  return times.length > 0 ? Math.min(...times) : null;
}
