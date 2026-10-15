import { strengthIcons, type ChallengeKind, type ScheduledChallenge } from "@core/climate";

/**
 * The Climate Outlook: the run's years as a timeline under the clock, with a
 * marker for each of the three storms at the end of its year, and one line
 * about the next one: "Next: Cyclone · end of 2030 · 5 years".
 *
 * The calendar is fixed (Section 5), so every marker is a pin from the start,
 * with its 1–3 strength rating. Never a modal: the player reads it at a
 * glance and keeps building.
 */
export interface OutlookStorm {
  challenge: ScheduledChallenge;
  /** Years until it comes, counting this one (1 in its own year). */
  yearsUntil: number;
  past: boolean;
}

export interface OutlookView {
  startYear: number;
  /** The last year of the run (inclusive). */
  endYear: number;
  /** The current year. */
  year: number;
  storms: OutlookStorm[];
  seaLevelCm: number;
  /** Stars earned by storms that have resolved, by id. */
  results: Map<string, number>;
}

const ICON: Record<ChallengeKind, string> = {
  // A spiral, a drop, and the two together. Shapes, not colours, so they
  // still read in grayscale.
  cyclone: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3a5 5 0 1 0 5 5M8 6a2 2 0 1 0 2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  flood: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2C6 6 4 8 4 10.5a4 4 0 0 0 8 0C12 8 10 6 8 2z" fill="currentColor"/></svg>`,
  compound: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3a4 4 0 1 0 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 7c-1.2 2.2-2 3.2-2 4.4a2 2 0 0 0 4 0c0-1.2-.8-2.2-2-4.4z" fill="currentColor"/></svg>`
};

export function challengeIcon(kind: ChallengeKind): string {
  return ICON[kind];
}

