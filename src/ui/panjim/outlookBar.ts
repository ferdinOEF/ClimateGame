import type { ChallengeKind, ChallengeOutlook } from "@core/climate";

/**
 * The Climate Outlook: a 2025–2050 timeline under the clock with a marker for
 * each of the three challenges, and one line about the next one.
 *
 * Far out a marker is a soft, wide band ("cyclone season, 2030–2034"). It
 * narrows as the date approaches, and two years out it locks into a pin with
 * the exact quarter and a 1–3 strength rating. Never a modal: the player
 * reads it at a glance and keeps building.
 */
export interface OutlookView {
  startYear: number;
  endYear: number;
  /** Current time, in fractional years. */
  now: number;
  outlooks: ChallengeOutlook[];
  seaLevelCm: number;
  /** Stars earned by challenges that have landed, by id. */
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

    const ticks = this.el.querySelector(".outlook-ticks")!;
    for (const year of [2030, 2035, 2040, 2045]) {
      const tick = document.createElement("span");
      tick.className = "outlook-tick";
      tick.style.left = `${((year - 2025) / 25) * 100}%`;
      tick.textContent = String(year);
      ticks.appendChild(tick);
    }
  }

  render(view: OutlookView): void {
    const span = view.endYear - view.startYear;
    const pct = (year: number): number => Math.max(0, Math.min(100, ((year - view.startYear) / span) * 100));
    this.fillEl.style.width = `${pct(view.now)}%`;
    this.nowEl.style.left = `${pct(view.now)}%`;

    this.markersEl.innerHTML = "";
    for (const outlook of view.outlooks) {
      const marker = document.createElement("div");
      const stars = view.results.get(outlook.challenge.id);
      marker.className = `outlook-marker phase-${outlook.phase} kind-${outlook.challenge.kind}`;
      marker.style.left = `${pct(outlook.windowStart)}%`;
      marker.style.width = `${Math.max(1.2, pct(outlook.windowEnd) - pct(outlook.windowStart))}%`;
      // An image of the storm window, named by its label (a bare div may not carry one).
      marker.setAttribute("role", "img");
      marker.setAttribute("aria-label", describe(outlook, view.startYear));
      marker.innerHTML = `<span class="outlook-icon">${ICON[outlook.challenge.kind]}</span>${
        outlook.phase === "locked" ? `<span class="outlook-strength">${"●".repeat(outlook.icons ?? 1)}${"○".repeat(3 - (outlook.icons ?? 1))}</span>` : ""
      }${stars !== undefined ? `<span class="outlook-stars">${"★".repeat(stars)}</span>` : ""}`;
      this.markersEl.appendChild(marker);
    }

    const next = view.outlooks.find((outlook) => outlook.phase !== "past");
    this.lineEl.innerHTML = next ? `<b>Next:</b> ${describe(next, view.startYear)}` : "<b>All three storms are behind you.</b> Finish the city by 2050.";
    this.nextText = next ? describe(next, view.startYear) : "All three storms are behind you. Finish the city by 2050.";
    this.lineEl.classList.toggle("locked", next?.phase === "locked");
    this.seaEl.textContent = `Sea +${view.seaLevelCm} cm`;
  }

  /**
   * The readiness gauge for the next challenge: predicted stars if it landed
   * on the board as it stands (defences counted at the maturity they will
   * have reached by then). Red, amber or green, with the stars as shapes so
   * it reads in grayscale too.
   */
  renderGauge(gauge: { level: "red" | "amber" | "green"; stars: number; protection: number; exact: boolean; growing: number } | null): void {
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

  /** Pulses the next marker, when its Forecast locks. */
  pulse(): void {
    this.trackEl.classList.remove("pulse");
    void this.trackEl.offsetWidth;
    this.trackEl.classList.add("pulse");
  }
}

function describe(outlook: ChallengeOutlook, startYear: number): string {
  const name = outlook.challenge.name;
  switch (outlook.phase) {
    case "far":
    case "near": {
      const from = Math.floor(outlook.windowStart);
      const to = Math.floor(outlook.windowEnd - 0.01);
      const what = outlook.challenge.kind === "cyclone" ? "Cyclone season" : name;
      return from === to ? `${what}, ${from}` : `${what}, ${from}–${to}`;
    }
    case "locked": {
      const q = outlook.exactQuarter ?? 0;
      const label = `Q${(q % 4) + 1} ${startYear + Math.floor(q / 4)}`;
      const words = ["", "mild", "strong", "severe"][outlook.icons ?? 1];
      return `Forecast locked · ${name} · ${label} · ${words} · in ${outlook.quartersUntil} qtr`;
    }
    case "past":
      return `${name} has passed`;
  }
}
