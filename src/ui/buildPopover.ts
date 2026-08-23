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
 * correctly but never changed what was on screen. That CSS gap (now fixed
 * with an explicit `.build-popover[hidden] { display: none }` rule) was
 * the actual root cause of A1's whole "doesn't dismiss" symptom family —
 * the JS-side open/closed state was correct the entire time.
 */
export class BuildPopover {
  private backdrop: HTMLElement;
  private el: HTMLElement;

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
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  /** True if `target` is this popover or one of its descendants — lets a caller tell an outside click from one on the popover itself. */
  contains(target: Node | null): boolean {
    return target !== null && this.el.contains(target);
  }

  show(
    screenX: number,
    screenY: number,
    options: PopoverOption[],
    coin: number,
    onSelect: (id: string) => void
  ): void {
    this.el.innerHTML = "";
    if (options.length === 0) {
      this.hide();
      return;
    }
    for (const def of options) {
      const btn = document.createElement("button");
      const affordable = coin >= def.buildCost;
      btn.className = "build-option" + (affordable ? "" : " disabled");
      const label = def.kindLabel ? `${def.name} <em>${def.kindLabel}</em>` : def.name;
      btn.innerHTML = `<span>${label}</span><span class="cost">${def.buildCost}c</span>`;
      if (affordable) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelect(def.id);
          this.hide();
        });
      }
      this.el.appendChild(btn);
    }
    this.positionAndReveal(screenX, screenY);
  }

  /**
   * Info card for a tile that already has an element built on it (Section
   * 3's "one tile, one element" — the UI should never offer a second build
   * menu there). Shows what's built and its effects, plus — STEP_PROMPT_
   * manual_only_mode.md Part C — a "Remove" button, the natural counterpart
   * to building it. Dismissed the same way the build menu is (or by
   * `onRemove` itself, which the caller wires to close this popover too).
   */
  showInfo(screenX: number, screenY: number, info: BuiltElementInfo): void {
    this.el.innerHTML = "";
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
   * flash at the wrong position.
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

  hide(): void {
    this.backdrop.hidden = true;
  }
}