export class OutlookBar {
  readonly el: HTMLElement;
  private readonly trackEl: HTMLElement;
  private readonly nowEl: HTMLElement;
  private readonly fillEl: HTMLElement;
  private readonly markersEl: HTMLElement;
  private readonly lineEl: HTMLElement;
  private readonly seaEl: HTMLElement;
  /** Slot to the right of the line, for the readiness gauge (P3). */
  readonly gaugeSlot: HTMLElement;
  /** The next storm in words, for the line's tooltip (the line itself is cut short on a narrow screen). */
  nextText = "";

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "outlook";
    this.el.innerHTML = `
      <div class="outlook-track">
        <div class="outlook-fill"></div>
        <div class="outlook-ticks"></div>
        <div class="outlook-markers"></div>
        <div class="outlook-now"></div>
      </div>
      <div class="outlook-info">
        <span class="outlook-line"></span>
        <span class="outlook-gauge"></span>
        <span class="outlook-sea"></span>
      </div>
    `;
    parent.appendChild(this.el);
    this.trackEl = this.el.querySelector(".outlook-track")!;
    this.nowEl = this.el.querySelector(".outlook-now")!;
    this.fillEl = this.el.querySelector(".outlook-fill")!;
    this.markersEl = this.el.querySelector(".outlook-markers")!;
    this.lineEl = this.el.querySelector(".outlook-line")!;
    this.seaEl = this.el.querySelector(".outlook-sea")!;
    this.gaugeSlot = this.el.querySelector(".outlook-gauge")!;

  }

  render(view: OutlookView): void {
    // The track runs from the first day of the start year to the last day of the end year.
    const span = view.endYear + 1 - view.startYear;
    const pct = (year: number): number => Math.max(0, Math.min(100, ((year - view.startYear) / span) * 100));
    if (this.ticksFor !== `${view.startYear}-${view.endYear}`) {
      this.ticksFor = `${view.startYear}-${view.endYear}`;
      const ticks = this.el.querySelector(".outlook-ticks")!;
      ticks.innerHTML = "";
      for (let year = Math.ceil(view.startYear / 5) * 5; year <= view.endYear; year += 5) {
        const tick = document.createElement("span");
        tick.className = "outlook-tick";
        tick.style.left = `${pct(year)}%`;
        tick.textContent = String(year);
        ticks.appendChild(tick);
      }
    }
    this.fillEl.style.width = `${pct(view.year)}%`;
    this.nowEl.style.left = `${pct(view.year)}%`;

    this.markersEl.innerHTML = "";
    for (const storm of view.storms) {
      const marker = document.createElement("div");
      const stars = view.results.get(storm.challenge.id);
      const icons = strengthIcons(storm.challenge.strength);
      // Past; the next storm inside its two-year warning (the one pin that pulses); or still to come.
      const phase = storm.past ? "past" : storm === view.storms.find((st) => !st.past) && storm.yearsUntil <= 2 ? "soon" : "coming";
      marker.className = `outlook-marker phase-${phase} kind-${storm.challenge.kind}`;
      // A pin at the end of its year; the last one is held inside the track.
      const at = pct(storm.challenge.year + 1);
      marker.style.left = `${at}%`;
      marker.classList.toggle("at-end", at >= 99);
      // An image of the storm, named by its label (a bare div may not carry one).
      marker.setAttribute("role", "img");
      marker.setAttribute("aria-label", describe(storm));
      marker.innerHTML = `<span class="outlook-icon">${ICON[storm.challenge.kind]}</span>${
        storm.past ? "" : `<span class="outlook-strength">${"●".repeat(icons)}${"○".repeat(3 - icons)}</span>`
      }${stars !== undefined ? `<span class="outlook-stars">${"★".repeat(stars)}</span>` : ""}`;
      this.markersEl.appendChild(marker);
    }

    const next = view.storms.find((storm) => !storm.past);
    const done = `Every storm is behind you. Finish the city by ${view.endYear}.`;
    this.lineEl.innerHTML = next ? `<b>Next:</b> ${describe(next)}` : `<b>Every storm is behind you.</b> Finish the city by ${view.endYear}.`;
    this.nextText = next ? describe(next) : done;
    this.lineEl.classList.toggle("locked", next !== undefined && next.yearsUntil <= 2);
    this.seaEl.textContent = `Sea +${view.seaLevelCm} cm`;
  }

  private ticksFor = "";

  /**
   * The readiness gauge for the next storm: predicted stars if it came on the
   * board as it stands. Red, amber or green, with the stars as shapes so it
   * reads in grayscale too. `growing` counts defences still growing (growth
   * on only; 0 hides it).
   */
  renderGauge(gauge: { level: "red" | "amber" | "green"; stars: number; protection: number; growing: number } | null): void {
    if (!gauge) {
      this.gaugeSlot.hidden = true;
      return;
    }
    this.gaugeSlot.hidden = false;
    this.gaugeSlot.className = `outlook-gauge gauge-${gauge.level}`;
    const pct = Math.round(gauge.protection * 100);
    this.gaugeSlot.innerHTML = `<span class="gauge-label">Ready</span><span class="gauge-bar"><span style="width:${pct}%"></span></span><span class="gauge-stars">${"★".repeat(gauge.stars)}${"☆".repeat(3 - gauge.stars)}</span>${
      gauge.growing > 0 ? `<span class="gauge-growing">${gauge.growing} growing</span>` : ""
    }`;
  }

  /** The parts that carry tooltips. */
  get parts(): { track: HTMLElement; line: HTMLElement; sea: HTMLElement } {
    return { track: this.trackEl, line: this.lineEl, sea: this.seaEl };
  }

  /** Pulses the track, when a storm's warning begins. */
  pulse(): void {
    this.trackEl.classList.remove("pulse");
    void this.trackEl.offsetWidth;
    this.trackEl.classList.add("pulse");
  }
}

/** "Cyclone · end of 2030 · 5 years", "… · this year", or "Cyclone has passed". */
export function describe(storm: OutlookStorm): string {
  const name = storm.challenge.name;
  if (storm.past) return `${name} has passed`;
  const when = storm.yearsUntil <= 1 ? "this year" : `${storm.yearsUntil} years`;
  const words = ["", "mild", "strong", "severe"][strengthIcons(storm.challenge.strength)];
  return `${name} · end of ${storm.challenge.year} · ${words} · ${when}`;
}
