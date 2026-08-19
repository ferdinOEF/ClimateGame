import type { BuildingDef } from "@core/buildings";

/**
 * The contextual build menu: a small popover anchored to the clicked tile's
 * screen position — never a persistent sidebar. Section 3's non-negotiable
 * rule: build choices appear at the tile, in place, and disappear when done.
 */
export class BuildPopover {
  private el: HTMLElement;

  constructor(private container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "build-popover";
    this.el.hidden = true;
    container.appendChild(this.el);

    container.addEventListener(
      "click",
      (e) => {
        if (!this.el.hidden && !this.el.contains(e.target as Node)) this.hide();
      },
      { capture: true }
    );
  }

  show(
    screenX: number,
    screenY: number,
    options: BuildingDef[],
    coin: number,
    onSelect: (buildingId: string) => void
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
      btn.innerHTML = `<span>${def.name}</span><span class="cost">${def.buildCost}c</span>`;
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
