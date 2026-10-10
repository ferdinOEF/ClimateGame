import { ActionRun, quarterLabel, type ActionOutcome, type RunEvent } from "@core/actionRun";
import type { GameState } from "@core/gameState";
import { FrameSampler, autoStep, nextChoice, type Quality, type QualityChoice } from "@core/quality";
import type { StormRecord } from "@core/stormRecord";
import { drawStormCard, type StormCardInput } from "@ui/panjim/stormCard";
import { DEFENCE_PLURAL, replaySteps } from "@core/stormReplay";
import { ReplayCard } from "@ui/panjim/replayCard";
import { setSoundEnabled, setSoundVolume, soundVolume } from "@ui/audioHooks";
import type { AxialCoord } from "@core/hex";
import type { Telemetry } from "@core/telemetry";
import type { LevelDef } from "@levels/levels";
import { ClockHud } from "@ui/panjim/clockHud";
import { OutlookBar } from "@ui/panjim/outlookBar";
import { CoinJar } from "@ui/panjim/coinJar";
import { GetReadyPanel } from "@ui/panjim/getReady";
import { prepProgress } from "@core/prep";
import { FieldGuide } from "@ui/panjim/fieldGuide";
import { COMBO_INFO, type ComboId } from "@core/combos";
import { outlookFor, seaLevelCm, strengthIcons, challengeStrength, type ScheduledChallenge } from "@core/climate";
import { FRONTS, type ChallengeOutcome, type ZoneDef, type ZoneOutcome } from "@core/zones";
import { aftermathLine, topDefenceLine } from "@core/aftermath";
import { HousesCounter } from "@ui/panjim/housesCounter";
import type { RunSnapshot } from "@core/actionRun";
import { AftermathCard } from "@ui/panjim/aftermathCard";
import { FinaleCard } from "@ui/panjim/finaleCard";
import { computePanjimIndex, tempoBadge, type PanjimIndex } from "@core/panjimIndex";
import { axialToWorld } from "@core/hex";
import { ELEMENT_BY_ID } from "@core/elements";
import { playSound } from "@ui/audioHooks";
import { buildHeatView, hazardsOf, HEAT_LEAD_QUARTERS, type Exposure, type HeatViewTile } from "@core/exposure";
import { RiskIntroGate, riskIntroMode, type RiskIntroMode } from "@core/riskIntro";
import { PrefToggle, isTyping } from "@ui/panjim/hudToggles";
import { tooltipText } from "@ui/tooltip";
import { Maya } from "@ui/panjim/maya";
import { MayaDirector, GUIDE_NOTES } from "./mayaDirector";
import { mayaAftermath, stormWord } from "@core/mayaLines";
import type { Tooltips } from "@ui/tooltip";

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
  /**
   * Plays a recorded storm from its depth field (see StormDirector): water,
   * sky, the defences answering and the houses going, all from the
   * resolution. Resolves once the water has drained.
   */
  play: (record: StormRecord, defences: ReadonlyMap<string, string>, hooks: { onHouseLost: () => void; hurry: () => boolean; onPhase?: (phase: string, line: string) => void }) => Promise<void>;
  /** Holds the storm clock at `seconds` for screenshots (null lets it run); the hold applies to the next storm too. */
  freeze: (seconds: number | null) => void;
  /** True while a storm plays. */
  isPlaying: () => boolean;
  begin: (challenge: ScheduledChallenge) => void;
  /** One zone's moment: the water or wind reveals, its defences answer one at a time, failures fall, houses take damage. */
  zone: (zone: ZoneOutcome, outcome: ChallengeOutcome, slow: boolean, durationMs: number, onHouseLost: () => void) => void;
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
  /** Tints tiles for the Aftermath replay (null clears every tint it set). */
  tintTiles: (tints: { key: string; color: string; blend: number }[] | null) => void;
  /** Applies a graphics quality (rain, cloud, wave detail and pixel ratio). */
  setQuality: (quality: Quality) => void;
  /** Reduced motion on or off for the storm effects, the sway and Maya. */
  setReducedMotion: (reduced: boolean) => void;
  /** The calm after the finale's storm: the sun back out, birds, the calm bed. Resolves after `ms` or on a click. */
  calmEnding: (ms: number) => Promise<void>;
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
  /** Puts the Get ready panel where the objectives list would be. */
  mountPanel: (el: HTMLElement) => void;
  /** Sparkle, ring and glow over tiles that just joined a combo. */
  celebrateCombo: (tiles: AxialCoord[]) => void;
  /** Draws the warning heat (an empty list clears it). */
  showHeat: (tiles: HeatViewTile[]) => void;
  /** Plays the first-warning risk sequence over these tiles (ui/riskIntroFx.ts). */
  startRiskIntro: (mode: RiskIntroMode, keys: string[]) => void;
  /** Stops it at once, leaving the normal risk view. */
  cancelRiskIntro: (reason: string) => void;
  /** Glides the camera to a board coordinate (fractional allowed); `close` also zooms in a little. Cancelled by any drag. */
  focusCamera: (coord: AxialCoord, close?: boolean, zoom?: number) => void;
  /** The map's named places, for Maya to call a spot by name. */
  landmarks: readonly { name: string; q: number; r: number }[];
  /** True while the build menu or the opening brief is open: Maya stays quiet. */
  uiBlocked: () => boolean;
  /** The session's tooltip manager, for this run's own controls. */
  tooltips: Tooltips;
}

