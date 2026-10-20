import { axialKey, neighbor } from "./hex";
import type { GameState } from "./gameState";

/**
 * Perfect-fit combos: placements that work better together than apart, each
 * with a real defence bonus (Dorfromantik's "it fits" moment, made to matter).
 *
 *   Mangrove Belt  three or more mangroves touching: a belt slows water that
 *                  single trees let through.
 *   Living Bund    a khazan next to a mangrove: the bund and the roots hold
 *                  the creek bank together.
 * Section 25.1 (owner decision): pandanus gives the dune no bonus, so the
 * Beach Shield (a dune next to pandanus) is gone.
 *
 * The bonus is per tile, added to that tile's zone defence against the
 * hazards the element answers (see core/zones.ts). Data here, not in the
 * resolver, so the resolver still knows nothing about any element by name.
 */
export type ComboId = "mangrove_belt" | "living_bund";

export const COMBO_INFO: Record<ComboId, { name: string; bonus: number; line: string }> = {
  mangrove_belt: { name: "Mangrove Belt", bonus: 2, line: "Three or more mangroves together slow the water far more than scattered trees." },
  living_bund: { name: "Living Bund", bonus: 2, line: "Khazan beside mangroves: the bund and the roots hold the bank together." }
};

export interface ComboState {
  /** Tiles in each combo, by combo id. */
  members: Map<ComboId, Set<string>>;
  /** Extra defence per tile key. */
  bonus: Map<string, number>;
}

function elementAt(state: GameState, key: string): string | undefined {
  return state.elements.get(key)?.elementId;
}

function neighbourKeys(key: string): string[] {
  const [q, r] = key.split(",").map(Number);
  return Array.from({ length: 6 }, (_, dir) => axialKey(neighbor({ q, r }, dir)));
}

export function computeCombos(state: GameState): ComboState {
  const members = new Map<ComboId, Set<string>>([
    ["mangrove_belt", new Set()],
    ["living_bund", new Set()]
  ]);

  // Mangrove Belt: connected groups of three or more.
  const seen = new Set<string>();
  for (const [key, inst] of state.elements) {
    if (inst.elementId !== "mangrove" || seen.has(key)) continue;
    const group: string[] = [];
    const queue = [key];
    seen.add(key);
    while (queue.length > 0) {
      const current = queue.pop()!;
      group.push(current);
      for (const next of neighbourKeys(current)) {
        if (seen.has(next) || elementAt(state, next) !== "mangrove") continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (group.length >= 3) for (const member of group) members.get("mangrove_belt")!.add(member);
  }

  // Pairs: Living Bund (khazan + mangrove).
  const pairs: [ComboId, string, string][] = [["living_bund", "khazan", "mangrove"]];
  for (const [comboId, a, b] of pairs) {
    for (const [key, inst] of state.elements) {
      if (inst.elementId !== a) continue;
      for (const next of neighbourKeys(key)) {
        if (elementAt(state, next) !== b) continue;
        members.get(comboId)!.add(key);
        members.get(comboId)!.add(next);
      }
    }
  }

  const bonus = new Map<string, number>();
  for (const [comboId, keys] of members) {
    for (const key of keys) bonus.set(key, (bonus.get(key) ?? 0) + COMBO_INFO[comboId].bonus);
  }
  return { members, bonus };
}

/** Tiles that joined each combo between `before` and `after`: what to celebrate. */
export function newComboMembers(before: ComboState, after: ComboState): { combo: ComboId; tiles: string[]; all: string[] }[] {
  const out: { combo: ComboId; tiles: string[]; all: string[] }[] = [];
  for (const [comboId, keys] of after.members) {
    const previous = before.members.get(comboId) ?? new Set<string>();
    const added = [...keys].filter((key) => !previous.has(key));
    if (added.length > 0) out.push({ combo: comboId, tiles: added, all: [...keys] });
  }
  return out;
}
