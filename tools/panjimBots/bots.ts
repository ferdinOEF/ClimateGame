/**
 * Headless bot players for Panjim 2050: the verification that matters.
 *
 * Each bot plays the real rules (`ActionRun` and everything under it, the
 * same classes the browser runs), on the real Panaji board, with the
 * monuments reserved exactly as in a session. Nothing here re-implements a
 * rule; a bot only decides which action to take next, through the same calls
 * a click makes.
 *
 * Personas (from the brief):
 *   casual  random valid actions, ignores the Outlook.
 *   greedy  maximises Coin: Resorts, Small Dams, Sand Mining, Houses;
 *           fast-forwards when broke.
 *   smart   reads the Outlook: long-lead defences early, tops up the
 *           threatened zones before each challenge, answers Voices, builds
 *           combos, repairs.
 *   rusher  only fast-forwards (the "skip years" exploit).
 *   banker  banks coin by fast-forwarding, and only builds once a Forecast
 *           has locked.
 *
 * A human-time model turns each run into an estimated real duration: fixed
 * animation and time-lapse lengths, about 2.5 s a decision, and 5 s of
 * reading for each Outlook change, Forecast lock and Aftermath.
 */
import { ActionRun, type RunEvent } from "../../src/core/actionRun";
import { GameState } from "../../src/core/gameState";
import { ELEMENT_BY_ID } from "../../src/core/elements";
import { axialKey, neighbor, type AxialCoord } from "../../src/core/hex";
import { FRONTS, ZoneIndex } from "../../src/core/zones";
import { outlookFor } from "../../src/core/climate";
import { computePanjimIndex } from "../../src/core/panjimIndex";
import { voiceProgress } from "../../src/core/voices";
import { hashSeed, Rng } from "../../src/core/rng";
import { activeVoices, levelWithPreset, type LevelDef } from "../../src/levels/levels";
import { boardSetup } from "../../src/levels/balance";
import { mapById } from "../../src/levels/levelMap";

export type Persona = "casual" | "greedy" | "smart" | "rusher" | "banker" | "walls" | "mangroves";
export const PERSONAS: Persona[] = ["casual", "greedy", "smart", "rusher", "banker"];

export interface BotResult {
  persona: Persona;
  seed: string;
  stars: number[];
  protection: number[];
  /** Houses in each storm's path: how many were saved, out of how many. */
  houses: { saved: number; total: number }[];
  index: number;
  /** The index's five parts. */
  components: { resilience: number; biodiversity: number; livelihoods: number; population: number; food: number };
  score: number;
  /** Time-costing decisions that changed the board: builds, repairs, demolitions. */
  decisions: number;
  fastForwardQuarters: number;
  jarTaps: number;
  voicesAnswered: number;
  /** Estimated real milliseconds for a human playing the same moves. */
  estimatedMs: number;
  /** Estimated real milliseconds at which the second challenge's Aftermath closes. */
  checkpoint2Ms: number;
  /** Estimated milliseconds to the first action and the first reward. */
  firstActionMs: number;
  firstRewardMs: number;
}

/** The human-time model. Animation lengths match the session's (panjimController.ts). */
export const TIME = {
  briefRead: 8000,
  decision: 2500,
  jarTap: 1000,
  tickAction: 170,
  tickLapse: 420,
  reading: 5000,
  /** Staging: arrival beat, 1.3 s a zone, 1.3 s extra for the slow-motion save, the outro. */
  stagePerZone: 1300,
  stageFixed: 500 + 1300 + 500,
  finale: 3800 + 5000
};

export type Preset = "strict" | "easy-test";

/** Panaji under each balance preset, built once. The tuning sweeps mutate these to try other numbers. */
export const BOT_LEVELS: Record<Preset, LevelDef> = {
  strict: levelWithPreset("l01-first-rains", "strict")!,
  "easy-test": levelWithPreset("l01-first-rains", "easy-test")!
};
const MAP = mapById("panaji")!;
const ZONES = new ZoneIndex(MAP.zones);
const RESERVED = new Set(MAP.monuments.map((m) => `${m.q},${m.r}`));

