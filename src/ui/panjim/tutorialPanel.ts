import { NUDGE_ORDER, type NudgeId } from "@core/tutorialNudge";
import { STEP_BY_ID, TUTORIAL_STEPS, type TutorialStep } from "./tutorialSteps";

/**
 * Section 31.2 and 31.3 (owner decision): the Tutorial's objective panel. On top, the caption card for the defence
 * the Tutorial suggests now (its icon and name, what it protects against, how it works, its trade off in this game);
 * under it, the checklist "Try every defence: N of 7", each defence's icon ticked once built. When the suggested
 * defence is built its card says "Built" for a moment and the next one slides in.
 */
const BUILT_MS = 1400;

export class TutorialPanel {
  readonly el: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly items = new Map<NudgeId, HTMLElement>();
  private shown: NudgeId | null = null;
  private builtTimer = 0;
  /** A step waiting for "Built" to finish before it slides in. */
  private queued: NudgeId | null | undefined = undefined;
  private reducedMotion = false;
  /** How many of the seven are tried (the closing card says so when the run ends short of seven). */
  private tried = 0;

  constructor() {
    this.el = document.createElement("section");
    this.el.className = "tutorial-panel";
    this.el.setAttribute("aria-label", "Try every defence");
    this.el.innerHTML = `
      <div class="tutorial-caption" aria-live="polite"></div>
      <div class="tutorial-checklist">
        <div class="tutorial-checklist-head"><span>Try every defence</span><b class="tutorial-count"></b></div>
        <ul class="tutorial-checks"></ul>
      </div>`;
    this.caption = this.el.querySelector(".tutorial-caption")!;
    this.countEl = this.el.querySelector(".tutorial-count")!;
    const list = this.el.querySelector(".tutorial-checks")!;
    for (const step of TUTORIAL_STEPS) {
      const li = document.createElement("li");
      li.className = "tutorial-check";
      li.dataset.defence = step.id;
      li.title = step.name;
      li.innerHTML = `<span class="tutorial-check-icon" aria-hidden="true">${step.icon}</span><span class="tutorial-check-tick" aria-hidden="true"></span><span class="tutorial-check-name"></span>`;
      (li.querySelector(".tutorial-check-name") as HTMLElement).textContent = step.name;
      list.appendChild(li);
      this.items.set(step.id, li);
    }
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    this.el.classList.toggle("still", on);
  }

  /**
   * Paints the checklist from the defences tried, and the caption for `suggested` (null: every defence tried).
   * `justBuilt`: the defence the player has just built, whose card says "Built" before the next slides in.
   */
  render(tried: ReadonlySet<string>, suggested: NudgeId | null, justBuilt: string | null = null): void {
    let count = 0;
    for (const id of NUDGE_ORDER) {
      const done = tried.has(id);
      if (done) count++;
      const li = this.items.get(id)!;
      li.classList.toggle("done", done);
      li.classList.toggle("next", id === suggested);
      li.setAttribute("aria-label", `${STEP_BY_ID.get(id)!.name}${done ? ", tried" : ""}`);
    }
    this.countEl.textContent = `${count} of ${NUDGE_ORDER.length}`;
    this.tried = count;
    if (justBuilt && justBuilt === this.shown && suggested !== this.shown) {
      this.showBuilt(suggested);
      return;
    }
    if (this.builtTimer) {
      this.queued = suggested;
      return;
    }
    if (suggested !== this.shown || !this.caption.firstChild) this.showStep(suggested);
  }

  /** The defence whose caption shows now. */
  get current(): NudgeId | null {
    return this.shown;
  }

  private showBuilt(next: NudgeId | null): void {
    this.caption.querySelector(".tutorial-card")?.classList.add("built");
    const badge = document.createElement("span");
    badge.className = "tutorial-built";
    badge.textContent = "Built";
    this.caption.querySelector(".tutorial-card")?.appendChild(badge);
    this.queued = next;
    window.clearTimeout(this.builtTimer);
    this.builtTimer = window.setTimeout(() => {
      this.builtTimer = 0;
      const step = this.queued === undefined ? next : this.queued;
      this.queued = undefined;
      this.showStep(step ?? null);
    }, this.reducedMotion ? 600 : BUILT_MS);
  }

  private showStep(id: NudgeId | null): void {
    this.shown = id;
    this.caption.innerHTML = "";
    if (!id) {
      const done = document.createElement("div");
      done.className = "tutorial-card tutorial-card-done";
      // No suggestion: every defence tried, or the seven years are up (Section 31: never "every" when it was not).
      const all = this.tried >= NUDGE_ORDER.length;
      done.innerHTML = `<b></b><p>Watch what each one does in the storm.</p>`;
      (done.querySelector("b") as HTMLElement).textContent = all ? "Every defence tried" : `You tried ${this.tried} of ${NUDGE_ORDER.length}`;
      this.caption.appendChild(done);
      return;
    }
    this.caption.appendChild(captionCard(STEP_BY_ID.get(id)!, this.reducedMotion));
  }

  dispose(): void {
    window.clearTimeout(this.builtTimer);
    this.el.remove();
  }
}

/** One defence's caption card. */
export function captionCard(step: TutorialStep, still = false): HTMLElement {
  const card = document.createElement("div");
  card.className = `tutorial-card${still ? "" : " slide-in"}`;
  card.dataset.defence = step.id;
  card.innerHTML = `
    <div class="tutorial-card-head"><span class="tutorial-card-icon" aria-hidden="true">${step.icon}</span><b class="tutorial-card-name"></b></div>
    <ul class="tutorial-chips"></ul>
    <div class="tutorial-how-head">How it works</div>
    <p class="tutorial-how"></p>
    <p class="tutorial-ingame"></p>`;
  (card.querySelector(".tutorial-card-name") as HTMLElement).textContent = step.name;
  const chips = card.querySelector(".tutorial-chips")!;
  for (const p of step.protects) {
    const li = document.createElement("li");
    li.className = "tutorial-chip";
    li.textContent = p;
    chips.appendChild(li);
  }
  (card.querySelector(".tutorial-how") as HTMLElement).textContent = step.how.join(" ");
  (card.querySelector(".tutorial-ingame") as HTMLElement).textContent = step.inGame;
  return card;
}
