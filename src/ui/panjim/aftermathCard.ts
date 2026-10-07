import { playSound } from "@ui/audioHooks";

/**
 * The Aftermath: a small card over the board once a challenge has played out.
 *
 * Stars fill one at a time with a sound each (the payoff beat), then the
 * houses saved, then one specific line about what happened. Two ways on:
 * carry on, or replay from the moment the Forecast locked, two years earlier,
 * with everything built since undone. There is no game over; the city always
 * stands, so the worst result is one star.
 */
export interface AftermathView {
  title: string;
  stars: number;
  housesSaved: number;
  housesDamaged: number;
  line: string;
  /** Null when there is no snapshot to go back to. */
  replayLabel: string | null;
}

export class AftermathCard {
  private readonly backdrop: HTMLElement;

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "aftermath-backdrop";
    this.backdrop.hidden = true;
    container.appendChild(this.backdrop);
  }

  show(view: AftermathView): Promise<"continue" | "replay"> {
    this.backdrop.innerHTML = `
      <div class="aftermath-card" role="dialog" aria-label="Aftermath">
        <div class="aftermath-eyebrow">Aftermath</div>
        <div class="aftermath-title"></div>
        <div class="aftermath-stars">${[0, 1, 2].map(() => `<span class="aftermath-star">★</span>`).join("")}</div>
        <div class="aftermath-houses"></div>
        <p class="aftermath-line"></p>
        <div class="aftermath-actions">
          <button type="button" class="aftermath-continue">Continue</button>
          ${view.replayLabel ? `<button type="button" class="aftermath-replay"></button>` : ""}
        </div>
      </div>`;
    (this.backdrop.querySelector(".aftermath-title") as HTMLElement).textContent = view.title;
    (this.backdrop.querySelector(".aftermath-houses") as HTMLElement).textContent =
      view.housesSaved + view.housesDamaged === 0
        ? "No homes stood in its path"
        : `Houses saved ${view.housesSaved}${view.housesDamaged > 0 ? ` · ${view.housesDamaged} damaged` : ""}`;
    (this.backdrop.querySelector(".aftermath-line") as HTMLElement).textContent = view.line;
    const replay = this.backdrop.querySelector(".aftermath-replay") as HTMLButtonElement | null;
    if (replay && view.replayLabel) replay.textContent = view.replayLabel;
    this.backdrop.hidden = false;

    // Stars fill one by one.
    const stars = Array.from(this.backdrop.querySelectorAll<HTMLElement>(".aftermath-star"));
    stars.forEach((star, i) => {
      if (i >= view.stars) return;
      window.setTimeout(() => {
        star.classList.add("filled");
        playSound("star");
      }, 450 + i * 420);
    });

    return new Promise((resolve) => {
      const done = (choice: "continue" | "replay"): void => {
        this.backdrop.hidden = true;
        resolve(choice);
      };
      this.backdrop.querySelector(".aftermath-continue")!.addEventListener("click", () => done("continue"));
      replay?.addEventListener("click", () => done("replay"));
    });
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  dispose(): void {
    this.backdrop.remove();
  }
}
