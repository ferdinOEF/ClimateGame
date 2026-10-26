import { trapFocus } from "./focusTrap";
import type { Tooltips } from "./tooltip";

export interface PopoverOption {
  id: string;
  name: string;
  buildCost: number;
  /** Shown as a small tag so a defense reads differently from a town building at a glance. */
  kindLabel?: string;
  /** One sentence on what it does, for its hover tooltip. */
  tip?: string;
}

export interface BuiltElementInfo {
  name: string;
  kindLabel?: string;
  /** Rendered as "key +delta" / "key delta" chips — whatever's in the element's effects map. */
  effects: Record<string, number>;
  /**
   * STEP_PROMPT_manual_only_mode.md Part C: removing what you built is a
   * natural counterpart to building it — no confirm here, unlike the dev
   * panel's board-wide reset, since this only ever affects the one tile
   * already in view.
   *
   * Optional, because a monument has no Remove. The Church of the Immaculate
   * Conception is not the player's to demolish, and the honest way to express
   * that is to not draw the button — a disabled one invites the question of
   * what would happen if it worked.
   */
  onRemove?: () => void;
  /** Label for the remove button. Panjim 2050 says "Demolish · 1q", since it costs time there. */
  removeLabel?: string;
  /** Extra actions drawn above Remove, such as Panjim 2050's Repair. */
  extraActions?: { label: string; onClick: () => void; disabled?: boolean }[];
  /** A short line under the name. Used by monuments to say what the building is; built elements get their effects instead. */
  note?: string;
}

/** How the build menu is drawn on a level that differs from the default. */
export interface PopoverMode {
  /**
   * Coins off (Section 5): no price on any option, and nothing is greyed out
   * for being unaffordable.
   */
  // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
  hideCost?: boolean;
  /**
   * A line at the top of the menu, e.g. that no builds are left this year.
   * With `blocked`, every option is shown but none can be chosen.
   */
  notice?: string;
  blocked?: boolean;
  /** A button under the notice. */
  noticeAction?: { label: string; onClick: () => void };
}

/**
 * One card in the build menu (Section 13, Panjim): an icon, the name, a
 * plain line on what it does, and the model's exact number for this tile.
 */
export interface BuildCard {
  id: string;
  name: string;
  /** Section 30.3: its main job, in game wording. */
  line: string;
  /** Section 30.3: one other thing it does (a real world fact with a source, or for the seawall a game rule). */
  detail?: string;
  /** Section 30.4: its change to biodiversity, shown in a small leaf chip. */
  biodiversity?: number;
  /** Inline SVG markup. */
  icon: string;
  /** Cannot go on this ground: named on the one "Not here" line. */
  notHere?: boolean;
}

/** Section 30.4: "+3" in a small leaf chip (a fall in a brown one; no red on the cards, Section 13). */
export function leafChip(change: number): HTMLElement {
  const chip = document.createElement("span");
  const sign = change > 0 ? "+" : change < 0 ? "\u2212" : "";
  chip.className = `leaf-chip ${change > 0 ? "up" : change < 0 ? "down" : "level"}`;
  chip.setAttribute("role", "img");
  chip.setAttribute("aria-label", `Biodiversity ${change > 0 ? "plus " : change < 0 ? "minus " : ""}${Math.abs(change)}`);
  chip.innerHTML = `<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M2 10 C2 4 6 1.5 10.5 1.5 C10.5 6 8 10 2 10 Z M2 10 L7 5" fill="currentColor" stroke="currentColor" stroke-width="0.6"/></svg><span>${sign}${Math.abs(change)}</span>`;
  return chip;
}

const VIEWPORT_MARGIN = 8;
/** Gap between the tile and the cards beside it. */
const CARD_GAP = 34;
/** The pointer's highest spot: below the cards' header band. */
const POINTER_MIN_Y = 46;

