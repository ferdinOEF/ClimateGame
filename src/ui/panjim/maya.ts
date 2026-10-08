/**
 * Maya, the field guide: a naturalist from the Goan coast who lives in the
 * bottom-left corner of the HUD and says one short, specific thing at a time.
 *
 * Drawn as inline SVG and animated with CSS: no textures, no 3D, nothing to
 * load. Her look is an original design for this game: warm brown skin, dark
 * hair in a bun under an orange headband, a green field vest over a white
 * shirt, a notebook on her hip.
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
import { placeBubble, placeFigure, type Rect } from "./mayaLayout";

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

const SVG = `
<svg class="maya-figure" viewBox="0 0 120 190" width="96" height="152" aria-hidden="true" focusable="false">
  <ellipse class="maya-shadow" cx="60" cy="182" rx="26" ry="5"/>
  <g class="maya-body">
    <g class="maya-legs">
      <rect x="47" y="128" width="11" height="46" rx="4" fill="#7c6c4b"/>
      <rect x="62" y="128" width="11" height="46" rx="4" fill="#7c6c4b"/>
      <rect x="44" y="168" width="16" height="10" rx="3" fill="#4a3324"/>
      <rect x="61" y="168" width="16" height="10" rx="3" fill="#4a3324"/>
    </g>
    <g class="maya-arm maya-arm-l">
      <rect x="36" y="89" width="11" height="21" rx="5" fill="#f7f4ec" stroke="#d9d3c4" stroke-width="0.8"/>
      <rect x="37.5" y="106" width="8" height="18" rx="4" fill="#8a5634"/>
      <circle cx="41.5" cy="126" r="4.6" fill="#8a5634"/>
    </g>
    <g class="maya-torso">
      <path d="M40 88 Q60 80 80 88 L84 132 Q60 138 36 132 Z" fill="#f7f4ec" stroke="#d9d3c4" stroke-width="0.8"/>
      <path d="M40 88 Q48 84 55 86 L54 133 Q44 133 37 131 Z" fill="#3d7a4c"/>
      <path d="M80 88 Q72 84 65 86 L66 133 Q76 133 83 131 Z" fill="#3d7a4c"/>
      <rect x="41" y="104" width="9" height="8" rx="1.5" fill="#33683f"/>
      <rect x="70" y="104" width="9" height="8" rx="1.5" fill="#33683f"/>
      <path d="M54 86 L60 97 L66 86" fill="none" stroke="#d9d3c4" stroke-width="1.4"/>
      <rect x="37" y="125" width="46" height="6" rx="2" fill="#5a4330"/>
      <g class="maya-notebook">
        <rect x="75" y="117" width="13" height="17" rx="2" fill="#c98b3d" stroke="#8a5a22" stroke-width="1"/>
        <line x1="78" y1="117" x2="78" y2="134" stroke="#8a5a22" stroke-width="1"/>
        <line x1="80" y1="122" x2="86" y2="122" stroke="#f4e3c4" stroke-width="0.9"/>
        <line x1="80" y1="125" x2="86" y2="125" stroke="#f4e3c4" stroke-width="0.9"/>
      </g>
    </g>
    <g class="maya-arm maya-arm-r">
      <rect x="73" y="89" width="11" height="21" rx="5" fill="#f7f4ec" stroke="#d9d3c4" stroke-width="0.8"/>
      <rect x="74.5" y="106" width="8" height="18" rx="4" fill="#8a5634"/>
      <circle cx="78.5" cy="126" r="4.6" fill="#8a5634"/>
    </g>
    <rect x="55" y="72" width="10" height="13" rx="3" fill="#7d4c2d"/>
    <g class="maya-head">
      <circle cx="60" cy="31" r="9.5" fill="#24170f"/>
      <ellipse cx="43.5" cy="58" rx="3" ry="4" fill="#7d4c2d"/>
      <ellipse cx="76.5" cy="58" rx="3" ry="4" fill="#7d4c2d"/>
      <circle cx="43.5" cy="64" r="1.6" fill="#f2c35b"/>
      <circle cx="76.5" cy="64" r="1.6" fill="#f2c35b"/>
      <ellipse cx="60" cy="56" rx="17" ry="19" fill="#8a5634"/>
      <path d="M43 55 Q41 36 60 35 Q79 36 77 55 Q73 44 60 44 Q47 44 43 55 Z" fill="#24170f"/>
      <path d="M43.6 49 Q60 37.5 76.4 49 L76 53.5 Q60 42.5 44 53.5 Z" fill="#f08a24"/>
      <ellipse cx="49.5" cy="63.5" rx="3.2" ry="1.8" fill="#b4664a" opacity="0.4"/>
      <ellipse cx="70.5" cy="63.5" rx="3.2" ry="1.8" fill="#b4664a" opacity="0.4"/>
      <g class="maya-brows" fill="none" stroke="#24170f" stroke-width="1.7" stroke-linecap="round">
        <path class="maya-brow-l" d="M49 51.5 Q53 49.5 57 51.5"/>
        <path class="maya-brow-r" d="M63 51.5 Q67 49.5 71 51.5"/>
      </g>
      <g class="maya-eyes" fill="#20140d">
        <ellipse cx="53" cy="57.5" rx="2.1" ry="2.7"/>
        <ellipse cx="67" cy="57.5" rx="2.1" ry="2.7"/>
      </g>
      <path class="maya-mouth maya-mouth-smile" d="M54 66 Q60 71.5 66 66" fill="none" stroke="#4a1f12" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse class="maya-mouth maya-mouth-o" cx="60" cy="67.5" rx="2.6" ry="3.2" fill="#4a1f12"/>
      <path class="maya-mouth maya-mouth-worry" d="M55 68.5 Q60 65 65 68.5" fill="none" stroke="#4a1f12" stroke-width="1.8" stroke-linecap="round"/>
      <path class="maya-sweat" d="M79 41 Q76 46 79 48 Q82 46 79 41 Z" fill="#8fd0f0"/>
    </g>
  </g>
  <g class="maya-bulb">
    <circle cx="94" cy="20" r="7.5" fill="#ffd54a" stroke="#c99a1b" stroke-width="1.2"/>
    <rect x="90.5" y="27" width="7" height="5" rx="1" fill="#9b9b8f"/>
    <g stroke="#ffd54a" stroke-width="1.6" stroke-linecap="round">
      <line x1="94" y1="6" x2="94" y2="9"/><line x1="83" y1="12" x2="85.5" y2="14"/><line x1="105" y1="12" x2="102.5" y2="14"/>
    </g>
  </g>
  <g class="maya-alert">
    <circle cx="95" cy="20" r="9" fill="#e0533a" stroke="#fdf6e6" stroke-width="1.5"/>
    <rect x="93.6" y="13" width="2.8" height="9" rx="1.2" fill="#fdf6e6"/>
    <circle cx="95" cy="25.5" r="1.6" fill="#fdf6e6"/>
  </g>
  <g class="maya-stars" fill="#f2c35b" stroke="#a8781b" stroke-width="0.6">
    <path class="maya-star" d="M22 30 l2.4 5 5.4.6-4 3.7 1.1 5.3-4.9-2.7-4.9 2.7 1.1-5.3-4-3.7 5.4-.6z"/>
    <path class="maya-star" d="M98 18 l2 4.2 4.6.5-3.4 3.1.9 4.5-4.1-2.3-4.1 2.3.9-4.5-3.4-3.1 4.6-.5z"/>
    <path class="maya-star" d="M100 56 l1.6 3.3 3.6.4-2.7 2.5.7 3.5-3.2-1.8-3.2 1.8.7-3.5-2.7-2.5 3.6-.4z"/>
  </g>
</svg>`;

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

const BADGE_SIZE = { w: 52, h: 52 };

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
  private readonly heightCache = new Map<string, number>();
  private heightCacheKey = "";
  private lastLayoutMs = 0;
  /** Called when a line is shown: the Field Guide records it. */
  onSpoken: ((line: MayaLine) => void) | null = null;

  constructor(private readonly container: HTMLElement, options: { muted: boolean; reducedMotion?: boolean }) {
    this.muted = options.muted;
    this.el = document.createElement("div");
    this.el.className = "maya state-idle";
    if (options.reducedMotion) this.el.classList.add("reduced-motion");
    this.el.innerHTML = `
      <div class="maya-figure-wrap">${SVG}<button type="button" class="maya-minimise" aria-label="Minimise Maya">&minus;</button></div>
      <div class="maya-bubble side-right" role="status" aria-live="polite" hidden>
        <span class="maya-name">Maya</span>
        <p class="maya-text"></p>
        <button type="button" class="maya-dismiss">Got it</button>
      </div>
      <button type="button" class="maya-badge" aria-label="Show Maya" hidden>
        <svg viewBox="40 30 40 44" width="34" height="34" aria-hidden="true">
          <circle cx="60" cy="31" r="9.5" fill="#24170f"/>
          <ellipse cx="60" cy="56" rx="17" ry="19" fill="#8a5634"/>
          <path d="M43 55 Q41 36 60 35 Q79 36 77 55 Q73 44 60 44 Q47 44 43 55 Z" fill="#24170f"/>
          <path d="M43.6 49 Q60 37.5 76.4 49 L76 53.5 Q60 42.5 44 53.5 Z" fill="#f08a24"/>
          <ellipse cx="53" cy="57.5" rx="2.1" ry="2.7" fill="#20140d"/><ellipse cx="67" cy="57.5" rx="2.1" ry="2.7" fill="#20140d"/>
          <path d="M54 66 Q60 71.5 66 66" fill="none" stroke="#4a1f12" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
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
    window.addEventListener("resize", () => (this.layoutDirty = true), { signal: this.abort.signal });
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
    this.hideTimer = window.setTimeout(() => this.dismiss(), readingMs(line.text) + (line.anchor ? 2500 : 0));
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
    const size = { w: this.figure.offsetWidth || 96, h: this.figure.offsetHeight || 152 };
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
      spot = placeBubble(figure, measure, obstacles, viewport, 260);
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
