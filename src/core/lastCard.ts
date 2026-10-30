import type { RunPoints } from "./resiliencePoints";

/**
 * Section 38.2: the last result card (after the 2050 storm), as data: its points rows, its four questions, the stars
 * control and the age boxes, and what a press of Submit feedback sends. The card (ui/panjim/lastCard.ts) is drawn from
 * it and the server (server/handlers.ts) checks what it is sent against the same lists, so the two never disagree.
 *
 * Pure: no DOM, no network.
 */

/** One row of the points table: a storm (its stars) or the end of 2050's nature line. */
export interface PointsRow {
  label: string;
  /** The storm's stars, 0 to 3; none on the nature row. */
  stars: number | null;
  points: number;
}

/**
 * The four rows under "Panjim, 2026 to 2050": one a storm, then "Nature at the end of 2050: +9 biodiversity,
 * 2 veterans" with the biodiversity and veteran points as one number. The rows add up to the run's total.
 */
export function pointsRows(points: RunPoints, storms: readonly { label: string; stars: number }[]): PointsRow[] {
  const rows: PointsRow[] = storms.map((storm, i) => ({ label: storm.label, stars: Math.max(0, Math.min(3, storm.stars)), points: points.storms[i]?.total ?? 0 }));
  const end = points.end;
  if (end) {
    const vets = end.veterans.count;
    rows.push({ label: `Nature at the end of 2050: +${end.biodiversity.rise} biodiversity, ${vets} ${vets === 1 ? "veteran" : "veterans"}`, stars: null, points: end.biodiversity.points + end.veterans.points });
  }
  return rows;
}

export function rowsTotal(rows: readonly PointsRow[]): number {
  return rows.reduce((sum, row) => sum + row.points, 0);
}

/** "41 of 53 homes saved; 12 lost." (no second clause when none was lost). */
export function homesLine(saved: number, total: number): string {
  const lost = Math.max(0, total - saved);
  return lost > 0 ? `${saved} of ${total} homes saved; ${lost} lost.` : `${saved} of ${total} homes saved.`;
}

/** The four questions, in order, each answered with 1 to 5 stars. */
export const QUESTIONS = [
  "How much did the game improve your understanding of the risk cyclones and floods pose to Goa's coast?",
  "How much did watching mangroves, dunes and khazans stop the surge in the game improve your understanding of how they protect the coast?",
  "How much more confident are you that Panjim can be protected if the right defenses are built?",
  "How much has the game made you want to talk about what you learnt, or to visit or help protect a mangrove or khazan?"
] as const;
export const QUESTION_KEYS = ["q1", "q2", "q3", "q4"] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];
export const SCALE_LOW = "1 Not at all";
export const SCALE_HIGH = "5 A lot";
export const STARS = 5;

export const FEEDBACK_TITLE = "Your feedback";
export const FEEDBACK_LINE = "Five taps help OneEarth Foundation show what people learn from this game. Skip any of it.";
export const REMEMBER_LABEL = "One thing you'll remember (optional)";
export const REMEMBER_MAX = 140;
export const AGE_LABEL = "Age group";
/** The age boxes: what the player sees, and the code the server stores. */
export const AGE_GROUPS = [
  { code: "u17", label: "17 and under" },
  { code: "18_30", label: "18 to 30" },
  { code: "31_plus", label: "31 and over" }
] as const;
export type AgeCode = (typeof AGE_GROUPS)[number]["code"];
export const AGE_CODES: readonly AgeCode[] = AGE_GROUPS.map((g) => g.code);
export const SUBMIT = "Submit feedback";
export const THANKS = "Thank you.";
export const NAME_FIELD = "Your name or Instagram handle";
export const ADD_NAME_HINT = "Add a name and this run goes on the board.";
/** Section 37.9: under the name field, when the board refused the name as another run's. */
export const NAME_TAKEN = "That name is already on the board.";

export const FOOTER = { map: "View map", restart: "Restart", exit: "Exit" } as const;
export type FooterAction = keyof typeof FOOTER;
export const RETURN_TO_CARD = "Back to your result";

/** A tap on star `tap` fills 1 to `tap`: the answer is `tap`. */
export function starsAfterTap(tap: number): number {
  return Math.max(1, Math.min(STARS, Math.round(tap)));
}

/** Whether star `i` (1 to 5) is filled for an answer of `value`. */
export function starFilled(value: number | null, i: number): boolean {
  return value !== null && i <= value;
}

/** Only one age box at a time: ticking another unticks the first; unticking the ticked one leaves none. */
export function ageAfterTick(current: AgeCode | null, code: AgeCode, checked: boolean): AgeCode | null {
  if (checked) return code;
  return current === code ? null : current;
}

/** The answers the card holds; an item left alone is absent. */
export interface LastCardAnswers {
  q1?: number;
  q2?: number;
  q3?: number;
  q4?: number;
  remember?: string;
  age?: AgeCode;
}

/** A free text answer: control characters out, spaces tidied, cut to `max` characters; empty is no answer. */
export function cutText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const text = [...v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()].slice(0, max).join("").trim();
  return text.length > 0 ? text : undefined;
}

/**
 * What a press of Submit feedback does, from whether the run has a name on the board and what the name field holds
 * (empty for a named run, which has no field): `post` the name to put the run on the board with, or `nameError` why
 * the typed name was refused (the answers still go). An empty form is a valid submission.
 */
export interface SubmitPlan {
  post: string | null;
  nameError: string | null;
}

export function submitPlan(input: { onBoard: boolean; field: string }, check: (raw: string) => { ok: true; name: string } | { ok: false; message: string }): SubmitPlan {
  const typed = input.field.replace(/\s+/g, " ").trim();
  if (input.onBoard || typed === "") return { post: null, nameError: null };
  const name = check(typed);
  return name.ok ? { post: name.name, nameError: null } : { post: null, nameError: name.message };
}

/** "Thank you." and, when a name was added on the card, where the run landed. */
export function thanksLine(rank: number | null): string {
  return rank === null ? THANKS : `${THANKS} You’re ${ordinalWord(rank)} on the board.`;
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st". */
export function ordinalWord(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}
