import { ActionRun, quarterLabel, type ActionOutcome, type RunEvent } from "@core/actionRun";
import type { GameState } from "@core/gameState";
import type { AxialCoord } from "@core/hex";
import type { Telemetry } from "@core/telemetry";
import type { LevelDef } from "@levels/levels";
import { ClockHud } from "@ui/panjim/clockHud";
import { OutlookBar } from "@ui/panjim/outlookBar";
import { CoinJar } from "@ui/panjim/coinJar";
import { VoicesPanel } from "@ui/panjim/voicesPanel";
import { FieldGuide } from "@ui/panjim/fieldGuide";
import { voiceProgress, describeVoiceGoal } from "@core/voices";
import { COMBO_INFO, type ComboId } from "@core/combos";
import { outlookFor, seaLevelCm, strengthIcons, challengeStrength, type ScheduledChallenge } from "@core/climate";
import { FRONTS, type ChallengeOutcome, type ZoneDef, type ZoneOutcome } from "@core/zones";
import { aftermathLine } from "@core/aftermath";
import type { RunSnapshot } from "@core/actionRun";
import { AftermathCard } from "@ui/panjim/aftermathCard";
import { FinaleCard } from "@ui/panjim/finaleCard";
import { computePanjimIndex, tempoBadge, type PanjimIndex } from "@core/panjimIndex";
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
export interface ChallengeFx {
  begin: (challenge: ScheduledChallenge) => void;
  /** One zone's moment: the water or wind reveals, its defences answer one at a time, failures fall, houses take damage. */
  zone: (zone: ZoneOutcome, outcome: ChallengeOutcome, slow: boolean, durationMs: number) => void;
  end: () => void;
}

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
  /** The run reached 2050 and the finale has played. */
  onRunComplete: (result: PanjimIndex) => void;
  /** The skyline reveal: the camera pulls back over the whole city. */
  revealSkyline: () => void;
  showBanner: (text: string, ms?: number) => void;
  /** Seed text for the challenge calendar: the level id, a daily id, or a `?seed=` replay. */
  seed: string;
  /** A challenge's Forecast just locked. */
  onForecastLock?: (challenge: ScheduledChallenge) => void;
  /** The board effects of a challenge, staged zone by zone (see `stageChallenge`). */
  challengeFx: ChallengeFx;
  /** Rebuilds every element's mesh from the game state, after a rewind or a resume. */
  redrawBoard: () => void;
  /** Adds a second button to the level brief ("Continue from Q3 2032"). */
  offerResume: (label: string, onResume: () => void) => void;
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
  /** Puts the Voices panel where the objectives list would be. */
  mountVoices: (el: HTMLElement) => void;
  /** Sparkle, ring and glow over tiles that just joined a combo. */
  celebrateCombo: (tiles: AxialCoord[]) => void;
}

/** Milliseconds per quarter tick: quick for a single action, slower for a visible time-lapse. */
const TICK_MS_ACTION = 170;
const TICK_MS_LAPSE = 420;

export class PanjimController {
  readonly run: ActionRun;
  private readonly clock: ClockHud;
  private readonly outlook: OutlookBar;
  private readonly jar: CoinJar;
  private readonly voicesPanel = new VoicesPanel();
  readonly fieldGuide: FieldGuide;
  private busy = false;
  /** A challenge that landed during the current time-lapse, staged once the clock stops. */
  private pendingChallenge: { challenge: ScheduledChallenge; outcome: ChallengeOutcome; failedIds: string[] } | null = null;
  /** The last readiness reading for each challenge before it landed, for telemetry. */
  private readonly readinessById = new Map<string, string>();
  private readonly aftermath: AftermathCard;
  private readonly finaleCard: FinaleCard;
  /** Real milliseconds played before this session, when resuming a save: the tempo badge counts the whole run. */
  playMsBefore = 0;
  /** The in-scene label over the locked Forecast's first zone: "Cyclone landfall ●●○". */
  private readonly forecastLabel: HTMLElement;
  private forecastAnchor: AxialCoord | null = null;

