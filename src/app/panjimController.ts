import { ActionRun, type ActionOutcome, type RunEvent } from "@core/actionRun";
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
import { ClockHud, type ClockView } from "@ui/panjim/clockHud";
import { OutlookBar } from "@ui/panjim/outlookBar";
import { CoinJar } from "@ui/panjim/coinJar";
import { GetReadyPanel } from "@ui/panjim/getReady";
import { prepProgress } from "@core/prep";
import { FieldGuide } from "@ui/panjim/fieldGuide";
import { COMBO_INFO, type ComboId } from "@core/combos";
import { seaLevelCm, strengthIcons, challengeStrength, type ScheduledChallenge } from "@core/climate";
import { FRONTS, type ChallengeOutcome, type ZoneDef, type ZoneOutcome } from "@core/zones";
import { aftermathLine, topDefenceLine } from "@core/aftermath";
import { HousesCounter } from "@ui/panjim/housesCounter";
import type { RunSnapshot } from "@core/actionRun";
import { AftermathCard } from "@ui/panjim/aftermathCard";
import { FinaleCard } from "@ui/panjim/finaleCard";
import { computePanjimIndex, tempoBadge, type PanjimIndex } from "@core/panjimIndex";
import { axialToWorld, neighbors } from "@core/hex";
import { ELEMENT_BY_ID } from "@core/elements";
import { playSound } from "@ui/audioHooks";
import { buildHeatView, hazardsOf, HEAT_LEAD_YEARS, type Exposure, type HeatViewTile } from "@core/exposure";
import { RiskIntroGate, riskIntroMode, type RiskIntroMode } from "@core/riskIntro";
import { PrefToggle, isTyping, togglesRow } from "@ui/panjim/hudToggles";
import { tooltipText } from "@ui/tooltip";
import { Maya } from "@ui/panjim/maya";
import { MayaDirector, GUIDE_NOTES } from "./mayaDirector";
import { factById } from "@core/facts";
import { HudPanels } from "@ui/panjim/hudPanels";
import { factNote } from "@core/mayaLines";
import { NuggetPopup } from "@ui/nuggetPopup";
import { mayaAftermath, stormWord } from "@core/mayaLines";
import type { Tooltips } from "@ui/tooltip";

/**
 * The Panjim 2050 run inside a live session.
 *
 * `ActionRun` (core) owns the rules: the builds each year allows and what
 * happens when a year ends. This owns the presentation: the year ticking, the
 * storms, and telling the session when the board changed. The session calls
 * in here instead of `state.build()` when the level's time model is
 * `"years"`; on the tutorial this class is never constructed.
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
  /** Seed text for cosmetic variety and the share card: the level id, a daily id, or a `?seed=` replay. The calendar never reads it. */
  seed: string;
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
  /** Adds a second button to the level brief ("Continue from 2032"). */
  offerResume: (label: string, onResume: () => void) => void;
  /** The map's challenge zones. */
  zones: readonly ZoneDef[];
  /** Shows a storm's path as a translucent in-scene overlay: each tile with a 0–1 weight. */
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
  /** Whether any menu, card or modal is open (the risk sequence never starts under one). */
  overlayOpen: () => boolean;
  /** Whether any of these tiles is on screen now. */
  riskAreaOnScreen: (keys: string[]) => boolean;
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

