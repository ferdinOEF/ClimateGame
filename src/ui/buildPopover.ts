export interface PopoverOption {
  id: string;
  name: string;
  buildCost: number;
  /** Shown as a small tag so a defense reads differently from a town building at a glance. */
  kindLabel?: string;
}

/**
 * The contextual build menu: a small popover anchored to the clicked tile's
 * screen position — never a persistent sidebar. Section 3's non-negotiable
 * rule: build choices appear at the tile, in place, and disappear when done.
 *
 * Dismissal is handled entirely by the caller (main.ts's unified click
 * handler checks `isOpen` first and, if true, closes and consumes that
 * click rather than also acting on it). An earlier version dismissed itself
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
    this.el.style.left = `${screenX}px`;
    this.el.style.top = `${screenY}px`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
