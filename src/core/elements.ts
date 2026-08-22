import elementData from "@data/elements.json";

/**
 * "cosmetic" (STEP_PROMPT_economy_food_yacht.md item 4): zero gameplay
 * effect by design — no category, no targetsHazards, no absorption/
 * failure fields, an empty `effects` map. Exists purely as a Coin sink a
 * player saves toward; kept as its own kind rather than shoehorned into
 * "building" so `hasBuildingAt()` (the cyclone Trust-penalty check) and
 * any future kind-specific logic never has to special-case it by id.
 */
export type ElementKind = "building" | "defense" | "cosmetic";
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
  /**
   * STEP_PROMPT_hazard_science.md Section 4: a reservoir capacity in cubic
   * meters (Khazan only, today) — a fundamentally different mechanic from
   * `absorptionAtMaturity`'s percentage-of-wave-energy model. When present,
   * the hazard resolver draws down this tile's remaining buffer before any
   * damage passes through, rather than (or in addition to) the usual
   * percentage math. See `GameState.drawDownFloodBuffer`.
   */
  floodBufferCapacityM3?: number;
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

export const ELEMENT_DEFS: ElementDef[] = elementData as unknown as ElementDef[];
export const ELEMENT_BY_ID = new Map(ELEMENT_DEFS.map((e) => [e.id, e]));
