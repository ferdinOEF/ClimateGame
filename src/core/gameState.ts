import { type AxialCoord, axialKey, neighbor } from "./hex";
import { isWaterFamily } from "./terrain";
import { BUILDING_BY_ID, type BuildingDef } from "./buildings";
import { DEFENSE_BY_ID, type DefenseDef } from "./defenses";

export interface PlacedTile {
  coord: AxialCoord;
  terrainId: string;
}

export interface DefenseInstance {
  defenseId: string;
  builtOnTurn: number;
  /** Permanent absorption reduction from graceful-degrade events or unpaid maintenance. */
  degradeAmount: number;
}

const STARTING_COIN = 50;
const STARTING_TRUST = 50;
const STARTING_RESILIENCE = 100;
const RESILIENCE_DAMAGE_FACTOR = 0.5;
const CATASTROPHIC_TRUST_PENALTY = 8; // per destroyed engineered defense — stings more than an NBS shortfall
const WEATHERED_TRUST_BONUS = 2;
const CLAIM_COST = 4; // Section 2: "costs a small amount of Coin"

function isCoastOrEstuary(terrainId: string): boolean {
  return terrainId === "coast" || terrainId === "estuary";
}

/**
 * Pure game-logic state (v2.1): the terrain map is fixed at construction —
 * `placed` holds every tile from the authored map.json, not something the
 * player grows. What the player grows is `claimed`, a subset of `placed`.
 * No Three.js here — the render layer mirrors this to draw the scene.
 */
export class GameState {
  readonly placed = new Map<string, PlacedTile>();
  readonly claimed = new Set<string>();
  readonly buildings = new Map<string, string>(); // coord key -> building id
  readonly defenses = new Map<string, DefenseInstance>();
  coin = STARTING_COIN;
  turn = 0;
  /** Section 7's four meters. Biodiversity/Carbon are derived (see the getters below); Trust and Resilience are running totals. */
  trust = STARTING_TRUST;
  resilience = STARTING_RESILIENCE;
  /** Section 2's standing severity baseline: never decreases within an era, biases future hazard rolls upward. */
  severityBaseline = 0;
  /** Section 2's light meta-progression hook: preserved across `startNewEra()`. */
  erasCompleted = 0;
  private readonly startingClaim: AxialCoord[];

