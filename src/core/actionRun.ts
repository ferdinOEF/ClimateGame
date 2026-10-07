import { axialKey, type AxialCoord } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { GameState } from "./gameState";
import { QUARTERS_PER_YEAR } from "./quarters";
import { buildSchedule, type ClimateConfig, type ScheduledChallenge } from "./climate";

/**
 * The Panjim 2050 run: 25 years of Panjim in quarters, where time moves only
 * when the player acts.
 *
 * WHY TIME IS MEASURED IN ACTIONS
 *
 * A wall-clock timer would punish reading the board and reward clicking fast.
 * Here a quarter passes only when the player spends one: building, repairing
 * or demolishing costs one quarter, heavy engineering (a Seawall, a Small Dam)
 * costs two, and fast-forwarding a year costs four. A fast player finishes
 * sooner and a careful one takes longer, and both reach the same 2050 having
 * made the same number of moves. Everything free (tapping the coin jar or a
 * creature, the camera, inspecting a tile, opening a menu) costs no time.
 *
 * Pure game logic, like the rest of core/: no DOM, no renderer. The session
 * turns the events this returns into a ticking clock and a time-lapse, and the
 * bots in tools/panjimBots play the very same class headless.
 */

/** How the action-driven clock is configured for a level (levels.json `timeline`). */
export interface TimelineConfig {
  startYear: number;
  /** The run ends when the clock reaches Q1 of this year. */
  endYear: number;
  costs: {
    build: number;
    repair: number;
    demolish: number;
    fastForwardYear: number;
  };
}

export { QUARTERS_PER_YEAR };

/** One thing that happened while the clock moved. The session animates these in order. */
export type RunEvent =
  | { type: "quarter"; quarter: number }
  /** A challenge's Forecast locked: exact quarter and strength are now known. */
  | { type: "forecast_lock"; challenge: ScheduledChallenge }
  /** A challenge landed this quarter. */
  | { type: "challenge"; challenge: ScheduledChallenge };

export interface ActionRunOptions {
  /** The level's climate: scheduled challenges and the rising baseline. */
  climate?: ClimateConfig;
  /** Seed text for the schedule's jitter. The level id by default; a daily or replay seed otherwise. */
  seed?: string;
}

export type ActionKind = "build" | "repair" | "demolish" | "fast_forward_year" | "fast_forward_event";

export interface ActionOutcome {
  ok: boolean;
  /** Quarters actually spent. Can be fewer than the cost when a challenge or the end of the run interrupts a fast-forward. */
  quarters: number;
  events: RunEvent[];
  /** Why the action was refused, for the UI to say. */
  reason?: string;
}

/** "Q2 2026" for a quarter index counted from Q1 of `startYear`. */
export function quarterLabel(quarter: number, startYear: number): string {
  const year = startYear + Math.floor(quarter / QUARTERS_PER_YEAR);
  return `Q${(quarter % QUARTERS_PER_YEAR) + 1} ${year}`;
}

export class ActionRun {
  readonly totalQuarters: number;
  readonly climate: ClimateConfig | null;
  /** The challenge calendar for this seed, in order. */
  readonly schedule: ScheduledChallenge[];
  /** Ids of challenges that have landed. */
  readonly landed = new Set<string>();
  /** Ids of challenges whose Forecast has locked. */
  readonly locked = new Set<string>();

  constructor(
    readonly state: GameState,
    readonly config: TimelineConfig,
    options: ActionRunOptions = {}
  ) {
    this.totalQuarters = (config.endYear - config.startYear) * QUARTERS_PER_YEAR;
    state.autoCollectIncome = true;
    state.maturityField = "matureQuarters";
    this.climate = options.climate ?? null;
    this.schedule = this.climate ? buildSchedule(this.climate, options.seed ?? "panjim", config.startYear, config.endYear) : [];
  }

  /** The next challenge that has not landed yet, or null after the last. */
  nextChallenge(): ScheduledChallenge | null {
    return this.schedule.find((challenge) => !this.landed.has(challenge.id)) ?? null;
  }

  /** Quarters "Next event" would spend: up to one quarter before the next challenge. 0 when there is nothing to skip. */
  quartersToNextEvent(): number {
    const next = this.nextChallenge();
    if (!next) return 0;
    return Math.max(0, next.quarter - 1 - this.quarter);
  }

  /** Quarters elapsed since Q1 of the start year. The game state's turn counter is the same number. */
  get quarter(): number {
    return this.state.turn;
  }

  get label(): string {
    return this.finished ? `${this.config.endYear}` : quarterLabel(this.quarter, this.config.startYear);
  }

  get year(): number {
    return this.config.startYear + this.quarter / QUARTERS_PER_YEAR;
  }

  get finished(): boolean {
    return this.quarter >= this.totalQuarters;
  }

  get quartersLeft(): number {
    return Math.max(0, this.totalQuarters - this.quarter);
  }

  /** Quarters a build of this element takes: two for heavy engineering, one otherwise. */
  buildCost(elementId: string): number {
    return ELEMENT_BY_ID.get(elementId)?.buildQuarters ?? this.config.costs.build;
  }

  build(coord: AxialCoord, elementId: string): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    if (!this.state.build(coord, elementId, false)) return refuse("Can't build that here.");
    return this.spend(this.buildCost(elementId));
  }

  demolish(coord: AxialCoord): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    const key = axialKey(coord);
    if (!this.state.elements.has(key)) return refuse("Nothing to demolish.");
    this.state.elements.delete(key);
    return this.spend(this.config.costs.demolish);
  }

  /** One year of time-lapse: four quarters, stopping early at the end of the run. */
  fastForwardYear(): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    return this.spend(this.config.costs.fastForwardYear);
  }

  /** Skips to one quarter before the next challenge, as a time-lapse. */
  fastForwardToNextEvent(): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    const quarters = this.quartersToNextEvent();
    if (quarters <= 0) return refuse("Nothing to skip to.");
    return this.spend(quarters);
  }

  /**
   * Advances the clock `quarters` times, one quarter at a time, and reports
   * each tick. A challenge interrupts: the clock stops on the quarter it
   * lands, so a fast-forward never skips past one.
   */
  protected spend(quarters: number): ActionOutcome {
    const events: RunEvent[] = [];
    let spent = 0;
    while (spent < quarters && !this.finished) {
      const tickEvents = this.tick();
      events.push(...tickEvents);
      spent++;
      if (tickEvents.some((event) => event.type === "challenge")) break;
    }
    return { ok: true, quarters: spent, events };
  }

  /** One quarter passes: the turn advances, then any Forecast that locks and any challenge that lands. */
  protected tick(): RunEvent[] {
    this.state.advanceTurn();
    const events: RunEvent[] = [{ type: "quarter", quarter: this.quarter }];
    if (!this.climate) return events;
    for (const challenge of this.schedule) {
      if (this.locked.has(challenge.id) || challenge.quarter - this.quarter > this.climate.forecastLockQuarters) continue;
      this.locked.add(challenge.id);
      events.push({ type: "forecast_lock", challenge });
    }
    for (const challenge of this.schedule) {
      if (this.landed.has(challenge.id) || challenge.quarter > this.quarter) continue;
      this.landed.add(challenge.id);
      events.push(...this.land(challenge));
    }
    return events;
  }

  /** A challenge lands. Subclasses and later phases resolve it against the board; here it is only reported. */
  protected land(challenge: ScheduledChallenge): RunEvent[] {
    return [{ type: "challenge", challenge }];
  }
}

function refuse(reason: string): ActionOutcome {
  return { ok: false, quarters: 0, events: [], reason };
}
