import { axialKey } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";

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

/** How much of the shortfall carries on to the next zone. */
export const ZONE_CARRY = 0.75;
/**
 * Converts an element's authored severity thresholds (written for the old
 * whole-map resolver, where 1.0 was a typical storm) to this model's
 * strength scale (where a challenge is 1–4).
 */
export const THRESHOLD_SCALE = 2.2;

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
  stars: 1 | 2 | 3;
  housesSaved: number;
  housesDamaged: number;
  /** Coord keys of every house damaged. */
  damagedHouses: string[];
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

  name(zoneId: string): string {
    return this.zones.find((zone) => zone.id === zoneId)?.name ?? zoneId;
  }
}

/** Extra defence per tile from perfect-fit combos (P6). Keyed by coord key. */
export type ComboBonus = Map<string, number>;

/**
 * One element's contribution to its zone's defence against `hazard`, right
 * now: its `resilience` effect, scaled by maturity and by any wear. A
 * negative resilience (Sand Mining, a Resort) weakens the zone against every
 * hazard; a positive one counts only against the hazards the element answers.
 */
export function elementDefence(state: GameState, key: string, hazard: HazardId): number {
  const inst = state.elements.get(key);
  if (!inst) return 0;
  const def = ELEMENT_BY_ID.get(inst.elementId);
  if (!def) return 0;
  const value = def.effects.resilience ?? 0;
  if (value === 0) return 0;
  if (value > 0 && !def.targetsHazards?.includes(hazard)) return 0;
  const maturity = state.maturityFraction(inst, def);
  const wear = Math.max(0, 1 - inst.degradeAmount);
  return value * (value > 0 ? maturity * wear : 1);
}

export function zoneDefence(state: GameState, zones: ZoneIndex, zoneId: string, hazard: HazardId, combos?: ComboBonus): number {
  let total = 0;
  for (const key of zones.keys(zoneId)) {
    total += elementDefence(state, key, hazard);
    if (combos && state.elements.has(key)) {
      const inst = state.elements.get(key)!;
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (def?.targetsHazards?.includes(hazard)) total += combos.get(key) ?? 0;
    }
  }
  return Math.max(0, total);
}

function housesIn(state: GameState, zones: ZoneIndex, zoneId: string): string[] {
  return zones.keys(zoneId).filter((key) => {
    const inst = state.elements.get(key);
    return inst && ELEMENT_BY_ID.get(inst.elementId)?.kind === "building" && inst.degradeAmount < 1;
  });
}

/** Stars from protection. A city that stands always earns at least one. */
export function starsFor(protection: number): 1 | 2 | 3 {
  if (protection >= 0.85) return 3;
  if (protection >= 0.5) return 2;
  return 1;
}

/**
 * Resolves a challenge of `kind` at `intensity` against the board, zone by
 * zone. MUTATES `state` (failed structures removed, nature defences worn,
 * houses damaged), so a preview must pass a clone.
 */
export function resolveChallenge(
  state: GameState,
  zones: ZoneIndex,
  kind: ChallengeKind,
  intensity: number,
  strengthUnit: number,
  combos?: ComboBonus
): ChallengeOutcome {
  const outcomes: ZoneOutcome[] = [];
  // Defence is a budget per zone and hazard: a front that spends it leaves
  // less for the next front through the same zone.
  const spent = new Map<string, number>();
  let leakTotal = 0;
  let undefendedTotal = 0;
  const damagedHouses: string[] = [];
  const housesSeen = new Set<string>();

  for (const front of FRONTS[kind]) {
    let carry = intensity * front.share;
    let undefendedCarry = carry;
    const frontSeverity = carry / strengthUnit;
    for (const zoneId of front.path) {
      if (carry <= 0.01) {
        // Stopped before it got here: every house in this zone was saved by
        // the defences ahead of it.
        for (const key of housesIn(state, zones, zoneId)) housesSeen.add(key);
        undefendedTotal += undefendedCarry;
        undefendedCarry *= ZONE_CARRY;
        continue;
      }
      const budgetKey = `${zoneId}:${front.hazard}`;
      const severity = carry / strengthUnit;
      const failed: string[] = [];
      const overwhelmed: string[] = [];
      let dumped = 0;
      // Engineered structures over their limit fail before they can help,
      // and release what they were holding. Nature defences over their limit
      // still help, at their overwhelmed rate, and are worn by it.
      for (const key of zones.keys(zoneId)) {
        const inst = state.elements.get(key);
        if (!inst) continue;
        const def = ELEMENT_BY_ID.get(inst.elementId);
        if (!def?.targetsHazards?.includes(front.hazard)) continue;
        // A reservoir (anything with a flood buffer) carries the whole
        // catchment's rain, not just what got past the zones upstream of it,
        // so it is tested against the front's full strength. A wall faces
        // only the water that reaches it.
        const load = def.floodBufferCapacityM3 !== undefined ? frontSeverity : severity;
        if (def.category === "engineered" && def.failureThreshold !== undefined && load > def.failureThreshold * THRESHOLD_SCALE) {
          dumped += elementDefence(state, key, front.hazard) * (def.failureRedirectMultiplier ?? 1);
          state.elements.delete(key);
          failed.push(key);
        } else if (def.overwhelmSeverity !== undefined && severity > def.overwhelmSeverity * THRESHOLD_SCALE) {
          overwhelmed.push(key);
        }
      }
      let defence = zoneDefence(state, zones, zoneId, front.hazard, combos) - (spent.get(budgetKey) ?? 0);
      for (const key of overwhelmed) {
        const inst = state.elements.get(key)!;
        const def = ELEMENT_BY_ID.get(inst.elementId)!;
        defence -= elementDefence(state, key, front.hazard) * (1 - (def.overwhelmedAbsorptionMultiplier ?? 0.5));
        inst.degradeAmount = Math.min(0.9, inst.degradeAmount + (def.gracefulDegradeStep ?? 0.15));
      }
      defence = Math.max(0, defence);
      carry += dumped;
      const absorbed = Math.min(carry, defence);
      spent.set(budgetKey, (spent.get(budgetKey) ?? 0) + absorbed);
      const leak = carry - absorbed;
      const houses = housesIn(state, zones, zoneId).filter((key) => !housesSeen.has(key));
      const damageShare = carry > 0 ? Math.min(1, leak / Math.max(carry, strengthUnit)) : 0;
      const hit = Math.round(houses.length * damageShare);
      // Deterministic: the houses nearest the front of the list take it. The
      // list is in map order, which is stable for a given board.
      for (const key of houses.slice(0, hit)) {
        state.elements.get(key)!.degradeAmount = 1;
        damagedHouses.push(key);
      }
      for (const key of houses) housesSeen.add(key);
      outcomes.push({
        zoneId,
        hazard: front.hazard,
        incoming: carry,
        defence,
        absorbed,
        leak,
        held: leak <= carry * 0.05,
        housesInZone: houses.length,
        housesDamaged: hit,
        failed,
        overwhelmed
      });
      leakTotal += leak;
      undefendedTotal += undefendedCarry;
      undefendedCarry *= ZONE_CARRY;
      carry = leak * ZONE_CARRY;
    }
  }

  const protection = undefendedTotal > 0 ? Math.max(0, 1 - leakTotal / undefendedTotal) : 1;
  return {
    intensity,
    zones: outcomes,
    protection,
    stars: starsFor(protection),
    housesSaved: housesSeen.size - damagedHouses.length,
    housesDamaged: damagedHouses.length,
    damagedHouses
  };
}
