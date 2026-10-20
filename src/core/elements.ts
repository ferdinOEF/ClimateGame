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
  /**
   * Quarters until full strength, from Panjim 2050's quarterly clock (before
   * Section 5). The yearly run does not read it: growth is off there, and
   * with growth back on it would use `matureTurns` as years. Kept as data.
   */
  matureQuarters?: number;
  /** From the quarterly clock: actions that took this many quarters. Unused by the yearly run. */
  buildQuarters?: number;
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
  /**
   * Section 25.1 (owner decision, a game rule): how many storms of the kind it answers it comes through. The next
   * one that reaches it breaks it, and it gives no protection in that storm. Replaces the depth failure rule
   * (`failureThreshold`) in the Panjim hazard model. Seawall and small dam: 1.
   */
  survivesStorms?: number;
  /**
   * Section 25.1, a game rule: two of these side by side protect as much as one of `pairsLike` on one of their tiles.
   * On a tile the two strongest of this kind add up (any other kind counts its strongest only).
   */
  pairsLike?: string;
  /** Section 25.1, a game rule: extra surge, game metres, on the land beside each end of a wall of these (seawall). */
  endPushM?: number;
  /** Section 25.1, a game rule: never worn by a storm, so it never needs a repair (khazan). */
  neverWears?: boolean;
  /** Section 25.1, a game rule: on a river tile only at the river's edge, beside dry ground or a wetland (mangrove). */
  riverEdgeOnly?: boolean;
}

export const ELEMENT_DEFS: ElementDef[] = elementData as unknown as ElementDef[];
export const ELEMENT_BY_ID = new Map(ELEMENT_DEFS.map((e) => [e.id, e]));

/**
 * The defences an objective may suggest (Section 17.2, owner decision): the nature-based ones only. The engineered
 * ones (seawall, breakwater, small dam) stay buildable, and are never suggested.
 */
export const NATURE_BASED = ["dune", "sandy_vegetation", "mangrove", "khazan"] as const;

/**
 * Elements kept in the data but never offered (Section 17.3): sand mining. Like the coin mechanics, reserved, not
 * deleted: an old save that holds one still loads and draws it, and it can be demolished; nothing can build one.
 */
export const RETIRED_ELEMENTS: ReadonlySet<string> = new Set(["sand_mining"]);
