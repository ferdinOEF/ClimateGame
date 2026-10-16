import { axialKey, type AxialCoord } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
import type { ElementInstance, GameState } from "./gameState";
import { buildSchedule, challengeStrength, yearsUntil, type ClimateConfig, type ScheduledChallenge } from "./climate";
import { resolveChallenge, ZoneIndex, type ChallengeOutcome, type ComboBonus, type HouseRule, type ZoneDef } from "./zones";
import { computeCombos, newComboMembers, type ComboId, type ComboState } from "./combos";
import { computeExposure, HEAT_LEAD_YEARS, type Exposure } from "./exposure";
import { landfallSite, LANDFALL_ZONE, waterBoard, type WaterBoard } from "./hazardModel";
import { generatePrep, openingJobs, prepProgress, type PrepConfig, type PrepObjective } from "./prep";
import { generatePhaseObjective, type PhaseObjective } from "./phaseObjectives";
import { stretchTiles } from "./stretch";
import { forecastCone, type ForecastCone } from "./forecastCone";
import { resolveStorm, type StormRecord } from "./stormRecord";

/**
 * The Panjim 2050 run: 25 years of Panjim, one build a year (Section 8).
 *
 * Turn 1 is 2026 and turn 25 is 2050. One build (or repair, or demolition)
 * is one turn is one year: the moment it goes through, the year ends. A storm
 * whose year it is resolves straight after that build, still in its year,
 * before the next year begins: the cyclone after the 5th build (2030), the
 * flood after the 15th (2040), the two together after the 25th (2050). A
 * refused build does not move time. There is no other way to end a year,
 * except `skipYear` when nothing can be built anywhere (which the Panaji
 * board never reaches; tests/actionRun.test.ts). Nothing is random: the
 * calendar, the strengths and the cyclone's landfall are fixed in the
 * level's data.
 *
 * Coins and growth are off on Panaji in this version (the level's `economy`
 * and `growth` switches): building is free and a defence is at full strength
 * the moment it is built. The coin and growth code stays, behind those
 * switches, for a later version.
 *
 * Pure game logic, like the rest of core/: no DOM, no renderer. The session
 * turns the events this returns into the year ticking and the storms, and the
 * bots in tools/panjimBots play the very same class headless.
 */

/** How the yearly clock is configured for a level (levels.json `timeline`). */
export interface TimelineConfig {
  /** Turn 1. */
  startYear: number;
  /** The last turn's year (inclusive): the run ends when it does. */
  endYear: number;
}

/**
 * The level's economy switch and numbers. Off on Panaji (Section 5); the
 * numbers are kept for when coins return. With it on, income flows into a
 * coin jar each year and tapping the jar banks it.
 */
export interface EconomyConfig {
  enabled: boolean;
  incomeScale?: number;
  jarStart?: number;
}

/** One thing that happened. The session shows these in order. */
export type RunEvent =
  /** A new year began (`turn` is its turn number, 1-based). */
  | { type: "year"; turn: number }
  /** A storm's last two years began: the warning heat is up. */
  | { type: "warning"; challenge: ScheduledChallenge }
  /** A storm resolved at the end of its year, and how the city fared. */
  | { type: "challenge"; challenge: ScheduledChallenge; outcome: ChallengeOutcome | null }
  /** Tiles just joined a perfect-fit combo. `all` is every tile in that combo now. */
  | { type: "combo"; combo: ComboId; tiles: string[]; all: string[] }
  /** A Get ready job was finished (`reward` is 0 while coins are off). */
  | { type: "prep_complete"; objective: PrepObjective; reward: number }
  /** The Get ready jobs for the next storm were set. */
  | { type: "prep_new"; objectives: PrepObjective[] };

