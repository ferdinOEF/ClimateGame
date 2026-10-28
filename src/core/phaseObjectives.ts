import { axialDistance } from "./hex";
import { ELEMENT_BY_ID, NATURE_BASED } from "./elements";
import { computeCombos } from "./combos";
import { computeWater, damageAt, floodsHouse, type StormInput } from "./hazardModel";
import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import type { ZoneIndex } from "./zones";
import type { PrepObjective } from "./prep";

/**
 * A phase's objective, chosen by the hazard model (Section 12, owner
 * decision). At the start of a storm's phase, on the board as it stands with
 * the player's own defences, the same model the storm will run picks, one at
 * a time, the build that saves the most homes still to be lost, from the
 * defences that answer this storm on the tiles round its area to protect.
 * It stops at the phase's builds (5, 10, 10) or when nothing saves another
 * home. The picks are grouped into rows by defence and place ("Build 2 dunes
 * between Kala Academy and Sharada Mandir"); each row is credited with the
 * homes its picks saved, at least one.
 *
 * Optional: a row never changes a storm's outcome or its stars. Pure: no DOM,
 * no renderer.
 */
export interface PhaseObjectiveInput {
  state: GameState;
  zones: ZoneIndex;
  challenge: { id: string; kind: ChallengeKind };
  storm: StormInput;
  landfallZoneTiles?: readonly string[];
  /** The phase's area to protect: the homes the storm takes if nothing more is built. */
  area: readonly string[];
  /** Builds left in the phase. */
  budget: number;
  /** What to call each zone in a row ("the Ourem creek"). */
  places: Record<string, string>;
  /** Locality names, for a row outside every zone ("near Campal"). */
  localities?: readonly { name: string; q: number; r: number }[];
  /**
   * A named stretch whose tiles take its name instead ("in front of Sharada
   * Mandir School"). With `only`, the rows come from its tiles alone
   * (Section 16.4: the first objective is the area round the school).
   */
  stretch?: { tiles: ReadonlySet<string>; place: string; placeOf?: (key: string) => string; title: string; pins: { name: string; q: number; r: number }[]; only?: boolean } | null;
}

/** One pick: a defence on a tile, and the homes it saved on top of the picks before it. */
export interface ObjectivePick {
  key: string;
  elementId: string;
  homes: number;
}

export interface PhaseObjective {
  picks: ObjectivePick[];
  rows: PrepObjective[];
  /** Homes the storm takes now, and after every pick is built. */
  lostBefore: number;
  lostAfter: number;
}

/** How far round the area's homes a defence may stand to count (hexes). */
export const OBJECTIVE_REACH = 2;
/** How many of the best candidates are re-scored fresh at every step, before the lazy check. */
const LEADERS = 24;

const NOUN: Record<string, [string, string, string]> = {
  dune: ["Build", "dune", "dunes"],
  sandy_vegetation: ["Plant", "pandanus", "pandanus"],
  seawall: ["Build", "seawall", "seawalls"],
  breakwater: ["Build", "breakwater", "breakwaters"],
  mangrove: ["Plant", "mangrove", "mangroves"],
  khazan: ["Build", "khazan", "khazans"],
  small_dam: ["Build", "small dam", "small dams"]
};

/** The homes the storm takes on `state`: standing houses (not scenery) whose water and wind pass the line. */
export function homesLost(state: GameState, storm: StormInput, landfallZoneTiles?: readonly string[]): Set<string> {
  const water = computeWater(state, storm, { combos: computeCombos(state).bonus, landfallZoneTiles });
  const lost = new Set<string>();
  for (const [key, inst] of state.elements) {
    if (inst.degradeAmount >= 1 || state.isScenery(key) || ELEMENT_BY_ID.get(inst.elementId)?.kind !== "building") continue;
    if (floodsHouse(damageAt(water, key))) lost.add(key);
  }
  return lost;
}

