import { ACTIONS, AGES, FEELINGS, SCALE, STATUSES, TEXT_LIMITS, type FeedbackAnswers } from "@core/feedbackForm";
import { NAME_HINT, NAME_MAX } from "@core/nameFilter";

/**
 * Section 35.5: the feedback form after Play Panjim (never the Tutorial), one screen titled "Your feedback", every item
 * optional. Drawn from core/feedbackForm.ts (the questions and their allowed answers, which the server checks against
 * too). Real <label> and <input> elements in <fieldset>s, so every choice is a click target and keyboard reachable.
 */
const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const FEEDBACK_TITLE = "Your feedback";
export const FEEDBACK_LINE = "Your answers help OneEarth Foundation improve this game. You can skip any question.";
/** The name field's hint for a run without a name. */
export const ADD_NAME_HINT = "Add a name and this run goes on the board.";

/** A 1 to 5 row, its two ends named. */
function scaleRow(name: string, legend: string, low: string, high: string): string {
  return `<fieldset class="fb-scale"><legend>${esc(legend)}</legend>
    <span class="fb-scale-end" aria-hidden="true">${esc(low)}</span>
    ${SCALE.map((n) => `<label class="fb-pill"><input type="radio" name="${name}" value="${n}" aria-label="${n}${n === 1 ? `, ${esc(low)}` : n === 5 ? `, ${esc(high)}` : ""}"><span>${n}</span></label>`).join("")}
    <span class="fb-scale-end" aria-hidden="true">${esc(high)}</span>
  </fieldset>`;
}

function choices(type: "radio" | "checkbox", name: string, values: readonly string[]): string {
  return values.map((v) => `<label class="fb-choice"><input type="${type}" name="${name}" value="${esc(v)}"><span>${esc(v)}</span></label>`).join("");
}

function text(name: keyof typeof TEXT_LIMITS, label: string): string {
  return `<label class="fb-text"><span>${esc(label)}</span><textarea name="${name}" rows="2" maxlength="${TEXT_LIMITS[name]}"></textarea></label>`;
}

/** The form's body: the name field (preloaded with the run's name, or empty with the hint to add one), then S1 to S7. */
export function feedbackFormHtml(runName: string | null): string {
  return `<div class="result-card-body feedback-form">
    <h2 class="result-title">${FEEDBACK_TITLE}</h2>
    <p class="result-sub">${FEEDBACK_LINE}</p>
    <form class="fb-grid" novalidate>
      <div class="fb-col">
        <label class="fb-name"><span>Your name or Instagram handle</span>
          <input type="text" name="name" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@yourhandle" value="${esc(runName ?? "")}" aria-describedby="fb-name-hint fb-name-error">
        </label>
        <p class="fb-hint" id="fb-name-hint">${runName ? NAME_HINT : ADD_NAME_HINT}</p>
        <p class="fb-error" id="fb-name-error" role="alert" hidden></p>
        <div class="fb-group"><div class="fb-q">Your understanding of how Panjim can be protected from cyclones and floods</div>
          ${scaleRow("s1_before", "Before playing", "Very little", "A lot")}
          ${scaleRow("s1_now", "Now", "Very little", "A lot")}
        </div>
        <fieldset class="fb-group"><legend class="fb-q">How do you feel about Panjim's future?</legend>
          <div class="fb-choices">${choices("radio", "s2_feeling", FEELINGS)}</div>
          ${text("s2_why", "Why? (optional)")}
        </fieldset>
        ${text("s3_change", "Did the game change how you see Goa's coast? (optional)")}
      </div>
      <div class="fb-col">
        <div class="fb-group">${scaleRow("s4_enjoy", "How much did you enjoy playing?", "Not at all", "Loved it")}</div>
        <fieldset class="fb-group"><legend class="fb-q">Will you do any of these? (optional)</legend>
          <div class="fb-choices fb-stack">${choices("checkbox", "s5_actions", ACTIONS)}</div>
        </fieldset>
        ${text("s6_remember", "One thing you'll remember (optional)")}
        <div class="fb-group"><div class="fb-q">About you</div>
          <fieldset class="fb-inline"><legend>Age</legend><div class="fb-choices">${choices("radio", "s7_age", AGES)}</div></fieldset>
          <fieldset class="fb-inline"><legend>You are</legend><div class="fb-choices">${choices("radio", "s7_status", STATUSES)}</div></fieldset>
        </div>
      </div>
    </form>
  </div>`;
}

/** What the form holds: the name field's text and the answers given (a choice left alone is not read). */
export function readFeedback(root: HTMLElement): { name: string; answers: FeedbackAnswers } {
  const form = root.querySelector("form")!;
  const data = new FormData(form);
  const num = (key: string): number | undefined => (data.get(key) === null ? undefined : Number(data.get(key)));
  const str = (key: string): string | undefined => (data.get(key) === null ? undefined : String(data.get(key)));
  const answers: Record<string, unknown> = {
    s1_before: num("s1_before"),
    s1_now: num("s1_now"),
    s2_feeling: str("s2_feeling"),
    s2_why: str("s2_why"),
    s3_change: str("s3_change"),
    s4_enjoy: num("s4_enjoy"),
    s5_actions: data.getAll("s5_actions").map(String),
    s6_remember: str("s6_remember"),
    s7_age: str("s7_age"),
    s7_status: str("s7_status")
  };
  return { name: str("name") ?? "", answers: answers as FeedbackAnswers };
}

/** Shows (or clears) the name field's message; the rest of the form is unaffected. */
export function setNameError(root: HTMLElement, message: string | null): void {
  const error = root.querySelector<HTMLElement>(".fb-error")!;
  const field = root.querySelector<HTMLInputElement>('input[name="name"]')!;
  error.hidden = message === null;
  error.textContent = message ?? "";
  if (message) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  } else field.removeAttribute("aria-invalid");
}
