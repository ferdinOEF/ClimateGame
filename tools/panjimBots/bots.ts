/**
 * Headless bot players for Panjim 2050: the verification that matters.
 *
 * Each bot plays the real rules (`ActionRun` and everything under it, the
 * same classes the browser runs), on the real Panaji board, with the
 * monuments reserved exactly as in a session. Nothing here re-implements a
 * rule; a bot only decides which action to take next, through the same calls
 * a click makes.
 *
 * Personas (Section 7's archetypes; see "personas" below):
 *   casual  builds by eye next to the houses the forecast marks red; never simulates.
 *   greedy  builds near houses every year and ignores the forecast.
 *   smart   reads the forecast cone and the heat; weighs a handful of spots per build.
 *   far     builds far from the risk: every build on the free tile farthest from every storm (the control; one build is one year, so a player cannot do nothing).
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
import { computeWater, damageAt, floodsHouse, HAZARD_MODEL, LANDFALL_ZONE } from "../../src/core/hazardModel";
import { HEAT_LEAD_YEARS } from "../../src/core/exposure";
import type { ChallengeKind, ScheduledChallenge } from "../../src/core/climate";
import { computePanjimIndex } from "../../src/core/panjimIndex";
import { hashSeed, Rng } from "../../src/core/rng";
import { LEVEL_BY_ID, type LevelDef } from "../../src/levels/levels";
import { boardSetup } from "../../src/levels/balance";
import { mapById } from "../../src/levels/levelMap";

export type Persona = "casual" | "greedy" | "smart" | "far" | "random" | "nature" | "seawalls" | "best";
export const PERSONAS: Persona[] = ["casual", "greedy", "smart", "far"];
/**
 * Section 21.2's play styles, for the tuning report (tools/panjimBots/tune21.ts):
 *   far       building nothing that matters (every build away from every storm);
 *   random    every build a defence on a random free tile anywhere;
 *   nature    Smart, building only nature based defences (dune, pandanus, mangrove, khazan);
 *   seawalls  Smart, building only seawalls and breakwaters;
 *   smart     sensible play (Smart as it is);
 *   best      greedy with the exact hazard model: every build weighs every candidate, never by eye.
 */
export const STYLES: Persona[] = ["far", "random", "nature", "seawalls", "smart", "best"];

export interface BotResult {
  persona: Persona;
  seed: string;
  stars: number[];
  protection: number[];
  /** Houses in each storm's path: how many were saved, out of how many. */
  houses: { saved: number; total: number }[];
  /** Per storm: homes lost that the wind decided (their water alone stayed under the line; Section 12). */
  windDecided: number[];
  /** Per storm: landmarks the water damaged (their tile at or over the house-loss line, as the result cards count them). */
  landmarksLost: number[];
  index: number;
  /** The index's five parts. */
  components: { resilience: number; biodiversity: number; livelihoods: number; population: number; food: number };
  score: number;
  /** Time-costing decisions that changed the board: builds, repairs, demolitions. */
  decisions: number;
  /** Builds per element id. */
  built: Record<string, number>;
  /** Years that passed without a build (nothing could be built anywhere). */
  yearsSkipped: number;
  /** Builds made away from every storm. */
  buildsAway: number;
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
 * level object: the tuning sweep (sweep7.ts) changes its
 * numbers inside its own process only, never the data on disk.
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
    growth: level.growth,
    landmarks: MAP.landmarks,
    localities: MAP.localities,
    // Objectives never change an outcome; choosing them costs time the bots do not need.
    generateObjectives: false
  });
}

export type LoggedAction = { type: "tap" } | { type: "skip" } | { type: "build"; coord: AxialCoord; elementId: string; away?: boolean } | { type: "repair"; coord: AxialCoord };

