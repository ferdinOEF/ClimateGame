import nuggetsData from "@data/nuggets.json";
import { ELEMENT_BY_ID } from "@core/elements";

const NUGGETS = nuggetsData as Record<string, string[]>;

/** Sum of every element's fact-array length — never hardcoded, so the denominator tracks nuggets.json automatically if it grows. */
const TOTAL_FACTS = Object.values(NUGGETS).reduce((sum, facts) => sum + facts.length, 0);

/**
 * C.2: a positive/negative framing decided in chat, not a per-element
 * color — `PALETTE.defenseMangrove`/`PALETTE.defenseSandMining` from
 * palette.ts, duplicated here as literal hex (and again in hud.css's own
 * `.nugget-badge.tint-*` rules) since hud.css can't import from
 * palette.ts — a different module system, same as every other palette
 * color already duplicated into hud.css as a literal (e.g.
 * `.hazard-test-row.storm`'s own `#3e86b0` comment explains why).
 */
const CAUTION_IDS = new Set(["beachside_resort", "sand_mining", "yacht"]);

const DISMISS_MS = 5000;

/** A simple 4-point sparkle — the "new discovery" glyph, tint-colored via the badge's own circular background, not the glyph itself. */
const DISCOVERY_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" fill="#fdf6e6"/></svg>';

/**
 * Fisher-Yates, optionally avoiding a given first element — used when
 * reshuffling after exhausting a pick order, so the new shuffle's first
 * fact can never immediately repeat whatever was just shown last.
 */
function shuffledIndices(n: number, avoidFirst?: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (avoidFirst !== undefined && n > 1 && arr[0] === avoidFirst) {
    const swapWith = 1 + Math.floor(Math.random() * (n - 1));
    [arr[0], arr[swapWith]] = [arr[swapWith], arr[0]];
  }
  return arr;
}

/**
 * STEP_PROMPT_knowledge_nuggets.md Part C: the "Discovery Badge" that
 * appears the instant a player successfully builds one of the ten
 * nugget-eligible elements — one of that element's three pre-written
 * facts, plus a running "N of 30 facts found" count across the session.
 * `house` deliberately has no entry in nuggets.json, so `show()` no-ops
 * for it (and for any future element added without nuggets yet) rather
 * than throwing.
 */
export class NuggetPopup {
  private el: HTMLElement;
  private labelEl: HTMLElement;
  private textEl: HTMLElement;
  private fillEl: HTMLElement;
  private progressEl: HTMLElement;
  private dismissTimer: number | null = null;
  /** Per-element shuffle state — a fresh shuffle on first build of that type, reshuffled (never immediately repeating) once exhausted. */
  private pickState = new Map<string, { order: number[]; cursor: number }>();
  /** `"<elementId>#<factIndex>"` keys — a Set, not a raw counter, so a repeat shown again can be told apart from a genuinely new fact for the progress bar. */
  private discovered = new Set<string>();

  constructor(container: HTMLElement) {
    const el = document.createElement("div");
    el.className = "hud-corner bottom-left nugget-badge";
    el.hidden = true;
    el.innerHTML = `
      <div class="nugget-badge-icon">${DISCOVERY_ICON_SVG}</div>
      <div class="nugget-badge-body">
        <div class="nugget-badge-eyebrow">New discovery</div>
        <div class="nugget-badge-label"></div>
        <p class="nugget-badge-text"></p>
        <div class="nugget-badge-track"><div class="nugget-badge-fill"></div></div>
        <div class="nugget-badge-progress"></div>
      </div>`;
    container.appendChild(el);
    this.el = el;
    this.labelEl = el.querySelector(".nugget-badge-label")!;
    this.textEl = el.querySelector(".nugget-badge-text")!;
    this.fillEl = el.querySelector(".nugget-badge-fill")!;
    this.progressEl = el.querySelector(".nugget-badge-progress")!;
  }

  /** No-ops silently if elementId has no entry in nuggets.json. */
  show(elementId: string): void {
    const facts = NUGGETS[elementId];
    if (!facts || facts.length === 0) return;

    let state = this.pickState.get(elementId);
    if (!state || state.cursor >= state.order.length) {
      const avoidFirst = state ? state.order[state.order.length - 1] : undefined;
      state = { order: shuffledIndices(facts.length, avoidFirst), cursor: 0 };
      this.pickState.set(elementId, state);
    }
    const factIndex = state.order[state.cursor];
    state.cursor++;

    this.discovered.add(`${elementId}#${factIndex}`);

    const caution = CAUTION_IDS.has(elementId);
    this.el.classList.toggle("tint-caution", caution);
    this.el.classList.toggle("tint-positive", !caution);
    this.labelEl.textContent = ELEMENT_BY_ID.get(elementId)?.name ?? elementId;
    this.textEl.textContent = facts[factIndex];
    this.fillEl.style.width = `${(this.discovered.size / TOTAL_FACTS) * 100}%`;
    this.progressEl.textContent = `${this.discovered.size} of ${TOTAL_FACTS} facts found`;

    if (this.dismissTimer !== null) window.clearTimeout(this.dismissTimer);
    this.el.hidden = false;
    // Same "restart cleanly" pattern Hud.flashArrival() already uses —
    // remove the animating class, force a reflow, re-add it — so a
    // second nugget built while one is still showing replaces the
    // content and genuinely restarts the entrance animation, rather than
    // a no-op class toggle silently doing nothing.
    this.el.classList.remove("entering");
    void this.el.offsetWidth;
    this.el.classList.add("entering");

    this.dismissTimer = window.setTimeout(() => {
      this.el.hidden = true;
      this.dismissTimer = null;
    }, DISMISS_MS);
  }

  /** Same "doesn't need to persist across a reset" convention as HazardTestPanel.reset() — clears the per-element pick-order state and the discovered-count back to zero. */
  reset(): void {
    if (this.dismissTimer !== null) {
      window.clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    this.pickState.clear();
    this.discovered.clear();
    this.el.hidden = true;
    this.el.classList.remove("entering");
  }
}