  constructor(private readonly host: PanjimHost) {
    if (!host.level.timeline) throw new Error("PanjimController needs a level timeline");
    this.run = new ActionRun(host.state, host.level.timeline, {
      climate: host.level.climate,
      seed: host.seed,
      zones: host.zones,
      voices: host.level.voices,
      houseStars: host.level.houseStars,
      houseRule: host.level.houses?.rule
    });
    host.container.classList.add("has-panjim-clock");
    this.clock = new ClockHud(host.container, {
      onFastForwardYear: () => void this.fastForwardYear(),
      onFastForwardEvent: () => void this.fastForwardEvent()
    });
    this.outlook = new OutlookBar(this.clock.outlookSlot);
    this.jar = new CoinJar(host.container, () => this.collectJar());
    host.mountVoices(this.voicesPanel.el);
    this.fieldGuide = new FieldGuide(host.container, () => host.telemetry.reward("species"));
    this.aftermath = new AftermathCard(host.container);
    this.finaleCard = new FinaleCard(host.container);
    this.offerSavedRun();
    this.forecastLabel = document.createElement("div");
    this.forecastLabel.className = "forecast-label";
    this.forecastLabel.hidden = true;
    host.container.appendChild(this.forecastLabel);
    this.clock.set(this.run.label, this.progress());
    this.renderOutlook();
    this.syncControls();
  }

  /** Banks the jar. Free: no quarter passes. */
  collectJar(): number {
    const coins = this.run.collectJar();
    if (coins > 0) {
      this.host.telemetry.reward("coin");
      this.host.refresh();
      this.host.container.querySelector(".coin-value")?.classList.remove("bump");
      void (this.host.container.querySelector(".coin-value") as HTMLElement | null)?.offsetWidth;
      this.host.container.querySelector(".coin-value")?.classList.add("bump");
    }
    return coins;
  }

  /** Creatures that just appeared under a tap go into the Field Guide. Free. */
  spotted(species: string[]): void {
    this.fieldGuide.spot(species);
  }

  private renderVoices(): void {
    this.voicesPanel.render(
      this.run.activeVoices().map((voice) => {
        const { current, target } = voiceProgress(voice.goal, this.host.state, this.run.zones, this.run.comboState);
        return { voice, current, target, progress: describeVoiceGoal(voice.goal, this.run.zones) };
      })
    );
  }

