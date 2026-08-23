/**
 * STEP_PROMPT_hud_instrument_cluster.md (v3, "Instrument Cluster"): the
 * top-left corner is a real card now (background/border/padding, not bare
 * text floating over the 3D scene) — a header row (Coin + Turn/Era), a
 * real Resilience gauge (the one meter that actually threatens an era —
 * `GameState.isEraOver` reads `resilience <= 0` only, never Trust — so
 * it's the only one promoted to a labeled bar), the hazard-incoming
 * readout, then the remaining secondary meters as an actual chip grid.
 * Trust stays in the data model exactly as before (`gameState.ts`,
 * `applyHazardOutcome`, the Food-deficit drain) — only this HUD's
 * *display* of it goes away. The rest of the persistent UI (v2.1): a
 * corner tile counter, a small "tiles still empty" soft-progress prompt,
 * and a brief non-blocking era banner. No full-width panel — every tile
 * is already active (STEP_PROMPT_remove_claiming.md), so there's nothing
 * to hand-pick from, only where to build next.
 */
export class Hud {
  private tileCountEl: HTMLElement;
  private coinEl: HTMLElement;
  private turnValueEl: HTMLElement;
  private eraValueEl: HTMLElement;
  private resilienceEl: HTMLElement;
  private resilienceFillEl: HTMLElement;
  private hazardIncomingEl: HTMLElement;
  private biodiversityEl: HTMLElement;
  private carbonEl: HTMLElement;
  private foodEl: HTMLElement;
  private foodChipEl: HTMLElement;
  private populationEl: HTMLElement;
  private emptyPromptEl: HTMLElement;
  private bannerEl: HTMLElement;
  private yachtGoalEl: HTMLElement;
  private yachtValueEl: HTMLElement;

