import type { PhaseResult } from "@core/phaseResult";
import { resultHeadline } from "@core/phaseResult";
import { panajiRunPhrase } from "@ui/screens/runWords";
import { countWord } from "@ui/panjim/panjimHelp";
import { CLEAR_TOTAL_STARS } from "@core/panjimIndex";

/**
 * The end-of-phase result cards (Section 9): after each storm, a short
 * sequence in a modal. Each card's button names what comes next; Back on
 * every card after the first; Enter goes on, Esc jumps to the last card.
 * Focus stays inside while it is open, and nothing else (Maya's bubble, the
 * map's labels) draws over it: it is above them and in their obstacle lists.
 * The only motion is a short fade between cards, none with reduced motion.
 */
export interface CardSpec {
  /** The card's content. */
  body: HTMLElement;
  /** What the main button says: what comes next. */
  button: string;
  /** A quieter link under the button (the final card's way back to the menu). */
  link?: string;
  /** Section 28.1: a second button beside the main one ("Try this storm again"); it closes the cards. */
  alt?: string;
}

/** What closed the cards: the last card's button, its link, or a card's second button (Section 28.1). */
export type CardsChoice = "button" | "link" | "alt";

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function el(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return div.firstElementChild as HTMLElement;
}

/** "★★☆", read out as "2 of 3 stars". */
function starsHtml(stars: number): string {
  const n = Math.max(0, Math.min(3, stars));
  return `<div class="result-stars" role="img" aria-label="${n} of 3 stars">${"★".repeat(n)}<span class="result-stars-empty">${"★".repeat(3 - n)}</span></div>`;
}

/**
 * "N of M homes saved" with a bar. Section 22.4 (owner decision): M is the homes still standing when the storm hit;
 * the ones an earlier storm ruined are their own small line, so a card never reads "0 of M" for earlier losses.
 */
export function homesHtml(saved: number, total: number, lostBefore = 0): string {
  const pct = total > 0 ? Math.round((saved / total) * 100) : 100;
  // Section 14: said in words when nothing in the path was lost.
  const all = total > 0 && saved >= total ? `<div class="result-homes-all">Every home in the path survived</div>` : "";
  const before = lostBefore > 0 ? `<div class="result-homes-before">Lost in earlier storms: ${lostBefore}</div>` : "";
  const text = total === 0 && lostBefore > 0 ? "No home in its path was still standing" : `<b>${saved}</b> of ${total} homes saved`;
  return `<div class="result-homes">
    ${all}
    <div class="result-homes-text">${text}</div>
    <div class="result-bar" role="img" aria-label="${pct}% of homes saved"><span style="width:${pct}%"></span></div>
    ${before}
  </div>`;
}

/** Maya's one line on a card, in the card (her bubble never draws over the cards); a game rule is labelled as one. */
export type CardLine = { text: string; rule: boolean } | null;
function mayaHtml(line: CardLine): string {
  if (!line) return "";
  return `<p class="result-maya"><span class="result-maya-name">Maya</span>${line.rule ? `<span class="result-rule">Game rule</span>` : ""} ${esc(line.text)}</p>`;
}

/** At most this many places on card 1 (Section 16 B4); the rest are counted. */
export const MAX_PLACES = 4;

/** Card 1's places (Section 16 B4): the first four (damaged first, as `phaseResult` orders them) and a line for the rest. */
export function cardPlaces(places: PhaseResult["places"]): { shown: PhaseResult["places"]; more: string | null } {
  const rest = places.slice(MAX_PLACES);
  const restDamaged = rest.filter((p) => !p.stood).length;
  return { shown: places.slice(0, MAX_PLACES), more: rest.length === 0 ? null : `+${rest.length} more ${restDamaged === 0 ? "stood" : `(${restDamaged} damaged)`}` };
}

