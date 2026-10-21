import { ELEMENT_BY_ID } from "./elements";
import type { WindOverride } from "./climate";
import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import { resolveChallenge, type ChallengeOutcome, type ComboBonus, type HazardId, type HouseRule, type ZoneIndex } from "./zones";
import type { HouseStars } from "./zones";

/**
 * Exposure: what a storm will do to each tile, read from the resolver itself.
 *
 * The warning heat (the red tint over the last two years before a storm)
 * is only worth showing if it is true. So nothing here approximates the
 * storm. `computeExposure` runs the real resolver
 * (`resolveChallenge`, which calls the one hazard model,
 * core/hazardModel.ts `computeWater`) on a throwaway copy of the board, and
 * asks it, through its tile probe, how deep the water stands on each tile.
 * A cyclone's landfall is fixed by the calendar, so the heat is exactly
 * what the storm would do to the board as it stands.
 *
 * Defences change the heat exactly as much as they change the outcome: each
 * protects the area round it and slows water passing through, so the heat
 * cools behind a defence on the water's way in, and nowhere the water does
 * not pass. The green shields mark what a defence protected (`protectedTiles`).
 *
 * Pure, like the rest of core/: no DOM, no renderer.
 */
export interface Exposure {
  kind: ChallengeKind;
  /** Water at every wet tile, in house-rule units (`resilience` is one house-loss depth); the worst over the landfall sites given. */
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
  houseStars?: HouseStars;
  /** Resolve as if every defence against this storm were gone: the "before you built anything" picture the shields compare to. */
  withoutDefences?: boolean;
  /**
   * A cyclone's landfall site, as a one-item list (the calendar fixes it).
   * With several sites the exposure is the worst over all of them and the
   * outcome the middle site's; one site is an exact preview.
   */
  landfallSites?: number[] | null;
  /** Tiles the storm never reaches (Section 23.1, `shelterOf`). */
  sheltered?: ReadonlySet<string>;
  /** Section 26.1: the turn the storm lands on, so defences are as old as they will be then. Defaults to the board's. */
  turn?: number;
  /** Section 26.3: the storm's own wind numbers. */
  wind?: WindOverride;
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
  if (options.turn !== undefined) copy.turn = options.turn;
  if (options.withoutDefences) {
    const hazards = hazardsOf(kind);
    for (const [key, inst] of [...copy.elements]) {
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (def && (def.effects.resilience ?? 0) > 0 && def.targetsHazards?.some((hazard) => hazards.includes(hazard as HazardId))) copy.elements.delete(key);
    }
  }
  const tileIntensity = new Map<string, number>();
  const sites = options.landfallSites && options.landfallSites.length > 0 ? options.landfallSites : [null];
  const middle = sites[Math.floor((sites.length - 1) / 2)];
  const atRisk = new Set<string>();
  let outcome: ChallengeOutcome | null = null;
  for (const site of sites) {
    // Each site on its own copy: the resolver changes the board it is given.
    const board = sites.length > 1 ? copy.clone() : copy;
    const result = resolveChallenge(
      board,
      zones,
      kind,
      intensity,
      strengthUnit,
      options.combos,
      options.houseStars,
      options.houseRule,
      // The heat never covers scenery (the north bank, the east edge): the storm still draws there, from the same probe.
      // The heat is the damage (water and wind together), so it marks every house the storm takes.
      (key, _water, _hazard, damage) => {
        if (!copy.isScenery(key)) tileIntensity.set(key, Math.max(tileIntensity.get(key) ?? 0, damage));
      },
      site,
      options.sheltered,
      options.wind
    );
    for (const key of result.damagedHouses) atRisk.add(key);
    if (site === middle) outcome = result;
  }
  // The resolver's scale: one house-loss depth is `resilience` (one challenge unit without a house rule).
  const scale = options.houseRule?.resilience ?? strengthUnit;
  const exposure = new Map<string, number>();
  for (const [key, value] of tileIntensity) exposure.set(key, Math.min(1, (value / scale) ** 2));
  return { kind, intensity: tileIntensity, exposure, housesAtRisk: [...atRisk], outcome: outcome! };
}

/** Years of warning: the heat shows in the last two years before a storm (turns 4-5, 14-15 and 24-25). */
export const HEAT_LEAD_YEARS = 2;
/**
 * Heat opacity two years out and in the storm's own year. Capped so terrain
 * and the street map stay readable underneath. Two years out is just over the
 * hatch threshold, so a tile that will flood is hatched from the first
 * warning year: the cue that does not rely on colour.
 */
