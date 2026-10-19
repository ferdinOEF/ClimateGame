import { strengthIcons, type ChallengeKind, type ScheduledChallenge } from "@core/climate";

/**
 * The Climate Outlook: the run's years as a track in the top bar (Section 16
 * B2), with a marker for each of the three storms at the end of its year,
 * and the homes the next one would take now ("Homes at risk 9"; during a
 * storm, "Homes lost N"). The next storm's marker carries the countdown
 * ("Cyclone · 5 builds", then "Cyclone · next build", pulsing gently);
 * later storms are dim, and past ones show their stars.
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
  /** "Homes at risk N": the next storm's toll on the board as it stands, live (Section 13). */
  readonly riskEl: HTMLElement;

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
      <span class="outlook-line visually-hidden"></span>
      <span class="outlook-risk" data-tip="homesAtRisk"></span>
    `;
    parent.appendChild(this.el);
    this.trackEl = this.el.querySelector(".outlook-track")!;
    this.nowEl = this.el.querySelector(".outlook-now")!;
    this.fillEl = this.el.querySelector(".outlook-fill")!;
    this.markersEl = this.el.querySelector(".outlook-markers")!;
    this.lineEl = this.el.querySelector(".outlook-line")!;
    this.riskEl = this.el.querySelector(".outlook-risk")!;

  }

  /** The last view, so `setHold` can repaint the line. */
  private lastView: OutlookView | null = null;
  /** The countdown on the next storm's marker ("Cyclone · 5 builds"); null while a storm or its cards play. */
  private countdown: string | null = null;

  /** Sets the next storm's countdown (the clock's), and repaints. */
  setCountdown(text: string | null): void {
    if (this.countdown === text) return;
    this.countdown = text;
    if (this.lastView) this.render(this.lastView);
  }

  /** Moves the Homes at risk pill to `slot` (the top bar's right end). */
  mountRisk(slot: HTMLElement): void {
    slot.appendChild(this.riskEl);
  }
  /** True while a storm or its result cards are on screen: no countdown on the line (Section 12). */
  private hold = false;

  /** Holds the countdown while a storm or its result cards play: the line names the next storm without "N years". */
  setHold(hold: boolean): void {
    if (this.hold === hold) return;
    this.hold = hold;
    if (this.lastView) this.render(this.lastView);
  }

  render(view: OutlookView): void {
    this.lastView = view;
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
    const nextStorm = view.storms.find((st) => !st.past);
    for (const storm of view.storms) {
      const marker = document.createElement("div");
      const stars = view.results.get(storm.challenge.id);
      const icons = strengthIcons(storm.challenge.strength);
      // Past; the next storm inside its two-year warning (the one pin that pulses); or still to come.
      const phase = storm.past ? "past" : storm === nextStorm && storm.yearsUntil <= 2 ? "soon" : "coming";
      const countdown = storm === nextStorm ? this.countdown : null;
      marker.className = `outlook-marker phase-${phase} kind-${storm.challenge.kind}${storm === nextStorm ? " next" : storm.past ? "" : " later"}${countdown ? " counting" : ""}`;
      // A pin at the end of its year; the last one is held inside the track.
      const at = pct(storm.challenge.year + 1);
      marker.style.left = `${at}%`;
      marker.classList.toggle("at-end", at >= 99);
      // An image of the storm, named by its label (a bare div may not carry one).
      marker.setAttribute("role", "img");
      marker.setAttribute("aria-label", describe(storm));
      marker.innerHTML = `<span class="outlook-icon">${ICON[storm.challenge.kind]}</span>${
        countdown ? `<span class="outlook-countdown">${countdown}</span>` : storm.past ? "" : `<span class="outlook-strength">${"●".repeat(icons)}${"○".repeat(3 - icons)}</span>`
      }${stars !== undefined ? `<span class="outlook-stars">${"★".repeat(stars)}${"☆".repeat(Math.max(0, 3 - stars))}</span>` : ""}`;
      this.markersEl.appendChild(marker);
    }

    const next = view.storms.find((storm) => !storm.past);
    this.lineEl.innerHTML = next ? `<b>Next:</b> ${describe(next, this.hold)}` : `<b>Every storm is behind you.</b> Finish the city by ${view.endYear}.`;
    this.lineEl.classList.toggle("locked", next !== undefined && next.yearsUntil <= 2);
  }

  private ticksFor = "";

  /** Homes the next storm would take on the board as it stands; null hides it (no storm left). Ignored while a storm's count shows. */
  renderRisk(homes: number | null): void {
    if (this.lost !== null) return;
    this.riskEl.hidden = homes === null;
    this.riskEl.classList.remove("lost");
    if (homes === null) return;
    this.riskEl.classList.toggle("none", homes === 0);
    this.riskEl.innerHTML = `<span class="outlook-risk-label">Homes at risk</span> <b class="outlook-risk-count">${homes}</b>`;
  }

  /** During a storm and its result cards: "Homes lost N", live (Section 16 B4); null goes back to Homes at risk. */
  private lost: number | null = null;
  renderLost(homes: number | null): void {
    this.lost = homes;
    if (homes === null) return;
    this.riskEl.hidden = false;
    this.riskEl.classList.remove("none");
    this.riskEl.classList.add("lost");
    this.riskEl.innerHTML = `<span class="outlook-risk-label">Homes lost</span> <b class="outlook-risk-count">${homes}</b>`;
  }

  /** The parts that carry tooltips. */
  get parts(): { track: HTMLElement; line: HTMLElement; risk: HTMLElement } {
    return { track: this.trackEl, line: this.lineEl, risk: this.riskEl };
  }

  /** Pulses the track, when a storm's warning begins. */
  pulse(): void {
    this.trackEl.classList.remove("pulse");
    void this.trackEl.offsetWidth;
    this.trackEl.classList.add("pulse");
  }
}

/** "Cyclone in 2030, mild", or "Cyclone has passed". The countdown is the clock's alone (Section 13); `hold` is kept for callers and changes nothing now. */
export function describe(storm: OutlookStorm, hold = false): string {
  void hold;
  const name = storm.challenge.name;
  if (storm.past) return `${name} has passed`;
  return `${name} in ${storm.challenge.year}, ${["", "mild", "strong", "severe"][strengthIcons(storm.challenge.strength)]}`;
}
