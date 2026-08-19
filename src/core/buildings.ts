import buildingData from "@data/buildings.json";

export interface BuildingDef {
  id: string;
  name: string;
  buildCost: number;
  coinPerTurn: number;
  validTerrainIds: string[];
  requiresCoastOrEstuaryAdjacent: boolean;
  colorKey: string;
}

export const BUILDING_DEFS: BuildingDef[] = buildingData as BuildingDef[];
export const BUILDING_BY_ID = new Map(BUILDING_DEFS.map((b) => [b.id, b]));
