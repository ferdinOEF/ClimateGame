import type { ChallengeKind } from "@core/climate";
import { challengeIcon } from "./outlookBar";

/**
 * The forecast cone's words (Section 6.1), top centre under the clock: a chip
 * naming the storm and when ("Cyclone lands end of 2030 · 5 years") and a
 * small legend for what the cone draws on the board. "Where they meet" is
 * listed only for the compound storm. Each swatch has its own shape or
 * pattern, so the legend reads in grayscale and deuteranopia.
 */
export class ForecastConeCard {
  readonly el: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly meet: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "forecast-cone-card";
    this.el.setAttribute("role", "note");
    this.el.setAttribute("aria-label", "Forecast");
    this.el.innerHTML = `
      <div class="cone-chip"><span class="cone-chip-icon" aria-hidden="true"></span><span class="cone-chip-text"></span></div>
      <ul class="cone-legend">
        <li><span class="cone-swatch band-3" aria-hidden="true"></span>Most likely</li>
        <li><span class="cone-swatch band-2" aria-hidden="true"></span>Likely</li>
        <li><span class="cone-swatch band-1" aria-hidden="true"></span>Possible</li>
        <li><span class="cone-swatch area" aria-hidden="true"></span>Area to protect</li>
        <li class="cone-legend-meet"><span class="cone-swatch meet" aria-hidden="true"></span>Where they meet</li>
      </ul>`;
    this.chip = this.el.querySelector(".cone-chip")!;
    this.meet = this.el.querySelector(".cone-legend-meet")!;
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  show(kind: ChallengeKind, chip: string): void {
    (this.chip.querySelector(".cone-chip-icon") as HTMLElement).innerHTML = challengeIcon(kind);
    (this.chip.querySelector(".cone-chip-text") as HTMLElement).textContent = chip;
    this.meet.hidden = kind !== "compound";
    this.el.hidden = false;
    this.el.classList.remove("leaving");
    this.el.parentElement?.classList.add("has-forecast-cone");
  }

  hide(): void {
    this.el.hidden = true;
    this.el.parentElement?.classList.remove("has-forecast-cone");
  }

  get isShown(): boolean {
    return !this.el.hidden;
  }

  dispose(): void {
    this.el.parentElement?.classList.remove("has-forecast-cone");
    this.el.remove();
  }
}
