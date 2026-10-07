import { hashSeed, Rng } from "./rng";
import { QUARTERS_PER_YEAR } from "./quarters";

/**
 * The Panjim 2050 climate: three scheduled challenges, a rising baseline, and
 * what the Outlook is allowed to say about each challenge at any moment.
 *
 * THE SCHEDULE
 *
 * Each challenge has a nominal year (Cyclone about 2032, Flood about 2040,
 * the compound event about 2048) and a seeded jitter of a year or two either
 * way, so two runs on different seeds are not the same calendar, while the
 * same seed always is. The jittered quarter is then nudged to the season the
 * hazard really comes in: Goan cyclones in the pre- and post-monsoon months
 * (Q2, Q4), monsoon floods in Q3. That keeps the calendar grounded, and it
 * gives an attentive player one more clue.
 *
 * THE OUTLOOK (Into the Breach's telegraph, stretched over years)
 *
 * Far out, the Outlook shows only a season: "Cyclone season, 2030–2034",
 * centred on the nominal year, so it gives nothing away about the jitter. As
 * the date approaches, the window narrows around the true date, offset by a
 * seeded amount so its centre is not a tell. Two years out the Forecast
 * LOCKS: the exact quarter and a 1–3 strength rating. Locking is the moment
 * the player can plan precisely, and the moment the retry snapshot is taken.
 *
 * THE BASELINE
 *
 * The sea rises a little every year whatever the player does. It scales every
 * challenge's strength, so a challenge's strength is fixed by its date, not by
 * how fast anyone played. What makes waiting costly is that every quarter
 * spent banking coin is a quarter not spent building, and defences take years
 * to mature.
 */
export type ChallengeKind = "cyclone" | "flood" | "compound";

export interface ChallengeDef {
  id: string;
  name: string;
  kind: ChallengeKind;
  /** Nominal year the challenge comes in. */
  year: number;
  /** Seeded jitter, plus or minus this many years. */
  jitterYears: number;
  /** Base strength before the rising baseline, on the 1–3 scale. */
  strength: number;
}

export interface ClimateConfig {
  challenges: ChallengeDef[];
  /** How much the baseline multiplier rises per year, e.g. 0.02 = 2% a year. */
  baselinePerYear: number;
  /** Sea level rise shown in the Outlook, in cm per year. */
  seaLevelCmPerYear: number;
  /** Quarters before a challenge that its Forecast locks. */
  forecastLockQuarters: number;
  /** Quarters before a challenge that its window starts to narrow. */
  narrowFromQuarters: number;
  /** Zone-defence points one unit of challenge strength is worth (core/zones.ts). */
  intensityPerStrength: number;
}

export interface ScheduledChallenge extends ChallengeDef {
  /** Quarter index (from Q1 of the start year) the challenge lands on. */
  quarter: number;
  /** Seeded offset in [-1, 1] that skews the narrowing window so its centre is not the answer. */
  windowSkew: number;
}

/** The quarters of the year each kind may land in, 0-based (0 = Q1). */
const SEASONS: Record<ChallengeKind, number[]> = {
  cyclone: [1, 3],
  flood: [2],
  compound: [1, 2]
};

/**
 * The run's challenge calendar for a seed. Deterministic: the same seed text
 * always gives the same quarters. Challenges stay in order, at least two
 * years apart, and inside the run.
 */
export function buildSchedule(config: ClimateConfig, seedText: string, startYear: number, endYear: number): ScheduledChallenge[] {
  const rng = new Rng(hashSeed(`climate:${seedText}`));
  const lastQuarter = (endYear - startYear) * QUARTERS_PER_YEAR - 1;
  const schedule: ScheduledChallenge[] = [];
  let earliest = 2 * QUARTERS_PER_YEAR;
  for (const def of config.challenges) {
    const jitter = rng.range(-def.jitterYears, def.jitterYears);
    let quarter = Math.round((def.year + jitter - startYear) * QUARTERS_PER_YEAR);
    quarter = snapToSeason(quarter, SEASONS[def.kind]);
    quarter = Math.min(lastQuarter, Math.max(earliest, quarter));
    if (!SEASONS[def.kind].includes(quarter % QUARTERS_PER_YEAR)) quarter = snapToSeason(quarter, SEASONS[def.kind], lastQuarter);
    schedule.push({ ...def, quarter, windowSkew: rng.range(-1, 1) });
    earliest = quarter + 2 * QUARTERS_PER_YEAR;
  }
  return schedule;
}