export interface ActionRunOptions {
  /** The level's climate: the three storms on their fixed calendar. */
  climate?: ClimateConfig;
  /** The map's challenge zones. Without them a challenge is reported but not resolved. */
  zones?: readonly ZoneDef[];
  /** Stars per storm by the share of houses saved (the level's houseStars). Without it, by protection. */
  houseStars?: { three: number; two: number };
  /** How houses stand up to a storm, house by house (the level's `houses` block). */
  houseRule?: HouseRule;
  /** "Get ready" jobs for each coming storm (core/prep.ts). */
  prep?: PrepConfig;
  /** The level's economy. Absent or disabled: building is free and no coin moves. */
  economy?: EconomyConfig;
  /** The level's growth switch. Absent or disabled: everything is at full strength when built. */
  growth?: { enabled: boolean };
  /** The map's named places, for an opening objective's stretch of coast. */
  landmarks?: readonly { name: string; q: number; r: number }[];
  /** False skips choosing each phase's objective with the model (the bots: objectives never change an outcome). Default true. */
  generateObjectives?: boolean;
}

/** The readiness gauge: what the next storm would do to the board as it stands. */
export interface Readiness {
  challenge: ScheduledChallenge;
  strength: number;
  outcome: ChallengeOutcome;
  level: "red" | "amber" | "green";
}

/**
 * Everything needed to put a run back exactly where it was. Plain JSON, so it
 * doubles as the autosave.
 */
export interface RunSnapshot {
  version: 3;
  /** Years elapsed: 0 during turn 1. The game state's turn counter is the same number. */
  turn: number;
  coin: number;
  trust: number;
  resilience: number;
  elements: [string, ElementInstance][];
  jar: number;
  jarCollected: number;
  landed: string[];
  outcomes: [string, ChallengeOutcome][];
  /** The Get ready jobs at the time. */
  prep?: PrepObjective[];
  /** Each phase's area to protect as its forecast drew it (Section 9), by storm id. */
  areas?: [string, string[]][];
  /** The defences built in each phase, by the storm it led to (Section 9). */
  phaseBuilds?: [string, string[]][];
  /** Storms whose phase objective was complete when they landed (Section 12). */
  objectivesComplete?: string[];
}

/** Repairs cost this share of the element's build cost (coins on only). */
export const REPAIR_SHARE = 0.4;

export interface ActionOutcome {
  ok: boolean;
  events: RunEvent[];
  /** Why the action was refused, for the UI to say. */
  reason?: string;
}

/** Why `skipYear` is refused: there is a build to make. */
export const SKIP_REFUSED = "There is still somewhere to build: build to end the year.";

export class ActionRun {
  /** Turns in the run: 25 for 2026 to 2050. */
  readonly totalYears: number;
  readonly climate: ClimateConfig | null;
  /** The storm calendar, in order. */
  readonly schedule: ScheduledChallenge[];
  /** Ids of storms that have resolved. */
  readonly landed = new Set<string>();
  readonly zones: ZoneIndex | null;
  /** Outcome of each resolved storm, by id. */
  readonly outcomes = new Map<string, ChallengeOutcome>();
  /**
   * Each resolved storm recorded for showing (its water depth field and the
   * replay's comparisons; core/stormRecord.ts), by id. Not saved: it is only
   * needed while the storm plays and its Aftermath is open.
   */
  readonly stormRecords = new Map<string, StormRecord>();
  /** Perfect-fit combo bonuses the resolver adds to defence. */
  combos: ComboBonus = new Map();
  /** The board's perfect-fit combos, recomputed after every action and storm. */
  comboState: ComboState;
  readonly houseStars?: { three: number; two: number };
  readonly houseRule?: HouseRule;
  readonly prepConfig?: PrepConfig;
  /** The Get ready jobs for the next storm, done or not. */
  prep: PrepObjective[] = [];
  /** The phase's model-chosen objective, with its picks (core/phaseObjectives.ts), when the level uses one. */
  objective: PhaseObjective | null = null;
  private readonly generateObjectives: boolean;
  private readonly landmarkList: readonly { name: string; q: number; r: number }[];
  /** The opening objective's stretch of coast (its tiles), when the level has one and its places are on the map. */
  readonly openingTiles: ReadonlySet<string> | null;
  /**
   * The run as it stood when each storm's warning began (two years out), by
   * storm id: what "Replay from 2029" rewinds to.
   */
  readonly replaySnapshots = new Map<string, RunSnapshot>();
  /**
   * Each storm's area to protect as its forecast drew it at the start of its
   * phase (the houses it would take then): the result cards' places. By id.
   */
  readonly areas = new Map<string, string[]>();
  /** The defences the player built in each storm's phase, in order, by that storm's id: the result cards' rows. */
  readonly phaseBuilds = new Map<string, string[]>();
  /** Storms whose phase objective had every row done when they landed: result card 1's "Objective complete" badge. */
  readonly objectivesComplete = new Set<string>();
  /** Every action and every new year counts one: Maya speaks at most once per moment. */
  moment = 0;
  // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
  readonly economyEnabled: boolean;
  /** Coin waiting in the jar (coins on only). */
  jar: number;
  /** Everything ever banked from the jar. */
  jarCollected = 0;
  private readonly incomeScale: number;

