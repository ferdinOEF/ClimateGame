import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ChallengeKind, WindOverride } from "./climate";
import { FRONTS, resolveChallenge, type ChallengeOutcome, type ComboBonus, type HazardId, type HouseRule, type ZoneIndex } from "./zones";
import { buildDepthField, type DepthField } from "./hazard";
import { computeWater, LANDFALL_ZONE, waterBoard, siteAt } from "./hazardModel";
import { hazardsOf } from "./exposure";
import { computeCombos } from "./combos";
import type { HouseStars } from "./zones";

/**
 * A storm, resolved and recorded for showing: the real outcome, the water
 * depth field the visuals draw (core/hazard.ts), and the comparisons the
 * Aftermath replay and the share card quote.
 *
 * `resolveStorm` runs the zone resolver exactly as a landing storm always
 * did (same arguments, same mutation of `state`), with its tile probe
 * listening, so the depth field is built from the numbers that decided which
 * houses fell. The comparisons run the same storm on copies of the board as
 * it stood just before: one with every defence against this storm removed,
 * and one per kind of defence with just that kind removed. Every figure the
 * replay shows is a real resolver result; nothing is estimated.
 *
 * Pure: no DOM, no renderer.
 */
export interface DefenceSave {
  elementId: string;
  /** How many of this kind stood on the board. */
  count: number;
  /** Houses that would have been lost without this kind of defence, beyond those actually lost. */
  houses: number;
}

export interface StormRecord {
  kind: ChallengeKind;
  outcome: ChallengeOutcome;
  field: DepthField;
  /** The same storm on the same board with every defence against it removed. */
  undefended: { outcome: ChallengeOutcome; field: DepthField };
  /** Per kind of defence, most houses saved first. Kinds that saved none are left out. */
  savedBy: DefenceSave[];
  /** The defences against this storm standing when it came (key → element id), before any failed. */
  defences: Map<string, string>;
  /** The sea tile a cyclone came ashore at (null for a flood): the animation stages landfall there. */
  landfallKey?: string | null;
  /** The water on every tile it reached, game metres, with the player's defences. */
  depth: Map<string, number>;
  /** The cyclone's wind on every tile it reached, game metres of water-equivalent (empty for a flood). Water and wind together decide which houses fall (`damageAt`). */
  wind: Map<string, number>;
  /**
   * Every kind of defence standing when it came (whatever it defends
   * against: a khazan can still matter in a cyclone through a combo), with
   * the homes the same storm takes beyond those it took when that kind is
   * removed and everything else is equal (`housesLostWithout`). Can be 0.
   */
  withoutEach: Map<string, number>;
  /**
   * Section 30.11 bug 13: kinds whose `withoutEach` is 0 only because another kind would have covered for them:
   * taken away together with that other kind, the storm takes more homes than without the other alone. The card
   * says "Shared the work" for them, not 0.
   */
  sharedWork?: string[];
}

export interface StormArgs {
  zones: ZoneIndex;
  kind: ChallengeKind;
  intensity: number;
  strengthUnit: number;
  combos?: ComboBonus;
  houseStars?: HouseStars;
  houseRule?: HouseRule;
  /** Where a cyclone comes ashore (index into the board's landfall sites). */
  landfall?: number | null;
  /** Tiles the storm never reaches (Section 23.1, `shelterOf`). */
  sheltered?: ReadonlySet<string>;
  /** Section 26.3: the storm's own wind numbers. */
  wind?: WindOverride;
}

function isBuilding(state: GameState, key: string): boolean {
  const inst = state.elements.get(key);
  return !!inst && !state.isScenery(key) && ELEMENT_BY_ID.get(inst.elementId)?.kind === "building" && inst.degradeAmount < 1;
}

/** True for an element that defends against any of `hazards` (the ones the resolver counts). */
export function defendsAgainst(elementId: string, hazards: readonly HazardId[]): boolean {
  const def = ELEMENT_BY_ID.get(elementId);
  return !!def && (def.effects.resilience ?? 0) > 0 && !!def.targetsHazards?.some((h) => hazards.includes(h as HazardId));
}