/** Moves `quarter` to the nearest quarter-of-year in `seasons`, never past `max`. */
function snapToSeason(quarter: number, seasons: number[], max = Infinity): number {
  let best = quarter;
  let bestDistance = Infinity;
  for (let candidate = quarter - 3; candidate <= quarter + 3; candidate++) {
    if (candidate < 0 || candidate > max) continue;
    if (!seasons.includes(candidate % QUARTERS_PER_YEAR)) continue;
    const distance = Math.abs(candidate - quarter);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** The baseline multiplier on challenge strength at a given quarter: 1 in 2025, rising every year. */
export function baselineMultiplier(config: ClimateConfig, quarter: number): number {
  return 1 + config.baselinePerYear * (quarter / QUARTERS_PER_YEAR);
}

/** Sea level rise since 2025 in whole cm, for the Outlook. */
export function seaLevelCm(config: ClimateConfig, quarter: number): number {
  return Math.round(config.seaLevelCmPerYear * (quarter / QUARTERS_PER_YEAR));
}

/** A challenge's strength when it lands: base strength scaled by the baseline on its date. */
export function challengeStrength(config: ClimateConfig, challenge: ScheduledChallenge): number {
  return challenge.strength * baselineMultiplier(config, challenge.quarter);
}

/** The 1–3 icon rating the Forecast shows. */
export function strengthIcons(strength: number): 1 | 2 | 3 {
  if (strength < 1.6) return 1;
  if (strength < 2.8) return 2;
  return 3;
}

export type OutlookPhase = "far" | "near" | "locked" | "past";

export interface ChallengeOutlook {
  challenge: ScheduledChallenge;
  phase: OutlookPhase;
  quartersUntil: number;
  /** Window shown on the timeline, in fractional years. */
  windowStart: number;
  windowEnd: number;
  /** Only once locked: the exact quarter, and the strength rating. */
  exactQuarter?: number;
  icons?: 1 | 2 | 3;
}

/** What the Outlook may show about `challenge` at quarter `now`. Never reveals more than its phase allows. */
export function outlookFor(config: ClimateConfig, challenge: ScheduledChallenge, now: number, startYear: number): ChallengeOutlook {
  const quartersUntil = challenge.quarter - now;
  const trueYear = startYear + challenge.quarter / QUARTERS_PER_YEAR;
  if (quartersUntil < 0) {
    return { challenge, phase: "past", quartersUntil, windowStart: trueYear, windowEnd: trueYear + 0.25 };
  }
  if (quartersUntil <= config.forecastLockQuarters) {
    return {
      challenge,
      phase: "locked",
      quartersUntil,
      windowStart: trueYear,
      windowEnd: trueYear + 0.25,
      exactQuarter: challenge.quarter,
      icons: strengthIcons(challengeStrength(config, challenge))
    };
  }
  const farHalf = challenge.jitterYears + 0.5;
  if (quartersUntil > config.narrowFromQuarters) {
    return { challenge, phase: "far", quartersUntil, windowStart: challenge.year - farHalf, windowEnd: challenge.year + farHalf };
  }
  // Narrowing: the half-width shrinks from the far window to half a year at
  // lock, around the true date skewed by a seeded offset that always keeps
  // the true date inside the window.
  const span = config.narrowFromQuarters - config.forecastLockQuarters;
  const t = (quartersUntil - config.forecastLockQuarters) / span;
  const half = 0.5 + t * (farHalf - 0.5);
  const centre = trueYear + 0.125 + challenge.windowSkew * Math.max(0, half - 0.375);
  return { challenge, phase: "near", quartersUntil, windowStart: centre - half, windowEnd: centre + half };
}
