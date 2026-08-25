const DEFAULT_SEVERITY = 1.0;

export interface HazardTestPanelCallbacks {
  onTriggerStorm: (severity: number) => void;
  onTriggerFlood: (severity: number) => void;
  /** STEP_PROMPT_manual_only_mode.md Part B: wipes the whole board back to a fresh start. Destructive and can't be undone, so the panel confirms before calling this. */
  onResetBoard: () => void;
}

/**
 * STEP_PROMPT_hazard_test_sliders.md: a testing/tuning aid — trigger a
 * Storm Surge Wave or a Flood at a chosen severity on demand. Deliberately
 * calls back into `main.ts`'s own `triggerCyclone`/`triggerFlood` (not a
 * parallel code path), so a manual trigger behaves exactly like clicking
 * "Trigger now" in every way — nextCycloneAtTurn/nextFloodAtTurn reset,
 * resolve sound plays, HUD refreshes. That includes Flood's own
 * `stormSurgeActive` check still running normally, so triggering Storm
 * Surge then Flood within the compound window correctly exercises the
 * compound-flooding path on demand.
 *
 * STEP_PROMPT_manual_only_mode.md Part B added the "Reset Board" button —
 * the only way the board resets now, ever (see `main.ts`'s `resetBoard()`).
 *
 * Not gated behind a build flag or URL param this pass, per the step
 * prompt's own explicit instruction — flagged in PROGRESS.md as a later
 * cleanup once the game is shared with someone who shouldn't see a test
 * panel, not built now.
 */
export class HazardTestPanel {
  private tabEl: HTMLButtonElement;
  private panelEl: HTMLElement;
  private stormSlider: HTMLInputElement;
  private stormReadout: HTMLElement;
  private stormSchedule: HTMLElement;
  private floodSlider: HTMLInputElement;
  private floodReadout: HTMLElement;
  private floodSchedule: HTMLElement;
  private open = false;

  constructor(container: HTMLElement, callbacks: HazardTestPanelCallbacks) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "hazard-test-tab";
    tab.textContent = "Test hazards";
    container.appendChild(tab);
    this.tabEl = tab;

    const panel = document.createElement("div");
    panel.className = "hazard-test-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="hazard-test-row storm">
        <div class="hazard-test-label">Storm Surge</div>
        <div class="hazard-test-schedule storm-schedule"></div>
        <div class="hazard-test-controls">
          <input type="range" min="0" max="3" step="0.1" value="${DEFAULT_SEVERITY}" class="hazard-test-slider storm-slider" aria-label="Storm Surge severity" />
          <span class="hazard-test-readout storm-readout">${DEFAULT_SEVERITY.toFixed(1)}×</span>
        </div>
        <button type="button" class="hazard-test-trigger storm-trigger">Trigger now</button>
      </div>
      <div class="hazard-test-row flood">
        <div class="hazard-test-label">Flood</div>
        <div class="hazard-test-schedule flood-schedule"></div>
        <div class="hazard-test-controls">
          <input type="range" min="0" max="3" step="0.1" value="${DEFAULT_SEVERITY}" class="hazard-test-slider flood-slider" aria-label="Flood severity" />
          <span class="hazard-test-readout flood-readout">${DEFAULT_SEVERITY.toFixed(1)}×</span>
        </div>
        <button type="button" class="hazard-test-trigger flood-trigger">Trigger now</button>
      </div>
      <div class="hazard-test-row reset">
        <div class="hazard-test-label">Board</div>
        <button type="button" class="hazard-test-reset">Reset Board</button>
      </div>
    `;
    container.appendChild(panel);
    this.panelEl = panel;

    this.stormSlider = panel.querySelector(".storm-slider")!;
    this.stormReadout = panel.querySelector(".storm-readout")!;
    this.stormSchedule = panel.querySelector(".storm-schedule")!;
    this.floodSlider = panel.querySelector(".flood-slider")!;
    this.floodReadout = panel.querySelector(".flood-readout")!;
    this.floodSchedule = panel.querySelector(".flood-schedule")!;

    tab.addEventListener("click", () => this.setOpen(!this.open));

    // Update on `input` (fires continuously while dragging), not `change`
    // (fires once on release) — dragging should feel responsive.
    this.stormSlider.addEventListener("input", () => {
      this.stormReadout.textContent = `${Number(this.stormSlider.value).toFixed(1)}×`;
    });
    this.floodSlider.addEventListener("input", () => {
      this.floodReadout.textContent = `${Number(this.floodSlider.value).toFixed(1)}×`;
    });

    panel.querySelector(".storm-trigger")!.addEventListener("click", () => {
      callbacks.onTriggerStorm(Number(this.stormSlider.value));
    });
    panel.querySelector(".flood-trigger")!.addEventListener("click", () => {
      callbacks.onTriggerFlood(Number(this.floodSlider.value));
    });
    // STEP_PROMPT_manual_only_mode.md Part B: destructive and can't be
    // undone, so a plain confirm() before firing — this control lives
    // inside an already-interactive dev panel, not behind a scripted flow.
    panel.querySelector(".hazard-test-reset")!.addEventListener("click", () => {
      if (window.confirm("Reset the board? This clears everything built and can't be undone.")) {
        callbacks.onResetBoard();
      }
    });
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.panelEl.hidden = !open;
    this.tabEl.classList.toggle("active", open);
  }

  /**
   * STEP_PROMPT_pacing_telegraph_preview.md: the auto-fire schedule is
   * genuinely live again (the real game's pacing loop, not dormant) — this
   * is a real countdown once more, same as before STEP_PROMPT_remove_
   * schedule_confirm_shadowing.md's testing-phase removal. Manually firing
   * from this panel still resets `nextCycloneAtTurn`/`nextFloodAtTurn` (via
   * `triggerCyclone`/`triggerFlood` themselves), so this readout stays
   * accurate regardless of which path actually fires next.
   */
  setScheduleInfo(stormTurnsUntil: number, floodTurnsUntil: number): void {
    const clampedStorm = Math.max(0, stormTurnsUntil);
    const clampedFlood = Math.max(0, floodTurnsUntil);
    this.stormSchedule.textContent = `next scheduled in ${clampedStorm} turn${clampedStorm === 1 ? "" : "s"}`;
    this.floodSchedule.textContent = `next scheduled in ${clampedFlood} turn${clampedFlood === 1 ? "" : "s"}`;
  }

  /** Verify checklist: the panel's own state doesn't need to persist across an era reset — closed/default-severity is fine and simpler than preserving it. */
  reset(): void {
    this.setOpen(false);
    this.stormSlider.value = String(DEFAULT_SEVERITY);
    this.stormReadout.textContent = `${DEFAULT_SEVERITY.toFixed(1)}×`;
    this.floodSlider.value = String(DEFAULT_SEVERITY);
    this.floodReadout.textContent = `${DEFAULT_SEVERITY.toFixed(1)}×`;
  }
}
