/**
 * Maya, the field guide: a naturalist from the Goan coast who lives in the
 * bottom-left corner of the HUD and says one short, specific thing at a time.
 *
 * Drawn as inline SVG and animated with CSS: no textures, no 3D, nothing to
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
 *   jump      a hop (used when she moves to a tile)
 * With prefers-reduced-motion every animation is switched off in CSS; the
 * states stay as still poses, and moves become a fade.
 *
 * HOW SHE TALKS. Lines queue and never overlap. The controller decides when
 * she may speak (at most one line per quarter, never mid-build, never over a
 * modal) and calls `next()`; Maya shows the next line, which stays until the
 * player presses "Got it" (or Esc), or for long enough to read. Each line is
 * spoken once per session unless the player reopens it from the Field Guide.
 * The bubble is real text in an `aria-live="polite"` region.
 *
 * MOVING. Docked, she stands in her corner. For a warning she can hop to a
 * point on the board (`goTo`), following it as the camera moves, then hop
 * home when the line is done.
 */
import { MAYA_SCALE, figureSize, placeBubble, placeFigure, scaled, type Rect } from "./mayaLayout";
import { HUD_UNIT_PX, HUD_VIEWBOX, headUrl, hudFigureSvg } from "./mayaArt";

export type MayaState = "idle" | "greeting" | "tip" | "explains" | "warning" | "worried" | "celebrates" | "jump";

export interface MayaLine {
  id: string;
  text: string;
  state: MayaState;
  /** Skips the queue: warnings go first. */
  urgent?: boolean;
  /** Say it even if it was already said this session (reopened from the Field Guide). */
  force?: boolean;
  /** A screen point to hop to while saying it (see `goTo`). */
  anchor?: () => { x: number; y: number } | null;
  /** Runs when the line is shown (a warning's camera glide). */
  onShow?: () => void;
}

/** Her HUD figure: head to boots, at her scale (mayaLayout.ts MAYA_SCALE). panjim.css sizes it per screen from these. */
const FIGURE = figureSize(HUD_VIEWBOX, HUD_UNIT_PX);
const SVG = hudFigureSvg(FIGURE.w, FIGURE.h);

/** How long a line stays up if the player does not dismiss it: long enough to read twice. */
function readingMs(text: string): number {
  return Math.min(16000, Math.max(7000, 2600 + text.length * 70));
}

/**
 * Everything on screen Maya must keep clear of. Read fresh on every layout,
 * so a card that appears, grows or collapses moves her with it.
 */
export const HUD_OBSTACLES = [
  ".instrument-cluster",
  ".coin-jar",
  ".field-guide-button",
  ".panjim-clock",
  ".hud-chrome",
  ".houses-counter",
  ".panjim-toggles",
  ".objectives-panel",
  ".nugget-badge",
  ".map-corner",
  ".empty-prompt",
  ".era-banner",
  ".build-popover",
  ".hud-tooltip",
  ".field-guide-toast",
  ".aftermath-card",
  ".field-guide-card",
  ".finale-card",
  ".brief-card",
  ".replay-card",
  ".sound-toggle",
  ".quality-control"
];

const BADGE_SIZE = { w: scaled(52), h: scaled(52) };

export class Maya {
  readonly el: HTMLElement;
  private readonly figure: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly badge: HTMLButtonElement;
  private readonly queue: MayaLine[] = [];
  /** Lines already spoken this session, by id. */
  private readonly spoken = new Set<string>();
  private current: MayaLine | null = null;
  private hideTimer = 0;
  private state: MayaState = "idle";
  private muted: boolean;
  private minimised = false;
  private readonly abort = new AbortController();
  private readonly observer: MutationObserver;
  /** Where her figure stands now, in container pixels. */
  private placed: Rect | null = null;
  private anchor: (() => { x: number; y: number } | null) | null = null;
  private layoutDirty = true;
  /** A line was held back because no bubble spot was free. */
  private heldBack = false;
  /** Test-only: lines stay up until dismissed, so a slow headless page cannot time them out mid-measurement. */
  holdLines = false;
  private readonly heightCache = new Map<string, number>();
  private heightCacheKey = "";
  private lastLayoutMs = 0;
  /** Called when a line is shown: the Field Guide records it. */
  onSpoken: ((line: MayaLine) => void) | null = null;

