/**
 * Maya, the field guide: a naturalist from the Goan coast who lives in the
 * bottom-left corner of the HUD and says one short, specific thing at a time.
 *
 * Drawn as a few layers and animated with CSS: no textures, no 3D, nothing to
 * load. Her look is an original design for this game (mayaArt.ts): a young
 * Goan field researcher with shoulder-length curly hair, a teal field shirt,
 * olive cargo trousers and binoculars. In the HUD she is shown whole, head to
 * boots, without her pack (the level brief and the Aftermath show her with
 * it), at MAYA_SCALE of her natural size, bubble and badge included.
 *
 * STATES. Each is a class on the root; CSS moves her arms, face and props:
 *   idle      blinks and breathes
 *   greeting  waves
 *   tip       points
 *   explains  a lightbulb
 *   warning   arms up, an alert badge
 *   worried   brows up, a sweat drop
 *   celebrates arms up, stars
 * She animates in place and never moves: with prefers-reduced-motion every
 * animation is switched off in CSS and the states stay as still poses.
 *
 * HOW SHE TALKS. Lines queue and never overlap. The controller decides when
 * she may speak (at most one line per moment, never mid-build, never over a
 * modal) and calls `next()`; Maya shows the next line, which stays until the
 * player presses "Got it" (or Esc), or for long enough to read. Each line is
 * spoken once per session unless the player reopens it from the Field Guide.
 * The bubble is real text in an `aria-live="polite"` region.
 *
 * WHERE SHE STANDS. In one place, her home in the bottom-left corner
 * (mayaLayout.ts HOME_MARGIN), placed by a fixed CSS rule: not travelling to a
 * tile for a warning, not searching for a free spot, not following the
 * camera. If something would cover her home, that element moves. Only her
 * bubble is placed, beside her, and only when the page size or a HUD element
 * it must clear changes: nothing else on the page makes her lay out again.
 */
import { openSources } from "../sourcesScreen";
import { BADGE_PX, HOME_MARGIN, MAYA_SCALE, MINIMISE_PX, figureSize, homeRect, placeBubble, screenTier, type Rect } from "./mayaLayout";
import { HUD_UNIT_PX, HUD_VIEWBOX, headUrl, hudFigureSvg } from "./mayaArt";

export type MayaState = "idle" | "greeting" | "tip" | "explains" | "warning" | "worried" | "celebrates";

export interface MayaLine {
  id: string;
  text: string;
  state: MayaState;
  /** Skips the queue: warnings go first. */
  urgent?: boolean;
  /** Say it even if it was already said this session (reopened from the Field Guide). */
  force?: boolean;
  /** Runs when the line is shown (a warning's camera glide, a discovery counted). */
  onShow?: () => void;
  /** A game rule, not a fact about the world: the bubble says so ("Game rule"). */
  rule?: boolean;
  /**
   * A discovery (nuggetPopup.ts): the bubble shows its running count under
   * the line ("2 of 21"), and a Source button when it has a `credit`. It
   * waits behind a warning but goes ahead of ordinary tips.
   */
  fact?: { id: string; credit?: string; progress: () => string };
}

/** Her HUD figure: head to boots, filling her box (whose size, in whole pixels, is set from MAYA_SCALE and the screen's tier). */
const SVG = hudFigureSvg("100%", "100%");

/** Her figure's box on a screen of this size, in whole pixels. */
function figureFor(viewport: { w: number; h: number }): { w: number; h: number } {
  return figureSize(HUD_VIEWBOX, HUD_UNIT_PX, screenTier(viewport));
}

/** How often, while a line is up, the HUD is checked for anything that moved without a change the observer sees (a card sliding into place). */
const POLL_MS = 400;

/**
 * Where a new line waits. Warnings (urgent) go first; a discovery goes after
 * them and ahead of ordinary tips, so it is said while it is news, never
 * ahead of a hazard warning; everything else queues in order.
 */
export function insertLine(queue: MayaLine[], line: MayaLine): void {
  if (line.urgent) {
    queue.unshift(line);
    return;
  }
  if (line.fact) {
    const at = queue.findIndex((queued) => !queued.urgent && !queued.fact);
    if (at >= 0) queue.splice(at, 0, line);
    else queue.push(line);
    return;
  }
  queue.push(line);
}

