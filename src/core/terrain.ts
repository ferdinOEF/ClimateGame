import terrainData from "@data/terrain.json";

export interface TerrainDef {
  id: string;
  name: string;
  colorKey: string;
  /** World-space Y its top surface sits at — water terrain sits a little lower than the sand. */
  height: number;
}

export const TERRAIN_DEFS: TerrainDef[] = terrainData as TerrainDef[];
export const TERRAIN_BY_ID = new Map(TERRAIN_DEFS.map((t) => [t.id, t]));
export const TERRAIN_IDS: readonly string[] = TERRAIN_DEFS.map((t) => t.id);
