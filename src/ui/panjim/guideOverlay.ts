import type { GuideStep } from "@core/guide";

/**
 * Section 39.4: what the guided start draws over the board (mocks 3 to 7). Never takes a click: the guide is soft.
 *   - the dim (#10201c at 50%), with a soft circle cut round the glowing tile; the HUD card and Maya sit above it
 *   - a double ring round the tile, and an orange "Click here" tag left of it with a small arrow
 *   - with the build menu open, a gold ring on the card to pick and an orange "Pick Dune" tag left of the card
 *   - at step 2, a small "✓ Dune" chip on the built dune
 * Everything is placed from screen positions the session projects every frame, so it follows the camera.
 */
export interface GuideView {
  step: GuideStep;
  /** The glowing tile's centre and radius on screen, in container pixels; null when off screen or at step 3. */
  tile: { x: number; y: number; r: number } | null;
  /** The card to pick, in container pixels, while its menu is open. */
  card: { x: number; y: number; w: number; h: number } | null;
  /** The built first tile's centre (step 2 and 2b). */
  chip: { x: number; y: number } | null;
  clickLabel: string;
  pickLabel: string;
  chipLabel: string;
}

export class GuideOverlay {
  readonly el: HTMLElement;
  private readonly dim: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly clickTag: HTMLElement;
  private readonly pickTag: HTMLElement;
  private readonly chip: HTMLElement;
  private last = "";

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "guide-layer";
    this.el.setAttribute("aria-hidden", "true");
    this.el.innerHTML = `
      <div class="guide-dim"></div>
      <div class="guide-ring"></div>
      <div class="guide-tag guide-click-tag"></div>
      <div class="guide-tag guide-pick-tag"></div>
      <div class="guide-chip"></div>`;
    this.dim = this.el.querySelector(".guide-dim")!;
    this.ring = this.el.querySelector(".guide-ring")!;
    this.clickTag = this.el.querySelector(".guide-click-tag")!;
    this.pickTag = this.el.querySelector(".guide-pick-tag")!;
    this.chip = this.el.querySelector(".guide-chip")!;
    container.appendChild(this.el);
  }

  /** Places everything for `view`; writes to the page only when something moved. */
  render(view: GuideView): void {
    const round = (n: number): number => Math.round(n);
    const key = JSON.stringify([view.step, view.tile && [round(view.tile.x), round(view.tile.y), round(view.tile.r)], view.card && [round(view.card.x), round(view.card.y), round(view.card.w), round(view.card.h)], view.chip && [round(view.chip.x), round(view.chip.y)]]);
    if (key === this.last) return;
    this.last = key;
    const dimmed = view.step === "1" || view.step === "1b" || view.step === "2" || view.step === "2b";
    const menuOpen = view.step === "1b" || view.step === "2b";
    this.dim.hidden = !dimmed;
    const tile = dimmed ? view.tile : null;
    if (tile) {
      this.dim.style.setProperty("--guide-x", `${round(tile.x)}px`);
      this.dim.style.setProperty("--guide-y", `${round(tile.y)}px`);
      this.dim.style.setProperty("--guide-r", `${round(tile.r * 2.4)}px`);
    }
    this.dim.classList.toggle("no-hole", !tile);
    this.ring.hidden = !tile;
    this.clickTag.hidden = !tile || menuOpen;
    if (tile) {
      const d = round(tile.r * 2.3);
      Object.assign(this.ring.style, { left: `${round(tile.x - d / 2)}px`, top: `${round(tile.y - d / 2)}px`, width: `${d}px`, height: `${d}px` });
      this.clickTag.textContent = view.clickLabel;
      // Left of the ring, its arrow pointing at the tile.
      this.clickTag.style.left = `${round(tile.x - d / 2 - 14)}px`;
      this.clickTag.style.top = `${round(tile.y)}px`;
    }
    const card = menuOpen ? view.card : null;
    this.pickTag.hidden = !card;
    if (card) {
      this.pickTag.textContent = view.pickLabel;
      this.pickTag.style.left = `${round(card.x - 12)}px`;
      this.pickTag.style.top = `${round(card.y + card.h / 2)}px`;
    }
    const chip = view.step === "2" || view.step === "2b" ? view.chip : null;
    this.chip.hidden = !chip;
    if (chip) {
      this.chip.textContent = view.chipLabel;
      this.chip.style.left = `${round(chip.x)}px`;
      this.chip.style.top = `${round(chip.y)}px`;
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
