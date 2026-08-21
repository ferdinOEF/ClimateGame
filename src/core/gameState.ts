import { type AxialCoord, axialKey } from "./hex";
import { ELEMENT_BY_ID, type ElementDef } from "./elements";

export interface PlacedTile {
  coord: AxialCoord;
  terrainId: string;
}

export interface ElementInstance {
  elementId: string;
  builtOnTurn: number;
  /** Permanent absorption reduction from graceful-degrade events or unpaid maintenance. */
  degradeAmount: number;
}

/** A world-init element the player owns from turn one — pre-built, not purchased (Section 4/8's "small coastal claim + 10 pre-built Houses" starting state). */
export interface StartingElementSeed {
  coord: AxialCoord;
  elementId: string;
}

const STARTING_COIN = 50;
const STARTING_TRUST = 50;
const STARTING_RESILIENCE = 100;
const STARTING_POPULATION = 50;
const RESILIENCE_DAMAGE_FACTOR = 0.5;
const CATASTROPHIC_TRUST_PENALTY = 8; // per destroyed engineered defense — stings more than an NBS shortfall
const WEATHERED_TRUST_BONUS = 2;
const CLAIM_COST = 4; // Section 2: "costs a small amount of Coin"
// STEP_PROMPT_economy_food_yacht.md item 2: a running Food deficit costs
// Trust and (less directly) Resilience every turn — a soft, non-blocking
// consequence, never a hard build/claim block. Both PLACEHOLDER
// magnitudes, same convention as every other flagged number in this
// codebase — feed into STEP_PROMPT_balance_tuning.md's harness.
const FOOD_DEFICIT_TRUST_FACTOR = 0.4;
const FOOD_DEFICIT_RESILIENCE_FACTOR = 0.15;

/**
 * Pure game-logic state (v2.1): the terrain map is fixed at construction —
 * `placed` holds every tile from the authored map.json, not something the
 * player grows. What the player grows is `claimed`, a subset of `placed`.
 * v2.2 merged buildings and defenses into one `elements.json` roster — a
 * single `elements` map replaces the old separate `buildings`/`defenses`
 * maps. No Three.js here — the render layer mirrors this to draw the scene.
 */
export class GameState {
  readonly placed = new Map<string, PlacedTile>();
  readonly claimed = new Set<string>();
  readonly elements = new Map<string, ElementInstance>(); // coord key -> instance
  coin: number; // set from `startingCoin` in the constructor
  turn = 0;
  /** Section 7's meters. Biodiversity is derived (see `meterTotal`); Trust and Resilience are running totals. */
  trust = STARTING_TRUST;
  resilience = STARTING_RESILIENCE;
  /** Section 2's standing severity baseline: never decreases within an era, biases future hazard rolls upward. */
  severityBaseline = 0;
  /** Section 2's light meta-progression hook: preserved across `startNewEra()`. */
  erasCompleted = 0;
  private readonly startingClaim: AxialCoord[];
  private readonly startingElements: StartingElementSeed[];
  private readonly startingCoin: number;

  /**
   * @param mapTiles The fixed, pre-generated map (Section 4) — every tile
   *   that exists, loaded once from map.json in real play.
   * @param startingClaim The player's initial claimed cluster. Defaults to
   *   claiming every tile passed in, which is convenient for small
   *   hand-built test fixtures; real play always passes an explicit small
   *   (2-3 hex) cluster.
   * @param startingElements Pre-built elements the player owns from turn
   *   one (Section 4/8, v2.4: 10 Houses on Land) — claimed and placed for
   *   free, on top of `startingClaim`, both now and on every `startNewEra()`.
   * @param startingCoin Overrides the default starting Coin (Section 8:
   *   "explicitly a temporary testing value," e.g. 1000 in real play).
   */
  constructor(
    mapTiles: PlacedTile[],
    startingClaim?: AxialCoord[],
    startingElements: StartingElementSeed[] = [],
    startingCoin: number = STARTING_COIN
  ) {
    for (const tile of mapTiles) this.placed.set(axialKey(tile.coord), tile);
    this.startingClaim = startingClaim ?? mapTiles.map((t) => t.coord);
    this.startingElements = startingElements;
    this.startingCoin = startingCoin;
    this.coin = startingCoin;
    for (const coord of this.startingClaim) {
      if (this.placed.has(axialKey(coord))) this.claimed.add(axialKey(coord));
    }
    this.applyStartingElements();
  }

  private applyStartingElements(): void {
    for (const seed of this.startingElements) {
      const key = axialKey(seed.coord);
      if (!this.placed.has(key)) continue;
      this.claimed.add(key);
      this.elements.set(key, { elementId: seed.elementId, builtOnTurn: 0, degradeAmount: 0 });
    }
  }

