import type { RunStatsSnapshot } from "@core/runStats";
import type { LevelScoreBreakdown } from "@core/levelScore";
import { LEVELS } from "./levels";
import { levelsCompleted, recordFor, totalStars, type PlayerProgress } from "./progression";

/**
 * Achievements — the long-tail engagement layer.
 *
 * Deliberately a separate axis from stars. Stars reward playing a level
 * well; achievements reward playing the game *a particular way* — an
 * all-mangrove coast, a run where nothing ever broke, a full campaign
 * three-starred. They give a player who has already cleared the campaign a
 * reason to come back and play it differently.
 *
 * Each one is a pure predicate over a finished run plus the player's
 * progress, so the whole set is evaluated in one pass at level-complete
 * and nothing needs to be tracked incrementally.
 */
export interface AchievementContext {
  levelId: string;
  stats: RunStatsSnapshot;
  score: LevelScoreBreakdown;
  completed: boolean;
  /** Progress AFTER this run has been folded in, so campaign-wide achievements can see the run that earned them. */
  progress: PlayerProgress;
  /** Standing element counts on the final board, by element id. */
  standingByElement: Map<string, number>;
  /** Standing defence counts by family. */
  standingByCategory: Map<string, number>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  test: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-coast",
    name: "First Coast",
    description: "Clear your first level.",
    icon: "🌱",
    test: (c) => c.completed
  },
  {
    id: "unbroken",
    name: "Unbroken",
    description: "Clear a level without losing a single defence.",
    icon: "🛡️",
    test: (c) => c.completed && c.stats.defensesDestroyed === 0
  },
  {
    id: "not-a-scratch",
    name: "Not a Scratch",
    description: "Weather three hazards in one run with zero damage.",
    icon: "✨",
    test: (c) => c.stats.perfectDefenses >= 3
  },
  {
    id: "root-keeper",
    name: "Root Keeper",
    description: "Clear a level with only nature-based defences standing.",
    icon: "🌿",
    test: (c) =>
      c.completed &&
      (c.standingByCategory.get("nbs") ?? 0) >= 3 &&
      (c.standingByCategory.get("engineered") ?? 0) === 0
  },
  {
    id: "concrete-heart",
    name: "Concrete Heart",
    description: "Clear a level leaning on engineered defences alone.",
    icon: "🧱",
    test: (c) =>
      c.completed &&
      (c.standingByCategory.get("engineered") ?? 0) >= 3 &&
      (c.standingByCategory.get("nbs") ?? 0) === 0
  },
  {
    id: "old-ways",
    name: "The Old Ways",
    description: "Finish a run with four Khazan fields standing.",
    icon: "🌾",
    test: (c) => (c.standingByElement.get("khazan") ?? 0) >= 4
  },
  {
    id: "blue-carbon",
    name: "Blue Carbon",
    description: "Reach 25 Carbon in a single run.",
    icon: "💨",
    test: (c) => c.stats.peakCarbon >= 25
  },
  {
    id: "teeming",
    name: "Teeming",
    description: "Reach 35 Biodiversity in a single run.",
    icon: "🦀",
    test: (c) => c.stats.peakBiodiversity >= 35
  },
  {
    id: "on-a-knife-edge",
    name: "Knife Edge",
    description: "Clear a level after dropping below 10 Resilience.",
    icon: "🔪",
    test: (c) => c.completed && c.stats.lowestResilience < 10
  },
  {
    id: "yacht-money",
    name: "Yacht Money",
    description: "Park a Yacht on your coast.",
    icon: "⛵",
    test: (c) => (c.standingByElement.get("yacht") ?? 0) >= 1
  },
  {
    id: "three-star-scholar",
    name: "Three-Star Scholar",
    description: "Earn three stars on any level.",
    icon: "⭐",
    test: (c) => c.score.stars >= 3
  },
  {
    id: "campaign-clear",
    name: "Coastkeeper",
    description: "Clear every level in the campaign.",
    icon: "🏆",
    test: (c) => levelsCompleted(c.progress) >= LEVELS.length
  },
  {
    id: "perfect-campaign",
    name: "Perfect Coast",
    description: "Three-star every level in the campaign.",
    icon: "👑",
    test: (c) => totalStars(c.progress) >= LEVELS.length * 3
  },
  {
    id: "speedrunner",
    name: "Ahead of the Weather",
    description: "Clear a level well inside its turn budget.",
    icon: "⚡",
    test: (c) => c.completed && c.score.underPar >= 80
  },
  {
    id: "persistent",
    name: "Persistent",
    description: "Clear a level you had already failed three times.",
    icon: "🔁",
    test: (c) => c.completed && recordFor(c.progress, c.levelId).attempts >= 4
  }
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/**
 * Returns the ids newly unlocked by this run — never ones already held, so
 * a caller can toast exactly what it gets back without filtering.
 */
export function newlyUnlocked(ctx: AchievementContext, alreadyHeld: readonly string[]): string[] {
  const held = new Set(alreadyHeld);
  const unlocked: string[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (held.has(achievement.id)) continue;
    // A badly-authored predicate should cost one achievement, not the
    // whole level-complete screen — this runs on the player's win moment.
    try {
      if (achievement.test(ctx)) unlocked.push(achievement.id);
    } catch {
      /* ignore a broken predicate */
    }
  }
  return unlocked;
}
