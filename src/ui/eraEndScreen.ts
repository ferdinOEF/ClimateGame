import type { EraScoreBreakdown } from "@core/scoring";

/**
 * STEP_PROMPT_balance_tuning_findings.md Section 2: the missing half of
 * an already-working mechanic. `GameState.isEraOver`/`computeEraScore()`
 * (now `computeEraScoreBreakdown()`) both existed and worked correctly
 * before this — nothing in the live game ever showed the player when
 * Resilience hit zero. The only reset was the `?debughazards`-gated Test
 * Hazards panel's "Reset Board" button, invisible to a real player; a
 * beta tester hitting that invisible wall reads the whole game as
 * frozen, no matter how well the numbers underneath are tuned.
 *
 * Centered modal, not anchored to a tile like `BuildPopover` — this is a
 * whole-run event, not a per-tile one. Same full-viewport backdrop
 * pattern as `BuildPopover` (see its own comment for why that's the real
 * click-blocking mechanism, not a JS-side `isOpen` guard), but opaque
 * enough to visually dim the scene, matching a real "run over" moment
 * rather than a transparent click-catcher.
 */
export class EraEndScreen {
  private backdrop: HTMLElement;
  private el: HTMLElement;
  private onStartNewEra: () => void = () => {};

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "era-end-backdrop";
    this.backdrop.hidden = true;

    this.el = document.createElement("div");
    this.el.className = "era-end-card";
    this.backdrop.appendChild(this.el);
    container.appendChild(this.backdrop);
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  /**
   * `turnsSurvived` is passed separately from `breakdown` rather than
   * re-derived from it — `breakdown.turnsSurvived` is already the
   * *weighted score contribution* (`state.turn * 0.5`), not the raw turn
   * count a player actually wants to read at a glance.
   */
  show(turnsSurvived: number, breakdown: EraScoreBreakdown, onStartNewEra: () => void): void {
    this.onStartNewEra = onStartNewEra;
    const row = (label: string, value: number) =>
      `<div class="era-end-row"><span>${label}</span><span>${value >= 0 ? "+" : ""}${Math.round(value)}</span></div>`;
    this.el.innerHTML = `
      <div class="era-end-title">Era Retired</div>
      <div class="era-end-subtitle">Resilience reached zero after ${turnsSurvived} turns.</div>
      <div class="era-end-score">${Math.round(breakdown.total)}</div>
      <div class="era-end-breakdown">
        ${row("Trust", breakdown.trust)}
        ${row("Resilience", breakdown.resilience)}
        ${row("Biodiversity", breakdown.biodiversity)}
        ${row("Carbon", breakdown.carbon)}
        ${row("Turns survived", breakdown.turnsSurvived)}
        ${row("Map footprint", breakdown.mapFootprint)}
      </div>
      <button type="button" class="era-end-restart">Start New Era</button>
    `;
    this.el.querySelector(".era-end-restart")!.addEventListener("click", () => {
      this.hide();
      this.onStartNewEra();
    });
    this.backdrop.hidden = false;
  }

  hide(): void {
    this.backdrop.hidden = true;
  }
}
