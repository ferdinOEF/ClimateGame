import { FOOTER, type FooterAction } from "./lastCard";

/**
 * Section 38.3: the nudge, once. When the player taps View map, Restart or Exit on the last card without having
 * submitted, a small box asks once per run: "Before you go, five taps?". Never twice in a run, never after a Submit,
 * never in the Tutorial (which has no last card). What the feedback row records of it: "none" (never shown),
 * "shown_answered" (shown, then a Submit) or "shown_left" (shown, the player left without one).
 *
 * Pure: no DOM.
 */
export const NUDGE_TITLE = "Before you go, five taps?";
export const NUDGE_LINE = "Your answers help us improve the game and share what players learn about Goa's coast. It takes about twenty seconds.";
export const NUDGE_ANSWER = "Answer now";

/** "{Action} anyway": the button that does the action. */
export function anywayLabel(action: FooterAction): string {
  return `${FOOTER[action]} anyway`;
}

export type NudgeOutcome = "none" | "shown_answered" | "shown_left";

export class NudgeGate {
  private shownOnce = false;

  /** Whether to show the box now for a press of a footer button; true once per run, and never after a Submit. */
  shouldShow(submitted: boolean): boolean {
    if (submitted || this.shownOnce) return false;
    this.shownOnce = true;
    return true;
  }

  get shown(): boolean {
    return this.shownOnce;
  }

  /** What the feedback row records, at a Submit or on leaving. */
  outcome(submitted: boolean): NudgeOutcome {
    if (!this.shownOnce) return "none";
    return submitted ? "shown_answered" : "shown_left";
  }
}
