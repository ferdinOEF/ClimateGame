import { playSound } from "@ui/audioHooks";

/**
 * The Panjim 2050 clock, top centre (Section 5): the year and "Year N of 25",
 * the Outlook under it, then how many builds are left this year and the Next
 * year button.
 *
 * Time moves only when the player presses Next year. Each new year flips the
 * face with a click, so the player always sees the year change when they ask
 * for it, and never when they don't. Next year is always there: a year can
 * end with builds unused.
 */
export interface ClockHudActions {
  onNextYear: () => void;
}

export interface ClockView {
  year: number;
  /** 1-based turn. */
  turn: number;
  totalYears: number;
  buildsLeft: number;
  buildsPerYear: number;
  /** True once the run is over: the face shows the last year and the turn line goes. */
  finished?: boolean;
}

export class ClockHud {
  readonly el: HTMLElement;
  private readonly yearEl: HTMLElement;
  private readonly turnEl: HTMLElement;
  /** Where the Climate Outlook mounts, between the face and the buttons. */
  readonly outlookSlot: HTMLElement;
  private readonly buildsEl: HTMLElement;
  private readonly buildsCountEl: HTMLElement;
  private readonly nextBtn: HTMLButtonElement;

  constructor(container: HTMLElement, actions: ClockHudActions) {
    this.el = document.createElement("div");
    this.el.className = "hud-corner top-center panjim-clock";
    this.el.innerHTML = `
      <div class="clock-face" aria-live="polite">
        <span class="clock-year">2026</span><span class="clock-turn">Year 1 of 25</span>
      </div>
      <div class="clock-outlook"></div>
      <div class="clock-buttons">
        <span class="clock-builds" aria-live="polite"><span class="clock-builds-label">Builds left this year</span> <b class="clock-builds-count">4</b></span>
        <button type="button" class="clock-ff clock-next-year">Next year</button>
      </div>
    `;
    container.appendChild(this.el);
    this.yearEl = this.el.querySelector(".clock-year")!;
    this.turnEl = this.el.querySelector(".clock-turn")!;
    this.outlookSlot = this.el.querySelector(".clock-outlook")!;
    this.buildsEl = this.el.querySelector(".clock-builds")!;
    this.buildsCountEl = this.el.querySelector(".clock-builds-count")!;
    this.nextBtn = this.el.querySelector(".clock-next-year")!;
    this.nextBtn.addEventListener("click", () => actions.onNextYear());
  }

  /** Paints the clock immediately, without a tick. */
  set(view: ClockView): void {
    this.yearEl.textContent = String(view.year);
    this.turnEl.textContent = view.finished ? "" : `Year ${view.turn} of ${view.totalYears}`;
    this.turnEl.hidden = Boolean(view.finished);
    this.buildsCountEl.textContent = `${view.buildsLeft} of ${view.buildsPerYear}`;
    this.buildsEl.classList.toggle("none-left", view.buildsLeft <= 0);
    this.buildsEl.hidden = Boolean(view.finished);
  }

  /** A new year: flip the face and click. */
  tick(view: ClockView): void {
    this.set(view);
    this.el.classList.remove("ticking");
    void this.el.offsetWidth; // restart the CSS animation
    this.el.classList.add("ticking");
    playSound("clock_tick");
  }

  /** Whether Next year may be pressed (false while a storm plays, or at the end). */
  setControlsEnabled(enabled: boolean): void {
    this.nextBtn.disabled = !enabled;
  }

  /** The controls, for their tooltips. */
  get parts(): { face: HTMLElement; next: HTMLButtonElement; builds: HTMLElement } {
    return { face: this.el.querySelector(".clock-face")!, next: this.nextBtn, builds: this.buildsEl };
  }

  /** A short pulse on the builds count: what the build menu points to when the year's builds are used up. */
  nudge(): void {
    this.nextBtn.classList.remove("nudge");
    void this.nextBtn.offsetWidth;
    this.nextBtn.classList.add("nudge");
  }

  dispose(): void {
    this.el.remove();
  }
}
