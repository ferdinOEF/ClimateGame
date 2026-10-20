import { axialKey, neighbor } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import { computeWater, damageAt, defenceMetres, floodsHouse, HAZARD_MODEL, LANDFALL_ZONE, siteAt, waterBoard } from "./hazardModel";

/**
 * Zones and zone-local challenge resolution for Panjim 2050.
 *
 * A challenge does not hit "the city". It comes in through named places in
 * order: a cyclone makes landfall on the Miramar–Dona Paula beach (Z1), then
 * runs inland over the Taleigao plain (Z2); the monsoon flood rises in the
 * Taleigao, St Cruz and Merces wetlands (Z2), drains down the Ourem creek
 * past Fontainhas (Z3) and ends on the Mandovi waterfront (Z4); the compound
 * storm does both at once and meets itself in Z4.
 *
 * At each zone the hazard meets that zone's defence: the summed `resilience`
 * effect of everything standing in it that answers this hazard, weighted by
 * how mature it is. If the defence holds, the hazard stops there. If not, the
 * shortfall hits the zone (houses are damaged in proportion) and continues to
 * the next zone, weakened. That is the whole rule. Placement matters because
 * a mangrove only defends the zone it stands in, and the order matters
 * because a strong first zone protects everything behind it.
 *
 * Nothing here knows what a Dune is. Defence comes from the generic
 * `effects.resilience` map in elements.json and `targetsHazards`; failure
 * from each element's own `failureThreshold` / `overwhelmSeverity` fields.
 */
export interface ZoneDef {
  id: string;
  name: string;
  /** Axial [q, r] pairs, from the map file. */
  tiles: [number, number][];
}

export type HazardId = "cyclone" | "flood";

/** One front of a challenge: which hazard, which zones in order, and what share of the challenge's intensity it carries. */
export interface Front {
  hazard: HazardId;
  path: string[];
  share: number;
}

/** The fronts each challenge kind sends. Data, so tuning never touches the resolver. */
export const FRONTS: Record<ChallengeKind, Front[]> = {
  cyclone: [{ hazard: "cyclone", path: ["z1", "z2"], share: 1 }],
  flood: [{ hazard: "flood", path: ["z2", "z3", "z4"], share: 1 }],
  // The surge comes up the Mandovi into Z4 first; the rain runs down from
  // the wetlands and arrives at Z4 second, against whatever defence the
  // surge left there.
  compound: [
    { hazard: "cyclone", path: ["z4"], share: 0.6 },
    { hazard: "flood", path: ["z2", "z3", "z4"], share: 0.75 }
  ]
};

export interface ZoneOutcome {
  zoneId: string;
  hazard: HazardId;
  incoming: number;
  defence: number;
  absorbed: number;
  leak: number;
  held: boolean;
  housesInZone: number;
  housesDamaged: number;
  /** Engineered structures that failed here (coord keys). */
  failed: string[];
  /** Nature defences overwhelmed here (coord keys). They survive, weakened. */
  overwhelmed: string[];
}

export interface ChallengeOutcome {
  intensity: number;
  zones: ZoneOutcome[];
  /** 0–1: how much of the damage an undefended city would have taken was prevented. */
  protection: number;
  /** 0 only where the level sets a one-star line (houseStars.one) and the storm saved less than it. */
  stars: 0 | 1 | 2 | 3;
  housesSaved: number;
  /** Section 22.4 (owner decision): the homes in the storm's path still standing when it hit (homes an earlier storm ruined are not counted against it). */
  housesTotal: number;
  /** Homes in the storm's path an earlier storm had already ruined ("Lost in earlier storms"). */
  housesLostBefore: number;
  housesDamaged: number;
  /** Coord keys of every house damaged. */
  damagedHouses: string[];
  /**
   * Section 25.2 (owner decision): the board's biodiversity (`GameState.biodiversity`) as the storm came, less the
   * start of the run's (`houseStars.bioStart`). Present where the level's stars count biodiversity.
   */
  biodiversityChange?: number;
}

/**
 * The level's star lines (Section 22.4 and 25.2, owner decisions; game rules). By the share of the homes standing in
 * the storm's path that it saved: one star from `one`; two from `two` with biodiversity at or above the start of
 * the run (`bioTwo`, a change of 0); three from `three` with biodiversity raised by at least `bioThree`. Without
 * `bioTwo`/`bioThree` the biodiversity is not asked.
 */
