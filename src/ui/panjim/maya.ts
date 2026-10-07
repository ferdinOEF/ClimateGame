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

const DOCK_LEFT = 14;
const DOCK_BOTTOM = 66;
const HOP_MS = 700;

export class Maya {
  readonly el: HTMLElement;
  private readonly figure: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly queue: MayaLine[] = [];
  /** Lines already spoken this session, by id. */
  private readonly spoken = new Set<string>();
  private current: MayaLine | null = null;
  private hideTimer = 0;
  private state: MayaState = "idle";
  private muted: boolean;
  private readonly abort = new AbortController();
  /** Where she stands, in container pixels (her feet), and where she is going. */
  private pos: { x: number; y: number } | null = null;
  private hop: { from: { x: number; y: number }; startMs: number } | null = null;
  private anchor: (() => { x: number; y: number } | null) | null = null;
  private returning = false;
  /** Called when a line is shown: the Field Guide records it. */
  onSpoken: ((line: MayaLine) => void) | null = null;

  constructor(private readonly container: HTMLElement, options: { muted: boolean; reducedMotion?: boolean }) {
    this.muted = options.muted;
    this.el = document.createElement("div");
    this.el.className = "maya state-idle";
    if (options.reducedMotion) this.el.classList.add("reduced-motion");
    this.el.innerHTML = `
      <div class="maya-figure-wrap">${SVG}</div>
      <div class="maya-bubble" role="status" aria-live="polite" hidden>
        <span class="maya-name">Maya</span>
        <p class="maya-text"></p>
        <button type="button" class="maya-dismiss">Got it</button>
      </div>`;
    this.figure = this.el.querySelector(".maya-figure-wrap")!;
    this.bubble = this.el.querySelector(".maya-bubble")!;
    this.textEl = this.el.querySelector(".maya-text")!;
    this.el.querySelector(".maya-dismiss")!.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dismiss();
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
    this.el.addEventListener("pointerdown", (event) => event.stopPropagation());
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
    if (this.current || this.muted) return false;
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
    this.setState(line.state);
    if (line.anchor) this.goTo(line.anchor);
    line.onShow?.();
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.dismiss(), readingMs(line.text) + (line.anchor ? 2500 : 0));
    this.onSpoken?.(line);
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
  }

  /** Silences her lines (M). The heat and everything else carry on. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.el.classList.toggle("muted", muted);
    if (muted) this.dismiss();
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
    this.returning = false;
    this.hop = { from: this.pos ?? this.dockPoint(), startMs: performance.now() };
    this.el.classList.add("away", "hopping");
  }

  private goHome(): void {
    this.anchor = null;
    this.returning = true;
    this.hop = { from: this.pos ?? this.dockPoint(), startMs: performance.now() };
    this.el.classList.add("hopping");
  }

  private dockPoint(): { x: number; y: number } {
    return { x: DOCK_LEFT + 48, y: this.container.clientHeight - DOCK_BOTTOM };
  }

  /** Called every frame: moves her along a hop and keeps her on her anchor as the camera moves. */
  frame(nowMs: number): void {
    if (!this.anchor && !this.returning) {
      if (this.pos) {
        this.pos = null;
        this.el.style.transform = "";
        this.el.classList.remove("away", "hopping", "flip");
      }
      return;
    }
    const raw = this.anchor ? this.anchor() : null;
    const rect = { w: this.container.clientWidth, h: this.container.clientHeight };
    const target = this.returning ? this.dockPoint() : raw ? { x: clamp(raw.x, 70, rect.w - 70), y: clamp(raw.y, 230, rect.h - 40) } : this.dockPoint();
    let x = target.x;
    let y = target.y;
    if (this.hop) {
      const t = Math.min(1, (nowMs - this.hop.startMs) / HOP_MS);
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      x = this.hop.from.x + (target.x - this.hop.from.x) * ease;
      y = this.hop.from.y + (target.y - this.hop.from.y) * ease - Math.sin(Math.PI * t) * 70;
      if (t >= 1) {
        this.hop = null;
        this.el.classList.remove("hopping");
        if (this.returning) {
          this.returning = false;
          this.pos = { x, y };
          return;
        }
      }
    }
    this.pos = { x, y };
    // Her root is laid out at the dock; moving is a transform from there.
    const dock = this.dockPoint();
    this.el.style.transform = `translate(${Math.round(x - dock.x)}px, ${Math.round(y - dock.y)}px)`;
    // Near the right edge the bubble opens to her left.
    this.el.classList.toggle("flip", x > rect.w - 420);
  }

  dispose(): void {
    window.clearTimeout(this.hideTimer);
    this.abort.abort();
    this.el.remove();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
