import terrainData from "@data/terrain.json";
import type { EdgeType } from "./edgeTypes";

export interface TerrainDef {
  id: string;
  name: string;
  edgeTypes: EdgeType[];
  elevationTier: "coastal" | "midland" | "highland";
  flammability: number;
  decorationDensityRange: [number, number];
  colorKey: string;
}

export const TERRAIN_DEFS: TerrainDef[] = terrainData as TerrainDef[];
export const TERRAIN_BY_ID = new Map(TERRAIN_DEFS.map((t) => [t.id, t]));
export const TERRAIN_IDS: readonly string[] = TERRAIN_DEFS.map((t) => t.id);

/** River/estuary are the "water family" used for the river-continuity placement rule. */
const WATER_FAMILY_IDS = new Set(["river", "estuary"]);

export function isWaterFamily(terrainId: string): boolean {
  return WATER_FAMILY_IDS.has(terrainId);
}
