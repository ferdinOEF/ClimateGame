import { axialKey, type AxialCoord } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { ElementInstance, GameState } from "./gameState";
import { QUARTERS_PER_YEAR } from "./quarters";
import { buildSchedule, challengeStrength, outlookFor, type ClimateConfig, type ScheduledChallenge } from "./climate";
import { resolveChallenge, ZoneIndex, type ChallengeOutcome, type ComboBonus, type HouseRule, type ZoneDef } from "./zones";
import { computeCombos, newComboMembers, type ComboId, type ComboState } from "./combos";
import { voiceProgress, type VoiceDef, type VoiceStatus } from "./voices";
import { computeExposure, type Exposure } from "./exposure";

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
  /**
   * Income flows into a coin jar each quarter instead of straight into Coin;
   * tapping the jar (free, no time) banks it. `incomeScale` sizes the whole
   * economy: the run should afford roughly 40–70 meaningful decisions, never
   * everything. `jarStart` is a small gift so the first tap comes early.
   */
  economy?: { incomeScale: number; jarStart: number; coinMultiplier?: number };
}

export { QUARTERS_PER_YEAR };

/** One thing that happened while the clock moved. The session animates these in order. */
export type RunEvent =
  | { type: "quarter"; quarter: number }
  /** A challenge's Forecast locked: exact quarter and strength are now known. */
  | { type: "forecast_lock"; challenge: ScheduledChallenge }
  /** A challenge landed this quarter, and how the city fared. */
  | { type: "challenge"; challenge: ScheduledChallenge; outcome: ChallengeOutcome | null }
  /** Tiles just joined a perfect-fit combo. `all` is every tile in that combo now. */
  | { type: "combo"; combo: ComboId; tiles: string[]; all: string[] }
  /** A Voice of Panjim was answered: `reward` Coin paid at once. */
  | { type: "voice_complete"; voice: VoiceDef; reward: number }
  /** A new era's Voices arrive. */
  | { type: "voice_new"; voices: VoiceDef[] };

export interface ActionRunOptions {
  /** The level's climate: scheduled challenges and the rising baseline. */
  climate?: ClimateConfig;
  /** Seed text for the schedule's jitter. The level id by default; a daily or replay seed otherwise. */
  seed?: string;
  /** The map's challenge zones. Without them a challenge is reported but not resolved. */
  zones?: readonly ZoneDef[];
  /** The level's Voices of Panjim requests. */
  voices?: readonly VoiceDef[];
  /** Stars per storm by the share of houses saved (the level's balance preset). Without it, by protection. */
  houseStars?: { three: number; two: number };
  /** How houses stand up to a storm, house by house (the level's `houses` block). */
  houseRule?: HouseRule;
}

/** The readiness gauge: what the next challenge would do to the board as it stands. */
export interface Readiness {
  challenge: ScheduledChallenge;
  /** Strength the prediction used: exact once the Forecast locks, the expected value before. */
  strength: number;
  outcome: ChallengeOutcome;
  level: "red" | "amber" | "green";
}

export type ActionKind = "build" | "repair" | "demolish" | "fast_forward_year" | "fast_forward_event";

/**
 * Everything needed to put a run back exactly where it was: the board, the
 * clock, the jar, which challenges have locked and landed and how they went,
 * and the Voices. Plain JSON, so it doubles as the autosave.
 */
export interface RunSnapshot {
  version: 1;
  quarter: number;
  coin: number;
  trust: number;
  resilience: number;
  elements: [string, ElementInstance][];
  jar: number;
  jarCollected: number;
  landed: string[];
  locked: string[];
  outcomes: [string, ChallengeOutcome][];
  voiceStatus: [string, VoiceStatus][];
}

