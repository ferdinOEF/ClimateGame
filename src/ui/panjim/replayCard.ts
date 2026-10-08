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
      <div class="replay-legend"><span class="hit">■ hit</span><span class="dry">■ spared</span><span class="gold">■ defence</span></div>`;
    (this.el.querySelector(".replay-title") as HTMLElement).textContent = title;
    this.el.hidden = false;
    const text = this.el.querySelector(".replay-text") as HTMLElement;
    const dots = Array.from(this.el.querySelectorAll<HTMLElement>(".replay-dot"));
    return new Promise((resolve) => {
      let index = -1;
      let timer = 0;
      const abort = new AbortController();
      const finish = (): void => {
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
          if (target instanceof Element && target.closest(".replay-card, .maya, .panjim-toggles")) return;
          finish();
        }, { signal: abort.signal, capture: true });
      }, 300);
      next();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  dispose(): void {
    this.el.remove();
  }
}
