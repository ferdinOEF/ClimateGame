import type { PrepObjective } from "@core/prep";

/**
 * "Get ready": the compact panel bottom-right that replaced Voices of
 * Panjim. Two or three optional jobs for the next storm, each with its
 * progress and reward; a finished one ticks, pops its Coin and stays checked
 * until the storm passes. Collapsible to its title bar, so it never competes
 * with the map. Purely a bonus: nothing here ever blocks play.
 */
export interface GetReadyRow {
  job: PrepObjective;
  current: number;
  target: number;
}

export class GetReadyPanel {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly rows = new Map<string, HTMLElement>();
  private collapsed = false;

  constructor() {
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

  /** Repaints the jobs. `storm` names the storm they are for ("Cyclone"). */
  render(storm: string | null, rows: GetReadyRow[]): void {
    this.titleEl.textContent = storm ? `Get ready · ${storm}` : "Get ready";
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
        el.innerHTML = `<span class="get-ready-check" aria-hidden="true"></span><span class="get-ready-label"></span><span class="get-ready-progress"></span><span class="get-ready-reward"></span>`;
        (el.querySelector(".get-ready-label") as HTMLElement).textContent = row.job.label;
        (el.querySelector(".get-ready-reward") as HTMLElement).textContent = `+${row.job.reward}`;
        this.list.appendChild(el);
        this.rows.set(row.job.id, el);
      }
      el.classList.toggle("done", row.job.done);
      (el.querySelector(".get-ready-progress") as HTMLElement).textContent = `${Math.min(row.current, row.target)}/${row.target}`;
    }
    this.el.hidden = rows.length === 0;
  }

  /** A finished job: a coin pop on its row. */
  celebrate(job: PrepObjective): void {
    const el = this.rows.get(job.id);
    if (!el) return;
    el.classList.add("done", "just-done");
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