  constructor(
    readonly state: GameState,
    readonly config: TimelineConfig,
    options: ActionRunOptions = {}
  ) {
    this.totalYears = config.endYear - config.startYear + 1;
    this.economyEnabled = options.economy?.enabled === true;
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    state.economyEnabled = this.economyEnabled;
    // GROWTH_DISABLED_V1: growth and maturity reserved for a future version
    state.growthEnabled = options.growth?.enabled === true;
    // Income goes into the jar (coins on), never straight into Coin; a turn is a year.
    state.autoCollectIncome = false;
    state.maturityField = "matureTurns";
    this.incomeScale = options.economy?.incomeScale ?? 1;
    this.jar = this.economyEnabled ? (options.economy?.jarStart ?? 0) : 0;
    this.climate = options.climate ?? null;
    this.schedule = this.climate ? buildSchedule(this.climate, config.startYear, config.endYear) : [];
    this.zones = options.zones && options.zones.length > 0 ? new ZoneIndex(options.zones) : null;
    this.comboState = computeCombos(state);
    this.combos = this.comboState.bonus;
    this.houseStars = options.houseStars;
    this.houseRule = options.houseRule;
    this.prepConfig = options.prep;
    this.generateObjectives = options.generateObjectives ?? true;
    this.landmarkList = options.landmarks ?? [];
    const region = options.prep?.opening?.region;
    const from = region && options.landmarks?.find((l) => l.name === region.from);
    const to = region && options.landmarks?.find((l) => l.name === region.to);
    this.openingTiles = region && from && to ? stretchTiles(state.placed.values(), { from, to, inland: region.inland, seaward: region.seaward }) : null;
    this.refreshPrep();
    this.notePhaseStart();
  }

  /** At the start of a storm's phase: its area to protect, as the forecast draws it now. */
  private notePhaseStart(): void {
    const next = this.nextChallenge();
    if (!next || this.areas.has(next.id) || this.turnNumber !== this.phaseStart(next)) return;
    this.areas.set(next.id, [...(this.exposureFor(next)?.housesAtRisk ?? [])]);
  }

  /** A build in the phase of the storm to come. */
  private noteBuild(elementId: string): void {
    const next = this.nextChallenge();
    if (!next) return;
    const list = this.phaseBuilds.get(next.id) ?? [];
    list.push(elementId);
    this.phaseBuilds.set(next.id, list);
  }

  /**
   * Sets the Get ready jobs for the next storm, from its exposure as the
   * board stands now. Called when the run starts and when a storm resolves;
   * jobs from the storm that passed are dropped.
   */
  refreshPrep(): PrepObjective[] {
    const next = this.nextChallenge();
    if (!this.prepConfig || !next || !this.zones) {
      this.prep = [];
      return this.prep;
    }
    // Each phase's objective chosen by the hazard model (Section 12).
    if (this.prepConfig.model) {
      this.objective = null;
      this.prep = [];
      if (!this.generateObjectives) return this.prep;
      const region = this.prepConfig.opening?.challengeId === next.id ? this.prepConfig.opening : undefined;
      const landfallTiles = this.zones.keys(LANDFALL_ZONE);
      this.objective = generatePhaseObjective({
        state: this.state,
        zones: this.zones,
        challenge: next,
        storm: { kind: next.kind, strength: next.strength, landfall: this.landfallOf(next) },
        landfallZoneTiles: landfallTiles.length > 0 ? landfallTiles : undefined,
        area: this.exposureFor(next)?.housesAtRisk ?? [],
        // The phase's own builds (5, 10, 10): set as its storm lands, the clock still reads the year before.
        budget: Math.min(this.buildsUntil(next), next.turn - this.phaseStart(next) + 1),
        places: this.prepConfig.places,
        localities: this.landmarkList,
        stretch: region && this.openingTiles
          ? {
              tiles: this.openingTiles,
              place: `between ${region.region.from} and ${region.region.to}`,
              title: region.title,
              pins: [region.region.from, region.region.to].flatMap((name) => this.landmarkList.filter((l) => l.name === name).slice(0, 1))
            }
          : null
      });
      this.prep = this.objective.rows;
      return this.prep;
    }
    // The first storm's own objective, when the level has one (Section 6.3).
    const opening = this.prepConfig.opening;
    if (opening && opening.challengeId === next.id && this.openingTiles) {
      this.prep = openingJobs(opening, this.openingTiles, this.state, this.zones);
      return this.prep;
    }
    const exposure = this.exposureFor(next);
    this.prep = exposure ? generatePrep(next, exposure, this.state, this.zones, this.prepConfig) : [];
    return this.prep;
  }