  /**
   * @param mapTiles The fixed, pre-generated map (Section 4) — every tile
   *   that exists, loaded once from map.json in real play.
   * @param startingClaim The player's initial claimed cluster. Defaults to
   *   claiming every tile passed in, which is convenient for small
   *   hand-built test fixtures; real play always passes an explicit small
   *   (2-3 hex) cluster.
   */
  constructor(mapTiles: PlacedTile[], startingClaim?: AxialCoord[]) {
    for (const tile of mapTiles) this.placed.set(axialKey(tile.coord), tile);
    this.startingClaim = startingClaim ?? mapTiles.map((t) => t.coord);
    for (const coord of this.startingClaim) {
      if (this.placed.has(axialKey(coord))) this.claimed.add(axialKey(coord));
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

  /**
   * One claim = one turn (Section 2's Calm-phase cadence): buildings pay
   * out, and defenses with upkeep either get paid or silently weaken (the
   * khazan/river-embankment "neglect decays it" tradeoff). Public because
   * the hazard/turn system also needs to advance it directly (e.g.
   * maintenance still ticks between hazard events).
   */
  advanceTurn(): void {
    this.turn++;
    for (const buildingId of this.buildings.values()) {
      const def = BUILDING_BY_ID.get(buildingId);
      if (def) this.coin += def.coinPerTurn;
    }
    for (const [key, inst] of this.defenses) {
      const def = DEFENSE_BY_ID.get(inst.defenseId);
      if (!def || def.maintenanceCostPerTurn <= 0) continue;
      if (this.coin >= def.maintenanceCostPerTurn) {
        this.coin -= def.maintenanceCostPerTurn;
      } else if (def.maintenanceNeglectPenaltyPerTurn) {
        inst.degradeAmount += def.maintenanceNeglectPenaltyPerTurn;
        this.defenses.set(key, inst);
      }
    }
  }

  private isCoastOrEstuaryAdjacent(coord: AxialCoord): boolean {
    for (let dir = 0; dir < 6; dir++) {
      const np = this.placed.get(axialKey(neighbor(coord, dir)));
      if (np && isCoastOrEstuary(np.terrainId)) return true;
    }
    return false;
  }

  private isWaterFamilyAdjacent(coord: AxialCoord): boolean {
    for (let dir = 0; dir < 6; dir++) {
      const np = this.placed.get(axialKey(neighbor(coord, dir)));
      if (np && isWaterFamily(np.terrainId)) return true;
    }
    return false;
  }

  /** Defense options valid at `coord` right now (must be claimed, terrain + water adjacency), regardless of affordability. */
  buildableDefensesAt(coord: AxialCoord): DefenseDef[] {
    const key = axialKey(coord);
    const tile = this.placed.get(key);
    if (!tile || !this.claimed.has(key) || this.defenses.has(key)) return [];

    const results: DefenseDef[] = [];
    for (const def of DEFENSE_BY_ID.values()) {
      if (!def.validTerrainIds.includes(tile.terrainId)) continue;
      if (def.requiresWaterFamilyAdjacent && !this.isWaterFamilyAdjacent(coord)) continue;
      results.push(def);
    }
    return results;
  }

  canBuildDefense(coord: AxialCoord, defenseId: string): boolean {
    const def = DEFENSE_BY_ID.get(defenseId);
    if (!def) return false;
    if (this.coin < def.buildCost) return false;
    return this.buildableDefensesAt(coord).some((d) => d.id === defenseId);
  }

  buildDefense(coord: AxialCoord, defenseId: string): boolean {
    if (!this.canBuildDefense(coord, defenseId)) return false;
    const def = DEFENSE_BY_ID.get(defenseId)!;
    this.coin -= def.buildCost;
    this.defenses.set(axialKey(coord), { defenseId, builtOnTurn: this.turn, degradeAmount: 0 });
    return true;
  }

  /** Current absorption fraction [0,1] a defense provides right now, factoring maturity and any degrade. */
  effectiveAbsorption(coord: AxialCoord): number {
    const inst = this.defenses.get(axialKey(coord));
    if (!inst) return 0;
    const def = DEFENSE_BY_ID.get(inst.defenseId);
    if (!def) return 0;
    const maturityFrac = def.matureTurns > 0 ? Math.min(1, Math.max(0, (this.turn - inst.builtOnTurn) / def.matureTurns)) : 1;
    const base = def.absorptionAtMaturity * maturityFrac;
    return Math.max(0, base - inst.degradeAmount);
  }

  /** Used by the hazard resolver: permanently weakens a graceful (NBS/hybrid) defense in place. */
  degradeDefense(coord: AxialCoord, amount: number): void {
    const key = axialKey(coord);
    const inst = this.defenses.get(key);
    if (inst) inst.degradeAmount += amount;
  }

  /** Used by the hazard resolver: removes a catastrophically-failed engineered defense. */
  destroyDefense(coord: AxialCoord): void {
    this.defenses.delete(axialKey(coord));
  }

  /**
   * Biodiversity and Carbon (Section 7) are derived, not accumulated: the
   * sum of every standing defense's coBenefits, weighted by how mature it
   * is. NBS/hybrid structures contribute positively, engineered negatively
   * (its coBenefits are negative in the data) — a destroyed defense simply
   * stops contributing, no separate bookkeeping needed.
   */
  private coBenefitTotal(key: "biodiversity" | "carbon"): number {
    let total = 0;
    for (const inst of this.defenses.values()) {
      const def = DEFENSE_BY_ID.get(inst.defenseId);
      if (!def) continue;
      const maturityFrac =
        def.matureTurns > 0 ? Math.min(1, Math.max(0, (this.turn - inst.builtOnTurn) / def.matureTurns)) : 1;
      total += def.coBenefits[key] * maturityFrac;
    }
    return total;
  }

  get biodiversity(): number {
    return this.coBenefitTotal("biodiversity");
  }

  get carbon(): number {
    return this.coBenefitTotal("carbon");
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
    this.buildings.clear();
    this.defenses.clear();
    this.coin = STARTING_COIN;
    this.trust = STARTING_TRUST;
    this.resilience = STARTING_RESILIENCE;
    this.severityBaseline = 0;
    this.turn = 0;
  }

  /** Building options valid at `coord` right now (must be claimed, terrain + adjacency), regardless of affordability. */
  buildableAt(coord: AxialCoord): BuildingDef[] {
    const key = axialKey(coord);
    const tile = this.placed.get(key);
    if (!tile || !this.claimed.has(key) || this.buildings.has(key)) return [];

    const results: BuildingDef[] = [];
    for (const def of BUILDING_BY_ID.values()) {
      if (!def.validTerrainIds.includes(tile.terrainId)) continue;
      if (def.requiresCoastOrEstuaryAdjacent && !this.isCoastOrEstuaryAdjacent(coord)) continue;
      results.push(def);
    }
    return results;
  }

  canBuild(coord: AxialCoord, buildingId: string): boolean {
    const def = BUILDING_BY_ID.get(buildingId);
    if (!def) return false;
    if (this.coin < def.buildCost) return false;
    return this.buildableAt(coord).some((d) => d.id === buildingId);
  }

  /** Builds `buildingId` at `coord`, deducting its cost. Returns false (no-op) if illegal/unaffordable. */
  build(coord: AxialCoord, buildingId: string): boolean {
    if (!this.canBuild(coord, buildingId)) return false;
    const def = BUILDING_BY_ID.get(buildingId)!;
    this.coin -= def.buildCost;
    this.buildings.set(axialKey(coord), buildingId);
    return true;
  }
}