  /** Repaints the Outlook from the current quarter. */
  renderOutlook(): void {
    this.renderVoices();
    // A jar reads full at about two years of the current income, and never
    // below a small floor, so even a young city sees it fill.
    this.jar.render(this.run.jar, Math.max(60, this.run.incomePerQuarter * 8));
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
      results: new Map([...this.run.outcomes].map(([id, outcome]) => [id, outcome.stars]))
    });
    const readiness = this.run.readiness();
    if (readiness) this.readinessById.set(readiness.challenge.id, readiness.level);
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

  /**
   * The challenge, staged: each zone in turn gets its moment (the hazard
   * arrives, the defences there answer one at a time, a "Houses saved"
   * counter climbs), the zone with the biggest save plays in slow motion, then
   * the Aftermath card. A click hurries the staging along. The outcome itself
   * was decided the instant the challenge landed; this only shows it.
   */
  private async stageChallenge(challenge: ScheduledChallenge, outcome: ChallengeOutcome, failedIds: string[]): Promise<void> {
    const telemetry = this.host.telemetry;
    const readiness = this.readinessById.get(challenge.id) ?? null;
    telemetry.emit("challenge_start", { id: challenge.id, readiness });
    this.host.challengeFx.begin(challenge);
    const counter = document.createElement("div");
    counter.className = "houses-saved";
    counter.innerHTML = `<span class="houses-saved-label">Houses saved</span><span class="houses-saved-value">0</span>`;
    this.host.container.appendChild(counter);
    const valueEl = counter.querySelector(".houses-saved-value") as HTMLElement;

    let hurry = false;
    const abort = new AbortController();
    document.addEventListener("pointerdown", () => (hurry = true), { signal: abort.signal, capture: true });

    const biggest = outcome.zones.reduce((best, zone, index) => (zone.absorbed > (outcome.zones[best]?.absorbed ?? -1) ? index : best), 0);
    let saved = 0;
    try {
      await wait(500);
      for (const [index, zone] of outcome.zones.entries()) {
        const slow = index === biggest && zone.absorbed > 0 && !hurry;
        const duration = hurry ? 250 : slow ? 2600 : 1300;
        this.host.container.classList.toggle("slowmo", slow);
        this.host.challengeFx.zone(zone, outcome, slow, duration);
        const from = saved;
        saved += zone.housesInZone - zone.housesDamaged;
        await countUp(valueEl, from, saved, duration);
        if (zone.held) playSound("chime");
      }
    } finally {
      abort.abort();
      this.host.container.classList.remove("slowmo");
    }
    valueEl.textContent = String(outcome.housesSaved);
    await wait(hurry ? 100 : 500);
    this.host.challengeFx.end();
    counter.remove();
    this.renderOutlook();
    this.host.refresh();

    // Autosave after every challenge.
    const saveStart = performance.now();
    this.saveRun();
    telemetry.emit("checkpoint", { id: challenge.id, ms: Math.round(telemetry.elapsed()), saveMs: Math.round(performance.now() - saveStart) });
    telemetry.emit("challenge_end", { id: challenge.id, stars: outcome.stars, readiness, protection: Number(outcome.protection.toFixed(3)) });

    const lock = this.run.lockSnapshots.get(challenge.id);
    const choice = await this.aftermath.show({
      title: `${challenge.name} · ${this.labelFor(challenge.quarter)}`,
      stars: outcome.stars,
      housesSaved: outcome.housesSaved,
      housesDamaged: outcome.housesDamaged,
      line: this.run.zones ? aftermathLine(challenge.kind, outcome, this.host.state, this.run.zones, failedIds) : "",
      replayLabel: lock && !this.run.finished ? `Replay from the forecast (${this.labelFor(lock.quarter)})` : null
    });
    if (choice === "replay" && lock) this.rewindTo(lock, challenge);
  }

  /** Rewinds to a snapshot (a forecast lock), redraws the board and re-shows that forecast. Measured: it must stay well under 3 s. */
  private rewindTo(snapshot: RunSnapshot, challenge: ScheduledChallenge): void {
    const start = performance.now();
    this.run.restore(snapshot);
    this.host.redrawBoard();
    this.showForecast(challenge);
    this.clock.set(this.run.label, this.progress());
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
    this.host.telemetry.emit("checkpoint", { rewind: challenge.id, ms: Math.round(performance.now() - start) });
    this.host.showBanner(`Back to ${this.run.label}. The forecast is locked: ${challenge.name} in ${this.labelFor(challenge.quarter)}.`, 4500);
  }

  /** Real milliseconds played on this run, across any resume. */
  playMs(): number {
    return this.playMsBefore + this.host.telemetry.elapsed();
  }

  /** The Panjim 2050 index as the run stands now. */
  result(): PanjimIndex {
    return computePanjimIndex({
      state: this.host.state,
      outcomes: this.run.schedule.map((c) => this.run.outcomes.get(c.id)).filter((o): o is ChallengeOutcome => o !== undefined),
      incomePerQuarter: this.run.incomePerQuarter,
      coinMultiplier: this.run.config.economy?.coinMultiplier
    });
  }

  /** 2050: the skyline reveal, the title, then the finale card; then the shell's results. */
  private async finale(): Promise<void> {
    this.busy = true;
    this.syncControls();
    const result = this.result();
    this.host.revealSkyline();
    await this.finaleCard.title();
    await this.finaleCard.show({
      index: result,
      challengeNames: this.run.schedule.map((c) => c.name),
      tempo: tempoBadge(this.playMs()),
      seed: this.host.seed
    });
    this.host.onRunComplete(result);
  }

  // ---- autosave -----------------------------------------------------------

  private saveKey(): string {
    return `riptide-rising:panjim2050:v1:${this.host.level.id}:${this.host.seed}`;
  }

  /** Writes the run to this device: the board, every forecast-lock snapshot (so Replay survives a reload), and real time played. */
  saveRun(): void {
    try {
      localStorage.setItem(
        this.saveKey(),
        JSON.stringify({
          snapshot: this.run.snapshot(),
          locks: [...this.run.lockSnapshots],
          playMs: this.playMsBefore + this.host.telemetry.elapsed(),
          savedAt: new Date().toISOString()
        })
      );
    } catch {
      // Storage full or blocked: the run carries on unsaved.
    }
  }

  clearSave(): void {
    try {
      localStorage.removeItem(this.saveKey());
    } catch {
      // Nothing to clear.
    }
  }

  /** On load: if this level and seed have a save part-way through, the brief offers to continue it. */
  private offerSavedRun(): void {
    let saved: { snapshot: RunSnapshot; locks: [string, RunSnapshot][]; playMs: number } | null = null;
    try {
      const raw = localStorage.getItem(this.saveKey());
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    if (!saved || saved.snapshot?.version !== 1 || saved.snapshot.quarter >= this.run.totalQuarters) return;
    const label = quarterLabel(saved.snapshot.quarter, this.run.config.startYear);
    const data = saved;
    this.host.offerResume(`Continue from ${label}`, () => {
      this.run.restore(data.snapshot);
      for (const [id, lock] of data.locks) this.run.lockSnapshots.set(id, lock);
      this.playMsBefore = data.playMs ?? 0;
      this.host.redrawBoard();
      const next = this.run.nextChallenge();
      if (next && this.run.locked.has(next.id)) this.showForecast(next);
      this.clock.set(this.run.label, this.progress());
      this.renderOutlook();
      this.host.refresh();
      this.syncControls();
    });
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
    this.noteBoard();
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

  /** Element ids by tile as they stood before the current action, so a structure the resolver removed can still be named. */
  private preChallengeIds = new Map<string, string>();

  private noteBoard(): void {
    this.preChallengeIds = new Map([...this.host.state.elements].map(([key, inst]) => [key, inst.elementId]));
  }

  build(coord: AxialCoord, elementId: string): boolean {
    if (this.busy) return false;
    this.noteBoard();
    const outcome = this.run.build(coord, elementId);
    if (!outcome.ok) return false;
    this.host.placeElement(coord, elementId);
    this.host.telemetry.action("build", outcome.quarters);
    void this.play(outcome, TICK_MS_ACTION);
    return true;
  }

  demolish(coord: AxialCoord): boolean {
    if (this.busy) return false;
    this.noteBoard();
    const outcome = this.run.demolish(coord);
    if (!outcome.ok) return false;
    this.host.removeElementVisual(coord);
    this.host.telemetry.action("demolish", outcome.quarters);
    void this.play(outcome, TICK_MS_ACTION);
    return true;
  }

  async fastForwardYear(): Promise<void> {
    if (this.busy) return;
    this.noteBoard();
    const outcome = this.run.fastForwardYear();
    if (!outcome.ok) return;
    this.host.telemetry.action("fast_forward_year", outcome.quarters);
    this.host.telemetry.emit("fast_forward", { quarters: outcome.quarters });
    await this.play(outcome, TICK_MS_LAPSE);
  }

  /** Skips to one quarter before the next challenge, as a time-lapse. */
  async fastForwardEvent(): Promise<void> {
    if (this.busy) return;
    this.noteBoard();
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
      else if (steps.length > 0) steps[steps.length - 1].extra.push(event);
      else this.handleEvent(event);
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
      const pending = this.pendingChallenge;
      this.pendingChallenge = null;
      if (pending) await this.stageChallenge(pending.challenge, pending.outcome, pending.failedIds);
    } finally {
      this.busy = false;
    }
    this.clock.set(this.run.label, this.progress());
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
    if (this.run.finished) {
      this.clearSave();
      await this.finale();
    }
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
        if (event.outcome) {
          // Which kinds of thing failed, read before the meshes go: the
          // resolver has already removed them from the game state.
          const failedIds = event.outcome.zones.flatMap((zone) => zone.failed).map((key) => this.preChallengeIds.get(key) ?? "");
          this.pendingChallenge = { challenge: event.challenge, outcome: event.outcome, failedIds };
        }
        break;
      }
      case "combo": {
        const info = COMBO_INFO[event.combo as ComboId];
        playSound("combo");
        this.host.celebrateCombo(event.tiles.map((key) => {
          const [q, r] = key.split(",").map(Number);
          return { q, r };
        }));
        this.host.showBanner(`${info.name}! +${info.bonus} defence on each of its ${event.all.length} tiles`, 3800);
        this.host.telemetry.reward("combo");
        break;
      }
      case "voice_complete": {
        playSound("coin");
        window.setTimeout(() => playSound("chime"), 180);
        this.voicesPanel.answer(event.voice);
        this.host.telemetry.emit("request_complete", { id: event.voice.id, reward: event.reward });
        this.host.telemetry.reward("request");
        break;
      }
      case "voice_new": {
        this.host.showBanner(`New voices from Panjim: ${event.voices.length} requests`, 3500);
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
      case "voices": {
        // Answer the Miramar fisherman (two dunes), then a mangrove belt by
        // the Ourem creek, which also answers Fontainhas.
        for (let i = 0; i < 2; i++) {
          const dune = this.firstBuildableIn("z1", "dune");
          if (dune) this.build(dune, "dune");
          await this.idle();
        }
        let last = this.firstBuildableIn("z3", "mangrove");
        for (let i = 0; i < 3 && last; i++) {
          this.build(last, "mangrove");
          await this.idle();
          last = this.firstBuildable("mangrove", last);
        }
        this.spotted(["kingfisher", "egret"]);
        return true;
      }
      case "guide": {
        this.fieldGuide.open();
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
        // Some beach defences first, so the staging has something to show.
        for (let i = 0; i < 6; i++) {
          const coord = this.firstBuildableIn("z1", i % 2 === 0 ? "dune" : "sandy_vegetation");
          if (coord) this.build(coord, i % 2 === 0 ? "dune" : "sandy_vegetation");
          await this.idle();
        }
        await this.fastForwardEvent();
        await this.idle();
        // Not awaited: the fast-forward waits on the Aftermath's buttons.
        void this.fastForwardYear();
        while (!this.aftermath.isOpen) await wait(100);
        await wait(1800); // the stars fill
        return true;
      }
      case "stage": {
        // The same as "challenge", but handed back mid-staging, so the shot
        // catches the Houses saved counter and the slow-motion save.
        for (let i = 0; i < 6; i++) {
          const coord = this.firstBuildableIn("z1", i % 2 === 0 ? "dune" : "sandy_vegetation");
          if (coord) this.build(coord, i % 2 === 0 ? "dune" : "sandy_vegetation");
          await this.idle();
        }
        for (let i = 0; i < 4; i++) {
          const house = this.firstBuildableIn("z2", "house");
          if (house) this.build(house, "house");
          await this.idle();
        }
        await this.fastForwardEvent();
        await this.idle();
        void this.fastForwardYear();
        while (!this.host.container.querySelector(".houses-saved")) await wait(50);
        return true;
      }
      case "finale": {
        // Plays the whole run on fast-forward, accepting each Aftermath,
        // and hands back at the finale card.
        while (!this.run.finished) {
          void this.fastForwardYear();
          await wait(60);
          while (this.busy) {
            const cont = this.host.container.querySelector<HTMLButtonElement>(".aftermath-continue");
            if (this.aftermath.isOpen && cont) cont.click();
            if (this.host.container.querySelector(".finale-card")) return true;
            await wait(100);
          }
        }
        while (!this.host.container.querySelector(".finale-card")) await wait(100);
        return true;
      }
      case "smart-forecast":
        await this.playCarefully(() => this.run.locked.size > 0 && this.isGreenOrBroke());
        return true;
      case "smart-aftermath":
        await this.playCarefully(() => this.aftermath.isOpen, true);
        await wait(1800);
        return true;
      case "smart-finale":
        await this.playCarefully(() => Boolean(this.host.container.querySelector(".finale-card")));
        return true;
      case "replay": {
        const replay = this.host.container.querySelector<HTMLButtonElement>(".aftermath-replay");
        if (!replay) return false;
        replay.click();
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

  /** True once the next challenge's gauge is green, or nothing more is affordable. */
  private isGreenOrBroke(): boolean {
    const readiness = this.run.readiness();
    return !readiness || readiness.level === "green" || this.host.state.coin < 15;
  }

  /**
   * A careful player, scripted, for the browser's final check: taps the jar,
   * tops up the threatened zones until the gauge is green (dunes and pandanus
   * on the beach, mangroves and khazan in the wetlands and on the
   * waterfront), keeps a few houses away from the storm paths, then skips to
   * the next event. Uses only the actions a player has; continues through
   * each Aftermath. Stops when `until` is true (checked between actions, and
   * while an Aftermath is open when `stopAtAftermath`).
   */
  private async playCarefully(until: () => boolean, stopAtAftermath = false): Promise<void> {
    const wishes: Record<string, [string, string][]> = {
      cyclone: [["z1", "dune"], ["z1", "sandy_vegetation"], ["z1", "mangrove"], ["z2", "mangrove"]],
      flood: [["z2", "mangrove"], ["z2", "khazan"], ["z3", "mangrove"], ["z4", "mangrove"]],
      compound: [["z4", "mangrove"], ["z2", "mangrove"], ["z2", "khazan"], ["z3", "mangrove"]]
    };
    for (let guard = 0; guard < 600 && !this.run.finished; guard++) {
      if (until()) return;
      this.collectJar();
      let acted = false;
      for (const [key, inst] of this.host.state.elements) {
        if (inst.degradeAmount > 0 && this.host.state.coin >= this.run.repairCoin({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) })) {
          const [q, r] = key.split(",").map(Number);
          acted = this.repair({ q, r });
          if (acted) break;
        }
      }
      const readiness = this.run.readiness();
      if (!acted && readiness && readiness.level !== "green") {
        for (const [zone, element] of wishes[readiness.challenge.kind]) {
          const coord = this.firstBuildableIn(zone, element);
          if (coord && this.build(coord, element)) {
            acted = true;
            break;
          }
        }
      }
      const houses = [...this.host.state.elements.values()].filter((inst) => inst.elementId === "house").length;
      if (!acted && houses < 8) {
        for (const tile of this.host.state.placed.values()) {
          const key = `${tile.coord.q},${tile.coord.r}`;
          if (this.run.zones?.zoneOf(key)) continue;
          if (this.host.state.canBuild(tile.coord, "house") && this.build(tile.coord, "house")) {
            acted = true;
            break;
          }
        }
      }
      if (!acted) {
        // Nothing to do: skip ahead.
        if (this.run.quartersToNextEvent() > 0) void this.fastForwardEvent();
        else void this.fastForwardYear();
      }
      // Wait for the action to play out, answering any Aftermath it brings:
      // a storm can land on a build's quarter just as on a fast-forward's.
      await wait(60);
      while (this.busy) {
        if (this.aftermath.isOpen) {
          if (stopAtAftermath && until()) return;
          this.host.container.querySelector<HTMLButtonElement>(".aftermath-continue")?.click();
        }
        if (until()) return;
        await wait(100);
      }
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
    this.finaleCard.dispose();
    this.aftermath.dispose();
    this.jar.dispose();
    this.fieldGuide.dispose();
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Counts `el` up from `from` to `to` over `ms`. */
async function countUp(el: HTMLElement, from: number, to: number, ms: number): Promise<void> {
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / ms);
      el.textContent = String(Math.round(from + (to - from) * t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
