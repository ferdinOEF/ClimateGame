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
    this.el.setAttribute("aria-label", "Get ready");
    this.el.innerHTML = `
      <div class="get-ready-head">
        <span class="get-ready-title">Get ready</span>
        <button type="button" class="get-ready-toggle" aria-expanded="true" aria-label="Collapse Get ready">–</button>
      </div>
      <ul class="get-ready-list"></ul>`;
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
    this.toggle.setAttribute("aria-label", collapsed ? "Expand Get ready" : "Collapse Get ready");
  }

  /** Repaints the jobs. `storm` names the storm they are for ("Cyclone"); an opening objective's jobs carry its title instead. */
  render(storm: string | null, rows: GetReadyRow[]): void {
    const heading = rows.find((row) => row.job.heading)?.job.heading;
    this.titleEl.textContent = heading ?? (storm ? `Get ready · ${storm}` : "Get ready");
    const live = new Set(rows.map((row) => row.job.id));
    for (const [id, el] of this.rows) {
      if (live.has(id)) continue;
      el.remove();
      this.rows.delete(id);
    }
    for (const row of rows) {
      let el = this.rows.get(row.job.id);
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
        el.innerHTML = `<span class="get-ready-check" aria-hidden="true"></span><span class="get-ready-label"></span><span class="get-ready-progress"></span>${this.showRewards ? `<span class="get-ready-reward"></span>` : ""}`;
        (el.querySelector(".get-ready-label") as HTMLElement).textContent = row.job.label;
        const reward = el.querySelector<HTMLElement>(".get-ready-reward");
        if (reward) reward.textContent = `+${row.job.reward}`;
        this.list.appendChild(el);
        this.rows.set(row.job.id, el);
      }
      this.jobs.set(row.job.id, row.job);
      el.classList.toggle("done", row.done);
      (el.querySelector(".get-ready-progress") as HTMLElement).textContent = `${Math.min(row.current, row.target)}/${row.target}`;
    }
    this.el.hidden = rows.length === 0;
  }

  /** A finished job: a tick on its row, and a coin pop with coins on. */
  celebrate(job: PrepObjective): void {
    const el = this.rows.get(job.id);
    if (!el) return;
    el.classList.add("done", "just-done");
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