/**
 * The defences an objective may suggest against a storm of `kind`: those that lower its water, or (in a cyclone) its
 * wind, and only the nature-based ones (Section 17.2, owner decision: dune, pandanus, mangrove, khazan; never a
 * seawall, breakwater or small dam, which stay buildable).
 */
export function answers(kind: ChallengeKind): string[] {
  const hazards = kind === "flood" ? ["flood"] : kind === "cyclone" ? ["cyclone"] : ["cyclone", "flood"];
  return (NATURE_BASED as readonly string[]).filter((id) => {
    const def = ELEMENT_BY_ID.get(id);
    return !!def && (def.effects.resilience ?? 0) > 0 && !!def.targetsHazards?.some((h) => hazards.includes(h));
  });
}

export function generatePhaseObjective(input: PhaseObjectiveInput): PhaseObjective {
  const { state, storm } = input;
  const board = state.clone();
  const lostBefore = homesLost(board, storm, input.landfallZoneTiles).size;
  const homes = input.area.map((key) => {
    const [q, r] = key.split(",").map(Number);
    return { q, r };
  });
  const near = (key: string): boolean => {
    const [q, r] = key.split(",").map(Number);
    return homes.some((h) => axialDistance(h, { q, r }) <= OBJECTIVE_REACH);
  };
  const ids = answers(input.challenge.kind);
  const candidates: { key: string; elementId: string }[] = [];
  for (const key of [...state.placed.keys()].sort()) {
    if (!near(key)) continue;
    if (input.stretch?.only && !input.stretch.tiles.has(key)) continue;
    // Never a row on a tile the storm does not reach (Section 23.1).
    if (storm.sheltered?.has(key)) continue;
    const [q, r] = key.split(",").map(Number);
    for (const elementId of ids) if (state.canBuild({ q, r }, elementId)) candidates.push({ key, elementId });
  }

  const picks: ObjectivePick[] = [];
  let lost = lostBefore;
  const gainOf = (c: { key: string; elementId: string }): number => {
    const [q, r] = c.key.split(",").map(Number);
    if (!board.canBuild({ q, r }, c.elementId)) return -1;
    const trial = board.clone();
    trial.build({ q, r }, c.elementId, false);
    return lost - homesLost(trial, storm, input.landfallZoneTiles).size;
  };
  // A lazy greedy: every candidate's last score is an upper bound on its gain now (a build only ever
  // gains less once others stand, in all but rare combo cases), so the best is found by re-scoring
  // the leader until it still leads.
  const order = (a: { key: string; elementId: string; gain: number }, b: { key: string; elementId: string; gain: number }): number =>
    b.gain - a.gain || (a.key < b.key ? -1 : a.key > b.key ? 1 : a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0);
  let scored = candidates.map((c) => ({ ...c, gain: gainOf(c), fresh: picks.length }));
  while (picks.length < input.budget && lost > 0) {
    scored.sort(order);
    // The leaders are always re-scored fresh (a combo can make a build worth more once another stands), then the lazy check.
    for (const c of scored.slice(0, LEADERS)) {
      c.gain = gainOf(c);
      c.fresh = picks.length;
    }
    scored.sort(order);
    let best: (typeof scored)[number] | undefined;
    for (let guard = 0; guard < scored.length * 2 && scored.length > 0; guard++) {
      const top = scored[0];
      if (top.gain <= 0) break;
      if (top.fresh === picks.length) {
        best = top;
        break;
      }
      top.gain = gainOf(top);
      top.fresh = picks.length;
      scored.sort(order);
    }
    if (!best || best.gain <= 0) break;
    const [q, r] = best.key.split(",").map(Number);
    board.build({ q, r }, best.elementId, false);
    picks.push({ key: best.key, elementId: best.elementId, homes: best.gain });
    lost -= best.gain;
    const taken = best.key;
    scored = scored.filter((c) => c.key !== taken);
  }

  const rows = rowsOf(input, picks, candidates);
  // Section 34b.13: the 2050 storm (cyclone and flood) brings wind, which only pandanus lowers (a game rule). When its
  // wind still takes homes after the picks, a row asks for pandanus on the beach beside them.
  const room = input.budget - picks.length;
  const wind = input.challenge.kind === "compound" && room > 0 && rows.length < MAX_ROWS && !rows.some((row) => row.elementId === "sandy_vegetation") ? windRow(input, board, lost, room) : null;
  if (wind) {
    picks.push(...wind.picks);
    rows.push(wind.row);
    lost -= wind.picks.reduce((s, p) => s + p.homes, 0);
  }
  return { picks, rows, lostBefore, lostAfter: lost };
}