/** Card 1: the storm's result. */
export function resultCard(result: PhaseResult): HTMLElement {
  const { shown, more: moreText } = cardPlaces(result.places);
  const more = moreText ? `<li class="result-places-more">${esc(moreText)}</li>` : "";
  const places = result.places.length
    ? `<ul class="result-places">${shown
        .map((p) => `<li><span class="result-place-name">${esc(p.name)}</span><span class="result-chip ${p.stood ? "stood" : "damaged"}">${p.stood ? "Stood" : "Damaged"}</span></li>`)
        .join("")}${more}</ul>`
    : "";
  return el(`<div class="result-card-body">
    <div class="result-eyebrow">${esc(result.eyebrow)}</div>
    <h2 class="result-title">${esc(resultHeadline(result.stars))}</h2>
    ${starsHtml(result.stars)}
    ${objectiveHtml(result)}
    ${homesHtml(result.homesSaved, result.homesTotal, result.homesLostBefore)}
    ${windHtml(result.windLost)}
    ${result.nature ? natureHtml(result.nature) : ""}
    ${places}
    ${result.pushNote ? `<p class="result-short result-push">${esc(result.pushNote)}</p>` : ""}
  </div>`);
}

/**
 * The objective's badge (Section 12): "Objective complete" with three stars; with fewer (Section 30.9) "Objective
 * done" and one line on what stopped the third star.
 */
export function objectiveHtml(result: PhaseResult): string {
  if (!result.objectiveComplete) return "";
  if (result.stars >= 3 || !result.shortOfThree) return `<div class="result-badge" role="note">Objective complete</div>`;
  return `<div class="result-badge" role="note">Objective done</div><p class="result-short">${esc(result.shortOfThree)}</p>`;
}

/** Section 26.3: the homes the wind alone took, and what shields them (a game rule). Nothing when it took none. */
export function windHtml(windLost: number): string {
  if (windLost <= 0) return "";
  return `<div class="result-wind" role="note">The wind alone took ${windLost === 1 ? "one of the homes lost" : `${windLost} of the homes lost`}. <span class="result-wind-why">In this game pandanus shields the homes within 2 tiles of it.</span></div>`;
}

/** Section 25.2: the card's second line: the biodiversity change since the run began, and a few words on why. */
export function natureHtml(nature: { change: number; target: number; reason: string; since: number; at?: string }): string {
  const sign = nature.change > 0 ? "+" : nature.change < 0 ? "\u2212" : "";
  const tone = nature.change < 0 ? "down" : nature.change >= nature.target ? "up" : "level";
  return `<div class="result-nature ${tone}" role="note"><span><b>${sign}${Math.abs(Math.round(nature.change))}</b> biodiversity ${nature.at ? `${esc(nature.at)}, against ${nature.since}` : `since ${nature.since}`}</span><span class="result-nature-why">${esc(nature.reason)}</span></div>`;
}

/** A defence row's number; Section 30.11 bug 13: one that shared the work reads so, never 0. */
function rowValue(d: { homes: number; shared?: boolean }): string {
  return d.homes === 0 && d.shared ? `<span class="result-row-value shared">Shared the work</span>` : `<span class="result-row-value">${d.homes}</span>`;
}

/** Card 2: what protected the homes, one row per kind of defence built in the phase. */
export function defencesCard(result: PhaseResult, mayaLine: CardLine): HTMLElement {
  const most = Math.max(1, ...result.defences.map((d) => d.homes));
  const rows = result.defences.length
    ? `<p class="result-sub">Homes that would have been lost without each defence.</p>
       <ul class="result-rows">${result.defences
         .map((d) => `<li><span class="result-row-name">${esc(d.name)}</span><span class="result-row-bar" aria-hidden="true"><span style="width:${Math.round((d.homes / most) * 100)}%"></span></span>${rowValue(d)}</li>`)
         .join("")}</ul>`
    : `<p class="result-sub">Nothing stood in the way this time.</p>`;
  return el(`<div class="result-card-body">
    <div class="result-eyebrow">${esc(result.eyebrow)}</div>
    <h2 class="result-title">What protected your homes</h2>
    ${rows}
    ${result.defences.length ? mayaHtml(mayaLine) : ""}
  </div>`);
}