class Player {
  readonly run: ActionRun;
  readonly rng: Rng;
  ms = TIME.briefRead;
  decisions = 0;
  /** Builds per element id, for the balance report. */
  readonly built: Record<string, number> = {};
  /** Every action that went through, in order, so a run can be replayed (the per-element margin). */
  readonly log: LoggedAction[] = [];
  /** Years that passed without a build because nothing could be built anywhere (never on Panaji). */
  yearsSkipped = 0;
  /** Builds made away from every storm, because nothing near the danger was worth building. */
  buildsAway = 0;
  jarTaps = 0;
  /** Each storm's forecast cone as the player saw it at the start of its phase: the houses in its area to protect and the tiles it covered. */
  readonly cones = new Map<string, { area: string[]; tiles: string[] }>();
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

  /** One build, which is the year's. `away`: a build made where it changes nothing a storm does (not counted as a defence). */
  build(coord: AxialCoord, elementId: string, away = false): boolean {
    const outcome = this.run.build(coord, elementId);
    if (!outcome.ok) return false;
    if (away) this.buildsAway++;
    else this.built[elementId] = (this.built[elementId] ?? 0) + 1;
    this.log.push(away ? { type: "build", coord, elementId, away } : { type: "build", coord, elementId });
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

  /** Tiles no storm's water reaches on the bare board, farthest from it first: where a build changes nothing a storm does. */
  private awayTiles: AxialCoord[] | null = null;

  /**
   * The year's build where it changes nothing a storm does: on the free tile
   * farthest from every storm's reach. One build is one year, so a player who
   * has nothing to build near the danger still builds (Section 8). If nothing
   * can be built anywhere at all, the year is skipped (never on Panaji).
   */
  buildAway(): boolean {
    if (!this.awayTiles) {
      const reach = new Set<string>();
      for (const challenge of this.run.schedule) for (const key of this.run.exposureFor(challenge, true)?.exposure.keys() ?? []) reach.add(key);
      const reached = [...reach].map(coordOf);
      const hex = (a: AxialCoord, b: AxialCoord): number => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
      this.awayTiles = [...this.state.placed.values()]
        .map((tile) => tile.coord)
        .filter((c) => !reach.has(axialKey(c)))
        .map((c) => ({ c, d: Math.min(...reached.map((r) => hex(c, r))) }))
        .sort((a, b) => b.d - a.d || a.c.q - b.c.q || a.c.r - b.c.r)
        .map((x) => x.c);
    }
    for (const coord of this.awayTiles) {
      const options = this.state.buildableAt(coord);
      if (options.length > 0 && this.build(coord, options[0].id, true)) return true;
    }
    const outcome = this.run.skipYear();
    if (!outcome.ok) return false;
    this.log.push({ type: "skip" });
    this.yearsSkipped++;
    this.events(outcome.events);
    return true;
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
      windDecided: this.run.schedule.map((c) => {
        const record = this.run.stormRecords.get(c.id);
        return record ? record.outcome.damagedHouses.filter((key) => !floodsHouse(record.depth.get(key) ?? 0)).length : 0;
      }),
      landmarksLost: this.run.schedule.map((c) => {
        const record = this.run.stormRecords.get(c.id);
        return record ? MAP.monuments.filter((m) => floodsHouse(damageAt(record, `${m.q},${m.r}`))).length : 0;
      }),
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
      yearsSkipped: this.yearsSkipped,
      buildsAway: this.buildsAway,
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
// Section 7's archetypes for yearly turns with no coins. Each plays the real
// rules through ActionRun, and uses every build of every year it plays:
//   casual    builds by eye: every build of every year on a tile next to the
//             most houses the forecast marks red (the cone's area to protect,
//             then the heat), a defence that answers the storm; it never
//             checks what a build saves.
//   greedy    builds near houses and ignores the forecast: it picks a few
//             waterside streets of its own at the start and puts
//             every build of every year next to them, any defence that fits;
//             never the cone, never the heat. Whether its streets lie in the
//             storms' paths is luck, so its results swing.
//   smart     reads the forecast cone from the start of each storm's phase and
//             the heat after: every build goes where the hazard model says it
//             saves the most houses. It is a person, not a solver: for each
//             build it weighs a handful of the candidates (its attention,
//             drawn per run), so on some runs it misses the best spot.
//   far       builds far from the risk: every build on the free tile farthest
//             from every storm (the control; one build is one year, so doing
//             nothing is not possible).

const DEFENCES = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"];

/**
 * A run is won when the level ends on three stars, the game's own top result
 * (`computePanjimIndex`'s levelStars: the storms' stars averaged and rounded),
 * so at most one storm short of three stars and none below two.
 */
export function won(result: BotResult): boolean {
  return result.stars.length > 0 && Math.round(result.stars.reduce((s, x) => s + x, 0) / result.stars.length) >= 3;
}

/** The softer reading: every storm at two stars or more. */
export function survived(result: BotResult): boolean {
  return result.stars.length > 0 && result.stars.every((s) => s >= 2);
}

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
 * What `challenge` would do on the board as it stands with `extra` built now:
 * houses lost, and how deep the water stands over the house-loss line on the
 * houses at risk (so a build that lowers the water without yet saving a house
 * still counts; two or three defences together save a street). The same
 * water model the game resolves storms with.
 */
function lossesWith(p: Player, challenge: ScheduledChallenge, extra: { key: string; elementId: string } | null): { lost: number; excess: number } {
  const run = p.run;
  const board = run.state.clone();
  if (extra) board.elements.set(extra.key, { elementId: extra.elementId, builtOnTurn: run.state.turn, degradeAmount: 0, floodBufferFilled: 0 });
  const site = run.landfallOf(challenge);
  const water = computeWater(board, { kind: challenge.kind, strength: challenge.strength, landfall: site }, { combos: computeCombos(board).bonus, landfallZoneTiles: ZONES.keys(LANDFALL_ZONE) });
  let lost = 0;
  let excess = 0;
  for (const [key, inst] of board.elements) {
    if (inst.elementId !== "house" || inst.degradeAmount >= 1 || board.isScenery(key)) continue;
    const d = damageAt(water, key);
    if (floodsHouse(d)) {
      lost++;
      excess += d - HAZARD_MODEL.houseLossDepthM;
    }
  }
  return { lost, excess };
}

/**
 * The best defence to build now against `challenge`, of the candidates on and
 * around the tiles at risk (the cone's area, then the heat): each scored by
 * the houses it saves on a copy of the board. `attention` is how many of the
 * shortlist it weighs (a random handful; Infinity weighs them all). Null when
 * nothing saves a house or takes water off one.
 */
function bestDefence(p: Player, challenge: ScheduledChallenge, attention = Infinity, skip: string | null = null, only: string | readonly string[] | null = null, perKindMax = 3, exact = false): { coord: AxialCoord; elementId: string; saves: number } | null {
  const allowed = only === null ? null : typeof only === "string" ? [only] : only;
  const seen = visibleRisk(p, challenge, exact);
  if (seen.risk.length === 0) return null;
  const near = around([...seen.risk, ...seen.tiles], 1);
  const candidates: { key: string; elementId: string; score: number }[] = [];
  const risk = new Set(seen.risk);
  const onPath = new Set(seen.tiles);
  for (const key of near) {
    const coord = coordOf(key);
    for (const elementId of DEFENCES) {
      if (elementId === skip || (allowed && !allowed.includes(elementId)) || !answers(elementId, challenge.kind)) continue;
      if (!p.state.canBuild(coord, elementId)) continue;
      let score = 0;
      for (const n of around([key], 2)) if (risk.has(n)) score++;
      candidates.push({ key, elementId, score: score + (onPath.has(key) ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : a.elementId < b.elementId ? -1 : 1));
  // The best few of each kind, so every kind of defence is weighed.
  let shortlist: typeof candidates = [];
  const perKind = new Map<string, number>();
  for (const c of candidates) {
    if ((perKind.get(c.elementId) ?? 0) >= perKindMax) continue;
    perKind.set(c.elementId, (perKind.get(c.elementId) ?? 0) + 1);
    shortlist.push(c);
  }
  if (shortlist.length > attention) {
    const pool = [...shortlist];
    shortlist = [];
    while (shortlist.length < attention && pool.length > 0) shortlist.push(pool.splice(Math.floor(p.rng.next() * pool.length), 1)[0]);
  }
  const base = lossesWith(p, challenge, null);
  let best: { coord: AxialCoord; elementId: string; saves: number; gain: number } | null = null;
  for (const c of shortlist) {
    const after = lossesWith(p, challenge, c);
    const saves = base.lost - after.lost;
    // A house saved is worth a lot; water taken off the houses at risk (in metres) counts too.
    const gain = saves * 4 + (base.excess - after.excess);
    if (gain > 0.5 && (!best || gain > best.gain)) best = { coord: coordOf(c.key), elementId: c.elementId, saves, gain };
  }
  return best;
}

/** One build a year: `build` makes the year's build, or, when it finds nothing worth building, the player builds away from the storms. */
function playYears(p: Player, build: () => boolean): void {
  while (!p.run.finished) {
    if (build()) continue;
    if (!p.buildAway()) break;
  }
}

/**
 * What the screen shows about `next` now, as the player can know it: in the
 * last two years before it, the heat (recomputed after every build); before
 * that, the forecast cone they saw at the start of the phase (it is drawn
 * once and not refreshed, so they remember it as it was). The houses marked
 * red, and the tiles the water reaches.
 */
function visibleRisk(p: Player, next: ScheduledChallenge, exact = false): { risk: string[]; tiles: string[] } {
  // Best play knows the storm as the model has it on the board now, every year.
  if (exact) {
    const now = p.run.exposureFor(next);
    if (now && now.housesAtRisk.length > 0) return { risk: now.housesAtRisk, tiles: [...now.exposure.keys()] };
  }
  if (!p.cones.has(next.id) && p.run.turnNumber >= p.run.phaseStart(next)) {
    const cone = p.run.forecastCone(next);
    if (cone) p.cones.set(next.id, { area: [...cone.area], tiles: [...cone.bands.keys()] });
  }
  const remembered = p.cones.get(next.id) ?? { area: [], tiles: [] };
  if (p.run.yearsUntil(next) <= HEAT_LEAD_YEARS) {
    const heat = p.run.exposureFor(next);
    if (heat && heat.housesAtRisk.length > 0) return { risk: heat.housesAtRisk, tiles: [...heat.exposure.keys()] };
  }
  return { risk: remembered.area, tiles: remembered.tiles };
}

/**
 * Casual's pick by eye, from what the screen shows: next to the most red
 * houses (roughly), a defence that answers the storm. When no free spot is
 * next to a red house, anywhere the forecast shows water, next to the most
 * houses. Never simulates.
 */
function byEye(p: Player, next: ScheduledChallenge, allowed: readonly string[] = DEFENCES): { coord: AxialCoord; id: string } | null {
  const { risk, tiles } = visibleRisk(p, next);
  if (tiles.length === 0) return null;
  const red = new Set(risk);
  let best: { coord: AxialCoord; id: string; score: number } | null = null;
  let fallback: { coord: AxialCoord; id: string; score: number } | null = null;
  for (const key of around(tiles, 1)) {
    const coord = coordOf(key);
    let nearRed = 0;
    let nearHomes = 0;
    for (const n of around([key], 2)) {
      if (red.has(n)) nearRed++;
      if (p.state.elements.get(n)?.elementId === "house" && !p.state.isScenery(n)) nearHomes++;
    }
    for (const id of allowed) {
      if (!answers(id, next.kind) || !p.state.canBuild(coord, id)) continue;
      const jitter = 0.5 + p.rng.next();
      if (nearRed > 0 && (!best || nearRed * jitter > best.score)) best = { coord, id, score: nearRed * jitter };
      if (!fallback || nearHomes * jitter > fallback.score) fallback = { coord, id, score: nearHomes * jitter };
    }
  }
  return best ?? fallback;
}

function playCasual(p: Player): void {
  playYears(p, () => {
    const next = p.run.nextChallenge();
    if (!next) return false;
    const pick = byEye(p, next);
    return !!pick && p.build(pick.coord, pick.id);
  });
}

/** How many streets Greedy defends in a run. */
export const GREEDY_STREETS = Number(process.env.GREEDY_STREETS ?? 6);

function playGreedy(p: Player): void {
  // The streets it cares about, drawn once per run: a few houses by the water (where a defence can go), anywhere in the city.
  const houses = [...p.state.elements]
    .filter(([key, inst]) => inst.elementId === "house" && !p.state.isScenery(key) && [...around([key], 2)].some((n) => DEFENCES.some((id) => p.state.canBuild(coordOf(n), id))))
    .map(([key]) => key);
  const streets: string[] = [];
  const adopt = (): void => {
    for (let i = 0; i < 50; i++) {
      const key = houses[Math.floor(p.rng.next() * houses.length)];
      if (!streets.includes(key)) {
        streets.push(key);
        return;
      }
    }
  };
  while (streets.length < Math.min(GREEDY_STREETS, houses.length)) adopt();
  let turn = 0;
  playYears(p, () => {
    // Every build next to one of its streets in turn, any defence that fits; it never looks at the cone or the heat.
    // When its streets have no room left, it takes on another.
    for (let tries = 0; tries < streets.length * 2 + 20; tries++) {
      if (tries >= streets.length * 2 && streets.length < houses.length) adopt();
      const street = streets[turn++ % streets.length];
      for (const radius of [1, 2, 3]) {
        const options: { coord: AxialCoord; id: string }[] = [];
        for (const key of around([street], radius)) {
          const coord = coordOf(key);
          for (const id of DEFENCES) if (p.state.canBuild(coord, id)) options.push({ coord, id });
        }
        if (options.length > 0) {
          const pick = options[Math.floor(p.rng.next() * options.length)];
          if (p.build(pick.coord, pick.id)) return true;
        }
      }
    }
    return false;
  });
}

function playFar(p: Player): void {
  while (!p.run.finished && p.buildAway());
}

/** Smart's slips: the most of its builds it makes by eye instead (each run draws its own share, from none up to this). */
export const SMART_SLIP = Number(process.env.SMART_SLIP ?? 0.4);

/** Smart's attention: how many shortlisted candidates it weighs for a build, drawn per run. */
export const SMART_ATTENTION = { min: Number(process.env.SMART_MIN ?? 4), max: Number(process.env.SMART_MAX ?? 12) };

/** Smart, with an optional element left out (the per-element margin test) or the only one it builds. */
function smartPlayer(skip: string | null, only: string | null = null): (p: Player) => void {
  return (p) => {
    const attention = SMART_ATTENTION.min + Math.floor(p.rng.next() * (SMART_ATTENTION.max - SMART_ATTENTION.min + 1));
    const slip = SMART_SLIP * p.rng.next();
    playYears(p, () => {
      const next = p.run.nextChallenge();
      if (!next) return false;
      // Now and then it goes by eye, like anyone.
      if (!only && !skip && p.rng.next() < slip) {
        const guess = byEye(p, next);
        if (guess && p.build(guess.coord, guess.id)) return true;
      }
      const pick = bestDefence(p, next, attention, skip, only);
      if (pick && p.build(pick.coord, pick.elementId)) return true;
      // Nothing it weighed would save more: the rest of the year's builds go by eye, like anyone's.
      if (!only && !skip) {
        const guess = byEye(p, next);
        if (guess && p.build(guess.coord, guess.id)) return true;
      }
      // Nothing worth building against this storm: mend a worn defence or a lost home.
      for (const [key, inst] of p.state.elements) {
        if (!p.run.needsRepair(coordOf(key))) continue;
        if (inst.elementId !== "house" && ELEMENT_BY_ID.get(inst.elementId)?.kind === "building") continue;
        if (p.repair(coordOf(key))) return true;
      }
      return false;
    });
  };
}

/** Every build a defence on a random free tile anywhere on the board, any kind that fits (Section 21.2). */
function playRandom(p: Player): void {
  const keys = [...p.state.placed.keys()].filter((key) => !p.state.isScenery(key));
  playYears(p, () => {
    for (let tries = 0; tries < 400; tries++) {
      const coord = coordOf(keys[Math.floor(p.rng.next() * keys.length)]);
      const ids = DEFENCES.filter((id) => p.state.canBuild(coord, id));
      if (ids.length === 0) continue;
      if (p.build(coord, ids[Math.floor(p.rng.next() * ids.length)])) return true;
    }
    return false;
  });
}

const NATURE = ["dune", "sandy_vegetation", "mangrove", "khazan"];
const HARD = ["seawall", "breakwater"];

/**
 * Smart limited to some kinds of defence (Section 21.2's "nature only" and "seawalls only"): its own attention
 * and slips, its by-eye builds limited to the same kinds; when none of them answers, the year goes away.
 */
function limitedPlayer(allowed: readonly string[]): (p: Player) => void {
  return (p) => {
    const attention = SMART_ATTENTION.min + Math.floor(p.rng.next() * (SMART_ATTENTION.max - SMART_ATTENTION.min + 1));
    const slip = SMART_SLIP * p.rng.next();
    playYears(p, () => {
      const next = p.run.nextChallenge();
      if (!next) return false;
      if (p.rng.next() < slip) {
        const guess = byEye(p, next, allowed);
        if (guess && p.build(guess.coord, guess.id)) return true;
      }
      const pick = bestDefence(p, next, attention, null, allowed);
      if (pick && p.build(pick.coord, pick.elementId)) return true;
      const guess = byEye(p, next, allowed);
      return !!guess && p.build(guess.coord, guess.id);
    });
  };
}

/** Best play: every build the one the exact hazard model says saves the most, every candidate weighed, never by eye. */
function playBest(p: Player): void {
  playYears(p, () => {
    const next = p.run.nextChallenge();
    if (!next) return false;
    const pick = bestDefence(p, next, Infinity, null, null, 8, true);
    if (pick && p.build(pick.coord, pick.elementId)) return true;
    const guess = byEye(p, next);
    return !!guess && p.build(guess.coord, guess.id);
  });
}

/** Best play limited to one kind of defence (Section 21.2: three stars must not come from spamming one element). */
export function runBestOnly(elementId: string, seed: string): BotResult {
  const player = new Player("best", seed);
  playYears(player, () => {
    const next = player.run.nextChallenge();
    if (!next) return false;
    const pick = bestDefence(player, next, Infinity, null, elementId, 8, true);
    return !!pick && player.build(pick.coord, pick.elementId);
  });
  return player.result();
}

const PLAY: Record<Persona, (p: Player) => void> = {
  casual: playCasual,
  greedy: playGreedy,
  smart: smartPlayer(null),
  far: playFar,
  random: playRandom,
  nature: limitedPlayer(NATURE),
  seawalls: limitedPlayer(HARD),
  best: playBest
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
 * applies) is made away from the storms instead, so every other build keeps
 * its year. The houses this loses is what that element did in Smart's plan,
 * with no re-planning round it.
 */
export function replaySmartWithout(elementId: string, seed: string, log: readonly LoggedAction[] = smartLog(seed)): BotResult {
  const player = new Player("smart", seed);
  for (const action of log) {
    if (player.run.finished) break;
    if (action.type === "tap") player.tapJar();
    else if (action.type === "skip") player.buildAway();
    else if (action.type === "build") {
      // The left-out defence's build is still the year's build: made away from the storms instead.
      const ok = action.elementId !== elementId && player.build(action.coord, action.elementId, action.away);
      if (!ok) player.buildAway();
    } else if (!player.repair(action.coord)) player.buildAway();
  }
  while (!player.run.finished && player.buildAway());
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
