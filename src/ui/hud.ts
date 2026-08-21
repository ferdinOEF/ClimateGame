/**
 * The only persistent UI (v2.1): a corner tile counter, one compact meter
 * strip (Coin + Section 7's meters — Trust/Resilience/Biodiversity/Carbon,
 * plus v2.4's Food/Population), a small "next hex to claim" prompt, and a
 * brief non-blocking era banner. No full-width panel, and no hand strip
 * anymore — Section 2/3: there's no longer a choice of *what* to place,
 * only *where* to claim next, so there's nothing to hand-pick from.
 */
export class Hud {
  private tileCountEl: HTMLElement;
  private coinEl: HTMLElement;
  private trustEl: HTMLElement;
  private resilienceEl: HTMLElement;
  private biodiversityEl: HTMLElement;
  private carbonEl: HTMLElement;
  private foodEl: HTMLElement;
  private foodChipEl: HTMLElement;
  private populationEl: HTMLElement;
  private claimPromptEl: HTMLElement;
  private bannerEl: HTMLElement;
  private yachtGoalEl: HTMLElement;
  private yachtValueEl: HTMLElement;

  constructor(container: HTMLElement) {
    const tileCounter = document.createElement("div");
    tileCounter.className = "hud-corner top-right";
    tileCounter.innerHTML = `<div>Tiles claimed</div><div class="tile-count-value">0</div>`;
    container.appendChild(tileCounter);
    this.tileCountEl = tileCounter.querySelector(".tile-count-value")!;

    const meters = document.createElement("div");
    meters.className = "hud-corner top-left meters-panel";
    meters.innerHTML = `
      <div class="coin-row"><span>Coin</span><span class="coin-value">0</span></div>
      <div class="meter-row">
        <span class="meter-chip" title="Trust">T <b class="trust-value">0</b></span>
        <span class="meter-chip" title="Resilience">R <b class="resilience-value">0</b></span>
        <span class="meter-chip" title="Biodiversity">B <b class="biodiversity-value">0</b></span>
        <span class="meter-chip" title="Carbon">C <b class="carbon-value">0</b></span>
        <span class="meter-chip food-chip" title="Food">F <b class="food-value">0</b></span>
        <span class="meter-chip" title="Population">P <b class="population-value">0</b></span>
      </div>`;
    container.appendChild(meters);
    this.coinEl = meters.querySelector(".coin-value")!;
    this.trustEl = meters.querySelector(".trust-value")!;
    this.resilienceEl = meters.querySelector(".resilience-value")!;
    this.biodiversityEl = meters.querySelector(".biodiversity-value")!;
    this.carbonEl = meters.querySelector(".carbon-value")!;
    this.foodEl = meters.querySelector(".food-value")!;
    this.foodChipEl = meters.querySelector(".food-chip")!;
    this.populationEl = meters.querySelector(".population-value")!;

    const claimPrompt = document.createElement("div");
    claimPrompt.className = "hud-corner bottom-center claim-prompt";
    container.appendChild(claimPrompt);
    this.claimPromptEl = claimPrompt;

    const banner = document.createElement("div");
    banner.className = "hud-corner top-center era-banner";
    banner.hidden = true;
    container.appendChild(banner);
    this.bannerEl = banner;

    // STEP_PROMPT_economy_food_yacht.md item 4: "always visible as a
    // goal" — a persistent corner widget, not something tucked inside a
    // popover the player has to go looking for. Present from the very
    // first frame, before the player has claimed or even reached a Coast
    // tile.
    const yachtGoal = document.createElement("div");
    yachtGoal.className = "hud-corner bottom-right yacht-goal";
    yachtGoal.innerHTML = `<div>Yacht</div><div class="yacht-value">0 / 0c</div>`;
    container.appendChild(yachtGoal);
    this.yachtGoalEl = yachtGoal;
    this.yachtValueEl = yachtGoal.querySelector(".yacht-value")!;
  }

  /**
   * Three states (STEP_PROMPT_economy_food_yacht.md item 4): dimmed/muted
   * progress ("320 / 750c") while unaffordable, lit/highlighted the
   * moment Coin crosses `cost` (independent of whether a Coast tile has
   * even been claimed yet), and a distinct achieved treatment once one
   * actually exists on the map — that last state stops showing the
   * countdown entirely rather than freezing it at "750 / 750c".
   */
  setYachtGoal(coin: number, cost: number, built: boolean): void {
    this.yachtGoalEl.classList.toggle("achieved", built);
    this.yachtGoalEl.classList.toggle("affordable", !built && coin >= cost);
    this.yachtValueEl.textContent = built ? "✓ Achieved" : `${Math.min(Math.floor(coin), cost)} / ${cost}c`;
  }

  /** A brief, non-blocking announcement (era retired/soft-lost) — never a modal. */
  showBanner(text: string, durationMs = 3500): void {
    this.bannerEl.textContent = text;
    this.bannerEl.hidden = false;
    window.setTimeout(() => {
      this.bannerEl.hidden = true;
    }, durationMs);
  }

  setTileCount(n: number): void {
    this.tileCountEl.textContent = String(n);
  }

  setCoin(n: number): void {
    this.coinEl.textContent = String(n);
  }

  setMeters(meters: {
    trust: number;
    resilience: number;
    biodiversity: number;
    carbon: number;
    food: number;
    population: number;
  }): void {
    this.trustEl.textContent = String(Math.round(meters.trust));
    this.resilienceEl.textContent = String(Math.round(meters.resilience));
    this.biodiversityEl.textContent = String(Math.round(meters.biodiversity));
    this.carbonEl.textContent = String(Math.round(meters.carbon));
    this.foodEl.textContent = String(Math.round(meters.food));
    this.populationEl.textContent = String(Math.round(meters.population));
    // STEP_PROMPT_economy_food_yacht.md item 2: a running Food deficit now
    // drains Trust/Resilience every turn (GameState.advanceTurn) — this
    // warning color is the "why is my Trust dropping" answer, legible at
    // a glance without opening a popover or doing mental math.
    this.foodChipEl.classList.toggle("meter-chip-warning", meters.food < 0);
  }

  /** Section 3's "next hex to claim" prompt — a glowing ring count, not a form. */
  setClaimable(count: number, claimCost: number): void {
    this.claimPromptEl.textContent =
      count > 0 ? `${count} hex${count === 1 ? "" : "es"} to claim — ${claimCost}c each` : "Nothing left to claim";
  }
}