/** Repairs cost this share of the element's build cost. */
export const REPAIR_SHARE = 0.4;

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
  readonly zones: ZoneIndex | null;
  /** Outcome of each landed challenge, by id. */
  readonly outcomes = new Map<string, ChallengeOutcome>();
  /** Perfect-fit combo bonuses (P6) the resolver adds to zone defence. */
  combos: ComboBonus = new Map();
  /** The board's perfect-fit combos, recomputed after every action and challenge. */
  comboState: ComboState;
  readonly voices: readonly VoiceDef[];
  readonly houseStars?: { three: number; two: number };
  readonly houseRule?: HouseRule;
  readonly voiceStatus = new Map<string, VoiceStatus>();
  /**
   * The run as it stood the quarter each challenge's Forecast locked, by
   * challenge id: what "Replay from the forecast" rewinds to.
   */
  readonly lockSnapshots = new Map<string, RunSnapshot>();
  /** Coin waiting in the jar. Banked only when the player taps it. */
  jar: number;
  /** Everything ever banked from the jar, for the finale's Livelihoods. */
  jarCollected = 0;

  constructor(
    readonly state: GameState,
    readonly config: TimelineConfig,
    options: ActionRunOptions = {}
  ) {
    this.totalQuarters = (config.endYear - config.startYear) * QUARTERS_PER_YEAR;
    state.autoCollectIncome = !config.economy;
    state.maturityField = "matureQuarters";
    this.jar = config.economy?.jarStart ?? 0;
    this.climate = options.climate ?? null;
    this.schedule = this.climate ? buildSchedule(this.climate, options.seed ?? "panjim", config.startYear, config.endYear) : [];
    this.zones = options.zones && options.zones.length > 0 ? new ZoneIndex(options.zones) : null;
    this.comboState = computeCombos(state);
    this.combos = this.comboState.bonus;
    this.voices = options.voices ?? [];
    this.houseStars = options.houseStars;
    this.houseRule = options.houseRule;
    for (const voice of this.voices) this.voiceStatus.set(voice.id, voice.era === 1 ? "active" : "waiting");
  }

  snapshot(): RunSnapshot {
    // Through JSON, so nothing in the snapshot shares an object with the live run.
    return JSON.parse(
      JSON.stringify({
        version: 1,
        quarter: this.quarter,
        coin: this.state.coin,
        trust: this.state.trust,
        resilience: this.state.resilience,
        elements: [...this.state.elements],
        jar: this.jar,
        jarCollected: this.jarCollected,
        landed: [...this.landed],
        locked: [...this.locked],
        outcomes: [...this.outcomes],
        voiceStatus: [...this.voiceStatus]
      } satisfies RunSnapshot)
    ) as RunSnapshot;
  }

  /** Puts the run back to `snapshot`. Lock snapshots taken after it are dropped; those before it stay. */
  restore(snapshot: RunSnapshot): void {
    const copy = JSON.parse(JSON.stringify(snapshot)) as RunSnapshot;
    this.state.elements.clear();
    for (const [key, inst] of copy.elements) this.state.elements.set(key, inst);
    this.state.turn = copy.quarter;
    this.state.coin = copy.coin;
    this.state.trust = copy.trust;
    this.state.resilience = copy.resilience;
    this.jar = copy.jar;
    this.jarCollected = copy.jarCollected;
    this.landed.clear();
    for (const id of copy.landed) this.landed.add(id);
    this.locked.clear();
    for (const id of copy.locked) this.locked.add(id);
    this.outcomes.clear();
    for (const [id, outcome] of copy.outcomes) this.outcomes.set(id, outcome);
    this.voiceStatus.clear();
    for (const [id, status] of copy.voiceStatus) this.voiceStatus.set(id, status);
    for (const id of [...this.lockSnapshots.keys()]) if (!this.locked.has(id)) this.lockSnapshots.delete(id);
    this.comboState = computeCombos(this.state);
    this.combos = this.comboState.bonus;
  }

  /** Era 1 runs to the first challenge, era 2 to the second, era 3 to 2050. */
  get era(): number {
    return Math.min(3, this.landed.size + 1);
  }

  /** The Voices asking right now. */
  activeVoices(): VoiceDef[] {
    return this.voices.filter((voice) => this.voiceStatus.get(voice.id) === "active");
  }

  /**
   * After anything that changed the board: recompute the combos (reporting
   * tiles that just joined one) and pay out any Voice whose request is now
   * met.
   */
  private settle(): RunEvent[] {
    const events: RunEvent[] = [];
    const next = computeCombos(this.state);
    for (const joined of newComboMembers(this.comboState, next)) events.push({ type: "combo", ...joined });
    this.comboState = next;
    this.combos = next.bonus;
    for (const voice of this.activeVoices()) {
      const { current, target } = voiceProgress(voice.goal, this.state, this.zones, this.comboState);
      if (current < target) continue;
      this.voiceStatus.set(voice.id, "done");
      this.state.coin += voice.reward;
      events.push({ type: "voice_complete", voice, reward: voice.reward });
    }
    return events;
  }

  /** The intensity a challenge lands at: its strength (base times the baseline on its date) in zone-defence points. */
  intensityOf(challenge: ScheduledChallenge): number {
    return this.climate ? challengeStrength(this.climate, challenge) * this.climate.intensityPerStrength : 0;
  }

  /**
   * The readiness gauge for the next challenge: resolves it against a copy of
   * the board as it would stand on the challenge's date if the player built
   * nothing more (so defences still growing are counted at the maturity they
   * will have reached). Before the Forecast locks the strength is the
   * expected one, from the nominal year; after, it is exact.
   */
  readiness(): Readiness | null {
    const challenge = this.nextChallenge();
    return challenge ? this.readinessFor(challenge) : null;
  }

  /** The same prediction for any challenge still to come. */
  readinessFor(challenge: ScheduledChallenge): Readiness | null {
    const preview = this.previewBoard(challenge);
    if (!preview || !this.climate || !this.zones) return null;
    const outcome = resolveChallenge(preview.board, this.zones, challenge.kind, preview.strength * this.climate.intensityPerStrength, this.climate.intensityPerStrength, this.combos, this.houseStars, this.houseRule);
    return { challenge, strength: preview.strength, outcome, level: outcome.stars === 3 ? "green" : outcome.stars === 2 ? "amber" : "red" };
  }

  /**
   * The board as it will stand on `challenge`'s date if the player builds
   * nothing more (defences counted at the maturity they will have by then),
   * and the strength to test it at: exact once the Forecast locks, the
   * expected one before. Shared by the readiness gauge and the warning heat,
   * so the two can never disagree.
   */
  private previewBoard(challenge: ScheduledChallenge): { board: GameState; strength: number } | null {
    if (!this.climate || !this.zones || this.landed.has(challenge.id)) return null;
    const lockedNow = outlookFor(this.climate, challenge, this.quarter, this.config.startYear).phase === "locked";
    const nominal = { ...challenge, quarter: Math.round((challenge.year - this.config.startYear) * QUARTERS_PER_YEAR) };
    const strength = challengeStrength(this.climate, lockedNow ? challenge : nominal);
    const board = this.state.clone();
    board.turn = Math.max(this.quarter, challenge.quarter);
    return { board, strength };
  }

  /**
   * The warning heat's source: `challenge` run on the board as it will stand
   * on its date, tile by tile (core/exposure.ts). `withoutDefences` gives the
   * same storm against a board with every defence against it removed, which
   * is what the green shields compare to.
   */
  exposureFor(challenge: ScheduledChallenge, withoutDefences = false): Exposure | null {
    const preview = this.previewBoard(challenge);
    if (!preview || !this.climate || !this.zones) return null;
    return computeExposure(preview.board, this.zones, challenge.kind, preview.strength * this.climate.intensityPerStrength, this.climate.intensityPerStrength, {
      combos: this.combos,
      houseRule: this.houseRule,
      houseStars: this.houseStars,
      withoutDefences
    });
  }

  /** Quarters until `challenge` lands, from now. */
  quartersUntil(challenge: ScheduledChallenge): number {
    return challenge.quarter - this.quarter;
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

  /** Coin the jar gains per quarter at the board's current income. */
  get incomePerQuarter(): number {
    return Math.max(0, this.state.income) * (this.config.economy?.incomeScale ?? 1);
  }

  /** Banks the jar into Coin: a free action. Returns the whole coins banked. */
  collectJar(): number {
    const coins = Math.floor(this.jar);
    if (coins <= 0) return 0;
    this.jar -= coins;
    this.jarCollected += coins;
    this.state.coin += coins;
    return coins;
  }

  /** Coin a repair costs: a share of the element's build cost. */
  repairCoin(coord: AxialCoord): number {
    const inst = this.state.elements.get(axialKey(coord));
    const def = inst ? ELEMENT_BY_ID.get(inst.elementId) : undefined;
    return def ? Math.ceil(def.buildCost * REPAIR_SHARE) : 0;
  }

  /** Whether the element at `coord` is worn or knocked out, and so can be repaired. */
  needsRepair(coord: AxialCoord): boolean {
    return (this.state.elements.get(axialKey(coord))?.degradeAmount ?? 0) > 0;
  }

  /** Restores a worn defence or a damaged house to full: one quarter and part of its build cost. */
  repair(coord: AxialCoord): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    const inst = this.state.elements.get(axialKey(coord));
    if (!inst || inst.degradeAmount <= 0) return refuse("Nothing to repair.");
    const coin = this.repairCoin(coord);
    if (this.state.coin < coin) return refuse("Not enough Coin.");
    this.state.coin -= coin;
    inst.degradeAmount = 0;
    return this.spend(this.config.costs.repair);
  }

  /** One year of time-lapse: four quarters, stopping early at the end of the run. */
  fastForwardYear(): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    return this.spend(this.config.costs.fastForwardYear);
  }

  /**
   * Lets `quarters` quarters pass with no build. Not a player control (the
   * player has +1 year and Next event); the screenshot scenarios use it to
   * stop the clock on an exact quarter before a storm.
   */
  waitQuarters(quarters: number): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    return this.spend(Math.max(0, Math.floor(quarters)));
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
    events.push(...this.settle());
    return { ok: true, quarters: spent, events };
  }

  /** One quarter passes: the turn advances, then any Forecast that locks and any challenge that lands. */
  protected tick(): RunEvent[] {
    // Income for the quarter goes into the jar, at the maturity the board had
    // during it (before the turn advances), as the turn model always did.
    if (this.config.economy) this.jar += this.incomePerQuarter;
    this.state.advanceTurn();
    const events: RunEvent[] = [{ type: "quarter", quarter: this.quarter }];
    if (!this.climate) return events;
    for (const challenge of this.schedule) {
      if (this.locked.has(challenge.id) || challenge.quarter - this.quarter > this.climate.forecastLockQuarters) continue;
      this.locked.add(challenge.id);
      this.lockSnapshots.set(challenge.id, this.snapshot());
      events.push({ type: "forecast_lock", challenge });
    }
    for (const challenge of this.schedule) {
      if (this.landed.has(challenge.id) || challenge.quarter > this.quarter) continue;
      this.landed.add(challenge.id);
      events.push(...this.land(challenge));
    }
    return events;
  }

  /** A challenge lands and resolves zone by zone against the board. */
  protected land(challenge: ScheduledChallenge): RunEvent[] {
    const events: RunEvent[] = [];
    if (!this.zones || !this.climate) {
      events.push({ type: "challenge", challenge, outcome: null });
    } else {
      const outcome = resolveChallenge(this.state, this.zones, challenge.kind, this.intensityOf(challenge), this.climate.intensityPerStrength, this.combos, this.houseStars, this.houseRule);
      this.outcomes.set(challenge.id, outcome);
      events.push({ type: "challenge", challenge, outcome });
    }
    // A new era: the last era's unanswered Voices lapse, the next era's arrive.
    for (const voice of this.voices) {
      if (this.voiceStatus.get(voice.id) === "active") this.voiceStatus.set(voice.id, "lapsed");
    }
    const arriving = this.voices.filter((voice) => voice.era === this.era && this.voiceStatus.get(voice.id) === "waiting");
    for (const voice of arriving) this.voiceStatus.set(voice.id, "active");
    if (arriving.length > 0) events.push({ type: "voice_new", voices: arriving });
    return events;
  }
}

function refuse(reason: string): ActionOutcome {
  return { ok: false, quarters: 0, events: [], reason };
}
