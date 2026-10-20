import { ActionRun, type ActionOutcome, type RunEvent } from "@core/actionRun";
import type { GameState } from "@core/gameState";
import { FrameSampler, autoStep, nextChoice, type Quality, type QualityChoice } from "@core/quality";
import type { StormRecord } from "@core/stormRecord";
import { drawStormCard, type StormCardInput } from "@ui/panjim/stormCard";
import { forecastPlaceCandidates } from "@ui/panjim/forecastPlaces";
import { replaySteps } from "@core/stormReplay";
import { ReplayCard } from "@ui/panjim/replayCard";
import { setSoundEnabled, setSoundVolume, soundVolume } from "@ui/audioHooks";
import type { AxialCoord } from "@core/hex";
import type { Telemetry } from "@core/telemetry";
import type { LevelDef } from "@levels/levels";
import { ClockHud, type ClockView } from "@ui/panjim/clockHud";
import { OutlookBar } from "@ui/panjim/outlookBar";
import { CoinJar } from "@ui/panjim/coinJar";
import { GetReadyPanel } from "@ui/panjim/getReady";
import { prepProgress, regionPlaces, type PrepObjective } from "@core/prep";
import { FieldGuide } from "@ui/panjim/fieldGuide";
import { COMBO_INFO, type ComboId } from "@core/combos";
import { strengthIcons, challengeStrength, type ScheduledChallenge } from "@core/climate";
import { FRONTS, type ChallengeOutcome, type ZoneDef, type ZoneOutcome } from "@core/zones";
import type { RunSnapshot } from "@core/actionRun";
import { ResultCards, resultCard, defencesCard, comingUpCard, finalCard, tutorialResultCard, type CardSpec, type CardsChoice } from "@ui/panjim/resultCards";
import { nextLabel, phaseResult, type Place } from "@core/phaseResult";
import MAYA_DATA from "@data/maya.json";
import { FinaleCard } from "@ui/panjim/finaleCard";
import { computePanjimIndex, tempoBadge, type PanjimIndex } from "@core/panjimIndex";
import { axialToWorld, neighbors } from "@core/hex";
import { ELEMENT_BY_ID } from "@core/elements";
import { playSound } from "@ui/audioHooks";
import { buildHeatView, hazardsOf, HEAT_LEAD_YEARS, type Exposure, type HeatViewTile } from "@core/exposure";
import { RiskIntroGate, riskIntroMode, type RiskIntroMode } from "@core/riskIntro";
import { PrefToggle, isTyping, togglesRow } from "@ui/panjim/hudToggles";
import { tooltipText } from "@ui/tooltip";
import { Maya, type MayaState } from "@ui/panjim/maya";
import { MayaDirector, GUIDE_NOTES, staleTip } from "./mayaDirector";
import { factById } from "@core/facts";
import { HudPanels } from "@ui/panjim/hudPanels";
import type { ConeShow } from "@render/forecastConeOverlay";
import { factNote } from "@core/mayaLines";
import { NuggetPopup } from "@ui/nuggetPopup";
import { boardFingerprint, panjimSaveKey, saveFits, savedRunYear } from "@levels/savedRun";
import { isPhaseLine, MAYA, noteIdsFor, stormWord, TUTORIAL_LINES } from "@core/mayaLines";
import type { RunThen } from "@core/levelScore";
import { PANAJI_LEVEL_ID } from "@ui/screens/runWords";
import { forecastLine } from "@core/forecastCone";
import { renderConePreview } from "@ui/panjim/conePreview";
import type { Tooltips } from "@ui/tooltip";
import type { BuildCard } from "@ui/buildPopover";
import { CARD_ICON, CARD_LINE, CARD_NAME, DEFENCE_ORDER } from "@ui/panjim/defenceCards";
import { SHOW_MAYA } from "@services/features";
import { leaveText } from "@ui/panjim/modalStack";

/** The state classes a Panjim session puts on the shared game layer (Section 16): cleared when one starts and ends. */
const SESSION_CLASSES = ["has-built", "storm-hold", "storm-playing", "slowmo", "has-result-cards"];

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
  /** The run is over: record it, then the results screen, or (`then`) play again, the menu or another level. */
  onRunComplete: (result: PanjimIndex, then?: RunThen) => void;
  /** The skyline reveal: the camera pulls back over the whole city. */
  revealSkyline: () => void;
  showBanner: (text: string, ms?: number) => void;
  /** A short note beside a tile for `ms` (Section 16 B6: the build that counts for no objective). */
  noteAt: (coord: AxialCoord, text: string, ms: number) => void;
  /**
   * The landmarks whose labels show at the usual zoom (Section 16 B6): those in the current storm's area, and the
   * ones its objective pins (`pinned`: the pin carries the name, so the label stands aside).
   */
  highlightPlaces: (names: readonly string[], pinned: readonly string[]) => void;
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
  /** A panel beside the opening brief's text (the first storm's forecast map). */
  addBriefFeature: (el: HTMLElement) => void;
  /** Adds a second button to the level brief ("Continue from 2032"). `onBegin` runs instead when the player starts afresh. */
  offerResume: (label: string, onResume: () => void, onBegin: () => void, savedYear: string) => void;
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
  /** Draws the forecast cone (null fades it out). */
  showCone: (cone: ConeShow | null) => void;
  /** Glides the camera to frame a box of the board, in world x/z. */
  frameWorld: (box: { minX: number; maxX: number; minZ: number; maxZ: number }) => void;
  /** The phase's area to protect, faintly, once the cone has gone (an empty list fades it out). */
  showAreaOutline: (keys: string[]) => void;
  /** "Area protected", where the outline was. */
  areaProtected: () => void;
  /** Pins the places open objectives name. */
  showPins: (pins: { name: string; q: number; r: number }[]) => void;
  /** The outline, pins and bottom prompt on or off (off while a storm or its result cards are on screen). */
  setGuidanceVisible: (visible: boolean) => void;
  /** Draws the warning heat (an empty list clears it). */
  /** The risk heat; `warning`: in the warning years before the storm (the heat then takes over from the area's outline). */
  showHeat: (tiles: HeatViewTile[], warning: boolean) => void;
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
  /** The map's locality labels, for an objective's area of named localities (Section 16.5). */
  localities: readonly { name: string; q: number; r: number }[];
  /** The map's monuments (named buildings), for the result cards' places. */
  monuments: readonly { name: string; q: number; r: number }[];
  /** True while the build menu or the opening brief is open: Maya stays quiet. */
  uiBlocked: () => boolean;
  /** ☰ → Leave Panjim (Section 16 B3): asks first, as Esc does. */
  requestLeave: () => void;
  /** ☰ → Start again (Section 16 B3): asks first; then the run starts afresh from its start popup. */
  requestRestart: () => void;
  /** A layer a storm waits for is open (Section 16 B5, `STORM_WAITS_FOR`): the storm and its cards wait. */
  stormLayersOpen: () => boolean;
  /** The session's tooltip manager, for this run's own controls. */
  tooltips: Tooltips;
}