export const HEAT_MIN = 0.35;
export const HEAT_MAX = 0.5;

/**
 * The heat ramp: how red the most exposed tile is, by years left before the
 * storm (1 in its own year): 35% two years out, 50% in its year, and nothing
 * outside that window.
 */
export function heatRamp(yearsLeft: number): number {
  if (yearsLeft < 1 || yearsLeft > HEAT_LEAD_YEARS) return 0;
  return HEAT_MIN + ((HEAT_LEAD_YEARS - yearsLeft) / (HEAT_LEAD_YEARS - 1)) * (HEAT_MAX - HEAT_MIN);
}

/**
 * The live risk view's ramp (Section 21.4): Show risk works at any year. In the
 * last two years before the storm it is the warning ramp; earlier, the first
 * warning year's level, so a home at risk in 2027 reads like one two years out.
 */
export function liveRamp(yearsLeft: number): number {
  return yearsLeft > HEAT_LEAD_YEARS ? HEAT_MIN : heatRamp(yearsLeft);
}

/** The least heat a home at risk shows, so every home the top bar counts is drawn. */
export const HOME_HEAT_FLOOR = 0.12;

/** Tiles above this heat get the diagonal hatch, the second cue that does not rely on colour. */
export const HATCH_THRESHOLD = 0.3;

/**
 * The heat a tile shows: the ramp times its exposure. Exposure below 5% is
 * shown as none, so a tile the storm barely brushes does not flicker pink.
 */
export function tileHeat(yearsLeft: number, exposure: number): number {
  return exposure < 0.05 ? 0 : heatRamp(yearsLeft) * exposure;
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

/** How many tiles get the pulsing edge at most: the hardest-hit, so the eye goes to the worst first. */
export const PULSE_LIMIT = 24;

export interface HeatViewTile {
  key: string;
  heat: number;
  hatch: boolean;
  pulse: boolean;
  shield: boolean;
}

/**
 * Everything the overlay draws for one storm, from its exposure:
 *   - heat on every home it would take on the board as it stands (Section
 *     21.4; the top bar's Homes at risk, one for one), at least
 *     `HOME_HEAT_FLOOR`, more where the water is deeper (`liveRamp`);
 *   - the hatch where the heat passes 30%;
 *   - a pulsing edge on the houses that will fall, hardest hit first, at
 *     most `PULSE_LIMIT` of them;
 *   - a shield on every defence answering this storm on its path, and on
 *     every tile the defences cooled (`protectedTiles`).
 * `terrainOf` gives a tile's terrain id; `defenceKeys` the tiles holding a
 * defence against this storm.
 */
export function buildHeatView(
  current: Exposure,
  undefended: Exposure | null,
  yearsLeft: number,
  defenceKeys: Iterable<string>,
  terrainOf: (key: string) => string | undefined
): HeatViewTile[] {
  const shielded = new Set<string>(undefended ? protectedTiles(current, undefended) : []);
  // On the path: where the storm reaches now, or would with no defences (a defence that keeps its own tile dry still earns its shield).
  const onPath = new Set([...current.exposure.keys(), ...(undefended ? undefended.exposure.keys() : [])]);
  for (const key of defenceKeys) if (onPath.has(key)) shielded.add(key);
  // The pulse marks houses that will fall, hardest hit first, never empty
  // ground: the point is to draw the eye to what can still be saved.
  const pulse = new Set(
    [...current.housesAtRisk]
      .sort((a, b) => (current.intensity.get(b) ?? 0) - (current.intensity.get(a) ?? 0) || (a < b ? -1 : 1))
      .slice(0, PULSE_LIMIT)
  );
  const tiles: HeatViewTile[] = [];
  // Section 21.4: the heat is on the homes the storm would take on the board as it stands (exactly the top bar's
  // Homes at risk), and the shields: a home a defence saved drops out of the heat, its tile keeps the shield.
  const atRisk = new Set(current.housesAtRisk);
  const keys = new Set([...atRisk, ...shielded]);
  for (const key of keys) {
    const exposure = current.exposure.get(key) ?? 0;
    const terrain = terrainOf(key);
    const dry = terrain === "land" || terrain === "beach" || terrain === "estuary";
    const heat = dry && atRisk.has(key) ? Math.max(HOME_HEAT_FLOOR, liveRamp(yearsLeft) * exposure) : 0;
    const shield = shielded.has(key);
    if (heat <= 0 && !shield) continue;
    tiles.push({ key, heat, hatch: heat > HATCH_THRESHOLD, pulse: heat > 0 && pulse.has(key), shield });
  }
  return tiles;
}
