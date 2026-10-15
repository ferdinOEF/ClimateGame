/**
 * Headless bot players for Panjim 2050: the verification that matters.
 *
 * Each bot plays the real rules (`ActionRun` and everything under it, the
 * same classes the browser runs), on the real Panaji board, with the
 * monuments reserved exactly as in a session. Nothing here re-implements a
 * rule; a bot only decides which action to take next, through the same calls
 * a click makes.
 *
 * Personas (Section 4's archetypes; see "personas" below):
 *   casual  builds a little, late, on the obvious spot; never simulates.
 *   greedy  maximises income first, defends late; how greedy is drawn per run.
 *   smart   reads the forecast, defends where the warning says, keeps a reserve.
 *   rusher  only fast-forwards: the do-nothing control.
 *
 * A human-time model turns each run into an estimated real duration: fixed
 * animation and time-lapse lengths, about 2.5 s a decision, and 5 s of
 * reading for each Outlook change, Forecast lock and Aftermath.
 */
import { ActionRun, type RunEvent } from "../../src/core/actionRun";
import { GameState } from "../../src/core/gameState";
import { ELEMENT_BY_ID } from "../../src/core/elements";
import { axialKey, neighbor, type AxialCoord } from "../../src/core/hex";
import { resolveChallenge, ZoneIndex } from "../../src/core/zones";
import { computeCombos } from "../../src/core/combos";
import { computeWater, floodsHouse, HAZARD_MODEL, LANDFALL_ZONE } from "../../src/core/hazardModel";
import type { ChallengeKind, ScheduledChallenge } from "../../src/core/climate";
import { computePanjimIndex } from "../../src/core/panjimIndex";
import { hashSeed, Rng } from "../../src/core/rng";
import { LEVEL_BY_ID, type LevelDef } from "../../src/levels/levels";
import { boardSetup } from "../../src/levels/balance";
import { mapById } from "../../src/levels/levelMap";

export type Persona = "casual" | "greedy" | "smart" | "rusher";
export const PERSONAS: Persona[] = ["casual", "greedy", "smart", "rusher"];

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
  /** Builds per element id. */
  built: Record<string, number>;
  /** Years ended with builds unused. */
  yearsWithBuildsLeft: number;
  jarTaps: number;
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

/**
 * Panaji as played (one baseline since Section 4). This is the game's own
 * level object: the tuning sweeps (sweep.ts, sweepIncome.ts) change its
 * numbers inside their own process only, never the data on disk.
 */
export const BOT_LEVEL: LevelDef = LEVEL_BY_ID.get("l01-first-rains")!;
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
  // The seed varies only the bots' own choices: the game's calendar, strengths and landfall are fixed.
  void seed;
  return new ActionRun(state, level.timeline!, {
    climate: level.climate,
    zones: MAP.zones,
    houseStars: level.houseStars,
    houseRule: level.houses?.rule,
    prep: level.prep,
    economy: level.economy,
    growth: level.growth
  });
}

export type LoggedAction = { type: "tap" } | { type: "next" } | { type: "build"; coord: AxialCoord; elementId: string } | { type: "repair"; coord: AxialCoord };

class Player {
  readonly run: ActionRun;
  readonly rng: Rng;
  ms = TIME.briefRead;
  decisions = 0;
  /** Builds per element id, for the balance report. */
  readonly built: Record<string, number> = {};
  /** Every action that went through, in order, so a run can be replayed (the per-element margin). */
  readonly log: LoggedAction[] = [];
  yearsWithBuildsLeft = 0;
  jarTaps = 0;
  checkpoint2Ms = 0;
  firstActionMs = -1;
  firstRewardMs = -1;
  constructor(readonly persona: Persona, readonly seed: string, readonly level: LevelDef = BOT_LEVEL) {
    this.run = newRun(seed, level);
    this.rng = new Rng(hashSeed(`${persona}:${seed}`));
  }

  get state(): GameState {
    return this.run.state;
  }

  // ---- actions, with their human time ------------------------------------

  tapJar(): void {
    const coins = this.run.collectJar();
    if (coins <= 0) return;
    this.log.push({ type: "tap" });
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
    this.built[elementId] = (this.built[elementId] ?? 0) + 1;
    this.log.push({ type: "build", coord, elementId });
    this.decisions++;
    this.ms += TIME.decision + TIME.tickAction;
    if (this.firstActionMs < 0) this.firstActionMs = this.ms;
    this.events(outcome.events);
    return true;
  }

  repair(coord: AxialCoord): boolean {
    const outcome = this.run.repair(coord);
    if (!outcome.ok) return false;
    this.log.push({ type: "repair", coord });
    this.decisions++;
    this.ms += TIME.decision + TIME.tickAction;
    this.events(outcome.events);
    return true;
  }