  constructor(private readonly container: HTMLElement, options: { muted: boolean; reducedMotion?: boolean }) {
    this.muted = options.muted;
    this.el = document.createElement("div");
    this.el.className = "maya state-idle";
    // The one scale and the figure's box, for panjim.css (every size of hers is a multiple of --maya-scale).
    this.el.style.setProperty("--maya-scale", String(MAYA_SCALE));
    this.el.style.setProperty("--maya-fig-w", `${FIGURE.w}px`);
    this.el.style.setProperty("--maya-fig-h", `${FIGURE.h}px`);
    if (options.reducedMotion) this.el.classList.add("reduced-motion");
    this.el.innerHTML = `
      <div class="maya-figure-wrap">${SVG}<button type="button" class="maya-minimise" aria-label="Minimise Maya">&minus;</button></div>
      <div class="maya-bubble side-right" role="status" aria-live="polite" hidden>
        <span class="maya-name">Maya</span>
        <p class="maya-text"></p>
        <button type="button" class="maya-dismiss">Got it</button>
      </div>
      <button type="button" class="maya-badge" aria-label="Show Maya" hidden>
        <img class="maya-badge-face" src="${headUrl()}" width="44" height="44" alt="" draggable="false">
      </button>`;
    this.figure = this.el.querySelector(".maya-figure-wrap")!;
    this.bubble = this.el.querySelector(".maya-bubble")!;
    this.textEl = this.el.querySelector(".maya-text")!;
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
    // Esc dismisses her line before it reaches the level's own Esc (quit).
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && this.current) {
          event.stopPropagation();
          event.preventDefault();
          this.dismiss();
        }
      },
      { capture: true, signal: this.abort.signal }
    );
    window.addEventListener(
      "resize",
      () => {
        this.layoutDirty = true;
        // Text may reflow at another size: measure again.
        this.heightCache.clear();
      },
      { signal: this.abort.signal }
    );
    // Any HUD element appearing, hiding, growing or moving re-lays her out.
    // Her own changes are ignored, or she would chase herself.
    this.observer = new MutationObserver((records) => {
      // Things that move with the camera every frame (the storm's words, the
      // forecast label, the lightning overlay) are not HUD and do not count.
      const moving = (node: Node): boolean => node instanceof Element && node.closest(".storm-word, .forecast-label, .storm-flash") !== null;
      if (records.some((record) => !this.el.contains(record.target) && !moving(record.target))) this.layoutDirty = true;
    });
    this.observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
    for (const part of [this.bubble, this.badge, this.el.querySelector(".maya-minimise")!]) {
      part.addEventListener("pointerdown", (event) => event.stopPropagation());
    }
    container.appendChild(this.el);
    this.setState("idle");
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
    if (line.urgent) this.queue.unshift(line);
    else this.queue.push(line);
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
    if (line.anchor) this.goTo(line.anchor);
    line.onShow?.();
    window.clearTimeout(this.hideTimer);
    if (!this.holdLines) this.hideTimer = window.setTimeout(() => this.dismiss(), readingMs(line.text) + (line.anchor ? 2500 : 0));
    this.onSpoken?.(line);
    this.layout(performance.now());
  }

  /** Closes the current line and goes home. */
  dismiss(): void {
    window.clearTimeout(this.hideTimer);
    if (!this.current) return;
    this.current = null;
    this.bubble.hidden = true;
    this.el.classList.remove("talking");
    if (this.anchor) this.goHome();
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
    this.layoutDirty = true;
    this.layout(performance.now());
    (minimised ? this.badge : (this.el.querySelector(".maya-minimise") as HTMLElement)).focus({ preventScroll: true });
  }

  /** Sets a pose without a line (the Aftermath's celebrate or worried). */
  setState(state: MayaState): void {
    this.el.classList.remove(`state-${this.state}`);
    this.state = state;
    this.el.classList.add(`state-${state}`);
  }

  /** Hops to a point on the board and follows it until the line is done. */
  goTo(anchor: () => { x: number; y: number } | null): void {
    this.anchor = anchor;
    this.el.classList.add("away");
    this.layoutDirty = true;
  }

  private goHome(): void {
    this.anchor = null;
    this.el.classList.remove("away");
    this.layoutDirty = true;
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
   * Places her figure, then her bubble, clear of everything else (see
   * mayaLayout.ts). A big move (to a tile, or home) fades her out and hops
   * her in at the new spot, so she never sweeps across the HUD on the way.
   */
  private layout(nowMs: number): void {
    this.layoutDirty = false;
    this.lastLayoutMs = nowMs;
    const viewport = { w: this.container.clientWidth, h: this.container.clientHeight };
    if (viewport.w < 50 || viewport.h < 50) return;
    const obstacles = this.obstacles();
    if (this.minimised) {
      const spot = placeFigure(BADGE_SIZE, obstacles, viewport, null);
      if (spot) {
        this.badge.style.left = `${spot.x}px`;
        this.badge.style.top = `${spot.y}px`;
      }
      return;
    }
    const size = { w: this.figure.offsetWidth || FIGURE.w, h: this.figure.offsetHeight || FIGURE.h };
    const target = this.anchor ? this.anchor() : null;
    const spot = placeFigure(size, obstacles, viewport, target) ?? placeFigure(size, obstacles, viewport, null);
    if (!spot) {
      // Nowhere free at all (a tiny window): step aside as a badge.
      this.figure.style.visibility = "hidden";
      return;
    }
    this.figure.style.visibility = "";
    const moved = !this.placed || Math.hypot(spot.x - this.placed.x, spot.y - this.placed.y) > 60;
    if (moved && this.placed) {
      this.el.classList.remove("hopping");
      void this.el.offsetWidth;
      this.el.classList.add("hopping");
      window.setTimeout(() => this.el.classList.remove("hopping"), 520);
    }
    this.placed = spot;
    this.figure.style.left = `${spot.x}px`;
    this.figure.style.top = `${spot.y}px`;
    if (!this.current) return;
    this.placeBubble(spot, obstacles, viewport);
  }

  private placeBubble(figure: Rect, obstacles: Rect[], viewport: { w: number; h: number }): void {
    // Heights by width for this line (and look), so a re-layout does not force a reflow per candidate.
    const cacheKey = this.textEl.textContent ?? "";
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
      spot = placeBubble(figure, measure, obstacles, viewport, scaled(260));
    }
    if (!spot) {
      // No room anywhere beside her: hold the line back and try again later.
      const line = this.current!;
      this.current = null;
      this.spoken.delete(line.id);
      window.clearTimeout(this.hideTimer);
      this.bubble.hidden = true;
      this.el.classList.remove("talking");
      this.queue.unshift(line);
      this.heldBack = true;
      return;
    }
    this.bubble.style.width = `${spot.rect.w}px`;
    this.bubble.style.left = `${spot.rect.x}px`;
    this.bubble.style.top = `${spot.rect.y}px`;
    this.bubble.classList.remove("side-right", "side-above", "side-left");
    this.bubble.classList.add(`side-${spot.side}`);
  }

  /** Called every frame: follows a tile while away; otherwise re-lays out on change (and a few times a second). */
  frame(nowMs: number): void {
    // Following a tile: ten times a second is smooth enough and keeps layout cheap.
    const followDue = this.anchor !== null && nowMs - this.lastLayoutMs > 100;
    if (followDue || (this.layoutDirty && nowMs - this.lastLayoutMs > 50) || nowMs - this.lastLayoutMs > 250) {
      this.layout(nowMs);
      // A line held back for lack of room gets another try once things move.
      if (this.heldBack && !this.current) {
        this.heldBack = false;
        this.next();
      }
    }
  }

  dispose(): void {
    window.clearTimeout(this.hideTimer);
    this.observer.disconnect();
    this.abort.abort();
    this.el.remove();
  }
}
