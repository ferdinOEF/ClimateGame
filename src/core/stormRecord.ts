import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import { FRONTS, resolveChallenge, type ChallengeOutcome, type ComboBonus, type HazardId, type HouseRule, type ZoneIndex } from "./zones";
import { buildDepthField, type DepthField } from "./hazard";
import { hazardsOf } from "./exposure";

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
}

export interface StormArgs {
  zones: ZoneIndex;
  kind: ChallengeKind;
  intensity: number;
  strengthUnit: number;
  combos?: ComboBonus;
  houseStars?: { three: number; two: number };
  houseRule?: HouseRule;
}

function isBuilding(state: GameState, key: string): boolean {
  const inst = state.elements.get(key);
  return !!inst && ELEMENT_BY_ID.get(inst.elementId)?.kind === "building" && inst.degradeAmount < 1;
}

/** True for an element that defends against any of `hazards` (the ones the resolver counts). */
export function defendsAgainst(elementId: string, hazards: readonly HazardId[]): boolean {
  const def = ELEMENT_BY_ID.get(elementId);
  return !!def && (def.effects.resilience ?? 0) > 0 && !!def.targetsHazards?.some((h) => hazards.includes(h as HazardId));
}

/** Resolves a storm on `state` (mutating it) and returns the outcome with its depth field. */
function resolveWithField(state: GameState, args: StormArgs): { outcome: ChallengeOutcome; field: DepthField } {
  const houses = new Set<string>();
  for (const key of state.elements.keys()) if (isBuilding(state, key)) houses.add(key);
  const samples = new Map<string, { cyclone?: number; flood?: number }>();
  const outcome = resolveChallenge(state, args.zones, args.kind, args.intensity, args.strengthUnit, args.combos, args.houseStars, args.houseRule, (key, value, hazard) => {
    const sample = samples.get(key) ?? {};
    sample[hazard] = Math.max(sample[hazard] ?? 0, value);
    samples.set(key, sample);
  });
  const frontStrength: { cyclone?: number; flood?: number } = {};
  for (const front of FRONTS[args.kind]) frontStrength[front.hazard] = Math.max(frontStrength[front.hazard] ?? 0, args.intensity * front.share);
  const field = buildDepthField({
    kind: args.kind,
    tiles: [...state.placed.entries()].map(([key, tile]) => ({ key, terrainId: tile.terrainId })),
    samples,
    resilience: args.houseRule?.resilience ?? args.strengthUnit,
    frontStrength,
    houses
  });
  return { outcome, field };
}

/**
 * Resolves the storm on `state` exactly as `resolveChallenge` would (and
 * mutates it the same way), and records it for the visuals and the replay.
 */
export function resolveStorm(state: GameState, args: StormArgs): StormRecord {
  const before = state.clone();
  const { outcome, field } = resolveWithField(state, args);
  const hazards = hazardsOf(args.kind);
  const without = (keep: (elementId: string) => boolean): GameState => {
    const copy = before.clone();
    for (const [key, inst] of [...copy.elements]) if (!keep(inst.elementId)) copy.elements.delete(key);
    return copy;
  };
  const undefended = resolveWithField(without((id) => !defendsAgainst(id, hazards)), args);
  const counts = new Map<string, number>();
  for (const inst of before.elements.values()) if (defendsAgainst(inst.elementId, hazards)) counts.set(inst.elementId, (counts.get(inst.elementId) ?? 0) + 1);
  const savedBy: DefenceSave[] = [];
  for (const [elementId, count] of counts) {
    const copy = without((id) => id !== elementId);
    const lost = resolveChallenge(copy, args.zones, args.kind, args.intensity, args.strengthUnit, args.combos, args.houseStars, args.houseRule).housesDamaged;
    const houses = lost - outcome.housesDamaged;
    if (houses > 0) savedBy.push({ elementId, count, houses });
  }
  savedBy.sort((a, b) => b.houses - a.houses || (a.elementId < b.elementId ? -1 : 1));
  return { kind: args.kind, outcome, field, undefended, savedBy };
}
