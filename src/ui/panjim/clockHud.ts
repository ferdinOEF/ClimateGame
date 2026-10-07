import { playSound } from "@ui/audioHooks";

/**
 * The Panjim 2050 clock, top centre: the quarter and year, a thin bar for how
 * far through the 25 years the run is, and the two fast-forward controls.
 *
 * Each quarter that passes ticks the face (a short flip and a click), so a
 * player always sees time move when they act, and never sees it move when
 * they don't. A year's fast-forward plays as a visible time-lapse: four ticks
 * spaced out, skippable with a click anywhere or Space.
 */
export interface ClockHudActions {
  onFastForwardYear: () => void;
  onFastForwardEvent: () => void;
}

export class ClockHud {
  readonly el: HTMLElement;
  private readonly quarterEl: HTMLElement;
  private readonly yearEl: HTMLElement;
  private readonly fillEl: HTMLElement;
  private readonly ffYearBtn: HTMLButtonElement;
  private readonly ffEventBtn: HTMLButtonElement;
  private readonly lapseEl: HTMLElement;
  private skipRequested = false;
  private lapsing = false;
  private readonly abort = new AbortController();

  constructor(container: HTMLElement, actions: ClockHudActions) {
    this.el = document.createElement("div");
    this.el.className = "hud-corner top-center panjim-clock";
    this.el.innerHTML = `
      <div class="clock-face" aria-live="polite">
        <span class="clock-quarter">Q1</span><span class="clock-year">2025</span>
      </div>
      <div class="clock-track" aria-hidden="true"><div class="clock-fill"></div></div>
      <div class="clock-buttons">
        <button type="button" class="clock-ff clock-ff-year" title="Spend four quarters and watch a year go by">+1 year</button>
        <button type="button" class="clock-ff clock-ff-event" title="Skip to one quarter before the next challenge">Next event</button>
      </div>
      <div class="clock-lapse" hidden>Time-lapse · click or Space to skip</div>
    `;
    container.appendChild(this.el);
    this.quarterEl = this.el.querySelector(".clock-quarter")!;
    this.yearEl = this.el.querySelector(".clock-year")!;
    this.fillEl = this.el.querySelector(".clock-fill")!;
    this.ffYearBtn = this.el.querySelector(".clock-ff-year")!;
    this.ffEventBtn = this.el.querySelector(".clock-ff-event")!;
    this.lapseEl = this.el.querySelector(".clock-lapse")!;
    this.ffYearBtn.addEventListener("click", () => actions.onFastForwardYear());
    this.ffEventBtn.addEventListener("click", () => actions.onFastForwardEvent());

    const skip = (): void => {
      if (this.lapsing) this.skipRequested = true;
    };
    document.addEventListener("pointerdown", skip, { signal: this.abort.signal, capture: true });
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === " " || event.key === "Escape") skip();
      },
      { signal: this.abort.signal }
    );
  }

  /** Paints the clock immediately, without a tick. `label` is "Q2 2026" or the bare end year. */
  set(label: string, progress: number): void {
    const [quarter, year] = label.includes(" ") ? label.split(" ") : ["", label];
    this.quarterEl.textContent = quarter;
    this.yearEl.textContent = year;
    this.fillEl.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  }

  /** One quarter passes: flip the face and click. */
  tick(label: string, progress: number): void {
    this.set(label, progress);
    this.el.classList.remove("ticking");
    void this.el.offsetWidth; // restart the CSS animation
    this.el.classList.add("ticking");
    playSound("clock_tick");
  }

  /** Whether the fast-forward controls may be used (false while a challenge plays, or at the end). */
  setControlsEnabled(year: boolean, event: boolean, eventTitle?: string): void {
    this.ffYearBtn.disabled = !year;
    this.ffEventBtn.disabled = !event;
    if (eventTitle) this.ffEventBtn.title = eventTitle;
  }

  get isLapsing(): boolean {
    return this.lapsing;
  }

  /**
   * Plays a sequence of quarter ticks as a time-lapse, `stepMs` apart, calling
   * `onStep` for each so the board can grow with it. Resolves when done. A
   * skip jumps straight to the last step.
   */
  async timeLapse(steps: { label: string; progress: number }[], stepMs: number, onStep: (index: number) => void): Promise<void> {
    if (steps.length === 0) return;
    this.lapsing = true;
    this.skipRequested = false;
    this.lapseEl.hidden = steps.length < 3;
    this.el.classList.add("lapsing");
    try {
      for (let i = 0; i < steps.length; i++) {
        if (this.skipRequested) {
          const last = steps.length - 1;
          this.tick(steps[last].label, steps[last].progress);
          onStep(last);
          break;
        }
        this.tick(steps[i].label, steps[i].progress);
        onStep(i);
        if (i < steps.length - 1) await wait(stepMs);
      }
    } finally {
      this.lapsing = false;
      this.lapseEl.hidden = true;
      this.el.classList.remove("lapsing");
    }
  }

  dispose(): void {
    this.abort.abort();
    this.el.remove();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
