import type { RunPoints, StormPoints } from "@core/resiliencePoints";
import { resultHeadline } from "@core/phaseResult";
import {
  ADD_NAME_HINT, AGE_GROUPS, AGE_LABEL, ageAfterTick, FEEDBACK_LINE, FEEDBACK_TITLE, FOOTER, homesLine, NAME_FIELD, pointsRows, QUESTION_KEYS, QUESTIONS,
  REMEMBER_LABEL, REMEMBER_MAX, SCALE_HIGH, SCALE_LOW, STARS, starFilled, starsAfterTap, SUBMIT, THANKS, type AgeCode, type FooterAction, type LastCardAnswers
} from "@core/lastCard";
import { NAME_MAX } from "@core/nameFilter";
import { playSound } from "@ui/audioHooks";
import { rankHtml, stormPointsHtml, type RankState } from "./resultCards";

/**
 * Section 38.2: the last result card, after the 2050 storm: one wide card. Left, the storm's result (its headline,
 * stars, homes saved with the link to card 2, points), the run's four points rows and total, the stars and the
 * cleared chip, and the board box. Right, lighter, the feedback: the name field for a run without one, four questions
 * answered with five star buttons, one line to remember, the age group, and Submit feedback, which turns into
 * "Thank you." in place. Across the bottom: View map, Restart, Exit. Every item is optional. It is hosted by
 * ResultCards (Esc does nothing, Tab stays inside); the card wires its own buttons.
 *
 * The title moment before it (the skyline reveal's "Panjim, 2050") is `lastCardTitle`.
 */
const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface LastCardView {
  /** The run's name for the board, or null for a run without one (the name field shows). */
  name: string | null;
  /** The 2050 storm as card 1 would show it. */
  storm: { eyebrow: string; stars: number; homesStars?: number; homesSaved: number; homesTotal: number; points: StormPoints | null };
  points: RunPoints;
  /** Each storm's label ("Cyclone in 2030") and stars, in calendar order. */
  storms: { label: string; stars: number }[];
  totalStars: number;
  cleared: boolean;
}

function starsHtml(stars: number): string {
  const n = Math.max(0, Math.min(3, stars));
  return `<div class="result-stars" role="img" aria-label="${n} of 3 stars">${"★".repeat(n)}<span class="result-stars-empty">${"★".repeat(3 - n)}</span></div>`;
}

/** One question's row: the text, then five star buttons (28 px square); a tap on star 4 fills 1 to 4. */
function questionHtml(key: string, text: string): string {
  const stars = Array.from({ length: STARS }, (_, i) => `<button type="button" class="fb-star" data-value="${i + 1}" aria-label="${i + 1} of ${STARS}" aria-pressed="false">★</button>`).join("");
  return `<div class="fb-row" data-question="${key}">
    <span class="fb-row-q" id="fb-${key}">${esc(text)}</span>
    <div class="fb-stars" role="group" aria-labelledby="fb-${key}">${stars}</div>
  </div>`;
}

/** The left column: the storm, the run's points, the stars and the board box. */
export function lastCardLeftHtml(view: LastCardView, rank: RankState): string {
  const { storm } = view;
  const pct = storm.homesTotal > 0 ? Math.round((storm.homesSaved / storm.homesTotal) * 100) : 100;
  const rows = pointsRows(view.points, view.storms);
  const most = view.storms.length * 3;
  return `<div class="last-left">
    <h2 class="result-title last-title">${esc(resultHeadline(storm.stars, storm.homesStars))}</h2>
    ${starsHtml(storm.stars)}
    <div class="result-homes last-homes">
      <div class="result-homes-text">${esc(homesLine(storm.homesSaved, storm.homesTotal))} <button type="button" class="result-detail-link">What protected your homes</button></div>
      <div class="result-bar" role="img" aria-label="${pct}% of homes saved"><span style="width:${pct}%"></span></div>
    </div>
    ${storm.points ? stormPointsHtml(storm.points, false) : ""}
    <div class="last-rule" role="presentation"></div>
    <div class="last-run-head"><span class="result-eyebrow-text">Panjim, 2026 to 2050</span><span class="last-total" aria-label="${view.points.total} points in all"><b>${view.points.total}</b> points</span></div>
    <ul class="finale-rows last-rows">${rows
      .map((row) => {
        const stars = row.stars === null ? `<span class="finale-row-stars"></span>` : `<span class="finale-row-stars" role="img" aria-label="${row.stars} of 3 stars">${"★".repeat(row.stars)}<span class="result-stars-empty">${"★".repeat(3 - row.stars)}</span></span>`;
        return `<li><span class="finale-row-label">${esc(row.label)}</span>${stars}<b>${row.points}</b></li>`;
      })
      .join("")}</ul>
    <div class="finale-clear"><span><b>${view.totalStars}</b> of ${most} stars</span><span class="result-clear ${view.cleared ? "cleared" : "not-cleared"}">${view.cleared ? "Panjim cleared" : "Not cleared yet"}</span></div>
    <aside class="finale-rank last-rank" aria-live="polite">${rankHtml(rank, view.name)}</aside>
  </div>`;
}