  constructor(container: HTMLElement) {
    const tileCounter = document.createElement("div");
    tileCounter.className = "hud-corner top-right";
    tileCounter.innerHTML = `<div>Tiles claimed</div><div class="tile-count-value">0</div>`;
    container.appendChild(tileCounter);
    this.tileCountEl = tileCounter.querySelector(".tile-count-value")!;

    // STEP_PROMPT_hud_instrument_cluster.md: a real card (background,
    // border, padding — matching the same dark-translucent language
    // `.build-popover`/`.empty-prompt`/`.yacht-goal` already use elsewhere
    // in this file), not bare text floating over the 3D scene. Header row
    // (Coin + Turn/Era) → Resilience gauge → hazard-incoming line(s) →
    // the secondary meters as an actual chip grid below.
    const cluster = document.createElement("div");
    cluster.className = "hud-corner top-left instrument-cluster";
    cluster.innerHTML = `
      <div class="cluster-header">
        <div class="coin-row"><span>Coin</span><span class="coin-value">0</span></div>
        <div class="turn-era-row">Turn <span class="turn-value">0</span> · Era <span class="era-value">1</span></div>
      </div>
      <div class="resilience-gauge">
        <div class="resilience-gauge-header"><span>Resilience</span><span class="resilience-value">100</span></div>
        <div class="resilience-gauge-track"><div class="resilience-gauge-fill"></div></div>
      </div>
      <div class="hazard-incoming"></div>
      <div class="chip-grid">
        <span class="meter-chip" title="Biodiversity">B <b class="biodiversity-value">0</b></span>
        <span class="meter-chip" title="Carbon">C <b class="carbon-value">0</b></span>
        <span class="meter-chip food-chip" title="Food">F <b class="food-value">0</b></span>
        <span class="meter-chip" title="Population">P <b class="population-value">0</b></span>
      </div>`;
    container.appendChild(cluster);
    this.coinEl = cluster.querySelector(".coin-value")!;
    this.turnValueEl = cluster.querySelector(".turn-value")!;
    this.eraValueEl = cluster.querySelector(".era-value")!;
    this.resilienceEl = cluster.querySelector(".resilience-value")!;
    this.resilienceFillEl = cluster.querySelector(".resilience-gauge-fill")!;
    this.hazardIncomingEl = cluster.querySelector(".hazard-incoming")!;
    this.biodiversityEl = cluster.querySelector(".biodiversity-value")!;
    this.carbonEl = cluster.querySelector(".carbon-value")!;
    this.foodEl = cluster.querySelector(".food-value")!;
    this.foodChipEl = cluster.querySelector(".food-chip")!;
    this.populationEl = cluster.querySelector(".population-value")!;

    const emptyPrompt = document.createElement("div");
    emptyPrompt.className = "hud-corner bottom-center empty-prompt";
    container.appendChild(emptyPrompt);
    this.emptyPromptEl = emptyPrompt;

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

  /** STEP_PROMPT_hud_instrument_cluster.md: the header row's second half — `era` is 1-based ("Era 1" from turn one), matching the "Era N retired" banner's own `erasCompleted + 1` convention. */
  setTurnEra(turn: number, era: number): void {
    this.turnValueEl.textContent = String(turn);
    this.eraValueEl.textContent = String(era);
  }

  /**
   * STEP_PROMPT_hud_instrument_cluster.md: no `trust` field — the HUD no
   * longer displays it (the data model and everything that reads it
   * outside this class are untouched; see the class comment).
   */
  setMeters(meters: {
    resilience: number;
    biodiversity: number;
    carbon: number;
    food: number;
    population: number;
  }): void {
    this.resilienceEl.textContent = String(Math.round(meters.resilience));
    // Resilience isn't hard-capped at 100 (a `?resilienceboost` above the
    // starting value, or simply never having taken damage yet, can exceed
    // it) — clamp only the *gauge fill*, so the bar never visually
    // overflows its track even though the raw number beside it can still
    // read above 100.
    const fillPercent = Math.max(0, Math.min(100, meters.resilience));
    this.resilienceFillEl.style.width = `${fillPercent}%`;
    // A real gauge should read as one at a glance, not just a static bar
    // with a number next to it — shift to the same warning color the Food
    // chip uses once Resilience is critically low, not just "some damage."
    this.resilienceFillEl.classList.toggle("critical", meters.resilience <= 25);
    this.biodiversityEl.textContent = String(Math.round(meters.biodiversity));
    this.carbonEl.textContent = String(Math.round(meters.carbon));
    this.foodEl.textContent = String(Math.round(meters.food));
    this.populationEl.textContent = String(Math.round(meters.population));
    // STEP_PROMPT_economy_food_yacht.md item 2: a running Food deficit now
    // drains Trust/Resilience every turn (GameState.advanceTurn) — this
    // warning color is the "why is my Resilience dropping" answer, legible
    // at a glance without opening a popover or doing mental math.
    this.foodChipEl.classList.toggle("meter-chip-warning", meters.food < 0);
  }

  /**
   * STEP_PROMPT_hud_instrument_cluster.md: which hazard(s) are coming and
   * how soon — `main.ts`'s `hazardIncomingInfo()` decides which lines to
   * include and whether each is "imminent" (its real telegraph window,
   * matching the terrain-tint/cloud-layer telegraph exactly); this method
   * just renders whatever it's handed, 0-2 lines, urgent-styled ones using
   * the same `meter-chip-warning` treatment as the Food chip.
   */
  setHazardIncoming(hazards: { kind: string; turnsUntil: number; imminent: boolean }[]): void {
    this.hazardIncomingEl.innerHTML = "";
    for (const hazard of hazards) {
      const line = document.createElement("div");
      line.className = "hazard-incoming-line" + (hazard.imminent ? " meter-chip-warning" : "");
      const turns = Math.max(0, hazard.turnsUntil);
      line.textContent = `${hazard.kind} in ${turns} turn${turns === 1 ? "" : "s"}`;
      this.hazardIncomingEl.appendChild(line);
    }
  }

  /** STEP_PROMPT_remove_claiming.md: a soft progress indicator, not a gate — every tile is already buildable, this just orients the player toward how much map is still untouched. */
  setEmptyTiles(count: number): void {
    this.emptyPromptEl.textContent = count > 0 ? `${count} hex${count === 1 ? "" : "es"} still empty` : "Every hex has something built on it";
  }
}
