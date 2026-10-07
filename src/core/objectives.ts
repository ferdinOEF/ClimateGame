import type { GameState } from "./gameState";
import { ELEMENT_BY_ID } from "./elements";
import type { RunStatsSnapshot } from "./runStats";

/**
 * A level's win conditions, evaluated as pure data.
 *
 * The design rule here matches the one `GameState.meterTotal()` already
 * follows for meters: a new objective is added by writing a row in
 * `levels.json`, never by adding a branch somewhere in the session layer.
 * Everything below is a discriminated union plus one `evaluate` switch, so
 * the UI, the completion check and the tests all read the same source of
 * truth and cannot drift apart.
 *
 * Objectives are evaluated continuously, not only at the end. That matters
 * for the "peak" ones (`meter_at_least` reads the run's high-water mark,
 * not the live value) — a player who hits 20 Biodiversity and then loses a
 * mangrove belt to a storm has still done the thing the objective asked
 * for, and having a completed objective silently un-complete itself reads
 * as a bug no matter how defensible the arithmetic is.
 */
export type Objective =
  /** Weather N hazards without the era ending. */
  | { type: "survive_hazards"; count: number }
  /** Reach at least `value` on a meter at any point in the run. */
  | { type: "meter_at_least"; meter: MeterKey; value: number }
  /** Finish with Resilience at or above `value`. */
  | { type: "resilience_at_least"; value: number }
  /** Have at least `count` of a specific element standing. */
  | { type: "build_element"; elementId: string; count: number }
  /** Have at least `count` standing defenses of a given family. */
  | { type: "build_category"; category: "nbs" | "engineered" | "hybrid"; count: number }
  /** Reach turn N. */
  | { type: "reach_turn"; turn: number }
  /** Get through the level without losing a defense outright. */
  | { type: "no_defenses_lost" }
  /** Weather `count` hazards that do no damage at all. */
  | { type: "perfect_defense"; count: number }
  /** Hold at least `value` Coin at once — the Yacht-style savings goal. */
  | { type: "coin_at_least"; value: number };

export type MeterKey = "biodiversity" | "carbon" | "food" | "population" | "trust" | "resilience";

/** One objective's live state, in the shape the HUD renders directly. */
export interface ObjectiveProgress {
  objective: Objective;
  label: string;
  /** Where the player is now, on the objective's own scale. */
  current: number;
  /**
   * What `current` has to reach, on the objective's own scale, straight
   * from the level definition. Renderers must not divide by it blindly —
   * a level could legitimately author a target of 0 (`reach_turn: 0`), and
   * `ObjectivesPanel` treats any target of 1 or less as a plain tick
   * rather than a ratio for that reason.
   */
  target: number;
  complete: boolean;
}

function meterValue(state: GameState, stats: RunStatsSnapshot, meter: MeterKey): number {
  switch (meter) {
    // Peak-tracked: see the class comment on why these read the run's
    // high-water mark rather than the live board.
    case "biodiversity":
      return Math.max(state.biodiversity, stats.peakBiodiversity);
    case "carbon":
      return Math.max(state.carbon, stats.peakCarbon);
    case "food":
      return state.food;
    case "population":
      return state.population;
    case "trust":
      return state.trust;
    case "resilience":
      return state.resilience;
  }
}

/** How many standing elements match a predicate — objectives count what is on the board now, not what was ever built (a destroyed seawall stops counting). */
function countStanding(state: GameState, match: (elementId: string) => boolean): number {
  let count = 0;
  for (const inst of state.elements.values()) {
    if (match(inst.elementId)) count++;
  }
  return count;
}

function elementName(elementId: string): string {
  return ELEMENT_BY_ID.get(elementId)?.name ?? elementId;
}

const METER_LABEL: Record<MeterKey, string> = {
  biodiversity: "Biodiversity",
  carbon: "Carbon",
  food: "Food",
  population: "Population",
  trust: "Trust",
  resilience: "Resilience"
};

const CATEGORY_LABEL: Record<"nbs" | "engineered" | "hybrid", string> = {
  nbs: "nature-based",
  engineered: "engineered",
  hybrid: "hybrid"
};