/** The right column: the feedback, lighter in weight. */
export function lastCardRightHtml(view: LastCardView): string {
  const nameField = view.name
    ? ""
    : `<div class="fb-name-block">
        <label class="fb-name" for="fb-name"><span>${NAME_FIELD}</span></label>
        <input type="text" class="fb-name-field" id="fb-name" name="name" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@yourhandle" aria-describedby="fb-name-hint fb-name-error">
        <p class="fb-hint" id="fb-name-hint">${ADD_NAME_HINT}</p>
        <p class="fb-error" id="fb-name-error" role="alert" hidden></p>
      </div>`;
  return `<form class="last-right" novalidate>
    <h3 class="fb-title">${FEEDBACK_TITLE}</h3>
    <p class="fb-line">${FEEDBACK_LINE}</p>
    ${nameField}
    <div class="fb-questions">${QUESTION_KEYS.map((key, i) => questionHtml(key, QUESTIONS[i])).join("")}</div>
    <p class="fb-scale-ends" aria-hidden="true"><span>${SCALE_LOW}</span><span>${SCALE_HIGH}</span></p>
    <label class="fb-remember" for="fb-remember"><span>${REMEMBER_LABEL}</span>
      <input type="text" class="fb-remember-field" id="fb-remember" name="remember" maxlength="${REMEMBER_MAX}" autocomplete="off">
    </label>
    <fieldset class="fb-age"><legend>${AGE_LABEL}</legend>
      <div class="fb-age-boxes">${AGE_GROUPS.map((g) => `<label class="fb-age-box"><input type="checkbox" name="age" value="${g.code}"><span>${esc(g.label)}</span></label>`).join("")}</div>
    </fieldset>
    <div class="fb-submit-row">
      <button type="submit" class="fb-submit btn-primary">${SUBMIT}</button>
    </div>
  </form>`;
}

export function lastCardHtml(view: LastCardView, rank: RankState): string {
  return `<div class="result-card-body last-card">
    <div class="result-eyebrow last-head"><span>${esc(view.storm.eyebrow)}</span><span>The last storm</span></div>
    <div class="last-columns">
      ${lastCardLeftHtml(view, rank)}
      <div class="last-divider" role="presentation"></div>
      ${lastCardRightHtml(view)}
    </div>
    <div class="last-footer">
      ${(Object.keys(FOOTER) as FooterAction[]).map((a) => `<button type="button" class="btn last-action" data-action="${a}">${FOOTER[a]}</button>`).join("")}
    </div>
  </div>`;
}

/** What Submit feedback hands over: the answers given and the name field's text (empty for a named run). */
export interface LastCardSubmit {
  answers: LastCardAnswers;
  field: string;
}

export class LastCard {
  readonly body: HTMLElement;
  private readonly view: LastCardView;
  private rankState: RankState;
  private name: string | null;
  private readonly stars = new Map<string, number>();
  private age: AgeCode | null = null;
  private sent = false;
  /** Called with the footer button pressed. */
  onAction: (action: FooterAction) => void = () => undefined;
  /**
   * Called on Submit; answers with what to show in place of the button (null keeps the button for another try after
   * `nameError`, which goes under the name field).
   */
  onSubmit: (submit: LastCardSubmit) => Promise<{ line: string; nameError?: undefined } | { nameError: string; line?: undefined }> = async () => ({ line: THANKS });

  constructor(view: LastCardView, rank: RankState) {
    this.view = view;
    this.rankState = rank;
    this.name = view.name;
    const holder = document.createElement("div");
    holder.innerHTML = lastCardHtml(view, rank);
    this.body = holder.firstElementChild as HTMLElement;
    this.wire();
  }

  /** Whether Submit feedback has been pressed (and taken). */
  get submitted(): boolean {
    return this.sent;
  }

