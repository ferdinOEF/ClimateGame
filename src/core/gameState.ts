import { type AxialCoord, axialKey, neighbor, oppositeEdge } from "./hex";
import { TERRAIN_BY_ID, TERRAIN_IDS, isWaterFamily } from "./terrain";
import { edgesCompatible } from "./edgeTypes";
import { BUILDING_BY_ID, type BuildingDef } from "./buildings";

export interface PlacedTile {
  coord: AxialCoord;
  terrainId: string;
}

const HAND_SIZE = 3;
const MAX_HAND_DRAW_ATTEMPTS = 50;
const STARTING_COIN = 50;

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
  hand: string[] = [];
  coin = STARTING_COIN;
  turn = 0;
  private random: RandomSource;

  constructor(seed: PlacedTile, random: RandomSource = Math.random) {
    this.random = random;
    this.placeInternal(seed);
    this.hand = this.drawLegalHand();
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

  /** One tile placement = one turn (Section 2's Calm-phase cadence): buildings pay out. */
  private advanceTurn(): void {
    this.turn++;
    for (const buildingId of this.buildings.values()) {
      const def = BUILDING_BY_ID.get(buildingId);
      if (def) this.coin += def.coinPerTurn;
    }
  }

  private isCoastOrEstuaryAdjacent(coord: AxialCoord): boolean {
    for (let dir = 0; dir < 6; dir++) {
      const np = this.placed.get(axialKey(neighbor(coord, dir)));
      if (np && isCoastOrEstuary(np.terrainId)) return true;
    }
    return false;
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