/** How long a line stays up if the player does not dismiss it: long enough to read twice. */
function readingMs(text: string): number {
  return Math.min(16000, Math.max(7000, 2600 + text.length * 70));
}

/**
 * Everything on screen her bubble must keep clear of. Read fresh on every
 * layout, so a card that appears, grows or collapses is allowed for. The two
 * HUD panels (hudPanels.ts) stand for everything in them: the status cluster,
 * the coin jar, the Field Guide button, and the settings toggles; shut, a panel
 * is just its small button.
 */
export const HUD_OBSTACLES = [
  ".hud-panel",
  ".panjim-clock",
  ".hud-chrome",
  ".objectives-panel",
  ".map-corner",
  ".empty-prompt",
  ".era-banner",
  ".build-popover",
  ".hud-tooltip",
  ".field-guide-toast",
  ".field-guide-card",
  ".finale-card",
  ".result-cards",
  ".brief-card",
  ".replay-card",
  // Section 16 B6: the note beside a just-built tile (it was a banner, which is above).
  ".map-note.beside"
];

export class Maya {
  readonly el: HTMLElement;
  private readonly figure: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly factEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly ruleEl: HTMLElement;
  private readonly sourceEl: HTMLButtonElement;
  private readonly badge: HTMLButtonElement;
  private readonly queue: MayaLine[] = [];
  /** Lines already spoken this session, by id. */
  private readonly spoken = new Set<string>();
  private current: MayaLine | null = null;
  private hideTimer = 0;
  private holding = false;
  private state: MayaState = "idle";
  private muted: boolean;
  private minimised = false;
  private readonly abort = new AbortController();
  private readonly observer: MutationObserver;
  private readonly resizeObserver: ResizeObserver | null;
  /** The HUD elements the observer watches (the ones in HUD_OBSTACLES), so nothing else on the page can make her lay out. */
  private readonly watched = new Set<Element>();
  /** Her figure's box now, in whole pixels (from the page size and MAYA_SCALE). */
  private figureBox = { w: 0, h: 0 };
  /** Where her bubble was last put, so an unchanged spot is not written again. */
  private bubbleAt = "";
  private layoutDirty = true;
  /** A line was held back because no bubble spot was free. */
  private heldBack = false;
  /** Test-only: lines stay up until dismissed, so a slow headless page cannot time them out mid-measurement. */
  holdLines = false;
  private readonly heightCache = new Map<string, number>();
  private heightCacheKey = "";
  private lastPollMs = 0;
  private obstacleKey = "";
  /** Called when a line is shown: the Field Guide records it. */
  onSpoken: ((line: MayaLine) => void) | null = null;

