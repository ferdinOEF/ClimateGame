/**
 * The headline number: houses saved.
 *
 * A small card in the top-right corner, under Back and Help. Between storms
 * it shows how many of the city's houses are standing; during a storm it
 * switches to "Houses saved N / total" for the houses in that storm's path
 * and counts down live as each one is lost, so the player watches the number
 * they are playing for.
 */
export class HousesCounter {
  private readonly el: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly valueEl: HTMLElement;
  private readonly totalEl: HTMLElement;
  private live = false;
  private current = 0;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "houses-counter";
    this.el.innerHTML = `
      <span class="houses-counter-label">Houses standing</span>
      <span class="houses-counter-figures"><b class="houses-counter-value">0</b> / <span class="houses-counter-total">0</span></span>`;
    container.appendChild(this.el);
    this.labelEl = this.el.querySelector(".houses-counter-label")!;
    this.valueEl = this.el.querySelector(".houses-counter-value")!;
    this.totalEl = this.el.querySelector(".houses-counter-total")!;
  }

  /** Between storms: the whole city. Ignored while a storm is counting. */
  showStanding(standing: number, total: number): void {
    if (this.live) return;
    this.labelEl.textContent = "Houses standing";
    this.valueEl.textContent = String(standing);
    this.totalEl.textContent = String(total);
    this.el.classList.toggle("some-lost", standing < total);
  }

  /** A storm begins: count the houses in its path. */
  beginStorm(standing: number, total: number): void {
    this.live = true;
    this.current = standing;
    this.labelEl.textContent = "Houses saved";
    this.valueEl.textContent = String(standing);
    this.totalEl.textContent = String(total);
    this.el.classList.add("live");
  }

  /** One house in the path lost. */
  lose(): void {
    if (!this.live) return;
    this.current = Math.max(0, this.current - 1);
    this.valueEl.textContent = String(this.current);
    this.el.classList.remove("tick");
    void this.el.offsetWidth;
    this.el.classList.add("tick");
  }

  /** The storm's final tally, held until the next repaint between storms. */
  endStorm(saved: number, total: number): void {
    this.valueEl.textContent = String(saved);
    this.totalEl.textContent = String(total);
    this.live = false;
    this.el.classList.remove("live");
  }

  dispose(): void {
    this.el.remove();
  }
}
