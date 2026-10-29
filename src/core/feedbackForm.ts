import { AGE_CODES, cutText, QUESTION_KEYS, REMEMBER_MAX, STARS, type AgeCode } from "./lastCard";
import type { NudgeOutcome } from "./nudge";

/**
 * Section 38.4: what the feedback endpoint takes, as data. The last card (core/lastCard.ts, ui/panjim/lastCard.ts) is
 * drawn from the same lists and the server (server/handlers.ts) checks what it is sent against them, so the two can
 * never disagree. Every item is optional: an empty form is a valid post (so the count of forms opened is known). A
 * known key with a value off its list is refused; an unknown key is ignored.
 *
 * Pure: no DOM, no network.
 */
export const NUDGE_CODES: readonly NudgeOutcome[] = ["none", "shown_answered", "shown_left"];
/** The longest a card's clock can be (a day), so a stray number never grows the column. */
export const CARD_SECONDS_MAX = 86_400;

export interface FeedbackAnswers {
  q1?: number;
  q2?: number;
  q3?: number;
  q4?: number;
  remember?: string;
  age?: AgeCode;
  nudge?: NudgeOutcome;
  /** Seconds from the card opening to Submit or to leaving, to a tenth. */
  cardSeconds?: number;
}

export const ANSWER_KEYS = ["q1", "q2", "q3", "q4", "remember", "age", "nudge", "cardSeconds"] as const;

const absent = (v: unknown): boolean => v === undefined || v === null;
const isStars = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= STARS;

/** The answers kept from what was sent, or why they were refused. */
export type CheckedAnswers = { ok: true; answers: FeedbackAnswers } | { ok: false; error: string };

export function checkAnswers(raw: unknown): CheckedAnswers {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: FeedbackAnswers = {};
  for (const key of QUESTION_KEYS) {
    const v = input[key];
    if (absent(v)) continue;
    if (!isStars(v)) return { ok: false, error: `bad ${key}` };
    out[key] = v;
  }
  if (!absent(input.remember)) {
    if (typeof input.remember !== "string") return { ok: false, error: "bad remember" };
    const remember = cutText(input.remember, REMEMBER_MAX);
    if (remember) out.remember = remember;
  }
  if (!absent(input.age)) {
    if (typeof input.age !== "string" || !(AGE_CODES as readonly string[]).includes(input.age)) return { ok: false, error: "bad age" };
    out.age = input.age as AgeCode;
  }
  if (!absent(input.nudge)) {
    if (typeof input.nudge !== "string" || !(NUDGE_CODES as readonly string[]).includes(input.nudge)) return { ok: false, error: "bad nudge" };
    out.nudge = input.nudge as NudgeOutcome;
  }
  if (!absent(input.cardSeconds)) {
    const v = input.cardSeconds;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { ok: false, error: "bad cardSeconds" };
    out.cardSeconds = Math.round(Math.min(CARD_SECONDS_MAX, v) * 10) / 10;
  }
  return { ok: true, answers: out };
}

/** Whether any item was answered (the nudge's outcome and the clock are not answers). */
export function anyAnswer(answers: FeedbackAnswers): boolean {
  return QUESTION_KEYS.some((key) => answers[key] !== undefined) || answers.remember !== undefined || answers.age !== undefined;
}
