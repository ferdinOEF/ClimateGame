import { axialDistance } from "./hex";
import { ELEMENT_BY_ID } from "./elements";
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
  /** A named stretch whose tiles take its name instead ("between Kala Academy and Sharada Mandir"). */
  stretch?: { tiles: ReadonlySet<string>; place: string; title: string; pins: { name: string; q: number; r: number }[] } | null;
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

/** The defences that answer a storm of `kind`: lower its water, or (in a cyclone) its wind. */
function answers(kind: ChallengeKind): string[] {
  const hazards = kind === "flood" ? ["flood"] : kind === "cyclone" ? ["cyclone"] : ["cyclone", "flood"];
  return Object.keys(NOUN).filter((id) => {
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

  return { picks, rows: rowsOf(input, picks, candidates), lostBefore, lostAfter: lost };
}

/** The place a tile's row is named for. */
function placeOf(input: PhaseObjectiveInput, key: string): string {
  if (input.stretch?.tiles.has(key)) return input.stretch.place;
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
  return [...groups.values()].map((group, i) => {
    // The tiles that count: where this defence could go in this place, round the area to protect.
    const tiles = [...new Set([...candidates.filter((c) => c.elementId === group.elementId && placeOf(input, c.key) === group.place).map((c) => c.key), ...group.picks.map((p) => p.key)])].sort();
    const [verb, one, many] = NOUN[group.elementId] ?? ["Build", group.elementId, group.elementId];
    const count = group.picks.length;
    const baseline = tiles.filter((key) => input.state.elements.get(key)?.elementId === group.elementId).length;
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
      pins: pinsOf(input, group.place, tiles),
      homes: group.picks.reduce((s, p) => s + p.homes, 0)
    };
  });
}

/** The places a row names, to pin on the map: a stretch's two ends, a zone's name over its tiles, or the locality it is near. */
function pinsOf(input: PhaseObjectiveInput, place: string, tiles: string[]): { name: string; q: number; r: number }[] {
  if (input.stretch && place === input.stretch.place) return input.stretch.pins;
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

