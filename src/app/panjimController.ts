import { ActionRun, type ActionOutcome, type RunEvent } from "@core/actionRun";
import type { GameState } from "@core/gameState";
import { FrameSampler, autoStep, nextChoice, type Quality, type QualityChoice } from "@core/quality";
import type { StormRecord } from "@core/stormRecord";
import { drawStormCard, type StormCardInput } from "@ui/panjim/stormCard";
import { forecastPlaceCandidates } from "@ui/panjim/forecastPlaces";
import { replaySteps } from "@core/stormReplay";
import { ReplayCard } from "@ui/panjim/replayCard";
import { TutorialPanel } from "@ui/panjim/tutorialPanel";
import { STEP_BY_ID, TUTORIAL_STEPS } from "@ui/panjim/tutorialSteps";
import { goodTiles, suggestedDefence } from "@core/tutorialNudge";
import { setSoundEnabled, setSoundVolume, soundVolume } from "@ui/audioHooks";
import type { AxialCoord } from "@core/hex";
import type { Telemetry } from "@core/telemetry";
import type { LevelDef } from "@levels/levels";
import { ClockHud, type ClockView } from "@ui/panjim/clockHud";
import { OutlookBar } from "@ui/panjim/outlookBar";
import { CoinJar } from "@ui/panjim/coinJar";
import { GetReadyPanel } from "@ui/panjim/getReady";
import { buildHoverLine, prepProgress, regionPlaces, rowMissNote, type PrepObjective } from "@core/prep";
import { FieldGuide } from "@ui/panjim/fieldGuide";
import { COMBO_INFO, type ComboId } from "@core/combos";
import { strengthIcons, challengeStrength, type ScheduledChallenge } from "@core/climate";
import { FRONTS, type ChallengeOutcome, type ZoneDef, type ZoneOutcome, starsForHouses } from "@core/zones";
import type { RunSnapshot } from "@core/actionRun";
import { ResultCards, resultCard, defencesCard, comingUpCard, finalCard, tutorialFinalCard, tutorialResultCard, type CardSpec, type CardsChoice, type TutorialDefenceRow } from "@ui/panjim/resultCards";
import { biodiversityByKind, BUILDING_KINDS, natureReason, nextLabel, phaseResult, shortOfThree, type Place } from "@core/phaseResult";
import { starRule } from "@ui/panjim/panjimHelp";
import MAYA_DATA from "@data/maya.json";
import { FinaleCard } from "@ui/panjim/finaleCard";
import { computePanjimIndex, tempoBadge, type PanjimIndex } from "@core/panjimIndex";
import { axialToWorld, neighbors } from "@core/hex";
import { ELEMENT_BY_ID } from "@core/elements";
import { isCracked } from "@core/hazardModel";
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
import { isPhaseLine, MAYA, noteIdsFor, stormWord, TUTORIAL_LINES } from "@core/mayaLines";
import type { RunThen } from "@core/levelScore";
import { PANAJI_LEVEL_ID } from "@ui/screens/runWords";
import { forecastLine } from "@core/forecastCone";
import { renderConePreview } from "@ui/panjim/conePreview";
import type { Tooltips } from "@ui/tooltip";
import type { BuildCard } from "@ui/buildPopover";
import { CARD_ICON, CARD_LINES, CARD_NAME, cardBiodiversity, DEFENCE_ORDER, TUTORIAL_CARD_LINES } from "@ui/panjim/defenceCards";
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
  /** A short note beside a tile for `ms` (Section 16 B6; Section 30.11: a defence broken or cracked with age). */
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
  /** Sparkle, ring and glow over tiles that just joined a combo. */
  celebrateCombo: (tiles: AxialCoord[]) => void;
  /** Draws the forecast cone (null fades it out). */
  showCone: (cone: ConeShow | null) => void;
  /** Section 30.8: the cone's bands step back while a build card is hovered (so the homes' glow shows). */
  dimCone: (dimmed: boolean) => void;
  /** Section 30.9: the objective's tiles still to build, pulsing on the board. */
  showObjectiveTiles: (keys: string[]) => void;
  /** Section 30.7: the storm's faint track all phase after the cone has gone (null hides it). */
  showStormTrail: (trail: { key: string; tracks: ConeShow["tracks"] } | null) => void;
  /** Glides the camera to frame a box of the board, in world x/z. */
  /**
   * Frames the box; then, if `keepClear` is given, slides the view just enough that none of those points sits under
   * the HUD card or Maya (or, when no slide clears them all, none of `arrows`).
   */
  frameWorld: (box: { minX: number; maxX: number; minZ: number; maxZ: number }, keepClear?: readonly { x: number; z: number }[], arrows?: readonly { x: number; z: number }[]) => void;
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
  /**
   * Section 34b.3: one of the camera's set moves (the heat coming on, Last call, an objective row): a glide to `centre`
   * (else the middle of `tiles`), slid clear of the HUD card and Maya; held while a build menu or tile card is open.
   */
  moveCamera: (tiles: readonly AxialCoord[], centre?: AxialCoord) => void;
  /** Section 34b.4: a row clicked in the objective: its tiles flash twice over 2 s. */
  flashTiles: (tiles: readonly AxialCoord[]) => void;
  /** The map's named places, for Maya to call a spot by name. */
  landmarks: readonly { name: string; q: number; r: number }[];
  /** The map's locality labels, for an objective's area of named localities (Section 16.5). */
  localities: readonly { name: string; q: number; r: number }[];
  /** The map's monuments (named buildings), for the result cards' places. */
  monuments: readonly { name: string; q: number; r: number; kind?: string }[];
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

