import { playSound } from "@ui/audioHooks";

/**
 * The Panjim top bar (Section 16 B2), top centre, one row: the year big with
 * "Year N of 25" under it, the Outlook's track with the three storms (the
 * next one carries the countdown, "Cyclone · 5 builds"), and the Homes at
 * risk pill. It replaces Section 8's clock, the Outlook panel under it, its
 * "Next: ..." line and the floating "Cyclone in N builds" chip.
 *
 * One build is one year: time moves only when the player builds. Each new
 * year flips the face with a click, so the player always sees the year change
 * when they build, and never when they don't. "Skip this year" appears only
 * if nothing can be built anywhere on the board, which Panaji never reaches.
 */
export interface ClockHudActions {
  onSkipYear: () => void;
}

export interface ClockView {
  year: number;
  /** 1-based turn. */
  turn: number;
  totalYears: number;
  /** Builds until the next storm, which hits straight after the last of them; null after the last storm. */
  until: { builds: number; storm: string } | null;
  /** Nothing can be built anywhere: the year may pass without a build. */
  canSkip: boolean;
  /** True once the run is over: the face shows the last year and the turn line goes. */
  finished?: boolean;
}

/** "Cyclone in 3 builds", "Flood in 1 build": the countdown in a sentence (screen readers, tooltips). */
export function untilText(until: { builds: number; storm: string }): string {
  return `${until.storm} in ${until.builds} ${until.builds === 1 ? "build" : "builds"}`;
}

/** "Cyclone · 5 builds", "Cyclone · next build": the countdown on the next storm's marker (Section 16 B2). */
export function countdownText(until: { builds: number; storm: string }): string {
  return `${until.storm} in ${until.builds <= 1 ? "1 build" : `${until.builds} builds`}`;
}

export class ClockHud {
  readonly el: HTMLElement;
  private readonly yearEl: HTMLElement;
  private readonly turnEl: HTMLElement;
  /** Where the Climate Outlook's track mounts, beside the face. */
  readonly outlookSlot: HTMLElement;
  /** Where the Homes at risk pill mounts, at the right end of the bar. */
  readonly riskSlot: HTMLElement;
  /** The countdown in words, for screen readers (the marker carries it on screen). */
  private readonly untilEl: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;
  /** Where the countdown goes on screen: the next storm's marker (the Outlook). */
  onCountdown: ((text: string | null) => void) | null = null;
  private lastCountdown: string | null = null;

  constructor(container: HTMLElement, actions: ClockHudActions) {
    this.el = document.createElement("div");
    this.el.className = "hud-corner top-center panjim-clock";
    this.el.innerHTML = `
      <div class="clock-face" aria-live="polite">
        <span class="clock-year">2026</span><span class="clock-turn">Year 1 of 25</span>
      </div>
      <div class="clock-outlook"></div>
      <div class="clock-risk"></div>
      <span class="clock-until visually-hidden" aria-live="polite"></span>
      <div class="clock-buttons">
        <button type="button" class="clock-ff clock-skip-year" hidden>Skip this year</button>
      </div>
    `;
    container.appendChild(this.el);
    this.yearEl = this.el.querySelector(".clock-year")!;
    this.turnEl = this.el.querySelector(".clock-turn")!;
    this.outlookSlot = this.el.querySelector(".clock-outlook")!;
    this.riskSlot = this.el.querySelector(".clock-risk")!;
    this.untilEl = this.el.querySelector(".clock-until")!;
    this.skipBtn = this.el.querySelector(".clock-skip-year")!;
    this.skipBtn.addEventListener("click", () => actions.onSkipYear());
  }

  /** Paints the clock immediately, without a tick. */
  set(view: ClockView): void {
    this.yearEl.textContent = String(view.year);
    this.turnEl.textContent = view.finished ? "" : `Year ${view.turn} of ${view.totalYears}`;
    this.turnEl.hidden = Boolean(view.finished);
    const show = Boolean(view.until) && !view.finished && !this.el.classList.contains("holding");
    this.untilEl.textContent = show && view.until ? untilText(view.until) : "";
    this.lastCountdown = view.until && !view.finished ? countdownText(view.until) : null;
    this.onCountdown?.(show ? this.lastCountdown : null);
    this.skipBtn.hidden = !view.canSkip;
  }

  /** A new year: flip the face and click. */
  tick(view: ClockView): void {
    this.set(view);
    this.el.classList.remove("ticking");
    void this.el.offsetWidth; // restart the CSS animation
    this.el.classList.add("ticking");
    playSound("clock_tick");
  }

  /** Hides the build counter while a storm or its result cards are on screen (Section 12): it would be stale. */
  setHold(hold: boolean): void {
    this.el.classList.toggle("holding", hold);
    if (hold) this.untilEl.textContent = "";
    this.onCountdown?.(hold ? null : this.lastCountdown);
  }

  /** Whether the fallback may be pressed (false while a storm plays, or at the end). */
  setControlsEnabled(enabled: boolean): void {
    this.skipBtn.disabled = !enabled;
  }

  /** The parts, for their tooltips. */
  get parts(): { face: HTMLElement; until: HTMLElement; skip: HTMLButtonElement } {
    return { face: this.el.querySelector(".clock-face")!, until: this.untilEl, skip: this.skipBtn };
  }

  dispose(): void {
    this.el.remove();
  }
}