/** How deep the animation draws water, at most, in house-loss depths. Presentation only. */
export const VISUAL_DEPTH_CAP = 2.5;

/** Resolves a storm on `state` (mutating it) and returns the outcome with its depth field. */
function resolveWithField(state: GameState, args: StormArgs): { outcome: ChallengeOutcome; field: DepthField; depth: Map<string, number>; wind: Map<string, number> } {
  const houses = new Set<string>();
  // Standing houses only: one an earlier storm took is already down and cannot fall again.
  for (const [key, inst] of state.elements) if (isBuilding(state, key) && inst.degradeAmount < 1) houses.add(key);
  const samples = new Map<string, { cyclone?: number; flood?: number; wind?: number }>();
  const resilienceUnit = args.houseRule?.resilience ?? args.strengthUnit;
  // The sea's and the river's own levels, for the water drawn on them (the same model, before the board changes).
  const landfallTiles = args.zones.keys(LANDFALL_ZONE);
  const levels = computeWater(state, { kind: args.kind, strength: args.intensity / args.strengthUnit, landfall: args.kind === "flood" ? null : (args.landfall ?? null), sheltered: args.sheltered, wind: args.wind }, { combos: args.combos, landfallZoneTiles: landfallTiles.length > 0 ? landfallTiles : undefined });
  const outcome = resolveChallenge(
    state,
    args.zones,
    args.kind,
    args.intensity,
    args.strengthUnit,
    args.combos,
    args.houseStars,
    args.houseRule,
    (key, value, hazard, damage) => {
      const sample = samples.get(key) ?? {};
      // The wind, never drawn as water: the storm script adds it where a house is judged.
      if (damage > value) sample.wind = damage - value;
      samples.set(key, sample);
      // Wind alone is not water: nothing is drawn where only the wind reached.
      if (value <= 0) return;
      // Drawn no deeper than VISUAL_DEPTH_CAP house-loss depths: deep water reads as deep without towering.
      // A house is lost at 1, so the cap never changes what the animation shows falling.
      sample[hazard] = Math.max(sample[hazard] ?? 0, Math.min(value, VISUAL_DEPTH_CAP * resilienceUnit));
      samples.set(key, sample);
    },
    args.landfall,
    args.sheltered,
    args.wind
  );
  const frontStrength: { cyclone?: number; flood?: number } = {};
  // The swollen sea and river, in house-loss depths, capped like the tiles.
  if (levels.surgeLevel > 0) frontStrength.cyclone = Math.min(VISUAL_DEPTH_CAP, 1 + levels.surgeLevel / 10) * resilienceUnit;
  if (levels.floodLevel > 0) frontStrength.flood = Math.min(VISUAL_DEPTH_CAP, 1 + levels.floodLevel / 10) * resilienceUnit;
  const field = buildDepthField({
    kind: args.kind,
    tiles: [...state.placed.entries()].map(([key, tile]) => ({ key, terrainId: tile.terrainId })),
    samples,
    resilience: args.houseRule?.resilience ?? args.strengthUnit,
    frontStrength,
    houses,
    // The level's own flood source (Section 16.5): the swell starts there.
    floodSource: [...state.placed.entries()].filter(([, tile]) => tile.floodSource && tile.terrainId === "river").map(([key]) => key)
  });
  return { outcome, field, depth: levels.depth, wind: levels.wind };
}

/**
 * The same storm re-run on a copy of `before` (the board just before it hit)
 * with every defence of kind `removed` taken away and everything else equal:
 * the houses it takes. With `removed` null nothing is taken away, and the
 * result is the storm's own (tests/phaseResult.test.ts). Deterministic.
 */