  snapshot(): RunSnapshot {
    // Through JSON, so nothing in the snapshot shares an object with the live run.
    return JSON.parse(
      JSON.stringify({
        version: 3,
        turn: this.state.turn,
        coin: this.state.coin,
        trust: this.state.trust,
        resilience: this.state.resilience,
        elements: [...this.state.elements],
        jar: this.jar,
        jarCollected: this.jarCollected,
        landed: [...this.landed],
        outcomes: [...this.outcomes],
        prep: this.prep,
        areas: [...this.areas],
        phaseBuilds: [...this.phaseBuilds],
        objectivesComplete: [...this.objectivesComplete]
      } satisfies RunSnapshot)
    ) as RunSnapshot;
  }

  /** Puts the run back to `snapshot`. Replay snapshots taken after it are dropped; those before it stay. */
  restore(snapshot: RunSnapshot): void {
    const copy = JSON.parse(JSON.stringify(snapshot)) as RunSnapshot;
    this.state.elements.clear();
    for (const [key, inst] of copy.elements) this.state.elements.set(key, inst);
    this.state.turn = copy.turn;
    this.state.coin = copy.coin;
    this.state.trust = copy.trust;
    this.state.resilience = copy.resilience;
    this.jar = copy.jar;
    this.jarCollected = copy.jarCollected;
    this.landed.clear();
    for (const id of copy.landed) this.landed.add(id);
    this.outcomes.clear();
    for (const [id, outcome] of copy.outcomes) this.outcomes.set(id, outcome);
    for (const [id, saved] of [...this.replaySnapshots]) if (saved.turn > copy.turn) this.replaySnapshots.delete(id);
    this.comboState = computeCombos(this.state);
    this.combos = this.comboState.bonus;
    // A save from before the model chose objectives (Section 12) holds template rows: choose afresh.
    const savedRowsFit = !!copy.prep && (!this.prepConfig?.model || copy.prep.every((job) => job.templateId.startsWith("model:")));
    if (savedRowsFit) {
      this.prep = copy.prep!;
      this.objective = null;
    } else this.refreshPrep();
    this.areas.clear();
    for (const [id, area] of copy.areas ?? []) this.areas.set(id, area);
    this.phaseBuilds.clear();
    for (const [id, builds] of copy.phaseBuilds ?? []) this.phaseBuilds.set(id, builds);
    this.objectivesComplete.clear();
    for (const id of copy.objectivesComplete ?? []) this.objectivesComplete.add(id);
    this.notePhaseStart();
    this.moment++;
  }

  /** Era 1 runs to the first storm, era 2 to the second, era 3 to 2050. */
  get era(): number {
    return Math.min(3, this.landed.size + 1);
  }