/** The player-facing sentence for an objective. Kept beside `evaluate` so a new objective type cannot ship with progress logic but no label. */
export function describeObjective(objective: Objective): string {
  switch (objective.type) {
    case "survive_hazards":
      return `Weather ${objective.count} hazard${objective.count === 1 ? "" : "s"}`;
    case "meter_at_least":
      return `Reach ${objective.value} ${METER_LABEL[objective.meter]}`;
    case "resilience_at_least":
      return `Finish with ${objective.value}+ Resilience`;
    case "build_element":
      return `Have ${objective.count} ${elementName(objective.elementId)}${objective.count === 1 ? "" : "s"} standing`;
    case "build_category":
      return `Have ${objective.count} ${CATEGORY_LABEL[objective.category]} defence${objective.count === 1 ? "" : "s"} standing`;
    case "reach_turn":
      return `Survive to turn ${objective.turn}`;
    case "no_defenses_lost":
      return "Lose no defences";
    case "perfect_defense":
      return `Weather ${objective.count} hazard${objective.count === 1 ? "" : "s"} without a scratch`;
    case "coin_at_least":
      return `Bank ${objective.value} Coin`;
  }
}

/**
 * Evaluates one objective against the live board plus the run's history.
 *
 * Pure: takes state in, returns a value out, mutates nothing. That is what
 * lets the session layer call this every HUD refresh without worrying
 * about it, and lets `tests/objectives.test.ts` drive it from hand-built
 * fixtures with no renderer in sight.
 */
export function evaluateObjective(objective: Objective, state: GameState, stats: RunStatsSnapshot): ObjectiveProgress {
  const base = { objective, label: describeObjective(objective) };

  switch (objective.type) {
    case "survive_hazards":
      return { ...base, current: stats.hazardsSurvived, target: objective.count, complete: stats.hazardsSurvived >= objective.count };

    case "meter_at_least": {
      const current = meterValue(state, stats, objective.meter);
      return { ...base, current, target: objective.value, complete: current >= objective.value };
    }

    case "resilience_at_least":
      return { ...base, current: state.resilience, target: objective.value, complete: state.resilience >= objective.value };

    case "build_element": {
      const current = countStanding(state, (id) => id === objective.elementId);
      return { ...base, current, target: objective.count, complete: current >= objective.count };
    }

    case "build_category": {
      const current = countStanding(state, (id) => ELEMENT_BY_ID.get(id)?.category === objective.category);
      return { ...base, current, target: objective.count, complete: current >= objective.count };
    }

    case "reach_turn":
      return { ...base, current: state.turn, target: objective.turn, complete: state.turn >= objective.turn };

    case "no_defenses_lost":
      // Expressed as a 0/1 bar so the HUD can render every objective the
      // same way. It reads "complete" from turn one and can only be lost —
      // which is the honest depiction: it is a streak the player is
      // currently holding, not progress they are accumulating.
      return {
        ...base,
        current: stats.defensesDestroyed === 0 ? 1 : 0,
        target: 1,
        complete: stats.defensesDestroyed === 0
      };

    case "perfect_defense":
      return { ...base, current: stats.perfectDefenses, target: objective.count, complete: stats.perfectDefenses >= objective.count };

    case "coin_at_least":
      return { ...base, current: state.coin, target: objective.value, complete: state.coin >= objective.value };
  }
}

export function evaluateObjectives(objectives: readonly Objective[], state: GameState, stats: RunStatsSnapshot): ObjectiveProgress[] {
  return objectives.map((objective) => evaluateObjective(objective, state, stats));
}

/**
 * A level is cleared when every one of its objectives is satisfied at the
 * same moment. Deliberately "all", never "any" — the objective list is how
 * a level teaches a specific lesson (defend AND keep the coast alive), and
 * letting one of them stand in for the rest collapses that.
 */
export function allComplete(progress: readonly ObjectiveProgress[]): boolean {
  return progress.length > 0 && progress.every((p) => p.complete);
}
