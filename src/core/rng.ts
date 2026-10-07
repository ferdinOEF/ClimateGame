/**
 * Deterministic, seedable pseudo-random numbers.
 *
 * The prototype called `Math.random()` directly for hazard severity
 * (`rolledSeverity()` in the old main.ts). That was fine for a sandbox and
 * is not fine now: the moment scores go on a shared leaderboard, two
 * players "on level 3" must actually be playing the same level 3. With
 * `Math.random()` one player can be handed a run of mild storms and
 * another a run of brutal ones, and the board is comparing two different
 * games.
 *
 * So every roll that affects difficulty now comes from a `Rng` seeded from
 * the level id (and, for the daily challenge, the date). Same level, same
 * storms, every player, every time — which is also what makes a run
 * reproducible when someone reports a balance problem.
 *
 * mulberry32: 32-bit state, one multiply-xorshift round. Chosen because it
 * is tiny, has no dependencies, passes well beyond what a game's severity
 * rolls need, and — unlike `Math.random()` — is identical across browsers
 * and across a Node test run.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // A zero state is a fixed point for this generator (it would emit the
    // same value forever), so fold it away rather than trusting callers.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Next float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Next integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Picks one item. Throws on an empty list rather than returning undefined — every call site here has a non-empty list, and a silent undefined would surface far from the bug. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty list");
    return items[this.int(0, items.length - 1)];
  }
}

/**
 * FNV-1a over a string, so a human-readable seed ("level-03", "daily-
 * 2026-09-07") can key a generator. Deliberately not `hashCode`-style
 * (sum of char codes shifted) — that collides badly on the short,
 * similar-prefixed ids this game actually uses.
 */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function rngFor(seedText: string): Rng {
  return new Rng(hashSeed(seedText));
}

/**
 * The UTC date id the daily challenge is keyed by — also the Firestore
 * document id its leaderboard lives under (`/daily/{dateId}/entries`).
 * UTC, not local time, so every player worldwide is on the same challenge
 * at the same moment and one board never splits into two.
 */
export function dailyChallengeId(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
