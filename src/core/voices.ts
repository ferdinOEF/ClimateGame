import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import type { ComboId, ComboState } from "./combos";
import type { ZoneIndex } from "./zones";

/**
 * Voices of Panjim: small requests from the people who live here, two or
 * three per era, each a single micro-action with an instant reward.
 *
 * They are optional (Dorfromantik's quests, never a fail state) and they
 * point at good play without saying so: the Miramar fisher asks for dunes
 * on the beach that the first cyclone will hit, the Taleigao farmer for the
 * khazan bund the flood will test. Written in levels.json, so new voices are
 * a data edit.
 *
 * An era runs until the next challenge lands: era 1 to the cyclone, era 2 to
 * the flood, era 3 to 2050. A request not met in its era quietly lapses.
 */
export type VoiceGoal =
  /** At least `count` of `elementId` standing, in `zone` if given. */
  | { type: "standing"; elementId: string; count: number; zone?: string }
  /** Have this combo anywhere on the board. */
  | { type: "combo"; combo: ComboId };

export interface VoiceDef {
  id: string;
  era: 1 | 2 | 3;
  /** Who is asking: "Anthony, a Miramar fisherman". */
  who: string;
  text: string;
  /** Said when the request is met. */
  thanks: string;
  goal: VoiceGoal;
  reward: number;
}

export type VoiceStatus = "waiting" | "active" | "done" | "lapsed";

export function voiceProgress(goal: VoiceGoal, state: GameState, zones: ZoneIndex | null, combos: ComboState): { current: number; target: number } {
  switch (goal.type) {
    case "standing": {
      let current = 0;
      for (const [key, inst] of state.elements) {
        if (inst.elementId !== goal.elementId) continue;
        if (goal.zone && zones?.zoneOf(key) !== goal.zone) continue;
        current++;
      }
      return { current, target: goal.count };
    }
    case "combo":
      return { current: (combos.members.get(goal.combo)?.size ?? 0) > 0 ? 1 : 0, target: 1 };
  }
}

/** A one-line label for the goal, for the panel's progress hint. */
export function describeVoiceGoal(goal: VoiceGoal, zones: ZoneIndex | null): string {
  switch (goal.type) {
    case "standing": {
      const name = ELEMENT_BY_ID.get(goal.elementId)?.name ?? goal.elementId;
      const where = goal.zone && zones ? ` in ${zones.name(goal.zone)}` : "";
      return `${goal.count} ${name}${where}`;
    }
    case "combo":
      return goal.combo.replace("_", " ");
  }
}