/** Section 34b.5: what Speed up does, as its tooltip. */
export const SPEED_UP_WHY = "It hurries the storm";

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
  /** Section 30.12: ☰ → Larger text. */
  readonly textToggle: PrefToggle;
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
    document.documentElement.classList.remove("storm", "storm-instant");
    host.container.classList.add("has-panjim-clock");
    this.clock = new ClockHud(host.container, { onSkipYear: () => void this.skipYear() });
    this.outlook = new OutlookBar(this.clock.outlookSlot);
    // Section 33b.2: one HUD card, top left: the countdown chip beside the year, the two tiles under the timeline.
    this.outlook.mountCountdown(this.clock.countdownSlot);
    this.outlook.mountRisk(this.clock.riskSlot);
    this.clock.onCountdown = (text) => this.outlook.setCountdown(text);
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    this.jar = this.run.economyEnabled ? new CoinJar(host.container, () => this.collectJar()) : null;
    // ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
    this.getReady = new GetReadyPanel(this.run.economyEnabled);
    // Hovering a row lights the tiles that count for it (Section 12).
    this.getReady.onRowHover((job) => this.host.tintTiles(job ? (job.tiles ?? []).map((key) => ({ key, color: "#fff3c4", blend: 0.5 })) : null));
    // Section 30.9: a row clicked pans the board to its tile (the first of its picks still to build).
    this.getReady.onRowClick((job) => {
      const keys = this.pulseKeys(job);
      const key = keys[0] ?? job.tiles?.[0];
      if (!key) return;
      const coordOf = (k: string): AxialCoord => ({ q: Number(k.split(",")[0]), r: Number(k.split(",")[1]) });
      // Section 34b.3: its tiles kept clear of the HUD card and Maya.
      this.host.moveCamera((keys.length ? keys : [key]).map(coordOf), coordOf(key));
      // Section 34b.4: and the row's tiles flash, so the click is seen to answer.
      this.host.flashTiles((keys.length ? keys : [key]).map(coordOf));
    });
    // Section 31.2: the Tutorial's panel is its caption card and checklist, not the objective rows.
    this.tutorialPanel = this.tutorial ? new TutorialPanel() : null;
    // Section 33b.3: the objective (or the Tutorial's caption and checklist) lives in the HUD card, under its tiles;
    // the old bottom right objective panel is not shown in Panjim (panjim.css).
    this.clock.objectiveSlot.appendChild(this.tutorialPanel?.el ?? this.getReady.el);
    this.clock.objectiveSlot.hidden = false;
    this.fieldGuide = new FieldGuide(host.container, () => host.telemetry.reward("species"));
    // Section 17c: Maya's notes come from her; hidden, the guide is the species alone.
    this.fieldGuide.showNotes(SHOW_MAYA);
    // Section 30.11 bug 9: opening the Field Guide from the menu closes the menu.
    this.fieldGuide.onOpen = () => this.panels?.settings.close();
    this.resultCards = new ResultCards(host.container);
    this.finaleCard = new FinaleCard(host.container);
    this.replayCard = new ReplayCard(host.container);
    this.speedUp = this.makeSpeedUp();
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
        this.tutorialPanel?.setReducedMotion(on);
        this.recheckRiskIntroMode();
      }
    );
    this.tutorialPanel?.setReducedMotion(this.motionToggle.value);
    // Section 30.12 (festival mode): larger words for those who need them; not remembered (the next visitor
    // starts with the usual size).
    this.textToggle = new PrefToggle(
      host.container,
      { storageKey: "riptide-rising:large-text", label: "Larger text", shortcut: "", defaultOn: false, className: "text-toggle", persist: false },
      (on) => {
        host.container.classList.toggle("large-text", on);
        this.maya.textResized();
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
      focus: (coord, tiles) => this.host.moveCamera(tiles ?? [coord], coord),
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
    // Section 33b.2: How to play (?) and ☰ move into the HUD card's first line, the same elements with their handlers,
    // tooltips and shortcuts (the "?" keeps its .hud-chrome, Back hidden in it as before).
    const chrome = host.container.querySelector<HTMLElement>(".hud-chrome");
    if (chrome) this.clock.chromeSlot.appendChild(chrome);
    this.clock.chromeSlot.appendChild(this.panels.settings.el);
    if (this.jar && this.panels.status) {
      const status = this.panels.status;
      this.jar.onGain = (text) => status.floatText(text);
    }
    this.attachTooltips();
    this.addForecastToBrief();
    this.clock.set(this.clockView());
    this.renderOutlook();
    this.syncControls();
    this.showConeIfPhaseStart();
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
      // Section 33b.5: the forecast arrows (sampled along their length) and the land they cross stay clear of the HUD card and Maya.
      const along = cone.tracks.flatMap((t) => t.points.flatMap((p, i) => {
        const q = t.points[i + 1];
        return q ? [0, 0.2, 0.4, 0.6, 0.8].map((f) => ({ x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f })) : [p];
      }));
      this.host.frameWorld({
        minX: Math.min(...points.map((p) => p.x)),
        maxX: Math.max(...points.map((p) => p.x)),
        minZ: Math.min(...points.map((p) => p.z)),
        maxZ: Math.max(...points.map((p) => p.z))
      }, [...along, ...points], along);
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
   * The line under "Leave Panjim?" (Section 16 B5; Section 28.2: nothing is saved): a finished run is over (its
   * result is recorded); else leaving ends it, or nothing was built yet.
   */
  leaveNote(): string {
    return leaveText({ tutorial: this.tutorial, finished: this.run.finished, builds: this.run.turnNumber - 1 });
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
    // Section 33b.2: each storm dot's tooltip names the storm, its strength and, once past, its stars.
    this.outlook.onMarker = (el, text) => tips.attach(el, () => text);
    tips.attach(outlook.risk, "homesAtRisk", () => {
      const next = this.run.nextChallenge();
      const homes = next ? this.run.homesAtRisk(next) : 0;
      return { homes: `${homes} ${homes === 1 ? "home" : "homes"}`, storm: next ? stormWord(next.kind) : "storm" };
    });

    tips.attach(this.outlook.bioEl, this.tutorial ? "biodiversityCounterTutorial" : "biodiversityCounter", () => {
      const view = this.biodiversityView();
      const fmt = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : "0");
      return { start: this.run.config.startYear, change: view ? fmt(view.change) : "0", target: view?.target !== null && view ? fmt(view.target) : "a rise", storm: view?.storm ?? "storm" };
    });
    tips.attach(this.fieldGuide.buttonEl, "fieldGuide", () => ({ notes: this.fieldGuide.notesProgress(), found: this.fieldGuide.count, species: this.fieldGuide.speciesTotal }));
    tips.attach(this.riskToggle.el, "riskToggle");
    tips.attach(this.getReady.el, "getReady");
    tips.attach(this.mayaToggle.el, "mayaToggle");
    tips.attach(this.soundToggle.el, "soundToggle");
    tips.attach(this.motionToggle.el, "motionToggle");
    tips.attach(this.qualityButton, "qualityControl", () => ({ choice: this.qualityLabel(), fps: this.lastFps > 0 ? Math.round(this.lastFps) : "–" }));
    tips.attach(this.volumeSlider, "soundVolume", () => ({ pct: this.volumeSlider.value }));
    // Section 30 (owner decision): "Got it" has no tooltip (it said what the button says, and covered her words).
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

  /** Section 31.2: the Tutorial's panel (caption and checklist), and the defences tried so far. */
  private readonly tutorialPanel: TutorialPanel | null;
  private readonly tutorialTried = new Set<string>();
  /** Section 31.4: by storm, the homes each defence took out of its way when it was built. */
  private readonly tutorialCredit = new Map<string, Map<string, Set<string>>>();
  /** Section 34: each defence's net homes (taken out of the way, less any it put at risk) when built, per storm: a row's cap. */
  private readonly tutorialNet = new Map<string, Map<string, number>>();
  /** By storm, why a defence's build took none: no home left at risk ("safe"), or too far from them ("far"). */
  private readonly tutorialNoneWhy = new Map<string, Map<string, "safe" | "far">>();
  /** The Tutorial's last build (it may be the one that brought the storm, so not yet on `preChallengeIds`). */
  private tutorialLastBuild: { key: string; elementId: string } | null = null;
  /** The defence the player has just built in the Tutorial, for its caption's "Built". */
  private tutorialJustBuilt: string | null = null;
  /** The step Maya last gave her line for. */
  private tutorialSaid: string | null = null;

  /**
   * Section 31.2 and 31.3: the Tutorial's year. The suggested defence (the first of the seven not yet tried), its
   * caption and the checklist; its 2 or 3 best tiles pulse on the board (where it saves homes in the coming storm);
   * Maya says the step's one line.
   */
  private renderTutorial(speak = true): void {
    const panel = this.tutorialPanel!;
    const suggested = this.run.finished ? null : this.tutorialSuggestion();
    panel.render(this.tutorialTried, suggested, this.tutorialJustBuilt);
    this.tutorialJustBuilt = null;
    const tiles = suggested && !this.busy ? goodTiles(this.run, suggested).map(({ coord }) => `${coord.q},${coord.r}`) : [];
    this.host.showObjectiveTiles(tiles);
    if (speak && suggested && suggested !== this.tutorialSaid && !this.holding && !this.busy) {
      this.tutorialSaid = suggested;
      // A suggestion that does nothing in the coming storm (only such defences are left untried) says so.
      const step = STEP_BY_ID.get(suggested)!;
      const next = this.run.nextChallenge();
      const hazard = next?.kind === "flood" ? "flood" : "cyclone";
      const fits = !next || (ELEMENT_BY_ID.get(suggested)?.targetsHazards ?? []).includes(hazard);
      const line = fits ? step.maya : `${step.name} will not help in the ${hazard === "flood" ? "river flood" : "cyclone"}, but you can still try it.`;
      // The first step's line follows her opening line; later ones replace whatever she was saying.
      if (this.run.turnNumber > 1) {
        this.maya.withdraw((l) => l.id.startsWith("tutorial:"));
        this.maya.dismiss();
      }
      this.maya.say({ id: `tutorial:step:${suggested}`, text: line, state: "tip", urgent: this.run.turnNumber > 1 });
      if (this.run.turnNumber > 1) this.maya.next();
    }
  }

  /** Section 31.2: the defence suggested now, for the coming storm (`suggestedDefence`). */
  private tutorialSuggestion(): ReturnType<typeof suggestedDefence> {
    return suggestedDefence(this.tutorialTried, this.run.nextChallenge()?.kind ?? null);
  }

  private renderGetReady(): void {
    if (this.tutorialPanel) {
      this.renderTutorial();
      return;
    }
    const next = this.run.nextChallenge();
    const zones = this.run.zones;
    const rows = zones ? this.run.prep.map((job) => ({ job, ...prepProgress(job, this.host.state, zones) })) : [];
    // Section 30.9: the objective done, the storm after it to get ahead on (not in the Tutorial).
    const complete = rows.length > 0 && rows.every((row) => row.done);
    const ahead = complete && zones && !this.tutorial ? this.run.aheadObjective() : null;
    this.aheadRows = ahead ? ahead.objective.rows : [];
    this.aheadPicks = ahead ? ahead.objective.picks : [];
    this.getReady.render(next ? next.name : null, rows, ahead && zones ? { storm: ahead.challenge.name, rows: ahead.objective.rows.map((job) => ({ job, ...prepProgress(job, this.host.state, zones) })) } : null);
    // The tiles still to build pulse on the board (this objective's, or once it is done, Get ahead's).
    const jobs = complete ? this.aheadRows : this.run.prep;
    this.host.showObjectiveTiles(this.run.finished ? [] : jobs.flatMap((job) => this.pulseKeys(job)));
    if (this.run.prep.length > 0) this.mayaDirector?.tip("get-ready");
  }

  /** Section 30.9: Get ahead's rows and picks now (empty until the objective is done). */
  private aheadRows: PrepObjective[] = [];
  private aheadPicks: { key: string; elementId: string }[] = [];

  /** A row's picked tiles not yet built with its defence (the model's picks; the row's own tiles if it has none). */
  private pulseKeys(job: PrepObjective): string[] {
    const zones = this.run.zones;
    if (zones && prepProgress(job, this.host.state, zones).done) return [];
    const tiles = new Set(job.tiles ?? []);
    const picks = [...(this.run.objective?.picks ?? []), ...this.aheadPicks].filter((pick) => pick.elementId === job.elementId && tiles.has(pick.key)).map((pick) => pick.key);
    const fits = (key: string): boolean => this.host.state.elements.get(key)?.elementId !== job.elementId && this.host.state.canBuild({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) }, job.elementId);
    // Section 34: a tile pulses only while building there still takes homes out of the storm's risk (the picks are
    // chosen at the phase's start; later builds can save their homes first, and a player then spent a year on a
    // pulsing tile that changed nothing). The same model as Homes at risk, cached until the board changes.
    const storm = this.run.schedule.find((c) => c.id === job.challengeId);
    // Only for the next storm's rows: the model's cache holds one storm, and checking Get ahead's (the storm after)
    // on every repaint swapped it back and forth (a repaint went from about 17 ms to 40). Get ahead's tiles pulse as chosen.
    const next = this.run.nextChallenge();
    const helps = (key: string): boolean => {
      if (!storm || this.run.landed.has(storm.id)) return false;
      if (storm.id !== next?.id) return true;
      return (this.run.riskChangeBy(storm, { q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) }, job.elementId)?.saved.length ?? 0) > 0;
    };
    const open = [...new Set(picks)].filter((key) => fits(key) && helps(key));
    // Section 34: a row whose picked tiles were taken by other builds still has a way to finish: the tiles in its
    // area where its defence fits and helps, those nearest the most homes its storm still puts at risk first, as
    // many as it still needs (ranked by a count, and only the best few simulated: this runs on every repaint).
    const progress = zones ? prepProgress(job, this.host.state, zones) : null;
    const need = progress ? progress.target - progress.current : 0;
    if (open.length >= need || tiles.size === 0) return open;
    const risk = storm && !this.run.landed.has(storm.id) ? this.run.homesAtRiskKeys(storm).map((key) => key.split(",").map(Number)) : [];
    const near = (key: string): number => {
      const [q, r] = key.split(",").map(Number);
      return risk.filter(([hq, hr]) => (Math.abs(q - hq) + Math.abs(r - hr) + Math.abs(q + r - hq - hr)) / 2 <= 2).length;
    };
    const extra = [...tiles]
      .filter((key) => !open.includes(key) && fits(key))
      .map((key) => ({ key, saves: near(key) }))
      .filter((tile) => tile.saves > 0)
      .sort((a, b) => b.saves - a.saves || (a.key < b.key ? -1 : 1))
      .slice(0, 12)
      .map((tile) => tile.key)
      .filter(helps)
      .slice(0, need - open.length);
    return [...open, ...extra];
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
    // Section 34b.3: the heat coming on for a storm is one of the camera's set moves, once, to its hot tiles.
    if (hot.length > 0 && !this.heatFramed.has(next.id) && !this.tutorial) {
      this.heatFramed.add(next.id);
      this.host.moveCamera(hot.map((key) => ({ q: Number(key.split(",")[0]), r: Number(key.split(",")[1]) })));
    }
    if (hot.length > 0) this.riskGate.see(next.id);
    if (hot.length > 0 && !this.riskGate.spent && !this.busy && !this.host.overlayOpen() && this.host.riskAreaOnScreen(hot) && this.riskGate.offer(next.id)) {
      this.riskIntroModeStarted = this.currentRiskIntroMode();
      this.host.startRiskIntro(this.riskIntroModeStarted, hot);
    }
  }

  /** Section 34b.3: the storms whose heat has had its camera move (once each; a retry lets it come again). */
  private readonly heatFramed = new Set<string>();

  /** The storm whose phase Show risk's defaults were last set for, and whether its warning years have switched it on. */
  private riskPhase: string | null = null;
  private riskWarned = false;
  /** Section 34: the phase's objective done, Maya said once that R shows the homes still at risk. */
  private riskAfterObjective = false;
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
        this.riskAfterObjective = false;
        this.riskToggle.set(false);
      }
      if (warning && !this.riskWarned) {
        this.riskWarned = true;
        this.riskToggle.set(true);
      }
      // Section 34: with the objective's checklist done, the builds left in the phase were aimless (players could not
      // see which homes were still at risk). Show risk keeps its Section 21.4 default; Maya says once a phase where
      // to look (owner decision 7 in docs/REVIEW_34.md: whether the red should come on by itself then).
      const zones = this.run.zones;
      const done = !this.tutorial && !!zones && this.run.prep.length > 0 && this.run.prep.every((job) => prepProgress(job, this.host.state, zones).done);
      if (done && !this.riskAfterObjective && next && !warning && !this.riskToggle.value) {
        this.riskAfterObjective = true;
        this.maya.say({ id: `objective-done:${next.id}`, text: "The list is done. Press R to see the homes this storm would still take, and choose where to build next.", state: "tip" });
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
    this.outlook.renderBiodiversity(this.biodiversityView());
  }

  /**
   * Section 30.4: biodiversity since the run began, and the next storm's three star target (the last storm's once
   * the run is over). Section 31.1: the Tutorial's stars count homes only, but it shows the count too (no target),
   * so each defence's gain or cost shows.
   */
  biodiversityView(landing?: ScheduledChallenge): { change: number; target: number | null; storm: string } | null {
    const stars = this.run.houseStars;
    if (stars && stars.bioThree === undefined && this.tutorial) {
      const storm = this.run.nextChallenge() ?? this.run.schedule[this.run.schedule.length - 1] ?? null;
      return { change: Math.round(this.host.state.biodiversity - (stars.bioStart ?? 0)), target: null, storm: storm ? stormWord(storm.kind) : "storm" };
    }
    if (!stars || stars.bioThree === undefined) return null;
    // Section 34: while a storm that has just landed plays, its own target.
    const storm = landing ?? this.run.nextChallenge() ?? this.run.schedule[this.run.schedule.length - 1] ?? null;
    const target = storm ? (this.run.houseStarsFor(storm)?.bioThree ?? stars.bioThree) : stars.bioThree;
    return { change: Math.round(this.host.state.biodiversity - (stars.bioStart ?? 0)), target: target ?? null, storm: storm ? stormWord(storm.kind) : "storm" };
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
    // Section 33.2: the interface takes its storm hues while the storm plays, until its result cards open.
    this.stormHues(true);
    // Counted as the result card counts (Section 16 B4; Section 22.4: against the homes still standing when it hit),
    // so the count starts at 0 and ends at the card's homes not saved, the ones this storm destroyed.
    let lost = outcome.housesTotal - outcome.housesSaved - outcome.housesDamaged;
    this.outlook.renderLost(lost);

    let hurry = false;
    const abort = new AbortController();
    this.showSpeedUp(true);
    // A click on the board hurries the storm; one on the HUD (volume, switches, Maya) does not.
    document.addEventListener(
      "pointerdown",
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".hud-panel, .panjim-toggles, .maya, .hud-tooltip, .instrument-cluster, .panjim-clock, .map-corner, .get-ready")) return;
        hurry = true;
        this.showSpeedUp(false);
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
            this.maya.say({ id: `storm:${challenge.id}:${phase}`, text: line, state: phase === "Recede" ? "explains" : "warning", urgent: true, hint: true });
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
      this.showSpeedUp(false);
      this.host.container.classList.remove("slowmo", "storm-playing");
      // The storm's own count, exactly: the pill holds it through the result cards.
      this.outlook.renderLost(outcome.housesTotal - outcome.housesSaved);
    }
    await wait(hurry ? 100 : 500);
    if (record) {
      // The calm after the finale's storm, then the replay of what happened.
      if (record.kind === "compound") {
        this.maya.dismiss();
        this.maya.say({ id: `calm:${challenge.id}`, text: "The water has gone down and the sun is out again.", state: "celebrates", urgent: true, hint: true });
        this.maya.next();
        await this.host.calmEnding(4500);
      }
      // The Tutorial goes straight to its one result card.
      if (!this.tutorial) await this.replay(challenge, record);
    }
    this.host.challengeFx.end();
    this.renderOutlook();
    this.host.refresh();

    telemetry.emit("checkpoint", { id: challenge.id, ms: Math.round(telemetry.elapsed()) });
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
    this.stormHues(false);
    // The phase is over: nothing she queued about it may be said in the next one (Section 12).
    this.maya.dismiss();
    const nextKind = this.run.nextChallenge()?.kind;
    this.maya.withdraw((line) => isPhaseLine(line.id) || (!!nextKind && staleTip(line.id, nextKind)));
    this.maya.setState("idle");
  }

  /**
   * Section 33.2 (owner decision): `storm` on <html> switches the interface's tokens to their storm values
   * (src/ui/theme.css), fading over 600 ms, at once with Calm motion on (`storm-instant`).
   */
  private stormHues(on: boolean): void {
    const root = document.documentElement;
    root.classList.toggle("storm-instant", Boolean(this.motionToggle?.value) || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches));
    root.classList.toggle("storm", on);
  }

  /** The landmarks of a storm's area (Section 16 B6): on its tiles, or the places its forecast names. */
  private areaPlaceNames(challenge: ScheduledChallenge): string[] {
    const area = new Set(this.run.areas.get(challenge.id) ?? []);
    const names = new Set(this.forecastPlaces(challenge).map((place) => place.name));
    for (const place of [...this.host.monuments, ...this.host.landmarks]) if (area.has(`${place.q},${place.r}`)) names.add(place.name);
    return [...names];
  }

  /**
   * Section 34b.5: each defence that broke in `challenge` (the storm record's failed structures, drawn broken on the
   * board after it), by its build card's name, and whether it had cracked with age (its card said it would break).
   */
  private brokenIn(challenge: ScheduledChallenge, record: StormRecord): { elementId: string; name: string; cracked: boolean }[] {
    const keys = [...new Set(record.outcome.zones.flatMap((zone) => zone.failed))];
    return keys.flatMap((key) => {
      const inst = this.host.state.elements.get(key);
      const elementId = inst?.elementId ?? this.preChallengeIds.get(key);
      const def = elementId ? ELEMENT_BY_ID.get(elementId) : undefined;
      if (!elementId || !def) return [];
      const cracked = !!inst && isCracked(def, { builtOnTurn: inst.builtOnTurn, broken: false }, challenge.turn);
      return [{ elementId, name: CARD_NAME[elementId] ?? def.name, cracked }];
    });
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
    // Section 25.2: the biodiversity line, where the level's stars count it (every defence on the board, broken ones too).
    const stormStars = this.run.houseStarsFor(challenge);
    const bioThree = stormStars?.bioThree;
    const nature =
      bioThree !== undefined
        ? { target: bioThree, since: this.run.config.startYear, at: stormStars?.bioAtEnd ? `at the end of ${challenge.year}` : undefined, byKind: biodiversityByKind(this.host.state.elements.values()) }
        : undefined;
    const phase = phaseResult(challenge, record, this.run.areas.get(challenge.id) ?? [], this.places(), this.run.phaseBuilds.get(challenge.id) ?? [], nature);
    // Section 34b.5: the cards name each defence as its build card does ("Small dam"); a place that is not a building
    // reads "Flooded"; each defence that broke in this storm gets a row of its own.
    const buildings = new Set(this.host.monuments.filter((m) => m.kind && BUILDING_KINDS.has(m.kind)).map((m) => m.name));
    const base = {
      ...phase,
      defences: phase.defences.map((d) => ({ ...d, name: CARD_NAME[d.elementId] ?? d.name })),
      places: phase.places.map((p) => ({ ...p, building: buildings.has(p.name) })),
      broken: this.brokenIn(challenge, record)
    };
    const short = stormStars ? shortOfThree(base.stars, base.homesSaved, base.homesTotal, stormStars, record.outcome.biodiversityChange) : null;
    const pushed = this.pushedPlaces(base.places);
    const result = {
      ...base,
      ...(stormStars ? { homesStars: starsForHouses(base.homesSaved, base.homesTotal, { ...stormStars, bioTwo: undefined, bioThree: undefined }) } : {}),
      objectiveComplete: this.run.objectivesComplete.has(challenge.id),
      ...(short ? { shortOfThree: short } : {}),
      ...(pushed.length ? { pushNote: `In this game a seawall pushes water round its ends: it reached ${joinNames(pushed)}.` } : {})
    };
    const next = this.run.nextChallenge();
    const top = result.defences.find((d) => d.homes > 0);
    const results = MAYA_DATA.results as { byDefence: Record<string, { text: string; rule: boolean }>; comingUp: Record<string, { text: string; rule: boolean }> };
    if (this.tutorial) {
      // Section 31.4: a card for each storm, every defence built listed (why where it saved none); after the flood,
      // the last card: the defences tried, then Play Panjim, Try again (the Tutorial from its start) or the menu.
      this.host.telemetry.emit("checkpoint", { results: challenge.id, stars: result.stars, tutorial: true });
      const last = next === null;
      const card = { body: tutorialResultCard(result, this.tutorialRows(challenge), last), button: last ? "See what you tried" : `On to ${this.run.year}` };
      const cards: CardSpec[] = last
        ? [card, { body: tutorialFinalCard(this.tutorialTried, TUTORIAL_STEPS), button: "Play Panjim", alt: "Try again", link: "Back to the menu" }]
        : [card];
      this.stormHues(false);
      const choice = await this.resultCards.show(cards);
      if (last) this.tutorialChoice = choice;
      return;
    }
    const cards: CardSpec[] = [
      // Section 28.1 (owner decision): back to the start of this storm's build years, no confirm.
      { body: resultCard(result), button: "See what protected your city", alt: "Try this storm again" },
      // Section 17c: with Maya hidden, the cards carry no line of hers.
      { body: defencesCard(result, SHOW_MAYA && top ? results.byDefence[top.elementId] ?? null : null, (id) => ELEMENT_BY_ID.get(id)?.targetsHazards ?? [], challenge.kind), button: nextLabel(next) }
    ];
    if (next) {
      cards.push({
        body: comingUpCard(comingUpTitle(next.name, next.year, this.run.yearsUntil(next)), this.forecastPreview(next, false), SHOW_MAYA ? results.comingUp[next.kind] ?? null : null),
        button: `On to ${this.run.year}`
      });
    }
    this.host.telemetry.emit("checkpoint", { results: challenge.id, stars: result.stars, places: result.places.length, rows: result.defences.length });
    this.stormHues(false);
    if ((await this.resultCards.show(cards)) === "alt") this.retryRequested = challenge.id;
  }

  /**
   * Section 31.4: the Tutorial card's rows: every defence tried so far, in the nudge's order, with the homes it took
   * out of this storm's way when it was built (the same model as the storm, so the rows add up to the homes kept
   * safe), and why where none: the wrong kind of storm, broken before it, or its homes already safe.
   */
  private tutorialRows(challenge: ScheduledChallenge): TutorialDefenceRow[] {
    const storm = challenge.kind === "flood" ? "flood" : "cyclone";
    const credit = this.tutorialCredit.get(challenge.id) ?? new Map<string, Set<string>>();
    // Section 34: a home credited when a defence went down counts only if it still stood after this storm (an earlier
    // storm may have ruined it, or this one taken it), so the rows never add up to more than the homes saved.
    const lost = new Set<string>();
    for (const c of this.run.schedule) {
      const outcome = this.run.outcomes.get(c.id);
      if (outcome) for (const key of outcome.damagedHouses) lost.add(key);
      if (c.id === challenge.id) break;
    }
    const net = this.tutorialNet.get(challenge.id) ?? new Map<string, number>();
    const kept = (id: string): number => Math.min(net.get(id) ?? 0, [...(credit.get(id) ?? [])].filter((key) => !lost.has(key)).length);
    const none = this.tutorialNoneWhy.get(challenge.id) ?? new Map<string, "safe" | "far">();
    // The board as the storm came: the one before the action that brought it, and that action's own build.
    const standing = new Map(this.preChallengeIds);
    if (this.tutorialLastBuild) standing.set(this.tutorialLastBuild.key, this.tutorialLastBuild.elementId);
    const rows: TutorialDefenceRow[] = [];
    for (const step of TUTORIAL_STEPS) {
      if (!this.tutorialTried.has(step.id)) continue;
      const targets = ELEMENT_BY_ID.get(step.id)?.targetsHazards ?? [];
      const keys = [...standing].filter(([, id]) => id === step.id).map(([key]) => key);
      const gone = keys.length === 0;
      const broken = !gone && keys.every((key) => this.wasBroken(key));
      // Taken down or broken before the storm: it took nothing out of its way, whatever it did when built.
      const homes = gone || broken ? 0 : kept(step.id);
      let why: string | null = null;
      if (homes === 0) {
        if (gone) why = "Taken down before this storm";
        else if (broken) why = "Broken before this storm";
        else if (!targets.includes(storm)) why = `A ${targets.includes("flood") ? "flood" : "cyclone"} defence; this was a ${storm === "flood" ? "river flood" : "cyclone"}`;
        else if (none.get(step.id) === "safe") why = "Its homes were already safe when you built it";
        else why = "Too far from the homes in this storm's path";
      }
      rows.push({ elementId: step.id, name: step.name, homes, why });
    }
    return rows;
  }

  /** Was the defence at `key` broken as the storm came (from the record of the board before it)? */
  private wasBroken(key: string): boolean {
    return this.preChallengeBroken.has(key);
  }

  /** Section 28.1: the storm whose result card asked to try it again, until `endTurn` takes the run back. */
  private retryRequested: string | null = null;

  /**
   * Section 28.1: the run back at the start of `challengeId`'s build years, exactly as it was then (`ActionRun.retry`),
   * and everything on screen redrawn from it: the board (ruins, cracks, broken defences, landmarks), the clock, the
   * Outlook, the objective, and the storm's forecast cone, which shows again as at any phase start.
   */
  private applyRetry(challengeId: string): void {
    if (!this.run.retry(challengeId)) return;
    this.host.telemetry.emit("checkpoint", { retry: challengeId, year: this.run.year });
    this.host.tintTiles(null);
    this.hideCone();
    this.coneSeen.delete(challengeId);
    this.heatFramed.delete(challengeId);
    this.readinessById.delete(challengeId);
    this.host.redrawBoard();
    // Back at 2026 the first-build hint shows again, as on a new run.
    if (this.run.turnNumber === 1) this.host.container.classList.remove("has-built");
    this.busy = false;
    this.clock.set(this.clockView());
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
    this.showConeIfPhaseStart();
    // Section 34b.2: her first line after the retry says where the run is; no tip waits from before it.
    this.mayaDirector.phaseStart(true);
  }

  /**
   * Section 30.10 (owner decision): "Speed up", on screen while a storm or its replay plays. It does what a click on
   * the board does (hurries the storm; ends the replay). In the Tutorial's storm it pulses, with a word on what it does.
   */
  private readonly speedUp: HTMLButtonElement;

  private makeSpeedUp(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "speed-up";
    button.hidden = true;
    button.innerHTML = `<span class="speed-up-icon" aria-hidden="true">\u25B6\u25B6</span><span>Speed up</span>`;
    // Section 34b.5: what it does is a hover tooltip and a description for a screen reader, never a label on screen
    // (players read "It hurries the storm" as the button's own name).
    button.title = SPEED_UP_WHY;
    const why = document.createElement("span");
    why.id = "speed-up-why";
    why.className = "visually-hidden";
    why.textContent = SPEED_UP_WHY;
    button.setAttribute("aria-describedby", why.id);
    button.appendChild(why);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      // A board click: the storm's own listener takes a pointerdown on the page; the replay ends at once.
      if (this.replayCard.isOpen) this.replayCard.skip();
      else document.dispatchEvent(new PointerEvent("pointerdown"));
      this.showSpeedUp(false);
    });
    this.host.container.appendChild(button);
    return button;
  }

  private showSpeedUp(on: boolean): void {
    this.speedUp.hidden = !on;
    this.speedUp.classList.toggle("coach-pulse", on && this.tutorial);
  }

  /**
   * Section 30.11 bug 1: the damaged places beside a wall that pushes water round its ends (a seawall, as the storm
   * came): the push is why a place can be damaged with every home round it saved.
   */
  private pushedPlaces(places: readonly { name: string; stood: boolean }[]): string[] {
    const all = this.places();
    const out: string[] = [];
    for (const place of places) {
      if (place.stood) continue;
      const at = all.find((p) => p.name === place.name);
      if (!at) continue;
      const beside = neighbors({ q: at.q, r: at.r }).some((n) => (ELEMENT_BY_ID.get(this.preChallengeIds.get(`${n.q},${n.r}`) ?? "")?.endPushM ?? 0) > 0);
      if (beside && !out.includes(place.name)) out.push(place.name);
    }
    return out;
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
    // Section 34b.5: the replay card has its own Skip; Speed up stayed on screen under it, beside it.
    this.showSpeedUp(false);
    // Section 30.11 bug 11: the card moves off the tiles it describes (once drawn, the camera framed).
    const keys = [...new Set(steps.flatMap((step) => [...step.hit, ...step.dry, ...step.highlight]))];
    window.setTimeout(() => {
      const points = keys.map((key) => {
        const [q, r] = key.split(",").map(Number);
        return this.host.project({ q, r });
      }).filter((p): p is { x: number; y: number } => p !== null);
      this.replayCard.placeAvoiding(points);
    }, 60);
    await this.replayCard.play(challenge.name, steps, {
      light: (step) => {
        if (!step) {
          this.host.tintTiles(null);
          return;
        }
        // Section 34: the three tints differ by lightness, not only hue (a deuteranope saw three alike): lost homes
        // dark, wet homes still standing pale, the defences between.
        const tints: { key: string; color: string; blend: number }[] = [];
        for (const key of step.dry) tints.push({ key, color: "#b4ecc9", blend: 0.55 });
        for (const key of step.hit) tints.push({ key, color: "#8f2417", blend: 0.7 });
        for (const key of step.highlight) tints.push({ key, color: "#d49a1c", blend: 0.75 });
        this.host.tintTiles(tints);
      },
      say: (line) => {
        this.maya.dismiss();
        this.maya.say({ id: `replay:${challenge.id}:${line}`, text: line, state: "explains", urgent: true, force: true, hint: true });
        this.maya.next();
      }
    });
    this.showSpeedUp(false);
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
    // Section 25.2: the biodiversity line as the last storm came, and the star lines in words.
    // Section 26.2: the last storm's biodiversity, measured at the end of its year, against its own target.
    const lastStorm = this.run.schedule[this.run.schedule.length - 1];
    const last = lastStorm ? this.run.outcomes.get(lastStorm.id) : undefined;
    const stars = lastStorm ? this.run.houseStarsFor(lastStorm) : undefined;
    const nature =
      stars?.bioThree !== undefined && last?.biodiversityChange !== undefined
        ? {
            line: {
              change: last.biodiversityChange,
              target: stars.bioThree,
              since: this.run.config.startYear,
              at: stars.bioAtEnd ? `at the end of ${lastStorm!.year}` : undefined,
              reason: natureReason(last.biodiversityChange, stars.bioThree, biodiversityByKind(this.host.state.elements.values()))
            },
            rule: starRule(this.run.houseStars!, this.run.schedule)
          }
        : undefined;
    const choice = await this.resultCards.show([{ body: finalCard(phases, result, nature), button: "Play again", link: "Back to the menu" }]);
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
    // Section 30.3: two lines (the Tutorial's never mention a second storm or ageing); Section 30.4: the leaf chip.
    const lines = this.tutorial ? TUTORIAL_CARD_LINES : CARD_LINES;
    const cards: BuildCard[] = here.map((def) => ({ id: def.id, name: CARD_NAME[def.id] ?? def.name, line: lines[def.id]?.[0] ?? "", detail: lines[def.id]?.[1], biodiversity: cardBiodiversity(def.id), icon: CARD_ICON[def.id] ?? "" }));
    for (const id of DEFENCE_ORDER) {
      if (here.some((def) => def.id === id)) continue;
      cards.push({ id, name: CARD_NAME[id], line: lines[id][0], icon: CARD_ICON[id], notHere: true });
    }
    this.lastCardsMs = performance.now() - started;
    return cards;
  }

  /**
   * Section 30.8: a build card hovered. The homes it would take out of the next storm's risk glow green, the homes
   * it would put at risk glow red (the model of Homes at risk); none either way gives the line returned. Null clears.
   */
  cardHover(coord: AxialCoord, elementId: string | null): string | null {
    const next = this.run.nextChallenge();
    const change = elementId && next && !this.run.finished ? this.run.riskChangeBy(next, coord, elementId) : null;
    this.host.dimCone(change !== null);
    if (!change) {
      this.host.tintTiles(null);
      return null;
    }
    this.host.tintTiles([...change.saved.map((key) => ({ key, color: "#59d47e", blend: 0.62 })), ...change.added.map((key) => ({ key, color: "#e5533f", blend: 0.62 }))]);
    return buildHoverLine(change);
  }

  /** Section 30.8: the next storm's homes at risk on screen (container pixels): the cards keep off them. */
  riskPoints(): { x: number; y: number }[] {
    const next = this.run.nextChallenge();
    if (!next || this.run.finished) return [];
    return this.run
      .homesAtRiskKeys(next)
      .map((key) => {
        const [q, r] = key.split(",").map(Number);
        return this.host.project({ q, r });
      })
      .filter((p): p is { x: number; y: number } => p !== null);
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
    this.preChallengeBroken = new Set([...this.host.state.elements].filter(([, inst]) => inst.broken).map(([key]) => key));
  }

  /** Defences already broken as the current action began (Section 31.4: their row says so). */
  private preChallengeBroken = new Set<string>();

  build(coord: AxialCoord, elementId: string): boolean {
    this.host.cancelRiskIntro("build");
    if (this.busy) return false;
    this.noteBoard();
    // A refused build changes nothing, the year included.
    const turn = this.run.turnNumber;
    const buildable = this.host.state.canBuild(coord, elementId);
    // Section 31.4: in the Tutorial, what this build takes out of each coming storm's way, worked out before it
    // goes down (the same model as the storm); the storm's card credits each defence with it.
    const credit = this.tutorial && buildable
      ? this.run.schedule.filter((c) => !this.run.landed.has(c.id)).map((c) => ({ id: c.id, saves: this.run.riskChangeBy(c, coord, elementId)?.saved ?? [], net: Math.max(0, this.run.homesSavedBy(c, coord, elementId) ?? 0), atRisk: this.run.homesAtRisk(c) }))
      : [];
    // No pop-up over the tile after a build (Section 23.2, owner decision), and no note beside it when it is off the
    // objective's tiles (Section 32, owner decision): it just goes down.
    const outcome = this.run.build(coord, elementId);
    if (!outcome.ok) return false;
    // Section 34b.2: a build closes her line (lines with Got it no longer close on a timer).
    this.maya.dismiss();
    // Section 34b.4: a build of a row's defence in its place that took no home out of the storm's risk says so.
    if (outcome.rowMiss) this.host.noteAt(coord, rowMissNote(outcome.rowMiss), 4200);
    // Section 31.2: the checklist ticks the defence; its caption says "Built" before the next slides in.
    if (this.tutorial) {
      for (const { id, saves, net, atRisk } of credit) {
        const byNet = this.tutorialNet.get(id) ?? new Map<string, number>();
        byNet.set(elementId, (byNet.get(elementId) ?? 0) + net);
        this.tutorialNet.set(id, byNet);
        const byDefence = this.tutorialCredit.get(id) ?? new Map<string, Set<string>>();
        byDefence.set(elementId, new Set([...(byDefence.get(elementId) ?? []), ...saves]));
        this.tutorialCredit.set(id, byDefence);
        // Why a build took none out of this storm's way: nothing left at risk, or too far from what was.
        if (saves.length === 0) (this.tutorialNoneWhy.get(id) ?? this.tutorialNoneWhy.set(id, new Map()).get(id)!).set(elementId, atRisk === 0 ? "safe" : "far");
      }
      this.tutorialLastBuild = { key: `${coord.q},${coord.r}`, elementId };
      this.tutorialTried.add(elementId);
      this.tutorialJustBuilt = elementId;
      // At once, before a storm this build brings: the tick and "Built" show as the defence goes down (Maya's next
      // line waits for the year to settle).
      this.renderTutorial(false);
    }
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
    // Section 34: the build is on the board, so biodiversity counts it now; the storm it brings (and the rest of the
    // Outlook) waits, but this counter lagged the whole storm behind the build players had just made.
    const landing = later.find((event): event is Extract<RunEvent, { type: "challenge" }> => event.type === "challenge");
    this.outlook.renderBiodiversity(this.biodiversityView(landing?.challenge));
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
        if (this.retryRequested) break;
      }
      // Section 28.1: "Try this storm again" on its result card: the new year (and the finale) never come.
      if (this.retryRequested) {
        const id = this.retryRequested;
        this.retryRequested = null;
        this.stagingYearEnd = false;
        this.holdCountdowns(false);
        this.applyRetry(id);
        return;
      }
      this.stagingYearEnd = false;
      this.holdCountdowns(false);
      for (const event of later) if (event.type !== "challenge") this.handleEvent(event);
      if (!this.run.finished) this.clock.tick(this.clockView());
      else this.clock.set(this.clockView());
      this.showConeIfPhaseStart();
      // Section 34b.2: a phase that follows a storm opens with her line on what comes next, ahead of any tip.
      if (pending.length > 0 && !this.run.finished) this.mayaDirector.phaseStart(false);
    } finally {
      this.stagingYearEnd = false;
      this.holdCountdowns(false);
      this.busy = false;
    }
    this.renderOutlook();
    this.host.refresh();
    this.syncControls();
    if (this.run.finished) {
      if (this.tutorial) this.host.onRunComplete(this.result(), this.tutorialChoice === "link" ? "menu" : this.tutorialChoice === "alt" ? "again" : { levelId: PANAJI_LEVEL_ID });
      else await this.finale();
    } else {
      this.coachYear();
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
        // Section 30.11 bug 7: plain words, no exclamation and no number.
        this.host.showBanner(info.plain, 3800);
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
      case "aged": {
        // Section 26.1: a breakwater broke as it turned 10. Drawn broken (the refresh), and said beside it.
        const [q, r] = event.key.split(",").map(Number);
        this.host.noteAt({ q, r }, "Broken with age: in this game a breakwater lasts 10 years. Build again here.", 4000);
        // Section 30.11 bug 5: said where it is seen, wherever the camera is.
        this.host.showBanner("A breakwater broke with age. In this game a breakwater lasts 10 years.", 3600);
        break;
      }
      case "cracked": {
        // Section 30.11 bug 5: a seawall or dam turned 10: cracked, it breaks in the next storm of its kind.
        const [q, r] = event.key.split(",").map(Number);
        const name = event.elementId === "small_dam" ? "small dam" : "seawall";
        const storm = event.elementId === "small_dam" ? "flood" : "cyclone";
        this.host.noteAt({ q, r }, `Cracked with age: in this game it breaks in the next ${storm}.`, 4000);
        this.host.showBanner(`A ${name} cracked with age. In this game it breaks in the next ${storm}.`, 3600);
        break;
      }
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
  /** Each storm's track, as its cone drew it (the storm's way does not change with the defences). */
  private readonly trailTracks = new Map<string, ConeShow["tracks"]>();

  private renderGuidance(): void {
    const next = this.run.nextChallenge();
    const zones = this.run.zones;
    const open = next && zones ? this.run.prep.filter((job) => job.challengeId === next.id && !prepProgress(job, this.host.state, zones).done) : [];
    const pins = new Map<string, { name: string; q: number; r: number }>();
    for (const job of open) for (const pin of job.pins ?? []) pins.set(pin.name, pin);
    this.host.showPins([...pins.values()]);
    this.host.highlightPlaces(next && !this.run.finished ? this.areaPlaceNames(next) : [], [...pins.keys()]);
    // Section 30.7: once the cone has gone, the storm's way in (or the flood's path) stays on the board, faint.
    if (next && !this.coneShown && !this.run.finished) {
      let tracks = this.trailTracks.get(next.id);
      if (!tracks) {
        tracks = this.run.forecastCone(next)?.tracks ?? [];
        this.trailTracks.set(next.id, tracks);
      }
      this.host.showStormTrail(tracks.length ? { key: next.id, tracks } : null);
    } else this.host.showStormTrail(null);
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

  /** One of the Tutorial's coaching lines, at once and once (the build menu may be open: she stands clear of it). */
  private coach(id: keyof typeof TUTORIAL_LINES, state: MayaState): void {
    if (!this.tutorial || this.coached.has(id)) return;
    this.coached.add(id);
    // Only the line for now: one left waiting (Maya muted or shut) would be stale by the time she speaks.
    this.maya.withdraw((line) => line.id.startsWith("tutorial:") && !line.id.startsWith("tutorial:step:"));
    this.maya.dismiss();
    this.maya.say({ id: `tutorial:${id}`, text: TUTORIAL_LINES[id], state, urgent: true });
    this.maya.next();
  }

  /**
   * The build menu just opened. In the Tutorial, the first time: Maya says what
   * the cards are. Section 30.11 bug 3: only the card the Tutorial wants pulses (its objective's next defence),
   * round the whole card; no outline on every line.
   */
  cardsOpened(coord?: AxialCoord): void {
    if (!this.tutorial) {
      this.markObjectiveCard(coord);
      return;
    }
    if (this.run.turnNumber === 1) this.coach("cards", "explains");
    // Section 31.2: every year, the card of the defence the Tutorial suggests glows.
    const wanted = this.tutorialSuggestion();
    const card = [...this.host.container.querySelectorAll<HTMLElement>(".build-popover .build-card")].find((el) => el.dataset.element === wanted);
    card?.classList.add("coach-pulse");
  }

  /**
   * Section 34: on a tile the objective pulses, the card of the defence it asks for there glows and says "Objective"
   * (a pulsing tile alone did not say which defence counts, and players built another one there).
   */
  private markObjectiveCard(coord?: AxialCoord): void {
    if (!coord || this.run.finished) return;
    const key = `${coord.q},${coord.r}`;
    const zones = this.run.zones;
    const open = this.run.prep.filter((job) => !zones || !prepProgress(job, this.host.state, zones).done);
    const jobs = open.length > 0 ? this.run.prep : this.aheadRows;
    const wanted = new Set(jobs.filter((job) => this.pulseKeys(job).includes(key)).map((job) => job.elementId));
    for (const card of this.host.container.querySelectorAll<HTMLElement>(".build-popover .build-card")) {
      if (!card.dataset.element || !wanted.has(card.dataset.element) || card.querySelector(".objective-chip")) continue;
      card.classList.add("coach-pulse");
      const chip = document.createElement("span");
      chip.className = "objective-chip";
      chip.textContent = "Objective";
      card.querySelector(".build-card-title")?.appendChild(chip);
    }
  }

  /** A new Tutorial year: in a storm's own year, its red heat (Maya's line is the step's, Section 31.3). */
  private coachYear(): void {
    if (!this.tutorial) return;
    const next = this.run.nextChallenge();
    if (!next) return;
    if (this.run.yearsUntil(next) <= 1 && this.run.zones && this.run.climate) this.showForecast(next);
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
        tip: "Dunes and pandanus shield the homes behind the beach from a cyclone.",
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
    this.tutorialPanel?.dispose();
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
    document.documentElement.classList.remove("storm", "storm-instant");
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

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