  constructor(private readonly container: HTMLElement, options: { muted: boolean; reducedMotion?: boolean }) {
    this.muted = options.muted;
    this.el = document.createElement("div");
    this.el.className = "maya state-idle";
    // The one scale and the figure's box, for panjim.css (every size of hers is a multiple of --maya-scale).
    this.el.style.setProperty("--maya-scale", String(MAYA_SCALE));
    this.el.style.setProperty("--maya-home", `${HOME_MARGIN}px`);
    this.el.style.setProperty("--maya-badge", `${BADGE_PX}px`);
    this.el.style.setProperty("--maya-minimise", `${MINIMISE_PX}px`);
    if (options.reducedMotion) this.el.classList.add("reduced-motion");
    this.el.innerHTML = `
      <div class="maya-figure-wrap">${SVG}<button type="button" class="maya-minimise" aria-label="Minimise Maya">&minus;</button></div>
      <div class="maya-bubble side-right" role="status" aria-live="polite" hidden>
        <span class="maya-name">Maya</span>
        <p class="maya-text"></p>
        <div class="maya-fact" hidden>
          <span class="maya-count"></span>
          <span class="maya-rule" hidden>Game rule</span>
          <button type="button" class="maya-source" hidden>Source</button>
        </div>
        <button type="button" class="maya-dismiss">Got it</button>
      </div>
      <button type="button" class="maya-badge" aria-label="Show Maya" hidden>
        <img class="maya-badge-face" src="${headUrl()}" width="44" height="44" alt="" draggable="false">
      </button>`;
    this.figure = this.el.querySelector(".maya-figure-wrap")!;
    this.bubble = this.el.querySelector(".maya-bubble")!;
    this.textEl = this.el.querySelector(".maya-text")!;
    this.factEl = this.el.querySelector(".maya-fact")!;
    this.countEl = this.el.querySelector(".maya-count")!;
    this.ruleEl = this.el.querySelector(".maya-rule")!;
    this.sourceEl = this.el.querySelector(".maya-source")!;
    this.sourceEl.addEventListener("click", (event) => {
      event.stopPropagation();
      const fact = this.current?.fact;
      this.dismiss();
      if (fact) openSources(fact.id);
    });
    // A line waits while the pointer or keyboard focus is in the bubble, so its Source can be reached and read.
    const hold = (on: boolean): void => {
      this.holding = on;
      if (on) window.clearTimeout(this.hideTimer);
      else if (this.current && !this.holdLines) this.armHide(this.current, 4000);
    };
    this.bubble.addEventListener("pointerenter", () => hold(true));
    this.bubble.addEventListener("pointerleave", () => hold(false));
    this.bubble.addEventListener("focusin", () => hold(true));
    this.bubble.addEventListener("focusout", () => hold(false));
    this.badge = this.el.querySelector(".maya-badge")!;
    this.el.querySelector(".maya-dismiss")!.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dismiss();
    });
    this.el.querySelector(".maya-minimise")!.addEventListener("click", (event) => {
      event.stopPropagation();
      this.setMinimised(true);
    });
    this.badge.addEventListener("click", (event) => {
      event.stopPropagation();
      this.setMinimised(false);
    });
    // Esc is the level's own key now ("Leave Panjim?" asks first, Section 12): her line stays, "Got it" and × close it.
    // The page changed size: her box is worked out again (whole pixels), and her bubble is placed again.
    const resized = (): void => {
      this.applyFigureSize();
      this.layoutDirty = true;
      // Text may reflow at another size: measure again.
      this.heightCache.clear();
    };
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(resized);
      this.resizeObserver.observe(container);
    } else {
      this.resizeObserver = null;
      window.addEventListener("resize", resized, { signal: this.abort.signal });
    }
    // Only the HUD elements her bubble must clear are watched: when one appears,
    // hides, grows or moves, the bubble is placed again. Nothing else in the page
    // counts (the map's labels, the storm's words and the camera change on
    // every frame), and her own changes are never seen.
    this.observer = new MutationObserver(() => {
      this.layoutDirty = true;
    });
    this.watchHud();
    // New HUD elements are added to the container itself.
    this.observer.observe(container, { childList: true });
    for (const part of [this.bubble, this.badge, this.el.querySelector(".maya-minimise")!]) {
      part.addEventListener("pointerdown", (event) => event.stopPropagation());
    }
    container.appendChild(this.el);
    this.applyFigureSize();
    this.setState("idle");
  }

  /** Works out her figure's box for this page size, in whole pixels, and tells the CSS. Her street-map neighbour steps right of her. */
  private applyFigureSize(): void {
    const viewport = { w: this.container.clientWidth, h: this.container.clientHeight };
    if (viewport.w < 50 || viewport.h < 50) return;
    const box = figureFor(viewport);
    if (box.w === this.figureBox.w && box.h === this.figureBox.h) return;
    this.figureBox = box;
    this.el.style.setProperty("--maya-fig-w", `${box.w}px`);
    this.el.style.setProperty("--maya-fig-h", `${box.h}px`);
    // The street-map switch and credit share her corner: they stand to her right (hud.css reads this).
    this.container.style.setProperty("--maya-reserve", `${HOME_MARGIN + Math.max(box.w, BADGE_PX) + 10}px`);
  }

  /** Starts watching any HUD element not watched yet (and forgets the ones that have gone). */
  private watchHud(): void {
    for (const el of this.watched) if (!el.isConnected) this.watched.delete(el);
    for (const el of Array.from(this.container.querySelectorAll(HUD_OBSTACLES.join(",")))) {
      if (this.watched.has(el) || this.el.contains(el)) continue;
      this.watched.add(el);
      this.observer.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
    }
  }

  /** True while a line is up. */
  get speaking(): boolean {
    return this.current !== null;
  }

  get currentLine(): MayaLine | null {
    return this.current;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isMinimised(): boolean {
    return this.minimised;
  }

  /** Whether a line with this id has been said this session. */
  hasSaid(id: string): boolean {
    return this.spoken.has(id);
  }

  /** Lines waiting to be said. */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Queues a line. Ignored if it was already said this session (unless
   * `force`) or is already waiting. Urgent lines (warnings) go to the front.
   */
  say(line: MayaLine): void {
    if (!line.force && this.spoken.has(line.id)) return;
    if (this.queue.some((queued) => queued.id === line.id) || this.current?.id === line.id) return;
    insertLine(this.queue, line);
    this.el.classList.toggle("has-pending", this.queue.length > 0);
  }

  /** Drops any queued line whose id matches (a warning that no longer applies). */
  withdraw(predicate: (line: MayaLine) => boolean): void {
    for (let i = this.queue.length - 1; i >= 0; i--) if (predicate(this.queue[i])) this.queue.splice(i, 1);
  }

  /** The next line she would say, without saying it. */
  peek(): MayaLine | null {
    return this.queue[0] ?? null;
  }

  /** Says the next queued line now, if there is one and she is free. Returns true if she spoke. */
  next(): boolean {
    if (this.current || this.muted || this.minimised) return false;
    const line = this.queue.shift();
    if (!line) return false;
    this.show(line);
    return true;
  }

  private show(line: MayaLine): void {
    this.current = line;
    this.spoken.add(line.id);
    this.textEl.textContent = line.text;
    this.bubble.hidden = false;
    this.el.classList.add("talking");
    this.el.classList.toggle("has-pending", this.queue.length > 0);
    this.setState(line.state);
    line.onShow?.();
    this.renderFact(line);
    window.clearTimeout(this.hideTimer);
    this.holding = false;
    if (!this.holdLines) this.armHide(line);
    this.onSpoken?.(line);
    this.layout();
  }

  /** The footer under a discovery or a rule: its count, "Game rule", a Source button. Nothing for an ordinary line. */
  private renderFact(line: MayaLine): void {
    const fact = line.fact;
    this.countEl.textContent = fact ? fact.progress() : "";
    this.countEl.hidden = !fact;
    this.ruleEl.hidden = !line.rule;
    this.sourceEl.hidden = !fact?.credit;
    if (fact?.credit) {
      this.sourceEl.setAttribute("aria-label", `Source: ${fact.credit}`);
      this.sourceEl.title = fact.credit;
    }
    this.factEl.hidden = !fact && !line.rule;
  }

  private armHide(line: MayaLine, minMs = 0): void {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.dismiss(), Math.max(minMs, readingMs(line.text)));
  }

  /** Closes the current line. */
  dismiss(): void {
    window.clearTimeout(this.hideTimer);
    if (!this.current) return;
    this.current = null;
    this.bubble.hidden = true;
    this.el.classList.remove("talking");
    this.setState("idle");
    this.layoutDirty = true;
  }

  /** Silences her lines (M). The heat and everything else carry on. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.el.classList.toggle("muted", muted);
    if (muted) this.dismiss();
  }

  /** Collapses her to a small badge in a free corner, or brings her back. */
  setMinimised(minimised: boolean): void {
    if (minimised === this.minimised) return;
    this.minimised = minimised;
    if (minimised) this.dismiss();
    this.el.classList.toggle("minimised", minimised);
    this.figure.hidden = minimised;
    this.badge.hidden = !minimised;
    (minimised ? this.badge : (this.el.querySelector(".maya-minimise") as HTMLElement)).focus({ preventScroll: true });
  }

  /** Sets a pose without a line (the Aftermath's celebrate or worried). */
  setState(state: MayaState): void {
    this.el.classList.remove(`state-${this.state}`);
    this.state = state;
    this.el.classList.add(`state-${state}`);
  }

  /** The rectangles of every other HUD element, in container pixels. */
  obstacles(): Rect[] {
    const box = this.container.getBoundingClientRect();
    const rects: Rect[] = [];
    for (const el of Array.from(this.container.querySelectorAll<HTMLElement>(HUD_OBSTACLES.join(",")))) {
      if (this.el.contains(el) || el.closest("[hidden]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (getComputedStyle(el).visibility === "hidden" || getComputedStyle(el).display === "none") continue;
      rects.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
    }
    return rects;
  }

  /** Her figure's and bubble's rectangles now, in container pixels (for the layout tests). */
  rects(): { figure: Rect | null; bubble: Rect | null; badge: Rect | null } {
    const box = this.container.getBoundingClientRect();
    const rel = (el: HTMLElement): Rect | null => {
      if (el.hidden) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 ? { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height } : null;
    };
    return { figure: rel(this.figure), bubble: rel(this.bubble), badge: rel(this.badge) };
  }

  /**
   * Places her bubble beside her figure, clear of everything else (see
   * mayaLayout.ts). Her figure is not placed: it stands at home by a fixed
   * CSS rule, and the bubble works around it. With no line up there is nothing
   * to place.
   */
  private layout(): void {
    this.layoutDirty = false;
    if (this.minimised || !this.current) return;
    const viewport = { w: this.container.clientWidth, h: this.container.clientHeight };
    if (viewport.w < 50 || viewport.h < 50 || this.figureBox.w === 0) return;
    this.watchHud();
    const obstacles = this.obstacles();
    this.obstacleKey = obstacles.map((o) => `${o.x},${o.y},${o.w},${o.h}`).join("|");
    this.placeBubble(homeRect(this.figureBox, viewport), obstacles, viewport);
  }

  private placeBubble(figure: Rect, obstacles: Rect[], viewport: { w: number; h: number }): void {
    // Heights by width for this line (and look), so a re-layout does not force a reflow per candidate.
    const cacheKey = `${this.textEl.textContent ?? ""}|${this.factEl.hidden}|${this.sourceEl.hidden}|${this.ruleEl.hidden}`;
    if (this.heightCacheKey !== cacheKey) {
      this.heightCache.clear();
      this.heightCacheKey = cacheKey;
    }
    const measure = (width: number): number => {
      const key = `${width}|${this.bubble.classList.contains("compact")}`;
      const cached = this.heightCache.get(key);
      if (cached !== undefined) return cached;
      this.bubble.style.width = `${width}px`;
      const height = this.bubble.offsetHeight;
      this.heightCache.set(key, height);
      return height;
    };
    this.bubble.classList.remove("compact");
    let spot = placeBubble(figure, measure, obstacles, viewport);
    if (!spot) {
      this.bubble.classList.add("compact");
      spot = placeBubble(figure, measure, obstacles, viewport, 260);
    }
    if (!spot) {
      // No room anywhere beside her: hold the line back and try again when something moves. She does not move.
      const line = this.current!;
      this.current = null;
      this.spoken.delete(line.id);
      window.clearTimeout(this.hideTimer);
      this.bubble.hidden = true;
      this.el.classList.remove("talking");
      this.queue.unshift(line);
      this.heldBack = true;
      this.bubbleAt = "";
      return;
    }
    // Only a changed spot is written.
    const at = `${spot.rect.x},${spot.rect.y},${spot.rect.w},${spot.side}`;
    if (at === this.bubbleAt) return;
    this.bubbleAt = at;
    this.bubble.style.width = `${spot.rect.w}px`;
    this.bubble.style.left = `${spot.rect.x}px`;
    this.bubble.style.top = `${spot.rect.y}px`;
    this.bubble.classList.remove("side-right", "side-above");
    this.bubble.classList.add(`side-${spot.side}`);
  }

  /**
   * Called every frame, and does nothing unless something changed: the page
   * changed size, or a HUD element her bubble must clear appeared, hid, grew
   * or moved. At most one layout a frame, and none at all while no line is up.
   */
  frame(nowMs: number): void {
    const waiting = this.current !== null || this.heldBack;
    // Something can slide into place with no change the observer sees: while she is talking, look now and then.
    if (waiting && nowMs - this.lastPollMs > POLL_MS) {
      this.lastPollMs = nowMs;
      this.watchHud();
      const key = this.obstacles().map((o) => `${o.x},${o.y},${o.w},${o.h}`).join("|");
      if (key !== this.obstacleKey) this.layoutDirty = true;
    }
    if (!this.layoutDirty) return;
    if (!waiting) {
      this.layoutDirty = false;
      return;
    }
    this.layout();
    // A line held back for lack of room gets another try once things move.
    if (this.heldBack && !this.current) {
      this.heldBack = false;
      this.next();
    }
  }

  dispose(): void {
    window.clearTimeout(this.hideTimer);
    this.observer.disconnect();
    this.resizeObserver?.disconnect();
    this.abort.abort();
    this.el.remove();
  }
}
