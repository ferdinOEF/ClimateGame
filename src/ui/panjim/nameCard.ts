import { checkName, NAME_HINT, NAME_MAX } from "@core/nameFilter";
import type { BoardRow } from "@services/board";
import { trapFocus } from "@ui/focusTrap";

/**
 * Section 35.3: the name card, before Play Panjim's start popup (never in the Tutorial). Left: what the board is, the
 * field ("Your name or Instagram handle"), Play and Play without a name. Right: the board's top 10, or "Board offline"
 * when it can't be reached. Tab goes field, Play, Play without a name, then the list; Enter in the field is Play; Esc
 * does nothing here (the start popup's layer holds it).
 */
export type TopState = { status: "loading" } | { status: "offline" } | { status: "ready"; rows: BoardRow[]; season: string };

const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const BOARD_OFFLINE = "The board can't be reached right now. You can still play, and your points show at the end.";

/** The right side: the top 10 (rank, name, points, season), or why it is not there. */
export function topTenHtml(state: TopState): string {
  if (state.status === "loading") return `<h3 class="name-card-top-title">Top 10</h3><p class="name-card-top-note">Loading the board.</p>`;
  if (state.status === "offline") return `<h3 class="name-card-top-title">Board offline</h3><p class="name-card-top-note">${BOARD_OFFLINE}</p>`;
  if (state.rows.length === 0) return `<h3 class="name-card-top-title">Top 10</h3><p class="name-card-top-note">No one is on the board yet. Be the first.</p>`;
  return `<h3 class="name-card-top-title">Top 10</h3>
    <ol class="name-card-top-rows" tabindex="0" aria-label="Top 10">${state.rows
      .slice(0, 10)
      .map((r) => `<li><span class="name-card-rank">${r.rank}</span><span class="name-card-name">${esc(r.name)}</span><b>${r.points}</b><span class="name-card-season">${esc(r.season)}</span></li>`)
      .join("")}</ol>`;
}

export function nameCardHtml(initial: string | null): string {
  return `<div class="name-card" role="dialog" aria-modal="true" aria-labelledby="name-card-title">
    <form class="name-card-main" novalidate>
      <div class="name-card-eyebrow">PLAY PANJIM, 2026 TO 2050</div>
      <h2 class="name-card-title" id="name-card-title">Save Panjim. Get your name on the board.</h2>
      <p class="name-card-line">Save Panjim and your name goes up on the board. Points come in after each storm.</p>
      <label class="name-card-label" for="name-card-field">Your name or Instagram handle</label>
      <input class="name-card-field" id="name-card-field" name="name" type="text" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@yourhandle" value="${esc(initial ?? "")}" aria-describedby="name-card-hint name-card-error">
      <p class="name-card-hint" id="name-card-hint">${NAME_HINT}</p>
      <p class="name-card-error" id="name-card-error" role="alert" hidden></p>
      <div class="name-card-actions">
        <button type="submit" class="name-card-play btn-primary">Play</button>
        <button type="button" class="name-card-skip">Play without a name</button>
      </div>
    </form>
    <aside class="name-card-top" aria-live="polite">${topTenHtml({ status: "loading" })}</aside>
  </div>`;
}

export class NameCard {
  readonly el: HTMLElement;
  private readonly field: HTMLInputElement;
  private readonly error: HTMLElement;
  private open = true;
  /** Resolves with the checked name, or null for Play without a name. */
  readonly result: Promise<string | null>;

  constructor(initial: string | null, top: Promise<{ rows: BoardRow[]; season: string } | null>) {
    const holder = document.createElement("div");
    holder.innerHTML = nameCardHtml(initial);
    this.el = holder.firstElementChild as HTMLElement;
    this.field = this.el.querySelector(".name-card-field")!;
    this.error = this.el.querySelector(".name-card-error")!;
    const topEl = this.el.querySelector<HTMLElement>(".name-card-top")!;
    void top.then((board) => {
      if (this.open) topEl.innerHTML = topTenHtml(board ? { status: "ready", rows: board.rows, season: board.season } : { status: "offline" });
    });
    trapFocus(this.el, () => this.open);
    this.field.addEventListener("input", () => {
      this.error.hidden = true;
      this.field.removeAttribute("aria-invalid");
    });
    this.result = new Promise((resolve) => {
      const done = (name: string | null): void => {
        this.open = false;
        resolve(name);
      };
      this.el.querySelector("form")!.addEventListener("submit", (event) => {
        event.preventDefault();
        const check = checkName(this.field.value);
        if (!check.ok) {
          this.error.textContent = check.message;
          this.error.hidden = false;
          this.field.setAttribute("aria-invalid", "true");
          this.field.focus();
          return;
        }
        done(check.name);
      });
      this.el.querySelector(".name-card-skip")!.addEventListener("click", () => done(null));
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Focus to the field, once the card is on screen. */
  focus(): void {
    this.field.focus({ preventScroll: true });
  }
}