  /** Presses Next year. */
  nextYear(): void {
    if (this.run.buildsLeft > 0) this.yearsWithBuildsLeft++;
    const outcome = this.run.nextYear();
    if (!outcome.ok) return;
    this.log.push({ type: "next" });
    this.ms += 1000 + TIME.tickLapse;
    if (this.firstActionMs < 0) this.firstActionMs = this.ms;
    this.events(outcome.events);
  }

  private events(events: RunEvent[]): void {
    for (const event of events) {
      if (event.type === "challenge") {
        const zones = event.outcome?.zones.length ?? 1;
        this.ms += TIME.stageFixed + zones * TIME.stagePerZone + TIME.reading; // staging + Aftermath read
        if (this.run.landed.size === 2) this.checkpoint2Ms = this.ms;
      } else if (event.type === "warning") {
        this.ms += TIME.reading;
      } else if (event.type === "combo") {
        this.reward();
      }
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
    const index = computePanjimIndex({ state: this.state, outcomes, income: this.run.income });
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
      yearsWithBuildsLeft: this.yearsWithBuildsLeft,
      jarTaps: this.jarTaps,
      estimatedMs: this.ms + TIME.finale,
      checkpoint2Ms: this.checkpoint2Ms,
      firstActionMs: this.firstActionMs,
      firstRewardMs: this.firstRewardMs,
      built: { ...this.built }
    };
  }
}

// ---- personas ------------------------------------------------------------------
//
// Section 4's archetypes, all playing the real rules through ActionRun:
//   casual    builds a little, late: a few random defences once a storm is near.
//   greedy    maximises income (resorts, sand mining, dams) and defends only in
//             the last quarters before a storm; how greedy is drawn per run,
//             so it is a gamble: sometimes ahead of Casual, often far behind.
//   smart     reads the forecast: defends where the warning says the water will
//             come, ranking each candidate by the houses it actually saves (the
//             same resolver, on a copy of the board), plants slow-growing
//             mangroves and khazans early, and keeps a reserve.
//   rusher    the do-nothing control: only fast-forwards.

const DEFENCES = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"];
const INCOME = ["sand_mining", "small_dam", "beachside_resort"];

function hazardsOfKind(kind: ChallengeKind): string[] {
  return kind === "compound" ? ["cyclone", "flood"] : [kind];
}

function answers(elementId: string, kind: ChallengeKind): boolean {
  const def = ELEMENT_BY_ID.get(elementId)!;
  return (def.effects.resilience ?? 0) > 0 && !!def.targetsHazards?.some((h) => hazardsOfKind(kind).includes(h));
}

