import defenseData from "@data/defenses.json";

export type DefenseCategory = "nbs" | "engineered" | "hybrid";

export interface DefenseDef {
  id: string;
  name: string;
  category: DefenseCategory;
  targetsHazards: string[];
  buildCost: number;
  maintenanceCostPerTurn: number;
  maintenanceNeglectPenaltyPerTurn?: number;
  validTerrainIds: string[];
  requiresWaterFamilyAdjacent: boolean;
  footprintHexes: number;
  matureTurns: number;
  absorptionAtMaturity: number;
  overwhelmSeverity?: number;
  overwhelmedAbsorptionMultiplier?: number;
  failureThreshold?: number;
  failureRedirectMultiplier?: number;
  degradeGracefully?: boolean;
  gracefulDegradeStep?: number;
  colorKey: string;
  coBenefits: { biodiversity: number; carbon: number; trust: number };
  failureMode: string;
}

export const DEFENSE_DEFS: DefenseDef[] = defenseData as DefenseDef[];
export const DEFENSE_BY_ID = new Map(DEFENSE_DEFS.map((d) => [d.id, d]));