  /**
   * After anything that changed the board: recompute the combos (reporting
   * tiles that just joined one) and mark any Get ready job that is now done.
   */
  private settle(): RunEvent[] {
    const events: RunEvent[] = [];
    const next = computeCombos(this.state);
    for (const joined of newComboMembers(this.comboState, next)) events.push({ type: "combo", ...joined });
    this.comboState = next;
    this.combos = next.bonus;
    if (this.zones) {
      for (const job of this.prep) {
        if (job.done) continue;
        const { current, target } = prepProgress(job, this.state, this.zones);
        if (current < target) continue;
        job.done = true;
        // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
        const reward = this.economyEnabled ? job.reward : 0;
        this.state.coin += reward;
        events.push({ type: "prep_complete", objective: job, reward });
      }
    }
    return events;
  }

  /** The intensity a storm lands at: its fixed strength in zone-defence points. */
  intensityOf(challenge: ScheduledChallenge): number {
    return this.climate ? challengeStrength(this.climate, challenge) * this.climate.intensityPerStrength : 0;
  }

  /** The readiness gauge for the next storm: it resolved against a copy of the board as it stands. */
  readiness(): Readiness | null {
    const challenge = this.nextChallenge();
    return challenge ? this.readinessFor(challenge) : null;
  }

  /** The same prediction for any storm still to come. */
  readinessFor(challenge: ScheduledChallenge): Readiness | null {
    if (!this.climate || !this.zones || this.landed.has(challenge.id)) return null;
    const outcome = resolveChallenge(
      this.state.clone(),
      this.zones,
      challenge.kind,
      this.intensityOf(challenge),
      this.climate.intensityPerStrength,
      this.combos,
      this.houseStars,
      this.houseRule,
      undefined,
      this.landfallOf(challenge)
    );
    return { challenge, strength: challenge.strength, outcome, level: outcome.stars === 3 ? "green" : outcome.stars === 2 ? "amber" : "red" };
  }

  /**
   * What `challenge` would do to each tile if it came on the board as it
   * stands now (core/exposure.ts): the warning heat's source and Get ready's.
   * `withoutDefences` gives the same storm against a board with every
   * defence against it removed, which is what the green shields compare to.
   */
  /**
   * The homes `elementId` built at `coord` now would save from `challenge`:
   * the storm's homes at risk on the board as it stands, less those with the
   * build (the same model the storm runs; 0 when it saves none, or cannot go
   * there). What a build card says (Section 13) and the outside-the-area line.
   */
  protectsHere(challenge: ScheduledChallenge, coord: AxialCoord, elementId: string): number {
    if (!this.climate || !this.zones || this.landed.has(challenge.id) || !this.state.canBuild(coord, elementId)) return 0;
    const before = this.exposureFor(challenge)?.housesAtRisk.length ?? 0;
    const trial = this.state.clone();
    trial.build(coord, elementId, false);
    const site = this.landfallOf(challenge);
    const after = computeExposure(trial, this.zones, challenge.kind, this.intensityOf(challenge), this.climate.intensityPerStrength, {
      combos: computeCombos(trial).bonus,
      houseStars: this.houseStars,
      houseRule: this.houseRule,
      landfallSites: site === null ? null : [site]
    }).housesAtRisk.length;
    return Math.max(0, before - after);
  }

  exposureFor(challenge: ScheduledChallenge, withoutDefences = false): Exposure | null {
    if (!this.climate || !this.zones || this.landed.has(challenge.id)) return null;
    const site = this.landfallOf(challenge);
    return computeExposure(this.state, this.zones, challenge.kind, this.intensityOf(challenge), this.climate.intensityPerStrength, {
      combos: this.combos,
      houseRule: this.houseRule,
      houseStars: this.houseStars,
      withoutDefences,
      landfallSites: site === null ? null : [site]
    });
  }

  /** The water board for this run's map (core/hazardModel.ts). */
  board(): WaterBoard {
    const landfallTiles = this.zones?.keys(LANDFALL_ZONE) ?? [];
    return waterBoard(this.state, landfallTiles.length > 0 ? landfallTiles : undefined);
  }

  /** Where a storm comes ashore (an index into the board's landfall sites): fixed in the data. Null for a flood. */
  landfallOf(challenge: ScheduledChallenge): number | null {
    return challenge.kind === "flood" ? null : landfallSite(this.board(), challenge);
  }

  /** Years until `challenge`, counting this one: 1 in its own year. */
  yearsUntil(challenge: ScheduledChallenge): number {
    return yearsUntil(challenge, this.turnNumber);
  }

