/**
 * Shown once per game load, before anything else — a title moment, not a
 * gameplay dialog. Static content, no game-state coupling, same reasoning
 * as HelpModal: no wiring through main.ts beyond construction + one show()
 * call. IKUZO and the corner × both just close it — there's no separate
 * "start" action since the game underneath is already loaded and playable.
 */
export class WelcomeModal {
  private backdrop: HTMLElement;

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "welcome-backdrop";
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.hide();
    });

    const card = document.createElement("div");
    card.className = "welcome-card";
    card.innerHTML = `
      <button type="button" class="welcome-close" aria-label="Close">&times;</button>
      <div class="welcome-title">Root &amp; Ruin</div>
      <p class="welcome-body">Nature's coming, are you ready? Grow your coast, plant your defenses, and see if your little slice of Goa can survive the fury of the sea.</p>
      <p class="welcome-help">Need help with the game? Click the '?' button on the top right corner.</p>
      <button type="button" class="welcome-cta">IKUZO!</button>
    `;
    card.querySelector(".welcome-close")!.addEventListener("click", () => this.hide());
    card.querySelector(".welcome-cta")!.addEventListener("click", () => this.hide());

    this.backdrop.appendChild(card);
    container.appendChild(this.backdrop);
  }

  show(): void {
    this.backdrop.hidden = false;
  }

  hide(): void {
    this.backdrop.hidden = true;
  }
}