/** Milliseconds per quarter tick: quick for a single action, slower for a visible time-lapse. */
const TICK_MS_ACTION = 170;
const TICK_MS_LAPSE = 420;

export class PanjimController {
  readonly run: ActionRun;
  private readonly clock: ClockHud;
  private readonly outlook: OutlookBar;
  private readonly jar: CoinJar;
  /** "Get ready": the jobs for the next storm. */
  private readonly getReady = new GetReadyPanel();
  readonly fieldGuide: FieldGuide;
  private busy = false;
  /** The first-warning risk sequence plays once a playthrough (core/riskIntro.ts). */
  private readonly riskGate = new RiskIntroGate();
  /** A challenge that landed during the current time-lapse, staged once the clock stops. */
  private pendingChallenge: { challenge: ScheduledChallenge; outcome: ChallengeOutcome; failedIds: string[] } | null = null;
  /** The last readiness reading for each challenge before it landed, for telemetry. */
  private readonly readinessById = new Map<string, string>();
  private readonly aftermath: AftermathCard;
  private readonly finaleCard: FinaleCard;
  private readonly housesCounter: HousesCounter;
  /** Real milliseconds played before this session, when resuming a save: the tempo badge counts the whole run. */
  playMsBefore = 0;
  /** The in-scene label over the locked Forecast's first zone: "Cyclone landfall ●●○". */
  private readonly forecastLabel: HTMLElement;
  private forecastAnchor: AxialCoord | null = null;
  /** "Show risk": the warning heat on or off (R). On by default, remembered on this device. */
  readonly riskToggle: PrefToggle;
  /** The latest exposure preview of the next storm, while it is inside the warning window. Read by Maya and the Get ready panel. */
  exposure: Exposure | null = null;
  private readonly keyAbort = new AbortController();
  /** Maya, the field guide, and the rules for when she speaks. */
  readonly maya: Maya;
  readonly mayaDirector: MayaDirector;
  /** Maya's voice on or off (M). The heat stays either way. */
  readonly mayaToggle: PrefToggle;
  private readonly replayCard: ReplayCard;
  /** Reduced motion: no shake or flashes, calmer waves, fewer rain streaks. Starts from the system setting. */
  readonly motionToggle: PrefToggle;
  /** Graphics quality: Auto (from the frame rate), Low, Medium or High. */
  private readonly qualityButton: HTMLButtonElement;
  private qualityChoice: QualityChoice = "auto";
  private autoQuality: Quality = "high";
  private readonly sampler = new FrameSampler();
  private lastFrameMs: number | null = null;
  /** Sound on or off (S), with the master volume beside it. Off until the first click whatever it says: browsers require one. */
  readonly soundToggle: PrefToggle;
  private readonly volumeSlider: HTMLInputElement;
  private nextPumpMs = 0;

