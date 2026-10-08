import { describeObjective, type ObjectiveProgress } from "@core/objectives";
import type { LevelDef } from "@levels/levels";
import type { GameMap } from "@levels/levelMap";

/**
 * The live objective checklist, plus the level's opening brief.
 *
 * This is the piece that turns a sandbox into a game. The board, the
 * hazards and the economy were all already here and all already good; what
 * was missing was any statement of what the player is trying to do. A
 * persistent checklist in the corner — ticking over as they build — is
 * what gives every individual move a reason.
 *
 * Two parts, deliberately:
 *   - A one-time brief on mount. A few lines of framing before the board
 *     is touched, so the level has a premise rather than just parameters.
 *   - The standing checklist, which stays visible for the whole run.
 *
 * Follows the file's existing conventions: corner-anchored (never a panel
 * competing with the map), `pointer-events` opted back in only on the
 * controls that need it, and an explicit `[hidden]` rule in hud.css for
 * anything given an unconditional `display` — the bug class this
 * stylesheet has been bitten by three times and documents at length.
 */
export class ObjectivesPanel {
  private readonly el: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly briefBackdrop: HTMLElement;
  private readonly counterEl: HTMLElement;
  /** Objective labels already seen complete, so the completion pulse fires once each rather than on every refresh. */
  private readonly celebrated = new Set<string>();

  constructor(container: HTMLElement, level: LevelDef, map: GameMap) {
    this.el = document.createElement("div");
    this.el.className = "hud-corner bottom-right objectives-panel";
    this.el.innerHTML = `
      <div class="objectives-header">
        <div class="objectives-level">
          <div class="objectives-level-name"></div>
          <div class="objectives-level-sub"></div>
        </div>
      </div>
      <div class="objectives-counter"></div>
      <ul class="objectives-list"></ul>
    `;
    (this.el.querySelector(".objectives-level-name") as HTMLElement).textContent = level.name;
    // Just the region. The level's own name IS the place now, so repeating it
    // here would print "Panaji" directly above "Panaji — Tiswadi, North Goa".
    // What the second line still adds is where in Goa that place is.
    (this.el.querySelector(".objectives-level-sub") as HTMLElement).textContent =
      map.geo ? map.region : level.subtitle;
    container.appendChild(this.el);

    this.listEl = this.el.querySelector(".objectives-list")!;
    this.counterEl = this.el.querySelector(".objectives-counter")!;

    // --- the opening brief -------------------------------------------
    this.briefBackdrop = document.createElement("div");
    this.briefBackdrop.className = "brief-backdrop";
    const card = document.createElement("div");
    card.className = "brief-card";
    card.innerHTML = `
      <div class="brief-eyebrow"></div>
      <div class="brief-title"></div>
      <p class="brief-place"></p>
      <p class="brief-body"></p>
      <div class="brief-goals-label">To clear this level</div>
      <ul class="brief-goals"></ul>
      <button type="button" class="brief-cta">Begin</button>
    `;
    (card.querySelector(".brief-eyebrow") as HTMLElement).textContent = level.subtitle;
    (card.querySelector(".brief-title") as HTMLElement).textContent = level.name;
    (card.querySelector(".brief-body") as HTMLElement).textContent = level.brief;

    /*
     * The map's own description of the place, above the level's framing of the
     * challenge. Two paragraphs doing different jobs: this one is true of the
     * coast whoever is playing and whatever the objectives are, and it says
     * the scale, which is the thing that makes a hex board legible as a real
     * eight kilometres of coastline rather than an abstract grid.
     */
    const place = card.querySelector(".brief-place") as HTMLElement;
    if (map.geo) {
      const widthKm = (map.geo.cols * map.geo.metersPerHex) / 1000;
      const heightKm = (map.geo.rows * 0.866 * map.geo.metersPerHex) / 1000;
      place.textContent =
        `${map.blurb} ` +
        `This board is ${widthKm.toFixed(1)} by ${heightKm.toFixed(1)} km of real coast, ` +
        `about ${Math.round(map.geo.metersPerHex)} m to a tile.`;
    } else {
      place.textContent = map.blurb;
      place.classList.add("synthetic");
    }

    const goals = card.querySelector(".brief-goals") as HTMLElement;
    for (const objective of level.objectives) {
      const item = document.createElement("li");
      // Same function the checklist rows use, so the brief and the
      // checklist can never word the same objective differently.
      item.textContent = describeObjective(objective);
      goals.appendChild(item);
    }

    card.querySelector(".brief-cta")!.addEventListener("click", () => this.hideBrief());
    this.briefBackdrop.appendChild(card);
    container.appendChild(this.briefBackdrop);
  }

  /**
   * Replaces the objective checklist with another body (Panaji's Get ready
   * panel). The header with the level name stays.
   */
  mountBody(body: HTMLElement): void {
    this.listEl.hidden = true;
    this.counterEl.hidden = true;
    this.el.classList.add("custom-body");
    this.el.appendChild(body);
  }

  /** Adds a second button to the opening brief, under Begin. Closes the brief and runs `onClick`. */
  addBriefAction(label: string, onClick: () => void): void {
    const cta = this.briefBackdrop.querySelector(".brief-cta");
    if (!cta) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "brief-cta brief-resume";
    button.textContent = label;
    button.addEventListener("click", () => {
      this.hideBrief();
      onClick();
    });
    cta.insertAdjacentElement("afterend", button);
  }

  /** True while the opening brief is on screen. */
  get briefOpen(): boolean {
    return !this.briefBackdrop.hidden;
  }

  private hideBrief(): void {
    this.briefBackdrop.hidden = true;
  }

  /**
   * Repaints the checklist. Called on every HUD refresh, so it rebuilds
   * rows only when the rendered text would actually differ — a full
   * innerHTML rewrite every refresh would kill the completion animation
   * mid-play by replacing the element it is running on.
   */
  render(progress: readonly ObjectiveProgress[]): void {
    const done = progress.filter((p) => p.complete).length;
    this.counterEl.textContent = `${done} / ${progress.length} complete`;
    this.counterEl.classList.toggle("all-done", done === progress.length && progress.length > 0);

    // Build the row set once; afterwards only mutate the parts that change.
    if (this.listEl.childElementCount !== progress.length) {
      this.listEl.innerHTML = "";
      for (const item of progress) {
        const row = document.createElement("li");
        row.className = "objective-row";
        row.innerHTML = `
          <span class="objective-check" aria-hidden="true"></span>
          <span class="objective-text"></span>
          <span class="objective-progress"></span>
        `;
        (row.querySelector(".objective-text") as HTMLElement).textContent = item.label;
        this.listEl.appendChild(row);
      }
    }

    progress.forEach((item, index) => {
      const row = this.listEl.children[index] as HTMLElement | undefined;
      if (!row) return;
      (row.querySelector(".objective-text") as HTMLElement).textContent = item.label;
      row.classList.toggle("complete", item.complete);

      const counter = row.querySelector(".objective-progress") as HTMLElement;
      // A 0/1 objective (`no_defenses_lost`) has no meaningful count to
      // show — a bare tick reads better than "1/1".
      counter.textContent =
        item.target <= 1 ? "" : `${Math.max(0, Math.round(item.current))}/${Math.round(item.target)}`;

      // Fire the completion pulse exactly once per objective.
      if (item.complete && !this.celebrated.has(item.label)) {
        this.celebrated.add(item.label);
        row.classList.remove("just-completed");
        void row.offsetWidth; // force reflow so re-adding the class restarts the animation
        row.classList.add("just-completed");
      }
      if (!item.complete) this.celebrated.delete(item.label);
    });
  }
}
