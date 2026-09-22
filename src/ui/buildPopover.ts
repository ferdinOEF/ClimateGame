export interface PopoverOption {
  id: string;
  name: string;
  buildCost: number;
  /** Shown as a small tag so a defense reads differently from a town building at a glance. */
  kindLabel?: string;
}

export interface BuiltElementInfo {
  name: string;
  kindLabel?: string;
  /** Rendered as "key +delta" / "key delta" chips — whatever's in the element's effects map. */
  effects: Record<string, number>;
  /** STEP_PROMPT_manual_only_mode.md Part C: removing what you built is a natural counterpart to building it — no confirm here, unlike the dev panel's board-wide reset, since this only ever affects the one tile already in view. */
  onRemove: () => void;
}

const VIEWPORT_MARGIN = 8;

// STEP_PROMPT_liquid_glass_hud.md item 2.2: values copied from the Khazan
// Interface Study artifact's own CSS, not re-derived.
const RADIAL_ARC_DEG = 130;
const RADIAL_RADIUS_PX = 108;
const CHIP_STAGGER_MS = 70;
/** Half the arc's own footprint (radius) plus roughly a chip's half-width, so the whole fan — not just its anchor point — stays clear of the viewport edge. */
const RADIAL_CLAMP_MARGIN_PX = RADIAL_RADIUS_PX + 70;

/**
 * The doc's own pseudocode: `angle_i = -65deg + (130deg/(N-1))*i`, then
 * `tx = cos(angle_i)*108, ty = sin(angle_i)*108` — read literally (0deg
 * along +x) that fans out to the RIGHT of the tile, not above it. Read
 * against the doc's prose ("a 130deg arc centered above the tile"), the
 * angle is clearly meant relative to "up," so the raw angle gets a -90deg
 * rotation here before feeding it to cos/sin, into this file's actual
 * screen-space convention (0deg = +x/right, 90deg = +y/down). A single
 * option centers straight above, per the doc's own "single-option case
 * just centers above" note.
 */
function radialOffset(index: number, count: number): { tx: number; ty: number } {
  if (count <= 1) return { tx: 0, ty: -RADIAL_RADIUS_PX };
  const stepDeg = RADIAL_ARC_DEG / (count - 1);
  const rawDeg = -65 + stepDeg * index;
  const screenRad = ((rawDeg - 90) * Math.PI) / 180;
  return { tx: Math.cos(screenRad) * RADIAL_RADIUS_PX, ty: Math.sin(screenRad) * RADIAL_RADIUS_PX };
}

/**
 * The contextual build menu: a small popover anchored to the clicked tile's
 * screen position — never a persistent sidebar. Section 3's non-negotiable
 * rule: build choices appear at the tile, in place, and disappear when done.
 *
 * Backed by a full-viewport transparent backdrop (NEXT_STEPS.md's A1: a
 * "real modal layer" was the explicit ask, not just an outside-click
 * listener) that sits above the canvas and below the popover box itself
 * while open, so a click anywhere except the popover can never reach the
 * 3D scene underneath a still-open popover — it always just closes the
 * popover instead, with no side effect on whatever tile happens to be
 * under the cursor. The backdrop's own click handler only fires when the
 * click's `target` is the backdrop element itself, not a descendant, so a
 * click on the popover's own content never closes it.
 *
 * A prior version had none of this and relied on the caller checking
 * `isOpen`/`contains()` before acting — that depended on `this.el.hidden`
 * actually hiding the element, which it silently didn't: `.build-popover`
 * has its own unconditional `display: flex` in hud.css, an author-origin
 * rule that overrides the `[hidden]` user-agent default regardless of
 * selector specificity, so setting `.hidden = true` updated the attribute
 * correctly but never changed what was on screen. That was the actual root
 * cause of A1's whole "doesn't dismiss" symptom family — the JS-side
 * open/closed state was correct the entire time. Once hiding moved to
 * `this.backdrop.hidden` (below) instead of `this.el.hidden`, the problem
 * stopped applying at all — `.popover-backdrop` has no competing `display`
 * override, so the browser's own `[hidden]` default just works, and a
 * hidden ancestor hides `.build-popover` regardless of its own `display`.
 * The `.build-popover[hidden]` CSS override this originally needed became
 * dead weight once nothing set that attribute on `.build-popover` itself
 * anymore — removed in the STEP_PROMPT_code_review_cleanup.md pass.
 *
 * STEP_PROMPT_liquid_glass_hud.md item 2.1: this was already anchoring to
 * the tapped tile's own screen-space projection (`screenX`/`screenY`
 * below, computed by the caller via `worldToScreen()`), not a fixed
 * screen corner — the doc's own premise for this item was stale, same
 * shape as Section 0's zoom/Mangrove findings. Nothing changed for 2.1
 * itself; 2.2/2.3 (below) are the real new work.
 */