  /**
   * Test/scenario-only: adds a tile to the fixed map (bypassing mapgen) and
   * immediately claims it, for building deterministic hazard-resolution
   * fixtures. Never called from the real play path (Section 10's sanctioned
   * debug escape hatch, same spirit as the ?autoclaim URL hook).
   */
  debugForcePlace(coord: AxialCoord, terrainId: string): void {
    const key = axialKey(coord);
    this.placed.set(key, { coord, terrainId });
    this.claimed.add(key);
  }

  /**
   * v2.2: claiming is no longer adjacency-gated — any unclaimed hex
   * anywhere on the fixed map can be claimed directly, the one deliberate
   * departure from Dorfromantik's own "must touch the frontier" rule
   * (Section 2). `isClaimable` is just "unclaimed and part of the map."
   */
  isClaimable(coord: AxialCoord): boolean {
    const key = axialKey(coord);
    return this.placed.has(key) && !this.claimed.has(key);
  }

  /** Total number of unclaimed tiles left to claim, for the HUD prompt. */
  get claimableCount(): number {
    return this.placed.size - this.claimed.size;
  }

  canClaim(coord: AxialCoord): boolean {
    return this.coin >= CLAIM_COST && this.isClaimable(coord);
  }

  /** Claims `coord` if unclaimed and affordable — no adjacency requirement. Counts as a turn, same cadence as the old tile-placement loop. */
  claim(coord: AxialCoord): boolean {
    if (!this.canClaim(coord)) return false;
    this.coin -= CLAIM_COST;
    this.claimed.add(axialKey(coord));
    this.advanceTurn();
    return true;
  }

  private maturityFraction(inst: ElementInstance, def: ElementDef): number {
    return def.matureTurns > 0 ? Math.min(1, Math.max(0, (this.turn - inst.builtOnTurn) / def.matureTurns)) : 1;
  }

  /**
   * One claim = one turn (Section 2's Calm-phase cadence): elements pay out
   * their `effects.money` (the same generic accumulator that drives every
   * other meter — see `meterTotal`), and defenses with upkeep either get
   * paid or silently weaken (the khazan/small-dam "neglect decays it"
   * tradeoff). Public because the hazard/turn system also needs to advance
   * it directly (e.g. maintenance still ticks between hazard events).
   */
  advanceTurn(): void {
    this.turn++;
    this.coin += this.meterTotal("money");
    for (const [key, inst] of this.elements) {
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (!def || !def.maintenanceCostPerTurn || def.maintenanceCostPerTurn <= 0) continue;
      if (this.coin >= def.maintenanceCostPerTurn) {
        this.coin -= def.maintenanceCostPerTurn;
      } else if (def.maintenanceNeglectPenaltyPerTurn) {
        inst.degradeAmount += def.maintenanceNeglectPenaltyPerTurn;
        this.elements.set(key, inst);
      }
    }

    // STEP_PROMPT_economy_food_yacht.md item 2: a running Food deficit
    // (more Houses than Mangrove/Khazan can feed) visibly costs Trust and
    // Resilience every turn — real pressure to build enough food
    // production, but never a hard block on claiming or building.
    const deficit = Math.max(0, -this.food);
    if (deficit > 0) {
      this.trust = Math.max(0, this.trust - deficit * FOOD_DEFICIT_TRUST_FACTOR);
      this.resilience = Math.max(0, this.resilience - deficit * FOOD_DEFICIT_RESILIENCE_FACTOR);
    }
  }

  /** Element options valid at `coord` right now (must be claimed, terrain-matched, nothing already built there), regardless of affordability. */
  buildableAt(coord: AxialCoord): ElementDef[] {
    const key = axialKey(coord);
    const tile = this.placed.get(key);
    if (!tile || !this.claimed.has(key) || this.elements.has(key)) return [];
    const results: ElementDef[] = [];
    for (const def of ELEMENT_BY_ID.values()) {
      if (def.validTerrainIds.includes(tile.terrainId)) results.push(def);
    }
    return results;
  }

  canBuild(coord: AxialCoord, elementId: string): boolean {
    const def = ELEMENT_BY_ID.get(elementId);
    if (!def) return false;
    if (this.coin < def.buildCost) return false;
    return this.buildableAt(coord).some((d) => d.id === elementId);
  }

  /** Builds `elementId` at `coord`, deducting its cost. Returns false (no-op) if illegal/unaffordable. */
  build(coord: AxialCoord, elementId: string): boolean {
    if (!this.canBuild(coord, elementId)) return false;
    const def = ELEMENT_BY_ID.get(elementId)!;
    this.coin -= def.buildCost;
    this.elements.set(axialKey(coord), { elementId, builtOnTurn: this.turn, degradeAmount: 0 });
    return true;
  }

  /** True if a building-kind element (not a defense) is standing at this coord key — used by cyclone's Trust penalty. */
  hasBuildingAt(key: string): boolean {
    const inst = this.elements.get(key);
    if (!inst) return false;
    return ELEMENT_BY_ID.get(inst.elementId)?.kind === "building";
  }

