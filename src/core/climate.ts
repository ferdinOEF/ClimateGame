/**
 * The Panjim 2050 climate: three storms on a fixed calendar.
 *
 * THE CALENDAR (Section 5)
 *
 * The run is 25 years, 2026 to 2050, one turn a year. Each storm comes at the
 * end of a fixed year, at a fixed strength and, for a cyclone, a fixed
 * landfall: the cyclone in 2030 (turn 5), the monsoon flood in 2040
 * (turn 15), the cyclone and flood together in 2050
 * (turn 25). Nothing here is drawn from a seed: every player meets the same
 * three storms at the same moments, so the game is about where to build, not
 * about guessing when.
 *
 * Pure: no DOM, no renderer.
 */
export type ChallengeKind = "cyclone" | "flood" | "compound";

export interface ChallengeDef {
  id: string;
  name: string;
  kind: ChallengeKind;
  /** The year the storm comes, at its end. */
  year: number;
  /** Strength on the level's scale (the hazard model's input). Fixed: no baseline, no jitter. */
  strength: number;
  /** Cyclone and compound: the open-sea tile it comes ashore at, "q,r" (core/hazardModel.ts). */
  landfall?: string;
  /**
   * Land tiles this storm never reaches, as [q, r] (Section 23.1, a game
   * rule): the sheltered middle of Taleigao in the 2050 storm. No water or
   * wind there, so no home there is lost, at risk or in its objective.
   */
  shelteredTiles?: [number, number][];
  /** What the player is told the sheltered tiles are, after "does not reach": "the sheltered middle of Taleigao". */
  shelteredPlace?: string;
}

/** A storm's sheltered tiles as "q,r" keys, or undefined when it has none. */
export function shelterOf(challenge: Pick<ChallengeDef, "shelteredTiles">): ReadonlySet<string> | undefined {
  const tiles = challenge.shelteredTiles;
  return tiles && tiles.length > 0 ? new Set(tiles.map(([q, r]) => `${q},${r}`)) : undefined;
}

export interface ClimateConfig {
  challenges: ChallengeDef[];
  /** Sea level rise shown in the Outlook, in cm per year. */
  seaLevelCmPerYear: number;
  /** Zone-defence points one unit of challenge strength is worth (core/zones.ts). */
  intensityPerStrength: number;
  /**
   * Where the monsoon flood comes from, as "q,r" river tiles (Section 16.5:
   * Panaji's upstream Mandovi at the east edge of the board). Absent: the
   * hazard model's automatic rule, the farthest stretch of river from the sea.
   */
  floodSource?: string[];
}

export interface ScheduledChallenge extends ChallengeDef {
  /** The turn (1 = the start year) at whose end the storm resolves. */
  turn: number;
}

/**
 * The run's storm calendar: each storm on the turn of its year, in order.
 * Storms outside the run are dropped.
 */
export function buildSchedule(config: ClimateConfig, startYear: number, endYear: number): ScheduledChallenge[] {
  return config.challenges
    .filter((def) => def.year >= startYear && def.year <= endYear)
    .map((def) => ({ ...def, turn: def.year - startYear + 1 }))
    .sort((a, b) => a.turn - b.turn);
}

/** Sea level rise since the start year in whole cm, for the Outlook. `yearsElapsed` counts whole years. */
export function seaLevelCm(config: ClimateConfig, yearsElapsed: number): number {
  return Math.round(config.seaLevelCmPerYear * yearsElapsed);
}

/** A storm's strength when it lands: fixed in the data. */
export function challengeStrength(_config: ClimateConfig, challenge: ChallengeDef): number {
  return challenge.strength;
}

/** The 1–3 icon rating the Outlook shows. */
export function strengthIcons(strength: number): 1 | 2 | 3 {
  if (strength < 1.6) return 1;
  if (strength < 2.4) return 2;
  return 3;
}

/**
 * Years until a storm, counting this year: at the start of its own year it is
 * 1 ("this year"), the year before 2. 0 or less once it has passed.
 */
export function yearsUntil(challenge: ScheduledChallenge, turn: number): number {
  return challenge.turn - turn + 1;
}
