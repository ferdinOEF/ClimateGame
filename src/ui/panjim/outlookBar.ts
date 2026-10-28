import { strengthIcons, type ChallengeKind, type ScheduledChallenge } from "@core/climate";

/**
 * The Climate Outlook, in the HUD card (Section 33b.2): the run's years as a
 * timeline with a dot for each of the three storms (its name, strength and,
 * once past, its stars in the dot's tooltip), the countdown as a chip beside
 * the year ("Cyclone in 5 builds"), and two tiles: Biodiversity and the homes
 * the next storm would take now ("Homes at risk 9"; during a storm, "Homes
 * lost N").
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
  /** Section 30.4: biodiversity since the run began, with the next storm's three star target marked. */
  readonly bioEl: HTMLElement;
  /** Section 33b.2: the countdown chip ("Cyclone in 5 builds", with the storm's icon), beside the year. */
  readonly countdownEl: HTMLElement;
  /** Called for each storm dot as it is drawn, with the words for its tooltip (the session attaches it). */
  onMarker: ((el: HTMLElement, text: string) => void) | null = null;

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
      <span class="outlook-bio" data-tip="biodiversityCounter" hidden></span>
    `;
    parent.appendChild(this.el);
    this.trackEl = this.el.querySelector(".outlook-track")!;
    this.nowEl = this.el.querySelector(".outlook-now")!;
    this.fillEl = this.el.querySelector(".outlook-fill")!;
    this.markersEl = this.el.querySelector(".outlook-markers")!;
    this.lineEl = this.el.querySelector(".outlook-line")!;
    this.riskEl = this.el.querySelector(".outlook-risk")!;
    this.bioEl = this.el.querySelector(".outlook-bio")!;
    this.countdownEl = document.createElement("span");
    this.countdownEl.className = "outlook-countdown-chip";
    this.countdownEl.hidden = true;

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

  /** Moves the countdown chip to `slot` (the HUD card's first line). */
  mountCountdown(slot: HTMLElement): void {
    slot.appendChild(this.countdownEl);
  }

  /** Moves the two tiles to `slot` (the HUD card's third line). */
  mountRisk(slot: HTMLElement): void {
    // Section 30.4: biodiversity stands just before Homes at risk.
    slot.appendChild(this.bioEl);
    slot.appendChild(this.riskEl);
  }

  /**
   * Section 30.4: "Biodiversity +12" since the run began, with a small bar: its fill is the change, a mark is the
   * next storm's three star target (+6, or +40 for 2050). Null hides it (a level whose stars do not count nature).
   */
  renderBiodiversity(view: { change: number; target: number | null } | null): void {
    this.bioEl.hidden = view === null;
    if (!view) return;
    const { change, target } = view;
    const top = Math.max(10, (target ?? 0) * 1.25, change + 2);
    const pct = (v: number): number => Math.max(0, Math.min(100, (v / top) * 100));
    const sign = change > 0 ? "+" : change < 0 ? "\u2212" : "";
    const reached = target !== null && change >= target;
    this.bioEl.classList.toggle("reached", reached);
    this.bioEl.classList.toggle("below", change < 0);
    this.bioEl.innerHTML = `<span class="outlook-tile-icon" aria-hidden="true">${LEAF}</span><span class="outlook-bio-label">Biodiversity</span> <b class="outlook-bio-count">${sign}${Math.abs(change)}</b><span class="outlook-bio-bar" aria-hidden="true"><span class="outlook-bio-fill" style="width:${pct(change)}%"></span>${target !== null ? `<span class="outlook-bio-target" style="left:${pct(target)}%"></span>` : ""}</span>`;
    this.bioEl.setAttribute("role", "img");
    this.bioEl.setAttribute("aria-label", `Biodiversity ${sign}${Math.abs(change)} since the start${target !== null ? `; three stars need ${target > 0 ? "+" : ""}${target}` : ""}`);
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
    // Section 33b.2: each year is a slot on the timeline; a storm's dot, a five year mark and "now" sit in its middle.
    const span = view.endYear + 1 - view.startYear;
    const pct = (year: number): number => Math.max(0, Math.min(100, ((year + 0.5 - view.startYear) / span) * 100));
    const stormYears = new Set(view.storms.map((st) => st.challenge.year));
    const ticksKey = `${view.startYear}-${view.endYear}-${[...stormYears].join(",")}`;
    if (this.ticksFor !== ticksKey) {
      this.ticksFor = ticksKey;
      const ticks = this.el.querySelector(".outlook-ticks")!;
      ticks.innerHTML = "";
      // Section 34b.7: a short run (the Tutorial's seven years) ticks its own storm years, not 2030.
      const years = span <= 10 ? [...stormYears].sort((a, b) => a - b) : Array.from({ length: Math.floor((view.endYear - Math.ceil(view.startYear / 5) * 5) / 5) + 1 }, (_, i) => Math.ceil(view.startYear / 5) * 5 + i * 5);
      for (const year of years) {
        const tick = document.createElement("span");
        tick.className = `outlook-tick${stormYears.has(year) ? " storm-year" : ""}`;
        tick.style.left = `${pct(year)}%`;
        tick.textContent = String(year);
        ticks.appendChild(tick);
      }
    }
    this.fillEl.style.width = `${pct(view.year)}%`;
    this.nowEl.style.left = `${pct(view.year)}%`;

    const nextStorm = view.storms.find((st) => !st.past);
    this.renderMarkers(view, nextStorm, pct);
    this.renderCountdown(nextStorm ?? null);

    const next = view.storms.find((storm) => !storm.past);
    // Section 34b.7: with every storm past there are no builds left (the last storm ends the run): nothing to say.
    this.lineEl.innerHTML = next ? `<b>Next:</b> ${describe(next, this.hold)}` : view.year < view.endYear ? `<b>Every storm is behind you.</b> Finish the city by ${view.endYear}.` : "";
    this.lineEl.classList.toggle("locked", next !== undefined && next.yearsUntil <= 2);
  }

  private markersFor = "";

  /**
   * The storm dots, rebuilt only when what they show changes (a dot that is rebuilt under the pointer or the keyboard
   * focus would drop it and strand its tooltip).
   */
  private renderMarkers(view: OutlookView, nextStorm: OutlookStorm | undefined, pct: (year: number) => number): void {
    const key = view.storms.map((storm) => `${storm.challenge.id}:${storm.past}:${storm.yearsUntil <= 2}:${storm === nextStorm}:${markerText(storm, view.results.get(storm.challenge.id))}:${pct(storm.challenge.year).toFixed(3)}`).join("|");
    if (key === this.markersFor) return;
    this.markersFor = key;
    this.markersEl.innerHTML = "";
    for (const storm of view.storms) {
      const marker = document.createElement("div");
      const stars = view.results.get(storm.challenge.id);
      // Past; the next storm inside its two-year warning (the one dot that pulses); or still to come.
      const phase = storm.past ? "past" : storm === nextStorm && storm.yearsUntil <= 2 ? "soon" : "coming";
      marker.className = `outlook-marker phase-${phase} kind-${storm.challenge.kind}${storm === nextStorm ? " next" : storm.past ? "" : " later"}`;
      marker.style.left = `${pct(storm.challenge.year)}%`;
      // An image of the storm, named by its label (a bare div may not carry one); its tooltip says the same, and
      // its stars once it has passed: everything the track's marker showed before.
      const text = markerText(storm, stars);
      marker.setAttribute("role", "img");
      marker.setAttribute("aria-label", text);
      marker.tabIndex = 0;
      this.markersEl.appendChild(marker);
      this.onMarker?.(marker, text);
    }
  }

  /** The chip beside the year: the next storm's icon and the clock's countdown; hidden while a storm or its cards play. */
  private renderCountdown(next: OutlookStorm | null): void {
    const show = Boolean(this.countdown && next);
    this.countdownEl.hidden = !show;
    if (!show || !next) return;
    this.countdownEl.className = `outlook-countdown-chip kind-${next.challenge.kind}${next.yearsUntil <= 2 ? " soon" : ""}`;
    this.countdownEl.innerHTML = `<span class="outlook-icon">${ICON[next.challenge.kind]}</span><span class="outlook-countdown">${this.countdown}</span>`;
  }

  private ticksFor = "";

  /** Homes the next storm would take on the board as it stands; null hides it (no storm left). Ignored while a storm's count shows. */
  renderRisk(homes: number | null): void {
    if (this.lost !== null) return;
    this.riskEl.hidden = homes === null;
    this.riskEl.classList.remove("lost");
    if (homes === null) return;
    this.riskEl.classList.toggle("none", homes === 0);
    this.riskEl.innerHTML = `<span class="outlook-tile-icon" aria-hidden="true">${HOUSE}</span><span class="outlook-risk-label">Homes at risk</span> <b class="outlook-risk-count">${homes}</b>`;
  }

  /** During a storm and its result cards: "Homes lost N", live (Section 16 B4); null goes back to Homes at risk. */
  private lost: number | null = null;
  renderLost(homes: number | null): void {
    this.lost = homes;
    if (homes === null) return;
    this.riskEl.hidden = false;
    this.riskEl.classList.remove("none");
    this.riskEl.classList.add("lost");
    this.riskEl.innerHTML = `<span class="outlook-tile-icon" aria-hidden="true">${HOUSE}</span><span class="outlook-risk-label">Homes lost</span> <b class="outlook-risk-count">${homes}</b>`;
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

/** A storm dot's words: "Cyclone in 2030, mild", or "Cyclone has passed, 2 of 3 stars". */
export function markerText(storm: OutlookStorm, stars?: number): string {
  const base = describe(storm);
  return storm.past && stars !== undefined ? `${base}, ${stars} of 3 stars` : base;
}

/** The tiles' icons: a leaf (Biodiversity) and a house (Homes at risk). Shapes, so they read in grey too. */
const LEAF = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 2.5C7 2.5 3 5.5 3 10c0 1.2.4 2.3 1 3.2C6 9 8.5 7 11 6c-2.6 1.6-4.6 4-5.6 7.3.8.4 1.7.7 2.6.7 4.5 0 6-5 5.5-11.5z" fill="currentColor"/></svg>`;
const HOUSE = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 2 7.2V14h4.2v-3.6h3.6V14H14V7.2z" fill="currentColor"/></svg>`;

/** "Cyclone in 2030, mild", or "Cyclone has passed". The countdown is the clock's alone (Section 13); `hold` is kept for callers and changes nothing now. */
export function describe(storm: OutlookStorm, hold = false): string {
  void hold;
  const name = storm.challenge.name;
  if (storm.past) return `${name} has passed`;
  return `${name} in ${storm.challenge.year}, ${["", "mild", "strong", "severe"][strengthIcons(storm.challenge.strength)]}`;
}