/**
 * The contextual build menu: a small popover anchored to the clicked tile's
 * screen position — never a persistent sidebar. Section 3's non-negotiable
 * rule: build choices appear at the tile, in place, and disappear when done.
 *
 * Backed by a full-viewport transparent backdrop (NEXT_STEPS.md's A1: a
 * "real modal layer" was the explicit ask, not just an outside-click
 * listener) that sits above the canvas and below the popover box itself
 * while open, so a click anywhere except the popover can never reach the
 * 3D scene underneath a still-open popover — it always just closes the
 * popover instead, with no side effect on whatever tile happens to be
 * under the cursor. The backdrop's own click handler only fires when the
 * click's `target` is the backdrop element itself, not a descendant, so a
 * click on the popover's own content never closes it.
 *
 * A prior version had none of this and relied on the caller checking
 * `isOpen`/`contains()` before acting — that depended on `this.el.hidden`
 * actually hiding the element, which it silently didn't: `.build-popover`
 * has its own unconditional `display: flex` in hud.css, an author-origin
 * rule that overrides the `[hidden]` user-agent default regardless of
 * selector specificity, so setting `.hidden = true` updated the attribute
 * correctly but never changed what was on screen. That was the actual root
 * cause of A1's whole "doesn't dismiss" symptom family — the JS-side
 * open/closed state was correct the entire time. Once hiding moved to
 * `this.backdrop.hidden` (below) instead of `this.el.hidden`, the problem
 * stopped applying at all — `.popover-backdrop` has no competing `display`
 * override, so the browser's own `[hidden]` default just works, and a
 * hidden ancestor hides `.build-popover` regardless of its own `display`.
 * The `.build-popover[hidden]` CSS override this originally needed became
 * dead weight once nothing set that attribute on `.build-popover` itself
 * anymore — removed in the STEP_PROMPT_code_review_cleanup.md pass.
 */
/** Section 34: how long after the cards open a pointer click on one is taken as a double click's second half. */
export const CARD_CLICK_GUARD_MS = 400;

