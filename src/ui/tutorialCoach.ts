/**
 * The step-by-step coach that runs on the tutorial map.
 *
 * WHY THIS AND NOT THE OBJECTIVES PANEL
 *
 * `ObjectivesPanel` is already a live checklist, and it is the right tool for
 * every level except the first. The difference is what it assumes: it tells a
 * player WHAT to achieve, and takes for granted they know how to do anything
 * at all. "Have 4 Mangroves standing" is a useful goal and useless
 * instruction — it does not say that mangroves go on the estuary, that the
 * estuary is the olive-green water, that clicking a tile opens a menu, or
 * that building is the only thing that advances the clock.
 *
 * So the coach is a second, temporary layer that teaches the verbs. It runs
 * only on levels flagged `tutorial`, sits in the top-centre of the screen
 * where the eye lands before it finds a corner, and goes away for good once
 * its last step is done.
 *
 * HOW A STEP ADVANCES
 *
 * Two kinds, and the distinction is the whole design:
 *
 *   - A step with a `done` predicate waits for the player to actually DO the
 *     thing. It cannot be dismissed, there is no Next button, and it keeps
 *     saying what to do until it happens. These are the steps that teach.
 *   - A step with no predicate is a sentence of explanation and advances on a
 *     button press. These are the steps that frame.
 *
 * What it deliberately does NOT do is drive the game. The coach only ever
 * reads state and renders text; it never builds, never advances a turn, never
 * disables input, and never blocks a click. A player who ignores it entirely
 * can still play the level and still clear it, because the tutorial's real
 * win conditions are ordinary objectives in `levels.json`. That keeps the two
 * systems independent: a bug here cannot make the level unwinnable.
 */

/** Everything a step's predicate is allowed to look at. */
export interface TutorialState {
  /** Standing count per element id. */
  standingByElement: Map<string, number>;
  turn: number;
  hazardsSurvived: number;
  /** True once the player has opened a tile's menu at least once. */
  hasOpenedTileMenu: boolean;
}

interface TutorialStep {
  /** Short heading, like a chapter title. */
  title: string;
  /** What to do, or what just happened. One or two sentences. */
  body: string;
  /**
   * When this step is satisfied. Absent means the step is explanatory and
   * advances on the Next button instead.
   */
  done?: (state: TutorialState) => boolean;
  /** Overrides the "Next" label on an explanatory step. */
  cta?: string;
}

function standing(state: TutorialState, elementId: string): number {
  return state.standingByElement.get(elementId) ?? 0;
}

/**
 * The script.
 *
 * Ordered so that every step either explains the thing the next step asks for,
 * or asks for the thing the previous step explained — never a request the
 * player has not been given the means to satisfy. The three build steps are
 * also, not coincidentally, the tutorial level's three build objectives, so
 * following the coach to the end clears the level.
 */
const STEPS: TutorialStep[] = [
  {
    title: "This is a coast",
    body:
      "Open sea on the left, then a bar of sand, then the olive-green shallows where fresh water meets salt, and the river behind. Drag to pan, scroll or pinch to zoom.",
    cta: "Got it"
  },
  {
    title: "Every tile offers what belongs on it",
    body: "Click any tile to see what can be built there. A seawall will not go in a river, and a house will not go in the sea.",
    done: (state) => state.hasOpenedTileMenu
  },
  {
    title: "Plant a dune",
    body:
      "Click the pale sand and build a Dune. It is the cheapest thing on the roster and it does a real job: loose sand takes the energy out of a wave instead of bouncing it somewhere else.",
    done: (state) => standing(state, "dune") > 0
  },
  {
    title: "Building is what moves the clock",
    body:
      "Look at the turn counter — it went up. Nothing happens while you think, so the pace is entirely yours. But once a storm is counting down, it lands on time whatever you are doing.",
    cta: "Next"
  },
  {
    title: "Plant a mangrove",
    body:
      "Click the olive-green shallows, the estuary, and build a Mangrove. That tangle of stilt roots is the best wave absorber on this coast, and it feeds everything else that lives here.",
    done: (state) => standing(state, "mangrove") > 0
  },
  {
    title: "Living defences need time",
    body:
      "A mangrove takes four turns to reach full strength. Build it early and it is ready when you need it; build it the turn before a storm and it is a sapling in a surge.",
    cta: "Next"
  },
  {
    title: "Put somebody on the land",
    body:
      "Build a House on the green inland tiles. People are the reason any of this matters — and the thing a storm costs you if the coast does not hold.",
    done: (state) => standing(state, "house") > 0
  },
  {
    title: "Something is coming",
    body:
      "Watch the storm countdown in the corner. When it runs out the surge arrives, sweeps in from the sea, and every defence in its path takes the energy out of it. Keep building until then.",
    cta: "Ready"
  },
  {
    title: "Hold the coast",
    body: "Ride out one storm. Your defences will do the work — watch where the water gets through and where it does not.",
    done: (state) => state.hazardsSurvived > 0
  },
  {
    title: "That is the whole game",
    body:
      "Nature-based defences grow slowly, give back, and fail gently. Engineered ones work instantly, work harder, and fail all at once. Everything from here is choosing between them on a real coast.",
    cta: "Finish"
  }
];

