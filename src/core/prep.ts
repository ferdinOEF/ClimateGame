import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import type { Exposure } from "./exposure";
import type { ZoneIndex } from "./zones";

/**
 * "Get ready": two or three small, optional jobs for the storm that is
 * coming, each paying Coin the moment it is done. They are written fresh for
 * each storm, so they never point at a zone the next storm will not touch.
 *
 * These are written for the storm in front of the player. When a storm is
 * announced (the run starts, or the one before it lands), its exposure is
 * read from the real resolver (core/exposure.ts), the zones on its path are
 * ranked by houses at risk (then by how hot they run), and each of the top
 * zones gets a job from the level's templates: a defence that answers this
 * kind of storm and can actually be built there. A job counts what is
 * standing in its zone on top of what already stood when it was set, so it
 * never starts done; jobs from a storm that has passed are dropped.
 *
 * The templates (element, count, label, reward) live in levels.json. Pure:
 * no DOM, no renderer.
 */
export interface PrepTemplate {
  id: string;
  /** The storm kinds this job helps against. */
  kinds: ChallengeKind[];
  elementId: string;
  count: number;
  /** Coin paid on completion. */
  reward: number;
  /** "Plant {count} pandanus on the beach at {place}". */
  label: string;
}

/**
 * The first storm's own objective (Section 6.3): a named job in steps on one
 * stretch of coast, set at the start of the run instead of the generated
 * jobs. Built on the same jobs: each step is a job that counts its element
 * in the stretch's tiles.
 */
export interface OpeningObjective {
  /** The storm it is for. */
  challengeId: string;
  title: string;
  /** The stretch, by the names of two places on the map (core/stretch.ts). */
  region: { from: string; to: string; inland: number; seaward: number };
  steps: { id: string; elementId: string; count: number; label: string }[];
}

export interface PrepConfig {
  templates: PrepTemplate[];
  /** The first storm's own objective, in place of the generated jobs for it. */
  opening?: OpeningObjective;
  /** What to call each zone in a label: "the Ourem creek". */
  places: Record<string, string>;
  /** At most this many jobs per storm (default 3). */
  max?: number;
  /** Each phase's objective is chosen by the hazard model (core/phaseObjectives.ts; Section 12) instead of the templates. */
  model?: boolean;
}

export interface PrepObjective {
  id: string;
  challengeId: string;
  templateId: string;
  elementId: string;
  zone: string;
  count: number;
  /** How many of `elementId` already stood in `zone` when the job was set. */
  baseline: number;
  reward: number;
  label: string;
  done: boolean;
  /** For an opening objective's step: the stretch's tiles it counts in (instead of `zone`), and the objective's title. */
  tiles?: string[];
  heading?: string;
  /** A model-chosen row (core/phaseObjectives.ts): the homes its picks saved in the model when it was set. */
  homes?: number;
}

function standingIn(state: GameState, zones: ZoneIndex, elementId: string, zone: string, tiles?: ReadonlySet<string>): number {
  let count = 0;
  for (const [key, inst] of state.elements) {
    if (inst.elementId === elementId && (tiles ? tiles.has(key) : zones.zoneOf(key) === zone)) count++;
  }
  return count;
}

/** The opening objective's steps as jobs, counting in the stretch's tiles. */
export function openingJobs(opening: OpeningObjective, tiles: ReadonlySet<string>, state: GameState, zones: ZoneIndex): PrepObjective[] {
  return opening.steps.map((step) => ({
    id: `${opening.challengeId}:opening:${step.id}`,
    challengeId: opening.challengeId,
    templateId: `opening:${step.id}`,
    elementId: step.elementId,
    zone: "",
    count: step.count,
    baseline: standingIn(state, zones, step.elementId, "", tiles),
    reward: 0,
    label: step.label,
    done: false,
    tiles: [...tiles],
    heading: opening.title
  }));
}

