/**
 * What actually happened during one attempt at a level.
 *
 * `GameState` answers "what does the board look like right now" — it has no
 * memory of events, by design (a destroyed defense simply stops existing;
 * nothing records that it ever did). Objectives and achievements both need
 * the opposite: "how many storms have you weathered", "did you get through
 * without losing a single defense", "what is the worst Resilience has been".
 * That history lives here rather than being bolted onto `GameState`, so the
 * board model stays a pure snapshot and this stays a pure event log.
 *
 * Every field is a plain number/set updated by an explicit `record*` call
 * from the session layer. Nothing in here reaches into the game state on
 * its own.
 */
export interface RunStatsSnapshot {
  hazardsSurvived: number;
  /** Hazards that did no damage at all and broke nothing — the "clean hold" the Unbroken achievement and several level objectives key off. */
  perfectDefenses: number;
  defensesDestroyed: number;
  defensesOverwhelmed: number;
  elementsBuilt: number;
  coinSpent: number;
  /** Lowest Resilience ever seen this run, not the current value — a run that dipped to 4 and recovered is a different story from one that never dropped below 80. */
  lowestResilience: number;
  /** Highest each co-benefit meter reached, so an objective can be met at any point rather than only on the final frame. */
  peakBiodiversity: number;
  peakCarbon: number;
  totalHazardDamage: number;
}

export class RunTracker {
  hazardsSurvived = 0;
  perfectDefenses = 0;
  defensesDestroyed = 0;
  defensesOverwhelmed = 0;
  elementsBuilt = 0;
  coinSpent = 0;
  lowestResilience = Number.POSITIVE_INFINITY;
  peakBiodiversity = 0;
  peakCarbon = 0;
  totalHazardDamage = 0;

  /** Element ids built this run, with counts — drives "build 3 mangroves" style objectives without needing to re-scan the board. */
  readonly builtByElement = new Map<string, number>();

  reset(): void {
    this.hazardsSurvived = 0;
    this.perfectDefenses = 0;
    this.defensesDestroyed = 0;
    this.defensesOverwhelmed = 0;
    this.elementsBuilt = 0;
    this.coinSpent = 0;
    this.lowestResilience = Number.POSITIVE_INFINITY;
    this.peakBiodiversity = 0;
    this.peakCarbon = 0;
    this.totalHazardDamage = 0;
    this.builtByElement.clear();
  }

  recordBuild(elementId: string, cost: number): void {
    this.elementsBuilt++;
    this.coinSpent += cost;
    this.builtByElement.set(elementId, (this.builtByElement.get(elementId) ?? 0) + 1);
  }

  /**
   * A removed element gives back its slot in the per-element tally but not
   * the Coin it cost — matching `removeElement()`'s own no-refund policy in
   * the session layer. Without this, "build 3 Mangroves" could be satisfied
   * by building and bulldozing the same tile three times.
   */
  recordRemoval(elementId: string): void {
    const count = this.builtByElement.get(elementId);
    if (count === undefined) return;
    if (count <= 1) this.builtByElement.delete(elementId);
    else this.builtByElement.set(elementId, count - 1);
    this.elementsBuilt = Math.max(0, this.elementsBuilt - 1);
  }

  /**
   * Called once per resolved hazard, after the game state has already
   * applied its outcome.
   *
   * `damagedTiles` — not `totalDamage` — is what decides whether the coast
   * held. Summing damage across the whole map and comparing against a small
   * floor sounds equivalent but is not: a severe event spreads a trace of
   * damage over dozens of tiles, and those traces add up past any floor
   * even when nothing visibly happened anywhere. Counting tiles that
   * crossed the threshold the renderer itself uses to draw an overlay
   * matches what the player actually sees: either something got through
   * somewhere, or it did not.
   */
  recordHazard(event: { totalDamage: number; damagedTiles: number; destroyed: number; overwhelmed: number }): void {
    this.hazardsSurvived++;
    this.defensesDestroyed += event.destroyed;
    this.defensesOverwhelmed += event.overwhelmed;
    this.totalHazardDamage += event.totalDamage;
    // "Perfect" means the coast genuinely held: nothing broke, nothing was
    // pushed past its limit, and no tile took visible damage.
    if (event.destroyed === 0 && event.overwhelmed === 0 && event.damagedTiles === 0) {
      this.perfectDefenses++;
    }
  }

  /** Called on every HUD refresh — cheap, and it is the only way peaks/troughs get seen between discrete events. */
  sampleMeters(meters: { resilience: number; biodiversity: number; carbon: number }): void {
    this.lowestResilience = Math.min(this.lowestResilience, meters.resilience);
    this.peakBiodiversity = Math.max(this.peakBiodiversity, meters.biodiversity);
    this.peakCarbon = Math.max(this.peakCarbon, meters.carbon);
  }

  snapshot(): RunStatsSnapshot {
    return {
      hazardsSurvived: this.hazardsSurvived,
      perfectDefenses: this.perfectDefenses,
      defensesDestroyed: this.defensesDestroyed,
      defensesOverwhelmed: this.defensesOverwhelmed,
      elementsBuilt: this.elementsBuilt,
      coinSpent: this.coinSpent,
      // A run where the meters were never sampled would otherwise report
      // Infinity here, which every downstream comparison would silently
      // treat as "never dipped" — report the starting-Resilience-equivalent
      // 100 instead, the same value a genuinely untouched run would show.
      lowestResilience: Number.isFinite(this.lowestResilience) ? this.lowestResilience : 100,
      peakBiodiversity: this.peakBiodiversity,
      peakCarbon: this.peakCarbon,
      totalHazardDamage: this.totalHazardDamage
    };
  }
}