export class PanjimController {
  readonly run: ActionRun;
  /**
   * The Tutorial (Section 15): the same game on a small coast, three builds
   * and one cyclone. Maya coaches it with four scripted lines instead of her
   * tips and warnings; the storm's one result card leads on to Panaji; there
   * is no finale and no save.
   */
  readonly tutorial: boolean;
  /** Years before a storm that its red heat shows: the last one only in the Tutorial, where Maya explains it then (Section 15). */
  get heatLeadYears(): number {
    return this.tutorial ? 1 : HEAT_LEAD_YEARS;
  }
  /** Which of the Tutorial's coaching lines have been said. */
  private readonly coached = new Set<string>();
  /** What the Tutorial's result card was closed with. */
  private tutorialChoice: CardsChoice = "button";
  private readonly clock: ClockHud;
  private readonly outlook: OutlookBar;
  // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
  /** The coin jar, with coins on only. */
  private readonly jar: CoinJar | null;
  /** "Get ready": the jobs for the next storm. */
  private readonly getReady: GetReadyPanel;
  /** The first storm's objective, in the Status panel. */
  readonly fieldGuide: FieldGuide;
  private busy = false;
  /** The first-warning risk sequence plays once a playthrough (core/riskIntro.ts). */
  private readonly riskGate = new RiskIntroGate();
  /** Whether the forecast cone is on the board now (Section 8: no chip or legend on the game screen). */
  private coneShown = false;
  /** Storms whose cone has been shown: each shows once, at the start of its phase, never again (a reload included). */
  private readonly coneSeen = new Set<string>();
  /** True while a storm that ended a year is being staged: the HUD still shows that year. */
  private stagingYearEnd = false;
  /** Storms that resolved at the end of this year, staged before the next year shows. */
  private pendingChallenges: { challenge: ScheduledChallenge; outcome: ChallengeOutcome; failedIds: string[] }[] = [];
  /** The last readiness reading for each challenge before it landed, for telemetry. */
  private readonly readinessById = new Map<string, string>();
  /** The end-of-phase result cards (Section 9). */
  private readonly resultCards: ResultCards;
  private readonly finaleCard: FinaleCard;
  /** Real milliseconds played before this session, when resuming a save: the tempo badge counts the whole run. */
  playMsBefore = 0;
  /** The in-scene label over a storm's landfall or source while its warning is up: "Cyclone landfall ●○○". */
  /**
   * "Show risk" (R): the live risk heat on or off (Section 21.4). Off when a storm's phase begins, on by itself
   * in the last years before it (the warning years), and the player's to switch at any time; not remembered.
   */
  readonly riskToggle: PrefToggle;
  /** The latest exposure preview of the next storm, while it is inside the warning window. Read by Maya and the Get ready panel. */
  exposure: Exposure | null = null;
  private readonly keyAbort = new AbortController();
  /** Maya, the field guide, and the rules for when she speaks. */
  readonly maya: Maya;
  readonly mayaDirector: MayaDirector;
  /** Picks the fact Maya tells when an element is built (nuggetPopup.ts). */
  readonly nuggets: NuggetPopup;
  /** The HUD's panels: ☰ (and Status, coins on only), each shut to a small button (hudPanels.ts). */
  readonly panels: HudPanels;
  /** Where the street-map switch goes in ☰ (the session puts it there, on a map that has one). */
  readonly menuStreetSlot: HTMLElement;
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
    this.tutorial = host.level.tutorial === true;
    // No risk wave in the Tutorial: the heat comes with Maya's own line about it, and nothing competes with her.
    if (this.tutorial) this.riskGate.markSpent();
    this.run = new ActionRun(host.state, host.level.timeline, {
      climate: host.level.climate,
      zones: host.zones,
      houseStars: host.level.houseStars,
      houseRule: host.level.houses?.rule,
      prep: host.level.prep,
      economy: host.level.economy,
      growth: host.level.growth,
      landmarks: host.landmarks,
      localities: host.localities
    });
    // The game layer is shared by every session (appShell): no state class from the last run may carry over.
    host.container.classList.remove(...SESSION_CLASSES);
    host.container.classList.add("has-panjim-clock");
    this.clock = new ClockHud(host.container, { onSkipYear: () => void this.skipYear() });
    this.outlook = new OutlookBar(this.clock.outlookSlot);
    // One top bar (Section 16 B2): the pill at its right end, the countdown on the next storm's marker.
    this.outlook.mountRisk(this.clock.riskSlot);
    this.clock.onCountdown = (text) => this.outlook.setCountdown(text);
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    this.jar = this.run.economyEnabled ? new CoinJar(host.container, () => this.collectJar()) : null;
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    this.getReady = new GetReadyPanel(this.run.economyEnabled);
    // Hovering a row lights the tiles that count for it (Section 12).
    this.getReady.onRowHover((job) => this.host.tintTiles(job ? (job.tiles ?? []).map((key) => ({ key, color: "#fff3c4", blend: 0.5 })) : null));
    host.mountPanel(this.getReady.el);
    this.fieldGuide = new FieldGuide(host.container, () => host.telemetry.reward("species"));
    // Section 17c: Maya's notes come from her; hidden, the guide is the species alone.
    this.fieldGuide.showNotes(SHOW_MAYA);
    this.resultCards = new ResultCards(host.container);
    this.finaleCard = new FinaleCard(host.container);
    this.replayCard = new ReplayCard(host.container);
    this.riskToggle = new PrefToggle(
      host.container,
      { storageKey: "riptide-rising:show-risk:v1", label: "Show risk", shortcut: "R", defaultOn: false, className: "risk-toggle", persist: false },
      (on) => {
        // Set by riskDefaults inside renderHeat, which goes on with the new state: nothing to redo.
        if (this.riskDefaulting) return;
        if (!on) this.host.cancelRiskIntro("risk hidden");
        this.renderHeat();
      }
    );
    this.mayaToggle = new PrefToggle(
      host.container,
      { storageKey: "riptide-rising:maya-voice:v1", label: "Maya", shortcut: "M", defaultOn: true, className: "maya-toggle" },
      (on) => this.maya.setMuted(!SHOW_MAYA || !on)
    );
    // Section 17c: with Maya hidden, her switch is not in ☰ (and M does nothing).
    if (!SHOW_MAYA) this.mayaToggle.el.remove();
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
        if (SHOW_MAYA && (event.key === "m" || event.key === "M")) this.mayaToggle.toggle();
        if (event.key === "s" || event.key === "S") this.soundToggle.toggle();
      },
      { signal: this.keyAbort.signal }
    );
    // Section 17c: hidden, she is muted for good and never drawn (`no-maya`, panjim.css).
    this.maya = new Maya(host.container, { muted: !SHOW_MAYA || !this.mayaToggle.value, reducedMotion: prefersReducedMotion() });
    host.container.classList.toggle("no-maya", !SHOW_MAYA);
    this.mayaDirector = new MayaDirector(this.maya, {
      run: this.run,
      exposure: () => this.exposure,
      blocked: () => this.busy || this.host.uiBlocked() || this.resultCards.isOpen || this.fieldGuide.isOpen || Boolean(this.host.container.querySelector(".finale-card")),
      project: (coord) => this.host.project(coord),
      focus: (coord) => this.host.focusCamera(coord),
      landmarks: host.landmarks,
      quiet: this.tutorial
    });
    // The Tutorial's first line waits for the opening card to close, like her hello does.
    if (this.tutorial) this.maya.say({ id: "tutorial:start", text: TUTORIAL_LINES.start, state: "greeting" });
    this.nuggets = new NuggetPopup(this.maya);
    this.maya.onSpoken = (line) => {
      const fact = line.fact ? factById(line.fact.id) : undefined;
      const note = fact ? factNote(fact) : GUIDE_NOTES.get(line.id);
      if (note) this.fieldGuide.addNote(note);
    };
    this.fieldGuide.onReplayNote = (note) => {
      if (!this.nuggets.replay(note.id)) this.mayaDirector.replay(note);
    };
    // Her count and the Field Guide's are one number (Section 13), out of the notes this level can give:
    // her first-job line or her hello (whichever she opened with), her tips, and the discoveries of what can be built.
    this.fieldGuide.countable = noteIdsFor({ opening: this.run.prep.some((job) => this.isOpeningJob(job)), excluded: host.state.excludedElements });
    this.nuggets.progressText = (factId) => this.fieldGuide.notesProgress(factId);
    // The HUD kept almost out of the way (hudPanels.ts): the instrument cluster, coin jar and Field Guide
    // button go into one panel and the toggles into another, each shut to a small button. The elements
    // are moved, not rebuilt: their handlers, ids and shortcuts (R, M, S) are the ones they were.
    // Section 16 B3: one ☰ menu, top right, beside "?". The Status panel exists only with coins on (the jar):
    // its meters (Resilience, Biodiversity, Carbon, Food, Population) change nothing the player sees in this
    // version, so the cluster is taken out of the page and the Field Guide moves into ☰.
    this.panels = new HudPanels(host.container, { status: this.run.economyEnabled });
    host.container.querySelector<HTMLElement>(".instrument-cluster")?.remove();
    if (this.panels.status) this.panels.status.adopt(this.jar?.el ?? null);
    this.menuStreetSlot = document.createElement("div");
    this.menuStreetSlot.className = "hud-menu-street";
    this.menuStreetSlot.hidden = true;
    this.panels.settings.adopt(this.fieldGuide.buttonEl, this.menuStreetSlot, togglesRow(host.container), this.menuActions());
    if (this.jar && this.panels.status) {
      const status = this.panels.status;
      this.jar.onGain = (text) => status.floatText(text);
    }
    this.attachTooltips();
    this.addForecastToBrief();
    const saveOffered = this.offerSavedRun();
    this.clock.set(this.clockView());
    this.renderOutlook();
    this.syncControls();
    // With a save on offer, the first cone waits for Begin: a player who continues never sees it.
    if (!saveOffered) this.showConeIfPhaseStart();
  }

  /**
   * The forecast cone, at the start of a storm's phase only (turns 1, 6 and
   * 16), for that storm only, and once: it goes for good with the player's
   * first build of the phase, and a cone already shown is never shown again,
   * after a reload included. Only the cone itself: its words and legend are on
   * the start popup and the result cards, never on the game screen.
   */
  private showConeIfPhaseStart(): void {
    const next = this.run.nextChallenge();
    if (!next || this.coneSeen.has(next.id) || this.run.turnNumber !== this.run.phaseStart(next)) return;
    const cone = this.run.forecastCone(next);
    if (!cone) return;
    this.coneSeen.add(next.id);
    this.host.showCone(cone);
    // Frame what the cone covers on land and its tracks, so the whole of it is in view.
    const points = [...cone.tracks.flatMap((t) => t.points), ...[...cone.bands.keys(), ...cone.meet, ...cone.area].filter((key) => this.host.state.placed.get(key)?.terrainId !== "coast").map((key) => {
      const [q, r] = key.split(",").map(Number);
      return axialToWorld({ q, r }, 1);
    })];
    if (points.length > 0) {
      this.host.frameWorld({
        minX: Math.min(...points.map((p) => p.x)),
        maxX: Math.max(...points.map((p) => p.x)),
        minZ: Math.min(...points.map((p) => p.z)),
        maxZ: Math.max(...points.map((p) => p.z))
      });
    }
    this.coneShown = true;
    this.host.telemetry.emit("checkpoint", { cone: next.id, tiles: cone.bands.size, area: cone.area.length });
  }

  /**
   * The first storm's forecast on the start popup (Section 8): the line "The
   * first cyclone lands in 5 years", the cone on a small map of the real
   * board, and its legend. The game screen shows the cone alone.
   */
  private addForecastToBrief(): void {
    const next = this.run.nextChallenge();
    if (!next || this.run.turnNumber !== 1) return;
    const preview = this.forecastPreview(next, true);
    if (preview) this.host.addBriefFeature(preview);
  }

  /**
   * The start popup's forecast for a saved run: the next storm as the save
   * stands ("The flood comes in 10 years"), in place of 2026's. Read on the
   * live run, put back exactly as it was.
   */
  private showSavedForecastOnBrief(snapshot: RunSnapshot): void {
    const fresh = this.run.snapshot();
    this.run.restore(snapshot);
    const next = this.run.nextChallenge();
    const preview = next ? this.forecastPreview(next, next.id === this.run.schedule[0]?.id) : null;
    this.run.restore(fresh);
    if (!preview) return;
    // Begin starts a new run with its own forecast: this one is about the save.
    const line = preview.querySelector(".cone-preview-line");
    if (line) line.textContent = `If you continue: ${line.textContent}`;
    this.host.container.querySelector(".brief-feature")?.remove();
    this.host.addBriefFeature(preview);
  }

  /**
   * The line under "Leave Panjim?" (Section 16 B5): the year the saved run continues from when there is one;
   * the Tutorial is never saved; a finished run is over (its result is recorded); else nothing was built yet.
   */
  leaveNote(): string {
    const savedYear = this.tutorial ? null : savedRunYear(this.host.level.id, this.run.config.startYear, this.run.totalYears);
    return leaveText({ tutorial: this.tutorial, savedYear, finished: this.run.finished, builds: this.run.turnNumber - 1 });
  }

  /** ☰'s last two items (Section 16 B3): Start again and Leave, each asking first. */
  /** ☰'s Start again and Leave (disabled while a storm plays, `syncControls`). */
  private menuActionsEl: HTMLElement | null = null;

  private menuActions(): HTMLElement {
    const box = document.createElement("div");
    box.className = "hud-menu-actions";
    this.menuActionsEl = box;
    const place = this.tutorial ? "the Tutorial" : "Panjim";
    box.innerHTML = `<button type="button" class="hud-menu-action hud-menu-restart">Start again</button><button type="button" class="hud-menu-action hud-menu-leave">Leave ${place}</button>`;
    box.querySelector(".hud-menu-restart")!.addEventListener("click", () => {
      this.panels.settings.close();
      this.host.requestRestart();
    });
    box.querySelector(".hud-menu-leave")!.addEventListener("click", () => {
      this.panels.settings.close();
      this.host.requestLeave();
    });
    return box;
  }

  /** Puts the street-map switch into ☰ (Section 16 B3). */
  mountStreetMap(el: HTMLElement): void {
    this.menuStreetSlot.appendChild(el);
    this.menuStreetSlot.hidden = false;
  }

  /** A row of the first storm's own objective (a later storm's own area has a heading too, Section 16.5). */
  private isOpeningJob(job: PrepObjective): boolean {
    return Boolean(job.heading) && job.challengeId === this.host.level.prep?.opening?.challengeId;
  }

  /** The forecast's map for `challenge` as the board stands, with its line and legend (the start popup; the result cards). */
  forecastPreview(challenge: ScheduledChallenge, first: boolean): HTMLElement | null {
    const cone = this.run.forecastCone(challenge);
    if (!cone) return null;
    const tiles = [...this.host.state.placed.values()].map((tile) => ({ key: `${tile.coord.q},${tile.coord.r}`, coord: tile.coord, terrainId: tile.terrainId }));
    // Panaji frames the cyclone's way in too (Section 16.4); the Tutorial's preview stays as it was.
    return renderConePreview({ tiles, cone, labels: this.forecastPlaces(challenge), line: forecastLine(challenge.kind, this.run.yearsUntil(challenge), first), frameTrack: !this.tutorial });
  }

  /** The places a forecast's map names: a storm's own area's (its `labels`, else the places it is named after; Section 16), else the places in its area to protect. */
  private forecastPlaces(challenge: ScheduledChallenge): { name: string; q: number; r: number }[] {
    return forecastPlaceCandidates(this.run, challenge, this.host.landmarks, this.host.localities);
  }

  private hideCone(): void {
    if (!this.coneShown) return;
    this.host.showCone(null);
    this.coneShown = false;
  }

  /** What the clock shows now. */
  private clockView(): ClockView {
    return {
      year: this.run.year,
      turn: Math.min(this.run.turnNumber, this.run.totalYears),
      totalYears: this.run.totalYears,
      until: this.untilView(),
      canSkip: !this.run.finished && !this.run.canBuildAnywhere(),
      finished: this.run.finished
    };
  }

  /** "Cyclone in N builds": the next storm and how many builds are left before it (it hits straight after the last). */
  private untilView(): { builds: number; storm: string } | null {
    const next = this.run.nextChallenge();
    if (!next || this.run.finished) return null;
    return { builds: this.run.buildsUntil(next), storm: untilWord(next.kind) };
  }

  /** The last readiness reading, for the gauge's tooltip. */
  private lastReadiness: ReturnType<ActionRun["readiness"]> = null;

  /** Tooltips on this run's controls, with live numbers. */
  private attachTooltips(): void {
    const tips = this.host.tooltips;
    const clock = this.clock.parts;
    tips.attach(clock.face, "clock", () => ({ label: this.run.label, turn: Math.min(this.run.turnNumber, this.run.totalYears), total: this.run.totalYears }));
    tips.attach(clock.skip, "skipYear");
    const outlook = this.outlook.parts;
    tips.attach(outlook.track, "outlookTrack", () => ({ start: this.run.config.startYear, end: this.run.config.endYear }));
    tips.attach(outlook.risk, "homesAtRisk", () => {
      const next = this.run.nextChallenge();
      const homes = next ? this.run.homesAtRisk(next) : 0;
      return { homes: `${homes} ${homes === 1 ? "home" : "homes"}`, storm: next ? stormWord(next.kind) : "storm" };
    });

    tips.attach(this.fieldGuide.buttonEl, "fieldGuide", () => ({ notes: this.fieldGuide.notesProgress(), found: this.fieldGuide.count, species: this.fieldGuide.speciesTotal }));
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
    const rows = zones ? this.run.prep.map((job) => ({ job, ...prepProgress(job, this.host.state, zones) })) : [];
    this.getReady.render(next ? next.name : null, rows);
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
    const warning = !!next && yearsLeft >= 1 && yearsLeft <= this.heatLeadYears;
    this.riskDefaults(next, warning);
    // Section 21.4: whenever Show risk is on, the next storm's risk on the board as it stands, at any year.
    this.exposure = next && (warning || this.riskToggle.value) ? this.run.exposureFor(next) : null;
    if (!next || !this.exposure || !this.riskToggle.value) {
      this.host.showHeat([], warning);
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
    this.host.showHeat(view, warning);
    // The first warning of the playthrough gets the risk sequence, once, if
    // nothing else is going on (it never waits for, or blocks, the player).
    // The risk sequence belongs to the warning years, as before.
    const hot = warning ? view.filter((tile) => tile.heat > 0).map((tile) => tile.key) : [];
    if (hot.length > 0) this.riskGate.see(next.id);
    if (hot.length > 0 && !this.riskGate.spent && !this.busy && !this.host.overlayOpen() && this.host.riskAreaOnScreen(hot) && this.riskGate.offer(next.id)) {
      this.riskIntroModeStarted = this.currentRiskIntroMode();
      this.host.startRiskIntro(this.riskIntroModeStarted, hot);
    }
  }

  /** The storm whose phase Show risk's defaults were last set for, and whether its warning years have switched it on. */
  private riskPhase: string | null = null;
  private riskWarned = false;
  /** True while riskDefaults sets the switch (its onChange then skips the repaint renderHeat is already making). */
  private riskDefaulting = false;

  /**
   * Show risk's defaults (Section 21.4): off when a storm's phase begins (a new run, a resume, the storm before
   * it past), on once when its warning years begin; between those, whatever the player chose.
   */
  private riskDefaults(next: ScheduledChallenge | null, warning: boolean): void {
    const id = next?.id ?? null;
    this.riskDefaulting = true;
    try {
      if (id !== this.riskPhase) {
        this.riskPhase = id;
        this.riskWarned = false;
        this.riskToggle.set(false);
      }
      if (warning && !this.riskWarned) {
        this.riskWarned = true;
        this.riskToggle.set(true);
      }
    } finally {
      this.riskDefaulting = false;
    }
  }

  /** Repaints the Outlook, the heat and the panels from the current year. */
  renderOutlook(): void {
    this.renderHeat();
    this.renderGuidance();
    // Nothing about the next phase while the storm that passed is still on screen (Section 16 B4).
    if (!this.holding) this.mayaDirector?.consider();
    this.renderGetReady();
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
      results: new Map([...this.run.outcomes].map(([id, outcome]) => [id, outcome.stars]))
    });
    const readiness = this.run.readiness();
    this.lastReadiness = readiness;
    if (readiness) this.readinessById.set(readiness.challenge.id, readiness.level);
    // The next storm's toll on the board as it stands, from the same model as the storm (Section 13).
    const next = this.run.nextChallenge();
    this.outlook.renderRisk(next ? this.run.homesAtRisk(next) : null);
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
    // The storm itself (Section 16 B4): the objective card, Maya's bubble and the hint fade; the top bar counts the homes lost.
    this.host.container.classList.add("storm-playing");
    // Counted as the result card counts (Section 16 B4; Section 22.4: against the homes still standing when it hit),
    // so the count starts at 0 and ends at the card's homes not saved, the ones this storm destroyed.
    let lost = outcome.housesTotal - outcome.housesSaved - outcome.housesDamaged;
    this.outlook.renderLost(lost);

    let hurry = false;
    const abort = new AbortController();
    // A click on the board hurries the storm; one on the HUD (volume, switches, Maya) does not.
    document.addEventListener(
      "pointerdown",
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".hud-panel, .panjim-toggles, .maya, .hud-tooltip, .instrument-cluster, .panjim-clock, .map-corner, .get-ready")) return;
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
          onHouseLost: () => this.outlook.renderLost(++lost),
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
          this.host.challengeFx.zone(zone, outcome, slow, duration, () => undefined);
          await wait(duration);
          if (zone.held) playSound("chime");
        }
      }
    } finally {
      abort.abort();
      this.host.container.classList.remove("slowmo", "storm-playing");
      // The storm's own count, exactly: the pill holds it through the result cards.
      this.outlook.renderLost(outcome.housesTotal - outcome.housesSaved);
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
      // The Tutorial goes straight to its one result card.
      if (!this.tutorial) await this.replay(challenge, record);
    }
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

    // The result cards (Section 9): what the storm did, what protected the homes, and what comes next.
    if (record) await this.showResults(challenge, record);
    // The phase is over: nothing she queued about it may be said in the next one (Section 12).
    this.maya.dismiss();
    const nextKind = this.run.nextChallenge()?.kind;
    this.maya.withdraw((line) => isPhaseLine(line.id) || (!!nextKind && staleTip(line.id, nextKind)));
    this.maya.setState("idle");
  }

  /** The landmarks of a storm's area (Section 16 B6): on its tiles, or the places its forecast names. */
  private areaPlaceNames(challenge: ScheduledChallenge): string[] {
    const area = new Set(this.run.areas.get(challenge.id) ?? []);
    const names = new Set(this.forecastPlaces(challenge).map((place) => place.name));
    for (const place of [...this.host.monuments, ...this.host.landmarks]) if (area.has(`${place.q},${place.r}`)) names.add(place.name);
    return [...names];
  }

  /** The named places the result cards can list: the map's landmarks and monuments. */
  private places(): Place[] {
    return [...this.host.landmarks, ...this.host.monuments];
  }

  /**
   * After a storm: card 1 (the result), card 2 (what protected the homes),
   * and, before the flood and the finale, card 3 (the next storm's forecast).
   * The next phase starts when they close, its cone on the map.
   */
  private async showResults(challenge: ScheduledChallenge, record: StormRecord): Promise<void> {
    // Help opened during the storm closes first: the cards never open under it (Section 16 B5).
    await this.untilLayersShut();
    if (this.disposed) return;
    const result = { ...phaseResult(challenge, record, this.run.areas.get(challenge.id) ?? [], this.places(), this.run.phaseBuilds.get(challenge.id) ?? []), objectiveComplete: this.run.objectivesComplete.has(challenge.id) };
    const next = this.run.nextChallenge();
    const top = result.defences.find((d) => d.homes > 0);
    const results = MAYA_DATA.results as { byDefence: Record<string, { text: string; rule: boolean }>; comingUp: Record<string, { text: string; rule: boolean }> };
    if (this.tutorial) {
      // One card: the stars, the homes saved and what protected them; then on to Panaji.
      this.host.telemetry.emit("checkpoint", { results: challenge.id, stars: result.stars, tutorial: true });
      this.tutorialChoice = await this.resultCards.show([{ body: tutorialResultCard(result), button: "Play Panjim", link: "Back to the menu" }]);
      return;
    }
    const cards: CardSpec[] = [
      { body: resultCard(result), button: "See what protected your city" },
      // Section 17c: with Maya hidden, the cards carry no line of hers.
      { body: defencesCard(result, SHOW_MAYA && top ? results.byDefence[top.elementId] ?? null : null), button: nextLabel(next) }
    ];
    if (next) {
      cards.push({
        body: comingUpCard(comingUpTitle(next.name, next.year, this.run.yearsUntil(next)), this.forecastPreview(next, false), SHOW_MAYA ? results.comingUp[next.kind] ?? null : null),
        button: `On to ${this.run.year}`
      });
    }
    this.host.telemetry.emit("checkpoint", { results: challenge.id, stars: result.stars, places: result.places.length, rows: result.defences.length });
    await this.resultCards.show(cards);
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

  /**
   * 2050: the skyline reveal and the title, then the final card (Section 9):
   * the three phases with the homes each saved, the total and the overall
   * stars. "Play again" starts the level afresh; the quieter link goes to the
   * menu. The run is recorded either way.
   */
  private async finale(): Promise<void> {
    this.host.cancelRiskIntro("hazard");
    this.busy = true;
    this.syncControls();
    const result = this.result();
    this.host.revealSkyline();
    await this.finaleCard.title(this.run.totalYears, this.run.schedule.length);
    const phases = this.run.schedule.map((c) => {
      const outcome = this.run.outcomes.get(c.id);
      return { label: `${c.name} in ${c.year}`, saved: outcome?.housesSaved ?? 0, total: outcome?.housesTotal ?? 0 };
    });
    this.host.telemetry.emit("checkpoint", { final: true, stars: result.levelStars, tempo: tempoBadge(this.playMs()).name });
    const choice = await this.resultCards.show([{ body: finalCard(phases, result), button: "Play again", link: "Back to the menu" }]);
    this.host.onRunComplete(result, choice === "link" ? "menu" : "again");
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
    return panjimSaveKey(this.host.level.id);
  }

  /** Whether this run has been saved on this device (the leave prompt says so only when it has). */
  get hasSave(): boolean {
    try {
      return localStorage.getItem(this.saveKey()) !== null;
    } catch {
      return false;
    }
  }

  /** Writes the run to this device: the board, every replay snapshot (so Replay survives a reload), and real time played. */
  saveRun(): void {
    // The Tutorial is three builds long: it is never saved, so its card never offers "Continue".
    if (this.tutorial) return;
    try {
      localStorage.setItem(
        this.saveKey(),
        JSON.stringify({
          snapshot: this.run.snapshot(),
          locks: [...this.run.replaySnapshots],
          playMs: this.playMsBefore + this.host.telemetry.elapsed(),
          // The first-warning risk sequence plays once a playthrough, reloads included.
          riskIntroSpent: this.riskGate.spent,
          // Each forecast cone shows once, never again after a reload.
          conesSeen: [...this.coneSeen],
          // The board it was made on: a save from another board is not offered (Section 16).
          board: boardFingerprint(this.host.level.id),
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

  /** On load: if this level has a save part-way through, the brief offers to continue it. True when it does. */
  private offerSavedRun(): boolean {
    if (this.tutorial) return false;
    // Saves from the quarterly clock (v1, keyed by level and seed) and from several builds a year (v2) cannot be continued: they are cleared.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(`riptide-rising:panjim2050:v1:${this.host.level.id}`) || key === `riptide-rising:panjim2050:v2:${this.host.level.id}`) localStorage.removeItem(key);
      }
    } catch {
      // Storage blocked: nothing to clear.
    }
    let saved: { snapshot: RunSnapshot; locks: [string, RunSnapshot][]; playMs: number; riskIntroSpent?: boolean; conesSeen?: string[]; board?: string } | null = null;
    try {
      const raw = localStorage.getItem(this.saveKey());
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    // A save from an older clock, or made on another board (before the owner's map edits, Section 16), is not offered.
    if (!saved || !saveFits(this.host.level.id, saved) || saved.snapshot.turn >= this.run.totalYears) return false;
    const label = String(this.run.config.startYear + saved.snapshot.turn);
    const data = saved;
    // The popup's forecast is the saved phase's, so it shows what "Continue" leads to (Section 12).
    this.showSavedForecastOnBrief(data.snapshot);
    this.host.offerResume(`Continue from ${label}`, () => {
      this.run.restore(data.snapshot);
      // A continued run has been built on: no first-build hint (Section 16 B3).
      if (data.snapshot.turn > 0) this.host.container.classList.add("has-built");
      for (const [id, lock] of data.locks) this.run.replaySnapshots.set(id, lock);
      this.playMsBefore = data.playMs ?? 0;
      // Already seen in this playthrough (or a storm has passed): it does not play again.
      if (data.riskIntroSpent || this.run.landed.size > 0) this.riskGate.markSpent();
      // A reload never shows a cone again: those seen, and any whose phase began before the save.
      for (const id of data.conesSeen ?? []) this.coneSeen.add(id);
      for (const challenge of this.run.schedule) if (this.run.phaseStart(challenge) <= this.run.turnNumber) this.coneSeen.add(challenge.id);
      this.hideCone();
      // The start popup's forecast is about 2026: gone when continuing a later year.
      this.host.container.querySelector(".brief-feature")?.remove();
      this.host.container.querySelector(".brief-card.with-feature")?.classList.remove("with-feature");
      // Her opening line is about the first objective: gone once that phase is behind the save.
      if (!this.run.prep.some((job) => this.isOpeningJob(job))) this.maya.withdraw((line) => line.id === MAYA.opening.id);
      this.host.redrawBoard();
      const next = this.run.nextChallenge();
      if (next && this.run.yearsUntil(next) <= HEAT_LEAD_YEARS) this.showForecast(next);
      this.clock.set(this.clockView());
      this.renderOutlook();
      this.host.refresh();
      this.syncControls();
    }, () => this.showConeIfPhaseStart(), label);
    return true;
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
    // No "Cyclone landfall" tag over it (Section 13): Maya says the warning, once.
  }

  private clearForecast(): void {
    this.host.clearForecastZones();
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
    // Section 13: no danger mark on Status. The panel holds no meters or warning now, and Maya says the
    // warning (one voice at a time); the mark would point at a panel with nothing about danger in it.
    this.panels.status?.setDanger(false);
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
  }

  /** Repair a worn defence or damaged house: the year's build, so it ends the year. */
  repair(coord: AxialCoord): boolean {
    this.host.cancelRiskIntro("build");
    if (this.busy) return false;
    this.noteBoard();
    const turn = this.run.turnNumber;
    const outcome = this.run.repair(coord);
    this.lastTurnEnded = turn;
    if (!outcome.ok) {
      if (outcome.reason) this.host.showBanner(outcome.reason, 2000);
      return false;
    }
    this.host.repairVisual(coord);
    this.host.telemetry.action("repair", 1);
    void this.endTurn(outcome);
    return true;
  }

  /** The turn the last action ended, for telemetry. */
  private lastTurnEnded = 0;

  /** How long the last build menu's numbers took, in milliseconds (the QA tools report it). */
  lastCardsMs = 0;

  /**
   * The build menu for a free tile (Section 13): a card for everything that
   * can be built here, in the fixed order (Section 17.1: nature-based first,
   * no home counts), then every other defence on the "Not here" line.
   */
  buildCards(coord: AxialCoord): BuildCard[] {
    const started = performance.now();
    const order = (id: string): number => {
      const i = (DEFENCE_ORDER as readonly string[]).indexOf(id);
      return i < 0 ? DEFENCE_ORDER.length : i;
    };
    const here = this.host.state.buildableAt(coord).map((def) => def).sort((a, b) => order(a.id) - order(b.id));
    const cards: BuildCard[] = here.map((def) => ({ id: def.id, name: CARD_NAME[def.id] ?? def.name, line: CARD_LINE[def.id] ?? "", icon: CARD_ICON[def.id] ?? "" }));
    for (const id of DEFENCE_ORDER) {
      if (here.some((def) => def.id === id)) continue;
      cards.push({ id, name: CARD_NAME[id], line: CARD_LINE[id], icon: CARD_ICON[id], notHere: true });
    }
    this.lastCardsMs = performance.now() - started;
    return cards;
  }

  /** True while a storm that the last build brought is being staged: no fact or tip should start over it. */
  get stormComing(): boolean {
    return this.stagingYearEnd;
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
    // A refused build changes nothing, the year included.
    const turn = this.run.turnNumber;
    // Worked out on the board before the build, said only once the build went through.
    const buildable = this.host.state.canBuild(coord, elementId);
    const outside = buildable ? this.outsideNote(coord, elementId) : null;
    // No pop-up over the tile after a build (Section 23.2, owner decision): it just goes down.
    const outcome = this.run.build(coord, elementId);
    if (!outcome.ok) return false;
    // Beside its tile for about three seconds (Section 16 B6), not in a banner across the screen.
    if (outside) this.host.noteAt(coord, outside, 3000);
    this.lastTurnEnded = turn;
    this.host.placeElement(coord, elementId);
    this.host.telemetry.action("build", 1);
    void this.endTurn(outcome);
    return true;
  }

  demolish(coord: AxialCoord): boolean {
    this.host.cancelRiskIntro("build");
    if (this.busy) return false;
    this.noteBoard();
    const turn = this.run.turnNumber;
    const outcome = this.run.demolish(coord);
    if (!outcome.ok) return false;
    this.lastTurnEnded = turn;
    this.host.removeElementVisual(coord);
    this.host.telemetry.action("demolish", 0);
    void this.endTurn(outcome);
    return true;
  }

  /**
   * The fallback when nothing can be built anywhere (the Panaji board never
   * gets there; tests/actionRun.test.ts): the year passes without a build.
   */
  async skipYear(): Promise<void> {
    if (this.busy || this.run.finished) return;
    this.noteBoard();
    const outcome = this.run.skipYear();
    if (!outcome.ok) return;
    this.host.telemetry.action("skip_year", 0);
    await this.endTurn(outcome);
  }

  /** Set by `dispose`: a wait that outlives the session ends, and nothing more is staged. */
  private disposed = false;

  /** True while a layer a storm waits for is open (Section 16 B5, `STORM_WAITS_FOR`: Help, ☰, the Field Guide, the leave prompt, Sources). */
  get stormMustWait(): boolean {
    return this.host.stormLayersOpen();
  }

  /** Resolves once every layer a storm waits for is shut, so a storm never plays under them (or the session is gone). */
  private async untilLayersShut(): Promise<void> {
    while (this.stormMustWait && !this.disposed) await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  /**
   * After a build, repair or demolition, which is the year's one action: what
   * it did on the board (combos, Get ready jobs) at once; then the year ends.
   * A storm whose year it is resolves straight after the build and is staged
   * in full while the HUD still shows its year; then the new year ticks in.
   * On the last turn the run ends and the finale plays.
   */
  private async endTurn(outcome: ActionOutcome): Promise<void> {
    this.host.cancelRiskIntro("time passing");
    // The bottom hint shows only until the run's first build (Section 16 B3).
    this.host.container.classList.add("has-built");
    // The cone goes for good with the first build of its phase.
    this.hideCone();
    const yearEnd = outcome.events.findIndex((event) => event.type === "challenge" || event.type === "year");
    const now = yearEnd < 0 ? outcome.events : outcome.events.slice(0, yearEnd);
    const later = yearEnd < 0 ? [] : outcome.events.slice(yearEnd);
    for (const event of now) this.handleEvent(event);
    this.host.telemetry.emit("year_end", { turn: this.lastTurnEnded || this.run.turnNumber - 1 });
    this.busy = true;
    this.syncControls();
    try {
      // The storm of the year that just ended first, then the new year.
      for (const event of later) if (event.type === "challenge") this.handleEvent(event);
      const pending = this.pendingChallenges;
      this.pendingChallenges = [];
      this.stagingYearEnd = pending.length > 0;
      // No countdowns while the storm and its result cards are on screen: they would read the old year.
      this.holdCountdowns(pending.length > 0);
      for (const staged of pending) {
        await this.untilLayersShut();
        if (this.disposed) return;
        await this.stageChallenge(staged.challenge, staged.outcome, staged.failedIds);
      }
      this.stagingYearEnd = false;
      this.holdCountdowns(false);
      for (const event of later) if (event.type !== "challenge") this.handleEvent(event);
      if (!this.run.finished) this.clock.tick(this.clockView());
      else this.clock.set(this.clockView());
      this.showConeIfPhaseStart();
    } finally {
      this.stagingYearEnd = false;
      this.holdCountdowns(false);
      this.busy = false;
    }
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
    if (this.run.finished) {
      this.clearSave();
      if (this.tutorial) this.host.onRunComplete(this.result(), this.tutorialChoice === "link" ? "menu" : { levelId: PANAJI_LEVEL_ID });
      else await this.finale();
    } else {
      this.coachYear();
      // Every new year is saved, so a reload continues from it.
      this.saveRun();
    }
  }

  private handleEvent(event: RunEvent): void {
    switch (event.type) {
      case "warning": {
        playSound("hazard_telegraph");
        this.outlook.pulse();
        // No banner: Maya says the warning (Section 13, one voice at a time).
        // In the Tutorial the storm's path waits for its last year, with the heat (Section 15).
        if (!this.tutorial || this.run.yearsUntil(event.challenge) <= this.heatLeadYears) this.showForecast(event.challenge);
        break;
      }
      case "challenge": {
        playSound("hazard_arrival");
        this.clearForecast();
        // Its warnings are over: a line about it still waiting would be stale after the storm.
        const id = event.challenge.id;
        this.maya.withdraw((line) => line.id === `warn:${id}` || line.id === `last:${id}` || line.id === `fixed:${id}`);
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

  /**
   * While a storm and its result cards are on screen (Section 16 B4) the HUD stays on that storm: no
   * countdown, the objective card and the hint hidden, the pill on "Homes lost N", nothing about the next
   * phase until "On to 2031". The guidance goes with them.
   */
  private holdCountdowns(hold: boolean): void {
    this.clock.setHold(hold);
    this.outlook.setHold(hold);
    this.host.setGuidanceVisible(!hold);
    this.host.container.classList.toggle("storm-hold", hold);
    if (!hold) this.outlook.renderLost(null);
  }

  /** True while a storm and its result cards are on screen (see `holdCountdowns`). */
  private get holding(): boolean {
    return this.host.container.classList.contains("storm-hold");
  }

  /** How many area tiles the outline showed last time: when it falls to none, the area is protected. */
  private outlined = 0;

  /**
   * The target, visible for the whole phase (Section 12): once the cone has
   * gone, a faint outline of the phase's area to protect, only where a home
   * would still be lost (the same model as the heat, recomputed after every
   * build); "Area protected" when none is left, and back if a tile is unsafe
   * again. And pins on every place an open objective names.
   */
  private renderGuidance(): void {
    const next = this.run.nextChallenge();
    const zones = this.run.zones;
    const open = next && zones ? this.run.prep.filter((job) => job.challengeId === next.id && !prepProgress(job, this.host.state, zones).done) : [];
    const pins = new Map<string, { name: string; q: number; r: number }>();
    for (const job of open) for (const pin of job.pins ?? []) pins.set(pin.name, pin);
    this.host.showPins([...pins.values()]);
    this.host.highlightPlaces(next && !this.run.finished ? this.areaPlaceNames(next) : [], [...pins.keys()]);
    if (!next || this.coneShown || this.run.finished) {
      this.host.showAreaOutline([]);
      this.outlined = 0;
      return;
    }
    const area = this.run.areas.get(next.id) ?? [];
    const atRisk = new Set(this.run.exposureFor(next)?.housesAtRisk ?? []);
    const keys = area.filter((key) => atRisk.has(key));
    this.host.showAreaOutline(keys);
    if (this.outlined > 0 && keys.length === 0 && area.length > 0) this.host.areaProtected();
    this.outlined = keys.length;
  }

  /**
   * A build that counts for no open objective row gets one line saying so
   * (Section 12). No count of homes: never shown on a build (Section 23.2).
   */
  private outsideNote(coord: AxialCoord, elementId: string): string | null {
    const next = this.run.nextChallenge();
    const zones = this.run.zones;
    if (!next || !zones) return null;
    const key = `${coord.q},${coord.r}`;
    const open = this.run.prep.filter((job) => job.challengeId === next.id && !prepProgress(job, this.host.state, zones).done);
    if (open.length === 0 || open.some((job) => job.elementId === elementId && (job.tiles ?? []).includes(key))) return null;
    return "This is outside the area, so it doesn't count for the objective.";
  }


  /** One of the Tutorial's coaching lines, at once and once (the build menu may be open: she stands clear of it). */
  private coach(id: keyof typeof TUTORIAL_LINES, state: MayaState): void {
    if (!this.tutorial || this.coached.has(id)) return;
    this.coached.add(id);
    // Only the line for now: one left waiting (Maya muted or shut) would be stale by the time she speaks.
    this.maya.withdraw((line) => line.id.startsWith("tutorial:"));
    this.maya.dismiss();
    this.maya.say({ id: `tutorial:${id}`, text: TUTORIAL_LINES[id], state, urgent: true });
    this.maya.next();
  }

  /**
   * The build menu just opened. In the Tutorial, the first time: Maya says what
   * the cards are, and their lines pulse (Section 17.1: the cards carry no number).
   */
  cardsOpened(): void {
    if (!this.tutorial || this.run.turnNumber !== 1) return;
    this.coach("cards", "explains");
    for (const line of this.host.container.querySelectorAll(".build-popover .build-card-line")) line.classList.add("coach-pulse");
  }

  /** A new Tutorial year: after the first build, the faint outline; in the cyclone's own year, the red heat. */
  private coachYear(): void {
    if (!this.tutorial) return;
    const next = this.run.nextChallenge();
    if (!next) return;
    if (this.run.yearsUntil(next) <= 1) {
      if (this.run.zones && this.run.climate) this.showForecast(next);
      this.coach("heat", "warning");
    }
    else if (this.run.turnNumber === 2) this.coach("outline", "tip");
  }

  private syncControls(): void {
    this.clock.setControlsEnabled(!this.busy && !this.run.finished);
    // ☰'s Start again and Leave wait while a storm plays: the year is saved only once it has settled.
    for (const button of this.menuActionsEl?.querySelectorAll<HTMLButtonElement>("button") ?? []) {
      button.disabled = this.busy;
      button.title = this.busy ? "Once the storm has passed" : "";
    }
  }

  /**
   * Scenario helper: the year's build, made where it changes nothing a storm
   * does: on the tile farthest from every storm still to come, so screenshots
   * and checks can move the clock on. Through the player's own build path.
   */
  private async passYear(): Promise<boolean> {
    const reach = new Set<string>();
    for (const challenge of this.run.schedule) {
      if (this.run.landed.has(challenge.id)) continue;
      for (const key of this.run.exposureFor(challenge, true)?.exposure.keys() ?? []) reach.add(key);
    }
    const reached = [...reach].map((key) => key.split(",").map(Number));
    let best: { coord: AxialCoord; elementId: string; distance: number } | null = null;
    for (const tile of this.host.state.placed.values()) {
      const key = `${tile.coord.q},${tile.coord.r}`;
      if (reach.has(key)) continue;
      const options = this.host.state.buildableAt(tile.coord);
      if (options.length === 0) continue;
      let distance = Infinity;
      for (const [q, r] of reached) distance = Math.min(distance, (Math.abs(tile.coord.q - q) + Math.abs(tile.coord.r - r) + Math.abs(tile.coord.q + tile.coord.r - q - r)) / 2);
      if (!best || distance > best.distance) best = { coord: tile.coord, elementId: options[0].id, distance };
    }
    if (!best) return false;
    const ok = this.build(best.coord, best.elementId);
    await this.idle();
    return ok;
  }

  /** Scenario helper: builds away from the storms (`passYear`) until `yearsLeft` years remain before the next storm (never past one). */
  private async waitUntilYearsLeft(yearsLeft: number): Promise<boolean> {
    const next = this.run.nextChallenge();
    if (!next || this.run.yearsUntil(next) < yearsLeft) return false;
    while (this.run.yearsUntil(next) > yearsLeft) if (!(await this.passYear())) return false;
    return true;
  }

  /**
   * Scenario helper: builds through the player's own path, but never the
   * build that would bring a storm (it stops instead). Returns whether the
   * build went through.
   */
  private async buildNow(coord: AxialCoord, elementId: string): Promise<boolean> {
    const next = this.run.nextChallenge();
    if (next && this.run.yearsUntil(next) <= 1) return false;
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
   * build path. Never makes the build that brings the storm.
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

  /** Scenario helper: the year's build (`act`, or `passYear` when it makes none) and, while a storm plays, hurries it and closes its Aftermath like a player would, until the year has turned. */
  private async buildThrough(stopAt?: () => boolean, act?: () => boolean): Promise<boolean> {
    const turn = this.run.turnNumber;
    if (!act?.()) {
      const built = this.passYear();
      // Nowhere to build (never on Panaji): stop rather than wait for a year that will not turn.
      if (this.run.turnNumber === turn && !this.busy) {
        await built;
        if (this.run.turnNumber === turn && !this.busy) return true;
      }
    }
    await wait(60);
    while (this.busy) {
      if (stopAt?.()) return true;
      if (this.host.challengeFx.isPlaying() || this.replayCard.isOpen) document.dispatchEvent(new PointerEvent("pointerdown"));
      // Through the result cards, as a player pressing their buttons would.
      const cont = this.host.container.querySelector<HTMLButtonElement>(".result-cards .result-next");
      if (this.resultCards.isOpen && cont) cont.click();
      await wait(100);
    }
    if (this.run.turnNumber === turn && !stopAt?.()) await this.idle();
    return stopAt?.() ?? false;
  }

  /**
   * Test-only scenarios for the screenshot and QA tools: puts the board in a
   * state worth photographing. Uses the same actions a player has.
   */
  async scenario(name: string): Promise<boolean> {
    // "heat-N": builds away from the storms until N years remain before the
    // next storm (1 = its own year). "heat-defend": plant three defences on its path first.
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
      void this.passYear();
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
    // "year-N": builds away from the storms (playing any storm through) until it is turn N.
    const year = /^year-(\d+)$/.exec(name);
    if (year) {
      const target = Number(year[1]);
      while (!this.run.finished && this.run.turnNumber < target) await this.buildThrough();
      return this.run.turnNumber === target;
    }
    switch (name) {
      case "to-results": {
        // The build that brings the next storm (away from it), the storm hurried through, handed back with the result cards open.
        const next = this.run.nextChallenge();
        if (!next || !(await this.waitUntilYearsLeft(1))) return false;
        void this.passYear();
        while (!this.resultCards.isOpen) {
          if (this.host.challengeFx.isPlaying() || this.replayCard.isOpen) document.dispatchEvent(new PointerEvent("pointerdown"));
          await wait(150);
        }
        await wait(400);
        return true;
      }
      case "pass-year": {
        await this.buildThrough();
        return true;
      }
      case "past-storm": {
        // Plays through the next storm (accepting its Aftermath), so the
        // shots that follow are about the one after it.
        const next = this.run.nextChallenge();
        if (!next) return false;
        while (!this.run.landed.has(next.id)) await this.buildThrough();
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
        for (let y = 0; y < 3; y++) await this.buildThrough();
        return true;
      }
      case "challenge":
      case "stage": {
        // Some beach defences first, so the staging has something to show;
        // then on to the storm. "challenge" hands back at the Aftermath,
        // "stage" mid-storm.
        for (let i = 0; i < 6; i++) {
          const element = i % 2 === 0 ? "dune" : "sandy_vegetation";
          const coord = this.firstBuildableIn("z1", element);
          if (coord) await this.buildNow(coord, element);
        }
        if (!(await this.waitUntilYearsLeft(1))) return false;
        void this.passYear();
        if (name === "challenge") {
          while (!this.resultCards.isOpen) await wait(100);
          await wait(1800); // the stars fill
        } else {
          while (!this.host.challengeFx.isPlaying()) await wait(50);
          await wait(1200); // a little way into the storm
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
        void this.passYear();
        while (!this.replayCard.isOpen) {
          if (this.host.challengeFx.isPlaying()) document.dispatchEvent(new PointerEvent("pointerdown"));
          await wait(150);
        }
        await wait(700);
        return true;
      }
      case "finale": {
        // Plays the whole run, accepting each Aftermath, and hands back at the finale card.
        const atFinale = (): boolean => this.atFinalCard();
        while (!this.run.finished) if (await this.buildThrough(atFinale)) return true;
        while (!atFinale()) await wait(100);
        return true;
      }
      case "smart-forecast":
        await this.playCarefully(() => this.run.nextChallenge() !== null && this.run.yearsUntil(this.run.nextChallenge()!) <= HEAT_LEAD_YEARS && this.isGreen());
        return true;
      case "smart-aftermath":
        await this.playCarefully(() => this.resultCards.isOpen, true);
        await wait(1800);
        return true;
      case "smart-finale":
        await this.playCarefully(() => this.atFinalCard());
        return true;
      case "actions": {
        for (const elementId of ["dune", "mangrove", "seawall", "breakwater"]) {
          const coord = this.firstBuildable(elementId);
          if (coord) await this.buildNow(coord, elementId);
        }
        return true;
      }
      default:
        return false;
    }
  }

  /** True while the final card (Panjim, 2026 to 2050) is up. */
  atFinalCard(): boolean {
    // The last storm's own cards are up with the run already finished: the final card is the one offering Play again.
    return this.run.finished && this.resultCards.isOpen && this.host.container.querySelector(".result-cards .result-next")?.textContent === "Play again";
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
   * the waterfront), else builds away from the storms. One build a year. Uses
   * only the actions a player has; continues through each Aftermath. Stops when `until` is true
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
      // The year's one build: a repair, else what the gauge asks for, else away from the storms.
      const act = (): boolean => {
        for (const [key, inst] of this.host.state.elements) {
          if (inst.degradeAmount <= 0 || ELEMENT_BY_ID.get(inst.elementId)?.kind === "building") continue;
          const [q, r] = key.split(",").map(Number);
          if (this.repair({ q, r })) return true;
        }
        const readiness = this.run.readiness();
        if (readiness && readiness.level !== "green") {
          for (const [zone, element] of wishes[readiness.challenge.kind]) {
            const coord = this.firstBuildableIn(zone, element);
            if (coord && this.build(coord, element)) return true;
          }
        }
        return false;
      };
      const stop = stopAtAftermath ? () => this.resultCards.isOpen && until() : () => until();
      // Answering any Aftermath the year brings.
      if (await this.buildThrough(stop, act)) return;
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
    this.finaleCard.dispose();
    this.resultCards.dispose();
    this.jar?.dispose();
    this.fieldGuide.dispose();
    this.panels.dispose();
    this.clock.dispose();
    this.disposed = true;
    this.host.container.classList.remove("has-panjim-clock", ...SESSION_CLASSES);
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

/** What the clock names the next storm as: "Cyclone in 3 builds". */
function untilWord(kind: ScheduledChallenge["kind"]): string {
  return kind === "cyclone" ? "Cyclone" : kind === "flood" ? "Flood" : "Cyclone and flood";
}

/** The coming-up card's one heading (Section 16 B4): "Monsoon flood · 2040 · in 10 years". */
export function comingUpTitle(name: string, year: number, years: number): string {
  return `${name} in ${year}, ${years} ${years === 1 ? "year" : "years"} away`;
}