  /**
   * The first turn of a storm's phase: the turn after the storm before it
   * resolved (turn 1 for the first). The forecast cone shows then (Section 6).
   */
  phaseStart(challenge: ScheduledChallenge): number {
    const index = this.schedule.findIndex((c) => c.id === challenge.id);
    return index > 0 ? this.schedule[index - 1].turn + 1 : 1;
  }

  /** The forecast cone for a storm still to come, from the hazard model and the board as it stands (core/forecastCone.ts). */
  forecastCone(challenge: ScheduledChallenge): ForecastCone | null {
    if (!this.climate || !this.zones || this.landed.has(challenge.id)) return null;
    const lost = this.exposureFor(challenge)?.housesAtRisk ?? [];
    const landfallTiles = this.zones.keys(LANDFALL_ZONE);
    return forecastCone(challenge.id, this.state, this.board(), { kind: challenge.kind, strength: challenge.strength, landfall: this.landfallOf(challenge) }, lost, {
      landfallZoneTiles: landfallTiles.length > 0 ? landfallTiles : undefined
    });
  }

  /** The next storm that has not resolved yet, or null after the last. */
  nextChallenge(): ScheduledChallenge | null {
    return this.schedule.find((challenge) => !this.landed.has(challenge.id)) ?? null;
  }

  /** The turn now, 1 to 25 (26 once the run is over). */
  get turnNumber(): number {
    return this.state.turn + 1;
  }

  /** The calendar year now. */
  get year(): number {
    return this.config.startYear + Math.min(this.state.turn, this.totalYears - 1);
  }

  get label(): string {
    return String(this.year);
  }

  get finished(): boolean {
    return this.state.turn >= this.totalYears;
  }

  /** Builds until `challenge` hits, counting this year's: it hits straight after the last of them. */
  buildsUntil(challenge: ScheduledChallenge): number {
    return this.yearsUntil(challenge);
  }

  /**
   * Whether anything at all can be built anywhere on the board now. While it
   * can, the only way to end a year is to build; `skipYear` is for the case
   * where it cannot.
   */
  canBuildAnywhere(): boolean {
    for (const tile of this.state.placed.values()) if (this.state.buildableAt(tile.coord).length > 0) return true;
    return false;
  }

  /** What the city earns in a year at its current income, at the level's scale: the jar (coins on) and the finale's Livelihoods. */
  get income(): number {
    return Math.max(0, this.state.income) * this.incomeScale;
  }