function coordOf(key: string): AxialCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/** The same board the session builds: monuments reserved, the level's houses, exclusions and sea limit applied. */
export function newRun(seed: string, level: LevelDef): ActionRun {
  const setup = boardSetup(level, MAP);
  const state = new GameState(MAP.tiles, setup.startingElements, level.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  for (const key of RESERVED) state.reserved.add(key);
  return new ActionRun(state, level.timeline!, { climate: level.climate, seed, zones: MAP.zones, voices: activeVoices(level), houseStars: level.houseStars, houseRule: level.houses?.rule, prep: level.prep });
}

class Player {
  readonly run: ActionRun;
  readonly rng: Rng;
  ms = TIME.briefRead;
  decisions = 0;
  ffQuarters = 0;
  jarTaps = 0;
  voicesAnswered = 0;
  checkpoint2Ms = 0;
  firstActionMs = -1;
  firstRewardMs = -1;
  private phaseSeen = new Map<string, string>();

  constructor(readonly persona: Persona, readonly seed: string, readonly preset: Preset = "strict") {
    this.run = newRun(seed, BOT_LEVELS[preset]);
    this.rng = new Rng(hashSeed(`${persona}:${seed}`));
  }

  get state(): GameState {
    return this.run.state;
  }

  // ---- actions, with their human time ------------------------------------

  tapJar(): void {
    const coins = this.run.collectJar();
    if (coins <= 0) return;
    this.jarTaps++;
    this.ms += TIME.jarTap;
    this.reward();
  }

  private reward(): void {
    if (this.firstRewardMs < 0) this.firstRewardMs = this.ms;
  }

  build(coord: AxialCoord, elementId: string): boolean {
    const outcome = this.run.build(coord, elementId);
    if (!outcome.ok) return false;
    this.decisions++;
    this.ms += TIME.decision + outcome.quarters * TIME.tickAction;
    if (this.firstActionMs < 0) this.firstActionMs = this.ms;
    this.events(outcome.events);
    return true;
  }

  repair(coord: AxialCoord): boolean {
    const outcome = this.run.repair(coord);
    if (!outcome.ok) return false;
    this.decisions++;
    this.ms += TIME.decision + outcome.quarters * TIME.tickAction;
    this.events(outcome.events);
    return true;
  }

  fastForwardYear(): void {
    const outcome = this.run.fastForwardYear();
    if (!outcome.ok) return;
    this.ffQuarters += outcome.quarters;
    this.ms += 1000 + outcome.quarters * TIME.tickLapse;
    if (this.firstActionMs < 0) this.firstActionMs = this.ms;
    this.events(outcome.events);
  }

  private events(events: RunEvent[]): void {
    for (const event of events) {
      if (event.type === "challenge") {
        const zones = event.outcome?.zones.length ?? 1;
        this.ms += TIME.stageFixed + zones * TIME.stagePerZone + TIME.reading; // staging + Aftermath read
        if (this.run.landed.size === 2) this.checkpoint2Ms = this.ms;
      } else if (event.type === "forecast_lock") {
        this.ms += TIME.reading;
      } else if (event.type === "combo" || event.type === "voice_complete") {
        if (event.type === "voice_complete") this.voicesAnswered++;
        this.reward();
      }
    }
    // Reading the Outlook when a marker changes phase (far to near).
    if (!this.run.climate) return;
    for (const challenge of this.run.schedule) {
      const phase = outlookFor(this.run.climate, challenge, this.run.quarter, this.run.config.startYear).phase;
      const before = this.phaseSeen.get(challenge.id);
      if (before && before !== phase && phase === "near") this.ms += TIME.reading;
      this.phaseSeen.set(challenge.id, phase);
    }
  }

  // ---- board queries ---------------------------------------------------------

  /** Tiles in `zoneId` (or anywhere) where `elementId` can be built now, best first: next to `near` element ids when given. */
  spots(elementId: string, zoneId: string | null, near: string[] = []): AxialCoord[] {
    const keys = zoneId ? ZONES.keys(zoneId) : [...this.state.placed.keys()];
    const out: { coord: AxialCoord; score: number }[] = [];
    for (const key of keys) {
      const coord = coordOf(key);
      if (!this.state.canBuild(coord, elementId)) continue;
      let score = 0;
      for (let dir = 0; dir < 6; dir++) {
        const id = this.state.elements.get(axialKey(neighbor(coord, dir)))?.elementId;
        if (id && near.includes(id)) score++;
      }
      out.push({ coord, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.map((entry) => entry.coord);
  }

  /** Land tiles outside every challenge zone: where a careful player puts houses. */
  safeHouseSpot(): AxialCoord | null {
    for (const tile of this.state.placed.values()) {
      const key = axialKey(tile.coord);
      if (ZONES.zoneOf(key)) continue;
      if (this.state.canBuild(tile.coord, "house")) return tile.coord;
    }
    return null;
  }

  result(): BotResult {
    const outcomes = this.run.schedule.map((c) => this.run.outcomes.get(c.id)!).filter(Boolean);
    const index = computePanjimIndex({ state: this.state, outcomes, incomePerQuarter: this.run.incomePerQuarter, coinMultiplier: this.run.config.economy?.coinMultiplier });
    return {
      persona: this.persona,
      seed: this.seed,
      stars: outcomes.map((o) => o.stars),
      protection: outcomes.map((o) => Number(o.protection.toFixed(3))),
      houses: outcomes.map((o) => ({ saved: o.housesSaved, total: o.housesTotal })),
      index: index.index,
      components: {
        resilience: index.resilience,
        biodiversity: index.biodiversity,
        livelihoods: index.livelihoods,
        population: index.population,
        food: index.food
      },
      score: index.score,
      decisions: this.decisions,
      fastForwardQuarters: this.ffQuarters,
      jarTaps: this.jarTaps,
      voicesAnswered: this.voicesAnswered,
      estimatedMs: this.ms + TIME.finale,
      checkpoint2Ms: this.checkpoint2Ms,
      firstActionMs: this.firstActionMs,
      firstRewardMs: this.firstRewardMs
    };
  }
}

// ---- personas ------------------------------------------------------------------

const ALL_BUILDABLE = ["dune", "sandy_vegetation", "beachside_resort", "house", "seawall", "mangrove", "khazan", "small_dam", "sand_mining", "breakwater"];

function playCasual(p: Player): void {
  while (!p.run.finished) {
    if (p.rng.next() < 0.5) p.tapJar();
    const roll = p.rng.next();
    if (roll < 0.22) {
      p.fastForwardYear();
      continue;
    }
    const elementId = p.rng.pick(ALL_BUILDABLE);
    const spots = p.spots(elementId, null);
    if (spots.length === 0 || !p.build(p.rng.pick(spots.slice(0, 200)), elementId)) p.fastForwardYear();
  }
}

/** Coin per quarter for each Coin spent, the Greedy bot's only measure. */
function moneyPerCoin(elementId: string): number {
  const def = ELEMENT_BY_ID.get(elementId)!;
  return (def.effects.money ?? 0) / def.buildCost;
}

function playGreedy(p: Player): void {
  const ranked = ["sand_mining", "small_dam", "house", "beachside_resort", "khazan", "mangrove"].sort((a, b) => moneyPerCoin(b) - moneyPerCoin(a));
  while (!p.run.finished) {
    p.tapJar();
    let built = false;
    for (const elementId of ranked) {
      const spots = p.spots(elementId, null);
      if (spots.length === 0) continue;
      if (p.build(p.rng.pick(spots.slice(0, 40)), elementId)) {
        built = true;
        break;
      }
    }
    if (!built) p.fastForwardYear();
  }
}

function playRusher(p: Player): void {
  while (!p.run.finished) p.fastForwardYear();
}

/**
 * What a careful player wants on the board for a challenge: per zone on its
 * path, the defences that answer it, in preference order, with the neighbours
 * that make a combo.
 */
function wishesFor(kind: "cyclone" | "flood" | "compound"): { zone: string; element: string; near: string[] }[] {
  const out: { zone: string; element: string; near: string[] }[] = [];
  for (const front of FRONTS[kind]) {
    for (const zone of front.path) {
      if (front.hazard === "cyclone") {
        out.push({ zone, element: "dune", near: ["sandy_vegetation", "dune"] });
        out.push({ zone, element: "sandy_vegetation", near: ["dune"] });
        out.push({ zone, element: "mangrove", near: ["mangrove"] });
        out.push({ zone, element: "breakwater", near: [] });
      } else {
        out.push({ zone, element: "mangrove", near: ["mangrove", "khazan"] });
        out.push({ zone, element: "khazan", near: ["mangrove"] });
      }
    }
  }
  return out;
}

/** One careful decision: repair, answer a Voice, prepare for the next storm, look further ahead, grow income. Returns false when nothing was worth doing. */
function smartStep(p: Player, opts: { lookahead: boolean; houses: number; grow?: boolean; only?: string[] }): boolean {
  const run = p.run;
  p.tapJar();
  // Repair anything worn or damaged.
  for (const [key, inst] of p.state.elements) {
    if (inst.degradeAmount > 0 && p.repair(coordOf(key))) return true;
  }
  // A little income early.
  const houses = [...p.state.elements.values()].filter((inst) => inst.elementId === "house").length;
  if (houses < opts.houses) {
    const spot = p.safeHouseSpot();
    if (spot && p.build(spot, "house")) return true;
  }
  // Answer a Voice when it is one build away.
  for (const voice of run.activeVoices()) {
    if (voice.goal.type !== "standing") continue;
    const { current, target } = voiceProgress(voice.goal, p.state, run.zones, run.comboState);
    if (target - current !== 1) continue;
    const spots = p.spots(voice.goal.elementId, voice.goal.zone ?? null, [voice.goal.elementId]);
    if (spots.length > 0 && p.build(spots[0], voice.goal.elementId)) return true;
  }
  // The next challenge, while it is not yet green.
  const readiness = run.readiness();
  if (readiness && readiness.level !== "green") {
    for (const wish of opts.only ? onlyWishes(readiness.challenge.kind, opts.only) : wishesFor(readiness.challenge.kind)) {
      const spots = p.spots(wish.element, wish.zone, wish.near);
      if (spots.length > 0 && p.build(spots[0], wish.element)) return true;
    }
  }
  // Long-lead planting for the challenges after it: mangroves take five years.
  if (opts.lookahead) {
    const next = run.nextChallenge();
    for (const challenge of run.schedule) {
      if (!next || challenge.quarter <= next.quarter || run.landed.has(challenge.id)) continue;
      const preview = run.readinessFor(challenge);
      if (preview && preview.level === "green") continue;
      for (const wish of wishesFor(challenge.kind)) {
        if (wish.element !== "mangrove" && wish.element !== "khazan") continue;
        const spots = p.spots(wish.element, wish.zone, wish.near);
        if (spots.length > 0 && p.build(spots[0], wish.element)) return true;
      }
    }
  }
  // Then the city itself, while Coin allows and a reserve stays for
  // repairs: homes away from the storm paths (population, livelihoods), and
  // khazan and mangroves in the wetlands (food, wildlife, flood defence).
  if (opts.grow && p.state.coin > 120) {
    const homes = [...p.state.elements.values()].filter((inst) => inst.elementId === "house").length;
    const growers: [string, string | null, string[]][] = [
      ["khazan", "z2", ["mangrove"]],
      ["mangrove", "z2", ["mangrove", "khazan"]]
    ];
    if (homes < 20 && p.state.food >= 0) {
      const spot = p.safeHouseSpot();
      if (spot && p.build(spot, "house")) return true;
    }
    for (const [element, zone, near] of growers) {
      const spots = p.spots(element, zone, near);
      if (spots.length > 0 && p.build(spots[0], element)) return true;
    }
  }
  return false;
}

/** A monoculture's wishes: only its own elements, in every zone on the path. */
function onlyWishes(kind: "cyclone" | "flood" | "compound", only: string[]): { zone: string; element: string; near: string[] }[] {
  const out: { zone: string; element: string; near: string[] }[] = [];
  for (const front of FRONTS[kind]) for (const zone of front.path) for (const element of only) out.push({ zone, element, near: [element] });
  return out;
}

/** "Walls": a careful player who only ever builds engineered defences. One of the two monocultures that must not dominate. */
function playWalls(p: Player): void {
  while (!p.run.finished) {
    if (!smartStep(p, { lookahead: false, houses: 8, only: ["seawall", "breakwater", "small_dam"] })) p.fastForwardYear();
  }
}

/** "Mangroves": a careful player who only ever plants mangroves. */
function playMangroves(p: Player): void {
  while (!p.run.finished) {
    if (!smartStep(p, { lookahead: false, houses: 8, only: ["mangrove"] })) p.fastForwardYear();
  }
}

function playSmart(p: Player): void {
  while (!p.run.finished) {
    if (!smartStep(p, { lookahead: true, houses: 8, grow: true })) p.fastForwardYear();
  }
}

function playBanker(p: Player): void {
  while (!p.run.finished) {
    p.tapJar();
    const next = p.run.nextChallenge();
    const locked = next ? p.run.locked.has(next.id) : true;
    if (!locked) {
      p.fastForwardYear();
      continue;
    }
    if (!smartStep(p, { lookahead: false, houses: 0 })) p.fastForwardYear();
  }
}

const PLAY: Record<Persona, (p: Player) => void> = {
  casual: playCasual,
  greedy: playGreedy,
  smart: playSmart,
  rusher: playRusher,
  banker: playBanker,
  walls: playWalls,
  mangroves: playMangroves
};

/** The two single-trick strategies, for the "no single strategy dominates" check. */
export const MONOCULTURES: Persona[] = ["walls", "mangroves"];

export function runBot(persona: Persona, seed: string, preset: Preset = "strict"): BotResult {
  const player = new Player(persona, seed, preset);
  PLAY[persona](player);
  return player.result();
}

export const SEEDS = Array.from({ length: 20 }, (_, i) => `bot-seed-${i + 1}`);

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

/** Houses in each storm's path that were saved, and how many there were, per storm. */
export function housesOf(result: BotResult): { saved: number; total: number }[] {
  return result.houses;
}