  constructor(private readonly host: PanjimHost) {
    if (!host.level.timeline) throw new Error("PanjimController needs a level timeline");
    this.run = new ActionRun(host.state, host.level.timeline, {
      climate: host.level.climate,
      seed: host.seed,
      zones: host.zones,
      houseStars: host.level.houseStars,
      houseRule: host.level.houses?.rule,
      prep: host.level.prep
    });
    host.container.classList.add("has-panjim-clock");
    this.clock = new ClockHud(host.container, {
      onFastForwardYear: () => void this.fastForwardYear(),
      onFastForwardEvent: () => void this.fastForwardEvent()
    });
    this.outlook = new OutlookBar(this.clock.outlookSlot);
    this.jar = new CoinJar(host.container, () => this.collectJar());
    host.mountPanel(this.getReady.el);
    this.fieldGuide = new FieldGuide(host.container, () => host.telemetry.reward("species"));
    this.aftermath = new AftermathCard(host.container);
    this.finaleCard = new FinaleCard(host.container);
    this.housesCounter = new HousesCounter(host.container);
    this.replayCard = new ReplayCard(host.container);
    this.riskToggle = new PrefToggle(
      host.container,
      { storageKey: "riptide-rising:show-risk:v1", label: "Show risk", shortcut: "R", defaultOn: true, className: "risk-toggle" },
      (on) => {
        if (!on) this.host.cancelRiskIntro("risk hidden");
        this.renderHeat();
      }
    );
    this.mayaToggle = new PrefToggle(
      host.container,
      { storageKey: "riptide-rising:maya-voice:v1", label: "Maya", shortcut: "M", defaultOn: true, className: "maya-toggle" },
      (on) => this.maya.setMuted(!on)
    );
    this.soundToggle = new PrefToggle(
      host.container,
      { storageKey: "riptide-rising:sound", label: "Sound", shortcut: "S", defaultOn: true, className: "sound-toggle" },
      (on) => {
        setSoundEnabled(on);
        this.volumeSlider.disabled = !on;
      }
    );
    this.motionToggle = new PrefToggle(
      host.container,
      { storageKey: "riptide-rising:calm-motion", label: "Calm motion", shortcut: "", defaultOn: prefersReducedMotion(), className: "motion-toggle" },
      (on) => host.setReducedMotion(on)
    );
    this.qualityButton = document.createElement("button");
    this.qualityButton.type = "button";
    this.qualityButton.className = "panjim-toggle quality-control";
    this.qualityButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.qualityChoice = nextChoice(this.qualityChoice);
      try {
        localStorage.setItem("riptide-rising:quality", this.qualityChoice);
      } catch {
        // Storage blocked: the choice lasts for this visit.
      }
      this.applyQuality();
    });
    try {
      const saved = localStorage.getItem("riptide-rising:quality");
      if (saved === "auto" || saved === "low" || saved === "medium" || saved === "high") this.qualityChoice = saved;
    } catch {
      // Storage blocked: Auto.
    }
    this.volumeSlider = document.createElement("input");
    this.volumeSlider.type = "range";
    this.volumeSlider.className = "sound-volume";
    this.volumeSlider.min = "0";
    this.volumeSlider.max = "100";
    this.volumeSlider.step = "5";
    this.volumeSlider.value = String(Math.round(soundVolume() * 100));
    this.volumeSlider.disabled = !this.soundToggle.value;
    this.volumeSlider.setAttribute("aria-label", "Sound volume");
    this.volumeSlider.addEventListener("input", () => setSoundVolume(Number(this.volumeSlider.value) / 100));
    this.volumeSlider.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.soundToggle.el.after(this.volumeSlider);
    this.motionToggle.el.after(this.qualityButton);
    host.setReducedMotion(this.motionToggle.value);
    this.applyQuality();
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
        if (event.key === "r" || event.key === "R") this.riskToggle.toggle();
        if (event.key === "m" || event.key === "M") this.mayaToggle.toggle();
        if (event.key === "s" || event.key === "S") this.soundToggle.toggle();
      },
      { signal: this.keyAbort.signal }
    );
    this.maya = new Maya(host.container, { muted: !this.mayaToggle.value, reducedMotion: prefersReducedMotion() });
    this.mayaDirector = new MayaDirector(this.maya, {
      run: this.run,
      exposure: () => this.exposure,
      blocked: () => this.busy || this.host.uiBlocked() || this.aftermath.isOpen || this.fieldGuide.isOpen || Boolean(this.host.container.querySelector(".finale-card")),
      project: (coord) => this.host.project(coord),
      focus: (coord) => this.host.focusCamera(coord),
      landmarks: host.landmarks
    });
    this.maya.onSpoken = (line) => {
      const note = GUIDE_NOTES.get(line.id);
      if (note) this.fieldGuide.addNote(note);
    };
    this.fieldGuide.onReplayNote = (note) => this.mayaDirector.replay(note);
    this.attachTooltips();
    this.offerSavedRun();
    this.forecastLabel = document.createElement("div");
    this.forecastLabel.className = "forecast-label";
    this.forecastLabel.hidden = true;
    host.container.appendChild(this.forecastLabel);
    this.clock.set(this.run.label, this.progress());
    this.renderOutlook();
    this.syncControls();
  }

  /** The last readiness reading, for the gauge's tooltip. */
  private lastReadiness: ReturnType<ActionRun["readiness"]> = null;

  /** Tooltips on this run's controls, with live numbers. */
  private attachTooltips(): void {
    const tips = this.host.tooltips;
    const clock = this.clock.parts;
    tips.attach(clock.face, "clock", () => ({ label: this.run.label }));
    tips.attach(clock.year, "ffYear");
    tips.attach(clock.event, () => {
      const next = this.run.nextChallenge();
      const quarters = this.run.quartersToNextEvent();
      return next && quarters > 0 ? tooltipText("ffEvent", { quarters, storm: next.name.toLowerCase() }) : tooltipText("ffEventNone");
    });
    clock.event.dataset.tip = "ffEvent";
    const outlook = this.outlook.parts;
    tips.attach(outlook.track, "outlookTrack");
    tips.attach(outlook.line, "outlookNext", () => ({ next: this.outlook.nextText }));
    tips.attach(outlook.sea, "sea", () => ({ cm: this.run.climate ? seaLevelCm(this.run.climate, this.run.quarter) : 0 }));
    tips.attach(this.outlook.gaugeSlot, () => {
      const r = this.lastReadiness;
      if (!r) return tooltipText("readinessNone");
      return tooltipText("readiness", {
        pct: Math.round(r.outcome.protection * 100),
        storm: stormWord(r.challenge.kind),
        saved: r.outcome.housesSaved,
        total: r.outcome.housesTotal,
        stars: r.outcome.stars
      });
    });
    this.outlook.gaugeSlot.dataset.tip = "readiness";
    tips.attach(this.jar.el, "jar", () => ({ amount: Math.floor(this.run.jar) }));
    tips.attach(this.fieldGuide.buttonEl, "fieldGuide", () => ({ found: this.fieldGuide.count, species: this.fieldGuide.speciesTotal, notes: this.fieldGuide.noteCount }));
    tips.attach(this.housesCounter.el, "housesCounter", () => {
      let total = 0;
      let standing = 0;
      for (const inst of this.host.state.elements.values()) {
        if (inst.elementId !== "house") continue;
        total++;
        if (inst.degradeAmount < 1) standing++;
      }
      return { standing, total };
    });
    tips.attach(this.riskToggle.el, "riskToggle");
    tips.attach(this.getReady.el, "getReady");
    tips.attach(this.mayaToggle.el, "mayaToggle");
    tips.attach(this.soundToggle.el, "soundToggle");
    tips.attach(this.motionToggle.el, "motionToggle");
    tips.attach(this.qualityButton, "qualityControl", () => ({ choice: this.qualityLabel(), fps: this.lastFps > 0 ? Math.round(this.lastFps) : "–" }));
    tips.attach(this.volumeSlider, "soundVolume", () => ({ pct: this.volumeSlider.value }));
    const dismiss = this.maya.el.querySelector<HTMLElement>(".maya-dismiss");
    if (dismiss) tips.attach(dismiss, "mayaDismiss");
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

  private renderGetReady(): void {
    const next = this.run.nextChallenge();
    const zones = this.run.zones;
    this.getReady.render(
      next ? next.name : null,
      zones ? this.run.prep.map((job) => ({ job, ...prepProgress(job, this.host.state, zones) })) : []
    );
    if (this.run.prep.length > 0) this.mayaDirector?.tip("get-ready");
  }

  /**
   * The warning heat for the next storm, rebuilt from scratch: on every
   * quarter tick, every build, demolish and repair, a rewind or a resume.
   * Inside the last five quarters only; one storm at a time (the next one).
   * Purely information: it reads a copy of the board and changes nothing.
   */
  renderHeat(): void {
    const next = this.run.nextChallenge();
    const quartersLeft = next ? this.run.quartersUntil(next) : 0;
    this.exposure = next && quartersLeft >= 1 && quartersLeft <= HEAT_LEAD_QUARTERS ? this.run.exposureFor(next) : null;
    if (!next || !this.exposure || !this.riskToggle.value) {
      this.host.showHeat([]);
      return;
    }
    const hazards = hazardsOf(next.kind);
    const defences: string[] = [];
    for (const [key, inst] of this.host.state.elements) {
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (def && (def.effects.resilience ?? 0) > 0 && def.targetsHazards?.some((h) => hazards.includes(h as "cyclone" | "flood"))) defences.push(key);
    }
    const undefended = this.run.exposureFor(next, true);
    const terrain = (key: string): string | undefined => this.host.state.placed.get(key)?.terrainId;
    const view = buildHeatView(this.exposure, undefended, quartersLeft, defences, terrain);
    this.host.showHeat(view);
    // The first warning of the playthrough gets the risk sequence, once, if
    // nothing else is going on (it never waits for, or blocks, the player).
    const hot = view.filter((tile) => tile.heat > 0).map((tile) => tile.key);
    if (hot.length > 0 && !this.riskGate.spent && !this.busy && !this.host.uiBlocked() && this.riskGate.offer(next.id)) {
      const reduced = this.motionToggle.value || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.host.startRiskIntro(riskIntroMode(reduced, this.quality), hot);
    }
  }

  /** Repaints the Outlook from the current quarter. */
  renderOutlook(): void {
    this.renderHeat();
    this.mayaDirector?.consider();
    this.renderGetReady();
    let houses = 0;
    let standing = 0;
    for (const inst of this.host.state.elements.values()) {
      if (inst.elementId !== "house") continue;
      houses++;
      if (inst.degradeAmount < 1) standing++;
    }
    this.housesCounter.showStanding(standing, houses);
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
    this.lastReadiness = readiness;
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
    this.maya.dismiss();
    this.maya.setState("worried");
    // The houses in the storm's path that were standing when it arrived;
    // the counter falls from there, one house at a time.
    this.housesCounter.beginStorm(outcome.housesSaved + outcome.housesDamaged, outcome.housesTotal);

    let hurry = false;
    const abort = new AbortController();
    // A click on the board hurries the storm; one on the HUD (volume, switches, Maya) does not.
    document.addEventListener(
      "pointerdown",
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".panjim-toggles, .maya, .hud-tooltip, .instrument-cluster, .panjim-clock, .map-corner, .get-ready, .houses-counter")) return;
        hurry = true;
      },
      { signal: abort.signal, capture: true }
    );

    const record = this.run.stormRecords.get(challenge.id);
    try {
      if (record) {
        // The storm itself, from its depth field: the houses go when their
        // water passes the line, the defences answer when it reaches them.
        await this.host.challengeFx.play(record, this.preChallengeIds, {
          onHouseLost: () => this.housesCounter.lose(),
          hurry: () => hurry,
          // Maya calls the storm's phases as they come.
          onPhase: (phase, line) => {
            this.maya.dismiss();
            this.maya.say({ id: `storm:${challenge.id}:${phase}`, text: line, state: phase === "Recede" ? "explains" : "warning", urgent: true });
            this.maya.next();
          }
        });
      } else {
        const biggest = outcome.zones.reduce((best, zone, index) => (zone.absorbed > (outcome.zones[best]?.absorbed ?? -1) ? index : best), 0);
        await wait(500);
        for (const [index, zone] of outcome.zones.entries()) {
          const slow = index === biggest && zone.absorbed > 0 && !hurry;
          const duration = hurry ? 250 : slow ? 2600 : 1300;
          this.host.container.classList.toggle("slowmo", slow);
          this.host.challengeFx.zone(zone, outcome, slow, duration, () => this.housesCounter.lose());
          await wait(duration);
          if (zone.held) playSound("chime");
        }
      }
    } finally {
      abort.abort();
      this.host.container.classList.remove("slowmo");
    }
    await wait(hurry ? 100 : 500);
    if (record) {
      // The calm after the finale's storm, then the replay of what happened.
      if (record.kind === "compound") {
        this.maya.dismiss();
        this.maya.say({ id: `calm:${challenge.id}`, text: "The water has gone down and the sun is out again.", state: "celebrates", urgent: true });
        this.maya.next();
        await this.host.calmEnding(4500);
      }
      await this.replay(challenge, record);
    }
    this.housesCounter.endStorm(outcome.housesSaved, outcome.housesTotal);
    this.host.challengeFx.end();
    this.renderOutlook();
    this.host.refresh();

    // Autosave after every challenge.
    const saveStart = performance.now();
    this.saveRun();
    telemetry.emit("checkpoint", { id: challenge.id, ms: Math.round(telemetry.elapsed()), saveMs: Math.round(performance.now() - saveStart) });
    telemetry.emit("challenge_end", {
      id: challenge.id,
      stars: outcome.stars,
      readiness,
      protection: Number(outcome.protection.toFixed(3)),
      houses_saved: outcome.housesSaved,
      houses_total: outcome.housesTotal
    });

    const lock = this.run.lockSnapshots.get(challenge.id);
    // Maya explains what actually happened, from the resolved storm.
    const told = this.run.zones ? mayaAftermath(outcome, this.host.state, this.run.zones, record?.savedBy) : null;
    this.maya.setState(told?.mood ?? "idle");
    const choice = await this.aftermath.show({
      maya: told?.text ?? null,
      title: `${challenge.name} · ${this.labelFor(challenge.quarter)}`,
      stars: outcome.stars,
      housesSaved: outcome.housesSaved,
      housesDamaged: outcome.housesDamaged,
      housesTotal: outcome.housesTotal,
      // With Maya's line, the card keeps one voice: the old line stays only
      // to report a structure that failed, and the "saved the most" estimate
      // only when Maya has nothing to say.
      line: this.run.zones && (!told || outcome.zones.some((zone) => zone.failed.length > 0)) ? aftermathLine(challenge.kind, outcome, this.host.state, this.run.zones, failedIds) : "",
      hero: this.run.zones && !told ? topDefenceLine(outcome, this.host.state, this.run.zones) : null,
      replayLabel: lock && !this.run.finished ? `Replay from the forecast (${this.labelFor(lock.quarter)})` : null,
      comparison: record
        ? {
            without: record.undefended.outcome.housesDamaged,
            savedBy: record.savedBy.slice(0, 3).map((save) => `${DEFENCE_PLURAL[save.elementId] ?? save.elementId} ×${save.count}: ${save.houses} saved`)
          }
        : null
    });
    this.maya.setState("idle");
    if (choice === "replay" && lock) this.rewindTo(lock, challenge);
  }

  /** The Aftermath replay: what the storm did, step by step, in the record's real numbers. Skippable. */
  private async replay(challenge: ScheduledChallenge, record: StormRecord): Promise<void> {
    const steps = replaySteps(record, this.preChallengeIds);
    // Frame the homes the storm reached: the hit ones, else the ones it reached and spared.
    const focusKeys = steps[0]?.hit.length ? steps[0].hit : steps[0]?.dry ?? [];
    if (focusKeys.length > 0) {
      const sum = focusKeys.reduce((acc, key) => {
        const [q, r] = key.split(",").map(Number);
        return { q: acc.q + q, r: acc.r + r };
      }, { q: 0, r: 0 });
      this.host.focusCamera({ q: Math.round(sum.q / focusKeys.length), r: Math.round(sum.r / focusKeys.length) }, true, 1.4);
    }
    await this.replayCard.play(challenge.name, steps, {
      light: (step) => {
        if (!step) {
          this.host.tintTiles(null);
          return;
        }
        const tints: { key: string; color: string; blend: number }[] = [];
        for (const key of step.dry) tints.push({ key, color: "#5fbf7a", blend: 0.5 });
        for (const key of step.hit) tints.push({ key, color: "#d9553d", blend: 0.6 });
        for (const key of step.highlight) tints.push({ key, color: "#f2c35b", blend: 0.7 });
        this.host.tintTiles(tints);
      },
      say: (line) => {
        this.maya.dismiss();
        this.maya.say({ id: `replay:${challenge.id}:${line}`, text: line, state: "explains", urgent: true, force: true });
        this.maya.next();
      }
    });
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
    this.host.cancelRiskIntro("hazard");
    this.busy = true;
    this.syncControls();
    const result = this.result();
    this.host.revealSkyline();
    await this.finaleCard.title();
    await this.finaleCard.show({
      index: result,
      challengeNames: this.run.schedule.map((c) => c.name),
      tempo: tempoBadge(this.playMs()),
      seed: this.host.seed,
      stormCard: this.stormCardInput()
    });
    this.host.onRunComplete(result);
  }

  /** The storm card as a PNG data URL (for the screenshots). */
  stormCardDataUrl(): string | null {
    const input = this.stormCardInput();
    return input ? drawStormCard(input).toDataURL("image/png") : null;
  }

  /** The storm card's data: the storm the defences did most for (the last one if none did). */
  private stormCardInput(): StormCardInput | null {
    let best: { name: string; record: StormRecord } | null = null;
    let bestGain = -1;
    for (const challenge of this.run.schedule) {
      const record = this.run.stormRecords.get(challenge.id);
      if (!record) continue;
      const gain = record.undefended.outcome.housesDamaged - record.outcome.housesDamaged;
      if (gain >= bestGain) {
        bestGain = gain;
        best = { name: challenge.name, record };
      }
    }
    if (!best) return null;
    return {
      title: best.name,
      tiles: [...this.host.state.placed.entries()].map(([key, tile]) => ({ key, terrainId: tile.terrainId })),
      record: best.record,
      // The defences that faced that storm, not the ones standing now.
      defences: [...best.record.defences.keys()]
    };
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

  /** Called every rendered frame: Maya's moves and lines, and the in-scene Forecast label over its zone. */
  private lastFps = 0;

  /** The quality in use: the player's choice, or Auto's current level. */
  get quality(): Quality {
    return this.qualityChoice === "auto" ? this.autoQuality : this.qualityChoice;
  }

  private qualityLabel(): string {
    const name = (q: Quality): string => q.charAt(0).toUpperCase() + q.slice(1);
    return this.qualityChoice === "auto" ? `Auto (${name(this.autoQuality)})` : name(this.qualityChoice);
  }

  private applyQuality(): void {
    this.qualityButton.innerHTML = `<span class="toggle-label"></span>`;
    (this.qualityButton.querySelector(".toggle-label") as HTMLElement).textContent = `Quality: ${this.qualityLabel()}`;
    this.host.setQuality(this.quality);
  }

  frame(): void {
    const now = performance.now();
    // Auto quality: average the frame rate a few seconds at a time and step down if it is low.
    const fps = this.sampler.frame(now, this.lastFrameMs);
    this.lastFrameMs = now;
    if (fps !== null) {
      this.lastFps = fps;
      if (this.qualityChoice === "auto") {
        const next = autoStep(this.autoQuality, fps);
        if (next !== this.autoQuality) {
          this.autoQuality = next;
          this.applyQuality();
          this.host.telemetry.emit("quality_auto", { quality: next, fps: Math.round(fps) });
        }
      }
    }
    this.maya.frame(now);
    if (now >= this.nextPumpMs) {
      this.nextPumpMs = now + 400;
      this.mayaDirector.pump();
    }
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
    this.host.cancelRiskIntro("build");
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
    this.host.cancelRiskIntro("build");
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
    this.host.cancelRiskIntro("build");
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
    this.host.cancelRiskIntro("time passing");
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
      case "prep_complete": {
        playSound("coin");
        window.setTimeout(() => playSound("chime"), 180);
        this.getReady.celebrate(event.objective);
        // A short cheer: a pose, not a line, so it never uses up her one line a quarter.
        if (!this.maya.speaking) {
          this.maya.setState("celebrates");
          window.setTimeout(() => {
            if (!this.maya.speaking) this.maya.setState("idle");
          }, 2200);
        }
        this.host.telemetry.emit("request_complete", { id: event.objective.id, reward: event.reward, kind: "prep" });
        this.host.telemetry.reward("request");
        break;
      }
      case "prep_new":
        break;
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
    this.clock.setControlsEnabled(open, open && toEvent > 0);
  }

  /** Scenario helper: lets quarters pass, animated like a fast-forward, until `quartersLeft` remain before the next storm. */
  private async waitUntilQuartersLeft(quartersLeft: number): Promise<boolean> {
    const next = this.run.nextChallenge();
    if (!next) return false;
    const gap = this.run.quartersUntil(next) - quartersLeft;
    if (gap < 0) return false;
    if (gap > 0) {
      this.noteBoard();
      await this.play(this.run.waitQuarters(gap), 60);
    }
    return true;
  }

  /** Scenario helper: plants what answers the next storm on its first zones, through the player's own build path. */
  private async plantForNext(count: number): Promise<void> {
    const next = this.run.nextChallenge();
    if (!next) return;
    const picks: [string, string][] =
      next.kind === "cyclone"
        ? [["z1", "dune"], ["z1", "sandy_vegetation"], ["z1", "dune"], ["z2", "mangrove"]]
        : [["z2", "khazan"], ["z2", "mangrove"], ["z3", "mangrove"], ["z4", "mangrove"]];
    let planted = 0;
    for (const [zone, element] of picks) {
      if (planted >= count) break;
      this.collectJar();
      const coord = this.firstBuildableIn(zone, element);
      if (coord && this.build(coord, element)) planted++;
      await this.idle();
    }
  }

  /** Scenario helper: frames the camera on the next storm's first zone. */
  private frameNextStorm(): void {
    const next = this.run.nextChallenge();
    if (!next || !this.run.zones) return;
    const keys = this.run.zones.keys(FRONTS[next.kind][0].path[0]);
    const coords = keys.map((key) => {
      const [q, r] = key.split(",").map(Number);
      return { q, r };
    });
    const centre = coords.reduce((acc, c) => ({ q: acc.q + c.q / coords.length, r: acc.r + c.r / coords.length }), { q: 0, r: 0 });
    this.host.focusCamera(centre, true);
  }

  /**
   * Test-only scenarios for tools/phaseShots.ts: puts the board in a state
   * worth photographing. Uses the same actions a player has.
   */
  async scenario(name: string): Promise<boolean> {
    // "heat-N": stop the clock N quarters before the next storm, building
    // nothing. "heat-defend": plant three defences on its path first.
    // "maya-jump-<place>": a warning that hops her to a named place (the layout tests).
    const jump = /^maya-jump-(.+)$/.exec(name);
    if (jump) {
      const wanted = jump[1].replace(/-/g, " ").toLowerCase();
      const spot = this.host.landmarks.find((l) => l.name.toLowerCase().includes(wanted));
      if (!spot) return false;
      const coord = { q: spot.q, r: spot.r };
      this.maya.dismiss();
      this.maya.say({
        id: `sample-jump:${performance.now()}`,
        text: `${spot.name} is exposed! Strengthen it before the storm.`,
        state: "warning",
        urgent: true,
        anchor: () => this.host.project(coord)
      });
      this.maya.next();
      return true;
    }
    // "maya:<state>": Maya says a sample line in that state (for the screenshots).
    const pose = /^maya:(\w+)$/.exec(name);
    if (pose) {
      const samples: Record<string, string> = {
        greeting: "Hello! I am Maya. Let us keep Panjim dry.",
        tip: "In this game, dunes and pandanus shield the beach from a cyclone's surge.",
        explains: "In this game, a Khazan holds floodwater so nearby homes stay drier.",
        warning: "Taleigao is exposed! Strengthen it before the flood.",
        worried: "We lost 6 homes at Taleigao. A few more defences there next time and they will stand.",
        celebrates: "The mangroves at Taleigao held 40 homes.",
        jump: "Over here!"
      };
      this.maya.dismiss();
      this.maya.say({ id: `sample:${pose[1]}:${performance.now()}`, text: samples[pose[1]] ?? pose[1], state: pose[1] as never, urgent: true });
      this.maya.next();
      return true;
    }
    // "look-<place>": frames the camera close on a named place ("look-miramar").
    const look = /^look-(close-)?(.+)$/.exec(name);
    if (look) {
      const wanted = look[2].replace(/-/g, " ").toLowerCase();
      const spot = this.host.landmarks.find((l) => l.name.toLowerCase().includes(wanted));
      if (!spot) return false;
      this.host.focusCamera({ q: spot.q, r: spot.r }, true, look[1] ? 0.45 : 1);
      return true;
    }
    // "quality-<low|medium|high|auto>": sets the graphics quality for this visit (not saved).
    const quality = /^quality-(low|medium|high|auto)$/.exec(name);
    if (quality) {
      this.qualityChoice = quality[1] as QualityChoice;
      this.applyQuality();
      return true;
    }
    // "storm-<seconds>": plays the next storm and holds it at that storm time.
    const stormAt = /^storm-(\d+(?:\.\d+)?)$/.exec(name);
    if (stormAt) {
      this.host.challengeFx.freeze(Number(stormAt[1]));
      const next = this.run.nextChallenge();
      if (!next) return false;
      if (this.run.quartersUntil(next) > 1) await this.fastForwardEvent();
      await this.idle();
      void this.fastForwardYear();
      while (!this.host.challengeFx.isPlaying()) await wait(100);
      await wait(1200);
      return true;
    }
    if (name === "storm-release") {
      this.host.challengeFx.freeze(null);
      return true;
    }
    const heat = /^heat-(\d)$/.exec(name);
    if (heat) {
      const ok = await this.waitUntilQuartersLeft(Number(heat[1]));
      this.frameNextStorm();
      return ok;
    }
    switch (name) {
      case "past-storm": {
        // Plays through the next storm (accepting its Aftermath), so the
        // shots that follow are about the one after it.
        const next = this.run.nextChallenge();
        if (!next) return false;
        while (!this.run.landed.has(next.id)) {
          void this.fastForwardYear();
          await wait(60);
          while (this.busy) {
            // Hurry the storm along, as a player's click does.
            if (this.host.challengeFx.isPlaying() || this.replayCard.isOpen) document.dispatchEvent(new PointerEvent("pointerdown"));
            if (this.aftermath.isOpen) this.host.container.querySelector<HTMLButtonElement>(".aftermath-continue")?.click();
            await wait(100);
          }
        }
        return true;
      }
      case "prep-one": {
        // Finishes the first Get ready job through the player's build path.
        const job = this.run.prep.find((j) => !j.done);
        if (!job || !this.run.zones) return false;
        for (let i = 0; i < job.count; i++) {
          this.collectJar();
          const coord = this.firstBuildableIn(job.zone, job.elementId);
          if (coord) this.build(coord, job.elementId);
          await this.idle();
        }
        return true;
      }
      case "risk-off": {
        this.riskToggle.set(false);
        return true;
      }
      case "risk-on": {
        this.riskToggle.set(true);
        return true;
      }
      case "heat-defend": {
        await this.plantForNext(3);
        this.frameNextStorm();
        return true;
      }
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
        while (!this.host.container.querySelector(".houses-counter.live")) await wait(50);
        await wait(1200); // a few houses into the count
        return true;
      }
      case "show-storm-card": {
        // The storm card's image over everything, for the screenshots.
        const url = this.stormCardDataUrl();
        if (!url) return false;
        const img = document.createElement("img");
        img.src = url;
        img.className = "storm-card-preview";
        img.style.cssText = "position:fixed;left:0;top:0;width:100vw;z-index:99999;background:#000";
        document.body.appendChild(img);
        await wait(300);
        return true;
      }
      case "aftermath-replay": {
        // Defences on the next storm's path, the storm hurried through, then
        // handed back on the replay's second step.
        await this.plantForNext(4);
        const next = this.run.nextChallenge();
        if (!next) return false;
        if (this.run.quartersUntil(next) > 1) await this.fastForwardEvent();
        await this.idle();
        void this.fastForwardYear();
        while (!this.replayCard.isOpen) {
          if (this.host.challengeFx.isPlaying()) document.dispatchEvent(new PointerEvent("pointerdown"));
          await wait(150);
        }
        await wait(700);
        return true;
      }
      case "finale": {
        // Plays the whole run on fast-forward, accepting each Aftermath,
        // and hands back at the finale card.
        while (!this.run.finished) {
          void this.fastForwardYear();
          await wait(60);
          while (this.busy) {
            if (this.host.challengeFx.isPlaying() || this.replayCard.isOpen) document.dispatchEvent(new PointerEvent("pointerdown"));
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
    this.keyAbort.abort();
    this.maya.dispose();
    this.mayaToggle.dispose();
    this.replayCard.dispose();
    this.soundToggle.dispose();
    this.motionToggle.dispose();
    this.qualityButton.remove();
    this.volumeSlider.remove();
    this.riskToggle.dispose();
    this.housesCounter.dispose();
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

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