/** Section 34b.13: how many pandanus the wind row asks for, at most. */
export const WIND_ROW_PANDANUS = 2;

/**
 * Section 34b.13: the wind row. The homes the storm's wind takes on `board` (the picks built), those the water alone
 * would leave standing; the beach tiles within two hexes of them where pandanus takes at least one home out of the
 * storm's risk (the still helps rule), best first, at most WIND_ROW_PANDANUS. "Plant 2 pandanus on the Campal beach".
 */
function windRow(input: PhaseObjectiveInput, board: GameState, lostNow: number, room: number): { picks: ObjectivePick[]; row: PrepObjective } | null {
  const water = computeWater(board, input.storm, { combos: computeCombos(board).bonus, landfallZoneTiles: input.landfallZoneTiles });
  const windHomes: { q: number; r: number }[] = [];
  for (const [key, inst] of board.elements) {
    if (inst.degradeAmount >= 1 || board.isScenery(key) || ELEMENT_BY_ID.get(inst.elementId)?.kind !== "building") continue;
    if (floodsHouse(damageAt(water, key)) && !floodsHouse(water.depth.get(key) ?? 0)) windHomes.push(coordOfKey(key));
  }
  if (windHomes.length === 0) return null;
  const nearWind = (key: string): boolean => windHomes.some((h) => axialDistance(h, coordOfKey(key)) <= OBJECTIVE_REACH);
  const beach = [...board.placed.keys()].filter((key) => board.placed.get(key)!.terrainId === "beach" && nearWind(key) && !input.storm.sheltered?.has(key) && (!input.stretch?.only || input.stretch.tiles.has(key))).sort();
  const trialBoard = board.clone();
  let lost = lostNow;
  const picks: ObjectivePick[] = [];
  while (picks.length < Math.min(WIND_ROW_PANDANUS, room)) {
    let best: { key: string; gain: number } | null = null;
    for (const key of beach) {
      if (!trialBoard.canBuild(coordOfKey(key), "sandy_vegetation")) continue;
      const trial = trialBoard.clone();
      trial.build(coordOfKey(key), "sandy_vegetation", false);
      const gain = lost - homesLost(trial, input.storm, input.landfallZoneTiles).size;
      if (gain > 0 && (!best || gain > best.gain)) best = { key, gain };
    }
    if (!best) break;
    trialBoard.build(coordOfKey(best.key), "sandy_vegetation", false);
    lost -= best.gain;
    picks.push({ key: best.key, elementId: "sandy_vegetation", homes: best.gain });
  }
  if (picks.length === 0) return null;
  const first = coordOfKey(picks[0].key);
  const nearest = [...(input.localities ?? [])].sort((a, b) => axialDistance(a, first) - axialDistance(b, first) || (a.name < b.name ? -1 : 1))[0];
  const place = nearest ? (nearest.name === "Campal" ? "on the Campal beach" : `on the beach near ${nearest.name}`) : "on the beach";
  // The tiles that count: the beach near the homes in the wind; pandanus already there that helps counts from the start.
  const lostOnBoard = homesLost(input.state, input.storm, input.landfallZoneTiles).size;
  const credited = beach.filter((key) => {
    if (input.state.elements.get(key)?.elementId !== "sandy_vegetation") return false;
    const without = input.state.clone();
    without.elements.delete(key);
    return homesLost(without, input.storm, input.landfallZoneTiles).size > lostOnBoard;
  });
  const count = picks.length + credited.length;
  return {
    picks,
    row: {
      id: `${input.challenge.id}:model:wind:sandy_vegetation`,
      challengeId: input.challenge.id,
      templateId: "model:sandy_vegetation",
      elementId: "sandy_vegetation",
      zone: input.zones.zoneOf(picks[0].key) ?? "",
      count,
      baseline: 0,
      reward: 0,
      label: `Plant ${count} pandanus ${place}`,
      done: false,
      tiles: beach,
      pins: nearest ? [nearest] : [],
      homes: picks.reduce((s, p) => s + p.homes, 0),
      placeTiles: beach,
      place,
      credited
    }
  };
}

