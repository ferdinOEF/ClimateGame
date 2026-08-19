import { type AxialCoord, axialKey, neighbor, oppositeEdge } from "./hex";
import { TERRAIN_BY_ID, TERRAIN_IDS, isWaterFamily } from "./terrain";
import { edgesCompatible } from "./edgeTypes";
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

const HAND_SIZE = 3;
const MAX_HAND_DRAW_ATTEMPTS = 50;
const STARTING_COIN = 50;
const STARTING_TRUST = 50;
const STARTING_RESILIENCE = 100;
const RESILIENCE_DAMAGE_FACTOR = 0.5;
const CATASTROPHIC_TRUST_PENALTY = 8; // per destroyed engineered defense — stings more than an NBS shortfall
const WEATHERED_TRUST_BONUS = 2;

function isCoastOrEstuary(terrainId: string): boolean {
  return terrainId === "coast" || terrainId === "estuary";
}

export interface RandomSource {
  (): number; // like Math.random, injectable for deterministic tests
}

/**
 * Pure game-logic state: placed tiles, the open frontier, and the current
 * hand. No Three.js here — the render layer mirrors this to draw the scene.
 */
export class GameState {
  readonly placed = new Map<string, PlacedTile>();
  readonly frontier = new Set<string>();
  readonly buildings = new Map<string, string>(); // coord key -> building id
  readonly defenses = new Map<string, DefenseInstance>();
  hand: string[] = [];
  coin = STARTING_COIN;
  turn = 0;
  /** Section 7's four meters. Biodiversity/Carbon are derived (see the getters below); Trust and Resilience are running totals. */
  trust = STARTING_TRUST;
  resilience = STARTING_RESILIENCE;
  /** Section 2's standing severity baseline: never decreases within an era, biases future hazard rolls upward. */
  severityBaseline = 0;
  /** Section 2's light meta-progression hook: preserved across `startNewEra()`. */
  erasCompleted = 0;
  private random: RandomSource;

  constructor(seed: PlacedTile, random: RandomSource = Math.random) {
    this.random = random;
    this.placeInternal(seed);
    this.hand = this.drawLegalHand();
  }

  /**
   * Test/scenario-only: places a tile at an exact coord bypassing legality
   * and the hand. Used to build deterministic hazard-resolution fixtures;
   * never called from the real play path (Section 10's sanctioned debug
   * escape hatch, same spirit as the ?autoplace URL hook).
   */
  debugForcePlace(coord: AxialCoord, terrainId: string): void {
    this.placeInternal({ coord, terrainId });
  }

  private placeInternal(tile: PlacedTile): void {
    const key = axialKey(tile.coord);
    this.placed.set(key, tile);
    this.frontier.delete(key);
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbor(tile.coord, dir);
      const nKey = axialKey(n);
      if (!this.placed.has(nKey)) this.frontier.add(nKey);
    }
  }

  /** Is `terrainId` legal at `coord`? Requires touching >=1 placed tile with compatible edges. */
  isLegal(coord: AxialCoord, terrainId: string): boolean {
    const key = axialKey(coord);
    if (this.placed.has(key)) return false;
    const candidate = TERRAIN_BY_ID.get(terrainId);
    if (!candidate) return false;

    let touchesAny = false;
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbor(coord, dir);
      const np = this.placed.get(axialKey(n));
      if (!np) continue;
      touchesAny = true;
      const neighborDef = TERRAIN_BY_ID.get(np.terrainId)!;
      const candidateEdge = candidate.edgeTypes[dir];
      const neighborEdge = neighborDef.edgeTypes[oppositeEdge(dir)];
      if (!edgesCompatible(candidateEdge, neighborEdge)) return false;
    }
    if (!touchesAny) return false;

    // River-continuity, simplified for the pilot (see PROGRESS.md): a new
    // water-family tile must touch the existing water network.
    if (isWaterFamily(terrainId)) {
      let touchesWater = false;
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(coord, dir);
        const np = this.placed.get(axialKey(n));
        if (np && isWaterFamily(np.terrainId)) {
          touchesWater = true;
          break;
        }
      }
      if (!touchesWater) return false;
    }

    return true;
  }

  legalFrontierFor(terrainId: string): AxialCoord[] {
    const results: AxialCoord[] = [];
    for (const key of this.frontier) {
      const [q, r] = key.split(",").map(Number);
      const coord = { q, r };
      if (this.isLegal(coord, terrainId)) results.push(coord);
    }
    return results;
  }

  handHasAnyLegalPlacement(): boolean {
    return this.hand.some((t) => this.legalFrontierFor(t).length > 0);
  }

  private randomTerrainId(): string {
    return TERRAIN_IDS[Math.floor(this.random() * TERRAIN_IDS.length)];
  }

  /** A terrain id guaranteed to have a legal placement right now (same-type-adjacent is always compatible). */
  private guaranteedLegalTerrainId(): string {
    for (const tile of this.placed.values()) {
      if (this.legalFrontierFor(tile.terrainId).length > 0) return tile.terrainId;
    }
    return this.randomTerrainId();
  }

  private drawLegalHand(size = HAND_SIZE): string[] {
    for (let attempt = 0; attempt < MAX_HAND_DRAW_ATTEMPTS; attempt++) {
      const hand = Array.from({ length: size }, () => this.randomTerrainId());
      if (hand.some((t) => this.legalFrontierFor(t).length > 0)) return hand;
    }
    const hand = [this.guaranteedLegalTerrainId()];
    while (hand.length < size) hand.push(this.randomTerrainId());
    return hand;
  }

  /** Places `hand[handIndex]` at `coord` if legal. Returns false (no-op) if illegal. */
  placeFromHand(handIndex: number, coord: AxialCoord): boolean {
    const terrainId = this.hand[handIndex];
    if (!terrainId || !this.isLegal(coord, terrainId)) return false;

    this.placeInternal({ coord, terrainId });
    this.hand.splice(handIndex, 1, this.randomTerrainId());
    if (!this.handHasAnyLegalPlacement()) this.hand = this.drawLegalHand();
    this.advanceTurn();
    return true;
  }

  /**
   * One tile placement = one turn (Section 2's Calm-phase cadence):
   * buildings pay out, and defenses with upkeep either get paid or silently
   * weaken (the khazan/river-embankment "neglect decays it" tradeoff).
   * Public because the hazard/turn system also needs to advance it directly
   * (e.g. maintenance still ticks between hazard events).
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

  /** Defense options valid at `coord` right now (terrain + water adjacency), regardless of affordability. */
  buildableDefensesAt(coord: AxialCoord): DefenseDef[] {
    const key = axialKey(coord);
    const tile = this.placed.get(key);
    if (!tile || this.defenses.has(key)) return [];

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
   * fresh map." Resets play state in place but preserves erasCompleted.
   */
  startNewEra(): void {
    this.erasCompleted++;
    this.placed.clear();
    this.frontier.clear();
    this.buildings.clear();
    this.defenses.clear();
    this.coin = STARTING_COIN;
    this.trust = STARTING_TRUST;
    this.resilience = STARTING_RESILIENCE;
    this.severityBaseline = 0;
    this.turn = 0;
    this.placeInternal({ coord: { q: 0, r: 0 }, terrainId: "estuary" });
    this.hand = this.drawLegalHand();
  }

  /** Building options valid at `coord` right now (terrain + adjacency), regardless of affordability. */
  buildableAt(coord: AxialCoord): BuildingDef[] {
    const key = axialKey(coord);
    const tile = this.placed.get(key);
    if (!tile || this.buildings.has(key)) return [];

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
