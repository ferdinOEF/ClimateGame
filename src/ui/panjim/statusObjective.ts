import type { GetReadyRow } from "./getReady";

/**
 * The first storm's objective in the Status panel (Section 6.3): its title
 * and its steps, each with a tick and its progress. The same jobs as the Get
 * ready list (core/prep.ts), so the two never disagree. Hidden when there is
 * no opening objective (after the first storm).
 */
export class StatusObjective {
  readonly el: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    this.el = document.createElement("section");
    this.el.className = "status-objective";
    this.el.setAttribute("aria-label", "Objective");
    this.el.innerHTML = `<div class="status-objective-eyebrow">Objective</div><div class="status-objective-title"></div><ul class="status-objective-steps"></ul>`;
    this.titleEl = this.el.querySelector(".status-objective-title")!;
    this.list = this.el.querySelector(".status-objective-steps")!;
    this.el.hidden = true;
  }

  render(rows: GetReadyRow[]): void {
    const heading = rows.find((row) => row.job.heading)?.job.heading;
    this.el.hidden = !heading;
    if (!heading) return;
    this.titleEl.textContent = heading;
    this.list.innerHTML = "";
    for (const row of rows) {
      const li = document.createElement("li");
      li.className = "status-objective-step";
      li.classList.toggle("done", row.job.done);
      li.innerHTML = `<span class="status-objective-check" aria-hidden="true"></span><span class="status-objective-label"></span><span class="status-objective-progress"></span>`;
      (li.querySelector(".status-objective-label") as HTMLElement).textContent = row.job.label;
      const progress = li.querySelector(".status-objective-progress") as HTMLElement;
      progress.textContent = `${Math.min(row.current, row.target)}/${row.target}`;
      if (row.job.done) li.setAttribute("aria-label", `${row.job.label}: done`);
      this.list.appendChild(li);
    }
  }
}
