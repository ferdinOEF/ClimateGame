import { playSound } from "@ui/audioHooks";

/**
 * Section 33b.2 (owner decision): the HUD card, top left, one static card that never collapses or moves and stays
 * during storms. Line 1: the year big with "Year N of 25" under it, the countdown chip ("Cyclone in 5 builds"),
 * then How to play (?) and ☰. Line 2: the run's years as a timeline with the storms on it (the Outlook). Line 3:
 * Biodiversity and Homes at risk. Below them, the objective (Section 33b.3). It replaces Section 16 B2's top bar,
 * top centre, and the separate ? and ☰ circles.
 *
 * One build is one year: time moves only when the player builds. Each new
 * year flips the face with a click, so the player always sees the year change
 * when they build, and never when they don't. "Skip this year" appears only
 * if nothing can be built anywhere on the board, which Panaji never reaches.
 */
/** Section 35.2: how long the Points box counts up, and how long "+N" stays beside it. */
export const COUNT_UP_MS = 900;
export const GAIN_MS = 4000;

/** The Points box's icon: a star, drawn as the other boxes' icons are (14 px, currentColor). */
const STAR = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5l-4.2 2.3 1-4.6L1.3 6l4.7-.5z" fill="currentColor"/></svg>`;

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

/** "Cyclone in 5 builds", "Cyclone in 1 build": the countdown chip's words (Section 16 B2; Section 33b.2, the chip). */
export function countdownText(until: { builds: number; storm: string }): string {
  return `${until.storm} in ${until.builds <= 1 ? "1 build" : `${until.builds} builds`}`;
}

export class ClockHud {
  readonly el: HTMLElement;
  private readonly yearEl: HTMLElement;
  private readonly turnEl: HTMLElement;
  /** Where the Climate Outlook's timeline mounts: line 2, full width. */
  readonly outlookSlot: HTMLElement;
  /** Where Biodiversity and Homes at risk mount: line 3, side by side. */
  readonly riskSlot: HTMLElement;
  /** Where the countdown chip mounts: line 1, beside the year. */
  readonly countdownSlot: HTMLElement;
  /** Where How to play (?) and ☰ mount: line 1, at its right end. */
  readonly chromeSlot: HTMLElement;
  /** Where the objective mounts (Section 33b.3): under the tiles, past a divider. */
  readonly objectiveSlot: HTMLElement;
  /** The countdown in words, for screen readers (the chip carries it on screen). */
  private readonly untilEl: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;
  /** Where the countdown goes on screen: the chip (the Outlook's). */
  onCountdown: ((text: string | null) => void) | null = null;
  private lastCountdown: string | null = null;
  /** Section 35.2: the Points box, line 1 between the year and ? and ☰ (Play Panjim only). */
  private readonly pointsEl: HTMLElement;
  private readonly pointsCount: HTMLElement;
  private readonly pointsGain: HTMLElement;
  private shownPoints = 0;
  private pointsFrame = 0;
  private gainTimer = 0;

  constructor(container: HTMLElement, actions: ClockHudActions) {
    this.el = document.createElement("div");
    this.el.className = "hud-card panjim-clock";
    this.el.innerHTML = `
      <div class="hud-line hud-line-1">
        <div class="clock-face">
          <span class="clock-year" aria-live="polite">2026</span><span class="clock-turn">Year 1 of 25</span>
        </div>
        <div class="clock-points" role="status" hidden><span class="outlook-tile-icon" aria-hidden="true">${STAR}</span><span class="clock-points-label">Points</span><span class="clock-points-gain" hidden></span> <b class="clock-points-count">0</b></div>
        <div class="clock-countdown"></div>
        <span class="hud-spacer"></span>
        <div class="clock-chrome"></div>
      </div>
      <div class="clock-outlook"></div>
      <div class="clock-risk"></div>
      <span class="clock-until visually-hidden" aria-live="polite"></span>
      <div class="clock-buttons">
        <button type="button" class="clock-ff clock-skip-year" hidden>Skip this year</button>
      </div>
      <div class="clock-objective" hidden></div>
    `;
    container.appendChild(this.el);
    this.yearEl = this.el.querySelector(".clock-year")!;
    this.turnEl = this.el.querySelector(".clock-turn")!;
    this.outlookSlot = this.el.querySelector(".clock-outlook")!;
    this.riskSlot = this.el.querySelector(".clock-risk")!;
    this.countdownSlot = this.el.querySelector(".clock-countdown")!;
    this.chromeSlot = this.el.querySelector(".clock-chrome")!;
    this.objectiveSlot = this.el.querySelector(".clock-objective")!;
    this.untilEl = this.el.querySelector(".clock-until")!;
    this.skipBtn = this.el.querySelector(".clock-skip-year")!;
    this.pointsEl = this.el.querySelector(".clock-points")!;
    this.pointsCount = this.el.querySelector(".clock-points-count")!;
    this.pointsGain = this.el.querySelector(".clock-points-gain")!;
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

  /**
   * Section 35.2: the run's points. With `gained` (a storm just resolved) the number counts up, the star sound plays
   * and "+N" stands beside it for 4 s; without, it is set at once (the start, a retry). Null hides the box.
   */
  setPoints(total: number | null, gained = 0, instant = false): void {
    this.pointsEl.hidden = total === null;
    if (total === null) return;
    cancelAnimationFrame(this.pointsFrame);
    window.clearTimeout(this.gainTimer);
    const from = this.shownPoints;
    this.shownPoints = total;
    this.pointsEl.setAttribute("aria-label", `Points ${total}`);
    const show = (n: number): void => {
      this.pointsCount.textContent = String(n);
    };
    if (gained <= 0 || instant || from === total) {
      show(total);
      this.showGain(gained > 0 ? gained : 0);
      if (gained > 0) playSound("star");
      return;
    }
    playSound("star");
    this.showGain(gained);
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      show(Math.round(from + (total - from) * (1 - (1 - t) ** 3)));
      if (t < 1) this.pointsFrame = requestAnimationFrame(step);
    };
    this.pointsFrame = requestAnimationFrame(step);
  }

  private showGain(gained: number): void {
    this.pointsGain.hidden = gained <= 0;
    this.pointsEl.classList.toggle("gaining", gained > 0);
    if (gained <= 0) return;
    this.pointsGain.textContent = `+${gained}`;
    this.gainTimer = window.setTimeout(() => {
      this.pointsGain.hidden = true;
      this.pointsEl.classList.remove("gaining");
    }, GAIN_MS);
  }

  /** The Points box, for its tests and screenshots. */
  get pointsBox(): HTMLElement {
    return this.pointsEl;
  }

  /** Whether the fallback may be pressed (false while a storm plays, or at the end). */
  setControlsEnabled(enabled: boolean): void {
    this.skipBtn.disabled = !enabled;
  }

  /**
   * The parts, for their tooltips. Section 34c.1: the face is laid out with `display: contents` (its year and turn
   * are the card grid's own cells), so it has no box to place a tooltip by: the year and the turn carry it.
   */
  get parts(): { face: HTMLElement[]; until: HTMLElement; skip: HTMLButtonElement } {
    return { face: [this.yearEl, this.turnEl], until: this.untilEl, skip: this.skipBtn };
  }

  dispose(): void {
    cancelAnimationFrame(this.pointsFrame);
    window.clearTimeout(this.gainTimer);
    this.el.remove();
  }
}
