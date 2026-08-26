/**
 * STEP_PROMPT_hud_instrument_cluster.md (v3, "Instrument Cluster"): the
 * top-left corner is a real card now (background/border/padding, not bare
 * text floating over the 3D scene) — a header row (Coin + Turn/Era), a
 * real Resilience gauge (the one meter tied to `GameState.isEraOver`,
 * which reads `resilience <= 0` only, never Trust — so it's the only one
 * promoted to a labeled bar), the hazard-incoming readout, then the
 * remaining secondary meters as an actual chip grid. Trust stays in the
 * data model exactly as before (`gameState.ts`, `applyHazardOutcome`) —
 * only this HUD's *display* of it goes away. (STEP_PROMPT_manual_only_
 * mode.md later removed the automatic Food-deficit drain that used to
 * touch Trust every turn — `applyHazardOutcome` is now Trust's only
 * automatic mover, from an actual triggered hazard.) The rest of the
 * persistent UI (v2.1): a corner tile counter, a small "tiles still
 * empty" soft-progress prompt, and a brief non-blocking banner (originally
 * an auto era-retired announcement; now a manual "Board reset." confirmation
 * — see `main.ts`'s `resetBoard()`). No full-width panel — every tile is
 * already active (STEP_PROMPT_remove_claiming.md), so there's nothing to
 * hand-pick from, only where to build next.
 */
export class Hud {
  private tileCountEl: HTMLElement;
  private coinEl: HTMLElement;
  private incomeEl: HTMLElement;
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
  private arrivalFlashEl: HTMLElement;
  private previewToggleEl: HTMLButtonElement;
  private clusterEl: HTMLElement;
  private clusterCollapseToggleEl: HTMLButtonElement;
  private clusterPillEl: HTMLButtonElement;
  private pillCoinEl: HTMLElement;
  private pillResilienceValueEl: HTMLElement;
  private pillResilienceDotEl: HTMLElement;
  private pillHazardValueEl: HTMLElement;

