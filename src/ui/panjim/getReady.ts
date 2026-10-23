import type { PrepObjective } from "@core/prep";

/**
 * "Get ready": the compact panel bottom-right. Two or three optional jobs for
 * the next storm, each with its progress (and, with coins on, its reward); a
 * finished one ticks and stays checked until the storm passes. Collapsible to its title bar, so it never competes
 * with the map. Purely a bonus: nothing here ever blocks play.
 */
export interface GetReadyRow {
  job: PrepObjective;
  current: number;
  target: number;
  /** Ticked: the same count reached its target (core/prep.ts `prepProgress`). */
  done: boolean;
}

export class GetReadyPanel {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly rows = new Map<string, HTMLElement>();
  /** Each row's job now, for the hover (Section 12). */
  private readonly jobs = new Map<string, PrepObjective>();
  private hover: ((job: PrepObjective | null) => void) | null = null;
  private click: ((job: PrepObjective) => void) | null = null;
  /** Section 30.9: "Get ahead", the storm after this one, once this objective is done. */
  private readonly aheadEl: HTMLElement;
  private readonly aheadTitle: HTMLElement;
  private readonly aheadList: HTMLElement;
  private readonly aheadRows = new Map<string, HTMLElement>();

  /** Section 30.9: a row clicked (or Enter on it): the board pans to its tile. */
  onRowClick(fn: (job: PrepObjective) => void): void {
    this.click = fn;
  }

  /** Called with a row's job while the pointer (or focus) is on it, and null when it leaves: the tiles that count light up. */
  onRowHover(fn: (job: PrepObjective | null) => void): void {
    this.hover = fn;
  }
  private collapsed = false;

  /**
   * @param showRewards With coins off (Section 5) no reward is shown or popped.
   */
  // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
  constructor(private readonly showRewards = true) {
    this.el = document.createElement("section");
    this.el.className = "get-ready";
    this.el.setAttribute("aria-label", "Objective");
    this.el.innerHTML = `
      <div class="get-ready-head">
        <span class="get-ready-title">Get ready</span>
        <button type="button" class="get-ready-toggle" aria-expanded="true" aria-label="Collapse the objective">–</button>
      </div>
      <ul class="get-ready-list"></ul>
      <div class="get-ready-ahead" hidden>
        <div class="get-ready-ahead-title"></div>
        <ul class="get-ready-list get-ready-ahead-list"></ul>
      </div>`;
    this.aheadEl = this.el.querySelector(".get-ready-ahead")!;
    this.aheadTitle = this.el.querySelector(".get-ready-ahead-title")!;
    this.aheadList = this.el.querySelector(".get-ready-ahead-list")!;
    this.list = this.el.querySelector(".get-ready-list")!;
    this.titleEl = this.el.querySelector(".get-ready-title")!;
    this.toggle = this.el.querySelector(".get-ready-toggle")!;
    this.toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      this.setCollapsed(!this.collapsed);
    });
  }

  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.el.classList.toggle("collapsed", collapsed);
    this.toggle.textContent = collapsed ? "+" : "–";
    this.toggle.setAttribute("aria-expanded", String(!collapsed));
    this.toggle.setAttribute("aria-label", collapsed ? "Expand the objective" : "Collapse the objective");
  }

  /** Repaints the jobs. `storm` names the storm they are for ("Cyclone"); an opening objective's jobs carry its title instead. */
  render(storm: string | null, rows: GetReadyRow[], ahead: { storm: string; rows: GetReadyRow[] } | null = null): void {
    const heading = rows.find((row) => row.job.heading)?.job.heading;
    this.titleEl.textContent = heading ?? (storm ? `Get ready for the ${storm.toLowerCase()}` : "Get ready");
    const live = new Set(rows.map((row) => row.job.id));
    for (const [id, el] of this.rows) {
      if (live.has(id)) continue;
      el.remove();
      this.rows.delete(id);
    }
    for (const row of rows) this.paintRow(row, this.rows, this.list);
    this.el.hidden = rows.length === 0;
    // Every row done: the card shrinks to one line (Section 16 B3).
    const complete = rows.length > 0 && rows.every((row) => row.done);
    this.el.classList.toggle("complete", complete);
    if (complete) this.titleEl.textContent = "✓ Objective done";
    // Section 30.9: then the storm after it, to get ahead on.
    const showAhead = complete && ahead !== null && ahead.rows.length > 0;
    this.aheadEl.hidden = !showAhead;
    this.el.classList.toggle("with-ahead", showAhead);
    const aheadLive = new Set(showAhead ? ahead!.rows.map((row) => row.job.id) : []);
    for (const [id, el] of this.aheadRows) {
      if (aheadLive.has(id)) continue;
      el.remove();
      this.aheadRows.delete(id);
    }
    if (showAhead) {
      this.aheadTitle.textContent = `Get ahead: the ${ahead!.storm.toLowerCase()}`;
      for (const row of ahead!.rows) this.paintRow(row, this.aheadRows, this.aheadList);
    }
  }

  private paintRow(row: GetReadyRow, rows: Map<string, HTMLElement>, list: HTMLElement): void {
    let el = rows.get(row.job.id);
    if (!el) {
      el = document.createElement("li");
      el.className = "get-ready-row";
      el.tabIndex = 0;
      const id = row.job.id;
      const enter = (): void => this.hover?.(this.jobs.get(id) ?? null);
      const leave = (): void => this.hover?.(null);
      el.addEventListener("mouseenter", enter);
      el.addEventListener("mouseleave", leave);
      el.addEventListener("focus", enter);
      el.addEventListener("blur", leave);
      const go = (): void => {
        const job = this.jobs.get(id);
        if (job) this.click?.(job);
      };
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        go();
      });
      el.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        go();
      });
      el.innerHTML = `<span class="get-ready-check" aria-hidden="true"></span><span class="get-ready-label"></span><span class="get-ready-progress"></span>${this.showRewards ? `<span class="get-ready-reward"></span>` : ""}`;
      (el.querySelector(".get-ready-label") as HTMLElement).textContent = row.job.label;
      const reward = el.querySelector<HTMLElement>(".get-ready-reward");
      if (reward) reward.textContent = `+${row.job.reward}`;
      list.appendChild(el);
      rows.set(row.job.id, el);
    }
    this.jobs.set(row.job.id, row.job);
    el.classList.toggle("done", row.done);
    (el.querySelector(".get-ready-progress") as HTMLElement).textContent = `${Math.min(row.current, row.target)}/${row.target}`;
  }

  /** A finished job: a tick on its row, and a coin pop with coins on. */
  celebrate(job: PrepObjective): void {
    const el = this.rows.get(job.id);
    if (!el) return;
    el.classList.add("done", "just-done");
    // Its count reads full too: the build that finished the last row also brings the storm, and no later repaint comes.
    const progress = el.querySelector<HTMLElement>(".get-ready-progress");
    if (progress) progress.textContent = `${job.count}/${job.count}`;
    if (!this.showRewards) {
      window.setTimeout(() => el.classList.remove("just-done"), 1400);
      return;
    }
    const pop = document.createElement("span");
    pop.className = "get-ready-pop";
    pop.textContent = `+${job.reward}`;
    el.appendChild(pop);
    window.setTimeout(() => {
      pop.remove();
      el.classList.remove("just-done");
    }, 1400);
  }
}