  /** The answers as the card holds them now. */
  answers(): LastCardAnswers {
    const out: LastCardAnswers = {};
    for (const key of QUESTION_KEYS) {
      const value = this.stars.get(key);
      if (value !== undefined) out[key] = value;
    }
    const remember = this.body.querySelector<HTMLInputElement>(".fb-remember-field")?.value.trim() ?? "";
    if (remember) out.remember = remember.slice(0, REMEMBER_MAX);
    if (this.age) out.age = this.age;
    return out;
  }

  setRank(rank: RankState): void {
    this.rankState = rank;
    this.body.querySelector(".last-rank")!.innerHTML = rankHtml(rank, this.name);
  }

  /** A name added on the card and taken by the board. */
  setName(name: string): void {
    this.name = name;
    this.setRank(this.rankState);
  }

  /** Focus to the first question's first star (the nudge's "Answer now"). */
  focusQuestions(): void {
    this.body.querySelector<HTMLElement>(".fb-row .fb-star")?.focus();
  }

  private wire(): void {
    // The stars: a tap on star n fills 1 to n.
    for (const row of this.body.querySelectorAll<HTMLElement>(".fb-row")) {
      const key = row.dataset.question!;
      const buttons = [...row.querySelectorAll<HTMLButtonElement>(".fb-star")];
      for (const button of buttons) {
        button.addEventListener("click", () => {
          const value = starsAfterTap(Number(button.dataset.value));
          this.stars.set(key, value);
          buttons.forEach((b, i) => {
            const on = starFilled(value, i + 1);
            b.classList.toggle("on", on);
            b.setAttribute("aria-pressed", String(i + 1 === value));
          });
          playSound("chime");
        });
      }
    }
    // The age boxes: one at a time.
    const boxes = [...this.body.querySelectorAll<HTMLInputElement>('input[name="age"]')];
    for (const box of boxes) {
      box.addEventListener("change", () => {
        this.age = ageAfterTick(this.age, box.value as AgeCode, box.checked);
        for (const b of boxes) b.checked = b.value === this.age;
      });
    }
    const field = this.body.querySelector<HTMLInputElement>(".fb-name-field");
    field?.addEventListener("input", () => this.setNameError(null));
    // Submit: the answers go once; the button becomes the line.
    const form = this.body.querySelector<HTMLFormElement>("form")!;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit();
    });
    for (const button of this.body.querySelectorAll<HTMLButtonElement>(".last-action")) {
      button.addEventListener("click", () => this.onAction(button.dataset.action as FooterAction));
    }
  }

  private busy = false;
  private async submit(): Promise<void> {
    if (this.sent || this.busy) return;
    this.busy = true;
    const button = this.body.querySelector<HTMLButtonElement>(".fb-submit")!;
    button.disabled = true;
    try {
      const field = this.body.querySelector<HTMLInputElement>(".fb-name-field")?.value ?? "";
      const reply = await this.onSubmit({ answers: this.answers(), field });
      if (reply.nameError !== undefined) {
        this.setNameError(reply.nameError);
        button.disabled = false;
        return;
      }
      this.sent = true;
      this.showLine(reply.line);
    } finally {
      this.busy = false;
    }
  }

  /** The line in place of the button ("Thank you."); later calls replace it (the board's answer). */
  showLine(line: string): void {
    const row = this.body.querySelector<HTMLElement>(".fb-submit-row")!;
    let note = row.querySelector<HTMLElement>(".fb-thanks");
    if (!note) {
      row.replaceChildren();
      note = document.createElement("p");
      note.className = "fb-thanks";
      note.setAttribute("role", "status");
      row.appendChild(note);
      for (const el of this.body.querySelectorAll<HTMLInputElement | HTMLButtonElement>(".last-right input, .last-right .fb-star")) el.disabled = true;
    }
    note.textContent = line;
  }

  private setNameError(message: string | null): void {
    const error = this.body.querySelector<HTMLElement>(".fb-error");
    const field = this.body.querySelector<HTMLInputElement>(".fb-name-field");
    if (!error || !field) return;
    error.hidden = message === null;
    error.textContent = message ?? "";
    if (message) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
    } else field.removeAttribute("aria-invalid");
  }
}

/** The title moment over the board as the camera pulls back: "25 years, 3 storms / Panjim, 2050". Resolves when it has played. */
export async function lastCardTitle(container: HTMLElement, years: number, storms: number): Promise<void> {
  const title = document.createElement("div");
  title.className = "finale-title";
  title.innerHTML = `<div class="finale-title-eyebrow">${years} years, ${storms} storms</div><div class="finale-title-main">Panjim, 2050</div>`;
  container.appendChild(title);
  playSound("combo");
  await wait(3200);
  title.classList.add("leaving");
  await wait(600);
  title.remove();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