/** Card 3: the next storm, with its forecast's map and legend, under one heading ("Monsoon flood · 2040 · in 10 years"). */
export function comingUpCard(title: string, preview: HTMLElement | null, mayaLine: CardLine): HTMLElement {
  // One heading (Section 16 B4): the preview's own line is not shown on this card.
  preview?.querySelector(".cone-preview-line")?.remove();
  const body = el(`<div class="result-card-body">
    <div class="result-eyebrow">Coming up</div>
    <h2 class="result-title">${esc(title)}</h2>
    <div class="result-preview"></div>
    ${mayaHtml(mayaLine)}
  </div>`);
  if (preview) body.querySelector(".result-preview")!.appendChild(preview);
  return body;
}

/** The Tutorial's one card (Section 15): the stars, the homes saved and what protected them. */
export function tutorialResultCard(result: PhaseResult): HTMLElement {
  const most = Math.max(1, ...result.defences.map((d) => d.homes));
  const rows = result.defences.length
    ? `<h3 class="result-subtitle">What protected them</h3>
       <p class="result-sub">Defences share the work: each number is the homes that would have been lost without that one alone, so they need not add up to the homes saved.</p>
       <ul class="result-rows">${result.defences
         .map((d) => `<li><span class="result-row-name">${esc(d.name)}</span><span class="result-row-bar" aria-hidden="true"><span style="width:${Math.round((d.homes / most) * 100)}%"></span></span>${rowValue(d)}</li>`)
         .join("")}</ul>`
    : `<p class="result-sub">Nothing stood in the cyclone's way this time.</p>`;
  return el(`<div class="result-card-body tutorial-result">
    <div class="result-eyebrow">Tutorial, ${esc(result.eyebrow)}</div>
    <h2 class="result-title">${esc(resultHeadline(result.stars))}</h2>
    ${starsHtml(result.stars)}
    ${homesHtml(result.homesSaved, result.homesTotal)}
    ${rows}
    <p class="result-sub">Panjim is the real city: ${esc(panajiRunPhrase())}.</p>
  </div>`);
}

/**
 * The final card: the three phases, the total, the stars won of the stars there were, and whether Panjim is
 * cleared (Section 22.4, a game rule: at least one star in every storm and `CLEAR_TOTAL_STARS` in all).
 */
export function finalCard(
  phases: { label: string; saved: number; total: number }[],
  result: { totalStars: number; cleared: boolean },
  /** Section 25.2: the biodiversity line as the last storm came, and the star lines it is judged by. */
  nature?: { line: { change: number; target: number; reason: string; since: number; at?: string }; rule: string }
): HTMLElement {
  const saved = phases.reduce((s, p) => s + p.saved, 0);
  const total = phases.reduce((s, p) => s + p.total, 0);
  const most = phases.length * 3;
  return el(`<div class="result-card-body">
    <h2 class="result-title">Panjim, 2026 to 2050</h2>
    <ul class="result-phases">${phases.map((p) => `<li><span>${esc(p.label)}</span><span><b>${p.saved}</b> of ${p.total} homes saved</span></li>`).join("")}</ul>
    ${homesHtml(saved, total)}
    ${nature ? natureHtml(nature.line) : ""}
    <div class="result-stars-total" role="img" aria-label="${result.totalStars} of ${most} stars"><b>${result.totalStars}</b> of ${most} stars</div>
    <div class="result-clear ${result.cleared ? "cleared" : "not-cleared"}">${result.cleared ? "Panjim cleared" : "Not cleared yet"}</div>
    <p class="result-clear-rule"><span class="result-rule">Game rule</span> In this game you clear Panjim with at least one star in every storm and ${countWord(CLEAR_TOTAL_STARS)} of the ${countWord(most)} stars in all.${nature ? ` ${esc(nature.rule)}` : ""}</p>
  </div>`);
}