export interface HouseStars {
  three: number;
  two: number;
  one?: number;
  bioTwo?: number;
  bioThree?: number;
  /** The board's biodiversity at the start of the run (set by the run, not the level data). */
  bioStart?: number;
}

export class ZoneIndex {
  readonly zones: ZoneDef[];
  private readonly zoneByKey = new Map<string, string>();
  private readonly keysByZone = new Map<string, string[]>();

  constructor(zones: readonly ZoneDef[]) {
    this.zones = [...zones];
    for (const zone of zones) {
      const keys = zone.tiles.map(([q, r]) => axialKey({ q, r }));
      this.keysByZone.set(zone.id, keys);
      for (const key of keys) this.zoneByKey.set(key, zone.id);
    }
  }

  zoneOf(key: string): string | null {
    return this.zoneByKey.get(key) ?? null;
  }

  keys(zoneId: string): string[] {
    return this.keysByZone.get(zoneId) ?? [];
  }

  private readonly exposureCache = new Map<HazardId, Map<string, number>>();

  /**
   * Hex distance from each tile to the water a hazard comes from: the sea for
   * a cyclone, the river and estuary for a flood. Terrain never changes in
   * play, so it is worked out once per hazard.
   */
  exposure(state: GameState, hazard: HazardId): Map<string, number> {
    const cached = this.exposureCache.get(hazard);
    if (cached) return cached;
    const sources = hazard === "cyclone" ? ["coast"] : ["river", "estuary"];
    const distance = new Map<string, number>();
    const queue: string[] = [];
    for (const tile of state.placed.values()) {
      if (!sources.includes(tile.terrainId)) continue;
      const key = axialKey(tile.coord);
      distance.set(key, 0);
      queue.push(key);
    }
    for (let i = 0; i < queue.length; i++) {
      const [q, r] = queue[i].split(",").map(Number);
      for (let dir = 0; dir < 6; dir++) {
        const next = axialKey(neighbor({ q, r }, dir));
        if (distance.has(next) || !state.placed.has(next)) continue;
        distance.set(next, distance.get(queue[i])! + 1);
        queue.push(next);
      }
    }
    this.exposureCache.set(hazard, distance);
    return distance;
  }

  name(zoneId: string): string {
    return this.zones.find((zone) => zone.id === zoneId)?.name ?? zoneId;
  }
}

/**
 * The scale probes report in: `resilience` is one house-loss depth
 * (core/hazardModel.ts `houseLossDepthM`), so a probe value of `resilience`
 * at a house means the water there is just deep enough to take it.
 */
export interface HouseRule {
  resilience: number;
}

/**
 * Called by `resolveChallenge` once for every wet tile, with the water there
 * (the deeper of surge and river, scaled by the house rule) and which kind it is.
 */
/**
 * Reports a tile's water (`intensity`, the deeper of surge and river, scaled so
 * `resilience` is the depth that takes a house) and its `damage`: the water
 * and the cyclone's wind together, in the same units (what decides a house).
 * Tiles reached by the wind alone report 0 water.
 */
export type TileProbe = (key: string, intensity: number, hazard: HazardId, damage: number) => void;

/** Extra defence per tile from perfect-fit combos (P6). Keyed by coord key. */
export type ComboBonus = Map<string, number>;

/** Stars from the share of houses in the storm's path that were saved. A city that stands always earns at least one. */
export function starsForHouses(saved: number, total: number, thresholds: HouseStars, biodiversityChange = 0): 0 | 1 | 2 | 3 {
  const share = total > 0 ? saved / total : 1;
  const bioOk = (line: number | undefined): boolean => line === undefined || biodiversityChange >= line;
  if (share >= thresholds.three && bioOk(thresholds.bioThree) && bioOk(thresholds.bioTwo)) return 3;
  if (share >= thresholds.two && bioOk(thresholds.bioTwo)) return 2;
  // Section 22.4 (owner decision): below the level's one-star line, no star (a level without one never gives 0).
  if (thresholds.one !== undefined && share < thresholds.one) return 0;
  return 1;
}

export function starsFor(protection: number): 1 | 2 | 3 {
  if (protection >= 0.85) return 3;
  if (protection >= 0.5) return 2;
  return 1;
}

