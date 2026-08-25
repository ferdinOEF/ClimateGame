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
  /**
   * STEP_PROMPT_hazard_science.md Section 4: how much of a `floodBufferCapacityM3`
   * reservoir (Khazan only, today) is currently filled — 0 when empty/fully
   * available. Meaningless for elements without that field; always present
   * (default 0) rather than optional, so callers never need an undefined check.
   */
  floodBufferFilled: number;
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
// STEP_PROMPT_economy_food_yacht.md item 2: a running Food deficit used to
// cost Trust and (less directly) Resilience every turn in `advanceTurn()`.
// STEP_PROMPT_manual_only_mode.md removed that automatic drain (state now
// only changes via an explicit action) — these two constants have no
// remaining call site, kept rather than deleted per this project's "don't
// delete useful plumbing" convention, in case a manual equivalent (or the
// automatic drain itself) comes back once the mode question is revisited.
const FOOD_DEFICIT_TRUST_FACTOR = 0.4;
const FOOD_DEFICIT_RESILIENCE_FACTOR = 0.15;
// STEP_PROMPT_hazard_science.md Section 4: a Khazan/Small Dam's flood
// buffer used to refill gradually across turns in `advanceTurn()`.
// STEP_PROMPT_manual_only_mode.md removed that automatic recovery —
// `floodBufferFilled` now only changes via `drawDownFloodBuffer()` (an
// actual triggered Flood). Kept rather than deleted for the same reason as
// the two constants above; a manual "drain the buffer" control was
// explicitly flagged as possible future scope, not built this pass.
const FLOOD_BUFFER_RECOVERY_RATE = 0.15;

