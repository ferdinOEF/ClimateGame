import type { GameState } from "./gameState";
import type { ChallengeKind } from "./climate";
import type { Exposure } from "./exposure";
import { FRONTS, type ZoneIndex } from "./zones";

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
  /** Coin paid on completion, before the balance preset's multiplier. */
  reward: number;
  /** "Plant {count} pandanus on the beach at {place}". */
  label: string;
}

export interface PrepConfig {
  templates: PrepTemplate[];
  /** What to call each zone in a label: "the Ourem creek". */
  places: Record<string, string>;
  /** At most this many jobs per storm (default 3). */
  max?: number;
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
}

function standingIn(state: GameState, zones: ZoneIndex, elementId: string, zone: string): number {
  let count = 0;
  for (const [key, inst] of state.elements) {
    if (inst.elementId === elementId && zones.zoneOf(key) === zone) count++;
  }
  return count;
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
  const path = [...new Set(FRONTS[challenge.kind].flatMap((front) => front.path))];
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
export function prepProgress(job: PrepObjective, state: GameState, zones: ZoneIndex): { current: number; target: number } {
  const current = Math.max(0, standingIn(state, zones, job.elementId, job.zone) - job.baseline);
  return { current: Math.min(current, job.count), target: job.count };
}