/** The zone id the resolver reports for houses outside every named zone. */
export const CITY_ZONE = "city";

/**
 * Resolves a challenge of `kind` at `intensity` against the board, tile by
 * tile, through the hazard model (core/hazardModel.ts): the water's depth on
 * each tile decides which houses are lost. MUTATES `state` (failed structures
 * removed, overwhelmed nature defences worn, houses lost), so a preview must
 * pass a clone.
 *
 * The houses "in the storm's path" (the KPI's total) are those the same storm
 * would flood on the same board with no defences at all: the houses the
 * player could have saved. Zones are kept for reporting (the staging and the
 * Aftermath walk them in order); houses outside every zone report as
 * `CITY_ZONE`.
 */
export function resolveChallenge(
  state: GameState,
  zones: ZoneIndex,
  kind: ChallengeKind,
  intensity: number,
  strengthUnit: number,
  combos?: ComboBonus,
  /** When set, stars come from the share of houses saved rather than from protection (the Houses-saved KPI). */
  houseStars?: HouseStars,
  /** Sets the scale the probe reports in (its `resilience` is one house-loss depth). */
  houseRule?: HouseRule,
  /** Reports the water at every wet tile, per hazard, scaled so `resilience` is the depth that takes a house. Never changes the outcome. */
  probe?: TileProbe,
  /** Where a cyclone comes ashore (index into the board's landfall sites). Defaults to the middle of the coast. */
  landfall?: number | null,
  /** Tiles the storm never reaches (Section 23.1, `shelterOf`). */
  sheltered?: ReadonlySet<string>
): ChallengeOutcome {
  const strength = intensity / strengthUnit;
  const landfallZoneTiles = zones.keys(LANDFALL_ZONE);
  const board = waterBoard(state, landfallZoneTiles.length > 0 ? landfallZoneTiles : undefined);
  const site = kind === "flood" ? null : (landfall ?? siteAt(board, 0.5));
  const storm = { kind, strength, landfall: site, sheltered };
  const options = { combos, landfallZoneTiles: landfallZoneTiles.length > 0 ? landfallZoneTiles : undefined };

  // A house on scenery (the north bank, the east edge) is drawn, never counted.
  const isHouse = (key: string): boolean => {
    const inst = state.elements.get(key);
    return !!inst && !state.isScenery(key) && ELEMENT_BY_ID.get(inst.elementId)?.kind === "building";
  };
  // What the storm would do with no defences at all: the path, and the yardstick for protection.
  const bare = state.clone();
  for (const [key, inst] of [...bare.elements]) {
    const def = ELEMENT_BY_ID.get(inst.elementId);
    if (def && (def.effects.resilience ?? 0) > 0) bare.elements.delete(key);
  }
  const field = computeWater(state, storm, options);
  // A board with no defences is its own undefended comparison: one water pass, not two.
  const undefended = bare.elements.size === state.elements.size ? field : computeWater(bare, storm, options);

  const scale = houseRule?.resilience ?? strengthUnit;
  if (probe) {
    const unit = scale / HAZARD_MODEL.houseLossDepthM;
    // Each tile's water is the deeper of the surge and the river (they do not add), reported as that kind.
    for (const key of new Set([...field.depth.keys(), ...field.wind.keys()])) {
      const d = field.depth.get(key) ?? 0;
      probe(key, d * unit, (field.surge.get(key) ?? 0) >= (field.flood.get(key) ?? 0) ? "cyclone" : "flood", damageAt(field, key) * unit);
    }
  }

  const pathHouses = new Set<string>();
  // Water and the cyclone's wind together decide a house (Section 12).
  for (const key of new Set([...undefended.depth.keys(), ...undefended.wind.keys()])) if (isHouse(key) && floodsHouse(damageAt(undefended, key))) pathHouses.add(key);
  const standing = [...pathHouses].filter((key) => state.elements.get(key)!.degradeAmount < 1);
  const lost = standing.filter((key) => floodsHouse(damageAt(field, key)));
  const undefendedLost = standing.length;

  // Section 25.2: the biodiversity as the storm comes, against the start of the run.
  const counted = houseStars && (houseStars.bioTwo !== undefined || houseStars.bioThree !== undefined);
  const biodiversityChange = counted ? state.biodiversity - (houseStars.bioStart ?? 0) : undefined;

  // Apply: engineered failures broken (Section 25.1: drawn broken, protecting nothing, the tile free for a new
  // build), the ones with a storm count that came through counted, nature defences worn, houses lost.
  for (const key of field.failed) {
    const inst = state.elements.get(key);
    if (inst) inst.broken = true;
  }
  for (const key of field.survived ?? []) {
    const inst = state.elements.get(key);
    if (inst) inst.stormsSurvived = (inst.stormsSurvived ?? 0) + 1;
  }
  for (const key of field.overwhelmed) {
    const inst = state.elements.get(key);
    const def = inst ? ELEMENT_BY_ID.get(inst.elementId) : undefined;
    if (inst && def) inst.degradeAmount = Math.min(0.9, inst.degradeAmount + (def.gracefulDegradeStep ?? 0.15));
  }
  for (const key of lost) state.elements.get(key)!.degradeAmount = 1;

  // Per zone, for the staging and the Aftermath, in the order the storm meets them.
  const zoneOf = (key: string): string => zones.zoneOf(key) ?? CITY_ZONE;
  const order = [...new Set([...FRONTS[kind].flatMap((front) => front.path), ...zones.zones.map((z) => z.id), CITY_ZONE])];
  const lostSet = new Set(lost);
  const failedSet = new Set(field.failed);
  const overSet = new Set(field.overwhelmed);
  const outcomes: ZoneOutcome[] = [];
  for (const zoneId of order) {
    // Never scenery (the north bank, the east edge): its water is drawn, not reported.
    const keys = (zoneId === CITY_ZONE ? [...undefended.depth.keys()].filter((key) => !zones.zoneOf(key)) : zones.keys(zoneId)).filter((key) => !state.isScenery(key));
    const inZone = standing.filter((key) => zoneOf(key) === zoneId);
    const zoneFailed = field.failed.filter((key) => zoneOf(key) === zoneId);
    const zoneOver = field.overwhelmed.filter((key) => zoneOf(key) === zoneId);
    if (inZone.length === 0 && zoneFailed.length === 0 && zoneOver.length === 0) continue;
    let incoming = 0;
    let leak = 0;
    let surgeShare = 0;
    let floodShare = 0;
    for (const key of keys) {
      incoming = Math.max(incoming, undefended.depth.get(key) ?? 0);
      leak = Math.max(leak, field.depth.get(key) ?? 0);
      surgeShare = Math.max(surgeShare, field.surge.get(key) ?? 0);
      floodShare = Math.max(floodShare, field.flood.get(key) ?? 0);
    }
    let defence = 0;
    for (const key of keys) if (!failedSet.has(key)) defence += Math.max(0, defenceMetres(state, key, surgeShare >= floodShare ? "cyclone" : "flood"));
    const toUnits = scale / HAZARD_MODEL.houseLossDepthM;
    const hit = inZone.filter((key) => lostSet.has(key)).length;
    outcomes.push({
      zoneId,
      hazard: surgeShare >= floodShare ? "cyclone" : "flood",
      incoming: incoming * toUnits,
      defence: defence * toUnits,
      absorbed: Math.max(0, incoming - leak) * toUnits,
      leak: leak * toUnits,
      held: hit === 0,
      housesInZone: inZone.length,
      housesDamaged: hit,
      failed: zoneFailed,
      overwhelmed: zoneOver.filter((key) => !failedSet.has(key) && overSet.has(key))
    });
  }

  const protection = undefendedLost > 0 ? Math.max(0, 1 - lost.length / undefendedLost) : 1;
  return {
    intensity,
    zones: outcomes,
    protection,
    // Section 22.4 (owner decision): a storm is counted against the homes still standing when it hit; the ones an
    // earlier storm ruined are a line of their own, never "not saved" by this one.
    stars: houseStars && standing.length > 0 ? starsForHouses(standing.length - lost.length, standing.length, houseStars, biodiversityChange ?? 0) : starsFor(protection),
    housesSaved: standing.length - lost.length,
    housesTotal: standing.length,
    housesLostBefore: pathHouses.size - standing.length,
    housesDamaged: lost.length,
    damagedHouses: lost,
    ...(biodiversityChange === undefined ? {} : { biodiversityChange })
  };
}