/** Free tiles in `zone` where `elementId` can be built now. */
function buildableIn(state: GameState, zones: ZoneIndex, elementId: string, zone: string): number {
  let free = 0;
  for (const key of zones.keys(zone)) {
    const [q, r] = key.split(",").map(Number);
    if (state.canBuild({ q, r }, elementId)) free++;
  }
  return free;
}

/**
 * The jobs for one storm. Zones on its path, most houses at risk first (then
 * hottest); for each, the first template for this storm kind that can be
 * built there `count` times and is not already set for that zone.
 */
export function generatePrep(
  challenge: { id: string; kind: ChallengeKind },
  exposure: Exposure,
  state: GameState,
  zones: ZoneIndex,
  config: PrepConfig
): PrepObjective[] {
  const atRisk = new Map<string, number>();
  for (const key of exposure.housesAtRisk) {
    const zone = zones.zoneOf(key);
    if (zone) atRisk.set(zone, (atRisk.get(zone) ?? 0) + 1);
  }
  const heat = new Map<string, number>();
  for (const [key, value] of exposure.exposure) {
    const zone = zones.zoneOf(key);
    if (zone) heat.set(zone, (heat.get(zone) ?? 0) + value);
  }
  // Every zone the storm's water reaches (the hazard model, through the exposure), most houses at risk first.
  const path = [...new Set([...atRisk.keys(), ...heat.keys()])].filter((zone) => (heat.get(zone) ?? 0) > 0 || (atRisk.get(zone) ?? 0) > 0);
  const ranked = path.sort((a, b) => (atRisk.get(b) ?? 0) - (atRisk.get(a) ?? 0) || (heat.get(b) ?? 0) - (heat.get(a) ?? 0) || (a < b ? -1 : 1));
  const templates = config.templates.filter((template) => template.kinds.includes(challenge.kind));
  const max = config.max ?? 3;
  const jobs: PrepObjective[] = [];
  const used = new Set<string>();
  // Two passes: first one job per zone, most exposed first; then, if there
  // is room, a second job in the most exposed zones.
  for (let pass = 0; pass < 2 && jobs.length < max; pass++) {
    for (const zone of ranked) {
      if (jobs.length >= max) break;
      // A different defence per job where possible: the first template whose
      // element no job uses yet, else any that fits.
      const fits = (t: PrepTemplate): boolean => !used.has(`${t.elementId}:${zone}`) && buildableIn(state, zones, t.elementId, zone) >= t.count;
      const fresh = (t: PrepTemplate): boolean => !jobs.some((job) => job.elementId === t.elementId);
      const template = templates.find((t) => fits(t) && fresh(t)) ?? templates.find(fits);
      if (!template) continue;
      if (pass === 0 && jobs.some((job) => job.zone === zone)) continue;
      used.add(`${template.elementId}:${zone}`);
      const place = config.places[zone] ?? zones.name(zone);
      jobs.push({
        id: `${challenge.id}:${template.id}:${zone}`,
        challengeId: challenge.id,
        templateId: template.id,
        elementId: template.elementId,
        zone,
        count: template.count,
        baseline: standingIn(state, zones, template.elementId, zone),
        reward: template.reward,
        label: template.label.replace("{count}", String(template.count)).replace("{place}", place),
        done: false
      });
    }
  }
  return jobs;
}

/** How far along a job is: what has been built for it, out of `count`. */
/**
 * A job's row as the player sees it: the count standing now, the target, and
 * whether it is ticked. The tick and the counter come from the one count
 * (Section 12): a row is never ticked below its target, even after a defence
 * that once completed it is demolished or lost.
 */
export function prepProgress(job: PrepObjective, state: GameState, zones: ZoneIndex): { current: number; target: number; done: boolean } {
  const current = Math.min(Math.max(0, standingIn(state, zones, job.elementId, job.zone, job.tiles ? new Set(job.tiles) : undefined) - job.baseline), job.count);
  return { current, target: job.count, done: current >= job.count };
}