  constructor(container: HTMLElement, onPreviewToggle: () => void) {
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
        <div class="cluster-header-right">
          <div class="turn-era-row">Turn <span class="turn-value">0</span> · Era <span class="era-value">1</span></div>
          <button type="button" class="cluster-collapse-toggle" aria-label="Collapse HUD">
            <span class="chevron-glyph chevron-up"></span>
          </button>
        </div>
      </div>
      <div class="income-row">Income <span class="income-value">+0</span>/turn</div>
      <div class="resilience-gauge">
        <div class="resilience-gauge-header"><span>Resilience</span><span class="resilience-value">100</span></div>
        <div class="resilience-gauge-track"><div class="resilience-gauge-fill"></div></div>
      </div>
      <div class="hazard-incoming"></div>
      <button type="button" class="preview-toggle" hidden>Preview path</button>
      <div class="chip-grid">
        <span class="meter-chip">Biodiversity <b class="biodiversity-value">0</b></span>
        <span class="meter-chip">Carbon <b class="carbon-value">0</b></span>
        <span class="meter-chip food-chip">Food <b class="food-value">0</b></span>
        <span class="meter-chip">Population <b class="population-value">0</b></span>
      </div>
      <button type="button" class="cluster-pill" aria-label="Expand HUD">
        <span class="pill-item pill-coin">
          <svg class="pill-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <circle cx="8" cy="8" r="6" fill="none" stroke="#ffe9a8" stroke-width="1.4"></circle>
            <line x1="3.5" y1="8" x2="12.5" y2="8" stroke="#ffe9a8" stroke-width="1.4"></line>
          </svg>
          <span class="pill-coin-value">0</span>
        </span>
        <span class="pill-divider"></span>
        <span class="pill-item pill-resilience">
          <span class="pill-resilience-dot"></span>
          <span class="pill-resilience-value">100</span>
        </span>
        <span class="pill-divider"></span>
        <span class="pill-item pill-hazard">
          <svg class="pill-icon" viewBox="0 0 16 10" width="14" height="9" aria-hidden="true">
            <path d="M1 5c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
          </svg>
          <span class="pill-hazard-value">–</span>
        </span>
        <span class="chevron-glyph chevron-right"></span>
      </button>`;
    container.appendChild(cluster);
    this.clusterEl = cluster;
    this.coinEl = cluster.querySelector(".coin-value")!;
    this.incomeEl = cluster.querySelector(".income-value")!;
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
    this.previewToggleEl = cluster.querySelector(".preview-toggle")!;
    this.previewToggleEl.addEventListener("click", () => onPreviewToggle());

    // STEP_PROMPT_mobile_responsive.md Section 4 ("Status Pill" direction,
    // signed off from a 4-option mockup): the chevron in the header
    // collapses `.instrument-cluster` down to a single-row pill; the pill
    // itself (its own tap target, not just its trailing chevron) expands
    // it back. Both live inside the cluster, so neither needs its own
    // corner-positioning class — `.instrument-cluster`'s own `top-left`
    // offset is what both states share ("same top-left position"), which
    // is why the collapsed state reshapes the card in place rather than
    // introducing a second, separately-positioned element.
    this.clusterCollapseToggleEl = cluster.querySelector(".cluster-collapse-toggle")!;
    this.clusterPillEl = cluster.querySelector(".cluster-pill")!;
    this.pillCoinEl = cluster.querySelector(".pill-coin-value")!;
    this.pillResilienceValueEl = cluster.querySelector(".pill-resilience-value")!;
    this.pillResilienceDotEl = cluster.querySelector(".pill-resilience-dot")!;
    this.pillHazardValueEl = cluster.querySelector(".pill-hazard-value")!;
    this.clusterCollapseToggleEl.addEventListener("click", () => this.setClusterCollapsed(true));
    this.clusterPillEl.addEventListener("click", () => this.setClusterCollapsed(false));

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

    // STEP_PROMPT_pacing_telegraph_preview.md Section 1's "give the
    // countdown-hits-zero moment its own beat": a full-viewport tinted
    // flash, briefly, so a hazard's actual arrival reads as a discrete
    // event distinct from the wave-sweep that follows it — not a build
    // action that happens to also trigger a hazard with no transition.
    const arrivalFlash = document.createElement("div");
    arrivalFlash.className = "hazard-arrival-flash";
    container.appendChild(arrivalFlash);
    this.arrivalFlashEl = arrivalFlash;
  }

  /**
   * Fires the arrival-beat flash in `color` (a CSS color string). Restarts
   * cleanly even if called again before the previous flash's animation
   * finished — removing then re-adding the animating class in the same
   * tick wouldn't restart a CSS animation on its own, so this forces a
   * reflow in between.
   */
  flashArrival(color: string): void {
    this.arrivalFlashEl.style.setProperty("--arrival-flash-color", color);
    this.arrivalFlashEl.classList.remove("flashing");
    void this.arrivalFlashEl.offsetWidth; // force reflow so re-adding the class restarts the animation
    this.arrivalFlashEl.classList.add("flashing");
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

  /** A brief, non-blocking announcement — originally an auto era-retired narrative, now the manual "Board reset." confirmation (STEP_PROMPT_manual_only_mode.md) — never a modal. */
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

  /**
   * `n` can be fractional now that a standing element's Coin income
   * (`income`) accrues by maturity fraction, same as every other meter —
   * rounded for display, same convention `setMeters()` already uses.
   * `income` is what the next turn will add, shown alongside it so the
   * player can see where Coin is headed, not just where it is.
   */
  setCoin(n: number, income: number): void {
    const rounded = Math.round(n);
    this.coinEl.textContent = String(rounded);
    this.pillCoinEl.textContent = String(rounded);
    const roundedIncome = Math.round(income);
    this.incomeEl.textContent = roundedIncome > 0 ? `+${roundedIncome}` : String(roundedIncome);
    this.incomeEl.classList.toggle("negative", roundedIncome < 0);
  }

  /** STEP_PROMPT_hud_instrument_cluster.md: the header row's second half — `era` is 1-based ("Era 1" from turn one), matching `GameState.erasCompleted + 1`'s own convention (the same expression `main.ts`'s `refreshHud()` passes in here). */
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
    const roundedResilience = Math.round(meters.resilience);
    this.resilienceEl.textContent = String(roundedResilience);
    this.pillResilienceValueEl.textContent = String(roundedResilience);
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
    // The pill's own resilience dot (Section 4) carries the identical
    // signal — it's a summary, so "is this actually fine" has to survive
    // the collapse, not just the number.
    const critical = meters.resilience <= 25;
    this.resilienceFillEl.classList.toggle("critical", critical);
    this.pillResilienceDotEl.classList.toggle("critical", critical);
    this.biodiversityEl.textContent = String(Math.round(meters.biodiversity));
    this.carbonEl.textContent = String(Math.round(meters.carbon));
    this.foodEl.textContent = String(Math.round(meters.food));
    this.populationEl.textContent = String(Math.round(meters.population));
    // STEP_PROMPT_economy_food_yacht.md item 2: a running Food deficit used
    // to drain Trust/Resilience every turn (GameState.advanceTurn) — that
    // automatic drain is gone (STEP_PROMPT_manual_only_mode.md), but the
    // warning color stays: a negative Food number is still worth flagging
    // at a glance, now as "you're not sustaining your Houses" rather than
    // "this is actively costing you Resilience right now."
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
    // Section 4's pill shows "turns until next hazard" as a bare number
    // next to its wave glyph — the same underlying number the line(s)
    // above are built from (whichever is soonest, when there are two for
    // a compound event), not re-parsed out of the rendered sentence.
    this.pillHazardValueEl.textContent = hazards.length > 0 ? String(Math.max(0, Math.min(...hazards.map((h) => h.turnsUntil)))) : "–";
  }

  /**
   * STEP_PROMPT_mobile_responsive.md Section 4: purely a visibility swap
   * on `.instrument-cluster` — the CSS class does the actual work (see
   * hud.css), this just tracks state and keeps both toggle controls'
   * `aria-label`s in sync. Deliberately doesn't touch anything outside
   * the cluster (BuildPopover, EraEndScreen, camera, game state).
   */
  private setClusterCollapsed(collapsed: boolean): void {
    this.clusterEl.classList.toggle("collapsed", collapsed);
    const label = collapsed ? "Expand HUD" : "Collapse HUD";
    this.clusterCollapseToggleEl.setAttribute("aria-label", label);
    this.clusterPillEl.setAttribute("aria-label", label);
  }

  /**
   * STEP_PROMPT_pacing_telegraph_preview.md Section 3: shown only while at
   * least one hazard is genuinely imminent — the only moment previewing is
   * decision-relevant. `main.ts`'s `syncHudPreviewAvailability()` also
   * force-clears an active preview the instant this flips to unavailable,
   * so the button hiding and the ghost tiles disappearing happen together.
   */
  setPreviewAvailable(available: boolean): void {
    this.previewToggleEl.hidden = !available;
  }

  /** Just the button's own pressed/label state — `main.ts` owns whether a preview is actually active and what it shows. */
  setPreviewActive(active: boolean): void {
    this.previewToggleEl.classList.toggle("active", active);
    this.previewToggleEl.textContent = active ? "Hide preview" : "Preview path";
  }

  /** STEP_PROMPT_remove_claiming.md: a soft progress indicator, not a gate — every tile is already buildable, this just orients the player toward how much map is still untouched. */
  setEmptyTiles(count: number): void {
    this.emptyPromptEl.textContent = count > 0 ? `${count} hex${count === 1 ? "" : "es"} still empty` : "Every hex has something built on it";
  }
}