export class BuildPopover {
  private backdrop: HTMLElement;
  private el: HTMLElement;
  /** Set by the session: gives each option its hover tooltip. */
  tooltips: Tooltips | null = null;

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "popover-backdrop";
    this.backdrop.hidden = true;
    // A click outside only closes (Section 34 tried opening the tile under it, and players then built by accident on
    // the menu that opened under their next click: an accidental build costs a year and cannot be undone).
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.hide();
    });

    this.el = document.createElement("div");
    this.el.className = "build-popover";
    this.backdrop.appendChild(this.el);
    container.appendChild(this.backdrop);
    // Section 34: Tab stays among the cards while the menu is open (it wandered to the panels behind).
    trapFocus(this.el, () => this.isOpen);
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  /** True if `target` is this popover or one of its descendants — lets a caller tell an outside click from one on the popover itself. */
  contains(target: Node | null): boolean {
    return target !== null && this.el.contains(target);
  }

  show(
    screenX: number,
    screenY: number,
    options: PopoverOption[],
    coin: number,
    onSelect: (id: string) => void,
    mode: PopoverMode = {}
  ): void {
    this.el.innerHTML = "";
    this.el.classList.remove("as-cards");
    if (options.length === 0) {
      this.hide();
      return;
    }
    this.el.classList.toggle("hide-cost", Boolean(mode.hideCost));
    if (mode.notice) {
      const notice = document.createElement("div");
      notice.className = "build-notice";
      notice.setAttribute("role", "status");
      notice.textContent = mode.notice;
      if (mode.noticeAction) {
        const action = mode.noticeAction;
        const go = document.createElement("button");
        go.type = "button";
        go.className = "build-notice-action";
        go.textContent = action.label;
        go.addEventListener("click", (e) => {
          e.stopPropagation();
          this.hide();
          action.onClick();
        });
        notice.appendChild(go);
      }
      this.el.appendChild(notice);
    }
    for (const def of options) {
      const btn = document.createElement("button");
      // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
      const affordable = (mode.hideCost || coin >= def.buildCost) && !mode.blocked;
      btn.className = "build-option" + (affordable ? "" : " disabled");
      const label = def.kindLabel ? `${def.name} <em>${def.kindLabel}</em>` : def.name;
      btn.innerHTML = mode.hideCost ? `<span>${label}</span>` : `<span>${label}</span><span class="cost">${def.buildCost}c</span>`;
      if (mode.blocked) btn.setAttribute("aria-disabled", "true");
      if (def.tip && this.tooltips) {
        const tip = def.tip;
        this.tooltips.attach(btn, () => tip, undefined, "right");
      }
      if (affordable) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelect(def.id);
          this.hide();
        });
      }
      this.el.appendChild(btn);
    }
    this.positionAndReveal(screenX, screenY);
  }

  /**
   * The build menu as cards (Section 13, Panjim), beside the tile rather than
   * over it. Cards that can be built come first; the defences that cannot go
   * on this ground follow, greyed and small, each saying "Not here".
   * `avoid` lists HUD elements the cards must never cover (the year chip).
   */
  showCards(
    screenX: number,
    screenY: number,
    cards: BuildCard[],
    onSelect: (id: string) => void,
    mode: { notice?: string; blocked?: boolean; avoid?: string[]; onHover?: (id: string | null) => string | null; avoidPoints?: readonly { x: number; y: number }[] } = {}
  ): void {
    this.el.innerHTML = "";
    this.el.classList.add("as-cards");
    this.openedAt = performance.now();
    // What each card says is this game's rule, and its number this game's model.
    const head = document.createElement("div");
    head.className = "build-card-head";
    head.textContent = "In this game";
    this.el.appendChild(head);
    if (mode.notice) {
      const notice = document.createElement("div");
      notice.className = "build-notice";
      notice.setAttribute("role", "status");
      notice.textContent = mode.notice;
      this.el.appendChild(notice);
    }
    const open = cards.filter((card) => !card.notHere);
    // Section 30.8: hovering (or focusing) a card shows on the board what it would do; when it does nothing to the
    // next storm, one line here says so.
    const hoverNote = document.createElement("p");
    hoverNote.className = "build-hover-note";
    hoverNote.setAttribute("role", "status");
    hoverNote.hidden = true;
    const hover = (id: string | null): void => {
      const note = mode.onHover?.(id) ?? null;
      hoverNote.textContent = note ?? "";
      hoverNote.hidden = !note;
    };
    this.cardHover = mode.onHover ? () => mode.onHover?.(null) : null;
    const elsewhere = cards.filter((card) => card.notHere);
    for (const card of open) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "build-card" + (mode.blocked ? " disabled" : "");
      btn.dataset.element = card.id;
      // Section 17.1: the name, the icon and the line; no home count. Section 30.3: a second line; Section 30.4: a
      // leaf chip with the build's change to biodiversity.
      btn.innerHTML = `<span class="build-card-icon" aria-hidden="true">${card.icon}</span><span class="build-card-text"><span class="build-card-title"><span class="build-card-name"></span></span><span class="build-card-line"></span></span>`;
      (btn.querySelector(".build-card-name") as HTMLElement).textContent = card.name;
      (btn.querySelector(".build-card-line") as HTMLElement).textContent = card.line;
      if (card.detail) {
        const detail = document.createElement("span");
        detail.className = "build-card-detail";
        detail.textContent = card.detail;
        btn.querySelector(".build-card-text")!.appendChild(detail);
      }
      if (card.biodiversity !== undefined) btn.querySelector(".build-card-title")!.appendChild(leafChip(card.biodiversity));
      if (mode.onHover && !mode.blocked) {
        btn.addEventListener("pointerenter", () => hover(card.id));
        btn.addEventListener("pointerleave", () => hover(null));
        // A keyboard focus only (the menu focuses its first card as it opens; that is not a hover).
        btn.addEventListener("focus", () => {
          if (btn.matches(":focus-visible")) hover(card.id);
        });
        btn.addEventListener("blur", () => hover(null));
      }
      if (mode.blocked) btn.setAttribute("aria-disabled", "true");
      else
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          // Section 34: the second click of a double click on the tile lands on the card that opened under the
          // pointer, and built it. A pointer click (detail > 0; a key's has 0) that soon after opening is ignored.
          if (e.detail > 0 && performance.now() - this.openedAt < CARD_CLICK_GUARD_MS) return;
          onSelect(card.id);
          this.hide();
        });
      this.el.appendChild(btn);
    }
    this.el.appendChild(hoverNote);
    if (elsewhere.length > 0) {
      // Section 16 B6: one quiet line, not a greyed card each.
      const line = document.createElement("p");
      line.className = "build-card-elsewhere";
      line.dataset.elements = elsewhere.map((card) => card.id).join(" ");
      // A name never breaks across lines ("Small / dam"): its own spaces are non-breaking.
      line.textContent = `Not here: ${elsewhere.map((card) => card.name.replace(/ /g, "\u00a0")).join(", ")}`;
      this.el.appendChild(line);
    }
    this.placeBeside(screenX, screenY, mode.avoid ?? [], mode.avoidPoints ?? []);
    this.returnFocus = document.activeElement instanceof HTMLElement && !this.el.contains(document.activeElement) ? document.activeElement : null;
    (this.el.querySelector<HTMLElement>(".build-card:not(.disabled)") ?? null)?.focus({ preventScroll: true });
  }

  /**
   * Beside the tile, clear of the viewport's edges and of `avoid`: tries the
   * right of the tile and the left, at the tile's height and just clear of
   * each obstacle, and takes the spot that covers the least of the HUD (the
   * first listed, the year chip, counts most), then the one nearest the tile.
   */
  /**
   * `points` (container pixels): Section 30.8, the homes at risk, which a hovered card lights up: the cards sit where
   * they cover the fewest of them (never over the HUD or the tile all the same).
   */
  private placeBeside(screenX: number, screenY: number, avoid: string[], points: readonly { x: number; y: number }[] = []): void {
    this.el.style.left = "0px";
    this.el.style.top = "0px";
    this.backdrop.hidden = false;
    const { width, height } = this.el.getBoundingClientRect();
    const origin = (this.el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const obstacles = avoid.flatMap((selector, rank) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width >= 1 && r.height >= 1)
        .map((r) => ({ r, weight: rank === 0 ? 1000 : 1 }))
    );
    const clampX = (x: number): number => Math.max(VIEWPORT_MARGIN, Math.min(vw - VIEWPORT_MARGIN - width, x));
    const clampY = (y: number): number => Math.max(VIEWPORT_MARGIN, Math.min(vh - VIEWPORT_MARGIN - height, y));
    const lefts = [clampX(screenX + CARD_GAP), clampX(screenX - CARD_GAP - width)];
    const tops = [screenY - height / 2, ...obstacles.flatMap(({ r }) => [r.bottom + VIEWPORT_MARGIN, r.top - VIEWPORT_MARGIN - height])].map(clampY);
    let best = { left: lefts[0], top: tops[0], cost: Infinity };
    for (const left of lefts) {
      for (const top of tops) {
        let covered = 0;
        for (const { r, weight } of obstacles) {
          const w = Math.min(left + width, r.right) - Math.max(left, r.left);
          const h = Math.min(top + height, r.bottom) - Math.max(top, r.top);
          if (w > 0 && h > 0) covered += w * h * weight;
        }
        for (const p of points) {
          const x = p.x + origin.left;
          const y = p.y + origin.top;
          if (x > left - 12 && x < left + width + 12 && y > top - 12 && y < top + height + 12) covered += 400;
        }
        // Covering the tile itself is never wanted either; then nearer is better.
        const overTile = screenX > left - 8 && screenX < left + width + 8 && screenY > top - 8 && screenY < top + height + 8 ? 1e6 : 0;
        const cost = covered + overTile + Math.abs(top + height / 2 - screenY) * 0.5 + Math.abs(left - screenX) * 0.1;
        if (cost < best.cost) best = { left, top, cost };
      }
    }
    this.el.style.left = `${Math.round(best.left - origin.left)}px`;
    this.el.style.top = `${Math.round(best.top - origin.top)}px`;
    // Section 33b.5: a small pointer on the side facing the tile, at the tile's height (kept off the header band and
    // the rounded corners). None when the cards had to sit over the tile's column.
    const side = best.left >= screenX ? "left" : best.left + width <= screenX ? "right" : null;
    this.el.classList.toggle("pointer-left", side === "left");
    this.el.classList.toggle("pointer-right", side === "right");
    this.el.style.setProperty("--pointer-y", `${Math.round(Math.max(POINTER_MIN_Y, Math.min(height - 18, screenY - best.top)))}px`);
  }

  /** A one-line note in place of a build menu (a tile that is not part of the game). */
  showNote(screenX: number, screenY: number, text: string): void {
    this.el.innerHTML = "";
    this.el.classList.remove("as-cards");
    const note = document.createElement("div");
    note.className = "built-info-note popover-note";
    note.textContent = text;
    this.el.appendChild(note);
    this.positionAndReveal(screenX, screenY);
  }

  /**
   * Info card for a tile that already has an element built on it (Section
   * 3's "one tile, one element" — the UI should never offer a second build
   * menu there). Shows what's built and its effects, plus — STEP_PROMPT_
   * manual_only_mode.md Part C — a "Remove" button, the natural counterpart
   * to building it. Dismissed the same way the build menu is (or by
   * `onRemove` itself, which the caller wires to close this popover too).
   */
  showInfo(screenX: number, screenY: number, info: BuiltElementInfo): void {
    this.el.innerHTML = "";
    this.el.classList.remove("as-cards");
    const header = document.createElement("div");
    header.className = "build-option built-info-header";
    const label = info.kindLabel ? `${info.name} <em>${info.kindLabel}</em>` : info.name;
    header.innerHTML = `<span>${label}</span>`;
    this.el.appendChild(header);

    const effectEntries = Object.entries(info.effects);
    if (effectEntries.length > 0) {
      const effectsRow = document.createElement("div");
      effectsRow.className = "built-info-effects";
      effectsRow.textContent = effectEntries.map(([key, delta]) => `${key} ${delta > 0 ? "+" : ""}${delta}`).join(", ");
      this.el.appendChild(effectsRow);
    }

    if (info.note) {
      const note = document.createElement("div");
      note.className = "built-info-note";
      note.textContent = info.note;
      this.el.appendChild(note);
    }

    for (const action of info.extraActions ?? []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "built-info-remove built-info-action";
      btn.textContent = action.label;
      btn.disabled = action.disabled === true;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        action.onClick();
      });
      this.el.appendChild(btn);
    }

    const onRemove = info.onRemove;
    if (onRemove) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "built-info-remove";
      removeBtn.textContent = info.removeLabel ?? "Remove";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onRemove();
      });
      this.el.appendChild(removeBtn);
    }

    this.positionAndReveal(screenX, screenY);
  }

  /**
   * Positions the popover at (screenX, screenY), then clamps within the
   * viewport — near a map edge the anchor point can otherwise push it
   * partly or fully off-screen. Revealing the backdrop and the measurement
   * both happen before the browser's next paint, so there's no visible
   * flash at the wrong position.
   */
  private positionAndReveal(screenX: number, screenY: number): void {
    this.el.style.left = `${screenX}px`;
    this.el.style.top = `${screenY}px`;
    this.backdrop.hidden = false;

    const rect = this.el.getBoundingClientRect();
    let left = screenX;
    let top = screenY;
    const halfWidth = rect.width / 2;
    if (rect.left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN + halfWidth;
    if (rect.right > window.innerWidth - VIEWPORT_MARGIN) left = window.innerWidth - VIEWPORT_MARGIN - halfWidth;
    if (rect.top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN + rect.height;
    if (rect.bottom > window.innerHeight - VIEWPORT_MARGIN) top = window.innerHeight - VIEWPORT_MARGIN;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  /** Called whenever the popover closes, however it closes. */
  onHide: (() => void) | null = null;
  /** Section 34: when the cards opened; a pointer click on one in the first moment is a double click's second half. */
  private openedAt = 0;

  /** Where focus was before the cards took it: given back when they close. */
  private returnFocus: HTMLElement | null = null;
  /** Section 30.8: clears the board's hover glow when the cards close. */
  private cardHover: (() => void) | null = null;

  hide(): void {
    const hadFocus = this.el.contains(document.activeElement);
    this.backdrop.hidden = true;
    if (hadFocus && this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.returnFocus = null;
    this.tooltips?.hide();
    this.cardHover?.();
    this.cardHover = null;
    this.onHide?.();
  }
}