  /** True if at least one instance of `elementId` exists anywhere on the map — e.g. the Yacht HUD goal's "achieved" state (STEP_PROMPT_economy_food_yacht.md item 4), which only cares that one exists, not where. */
  hasElement(elementId: string): boolean {
    for (const inst of this.elements.values()) {
      if (inst.elementId === elementId) return true;
    }
    return false;
  }

  /** Current absorption fraction [0,1] a defense provides right now, factoring maturity and any degrade. */
  effectiveAbsorption(coord: AxialCoord): number {
    const inst = this.elements.get(axialKey(coord));
    if (!inst) return 0;
    const def = ELEMENT_BY_ID.get(inst.elementId);
    if (!def || def.absorptionAtMaturity === undefined) return 0;
    const base = def.absorptionAtMaturity * this.maturityFraction(inst, def);
    return Math.max(0, base - inst.degradeAmount);
  }

  /** Used by the hazard resolver: permanently weakens a graceful (NBS/hybrid) defense in place. */
  degradeDefense(coord: AxialCoord, amount: number): void {
    const key = axialKey(coord);
    const inst = this.elements.get(key);
    if (inst) inst.degradeAmount += amount;
  }

  /** Used by the hazard resolver: removes a catastrophically-failed engineered defense. */
  destroyDefense(coord: AxialCoord): void {
    this.elements.delete(axialKey(coord));
  }

  /**
   * The generic effects accumulator (v2.2's standing architectural
   * requirement): sums every standing element's `effects[key]`, weighted by
   * how mature it is. Nothing in this function knows what "biodiversity" or
   * "money" mean — a new meter is added entirely in elements.json,
   * never here. A destroyed defense simply stops contributing, no separate
   * bookkeeping needed.
   */
  meterTotal(key: string): number {
    let total = 0;
    for (const inst of this.elements.values()) {
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (!def) continue;
      const delta = def.effects[key];
      if (delta === undefined) continue;
      total += delta * this.maturityFraction(inst, def);
    }
    return total;
  }

  get biodiversity(): number {
    return this.meterTotal("biodiversity");
  }

  get carbon(): number {
    return this.meterTotal("carbon");
  }

  /**
   * v2.4 (Section 4/7/8): Food, produced by Mangrove/Khazan and consumed
   * by House. A deficit never hard-blocks a claim or build — Section 2's
   * design brief is explicit that's too harsh a wall for the "12-year-old
   * can play this" end of the game — but `advanceTurn()` does drain Trust
   * and Resilience every turn a deficit is running (STEP_PROMPT_economy_
   * food_yacht.md item 2), so building enough Mangrove/Khazan to sustain
   * the Houses already standing is a real, felt part of play now.
   */
  get food(): number {
    return this.meterTotal("food");
  }

  /** v2.4 (Section 4/7/8): a simple placeholder growth hook — population scales with House count via the same generic effects accumulator as every other meter, no growth curve specified beyond that yet. */
  get population(): number {
    return STARTING_POPULATION + this.meterTotal("population");
  }

  /**
   * Called by the hazard resolvers after resolving: Resilience drops with
   * unmitigated damage, Trust takes an extra hit per catastrophic
   * engineered failure (stings more than an NBS shortfall) or a small
   * recovery for weathering the hazard cleanly.
   */
  applyHazardOutcome(totalDamage: number, destroyedDefenseCount: number): void {
    this.resilience = Math.max(0, this.resilience - totalDamage * RESILIENCE_DAMAGE_FACTOR);
    if (destroyedDefenseCount > 0) {
      this.trust = Math.max(0, this.trust - destroyedDefenseCount * CATASTROPHIC_TRUST_PENALTY);
    } else {
      this.trust = Math.min(100, this.trust + WEATHERED_TRUST_BONUS);
    }
    this.severityBaseline += 0.04;
  }

  /** Era soft-ends when Resilience hits zero (Section 2) — no hard game-over, just this. */
  get isEraOver(): boolean {
    return this.resilience <= 0;
  }

  /**
   * Section 2: "a new era keeps light meta-progression ... and starts a
   * fresh map." The map itself (`placed`) is fixed and persists — v2.1's
   * scope note: "a new seed per era is a reasonable later enhancement, not
   * required now." What resets is the player's footprint on it.
   */
  startNewEra(): void {
    this.erasCompleted++;
    this.claimed.clear();
    for (const coord of this.startingClaim) {
      if (this.placed.has(axialKey(coord))) this.claimed.add(axialKey(coord));
    }
    this.elements.clear();
    this.applyStartingElements();
    this.coin = this.startingCoin;
    this.trust = STARTING_TRUST;
    this.resilience = STARTING_RESILIENCE;
    this.severityBaseline = 0;
    this.turn = 0;
  }
}