export class PanjimController {
  readonly run: ActionRun;
  private readonly clock: ClockHud;
  private readonly outlook: OutlookBar;
  // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
  /** The coin jar, with coins on only. */
  private readonly jar: CoinJar | null;
  /** "Get ready": the jobs for the next storm. */
  private readonly getReady: GetReadyPanel;
  readonly fieldGuide: FieldGuide;
  private busy = false;
  /** The first-warning risk sequence plays once a playthrough (core/riskIntro.ts). */
  private readonly riskGate = new RiskIntroGate();
  /** True while storms that ended a year are being staged: the HUD still shows that year. */
  private stagingYearEnd = false;
  /** Storms that resolved at the end of this year, staged before the next year shows. */
  private pendingChallenges: { challenge: ScheduledChallenge; outcome: ChallengeOutcome; failedIds: string[] }[] = [];
  /** The last readiness reading for each challenge before it landed, for telemetry. */
  private readonly readinessById = new Map<string, string>();
  private readonly aftermath: AftermathCard;
  private readonly finaleCard: FinaleCard;
  private readonly housesCounter: HousesCounter;
  /** Real milliseconds played before this session, when resuming a save: the tempo badge counts the whole run. */
  playMsBefore = 0;
  /** The in-scene label over a storm's landfall or source while its warning is up: "Cyclone landfall ●○○". */
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
  /** Picks the fact Maya tells when an element is built (nuggetPopup.ts). */
  readonly nuggets: NuggetPopup;
  /** The HUD's two panels, each shut to a small button (hudPanels.ts). */
  readonly panels: HudPanels;
  private lastResilience: number | null = null;
  /** Resilience has fallen since the Status panel was last opened. */
  private resilienceDropUnseen = false;
  private nextDangerMs = 0;
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
      zones: host.zones,
      houseStars: host.level.houseStars,
      houseRule: host.level.houses?.rule,
      prep: host.level.prep,
      economy: host.level.economy,
      growth: host.level.growth
    });
    host.container.classList.add("has-panjim-clock");
    this.clock = new ClockHud(host.container, { onNextYear: () => void this.nextYear() });
    this.outlook = new OutlookBar(this.clock.outlookSlot);
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    this.jar = this.run.economyEnabled ? new CoinJar(host.container, () => this.collectJar()) : null;
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    this.getReady = new GetReadyPanel(this.run.economyEnabled);
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
      (on) => {
        host.setReducedMotion(on);
        this.recheckRiskIntroMode();
      }
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
    this.nuggets = new NuggetPopup(this.maya);
    this.maya.onSpoken = (line) => {
      const fact = line.fact ? factById(line.fact.id) : undefined;
      const note = fact ? factNote(fact) : GUIDE_NOTES.get(line.id);
      if (note) this.fieldGuide.addNote(note);
    };
    this.fieldGuide.onReplayNote = (note) => {
      if (!this.nuggets.replay(note.id)) this.mayaDirector.replay(note);
    };
    this.fieldGuide.discoveries = () => this.nuggets.progress;
    // The HUD kept almost out of the way (hudPanels.ts): the instrument cluster, coin jar and Field Guide
    // button go into one panel and the toggles into another, each shut to a small button. The elements
    // are moved, not rebuilt: their handlers, ids and shortcuts (R, M, S) are the ones they were.
    this.panels = new HudPanels(host.container);
    this.panels.status.adopt(host.container.querySelector<HTMLElement>(".instrument-cluster"), this.jar?.el ?? null, this.fieldGuide.buttonEl);
    this.panels.settings.adopt(togglesRow(host.container));
    this.panels.status.onOpen = () => {
      this.resilienceDropUnseen = false;
      this.updateDanger();
    };
    if (this.jar) this.jar.onGain = (text) => this.panels.status.floatText(text);
    this.attachTooltips();
    this.offerSavedRun();
    this.forecastLabel = document.createElement("div");
    this.forecastLabel.className = "forecast-label";
    this.forecastLabel.hidden = true;
    host.container.appendChild(this.forecastLabel);
    this.clock.set(this.clockView());
    this.renderOutlook();
    this.syncControls();
  }

  /** What the clock shows now. */
  private clockView(): ClockView {
    return {
      year: this.run.year,
      turn: Math.min(this.run.turnNumber, this.run.totalYears),
      totalYears: this.run.totalYears,
      buildsLeft: this.run.buildsLeft,
      buildsPerYear: this.run.buildsPerYear,
      finished: this.run.finished
    };
  }

  /** The last readiness reading, for the gauge's tooltip. */
  private lastReadiness: ReturnType<ActionRun["readiness"]> = null;

  /** Tooltips on this run's controls, with live numbers. */
  private attachTooltips(): void {
    const tips = this.host.tooltips;
    const clock = this.clock.parts;
    tips.attach(clock.face, "clock", () => ({ label: this.run.label, turn: Math.min(this.run.turnNumber, this.run.totalYears), total: this.run.totalYears }));
    tips.attach(clock.next, "nextYear");
    tips.attach(clock.builds, "buildsLeft", () => ({ per: this.run.buildsPerYear, left: this.run.buildsLeft }));
    const outlook = this.outlook.parts;
    tips.attach(outlook.track, "outlookTrack", () => ({ start: this.run.config.startYear, end: this.run.config.endYear }));
    tips.attach(outlook.line, "outlookNext", () => ({ next: this.outlook.nextText }));
    tips.attach(outlook.sea, "sea", () => ({ cm: this.run.climate ? seaLevelCm(this.run.climate, this.host.state.turn) : 0, start: this.run.config.startYear }));
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

  // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
  /** Banks the jar (coins on only). Free: uses no build. */
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
   * The warning heat for the next storm, rebuilt from scratch: on every new
   * year, every build, demolish and repair, a rewind or a resume. In the
   * last two years before a storm only; one storm at a time (the next one).
   * Purely information: it reads a copy of the board and changes nothing.
   */
  renderHeat(): void {
    const next = this.run.nextChallenge();
    const yearsLeft = next ? this.run.yearsUntil(next) : 0;
    this.exposure = next && yearsLeft >= 1 && yearsLeft <= HEAT_LEAD_YEARS ? this.run.exposureFor(next) : null;
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
    const view = buildHeatView(this.exposure, undefended, yearsLeft, defences, terrain);
    this.host.showHeat(view);
    // The first warning of the playthrough gets the risk sequence, once, if
    // nothing else is going on (it never waits for, or blocks, the player).
    const hot = view.filter((tile) => tile.heat > 0).map((tile) => tile.key);
    if (hot.length > 0) this.riskGate.see(next.id);
    if (hot.length > 0 && !this.riskGate.spent && !this.busy && !this.host.overlayOpen() && this.host.riskAreaOnScreen(hot) && this.riskGate.offer(next.id)) {
      this.riskIntroModeStarted = this.currentRiskIntroMode();
      this.host.startRiskIntro(this.riskIntroModeStarted, hot);
    }
  }

  /** Repaints the Outlook, the heat and the panels from the current year. */
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
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    // A jar reads full at about two years of the current income, and never
    // below a small floor, so even a young city sees it fill.
    this.jar?.render(this.run.jar, Math.max(60, this.run.income * 2));
    this.updateDanger();
    const climate = this.run.climate;
    if (!climate) return;
    // While a storm that ended a year is staged, the Outlook still reads that year, like the clock: the new year begins after it.
    const held = this.stagingYearEnd ? 1 : 0;
    const turn = Math.min(this.run.turnNumber - held, this.run.totalYears);
    this.outlook.render({
      startYear: this.run.config.startYear,
      endYear: this.run.config.endYear,
      year: this.run.config.startYear + turn - 1,
      storms: this.run.schedule.map((challenge) => ({
        challenge,
        yearsUntil: challenge.turn - turn + 1,
        // A storm that has resolved is behind the player, even in its own year.
        past: this.run.landed.has(challenge.id)
      })),
      seaLevelCm: seaLevelCm(climate, turn - 1),
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
            // GROWTH_DISABLED_V1: growth and maturity reserved for a future version
            growing: this.host.state.growthEnabled ? this.growingIn(readiness.challenge) : 0
          }
        : null
    );
  }

  /** Defences against the challenge's hazards that have not reached full strength yet. */
  private growingIn(challenge: ScheduledChallenge): number {
    const hazards = hazardsOf(challenge.kind);
    let count = 0;
    for (const inst of this.host.state.elements.values()) {
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (!def || (def.effects.resilience ?? 0) <= 0 || !def.targetsHazards?.some((h) => hazards.includes(h as "cyclone" | "flood"))) continue;
      if (this.host.state.maturityFraction(inst, def) < 1) count++;
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
        if (target instanceof Element && target.closest(".hud-panel, .panjim-toggles, .maya, .hud-tooltip, .instrument-cluster, .panjim-clock, .map-corner, .get-ready, .houses-counter")) return;
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

    const lock = this.run.replaySnapshots.get(challenge.id);
    // Maya explains what actually happened, from the resolved storm.
    const told = this.run.zones ? mayaAftermath(outcome, this.host.state, this.run.zones, record?.savedBy) : null;
    this.maya.setState(told?.mood ?? "idle");
    const choice = await this.aftermath.show({
      maya: told?.text ?? null,
      mayaMood: told?.mood ?? null,
      title: `${challenge.name} · end of ${challenge.year}`,
      stars: outcome.stars,
      housesSaved: outcome.housesSaved,
      housesDamaged: outcome.housesDamaged,
      housesTotal: outcome.housesTotal,
      // With Maya's line, the card keeps one voice: the old line stays only
      // to report a structure that failed, and the "saved the most" estimate
      // only when Maya has nothing to say.
      line: this.run.zones && (!told || outcome.zones.some((zone) => zone.failed.length > 0)) ? aftermathLine(challenge.kind, outcome, this.host.state, this.run.zones, failedIds) : "",
      hero: this.run.zones && !told ? topDefenceLine(outcome, this.host.state, this.run.zones) : null,
      replayLabel: lock && !this.run.finished ? `Replay from ${this.run.config.startYear + lock.turn}` : null,
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

  /** Rewinds to a snapshot (the start of a storm's warning), redraws the board and re-shows its path. Measured: it must stay well under 3 s. */
  private rewindTo(snapshot: RunSnapshot, challenge: ScheduledChallenge): void {
    const start = performance.now();
    this.run.restore(snapshot);
    this.host.redrawBoard();
    this.showForecast(challenge);
    this.clock.set(this.clockView());
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
    this.saveRun();
    this.host.telemetry.emit("checkpoint", { rewind: challenge.id, ms: Math.round(performance.now() - start) });
    this.host.showBanner(`Back to ${this.run.label}. The ${challenge.name.toLowerCase()} comes at the end of ${challenge.year}.`, 4500);
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
      income: this.run.income
    });
  }

  /** 2050: the skyline reveal, the title, then the finale card; then the shell's results. */
  private async finale(): Promise<void> {
    this.host.cancelRiskIntro("hazard");
    this.busy = true;
    this.syncControls();
    const result = this.result();
    this.host.revealSkyline();
    await this.finaleCard.title(this.run.totalYears, this.run.schedule.length);
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
    return `riptide-rising:panjim2050:v2:${this.host.level.id}`;
  }

  /** Writes the run to this device: the board, every replay snapshot (so Replay survives a reload), and real time played. */
  saveRun(): void {
    try {
      localStorage.setItem(
        this.saveKey(),
        JSON.stringify({
          snapshot: this.run.snapshot(),
          locks: [...this.run.replaySnapshots],
          playMs: this.playMsBefore + this.host.telemetry.elapsed(),
          // The first-warning risk sequence plays once a playthrough, reloads included.
          riskIntroSpent: this.riskGate.spent,
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

  /** On load: if this level has a save part-way through, the brief offers to continue it. */
  private offerSavedRun(): void {
    // Saves from the quarterly clock (v1, keyed by level and seed) cannot be continued: they are cleared.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(`riptide-rising:panjim2050:v1:${this.host.level.id}`)) localStorage.removeItem(key);
      }
    } catch {
      // Storage blocked: nothing to clear.
    }
    let saved: { snapshot: RunSnapshot; locks: [string, RunSnapshot][]; playMs: number; riskIntroSpent?: boolean } | null = null;
    try {
      const raw = localStorage.getItem(this.saveKey());
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    // A save from the quarterly clock (version 1) cannot be read by the yearly one: it is not offered.
    if (!saved || saved.snapshot?.version !== 2 || saved.snapshot.turn >= this.run.totalYears) return;
    const label = String(this.run.config.startYear + saved.snapshot.turn);
    const data = saved;
    this.host.offerResume(`Continue from ${label}`, () => {
      this.run.restore(data.snapshot);
      for (const [id, lock] of data.locks) this.run.replaySnapshots.set(id, lock);
      this.playMsBefore = data.playMs ?? 0;
      // Already seen in this playthrough (or a storm has passed): it does not play again.
      if (data.riskIntroSpent || this.run.landed.size > 0) this.riskGate.markSpent();
      this.host.redrawBoard();
      const next = this.run.nextChallenge();
      if (next && this.run.yearsUntil(next) <= HEAT_LEAD_YEARS) this.showForecast(next);
      this.clock.set(this.clockView());
      this.renderOutlook();
      this.host.refresh();
      this.syncControls();
    });
  }

  /**
   * Draws a storm's path in the scene while its warning is up: every tile its
   * water would reach on a board with no defences (the same hazard model the
   * storm runs), hardest hit strongest, and the strength label at its
   * landfall (a cyclone) or over the hardest-hit water nearest the city (a
   * flood).
   */
  private showForecast(challenge: ScheduledChallenge): void {
    if (!this.run.zones || !this.run.climate) return;
    const reach = this.run.exposureFor(challenge, true);
    const tiles: { coord: AxialCoord; weight: number }[] = [];
    for (const [key, value] of reach?.exposure ?? []) {
      if (value <= 0) continue;
      const [q, r] = key.split(",").map(Number);
      tiles.push({ coord: { q, r }, weight: Math.max(0.35, value) });
    }
    this.host.showForecastZones(tiles);
    const site = this.run.landfallOf(challenge);
    const centre = site === null ? null : this.run.board().sites[site];
    const hardest = [...(reach?.exposure ?? [])].filter(([, v]) => v >= 1).map(([key]) => key);
    this.forecastAnchor = centre ? nearestTo([centre], this.host.focus) : nearestTo(hardest.length > 0 ? hardest : tiles.map((t) => `${t.coord.q},${t.coord.r}`), this.host.focus);
    const icons = strengthIcons(challengeStrength(this.run.climate, challenge));
    const what = challenge.kind === "cyclone" ? "Cyclone landfall" : challenge.kind === "flood" ? "Flood rises here" : "Surge and flood meet here";
    this.forecastLabel.innerHTML = `<b>${what}</b> <span class="forecast-strength">${"●".repeat(icons)}${"○".repeat(3 - icons)}</span><span class="forecast-when">end of ${challenge.year}</span>`;
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
    this.recheckRiskIntroMode();
  }

  /** The mode the risk sequence started in, while it may still be playing. */
  private riskIntroModeStarted: RiskIntroMode | null = null;

  private currentRiskIntroMode(): RiskIntroMode {
    const reduced = this.motionToggle?.value || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    return riskIntroMode(Boolean(reduced), this.quality);
  }

  /** If Calm motion or the quality changes the sequence's mode while it plays, it stops (it never switches style half way). */
  private recheckRiskIntroMode(): void {
    if (this.riskIntroModeStarted && this.currentRiskIntroMode() !== this.riskIntroModeStarted) {
      this.host.cancelRiskIntro("mode changed");
      this.riskIntroModeStarted = null;
    }
  }

  /**
   * The Status button's danger mark: a storm warning is up (the heat is on),
   * or Resilience has fallen since the panel was last opened. Never a number.
   */
  private updateDanger(): void {
    const resilience = this.host.state.resilience;
    if (this.lastResilience !== null && resilience < this.lastResilience - 0.001) this.resilienceDropUnseen = true;
    this.lastResilience = resilience;
    this.panels.status.setDanger(this.exposure !== null || this.resilienceDropUnseen);
  }

  frame(): void {
    const now = performance.now();
    if (now >= this.nextDangerMs) {
      this.nextDangerMs = now + 300;
      this.updateDanger();
    }
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
    // Below the clock and the banner that sits under it (the label is drawn above its anchor).
    const y = Math.min(rect.height - 70, Math.max(290, screen.y));
    this.forecastLabel.classList.toggle("offscreen", x !== screen.x || y !== screen.y);
    this.forecastLabel.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -120%)`;
  }

  /** Repair a worn defence or damaged house: uses one of this year's builds. */
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
    this.host.telemetry.action("repair", 1);
    this.afterAction(outcome);
    return true;
  }

  /** True while a storm plays: the board waits for it rather than queueing actions behind it. */
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
    if (!outcome.ok) {
      if (outcome.reason && this.run.buildsLeft <= 0) {
        this.host.showBanner(outcome.reason, 2500);
        this.clock.nudge();
      }
      return false;
    }
    this.host.placeElement(coord, elementId);
    this.host.telemetry.action("build", 1);
    this.afterAction(outcome);
    // The year's last build: the Next year button says it is the way on.
    if (this.run.buildsLeft <= 0) this.clock.nudge();
    return true;
  }

  demolish(coord: AxialCoord): boolean {
    this.host.cancelRiskIntro("build");
    if (this.busy) return false;
    this.noteBoard();
    const outcome = this.run.demolish(coord);
    if (!outcome.ok) return false;
    this.host.removeElementVisual(coord);
    this.host.telemetry.action("demolish", 0);
    this.afterAction(outcome);
    return true;
  }

  /** After a build, repair or demolition: its events (combos, Get ready jobs), then the clock and the HUD. */
  private afterAction(outcome: ActionOutcome): void {
    for (const event of outcome.events) this.handleEvent(event);
    this.clock.set(this.clockView());
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
  }

  /**
   * Next year: ends this year, whatever builds are left. A storm whose year
   * it is resolves first and is staged in full; then the new year ticks in.
   * On the last turn the run ends and the finale plays.
   */
  async nextYear(): Promise<void> {
    if (this.busy || this.run.finished) return;
    this.host.cancelRiskIntro("time passing");
    this.noteBoard();
    const left = this.run.buildsLeft;
    const outcome = this.run.nextYear();
    if (!outcome.ok) return;
    this.host.telemetry.action("next_year", 0);
    this.host.telemetry.emit("next_year", { turn: this.run.turnNumber, buildsUnused: left });
    this.busy = true;
    this.syncControls();
    try {
      // The storm of the year that just ended first, then the new year.
      for (const event of outcome.events) if (event.type === "challenge") this.handleEvent(event);
      const pending = this.pendingChallenges;
      this.pendingChallenges = [];
      this.stagingYearEnd = pending.length > 0;
      for (const staged of pending) await this.stageChallenge(staged.challenge, staged.outcome, staged.failedIds);
      this.stagingYearEnd = false;
      for (const event of outcome.events) if (event.type !== "challenge") this.handleEvent(event);
      if (!this.run.finished) this.clock.tick(this.clockView());
      else this.clock.set(this.clockView());
    } finally {
      this.stagingYearEnd = false;
      this.busy = false;
    }
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
    if (this.run.finished) {
      this.clearSave();
      await this.finale();
    } else {
      // Every new year is saved, so a reload continues from it.
      this.saveRun();
    }
  }

  private handleEvent(event: RunEvent): void {
    switch (event.type) {
      case "warning": {
        playSound("hazard_telegraph");
        this.outlook.pulse();
        this.host.showBanner(`${event.challenge.name} at the end of ${event.challenge.year}. The red shows where it will hit.`, 4200);
        this.showForecast(event.challenge);
        break;
      }
      case "challenge": {
        playSound("hazard_arrival");
        this.clearForecast();
        if (event.outcome) {
          // Which kinds of thing failed, read before the meshes go: the
          // resolver has already removed them from the game state.
          const failedIds = event.outcome.zones.flatMap((zone) => zone.failed).map((key) => this.preChallengeIds.get(key) ?? "");
          this.pendingChallenges.push({ challenge: event.challenge, outcome: event.outcome, failedIds });
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
        // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
        if (event.reward > 0) playSound("coin");
        window.setTimeout(() => playSound("chime"), 180);
        this.getReady.celebrate(event.objective);
        // A short cheer: a pose, not a line, so it never uses up her one line.
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
      case "year":
        break;
    }
  }

  private syncControls(): void {
    this.clock.setControlsEnabled(!this.busy && !this.run.finished);
  }

  /** Scenario helper: presses Next year until `yearsLeft` years remain before the next storm (never past one). */
  private async waitUntilYearsLeft(yearsLeft: number): Promise<boolean> {
    const next = this.run.nextChallenge();
    if (!next || this.run.yearsUntil(next) < yearsLeft) return false;
    while (this.run.yearsUntil(next) > yearsLeft) {
      await this.nextYear();
      await this.idle();
    }
    return true;
  }

  /**
   * Scenario helper: builds through the player's own path, pressing Next
   * year first when this year's builds are used up, but never into a storm's
   * year end (it stops instead). Returns whether the build went through.
   */
  private async buildNow(coord: AxialCoord, elementId: string): Promise<boolean> {
    if (this.run.buildsLeft <= 0) {
      const next = this.run.nextChallenge();
      if (next && this.run.yearsUntil(next) <= 1) return false;
      await this.nextYear();
      await this.idle();
    }
    this.collectJar();
    const ok = this.build(coord, elementId);
    await this.idle();
    return ok;
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
      const coord = this.firstBuildableIn(zone, element);
      if (coord && (await this.buildNow(coord, element))) planted++;
    }
  }

  /**
   * Scenario helper: defends like a player reading the warning: up to
   * `count` defences that answer the next storm, on buildable tiles beside
   * the houses shown at risk, strongest first, through the player's own
   * build path. Never presses Next year into the storm.
   */
  private async defendRisk(count: number): Promise<number> {
    const next = this.run.nextChallenge();
    const exposure = next ? this.run.exposureFor(next) : null;
    if (!next || !exposure) return 0;
    const hazards = hazardsOf(next.kind);
    const answers = [...ELEMENT_BY_ID.values()]
      .filter((def) => (def.effects.resilience ?? 0) > 0 && def.targetsHazards?.some((h) => hazards.includes(h as "cyclone" | "flood")))
      .sort((a, b) => (b.effects.resilience ?? 0) - (a.effects.resilience ?? 0) || a.buildCost - b.buildCost);
    const risk = exposure.housesAtRisk.map((key) => key.split(",").map(Number));
    let built = 0;
    for (const [q, r] of risk) {
      if (built >= count) break;
      for (const n of [{ q, r }, ...neighbors({ q, r })]) {
        const def = answers.find((d) => this.host.state.canBuild(n, d.id));
        if (!def) continue;
        if (await this.buildNow(n, def.id)) built++;
        else return built;
        break;
      }
    }
    return built;
  }

  /** Scenario helper: frames the camera on the next storm: a cyclone's landfall, else its first zone. */
  private frameNextStorm(): void {
    const next = this.run.nextChallenge();
    if (!next || !this.run.zones) return;
    const site = this.run.landfallOf(next);
    if (site !== null) {
      const key = this.run.board().sites[site];
      if (key) {
        const [q, r] = key.split(",").map(Number);
        this.host.focusCamera({ q, r }, true);
        return;
      }
    }
    const keys = this.run.zones.keys(FRONTS[next.kind][0].path[0]);
    const coords = keys.map((key) => {
      const [q, r] = key.split(",").map(Number);
      return { q, r };
    });
    const centre = coords.reduce((acc, c) => ({ q: acc.q + c.q / coords.length, r: acc.r + c.r / coords.length }), { q: 0, r: 0 });
    this.host.focusCamera(centre, true);
  }

  /** Scenario helper: presses Next year and, while the storm plays, hurries it and closes its Aftermath like a player would, until the year has turned. */
  private async pressThrough(stopAt?: () => boolean): Promise<boolean> {
    void this.nextYear();
    await wait(60);
    while (this.busy) {
      if (stopAt?.()) return true;
      if (this.host.challengeFx.isPlaying() || this.replayCard.isOpen) document.dispatchEvent(new PointerEvent("pointerdown"));
      const cont = this.host.container.querySelector<HTMLButtonElement>(".aftermath-continue");
      if (this.aftermath.isOpen && cont) cont.click();
      await wait(100);
    }
    return stopAt?.() ?? false;
  }

  /**
   * Test-only scenarios for the screenshot and QA tools: puts the board in a
   * state worth photographing. Uses the same actions a player has.
   */
  async scenario(name: string): Promise<boolean> {
    // "heat-N": press Next year until N years remain before the next storm
    // (1 = its own year), building nothing. "heat-defend": plant three defences on its path first.
    // "maya-warn-<place>": a warning about a named place, with the camera glide a real one has (the layout tests).
    // She does not move: only the camera does.
    const warn = /^maya-warn-(.+)$/.exec(name);
    if (warn) {
      const wanted = warn[1].replace(/-/g, " ").toLowerCase();
      const spot = this.host.landmarks.find((l) => l.name.toLowerCase().includes(wanted));
      if (!spot) return false;
      const coord = { q: spot.q, r: spot.r };
      this.maya.dismiss();
      this.maya.say({
        id: `sample-warn:${performance.now()}`,
        text: `${spot.name} is exposed! Strengthen it before the storm.`,
        state: "warning",
        urgent: true,
        onShow: () => this.host.focusCamera(coord)
      });
      this.maya.next();
      return true;
    }
    // "maya:<state>": Maya says a sample line in that state (for the screenshots).
    const pose = /^maya:(\w+)$/.exec(name);
    if (pose) {
      const samples: Record<string, string> = {
        greeting: "Hello! I am Maya. Let us keep Panjim dry.",
        tip: "Dunes and pandanus shield the beach from a cyclone's surge.",
        explains: "A khazan holds floodwater, so nearby homes stay drier.",
        warning: "Taleigao is exposed! Strengthen it before the flood.",
        worried: "We lost 6 homes at Taleigao. A few more defences there next time and they will stand.",
        celebrates: "The mangroves at Taleigao held 40 homes."
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
      if (!(await this.waitUntilYearsLeft(1))) return false;
      void this.nextYear();
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
      const ok = await this.waitUntilYearsLeft(Number(heat[1]));
      this.frameNextStorm();
      return ok;
    }
    // "year-N": presses Next year (playing any storm through) until it is turn N.
    const year = /^year-(\d+)$/.exec(name);
    if (year) {
      const target = Number(year[1]);
      while (!this.run.finished && this.run.turnNumber < target) await this.pressThrough();
      return this.run.turnNumber === target;
    }
    switch (name) {
      case "next-year": {
        await this.pressThrough();
        return true;
      }
      case "past-storm": {
        // Plays through the next storm (accepting its Aftermath), so the
        // shots that follow are about the one after it.
        const next = this.run.nextChallenge();
        if (!next) return false;
        while (!this.run.landed.has(next.id)) await this.pressThrough();
        return true;
      }
      case "prep-one": {
        // Finishes the first Get ready job through the player's build path.
        const job = this.run.prep.find((j) => !j.done);
        if (!job || !this.run.zones) return false;
        for (let i = 0; i < job.count; i++) {
          const coord = this.firstBuildableIn(job.zone, job.elementId);
          if (coord) await this.buildNow(coord, job.elementId);
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
      case "defend-risk": {
        // A player's answer to the warning: defences beside the red houses.
        const built = await this.defendRisk(8);
        this.frameNextStorm();
        return built > 0;
      }
      case "forecast": {
        // Up to the start of the warning (two years out), then a few beach
        // defences, so the overlay, the label and the gauge all have something to show.
        if (!(await this.waitUntilYearsLeft(HEAT_LEAD_YEARS))) return false;
        for (let i = 0; i < 4; i++) {
          const coord = this.firstBuildableIn("z1", "dune");
          if (!coord || !(await this.buildNow(coord, "dune"))) break;
        }
        return true;
      }
      case "guide": {
        this.fieldGuide.open();
        return true;
      }
      case "growth": {
        // A mangrove belt planted now, then three years on.
        for (let i = 0; i < 4; i++) {
          const mangrove = this.firstBuildableIn("z4", "mangrove");
          if (mangrove) await this.buildNow(mangrove, "mangrove");
        }
        for (let y = 0; y < 3; y++) await this.pressThrough();
        return true;
      }
      case "challenge":
      case "stage": {
        // Some beach defences first, so the staging has something to show;
        // then on to the storm. "challenge" hands back at the Aftermath,
        // "stage" mid-storm, with the Houses saved counter running.
        for (let i = 0; i < 6; i++) {
          const element = i % 2 === 0 ? "dune" : "sandy_vegetation";
          const coord = this.firstBuildableIn("z1", element);
          if (coord) await this.buildNow(coord, element);
        }
        if (!(await this.waitUntilYearsLeft(1))) return false;
        void this.nextYear();
        if (name === "challenge") {
          while (!this.aftermath.isOpen) await wait(100);
          await wait(1800); // the stars fill
        } else {
          while (!this.host.container.querySelector(".houses-counter.live")) await wait(50);
          await wait(1200); // a few houses into the count
        }
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
        if (!(await this.waitUntilYearsLeft(1))) return false;
        void this.nextYear();
        while (!this.replayCard.isOpen) {
          if (this.host.challengeFx.isPlaying()) document.dispatchEvent(new PointerEvent("pointerdown"));
          await wait(150);
        }
        await wait(700);
        return true;
      }
      case "finale": {
        // Plays the whole run, accepting each Aftermath, and hands back at the finale card.
        const atFinale = (): boolean => Boolean(this.host.container.querySelector(".finale-card"));
        while (!this.run.finished) if (await this.pressThrough(atFinale)) return true;
        while (!atFinale()) await wait(100);
        return true;
      }
      case "smart-forecast":
        await this.playCarefully(() => this.run.nextChallenge() !== null && this.run.yearsUntil(this.run.nextChallenge()!) <= HEAT_LEAD_YEARS && this.isGreen());
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
        for (const elementId of ["dune", "mangrove", "seawall", "breakwater"]) {
          const coord = this.firstBuildable(elementId);
          if (coord) await this.buildNow(coord, elementId);
        }
        await this.pressThrough();
        return true;
      }
      default:
        return false;
    }
  }

  /** True once the next storm's gauge is green. */
  private isGreen(): boolean {
    const readiness = this.run.readiness();
    return !readiness || readiness.level === "green";
  }

  /**
   * A careful player, scripted, for the browser's final check: repairs what
   * was worn, tops up the threatened zones until the gauge is green (dunes
   * and pandanus on the beach, mangroves and khazan in the wetlands and on
   * the waterfront), then presses Next year. Uses only the actions a player
   * has; continues through each Aftermath. Stops when `until` is true
   * (checked between actions, and while an Aftermath is open when
   * `stopAtAftermath`).
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
      if (this.run.buildsLeft > 0) {
        for (const [key, inst] of this.host.state.elements) {
          if (inst.degradeAmount <= 0 || ELEMENT_BY_ID.get(inst.elementId)?.kind === "building") continue;
          const [q, r] = key.split(",").map(Number);
          acted = this.repair({ q, r });
          if (acted) break;
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
      }
      if (!acted) {
        // Nothing more to do this year: on to the next, answering any Aftermath it brings.
        const stop = stopAtAftermath ? () => this.aftermath.isOpen && until() : () => until();
        if (await this.pressThrough(stop)) return;
      }
      await wait(30);
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
    this.jar?.dispose();
    this.fieldGuide.dispose();
    this.panels.dispose();
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