/** Tiles within `radius` hexes of any of `keys`. */
function around(keys: Iterable<string>, radius: number): Set<string> {
  const out = new Set<string>();
  let frontier = [...keys];
  for (const key of frontier) out.add(key);
  for (let ring = 0; ring < radius; ring++) {
    const next: string[] = [];
    for (const key of frontier) {
      for (let dir = 0; dir < 6; dir++) {
        const n = axialKey(neighbor(coordOf(key), dir));
        if (out.has(n)) continue;
        out.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * What `challenge` would do if it landed at its forecast centre on the board
 * as it stands with `extra` built now: houses lost, and how deep the water
 * stands over the house-loss line on the houses at risk (so a build that
 * lowers the water without yet saving a house still counts; a careful player
 * knows two or three defences together save a street). The same water model
 * the game resolves storms with.
 */
function lossesWith(p: Player, challenge: ScheduledChallenge, extra: { key: string; elementId: string } | null): { lost: number; excess: number } {
  const run = p.run;
  const board = run.state.clone();
  if (extra) board.elements.set(extra.key, { elementId: extra.elementId, builtOnTurn: run.state.turn, degradeAmount: 0, floodBufferFilled: 0 });
  const strength = challenge.strength;
  const site = run.landfallOf(challenge);
  const water = computeWater(board, { kind: challenge.kind, strength, landfall: site }, { combos: computeCombos(board).bonus, landfallZoneTiles: ZONES.keys(LANDFALL_ZONE) });
  let lost = 0;
  let excess = 0;
  for (const [key, inst] of board.elements) {
    if (inst.elementId !== "house" || inst.degradeAmount >= 1) continue;
    const d = water.depth.get(key) ?? 0;
    if (floodsHouse(d)) {
      lost++;
      excess += d - HAZARD_MODEL.houseLossDepthM;
    }
  }
  return { lost, excess };
}

/**
 * The best defence to build now against `challenge`: candidates on and around
 * the tiles the warning shows at risk, each scored by the houses it saves per
 * Coin. Null when nothing affordable saves a house.
 */
function bestDefence(p: Player, challenge: ScheduledChallenge, maxCoin: number, longLeadOnly = false, perCoin = true, skip: string | null = null, only: string | null = null): { coord: AxialCoord; elementId: string; saves: number } | null {
  const exposure = p.run.exposureFor(challenge);
  if (!exposure || exposure.housesAtRisk.length === 0) return null;
  const near = around([...exposure.housesAtRisk, ...exposure.exposure.keys()], 1);
  const candidates: { key: string; elementId: string; score: number }[] = [];
  const risk = new Set(exposure.housesAtRisk);
  for (const key of near) {
    const coord = coordOf(key);
    for (const elementId of DEFENCES) {
      if (elementId === skip || (only && elementId !== only) || !answers(elementId, challenge.kind)) continue;
      if (longLeadOnly && !["mangrove", "khazan"].includes(elementId)) continue;
      const def = ELEMENT_BY_ID.get(elementId)!;
      if (def.buildCost > maxCoin || !p.state.canBuild(coord, elementId)) continue;
      let score = 0;
      for (const n of around([key], 2)) if (risk.has(n)) score++;
      candidates.push({ key, elementId, score: (score + (exposure.exposure.get(key) ?? 0)) / def.buildCost });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  // The best few of each kind, so a strong but dear defence is weighed too.
  const shortlist: typeof candidates = [];
  const perKind = new Map<string, number>();
  for (const c of candidates) {
    if ((perKind.get(c.elementId) ?? 0) >= 3) continue;
    perKind.set(c.elementId, (perKind.get(c.elementId) ?? 0) + 1);
    shortlist.push(c);
  }
  const base = lossesWith(p, challenge, null);
  let best: { coord: AxialCoord; elementId: string; saves: number; value: number } | null = null;
  for (const c of shortlist) {
    const after = lossesWith(p, challenge, c);
    const saves = base.lost - after.lost;
    // A house saved is worth a lot; water taken off the houses at risk (in metres) counts too.
    const gain = saves * 4 + (base.excess - after.excess);
    const value = perCoin ? gain / ELEMENT_BY_ID.get(c.elementId)!.buildCost : gain;
    if (gain > 0.5 && (!best || value > best.value)) best = { coord: coordOf(c.key), elementId: c.elementId, saves, value };
  }
  return best;
}

function playCasual(p: Player): void {
  // Builds a little, late: from about four and a half years before a storm, now and
  // then a defence on the obvious spot, next to the most red houses it can
  // afford to cover. It never checks what a build actually saves.
  while (!p.run.finished) {
    if (p.rng.next() < 0.6) p.tapJar();
    const next = p.run.nextChallenge();
    const near = next ? p.run.yearsUntil(next) <= 4 : false;
    if (!next || !near || p.rng.next() < 0.15) {
      p.nextYear();
      continue;
    }
    const exposure = p.run.exposureFor(next);
    if (!exposure || exposure.housesAtRisk.length === 0) {
      p.nextYear();
      continue;
    }
    const risk = new Set(exposure.housesAtRisk);
    let best: { coord: AxialCoord; id: string; score: number } | null = null;
    for (const key of around(exposure.exposure.keys(), 1)) {
      const coord = coordOf(key);
      let red = 0;
      for (const n of around([key], 2)) if (risk.has(n)) red++;
      if (red === 0) continue;
      for (const id of DEFENCES) {
        if (!answers(id, next.kind) || ELEMENT_BY_ID.get(id)!.buildCost > p.state.coin || !p.state.canBuild(coord, id)) continue;
        const score = red + p.rng.next();
        if (!best || score > best.score) best = { coord, id, score };
      }
    }
    if (!best || !p.build(best.coord, best.id)) p.nextYear();
  }
}

/** Hex distance from `c` to the nearest of `targets` (99 if none). */
function nearest(c: AxialCoord, targets: AxialCoord[]): number {
  let best = 99;
  for (const t of targets) best = Math.min(best, (Math.abs(c.q - t.q) + Math.abs(c.r - t.r) + Math.abs(c.q + c.r - t.q - t.r)) / 2);
  return best;
}

/** Coin per quarter for each Coin spent, the Greedy bot's only measure. */
function moneyPerCoin(elementId: string): number {
  const def = ELEMENT_BY_ID.get(elementId)!;
  return (def.effects.money ?? 0) / def.buildCost;
}

function playGreedy(p: Player): void {
  const ranked = [...INCOME].sort((a, b) => moneyPerCoin(b) - moneyPerCoin(a));
  // How greedy, drawn per run: the greediest builds three dozen money-makers
  // and defends only in the last two quarters before a storm; the least
  // greedy, eight, and from two years out. A gamble that sometimes pays.
  const greed = p.rng.next();
  const incomeCap = Math.round(8 + 28 * greed);
  const window = Math.round(2 - greed);
  let incomeBuilds = 0;
  while (!p.run.finished) {
    p.tapJar();
    const next = p.run.nextChallenge();
    // Defends late: only in the last few quarters before a storm.
    if (next && p.run.yearsUntil(next) <= window) {
      const pick = bestDefence(p, next, p.state.coin, false, false);
      if (pick && p.build(pick.coord, pick.elementId)) continue;
    }
    // Income first, up to its cap of money-makers; then it banks and waits for the storms.
    let built = false;
    if (incomeBuilds < incomeCap) {
      for (const elementId of ranked) {
        const spots = p.spots(elementId, null);
        if (spots.length === 0) continue;
        if (p.build(p.rng.pick(spots.slice(0, 40)), elementId)) {
          built = true;
          incomeBuilds++;
          break;
        }
      }
    }
    if (!built) p.nextYear();
  }
}

function playRusher(p: Player): void {
  while (!p.run.finished) p.nextYear();
}

/** Smart, with an optional element left out (the per-element margin test). */
function smartPlayer(skip: string | null, only: string | null = null): (p: Player) => void {
  return (p) => {
    const reserve = 30;
    while (!p.run.finished) {
      p.tapJar();
      let acted = false;
      // Repair worn defences first (a worn one protects less).
      for (const [key, inst] of p.state.elements) {
        if (ELEMENT_BY_ID.get(inst.elementId)?.kind === "building") continue;
        if (p.run.needsRepair(coordOf(key)) && p.state.coin >= p.run.repairCoin(coordOf(key)) + reserve && p.repair(coordOf(key))) {
          acted = true;
          break;
        }
      }
      if (acted) continue;
      // Every storm still to come, nearest first: long-lead defences for the later ones.
      const upcoming = p.run.schedule.filter((c) => !p.run.landed.has(c.id));
      for (const [i, challenge] of upcoming.entries()) {
        const pick = bestDefence(p, challenge, p.state.coin - reserve, i > 0 && !only, true, skip, only);
        if (pick && p.build(pick.coord, pick.elementId)) {
          acted = true;
          break;
        }
      }
      // Nothing worth building: rebuild a lost home, on high ground first.
      if (!acted) {
        for (const [key, inst] of p.state.elements) {
          if (inst.elementId !== "house" || !p.run.needsRepair(coordOf(key))) continue;
          if (p.state.coin >= p.run.repairCoin(coordOf(key)) + reserve && p.repair(coordOf(key))) {
            acted = true;
            break;
          }
        }
      }
      if (!acted) p.nextYear();
    }
  };
}

const PLAY: Record<Persona, (p: Player) => void> = {
  casual: playCasual,
  greedy: playGreedy,
  smart: smartPlayer(null),
  rusher: playRusher
};

/** Smart's run on `seed`: its result and every action it took, for replays. */
export function smartRun(seed: string): { result: BotResult; log: LoggedAction[] } {
  const player = new Player("smart", seed);
  smartPlayer(null)(player);
  return { result: player.result(), log: player.log };
}

function smartLog(seed: string): LoggedAction[] {
  return smartRun(seed).log;
}

/**
 * Smart's own run, replayed action for action with every build of
 * `elementId` left out: each of those builds (and any action that no longer
 * applies) is a build slot left unused that year, so every other build keeps
 * its year. The houses this loses is what that element did in Smart's plan,
 * with no re-planning round it.
 */
export function replaySmartWithout(elementId: string, seed: string, log: readonly LoggedAction[] = smartLog(seed)): BotResult {
  const player = new Player("smart", seed);
  for (const action of log) {
    if (player.run.finished) break;
    if (action.type === "tap") player.tapJar();
    else if (action.type === "next") player.nextYear();
    else if (action.type === "build") {
      if (action.elementId !== elementId) player.build(action.coord, action.elementId);
    } else player.repair(action.coord);
  }
  while (!player.run.finished) player.nextYear();
  return player.result();
}

/** Smart building only one kind of defence, for "no single defence dominates". */
export function runSmartOnly(elementId: string, seed: string): BotResult {
  const player = new Player("smart", seed);
  smartPlayer(null, elementId)(player);
  return player.result();
}

/** Houses saved over the whole run: saved over in-path, across the three storms. */
export function savedShare(result: BotResult): number {
  const saved = result.houses.reduce((s, h) => s + h.saved, 0);
  const total = result.houses.reduce((s, h) => s + h.total, 0);
  return total > 0 ? saved / total : 1;
}

export function runBot(persona: Persona, seed: string, level: LevelDef = BOT_LEVEL): BotResult {
  const player = new Player(persona, seed, level);
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