export class BuildPopover {
  private backdrop: HTMLElement;
  private el: HTMLElement;
  private rejectionEl: HTMLElement;
  private rejectionTimer: number | undefined;
  private confirmPillEl: HTMLElement;
  private confirmPillTimer: number | undefined;

  constructor(container: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "popover-backdrop";
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.hide();
    });

    this.el = document.createElement("div");
    this.el.className = "build-popover";
    this.backdrop.appendChild(this.el);
    container.appendChild(this.backdrop);

    // STEP_PROMPT_liquid_glass_hud.md item 1.3: a tap that reaches
    // openTilePopover() but finds nothing buildable there currently just
    // returns, with zero on-screen response — appended directly to
    // `container`, deliberately outside `this.backdrop`, since a rejection
    // is a passive, auto-dismissing beat, not a modal — it must never
    // block a click the way the real popover's backdrop intentionally does.
    this.rejectionEl = document.createElement("div");
    this.rejectionEl.className = "rejection-toast";
    this.rejectionEl.hidden = true;
    container.appendChild(this.rejectionEl);

    // STEP_PROMPT_liquid_glass_hud.md item 2.5: the "diegetic build
    // confirmation" stat-delta pill — same non-modal, outside-the-backdrop
    // placement reasoning as `rejectionEl` above.
    this.confirmPillEl = document.createElement("div");
    this.confirmPillEl.className = "confirm-pill";
    this.confirmPillEl.hidden = true;
    container.appendChild(this.confirmPillEl);
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  /** True if `target` is this popover or one of its descendants — lets a caller tell an outside click from one on the popover itself. */
  contains(target: Node | null): boolean {
    return target !== null && this.el.contains(target);
  }

  /**
   * STEP_PROMPT_liquid_glass_hud.md items 2.2/2.3: chips fan out in a
   * 130deg arc at 108px radius, each a translucent glass card, entering
   * via a spring (genuine overshoot) curve staggered 70ms apart — ported
   * straight from the Khazan Interface Study artifact's own CSS values.
   */
  show(
    screenX: number,
    screenY: number,
    options: PopoverOption[],
    coin: number,
    onSelect: (id: string) => void
  ): void {
    this.el.innerHTML = "";
    this.el.className = "build-popover radial";
    if (options.length === 0) {
      this.hide();
      return;
    }
    options.forEach((def, i) => {
      const btn = document.createElement("button");
      const affordable = coin >= def.buildCost;
      btn.className = "build-option" + (affordable ? "" : " disabled");
      const label = def.kindLabel ? `${def.name} <em>${def.kindLabel}</em>` : def.name;
      btn.innerHTML = `<span>${label}</span><span class="cost">${def.buildCost}c</span>`;
      const { tx, ty } = radialOffset(i, options.length);
      btn.style.setProperty("--chip-tx", `${tx}px`);
      btn.style.setProperty("--chip-ty", `${ty}px`);
      btn.style.animationDelay = `${i * CHIP_STAGGER_MS}ms`;
      if (affordable) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelect(def.id);
          this.hide();
        });
      }
      this.el.appendChild(btn);
    });
    this.positionAndRevealRadial(screenX, screenY);
  }

  /**
   * Info card for a tile that already has an element built on it (Section
   * 3's "one tile, one element" — the UI should never offer a second build
   * menu there). Shows what's built and its effects, plus — STEP_PROMPT_
   * manual_only_mode.md Part C — a "Remove" button, the natural counterpart
   * to building it. Dismissed the same way the build menu is (or by
   * `onRemove` itself, which the caller wires to close this popover too).
   * A single flowing card, not a radial fan — there's only ever one thing
   * to show here, and "single-option case just centers above" (2.2) is
   * effectively what this already does.
   */
  showInfo(screenX: number, screenY: number, info: BuiltElementInfo): void {
    this.el.innerHTML = "";
    this.el.className = "build-popover card";
    const header = document.createElement("div");
    header.className = "build-option built-info-header";
    const label = info.kindLabel ? `${info.name} <em>${info.kindLabel}</em>` : info.name;
    header.innerHTML = `<span>${label}</span>`;
    this.el.appendChild(header);

    const effectEntries = Object.entries(info.effects);
    if (effectEntries.length > 0) {
      const effectsRow = document.createElement("div");
      effectsRow.className = "built-info-effects";
      effectsRow.textContent = effectEntries.map(([key, delta]) => `${key} ${delta > 0 ? "+" : ""}${delta}`).join("  ·  ");
      this.el.appendChild(effectsRow);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "built-info-remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      info.onRemove();
    });
    this.el.appendChild(removeBtn);

    this.positionAndReveal(screenX, screenY);
  }

  /**
   * Positions the popover at (screenX, screenY), then clamps within the
   * viewport — near a map edge the anchor point can otherwise push it
   * partly or fully off-screen. Revealing the backdrop and the measurement
   * both happen before the browser's next paint, so there's no visible
   * flash at the wrong position. Used by `showInfo()`'s single flowing
   * card, whose real rendered size this rect-based clamp can measure.
   */
  private positionAndReveal(screenX: number, screenY: number): void {
    this.el.style.left = `${screenX}px`;
    this.el.style.top = `${screenY}px`;
    this.backdrop.hidden = false;

    const rect = this.el.getBoundingClientRect();
    let left = screenX;
    let top = screenY;
    const halfWidth = rect.width / 2;
    if (rect.left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN + halfWidth;
    if (rect.right > window.innerWidth - VIEWPORT_MARGIN) left = window.innerWidth - VIEWPORT_MARGIN - halfWidth;
    if (rect.top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN + rect.height;
    if (rect.bottom > window.innerHeight - VIEWPORT_MARGIN) top = window.innerHeight - VIEWPORT_MARGIN;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  /**
   * `show()`'s radial fan has no single content rect to measure — `.el`
   * itself is a zero-size anchor point, chips are individually absolutely
   * positioned around it — so this clamps the anchor point directly,
   * using the fan's own known footprint (radius + a chip's rough
   * half-width) instead of a post-render `getBoundingClientRect()` read.
   */
  private positionAndRevealRadial(screenX: number, screenY: number): void {
    const left = Math.min(Math.max(screenX, RADIAL_CLAMP_MARGIN_PX), window.innerWidth - RADIAL_CLAMP_MARGIN_PX);
    const top = Math.min(Math.max(screenY, RADIAL_CLAMP_MARGIN_PX), window.innerHeight - RADIAL_CLAMP_MARGIN_PX);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.backdrop.hidden = false;
  }

  hide(): void {
    this.backdrop.hidden = true;
  }

  /**
   * A brief, non-blocking "nothing happened, here's why" beat for a tap
   * that lands on a real tile with nothing buildable on it — so a tap
   * always produces some visible response, never silence. Grow-in, hold,
   * fade — same shape `STEP_PROMPT_creature_reactions.md` already
   * validated for the world noticing a tap, applied here to a rejection
   * instead of a creature. Re-triggering while already showing (a rapid
   * double-tap on the same dead tile) restarts the animation rather than
   * queuing a second toast — there's only ever one of these on screen.
   */
  showRejection(screenX: number, screenY: number, message: string): void {
    window.clearTimeout(this.rejectionTimer);
    this.rejectionEl.textContent = message;
    this.rejectionEl.style.left = `${screenX}px`;
    this.rejectionEl.style.top = `${screenY}px`;
    this.rejectionEl.hidden = false;
    this.rejectionEl.classList.remove("showing");
    void this.rejectionEl.offsetWidth; // force reflow so re-adding the class below restarts the CSS animation
    this.rejectionEl.classList.add("showing");
    this.rejectionTimer = window.setTimeout(() => {
      this.rejectionEl.hidden = true;
    }, 1200);
  }

  /**
   * STEP_PROMPT_liquid_glass_hud.md item 2.5: shows the just-built
   * element's real stat deltas in words (e.g. "biodiversity +3 · food
   * +1") — grows in, holds legibly for roughly a third of a second, then
   * fades. Same restart-safe pattern as `showRejection()` above.
   */
  showConfirmPill(screenX: number, screenY: number, text: string): void {
    window.clearTimeout(this.confirmPillTimer);
    this.confirmPillEl.textContent = text;
    this.confirmPillEl.style.left = `${screenX}px`;
    this.confirmPillEl.style.top = `${screenY}px`;
    this.confirmPillEl.hidden = false;
    this.confirmPillEl.classList.remove("showing");
    void this.confirmPillEl.offsetWidth; // force reflow so re-adding the class below restarts the CSS animation
    this.confirmPillEl.classList.add("showing");
    this.confirmPillTimer = window.setTimeout(() => {
      this.confirmPillEl.hidden = true;
    }, 1300);
  }
}
