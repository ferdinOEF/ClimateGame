import { ActionRun, quarterLabel, type ActionOutcome, type RunEvent } from "@core/actionRun";
import type { GameState } from "@core/gameState";
import type { AxialCoord } from "@core/hex";
import type { Telemetry } from "@core/telemetry";
import type { LevelDef } from "@levels/levels";
import { ClockHud } from "@ui/panjim/clockHud";
import { OutlookBar } from "@ui/panjim/outlookBar";
import { outlookFor, seaLevelCm, type ScheduledChallenge } from "@core/climate";
import { playSound } from "@ui/audioHooks";

/**
 * The Panjim 2050 run inside a live session.
 *
 * `ActionRun` (core) owns the rules: what an action costs and what happens
 * as each quarter passes. This owns the presentation: the clock ticking, the
 * time-lapse, and telling the session when the board changed. The session
 * calls in here instead of `state.build()` when the level's time model is
 * `"actions"`; on the tutorial this class is never constructed.
 */
export interface PanjimHost {
  container: HTMLElement;
  state: GameState;
  level: LevelDef;
  telemetry: Telemetry;
  /** Draws a just-built element (animated). */
  placeElement: (coord: AxialCoord, elementId: string) => void;
  /** Removes an element's mesh. */
  removeElementVisual: (coord: AxialCoord) => void;
  /** Repaints the HUD after state changed. */
  refresh: () => void;
  /** The run reached 2050. */
  onRunComplete: () => void;
  showBanner: (text: string, ms?: number) => void;
  /** Seed text for the challenge calendar: the level id, a daily id, or a `?seed=` replay. */
  seed: string;
  /** A challenge's Forecast just locked. */
  onForecastLock?: (challenge: ScheduledChallenge) => void;
  /** A challenge landed. */
  onChallenge?: (challenge: ScheduledChallenge) => void;
}

/** Milliseconds per quarter tick: quick for a single action, slower for a visible time-lapse. */
const TICK_MS_ACTION = 170;
const TICK_MS_LAPSE = 420;

export class PanjimController {
  readonly run: ActionRun;
  private readonly clock: ClockHud;
  private readonly outlook: OutlookBar;
  /** Stars per landed challenge, shown on the Outlook. */
  readonly results = new Map<string, number>();
  private busy = false;

  constructor(private readonly host: PanjimHost) {
    if (!host.level.timeline) throw new Error("PanjimController needs a level timeline");
    this.run = new ActionRun(host.state, host.level.timeline, { climate: host.level.climate, seed: host.seed });
    host.container.classList.add("has-panjim-clock");
    this.clock = new ClockHud(host.container, {
      onFastForwardYear: () => void this.fastForwardYear(),
      onFastForwardEvent: () => void this.fastForwardEvent()
    });
    this.outlook = new OutlookBar(this.clock.outlookSlot);
    this.clock.set(this.run.label, this.progress());
    this.renderOutlook();
    this.syncControls();
  }

  /** Repaints the Outlook from the current quarter. */
  renderOutlook(): void {
    const climate = this.run.climate;
    if (!climate) return;
    const startYear = this.run.config.startYear;
    this.outlook.render({
      startYear,
      endYear: this.run.config.endYear,
      now: this.run.year,
      outlooks: this.run.schedule.map((challenge) => outlookFor(climate, challenge, this.run.quarter, startYear)),
      seaLevelCm: seaLevelCm(climate, this.run.quarter),
      results: this.results
    });
  }

  /** Quarters a build of this element spends, for the popover. */
  buildQuarters(elementId: string): number {
    return this.run.buildCost(elementId);
  }

  /** True while a time-lapse plays: the board waits for it rather than queueing actions behind it. */
  get isBusy(): boolean {
    return this.busy;
  }

  build(coord: AxialCoord, elementId: string): boolean {
    if (this.busy) return false;
    const outcome = this.run.build(coord, elementId);
    if (!outcome.ok) return false;
    this.host.placeElement(coord, elementId);
    this.host.telemetry.action("build", outcome.quarters);
    void this.play(outcome, TICK_MS_ACTION);
    return true;
  }

  demolish(coord: AxialCoord): boolean {
    if (this.busy) return false;
    const outcome = this.run.demolish(coord);
    if (!outcome.ok) return false;
    this.host.removeElementVisual(coord);
    this.host.telemetry.action("demolish", outcome.quarters);
    void this.play(outcome, TICK_MS_ACTION);
    return true;
  }

  async fastForwardYear(): Promise<void> {
    if (this.busy) return;
    const outcome = this.run.fastForwardYear();
    if (!outcome.ok) return;
    this.host.telemetry.action("fast_forward_year", outcome.quarters);
    this.host.telemetry.emit("fast_forward", { quarters: outcome.quarters });
    await this.play(outcome, TICK_MS_LAPSE);
  }

