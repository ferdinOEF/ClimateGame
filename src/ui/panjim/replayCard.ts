import type { ReplayStep } from "@core/stormReplay";

/**
 * The Aftermath replay card: a small caption card at the top of the board
 * that walks through what the storm did, one step at a time, while the
 * board lights the houses hit (red), the houses kept dry (green) and the
 * defences each step is about (gold). Maya says each step's line.
 *
 * Skippable: the Skip button, Esc, or a click on the board ends it at once.
 */
export interface ReplayHooks {
  /** Lights the board for a step (null clears it). */
  light: (step: ReplayStep | null) => void;
  /** Maya says a line. */
  say: (line: string) => void;
}

const STEP_MS = 2600;

export class ReplayCard {
  private readonly el: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "replay-card";
    this.el.setAttribute("role", "status");
    this.el.setAttribute("aria-live", "polite");
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  /** Plays the steps; resolves when done or skipped. */
  play(title: string, steps: ReplayStep[], hooks: ReplayHooks): Promise<void> {
    if (steps.length === 0) return Promise.resolve();
    this.el.innerHTML = `
      <div class="replay-head"><span class="replay-eyebrow">Replay</span><span class="replay-title"></span>
        <button type="button" class="replay-skip">Skip</button></div>
      <div class="replay-text"></div>
      <div class="replay-dots">${steps.map(() => `<span class="replay-dot"></span>`).join("")}</div>
      <div class="replay-legend"><span class="hit">■ hit</span><span class="dry">■ wet, standing</span><span class="gold">■ defence</span></div>`;
    (this.el.querySelector(".replay-title") as HTMLElement).textContent = title;
    this.el.hidden = false;
    const text = this.el.querySelector(".replay-text") as HTMLElement;
    const dots = Array.from(this.el.querySelectorAll<HTMLElement>(".replay-dot"));
    return new Promise((resolve) => {
      let index = -1;
      let timer = 0;
      const abort = new AbortController();
      const finish = (): void => {
        this.skipNow = null;
        window.clearTimeout(timer);
        abort.abort();
        hooks.light(null);
        this.el.hidden = true;
        resolve();
      };
      const next = (): void => {
        index++;
        if (index >= steps.length) {
          finish();
          return;
        }
        const step = steps[index];
        text.textContent = step.text;
        dots.forEach((dot, i) => dot.classList.toggle("on", i <= index));
        hooks.light(step);
        hooks.say(step.maya);
        timer = window.setTimeout(next, STEP_MS);
      };
      this.el.querySelector(".replay-skip")!.addEventListener("click", (event) => {
        event.stopPropagation();
        finish();
      }, { signal: abort.signal });
      // On window, like Maya's own Esc, so her closing a line cannot swallow it.
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          finish();
        }
      }, { signal: abort.signal, capture: true });
      // A click elsewhere on the board also skips (not on Maya or the HUD).
      window.setTimeout(() => {
        document.addEventListener("pointerdown", (event) => {
          const target = event.target;
          if (target instanceof Element && target.closest(".replay-card, .maya, .hud-panel")) return;
          finish();
        }, { signal: abort.signal, capture: true });
      }, 300);
      this.skipNow = finish;
      next();
    });
  }

  /**
   * Section 30.11 bug 11: never over the tiles it describes. `points` are those tiles on screen (container pixels);
   * the card sits at its place under the HUD unless that covers more of them than the bottom of the screen does.
   */
  placeAvoiding(points: readonly { x: number; y: number }[]): void {
    const parent = this.el.offsetParent as HTMLElement | null;
    if (!parent || this.el.hidden) return;
    const covered = (): number => {
      const box = this.el.getBoundingClientRect();
      const origin = parent.getBoundingClientRect();
      const left = box.left - origin.left - 24;
      const right = box.right - origin.left + 24;
      const top = box.top - origin.top - 24;
      const bottom = box.bottom - origin.top + 24;
      return points.filter((p) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom).length;
    };
    this.el.classList.remove("replay-low");
    const atTop = covered();
    if (atTop === 0) return;
    this.el.classList.add("replay-low");
    if (covered() >= atTop) this.el.classList.remove("replay-low");
  }

  /** Ends the replay now, as Skip does (Section 30.10: Speed up). */
  skip(): void {
    this.skipNow?.();
  }

  private skipNow: (() => void) | null = null;

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  dispose(): void {
    this.el.remove();
  }
}
