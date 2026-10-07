import { playSound } from "@ui/audioHooks";

/**
 * The coin jar: where a quarter's income lands, under the instrument cluster.
 *
 * Tapping it banks everything in it into Coin. That is a free action: it
 * spends no time, so it never competes with building. It exists for the
 * small, frequent pleasure of it (Royal Match's micro-reward): a jar that
 * fills as the city earns, wobbles when there is something in it, and pays
 * out with a pop and a chime.
 */
export class CoinJar {
  readonly el: HTMLButtonElement;
  private readonly fillEl: SVGRectElement;
  private readonly amountEl: HTMLElement;
  private readonly popLayer: HTMLElement;

  constructor(container: HTMLElement, private readonly onCollect: () => number) {
    this.el = document.createElement("button");
    this.el.type = "button";
    this.el.className = "coin-jar";
    this.el.setAttribute("aria-label", "Coin jar: tap to collect");
    this.el.title = "Your city's income collects here every quarter. Tap to bank it. Free: no time passes.";
    this.el.innerHTML = `
      <svg viewBox="0 0 48 56" width="48" height="56" aria-hidden="true">
        <defs><clipPath id="jar-clip"><path d="M10 14h28v4c4 3 6 7 6 13v15a7 7 0 0 1-7 7H11a7 7 0 0 1-7-7V31c0-6 2-10 6-13z"/></clipPath></defs>
        <path d="M10 14h28v4c4 3 6 7 6 13v15a7 7 0 0 1-7 7H11a7 7 0 0 1-7-7V31c0-6 2-10 6-13z" fill="rgba(253,246,230,0.12)" stroke="#fdf6e6" stroke-width="2"/>
        <rect class="jar-fill" x="0" y="53" width="48" height="0" fill="#f2c35b" clip-path="url(#jar-clip)"/>
        <rect x="8" y="6" width="32" height="8" rx="2" fill="#a46a3c" stroke="#fdf6e6" stroke-width="2"/>
        <circle cx="24" cy="38" r="6" fill="none" stroke="#7a5212" stroke-width="2" opacity="0.6"/>
      </svg>
      <span class="jar-amount">0</span>
      <span class="jar-pops"></span>
    `;
    container.appendChild(this.el);
    this.fillEl = this.el.querySelector(".jar-fill")!;
    this.amountEl = this.el.querySelector(".jar-amount")!;
    this.popLayer = this.el.querySelector(".jar-pops")!;
    this.el.addEventListener("click", (event) => {
      event.stopPropagation();
      const coins = this.onCollect();
      if (coins <= 0) return;
      playSound("collect");
      this.pop(`+${coins}`);
    });
  }

  /** `amount` is the coin in the jar; the jar reads full at `fullAt`. */
  render(amount: number, fullAt: number): void {
    const whole = Math.floor(amount);
    this.amountEl.textContent = whole > 0 ? `+${whole}` : "0";
    const share = Math.max(0, Math.min(1, amount / Math.max(1, fullAt)));
    const height = 39 * share;
    this.fillEl.setAttribute("y", String(53 - height));
    this.fillEl.setAttribute("height", String(height));
    this.el.classList.toggle("has-coin", whole > 0);
    this.el.classList.toggle("full", share >= 1);
  }

  private pop(text: string): void {
    const pop = document.createElement("span");
    pop.className = "jar-pop";
    pop.textContent = text;
    this.popLayer.appendChild(pop);
    window.setTimeout(() => pop.remove(), 1100);
  }

  dispose(): void {
    this.el.remove();
  }
}
