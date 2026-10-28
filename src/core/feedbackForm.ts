/**
 * Section 35.5: the feedback form after Play Panjim, as data: every question, its allowed answers and its text limits.
 * The form (ui/panjim/feedbackForm.ts) is drawn from it and the server (server/handlers.ts) checks what it is sent
 * against it, so the two can never disagree. Every item is optional; an item left alone is not sent.
 *
 * Pure: no DOM, no network.
 */
export const SCALE = [1, 2, 3, 4, 5] as const;

export const FEELINGS = ["Hopeful", "Worried", "Curious", "Ready to help", "No different"] as const;
export const ACTIONS = ["Talk about it with someone", "Look up Goa's mangroves or khazans", "Visit a mangrove or a khazan", "Join a planting or a cleanup"] as const;
export const AGES = ["17 and under", "18 to 30", "31 and over"] as const;
export const STATUSES = ["A student", "A teacher", "Working", "Other"] as const;

/** The longest each free text answer may be (longer is cut). */
export const TEXT_LIMITS = { s2_why: 280, s3_change: 280, s6_remember: 140 } as const;

export interface FeedbackAnswers {
  s1_before?: number;
  s1_now?: number;
  s2_feeling?: (typeof FEELINGS)[number];
  s2_why?: string;
  s3_change?: string;
  s4_enjoy?: number;
  s5_actions?: (typeof ACTIONS)[number][];
  s6_remember?: string;
  s7_age?: (typeof AGES)[number];
  s7_status?: (typeof STATUSES)[number];
}

export const ANSWER_KEYS = ["s1_before", "s1_now", "s2_feeling", "s2_why", "s3_change", "s4_enjoy", "s5_actions", "s6_remember", "s7_age", "s7_status"] as const;

const isScale = (v: unknown): v is number => typeof v === "number" && (SCALE as readonly number[]).includes(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** A free text answer: control characters out, spaces tidied, cut to `max` characters; empty is no answer. */
export function cutText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const text = [...v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()].slice(0, max).join("").trim();
  return text.length > 0 ? text : undefined;
}

/**
 * The answers kept from what was sent: only the items answered with an allowed value, text cut to its limit. Anything
 * else (an unknown key, a value off the list) is dropped, never stored.
 */
export function checkAnswers(raw: unknown): FeedbackAnswers {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: FeedbackAnswers = {};
  if (isScale(input.s1_before)) out.s1_before = input.s1_before;
  if (isScale(input.s1_now)) out.s1_now = input.s1_now;
  if (oneOf(FEELINGS, input.s2_feeling)) out.s2_feeling = input.s2_feeling;
  const why = cutText(input.s2_why, TEXT_LIMITS.s2_why);
  if (why) out.s2_why = why;
  const change = cutText(input.s3_change, TEXT_LIMITS.s3_change);
  if (change) out.s3_change = change;
  if (isScale(input.s4_enjoy)) out.s4_enjoy = input.s4_enjoy;
  if (Array.isArray(input.s5_actions)) {
    const picked = ACTIONS.filter((a) => (input.s5_actions as unknown[]).includes(a));
    if (picked.length > 0) out.s5_actions = picked;
  }
  const remember = cutText(input.s6_remember, TEXT_LIMITS.s6_remember);
  if (remember) out.s6_remember = remember;
  if (oneOf(AGES, input.s7_age)) out.s7_age = input.s7_age;
  if (oneOf(STATUSES, input.s7_status)) out.s7_status = input.s7_status;
  return out;
}

/** Whether any item was answered. */
export function anyAnswer(answers: FeedbackAnswers): boolean {
  return ANSWER_KEYS.some((key) => answers[key] !== undefined);
}

/**
 * What a press of "Submit feedback" sends (Section 35.5), from the run's name (null without one), what the name field
 * holds, the answers given and whether the run's board row can be renamed (its edit token is in memory):
 *
 *   - `answers`: the answered items, when there are any (posted with the run id; never a name);
 *   - `rename`: the new name, only when the run had a name, it is on the board and the field now holds another one;
 *   - `post`: the name to put the run on the board with, only when the run had none and the field is filled;
 *   - `nameError`: why the field's name was refused (the rest still goes).
 */
export interface SubmitPlan {
  answers: FeedbackAnswers | null;
  rename: string | null;
  post: string | null;
  nameError: string | null;
}

export function planSubmit(input: { runName: string | null; field: string; answers: unknown; onBoard: boolean }, check: (raw: string) => { ok: true; name: string } | { ok: false; message: string }): SubmitPlan {
  const answers = checkAnswers(input.answers);
  const plan: SubmitPlan = { answers: anyAnswer(answers) ? answers : null, rename: null, post: null, nameError: null };
  const typed = input.field.replace(/\s+/g, " ").trim();
  if (typed === "" || typed === input.runName) return plan;
  const name = check(typed);
  if (!name.ok) return { ...plan, nameError: name.message };
  if (name.name === input.runName) return plan;
  if (input.runName === null) return { ...plan, post: name.name };
  return { ...plan, rename: input.onBoard ? name.name : null };
}