export class ResultCards {
  readonly el: HTMLElement;
  private readonly cardEl: HTMLElement;
  private open = false;

  constructor(private readonly container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "result-cards";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="result-card" role="dialog" aria-modal="true"></div>`;
    this.cardEl = this.el.querySelector(".result-card")!;
    container.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Shows `cards` in order; resolves when the last card's button (or link) is pressed. */
  show(cards: CardSpec[]): Promise<CardsChoice> {
    if (cards.length === 0) return Promise.resolve("button");
    const before = document.activeElement as HTMLElement | null;
    this.open = true;
    this.el.hidden = false;
    this.container.classList.add("has-result-cards");
    return new Promise((resolve) => {
      let index = 0;
      const abort = new AbortController();
      const close = (choice: CardsChoice): void => {
        abort.abort();
        this.open = false;
        this.el.hidden = true;
        this.cardEl.replaceChildren();
        this.container.classList.remove("has-result-cards");
        before?.focus?.();
        resolve(choice);
      };
      const render = (): void => {
        const spec = cards[index];
        this.cardEl.replaceChildren(spec.body);
        const label = spec.body.querySelector(".result-title")?.textContent ?? "Result";
        this.cardEl.setAttribute("aria-label", label);
        const actions = document.createElement("div");
        actions.className = "result-actions";
        if (index > 0) {
          const back = document.createElement("button");
          back.type = "button";
          back.className = "result-back";
          back.textContent = "Back";
          back.addEventListener("click", () => {
            index--;
            render();
          });
          actions.appendChild(back);
        }
        if (spec.alt) {
          const alt = document.createElement("button");
          alt.type = "button";
          alt.className = "result-retry";
          alt.textContent = spec.alt;
          alt.addEventListener("click", () => close("alt"));
          actions.appendChild(alt);
        }
        const go = document.createElement("button");
        go.type = "button";
        go.className = "result-next";
        go.textContent = spec.button;
        go.addEventListener("click", () => advance());
        actions.appendChild(go);
        this.cardEl.appendChild(actions);
        if (spec.link) {
          const link = document.createElement("button");
          link.type = "button";
          link.className = "result-link";
          link.textContent = spec.link;
          link.addEventListener("click", () => close("link"));
          this.cardEl.appendChild(link);
        }
        this.cardEl.classList.remove("entering");
        void this.cardEl.offsetWidth;
        this.cardEl.classList.add("entering");
        go.focus();
      };
      const advance = (): void => {
        if (index < cards.length - 1) {
          index++;
          render();
        } else close("button");
      };
      // On window, in the capture phase: before any other handler (Maya's Esc, the level's Esc, the shortcuts).
      window.addEventListener(
        "keydown",
        (event) => {
          if (!this.open) return;
          // A held key does not rush through the cards.
          if (event.repeat && (event.key === "Enter" || event.key === "Escape")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (event.key === "Escape") {
            // Esc jumps to the last card.
            event.preventDefault();
            event.stopImmediatePropagation();
            if (index !== cards.length - 1) {
              index = cards.length - 1;
              render();
            }
            return;
          }
          if (event.key === "Enter") {
            // A focused button presses itself; anywhere else Enter goes on.
            const target = event.target as HTMLElement | null;
            event.stopImmediatePropagation();
            if (target && target.closest("button") && this.el.contains(target)) return;
            event.preventDefault();
            advance();
            return;
          }
          if (event.key === "Tab") {
            // Focus stays in the card.
            const focusable = [...this.cardEl.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")];
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (event.shiftKey && (active === first || !this.el.contains(active))) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && (active === last || !this.el.contains(active))) {
              event.preventDefault();
              first.focus();
            }
            return;
          }
          // Shortcuts (R, M, S) and the rest wait while the cards are up.
          event.stopImmediatePropagation();
        },
        { signal: abort.signal, capture: true }
      );
      render();
    });
  }

  dispose(): void {
    this.el.remove();
  }
}
