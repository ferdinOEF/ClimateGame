import { playSound } from "@ui/audioHooks";

/**
 * The Panjim 2050 clock, top centre (Section 8): the year and "Year N of 25",
 * the Outlook under it, then "N builds until the cyclone" (or the flood, or
 * the two together).
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

/** "3 builds until the cyclone", "1 build until the flood". */
export function untilText(until: { builds: number; storm: string }): string {
  return `${until.builds} ${until.builds === 1 ? "build" : "builds"} until ${until.storm}`;
}

export class ClockHud {
  readonly el: HTMLElement;
  private readonly yearEl: HTMLElement;
  private readonly turnEl: HTMLElement;
  /** Where the Climate Outlook mounts, between the face and the line under it. */
  readonly outlookSlot: HTMLElement;
  private readonly untilEl: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;

  constructor(container: HTMLElement, actions: ClockHudActions) {
    this.el = document.createElement("div");
    this.el.className = "hud-corner top-center panjim-clock";
    this.el.innerHTML = `
      <div class="clock-face" aria-live="polite">
        <span class="clock-year">2026</span><span class="clock-turn">Year 1 of 25</span>
      </div>
      <div class="clock-outlook"></div>
      <div class="clock-buttons">
        <span class="clock-until" aria-live="polite"></span>
        <button type="button" class="clock-ff clock-skip-year" hidden>Skip this year</button>
      </div>
    `;
    container.appendChild(this.el);
    this.yearEl = this.el.querySelector(".clock-year")!;
    this.turnEl = this.el.querySelector(".clock-turn")!;
    this.outlookSlot = this.el.querySelector(".clock-outlook")!;
    this.untilEl = this.el.querySelector(".clock-until")!;
    this.skipBtn = this.el.querySelector(".clock-skip-year")!;
    this.skipBtn.addEventListener("click", () => actions.onSkipYear());
  }

  /** Paints the clock immediately, without a tick. */
  set(view: ClockView): void {
    this.yearEl.textContent = String(view.year);
    this.turnEl.textContent = view.finished ? "" : `Year ${view.turn} of ${view.totalYears}`;
    this.turnEl.hidden = Boolean(view.finished);
    this.untilEl.textContent = view.until ? untilText(view.until) : "";
    this.untilEl.hidden = !view.until || Boolean(view.finished) || this.el.classList.contains("holding");
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
    if (hold) this.untilEl.hidden = true;
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
