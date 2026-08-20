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
}

const VIEWPORT_MARGIN = 8;

/**
 * The contextual build menu: a small popover anchored to the clicked tile's
 * screen position — never a persistent sidebar. Section 3's non-negotiable
 * rule: build choices appear at the tile, in place, and disappear when done.
 *
 * Dismissal is handled entirely by the caller (main.ts's unified canvas
 * click handler checks `isOpen` first and, if true, closes and consumes
 * that click rather than also acting on it; a separate document-level
 * listener handles clicks that land outside the canvas entirely — on the
 * HUD, say — plus Escape). An earlier version dismissed itself
 * via its own outside-click listener running *before* the canvas's own
 * click handler in the capture phase — a single click meant to dismiss
 * could land on a different buildable tile, closing the old popover and
 * silently opening a new one in a nearby position on the same click,
 * making a second dismiss-click land on a build-option button instead
 * (NEXT_STEPS.md). No listeners of its own now — one source of truth.
 */
export class BuildPopover {
  private el: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "build-popover";
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
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
   * Read-only info card for a tile that already has an element built on it
   * (Section 3's "one tile, one element" — the UI should never offer a
   * second build menu there). Shows what's built and its effects; no
   * buttons, dismissed the same way the build menu is.
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
    this.positionAndReveal(screenX, screenY);
  }

  /**
   * Positions the popover at (screenX, screenY), then clamps within the
   * viewport — near a map edge the anchor point can otherwise push it
   * partly or fully off-screen. `hidden = false` and the measurement both
   * happen before the browser's next paint, so there's no visible flash at
   * the wrong position.
   */
  private positionAndReveal(screenX: number, screenY: number): void {
    this.el.style.left = `${screenX}px`;
    this.el.style.top = `${screenY}px`;
    this.el.hidden = false;

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
    this.el.hidden = true;
  }
}