export function housesLostWithout(before: GameState, args: StormArgs, removed: string | null): ChallengeOutcome {
  const copy = before.clone();
  if (removed) for (const [key, inst] of [...copy.elements]) if (inst.elementId === removed) copy.elements.delete(key);
  // A copy's combo bonuses are its own: removing one kind breaks the combos it was part of.
  const combos = args.combos ? computeCombos(copy).bonus : undefined;
  return resolveChallenge(copy, args.zones, args.kind, args.intensity, args.strengthUnit, combos, args.houseStars, args.houseRule, undefined, args.landfall, args.sheltered, args.wind);
}

/**
 * Resolves the storm on `state` exactly as `resolveChallenge` would (and
 * mutates it the same way), and records it for the visuals and the replay.
 */
export function resolveStorm(state: GameState, args: StormArgs): StormRecord {
  const before = state.clone();
  const { outcome, field, depth, wind } = resolveWithField(state, args);
  const hazards = hazardsOf(args.kind);
  const without = (keep: (elementId: string) => boolean): GameState => {
    const copy = before.clone();
    for (const [key, inst] of [...copy.elements]) if (!keep(inst.elementId)) copy.elements.delete(key);
    return copy;
  };
  // A copy's combo bonuses are its own: removing one kind breaks the combos it was part of.
  const argsFor = (copy: GameState): StormArgs => ({ ...args, combos: args.combos ? computeCombos(copy).bonus : undefined });
  const bare = without((id) => !defendsAgainst(id, hazards));
  const undefended = resolveWithField(bare, argsFor(bare));
  // Section 25.1: a broken seawall or dam stands on the board but protects nothing: never counted, never "held".
  const counts = new Map<string, number>();
  for (const inst of before.elements.values()) if (!inst.broken && defendsAgainst(inst.elementId, hazards)) counts.set(inst.elementId, (counts.get(inst.elementId) ?? 0) + 1);
  const savedBy: DefenceSave[] = [];
  for (const [elementId, count] of counts) {
    const houses = housesLostWithout(before, args, elementId).housesDamaged - outcome.housesDamaged;
    if (houses > 0) savedBy.push({ elementId, count, houses });
  }
  savedBy.sort((a, b) => b.houses - a.houses || (a.elementId < b.elementId ? -1 : 1));
  const withoutEach = new Map<string, number>();
  for (const inst of before.elements.values()) {
    if (inst.broken || withoutEach.has(inst.elementId) || (ELEMENT_BY_ID.get(inst.elementId)?.effects.resilience ?? 0) <= 0) continue;
    withoutEach.set(inst.elementId, Math.max(0, housesLostWithout(before, args, inst.elementId).housesDamaged - outcome.housesDamaged));
  }
  const sharedWork: string[] = [];
  const kinds = [...withoutEach.keys()];
  for (const kind of kinds) {
    if (withoutEach.get(kind)! > 0 || !defendsAgainst(kind, hazards)) continue;
    for (const other of kinds) {
      if (other === kind) continue;
      const both = without((id) => id !== kind && id !== other);
      const lost = resolveChallenge(both, args.zones, args.kind, args.intensity, args.strengthUnit, args.combos ? computeCombos(both).bonus : undefined, args.houseStars, args.houseRule, undefined, args.landfall, args.sheltered, args.wind).housesDamaged;
      if (lost > outcome.housesDamaged + withoutEach.get(other)!) {
        sharedWork.push(kind);
        break;
      }
    }
  }
  const defences = new Map<string, string>();
  for (const [key, inst] of before.elements) if (!inst.broken && defendsAgainst(inst.elementId, hazards)) defences.set(key, inst.elementId);
  const landfallTiles = args.zones.keys(LANDFALL_ZONE);
  const board = waterBoard(before, landfallTiles.length > 0 ? landfallTiles : undefined);
  const landfallKey = args.kind === "flood" ? null : (board.sites[args.landfall ?? siteAt(board, 0.5)] ?? null);
  return { kind: args.kind, outcome, field, undefended: { outcome: undefended.outcome, field: undefended.field }, savedBy, defences, landfallKey, depth, wind, withoutEach, sharedWork };
}
