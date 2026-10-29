import type { ScheduledChallenge } from "./climate";
import { nextLabel } from "./phaseResult";

/**
 * Section 38.1: the cards after a storm in Play Panjim, as data. After the 2030 and 2040 storms the path is card 1
 * (the result) then the outlook card; card 2 ("What protected your homes") stays in the code and opens from a text
 * link on card 1, under the homes saved bar, with "Back" its only button. Card 1's main button is the outlook card's
 * old label ("Next: the flood in 2040"); its retry button stays. After the 2050 storm there are no cards here: the
 * last card (Section 38.2) takes their place. The Tutorial's cards are not drawn from this.
 *
 * Pure: no DOM.
 */
export const DETAIL_LINK = "What protected your homes";
export const DETAIL_BACK = "Back";

export interface StormCardPlan {
  /** The cards in order: the result (with card 2 behind its link), then the outlook when a storm is still to come. */
  cards: ("result" | "outlook")[];
  /** Card 1's main button: where the game goes next. */
  resultButton: string;
  /** The link on card 1 that opens card 2. */
  detailLink: string;
  /** The outlook card's button ("On to 2031"). */
  outlookButton: string | null;
}

export function stormCardPlan(next: ScheduledChallenge | null, yearAfter: number): StormCardPlan {
  if (!next) return { cards: [], resultButton: nextLabel(null), detailLink: DETAIL_LINK, outlookButton: null };
  return { cards: ["result", "outlook"], resultButton: nextLabel(next), detailLink: DETAIL_LINK, outlookButton: `On to ${yearAfter}` };
}