  /** Builds `elementId` at `coord`. It ends the year: a storm due this year resolves straight after it. */
  build(coord: AxialCoord, elementId: string): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    if (!this.state.build(coord, elementId, false)) return refuse("Can't build that here.");
    this.noteBuild(elementId);
    this.moment++;
    return { ok: true, events: [...this.settle(), ...this.endYear()] };
  }

  /**
   * Removes something the player built. It is the year's build, as building
   * is, and ends the year. The city's homes cannot be demolished: they are what the
   * player is protecting, and removing one from a storm's path is not saving it.
   */
  demolish(coord: AxialCoord): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    const key = axialKey(coord);
    if (!this.state.elements.has(key)) return refuse("Nothing to demolish.");
    if (!this.canDemolish(coord)) return refuse("The city's homes cannot be demolished.");
    this.state.elements.delete(key);
    this.moment++;
    return { ok: true, events: [...this.settle(), ...this.endYear()] };
  }

  /**
   * Whether what stands at `coord` may be demolished: anything the player
   * could have built. The level's homes (excluded from building, levels.json
   * `houses.excludeFromBuild`) are the city's, not the player's.
   */
  canDemolish(coord: AxialCoord): boolean {
    const inst = this.state.elements.get(axialKey(coord));
    return !!inst && !this.state.excludedElements.has(inst.elementId);
  }

  // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
  /** Banks the jar into Coin (coins on only). Returns the whole coins banked. */
  collectJar(): number {
    if (!this.economyEnabled) return 0;
    const coins = Math.floor(this.jar);
    if (coins <= 0) return 0;
    this.jar -= coins;
    this.jarCollected += coins;
    this.state.coin += coins;
    return coins;
  }

  // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
  /** Coin a repair costs (coins on only): a share of the element's build cost. */
  repairCoin(coord: AxialCoord): number {
    if (!this.economyEnabled) return 0;
    const inst = this.state.elements.get(axialKey(coord));
    const def = inst ? ELEMENT_BY_ID.get(inst.elementId) : undefined;
    return def ? Math.ceil(def.buildCost * REPAIR_SHARE) : 0;
  }

  /** Whether the element at `coord` is worn or knocked out, and so can be repaired. */
  needsRepair(coord: AxialCoord): boolean {
    return (this.state.elements.get(axialKey(coord))?.degradeAmount ?? 0) > 0;
  }

  /** Restores a worn defence or a damaged house to full. It is the year's build, and ends the year. */
  repair(coord: AxialCoord): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    const inst = this.state.elements.get(axialKey(coord));
    if (!inst || inst.degradeAmount <= 0) return refuse("Nothing to repair.");
    const coin = this.repairCoin(coord);
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    if (this.economyEnabled && this.state.coin < coin) return refuse("Not enough Coin.");
    this.state.coin -= coin;
    inst.degradeAmount = 0;
    this.moment++;
    return { ok: true, events: [...this.settle(), ...this.endYear()] };
  }

  /**
   * The fallback when nothing can be built anywhere: the year passes without
   * a build. Refused while any build is possible.
   */
  skipYear(): ActionOutcome {
    if (this.finished) return refuse("The run has reached 2050.");
    if (this.canBuildAnywhere()) return refuse(SKIP_REFUSED);
    return { ok: true, events: this.endYear() };
  }

  /**
   * Ends this year: a storm whose year it is resolves first, against the
   * board as it stands; then the next year begins. On the last turn this
   * ends the run.
   */
  protected endYear(): RunEvent[] {
    const events: RunEvent[] = [];
    for (const challenge of this.schedule) {
      if (this.landed.has(challenge.id) || challenge.turn !== this.turnNumber) continue;
      this.landed.add(challenge.id);
      events.push(...this.land(challenge));
    }
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    if (this.economyEnabled) this.jar += this.income;
    this.state.advanceTurn();
    this.moment++;
    if (!this.finished) events.push({ type: "year", turn: this.turnNumber });
    this.notePhaseStart();
    // Two years out, a storm's warning begins: the moment "Replay" rewinds to.
    for (const challenge of this.schedule) {
      if (this.landed.has(challenge.id) || this.finished || this.yearsUntil(challenge) !== HEAT_LEAD_YEARS || this.replaySnapshots.has(challenge.id)) continue;
      this.replaySnapshots.set(challenge.id, this.snapshot());
      events.push({ type: "warning", challenge });
    }
    events.push(...this.settle());
    return events;
  }

  /** A storm resolves against the board. */
  protected land(challenge: ScheduledChallenge): RunEvent[] {
    const events: RunEvent[] = [];
    // The objective is judged as the storm comes, before it takes anything: optional, it never changes the outcome.
    if (this.zones && this.prep.length > 0 && this.prep.every((job) => job.challengeId === challenge.id && prepProgress(job, this.state, this.zones!).done)) this.objectivesComplete.add(challenge.id);
    if (!this.zones || !this.climate) {
      events.push({ type: "challenge", challenge, outcome: null });
    } else {
      const record = resolveStorm(this.state, {
        zones: this.zones,
        kind: challenge.kind,
        intensity: this.intensityOf(challenge),
        strengthUnit: this.climate.intensityPerStrength,
        combos: this.combos,
        houseStars: this.houseStars,
        houseRule: this.houseRule,
        landfall: this.landfallOf(challenge)
      });
      this.outcomes.set(challenge.id, record.outcome);
      this.stormRecords.set(challenge.id, record);
      events.push({ type: "challenge", challenge, outcome: record.outcome });
    }
    // The next storm is announced: new Get ready jobs for it.
    const jobs = this.refreshPrep();
    if (jobs.length > 0) events.push({ type: "prep_new", objectives: jobs });
    return events;
  }
}

function refuse(reason: string): ActionOutcome {
  return { ok: false, events: [], reason };
}
