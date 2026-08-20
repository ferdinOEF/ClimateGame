import elementData from "@data/elements.json";

export type ElementKind = "building" | "defense";
export type ElementCategory = "nbs" | "engineered" | "hybrid";

export interface ElementDef {
  id: string;
  name: string;
  kind: ElementKind;
  /** Defense-kind only: which NBS/engineered/hybrid family it belongs to. */
  category?: ElementCategory;
  /** Defense-kind only: which hazard ids it reduces damage from. */
  targetsHazards?: string[];
  validTerrainIds: string[];
  buildCost: number;
  maintenanceCostPerTurn?: number;
  maintenanceNeglectPenaltyPerTurn?: number;
  /** Turns until effects/absorption reach full strength. 0 = immediately mature. */
  matureTurns: number;
  absorptionAtMaturity?: number;
  overwhelmSeverity?: number;
  overwhelmedAbsorptionMultiplier?: number;
  failureThreshold?: number;
  failureRedirectMultiplier?: number;
  degradeGracefully?: boolean;
  gracefulDegradeStep?: number;
  colorKey: string;
  /**
   * v2.2's standing architectural requirement: every meter/income effect an
   * element grants is an open `{ key: delta }` map, applied by one generic
   * accumulator (`GameState.meterTotal`) weighted by maturity fraction —
   * never a hardcoded per-meter branch in engine code. Adding a new meter
   * anywhere in the game means adding a key here, not new engine code.
   */
  effects: Record<string, number>;
  /** Defense-kind only: human-readable note on how it behaves when overwhelmed/destroyed. */
  failureMode?: string;
}

export const ELEMENT_DEFS: ElementDef[] = elementData as ElementDef[];
export const ELEMENT_BY_ID = new Map(ELEMENT_DEFS.map((e) => [e.id, e]));
