import { ActionRun, quarterLabel, type ActionOutcome, type RunEvent } from "@core/actionRun";
import type { GameState } from "@core/gameState";
import type { AxialCoord } from "@core/hex";
import type { Telemetry } from "@core/telemetry";
import type { LevelDef } from "@levels/levels";
import { ClockHud } from "@ui/panjim/clockHud";
import { OutlookBar } from "@ui/panjim/outlookBar";
import { outlookFor, seaLevelCm, strengthIcons, challengeStrength, type ScheduledChallenge } from "@core/climate";
import { FRONTS, type ChallengeOutcome, type ZoneDef } from "@core/zones";
import { axialToWorld } from "@core/hex";
import { ELEMENT_BY_ID } from "@core/elements";
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
  /** A challenge landed and resolved. */
  onChallenge?: (challenge: ScheduledChallenge, outcome: ChallengeOutcome | null) => void;
  /** The map's challenge zones. */
  zones: readonly ZoneDef[];
  /** Shows the locked Forecast's path as a translucent in-scene overlay: each tile with a 0–1 weight (first zone strongest). */
  showForecastZones: (tiles: { coord: AxialCoord; weight: number }[]) => void;
  clearForecastZones: () => void;
  /** Projects a board coordinate to screen pixels in the container, for the in-scene strength label. */
  project: (coord: AxialCoord) => { x: number; y: number } | null;
  /** Restores a repaired element's look. */
  repairVisual: (coord: AxialCoord) => void;
  /** The map's opening focus: the in-scene label anchors on the threatened tile nearest it, so it starts on screen. */
  focus: AxialCoord;
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
  /** The in-scene label over the locked Forecast's first zone: "Cyclone landfall ●●○". */
  private readonly forecastLabel: HTMLElement;
  private forecastAnchor: AxialCoord | null = null;

  constructor(private readonly host: PanjimHost) {
    if (!host.level.timeline) throw new Error("PanjimController needs a level timeline");
    this.run = new ActionRun(host.state, host.level.timeline, { climate: host.level.climate, seed: host.seed, zones: host.zones });
    host.container.classList.add("has-panjim-clock");
    this.clock = new ClockHud(host.container, {
      onFastForwardYear: () => void this.fastForwardYear(),
      onFastForwardEvent: () => void this.fastForwardEvent()
    });
    this.outlook = new OutlookBar(this.clock.outlookSlot);
    this.forecastLabel = document.createElement("div");
    this.forecastLabel.className = "forecast-label";
    this.forecastLabel.hidden = true;
    host.container.appendChild(this.forecastLabel);
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
      outlooks: this.run.schedule.map((challenge) => {
        const outlook = outlookFor(climate, challenge, this.run.quarter, startYear);
        // A challenge that has landed is behind the player, even on its own quarter.
        return this.run.landed.has(challenge.id) ? { ...outlook, phase: "past" as const } : outlook;
      }),
      seaLevelCm: seaLevelCm(climate, this.run.quarter),
      results: this.results
    });
    const readiness = this.run.readiness();
    this.outlook.renderGauge(
      readiness
        ? {
            level: readiness.level,
            stars: readiness.outcome.stars,
            protection: readiness.outcome.protection,
            exact: this.run.locked.has(readiness.challenge.id),
            growing: this.growingIn(readiness.challenge)
          }
        : null
    );
  }

  /** Defences in the challenge's zones that have not reached full strength yet. */
  private growingIn(challenge: ScheduledChallenge): number {
    if (!this.run.zones) return 0;
    let count = 0;
    for (const front of FRONTS[challenge.kind]) {
      for (const zoneId of front.path) {
        for (const key of this.run.zones.keys(zoneId)) {
          const inst = this.host.state.elements.get(key);
          const def = inst ? ELEMENT_BY_ID.get(inst.elementId) : undefined;
          if (inst && def && (def.matureQuarters ?? 0) > 0 && this.host.state.maturityFraction(inst, def) < 1) count++;
        }
      }
    }
    return count;
  }

  /** Draws the locked Forecast in the scene: the path's zones, the first one strongest, and the strength label over it. */
  private showForecast(challenge: ScheduledChallenge): void {
    if (!this.run.zones || !this.run.climate) return;
    const tiles: { coord: AxialCoord; weight: number }[] = [];
    const seen = new Set<string>();
    for (const front of FRONTS[challenge.kind]) {
      front.path.forEach((zoneId, index) => {
        for (const key of this.run.zones!.keys(zoneId)) {
          if (seen.has(key)) continue;
          seen.add(key);
          const [q, r] = key.split(",").map(Number);
          tiles.push({ coord: { q, r }, weight: Math.max(0.35, 1 - index * 0.3) });
        }
      });
    }
    this.host.showForecastZones(tiles);
    const firstZone = FRONTS[challenge.kind][0].path[0];
    this.forecastAnchor = nearestTo(this.run.zones.keys(firstZone), this.host.focus);
    const icons = strengthIcons(challengeStrength(this.run.climate, challenge));
    const what = challenge.kind === "cyclone" ? "Cyclone landfall" : challenge.kind === "flood" ? "Flood rises here" : "Surge and flood meet here";
    this.forecastLabel.innerHTML = `<b>${what}</b> <span class="forecast-strength">${"●".repeat(icons)}${"○".repeat(3 - icons)}</span><span class="forecast-when">${this.labelFor(challenge.quarter)}</span>`;
    this.forecastLabel.hidden = false;
  }

  private clearForecast(): void {
    this.host.clearForecastZones();
    this.forecastAnchor = null;
    this.forecastLabel.hidden = true;
  }

  /** Called every rendered frame: keeps the in-scene Forecast label over its zone. */
  frame(): void {
    if (!this.forecastAnchor || this.forecastLabel.hidden) return;
    const screen = this.host.project(this.forecastAnchor);
    if (!screen) return;
    // Kept inside the view (clear of the clock and the bottom bar), so a
    // camera that has wandered off still sees where the storm is headed.
    const rect = this.host.container.getBoundingClientRect();
    const x = Math.min(rect.width - 140, Math.max(140, screen.x));
    const y = Math.min(rect.height - 70, Math.max(230, screen.y));
    this.forecastLabel.classList.toggle("offscreen", x !== screen.x || y !== screen.y);
    this.forecastLabel.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -120%)`;
  }

  /** Repair a worn defence or damaged house: one quarter and part of its cost. */
  repair(coord: AxialCoord): boolean {
    if (this.busy) return false;
    const outcome = this.run.repair(coord);
    if (!outcome.ok) {
      if (outcome.reason) this.host.showBanner(outcome.reason, 2000);
      return false;
    }
    this.host.repairVisual(coord);
    this.host.telemetry.action("repair", outcome.quarters);
    void this.play(outcome, TICK_MS_ACTION);
    return true;
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
        this.showForecast(event.challenge);
        this.host.onForecastLock?.(event.challenge);
        break;
      }
      case "challenge": {
        playSound("hazard_arrival");
        this.clearForecast();
        if (event.outcome) this.results.set(event.challenge.id, event.outcome.stars);
        this.host.onChallenge?.(event.challenge, event.outcome);
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
        // Up to the lock (two years out), then a few beach defences, so the
        // overlay, the label and the gauge all have something to show.
        const next = this.run.nextChallenge();
        if (!next || !this.run.climate) return false;
        while (this.run.quarter < next.quarter - this.run.climate.forecastLockQuarters) {
          await this.fastForwardYear();
          await this.idle();
        }
        for (let i = 0; i < 4; i++) {
          const coord = this.firstBuildableIn("z1", "dune");
          if (!coord) break;
          this.build(coord, "dune");
          await this.idle();
        }
        return true;
      }
      case "growth": {
        // A mangrove belt and a dune line planted now, then six years of
        // time-lapse, photographed partway so young and grown both show.
        for (let i = 0; i < 5; i++) {
          const mangrove = this.firstBuildableIn("z4", "mangrove");
          if (mangrove) this.build(mangrove, "mangrove");
          await this.idle();
        }
        for (let i = 0; i < 3; i++) {
          const house = this.firstBuildable("house", this.host.focus);
          if (house) this.build(house, "house");
          await this.idle();
        }
        for (let year = 0; year < 3; year++) {
          await this.fastForwardYear();
          await this.idle();
        }
        return true;
      }
      case "challenge": {
        await this.fastForwardEvent();
        await this.idle();
        await this.fastForwardYear();
        await this.idle();
        await new Promise((resolve) => window.setTimeout(resolve, 3500));
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

  /** The first tile in `zoneId` where `elementId` can be built now. */
  firstBuildableIn(zoneId: string, elementId: string): AxialCoord | null {
    for (const key of this.run.zones?.keys(zoneId) ?? []) {
      const [q, r] = key.split(",").map(Number);
      if (this.host.state.canBuild({ q, r }, elementId)) return { q, r };
    }
    return null;
  }

  /** Resolves once no time-lapse is playing. */
  async idle(): Promise<void> {
    while (this.busy) await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  dispose(): void {
    this.forecastLabel.remove();
    this.clock.dispose();
    this.host.container.classList.remove("has-panjim-clock");
  }
}

/** The tile in `keys` nearest `target`, for anchoring a label where the player is already looking. */
function nearestTo(keys: string[], target: AxialCoord): AxialCoord | null {
  let best: AxialCoord | null = null;
  let bestDistance = Infinity;
  const goal = axialToWorld(target, 1);
  for (const key of keys) {
    const [q, r] = key.split(",").map(Number);
    const world = axialToWorld({ q, r }, 1);
    const distance = (world.x - goal.x) ** 2 + (world.z - goal.z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { q, r };
    }
  }
  return best;
}
