import { GuideMachine, guideLine, type GuideStep, type GuideTile } from "@core/guide";
import { MAYA } from "@core/mayaLines";
import type { AxialCoord } from "@core/hex";
import type { Maya, MayaLine } from "@ui/panjim/maya";
import { CARD_NAME } from "@ui/panjim/defenceCards";
import { GuideOverlay } from "@ui/panjim/guideOverlay";

/**
 * Section 39.4: the guided start in the game. The step machine (core/guide.ts) is told what the player does (the
 * build menu opening and closing, a build); this draws its step (ui/panjim/guideOverlay.ts) and gives Maya its line.
 * Maya's other lines (her first line, a fact after a build) wait until it ends.
 */
export interface GuidedStartDeps {
  container: HTMLElement;
  maya: Maya;
  /** A tile's centre and radius on screen, in container pixels; null when it is off screen. */
  projectTile: (coord: AxialCoord) => { x: number; y: number; r: number } | null;
  /** The first storm's year, and the builds before it now. */
  storm: () => { year: number; builds: number };
  /** Called once, when the guide ends. */
  onEnd: () => void;
}

const coordOf = (key: string): AxialCoord => {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
};

export class GuidedStart {
  private readonly machine: GuideMachine;
  private readonly overlay: GuideOverlay;
  /** The line for the step now; a step's line comes back if it was closed (Esc) while the step lasts. */
  private line: MayaLine | null = null;
  /** Step 1 says hello only the first time (a return to it from its menu does not). */
  private greeted = false;
  private shownStep: GuideStep | null = null;
  private ended = false;

  constructor(first: GuideTile, second: GuideTile, private readonly deps: GuidedStartDeps) {
    this.machine = new GuideMachine(first, second);
    this.overlay = new GuideOverlay(deps.container);
    // Her first line is replaced by the guide's (its id, so the Field Guide still records her first job).
    deps.maya.withdraw((queued) => queued.id === MAYA.opening.id);
    if (deps.maya.currentLine?.id === MAYA.opening.id) deps.maya.dismiss();
    deps.container.classList.add("guide-running");
    this.sync();
  }

  get active(): boolean {
    return !this.ended;
  }

  get step(): GuideStep {
    return this.machine.step;
  }

  /** The build menu is open on `key` (null: closed). */
  menu(key: string | null): void {
    if (this.ended) return;
    this.machine.menu(key);
    this.sync();
  }

  /** A build went down (after the controller has closed Maya's line for it). */
  built(key: string, elementId: string): void {
    if (this.ended) return;
    this.machine.built(key, elementId);
    this.sync();
  }

  /** "Skip the help": step 3, its Got it focused (the Skip button it was pressed on is gone). */
  skip(): void {
    if (this.ended) return;
    this.machine.skip();
    this.sync();
    this.deps.container.querySelector<HTMLElement>(".maya-bubble:not([hidden]) .maya-dismiss:not([hidden])")?.focus({ preventScroll: true });
  }

  /** Every frame: the spotlight, rings and tags follow their tile; Maya's line goes up once she can say it. */
  frame(): void {
    if (this.ended) return;
    // The guide lives in her bubble: muted (M) or minimised, she cannot give it, so it ends.
    if (this.deps.maya.isMuted || this.deps.maya.isMinimised) {
      this.end();
      return;
    }
    const step = this.machine.step;
    const target = this.machine.target;
    const name = target ? (CARD_NAME[target.elementId] ?? target.elementId) : "";
    // The card to pick, ringed in gold while its menu is open.
    let card: { x: number; y: number; w: number; h: number } | null = null;
    const box = this.deps.container.getBoundingClientRect();
    for (const el of this.deps.container.querySelectorAll<HTMLElement>(".build-popover .build-card")) {
      const pick = (step === "1b" || step === "2b") && el.dataset.element === target?.elementId;
      el.classList.toggle("guide-pick", pick);
      if (pick) {
        const r = el.getBoundingClientRect();
        card = { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
      }
    }
    const first = this.machine.first;
    this.overlay.render({
      step,
      tile: target ? this.deps.projectTile(coordOf(target.key)) : null,
      card,
      chip: step === "2" || step === "2b" ? this.deps.projectTile(coordOf(first.key)) : null,
      clickLabel: MAYA.guide.clickHere,
      pickLabel: MAYA.guide.pick.replace("{name}", name),
      chipLabel: MAYA.guide.built.replace("{name}", CARD_NAME[first.elementId] ?? first.elementId)
    });
    this.say();
  }

  /** Puts up the step's line (once per step) and marks step 3 on the page. */
  private sync(): void {
    const step = this.machine.step;
    this.deps.container.classList.toggle("guide-step-3", step === "3");
    if (step === "done") {
      this.end();
      return;
    }
    if (step === this.shownStep) return;
    this.shownStep = step;
    const maya = this.deps.maya;
    const target = this.machine.target;
    const storm = this.deps.storm();
    const words = guideLine(step, { year: storm.year, builds: storm.builds, name: target ? (CARD_NAME[target.elementId] ?? target.elementId) : "" });
    if (step === "1") {
      if (this.greeted) words.text = words.text.replace(/^Hello! I am Maya\. /, "");
      this.greeted = true;
    }
    maya.withdraw((queued) => queued.id.startsWith("guide:") || queued.id === MAYA.opening.id);
    const current = maya.currentLine;
    if (current && (current.id.startsWith("guide:") || current.id === MAYA.opening.id)) maya.dismiss();
    this.line = {
      // Step 1 carries her first line's id: the Field Guide records her first job as before.
      id: step === "1" ? MAYA.opening.id : `guide:${step}`,
      text: words.text,
      bold: words.bold,
      state: step === "3" ? "celebrates" : step === "1" ? "greeting" : "tip",
      force: true,
      urgent: true,
      ...(words.at !== null
        ? { sticky: true, steps: { at: words.at, of: 2, onSkip: () => this.skip() } }
        : // Step 3: Got it, or the line closing any other way, ends the guide.
          { onDismiss: () => this.finish() })
    };
    this.say();
  }

  /** Says the step's line when Maya is free to (she shows nothing while muted, minimised or tucked). */
  private say(): void {
    const line = this.line;
    if (!line) return;
    const maya = this.deps.maya;
    if (maya.currentLine === line) return;
    if (maya.speaking) {
      // Something of hers is up (a line said before the guide began): the guide's goes first.
      if (!maya.currentLine?.id.startsWith("guide:")) maya.dismiss();
    }
    if (!maya.queued.includes(line)) maya.say(line);
    maya.next((queued) => queued === line);
  }

  private finish(): void {
    this.line = null;
    this.machine.gotIt();
    this.sync();
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.line = null;
    this.deps.maya.withdraw((queued) => queued.id.startsWith("guide:"));
    for (const el of this.deps.container.querySelectorAll(".guide-pick")) el.classList.remove("guide-pick");
    this.deps.container.classList.remove("guide-running", "guide-step-3");
    this.overlay.dispose();
    this.deps.onEnd();
  }

  dispose(): void {
    this.ended = true;
    this.deps.container.classList.remove("guide-running", "guide-step-3");
    this.overlay.dispose();
  }
}