export class TutorialCoach {
  private readonly el: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly stepEl: HTMLElement;
  private readonly ctaEl: HTMLButtonElement;
  private readonly waitEl: HTMLElement;

  private index = 0;
  private finished = false;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "hud-corner top-center tutorial-coach";
    this.el.innerHTML = `
      <div class="coach-step"></div>
      <div class="coach-title"></div>
      <p class="coach-body"></p>
      <button type="button" class="coach-cta"></button>
      <div class="coach-wait" aria-hidden="true"></div>
    `;
    this.stepEl = this.el.querySelector(".coach-step")!;
    this.titleEl = this.el.querySelector(".coach-title")!;
    this.bodyEl = this.el.querySelector(".coach-body")!;
    this.ctaEl = this.el.querySelector(".coach-cta") as HTMLButtonElement;
    this.waitEl = this.el.querySelector(".coach-wait")!;

    // `aria-live="polite"` rather than `assertive`: a step change is worth
    // announcing, but not worth cutting across whatever the player is already
    // being told about the board.
    this.el.setAttribute("role", "region");
    this.el.setAttribute("aria-label", "Tutorial");
    this.el.setAttribute("aria-live", "polite");

    this.ctaEl.addEventListener("click", () => this.advance());
    container.appendChild(this.el);
    this.paint();
  }

  /** True once the script has run out. The session stops calling `update` after this. */
  get isFinished(): boolean {
    return this.finished;
  }

  /**
   * Called on every HUD refresh. Advances past any step whose condition is
   * now met — plural, because one build can satisfy a step and the one after
   * it, and stopping at the first would leave the coach a step behind the
   * board.
   *
   * Explanatory steps stop the loop: they are waiting on a button, and
   * skipping one because the next build already happened would mean the
   * player never reads it.
   */
  update(state: TutorialState): void {
    if (this.finished) return;

    let moved = false;
    while (this.index < STEPS.length) {
      const step = STEPS[this.index];
      if (!step.done || !step.done(state)) break;
      this.index++;
      moved = true;
    }
    if (moved) this.paint();
  }

  /** Steps past an explanatory step. Does nothing on a step that is waiting for an action. */
  private advance(): void {
    const step = STEPS[this.index];
    if (!step || step.done) return;
    this.index++;
    this.paint();
  }

  private paint(): void {
    if (this.index >= STEPS.length) {
      this.finished = true;
      this.el.hidden = true;
      return;
    }

    const step = STEPS[this.index];
    this.stepEl.textContent = `Step ${this.index + 1} of ${STEPS.length}`;
    this.titleEl.textContent = step.title;
    this.bodyEl.textContent = step.body;

    const waitingOnPlayer = Boolean(step.done);
    // One of the two is always hidden. A step that waits for an action must
    // not show a button that looks like it would skip it, and a step that
    // waits for a button must not show a "your turn" prompt.
    this.ctaEl.hidden = waitingOnPlayer;
    this.waitEl.hidden = !waitingOnPlayer;
    this.ctaEl.textContent = step.cta ?? "Next";
    this.waitEl.textContent = "Your turn — complete the task above";

    // Restart the entrance animation on each step so a change is noticed even
    // when the player's attention is on the board rather than the panel.
    this.el.classList.remove("coach-enter");
    void this.el.offsetWidth; // forces reflow, so re-adding the class replays it
    this.el.classList.add("coach-enter");
  }

  /** Hides the coach for good — used when the run ends before the script does. */
  dismiss(): void {
    this.finished = true;
    this.el.hidden = true;
  }
}
