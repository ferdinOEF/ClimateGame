import type { GameState } from "./gameState";

// Trust and Resilience are naturally bounded to [0, 100] each. Biodiversity
// and Carbon are *not* — they're a running sum across every standing
// defense's coBenefits (Section 7), so they grow with however many
// structures got built, unboundedly. Clamping them before weighting keeps
// every meter contributing on a comparable scale regardless of defense
// count; without this, a scripted run with dozens of NBS structures scored
// over 1000 points from biodiversity alone while a comparable
// engineered-heavy run went *negative* overall — silently recreating
// exactly the "never build engineered wins" collapse this section warns
// against, just hidden behind a formula that looked reasonable at a small
// scale (tests/balance.test.ts caught it, not eyeballing the code).
const CO_BENEFIT_CLAMP = 40;

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Era score at retirement/soft-loss (Section 7): a function of all four
 * meters plus map size and turns survived — deliberately not just "biggest
 * map wins" (map-size terms are weighted well below the meters) or "never
 * build engineered wins" (Biodiversity/Carbon already penalize engineered
 * defenses in their coBenefits, while Trust/Resilience reward the stronger
 * protection engineered buys — the tension is in the data and now also
 * bounded in the formula, so a large structure count on either side can't
 * mathematically dominate everything else).
 *
 * v2.1: "map size" means `claimed`, the player's own footprint — `placed`
 * is now the whole fixed map (Section 4), constant regardless of play, so
 * it would be meaningless as a progress signal here.
 *
 * STEP_PROMPT_remove_claiming.md: `claimed` is now itself always exactly
 * `placed` (every tile is buildable from turn one, not a player-grown
 * footprint anymore) — so the `state.claimed.size * 0.3` term below is now
 * a *constant*, identical across every playthrough on a given map, no
 * longer differentiating anything. Not broken, just inert; left as-is
 * deliberately (removing it is a scoring-formula change, out of scope for
 * that pass) but flagged here for whenever scoring next gets tuned — a
 * build-density ratio or elements-built count would be a live signal in
 * its place.
 */
export function computeEraScore(state: GameState): number {
  return (
    state.trust +
    state.resilience +
    clamp(state.biodiversity, CO_BENEFIT_CLAMP) * 1.5 +
    clamp(state.carbon, CO_BENEFIT_CLAMP) * 1.5 +
    state.turn * 0.5 +
    state.claimed.size * 0.3
  );
}
