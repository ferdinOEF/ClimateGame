import type { PhaseResult } from "@core/phaseResult";
import { resultHeadline } from "@core/phaseResult";
import { panajiRunPhrase } from "@ui/screens/runWords";

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
}

/** What closed the cards: the last card's button, or its link. */
export type CardsChoice = "button" | "link";

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

/** "N of M homes saved" with a bar. */
function homesHtml(saved: number, total: number): string {
  const pct = total > 0 ? Math.round((saved / total) * 100) : 100;
  // Section 14: said in words when nothing in the path was lost.
  const all = total > 0 && saved >= total ? `<div class="result-homes-all">Every home in the path survived</div>` : "";
  return `<div class="result-homes">
    ${all}
    <div class="result-homes-text"><b>${saved}</b> of ${total} homes saved</div>
    <div class="result-bar" role="img" aria-label="${pct}% of homes saved"><span style="width:${pct}%"></span></div>
  </div>`;
}

/** Maya's one line on a card, in the card (her bubble never draws over the cards); a game rule is labelled as one. */
export type CardLine = { text: string; rule: boolean } | null;
function mayaHtml(line: CardLine): string {
  if (!line) return "";
  return `<p class="result-maya"><span class="result-maya-name">Maya</span>${line.rule ? `<span class="result-rule">Game rule</span>` : ""} ${esc(line.text)}</p>`;
}

/** Card 1: the storm's result. */
export function resultCard(result: PhaseResult): HTMLElement {
  const places = result.places.length
    ? `<ul class="result-places">${result.places
        .map((p) => `<li><span class="result-place-name">${esc(p.name)}</span><span class="result-chip ${p.stood ? "stood" : "damaged"}">${p.stood ? "Stood" : "Damaged"}</span></li>`)
        .join("")}</ul>`
    : "";
  return el(`<div class="result-card-body">
    <div class="result-eyebrow">${esc(result.eyebrow)}</div>
    <h2 class="result-title">${esc(resultHeadline(result.stars))}</h2>
    ${starsHtml(result.stars)}
    ${result.objectiveComplete ? `<div class="result-badge" role="note">Objective complete</div>` : ""}
    ${homesHtml(result.homesSaved, result.homesTotal)}
    ${places}
  </div>`);
}

/** Card 2: what protected the homes, one row per kind of defence built in the phase. */
export function defencesCard(result: PhaseResult, mayaLine: CardLine): HTMLElement {
  const most = Math.max(1, ...result.defences.map((d) => d.homes));
  const rows = result.defences.length
    ? `<p class="result-sub">Homes that would have been lost without each defence.</p>
       <ul class="result-rows">${result.defences
         .map((d) => `<li><span class="result-row-name">${esc(d.name)}</span><span class="result-row-bar" aria-hidden="true"><span style="width:${Math.round((d.homes / most) * 100)}%"></span></span><span class="result-row-value">${d.homes}</span></li>`)
         .join("")}</ul>`
    : `<p class="result-sub">Nothing stood in the way this time.</p>`;
  return el(`<div class="result-card-body">
    <div class="result-eyebrow">${esc(result.eyebrow)}</div>
    <h2 class="result-title">What protected your homes</h2>
    ${rows}
    ${result.defences.length ? mayaHtml(mayaLine) : ""}
  </div>`);
}

/** Card 3: the next storm, with its forecast's map, line and legend. */
export function comingUpCard(title: string, preview: HTMLElement | null, mayaLine: CardLine): HTMLElement {
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
         .map((d) => `<li><span class="result-row-name">${esc(d.name)}</span><span class="result-row-bar" aria-hidden="true"><span style="width:${Math.round((d.homes / most) * 100)}%"></span></span><span class="result-row-value">${d.homes}</span></li>`)
         .join("")}</ul>`
    : `<p class="result-sub">Nothing stood in the cyclone's way this time.</p>`;
  return el(`<div class="result-card-body tutorial-result">
    <div class="result-eyebrow">Tutorial · ${esc(result.eyebrow)}</div>
    <h2 class="result-title">${esc(resultHeadline(result.stars))}</h2>
    ${starsHtml(result.stars)}
    ${homesHtml(result.homesSaved, result.homesTotal)}
    ${rows}
    <p class="result-sub">Panaji is the real city: ${esc(panajiRunPhrase())}.</p>
  </div>`);
}

/** The final card: the three phases, the total and the overall stars. */
export function finalCard(phases: { label: string; saved: number; total: number }[], stars: number): HTMLElement {
  const saved = phases.reduce((s, p) => s + p.saved, 0);
  const total = phases.reduce((s, p) => s + p.total, 0);
  return el(`<div class="result-card-body">
    <h2 class="result-title">Panjim, 2026 to 2050</h2>
    <ul class="result-phases">${phases.map((p) => `<li><span>${esc(p.label)}</span><span><b>${p.saved}</b> of ${p.total} homes saved</span></li>`).join("")}</ul>
    ${homesHtml(saved, total)}
    ${starsHtml(stars)}
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