  /** Skips to one quarter before the next challenge, as a time-lapse. */
  async fastForwardEvent(): Promise<void> {
    if (this.busy) return;
    const outcome = this.run.fastForwardToNextEvent();
    if (!outcome.ok) return;
    this.host.telemetry.action("fast_forward_event", outcome.quarters);
    this.host.telemetry.emit("fast_forward", { quarters: outcome.quarters, toEvent: true });
    await this.play(outcome, outcome.quarters > 8 ? TICK_MS_LAPSE * 0.6 : TICK_MS_LAPSE);
  }

  /** Animates an action's quarter ticks, then repaints and checks for the end of the run. */
  private async play(outcome: ActionOutcome, stepMs: number): Promise<void> {
    // One step per quarter; the forecast and challenge events that happened
    // in that quarter ride along with it, so they fire as its tick shows.
    const steps: { quarter: number; extra: RunEvent[] }[] = [];
    for (const event of outcome.events) {
      if (event.type === "quarter") steps.push({ quarter: event.quarter, extra: [] });
      else steps[steps.length - 1]?.extra.push(event);
    }
    this.busy = true;
    this.syncControls();
    const handled = new Set<number>();
    const handleStep = (index: number): void => {
      // A skip jumps to the last step; run every step's events up to it, once.
      for (let i = 0; i <= index; i++) {
        if (handled.has(i)) continue;
        handled.add(i);
        for (const event of steps[i].extra) this.handleEvent(event);
      }
      this.renderOutlook();
      this.host.refresh();
    };
    try {
      await this.clock.timeLapse(
        steps.map((step) => ({ label: this.labelFor(step.quarter), progress: step.quarter / this.run.totalQuarters })),
        stepMs,
        handleStep
      );
    } finally {
      this.busy = false;
    }
    this.clock.set(this.run.label, this.progress());
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
    if (this.run.finished) this.host.onRunComplete();
  }

  private handleEvent(event: RunEvent): void {
    switch (event.type) {
      case "forecast_lock": {
        playSound("hazard_telegraph");
        this.outlook.pulse();
        this.host.showBanner(`Forecast locked: ${event.challenge.name} in ${this.labelFor(event.challenge.quarter)}`, 4200);
        this.host.onForecastLock?.(event.challenge);
        break;
      }
      case "challenge": {
        playSound("hazard_arrival");
        this.host.onChallenge?.(event.challenge);
        break;
      }
      case "quarter":
        break;
    }
  }

  private labelFor(quarter: number): string {
    return quarter >= this.run.totalQuarters ? `${this.run.config.endYear}` : quarterLabel(quarter, this.run.config.startYear);
  }

  private progress(): number {
    return this.run.quarter / this.run.totalQuarters;
  }

  private syncControls(): void {
    const open = !this.busy && !this.run.finished;
    const toEvent = this.run.quartersToNextEvent();
    const next = this.run.nextChallenge();
    this.clock.setControlsEnabled(
      open,
      open && toEvent > 0,
      next ? `Skip ${toEvent} quarter${toEvent === 1 ? "" : "s"}, to just before the ${next.name.toLowerCase()}` : "No storm left to skip to"
    );
  }

  /**
   * Test-only scenarios for tools/phaseShots.ts: puts the board in a state
   * worth photographing. Uses the same actions a player has.
   */
  async scenario(name: string): Promise<boolean> {
    switch (name) {
      case "forecast": {
        await this.fastForwardEvent();
        await this.idle();
        return true;
      }
      case "actions": {
        for (const elementId of ["dune", "mangrove", "house", "seawall"]) {
          const coord = this.firstBuildable(elementId);
          if (coord) {
            this.build(coord, elementId);
            await this.idle();
          }
        }
        await this.fastForwardYear();
        return true;
      }
      default:
        return false;
    }
  }

  /** The first tile, in map order, where `elementId` can be built now. */
  firstBuildable(elementId: string, preferNear?: AxialCoord): AxialCoord | null {
    let best: AxialCoord | null = null;
    let bestDistance = Infinity;
    for (const tile of this.host.state.placed.values()) {
      if (!this.host.state.canBuild(tile.coord, elementId)) continue;
      if (!preferNear) return tile.coord;
      const dq = tile.coord.q - preferNear.q;
      const dr = tile.coord.r - preferNear.r;
      const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = tile.coord;
      }
    }
    return best;
  }

  /** Resolves once no time-lapse is playing. */
  async idle(): Promise<void> {
    while (this.busy) await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  dispose(): void {
    this.clock.dispose();
    this.host.container.classList.remove("has-panjim-clock");
  }
}
