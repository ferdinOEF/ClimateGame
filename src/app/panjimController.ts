import { ActionRun, quarterLabel, type ActionOutcome, type RunEvent } from "@core/actionRun";
import type { GameState } from "@core/gameState";
import type { AxialCoord } from "@core/hex";
import type { Telemetry } from "@core/telemetry";
import type { LevelDef } from "@levels/levels";
import { ClockHud } from "@ui/panjim/clockHud";

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
}

/** Milliseconds per quarter tick: quick for a single action, slower for a visible time-lapse. */
const TICK_MS_ACTION = 170;
const TICK_MS_LAPSE = 420;

export class PanjimController {
  readonly run: ActionRun;
  private readonly clock: ClockHud;
  private busy = false;

  constructor(private readonly host: PanjimHost) {
    if (!host.level.timeline) throw new Error("PanjimController needs a level timeline");
    this.run = new ActionRun(host.state, host.level.timeline);
    host.container.classList.add("has-panjim-clock");
    this.clock = new ClockHud(host.container, {
      onFastForwardYear: () => void this.fastForwardYear(),
      onFastForwardEvent: () => void this.fastForwardEvent()
    });
    this.clock.set(this.run.label, this.progress());
    this.syncControls();
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

  /** Skips to one quarter before the next challenge window. Wired up with the schedule (P2). */
  async fastForwardEvent(): Promise<void> {
    // No schedule yet: nothing to skip to.
  }

  /** Animates an action's quarter ticks, then repaints and checks for the end of the run. */
  private async play(outcome: ActionOutcome, stepMs: number): Promise<void> {
    const ticks = outcome.events.filter((e): e is Extract<RunEvent, { type: "quarter" }> => e.type === "quarter");
    this.busy = true;
    this.syncControls();
    try {
      await this.clock.timeLapse(
        ticks.map((tick) => ({ label: this.labelFor(tick.quarter), progress: tick.quarter / this.run.totalQuarters })),
        stepMs,
        () => this.host.refresh()
      );
    } finally {
      this.busy = false;
    }
    this.clock.set(this.run.label, this.progress());
    this.host.refresh();
    this.syncControls();
    if (this.run.finished) this.host.onRunComplete();
  }

  private labelFor(quarter: number): string {
    return quarter >= this.run.totalQuarters ? `${this.run.config.endYear}` : quarterLabel(quarter, this.run.config.startYear);
  }

  private progress(): number {
    return this.run.quarter / this.run.totalQuarters;
  }

  private syncControls(): void {
    const open = !this.busy && !this.run.finished;
    this.clock.setControlsEnabled(open, false, "No challenge on the horizon yet");
  }

  /**
   * Test-only scenarios for tools/phaseShots.ts: puts the board in a state
   * worth photographing. Uses the same actions a player has.
   */
  async scenario(name: string): Promise<boolean> {
    switch (name) {
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
