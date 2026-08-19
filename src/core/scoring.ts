import type { GameState } from "./gameState";

/**
 * Era score at retirement/soft-loss (Section 7): a function of all four
 * meters plus map size and turns survived — deliberately not just "biggest
 * map wins" (map-size terms are weighted well below the meters) or "never
 * build engineered wins" (Biodiversity/Carbon already penalize engineered
 * defenses in their coBenefits, while Trust/Resilience reward the stronger
 * protection engineered buys — the tension is in the data, not the formula).
 */
export function computeEraScore(state: GameState): number {
  return (
    state.trust +
    state.resilience +
    state.biodiversity * 4 +
    state.carbon * 3 +
    state.turn * 0.5 +
    state.placed.size * 0.3
  );
}
