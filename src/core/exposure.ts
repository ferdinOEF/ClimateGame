import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import { resolveChallenge, type ChallengeOutcome, type ComboBonus, type HazardId, type HouseRule, type ZoneIndex } from "./zones";

/**
 * Exposure: what a storm will do to each tile, read from the resolver itself.
 *
 * The warning heat (the red tint that builds over the last five quarters
 * before a storm) is only worth showing if it is true. So nothing here
 * approximates the storm. `computeExposure` runs the real zone-local resolver
 * (`resolveChallenge`) on a throwaway copy of the board, and asks it, through
 * its tile probe, how hard the storm hits each tile: the zone's leak, faded by
 * distance from the water, by the same `localIntensity` formula that decides
 * which houses fall. A tile previewed at zero takes nothing; the houses the
 * preview calls at risk are the houses the resolver loses.
 *
 * Defences therefore change the heat exactly as much as they change the
 * outcome. A mangrove that raises its zone's defence lowers the leak, and so
 * the heat, on every tile of that zone behind it; it does nothing for a zone
 * the storm never reaches through it. That is a per-zone effect, not a
 * per-tile glow, and the heat does not pretend otherwise. (The brief asked
 * for defences to cool their own tile and, more weakly, their neighbours. The
 * resolver has no such rule, so drawing one would be a promise the storm does
 * not keep. The green shields mark what a defence protected instead: see
 * `protectedTiles`.)
 *
 * Pure, like the rest of core/: no DOM, no renderer.
 */
export interface Exposure {
  kind: ChallengeKind;
  /** Local intensity at every tile on the storm's path, in zone-defence points. 0 where defences stopped it. */
  intensity: Map<string, number>;
  /**
   * 0–1 per tile: (intensity / a house's resilience)², capped at 1. A house at
   * 1 is lost; anything below 1 stands. Squared so that a tile under strain
   * but still standing reads clearly lighter than one that will fall: at half
   * the breaking point it shows a quarter of the heat.
   */
  exposure: Map<string, number>;
  /** Houses this storm takes as the board stands: exactly the resolver's `damagedHouses`. */
  housesAtRisk: string[];
  /** The resolver's full outcome on the copy, for anything else that wants to read it. */
  outcome: ChallengeOutcome;
}

export interface ExposureOptions {
  combos?: ComboBonus;
  houseRule?: HouseRule;
  houseStars?: { three: number; two: number };
  /** Resolve as if every defence against this storm were gone: the "before you built anything" picture the shields compare to. */
  withoutDefences?: boolean;
}

/** The hazards a challenge kind brings. */
export function hazardsOf(kind: ChallengeKind): HazardId[] {
  return kind === "compound" ? ["cyclone", "flood"] : [kind];
}

/**
 * Runs the storm on a copy of `state` and reads its exposure tile by tile.
 * `state` itself is never changed. `strengthUnit` is the level's
 * intensity-per-strength (the resolver's severity unit).
 */
export function computeExposure(
  state: GameState,
  zones: ZoneIndex,
  kind: ChallengeKind,
  intensity: number,
  strengthUnit: number,
  options: ExposureOptions = {}
): Exposure {
  const copy = state.clone();
  if (options.withoutDefences) {
    const hazards = hazardsOf(kind);
    for (const [key, inst] of [...copy.elements]) {
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (def && (def.effects.resilience ?? 0) > 0 && def.targetsHazards?.some((hazard) => hazards.includes(hazard as HazardId))) copy.elements.delete(key);
    }
  }
  const tileIntensity = new Map<string, number>();
  const outcome = resolveChallenge(
    copy,
    zones,
    kind,
    intensity,
    strengthUnit,
    options.combos,
    options.houseStars,
    options.houseRule,
    (key, value) => tileIntensity.set(key, Math.max(tileIntensity.get(key) ?? 0, value))
  );
  // Without a house rule (other levels), a zone loses a share of its houses
  // and there is no per-house threshold; the scale is one challenge unit.
  const scale = options.houseRule?.resilience ?? strengthUnit;
  const exposure = new Map<string, number>();
  for (const [key, value] of tileIntensity) exposure.set(key, Math.min(1, (value / scale) ** 2));
  return { kind, intensity: tileIntensity, exposure, housesAtRisk: [...outcome.damagedHouses], outcome };
}

/** Quarters of warning: the heat starts this many quarters before a storm lands. */
export const HEAT_LEAD_QUARTERS = 5;
/** Heat opacity five quarters out and on the last quarter. Capped so terrain and the street map stay readable underneath. */
export const HEAT_MIN = 0.05;
export const HEAT_MAX = 0.5;

/**
 * The heat ramp: how red the most exposed tile is, by quarters left before
 * the storm. Linear from 5% at five quarters out to 50% on the last quarter
 * (5, 16.25, 27.5, 38.75, 50%), and nothing outside that window.
 */
export function heatRamp(quartersLeft: number): number {
  if (quartersLeft < 1 || quartersLeft > HEAT_LEAD_QUARTERS) return 0;
  return HEAT_MIN + ((HEAT_LEAD_QUARTERS - quartersLeft) / (HEAT_LEAD_QUARTERS - 1)) * (HEAT_MAX - HEAT_MIN);
}

/** Tiles above this heat get the diagonal hatch, the second cue that does not rely on colour. */
export const HATCH_THRESHOLD = 0.3;

/**
 * The heat a tile shows: the ramp times its exposure. Exposure below 5% is
 * shown as none, so a tile the storm barely brushes does not flicker pink.
 */
export function tileHeat(quartersLeft: number, exposure: number): number {
  return exposure < 0.05 ? 0 : heatRamp(quartersLeft) * exposure;
}

/**
 * Tiles whose exposure a defence cut: on the storm's path, noticeably cooler
 * than they would be with no defences at all. With the defence tiles
 * themselves, these get the green shield, so the player sees what they fixed
 * as well as what is still red.
 */
export function protectedTiles(current: Exposure, undefended: Exposure, minCut = 0.15): string[] {
  const keys: string[] = [];
  for (const [key, before] of undefended.exposure) {
    const now = current.exposure.get(key) ?? 0;
    if (before - now >= minCut) keys.push(key);
  }
  return keys;
}