/**
 * Pure game-logic state. `placed` holds every tile from the authored
 * map.json — the fixed map, never grown or shrunk by play. STEP_PROMPT_
 * remove_claiming.md: every tile is buildable from turn one, no separate
 * "claim it first" step — `claimed` stays in the codebase (every existing
 * check that reads it, e.g. `buildableAt()`, keeps working unchanged) but
 * is now always exactly equal to `placed`, not a growing subset of it.
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
  private readonly startingElements: StartingElementSeed[];
  private readonly startingCoin: number;

  /**
   * @param mapTiles The fixed, pre-generated map (Section 4) — every tile
   *   that exists, loaded once from map.json in real play. Every tile
   *   starts claimed (see class comment).
   * @param startingElements Pre-built elements the player owns from turn
   *   one (Section 4/8, v2.4: 10 Houses on Land) — placed for free, both
   *   now and on every `startNewEra()`.
   * @param startingCoin Overrides the default starting Coin (Section 8:
   *   "explicitly a temporary testing value," e.g. 1000 in real play).
   */
  constructor(mapTiles: PlacedTile[], startingElements: StartingElementSeed[] = [], startingCoin: number = STARTING_COIN) {
    for (const tile of mapTiles) {
      const key = axialKey(tile.coord);
      this.placed.set(key, tile);
      this.claimed.add(key);
    }
    this.startingElements = startingElements;
    this.startingCoin = startingCoin;
    this.coin = startingCoin;
    this.applyStartingElements();
  }

  private applyStartingElements(): void {
    for (const seed of this.startingElements) {
      const key = axialKey(seed.coord);
      if (!this.placed.has(key)) continue;
      this.claimed.add(key);
      this.elements.set(key, { elementId: seed.elementId, builtOnTurn: 0, degradeAmount: 0, floodBufferFilled: 0 });
    }
  }

  /**
   * Test/scenario-only: adds a tile to the fixed map (bypassing mapgen) and
   * immediately claims it, for building deterministic hazard-resolution
   * fixtures. Never called from the real play path (Section 10's sanctioned
   * debug escape hatch).
   */
  debugForcePlace(coord: AxialCoord, terrainId: string): void {
    const key = axialKey(coord);
    this.placed.set(key, { coord, terrainId });
    this.claimed.add(key);
  }

  /** Total number of tiles nothing has been built on yet, for the HUD's soft progress prompt (STEP_PROMPT_remove_claiming.md). */
  get emptyTileCount(): number {
    return this.placed.size - this.elements.size;
  }

  private maturityFraction(inst: ElementInstance, def: ElementDef): number {
    return def.matureTurns > 0 ? Math.min(1, Math.max(0, (this.turn - inst.builtOnTurn) / def.matureTurns)) : 1;
  }

  /**
   * STEP_PROMPT_manual_only_mode.md: stripped down to just the turn
   * counter — every background side effect that used to fire here on its
   * own (income, maintenance/neglect degrade, Food-deficit Trust/
   * Resilience drain, flood-buffer recovery) is gone. State now only
   * changes in response to an explicit action: build, remove, trigger a
   * hazard, or hit Reset Board. `this.turn` itself still has to advance on
   * every `build()` call, though — it's what drives element maturity
   * (`maturityFraction()`'s `this.turn - inst.builtOnTurn`), a consequence
   * of the build action itself, not background drift. Public because the
   * hazard/turn system also needs to advance it directly.
   */
  advanceTurn(): void {
    this.turn++;
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

  /**
   * Builds `elementId` at `coord`, deducting its cost. Returns false (no-op)
   * if illegal/unaffordable. STEP_PROMPT_remove_claiming.md: Build is now
   * the sole action that advances a turn (Claim used to own this job) —
   * `advanceTurn()` itself is just the turn counter now (STEP_PROMPT_
   * manual_only_mode.md stripped its old background side effects), so this
   * is really just "placing an element also ticks the turn counter,"
   * triggered by placing an element instead of claiming land. `builtOnTurn`
   * reads `this.turn` from *before* the advance, same as it always did (a
   * just-built element starts at 0% maturity, not already one turn matured).
   */
  build(coord: AxialCoord, elementId: string): boolean {
    if (!this.canBuild(coord, elementId)) return false;
    const def = ELEMENT_BY_ID.get(elementId)!;
    this.coin -= def.buildCost;
    this.elements.set(axialKey(coord), { elementId, builtOnTurn: this.turn, degradeAmount: 0, floodBufferFilled: 0 });
    this.advanceTurn();
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
   * Used by the hazard resolver (STEP_PROMPT_hazard_science.md Section 4):
   * draws down a flood-buffer reservoir (Khazan) at `coord` by `volume` m³,
   * returning the volume that overflowed — i.e. exceeded the tile's
   * remaining capacity, and so still needs to pass through as damage. A
   * tile with no such element (or no `floodBufferCapacityM3`) has no
   * buffer at all, so the full volume overflows.
   */
  drawDownFloodBuffer(coord: AxialCoord, volume: number): number {
    const inst = this.elements.get(axialKey(coord));
    const def = inst ? ELEMENT_BY_ID.get(inst.elementId) : undefined;
    if (!inst || !def || def.floodBufferCapacityM3 === undefined) return volume;
    const remaining = Math.max(0, def.floodBufferCapacityM3 - inst.floodBufferFilled);
    const absorbed = Math.min(volume, remaining);
    inst.floodBufferFilled += absorbed;
    return volume - absorbed;
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
   * can play this" end of the game. `advanceTurn()` used to also drain
   * Trust and Resilience every turn a deficit was running (STEP_PROMPT_
   * economy_food_yacht.md item 2); STEP_PROMPT_manual_only_mode.md removed
   * that automatic drain — Food itself is still this same live
   * `meterTotal()` read and can still go negative, it just no longer has
   * an automatic consequence. `applyHazardOutcome()` (an actual triggered
   * hazard) is Trust/Resilience's only automatic mover now.
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
    for (const key of this.placed.keys()) this.claimed.add(key);
    this.elements.clear();
    this.applyStartingElements();
    this.coin = this.startingCoin;
    this.trust = STARTING_TRUST;
    this.resilience = STARTING_RESILIENCE;
    this.severityBaseline = 0;
    this.turn = 0;
  }
}