function coordOfKey(key: string): { q: number; r: number } {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/** Section 30.9: the most rows an objective shows. */
export const MAX_ROWS = 4;

/** "in Merces", "in St Cruz" → "in Merces and St Cruz"; places with different words keep theirs ("at X and near Y"). */
function joinPlaces(places: string[]): string {
  const words = places.map((place) => /^(in front of|between|near|at|in) (.+)$/.exec(place));
  const sameWord = words.every((m) => m && m[1] === words[0]![1]) && words[0]![1] !== "between";
  const parts = sameWord ? words.map((m) => m![2]) : places;
  const list = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const joined = sameWord ? `${words[0]![1]} ${list}` : list;
  // A row stays one short line in the panel: many places are counted, and their tiles pulse on the map.
  return joined.length <= MAX_PLACE_CHARS ? joined : `at ${places.length} places, shown on the map`;
}

/** Section 30.9: the longest place text a merged row keeps; longer, it counts its places instead. */
const MAX_PLACE_CHARS = 40;

/** The place a tile's row is named for. */
function placeOf(input: PhaseObjectiveInput, key: string): string {
  if (input.stretch?.tiles.has(key)) return input.stretch.placeOf ? input.stretch.placeOf(key) : input.stretch.place;
  const zone = input.zones.zoneOf(key);
  if (zone && input.places[zone]) return `at ${input.places[zone]}`;
  const [q, r] = key.split(",").map(Number);
  const nearest = [...(input.localities ?? [])].sort((a, b) => axialDistance(a, { q, r }) - axialDistance(b, { q, r }) || (a.name < b.name ? -1 : 1))[0];
  return nearest ? `near ${nearest.name}` : "near the homes at risk";
}

/** The picks as rows, in the order the first of each was picked. */
function rowsOf(input: PhaseObjectiveInput, picks: ObjectivePick[], candidates: { key: string; elementId: string }[]): PrepObjective[] {
  const groups = new Map<string, { elementId: string; place: string; picks: ObjectivePick[] }>();
  for (const pick of picks) {
    const place = placeOf(input, pick.key);
    const id = `${pick.elementId}|${place}`;
    const group = groups.get(id) ?? { elementId: pick.elementId, place, picks: [] };
    group.picks.push(pick);
    groups.set(id, group);
  }
  const allInStretch = picks.length > 0 && !!input.stretch && picks.every((p) => input.stretch!.tiles.has(p.key));
  // Section 30.9 (owner decision): at most 4 rows. More than that, and each defence's rows become one, naming its
  // places together ("in Merces and St Cruz"). The objectives suggest the four nature-based defences only, so this
  // leaves 4 at most.
  let list: { elementId: string; place: string; places: string[]; picks: ObjectivePick[] }[] = [...groups.values()].map((g) => ({ ...g, places: [g.place] }));
  if (list.length > MAX_ROWS) {
    const merged = new Map<string, { elementId: string; place: string; places: string[]; picks: ObjectivePick[] }>();
    for (const group of list) {
      const into = merged.get(group.elementId);
      if (!into) merged.set(group.elementId, { ...group, places: [group.place] });
      else {
        into.places.push(group.place);
        into.picks.push(...group.picks);
      }
    }
    list = [...merged.values()].map((group) => ({ ...group, place: joinPlaces(group.places) }));
  }
  // Section 34b.4: the homes the storm takes on the board as it stands, worked out once if a row needs it.
  let lostNow: number | null = null;
  return list.map((group, i) => {
    // The tiles that pulse: where this defence could go in this place, round the area to protect.
    const places = new Set(group.places);
    const tiles = [...new Set([...candidates.filter((c) => c.elementId === group.elementId && places.has(placeOf(input, c.key))).map((c) => c.key), ...group.picks.map((p) => p.key)])].sort();
    const [verb, one, many] = NOUN[group.elementId] ?? ["Build", group.elementId, group.elementId];
    const baseline = tiles.filter((key) => input.state.elements.get(key)?.elementId === group.elementId).length;
    // Section 34b.4: the tiles that count are the whole place the row names. Its defences already standing there that
    // take a home out of this storm's risk (Get ahead's, an earlier phase's) count from the start.
    const placeTiles = [...input.state.placed.keys()].filter((key) => (!input.stretch?.only || input.stretch.tiles.has(key)) && places.has(placeOf(input, key))).sort();
    const credited = placeTiles.filter((key) => {
      if (input.state.elements.get(key)?.elementId !== group.elementId) return false;
      lostNow ??= homesLost(input.state, input.storm, input.landfallZoneTiles).size;
      const without = input.state.clone();
      without.elements.delete(key);
      return homesLost(without, input.storm, input.landfallZoneTiles).size > lostNow;
    });
    // The model's picks are new builds on a board that already holds the credited ones, so the row asks for both:
    // "Build 3 khazans in Merces 1/3" with one already standing (never a row that starts done).
    const count = group.picks.length + credited.length;
    return {
      id: `${input.challenge.id}:model:${i}:${group.elementId}`,
      challengeId: input.challenge.id,
      templateId: `model:${group.elementId}`,
      elementId: group.elementId,
      zone: input.zones.zoneOf(group.picks[0].key) ?? "",
      count,
      baseline,
      reward: 0,
      label: `${verb} ${count} ${count === 1 ? one : many} ${group.place}`,
      done: false,
      tiles,
      heading: allInStretch ? input.stretch!.title : undefined,
      pins: group.picks.every((p) => input.stretch?.tiles.has(p.key)) ? input.stretch!.pins : group.places.flatMap((place) => pinsOf(input, place, tiles)),
      homes: group.picks.reduce((s, p) => s + p.homes, 0),
      placeTiles,
      place: group.place,
      credited
    };
  });
}

/** The places a row names, to pin on the map: a stretch's two ends, a zone's name over its tiles, or the locality it is near. */
function pinsOf(input: PhaseObjectiveInput, place: string, tiles: string[]): { name: string; q: number; r: number }[] {
  const near = /^near (.+)$/.exec(place);
  if (near) {
    const locality = input.localities?.find((l) => l.name === near[1]);
    return locality ? [locality] : [];
  }
  const at = /^at (.+)$/.exec(place);
  if (!at || tiles.length === 0) return [];
  // The zone's name over the middle of the tiles that count.
  const coords = tiles.map((key) => key.split(",").map(Number));
  const cq = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const cr = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const [q, r] = [...coords].sort((a, b) => axialDistance({ q: a[0], r: a[1] }, { q: Math.round(cq), r: Math.round(cr) }) - axialDistance({ q: b[0], r: b[1] }, { q: Math.round(cq), r: Math.round(cr) }))[0];
  return [{ name: at[1].replace(/^the /, "The "), q, r }];
}

/** The tile keys of a row's picks, for tests and the guidance. */
export function pickKeys(objective: PhaseObjective): string[] {
  return objective.picks.map((p) => p.key);
}

