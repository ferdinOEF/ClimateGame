/**
 * Pins on the map (Section 12): every place an open objective names (Kala
 * Academy, Sharada Mandir School, the Ourem creek, Taleigao...), with its
 * name, for as long as that objective is open; and the short "Area
 * protected" note where the area's outline faded away. DOM over the canvas,
 * re-projected every frame like the place labels; no pointer events, so the
 * board under them stays clickable.
 */
export interface MapPin {
  name: string;
  /** World x/y/z of the spot. */
  x: number;
  y: number;
  z: number;
}

type Project = (x: number, y: number, z: number) => { x: number; y: number } | null;
type WorldPoint = { x: number; y: number; z: number };
/** What a pin's name keeps clear of besides its own tile: the storm arrows' heads (tip and back edge), in world space. */
type Avoid = () => readonly { tip: WorldPoint; back: WorldPoint }[];
type Rect = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export class MapPins {
  private readonly layer: HTMLElement;
  private pins: { pin: MapPin; el: HTMLElement; size?: { w: number; h: number; d: number } }[] = [];
  private note: { pin: MapPin; el: HTMLElement; until: number } | null = null;

  constructor(container: HTMLElement, private readonly project: Project, private readonly avoid: Avoid = () => []) {
    this.layer = document.createElement("div");
    this.layer.className = "map-pins";
    this.layer.setAttribute("aria-hidden", "true");
    container.appendChild(this.layer);
  }

  /** The pins to show (an empty list clears them). Same names in the same order keep their elements. */
  setPins(pins: MapPin[]): void {
    const same = pins.length === this.pins.length && pins.every((p, i) => p.name === this.pins[i].pin.name && p.x === this.pins[i].pin.x && p.z === this.pins[i].pin.z);
    if (same) return;
    for (const { el } of this.pins) el.remove();
    this.pins = pins.map((pin) => {
      const el = document.createElement("div");
      el.className = "map-pin";
      el.innerHTML = `<span class="map-pin-dot"></span><span class="map-pin-name"></span>`;
      (el.querySelector(".map-pin-name") as HTMLElement).textContent = pin.name;
      this.layer.appendChild(el);
      return { pin, el };
    });
  }

  /** A short note at a spot for `ms` (the area protected); `beside` sets a longer one to the right of its tile (Section 16 B6). */
  say(text: string, at: MapPin, ms = 3200, beside = false): void {
    this.note?.el.remove();
    const el = document.createElement("div");
    el.className = beside ? "map-note beside" : "map-note";
    if (beside) {
      // Read out once: it is the build's own feedback. A live region is announced when its text changes, so the
      // text goes in after the (empty) element is on the page.
      el.setAttribute("role", "status");
      window.setTimeout(() => (el.textContent = text), 50);
    } else el.textContent = text;
    this.layer.appendChild(el);
    this.note = { pin: at, el, until: performance.now() + ms };
  }

  /** The pins' sizes are read again on the next frame (their padding changed: zoomed out or back in). */
  remeasure(): void {
    for (const entry of this.pins) entry.size = undefined;
  }

  /** Shown at all (hidden during storms and result cards). */
  setVisible(visible: boolean): void {
    this.layer.hidden = !visible;
  }

  /** Re-projects every pin; call each frame. */
  update(nowMs: number): void {
    if (this.layer.hidden) return;
    const heads = this.pins.length ? this.avoid().map((h) => ({ tip: this.project(h.tip.x, h.tip.y, h.tip.z), back: this.project(h.back.x, h.back.y, h.back.z) })) : [];
    // Each arrowhead as a box round its tip and back edge, a little wider than drawn.
    const headBoxes: Rect[] = heads.flatMap(({ tip, back }) => {
      if (!tip || !back) return [];
      const r = Math.max(10, Math.hypot(tip.x - back.x, tip.y - back.y) * 0.8);
      return [{ x0: Math.min(tip.x, back.x) - r, y0: Math.min(tip.y, back.y) - r, x1: Math.max(tip.x, back.x) + r, y1: Math.max(tip.y, back.y) + r }];
    });
    // Sizes are read once a pin is laid out (its text never changes), so a frame writes transforms only, no reflow.
    for (const entry of this.pins) {
      if (entry.size) continue;
      const name = entry.el.querySelector<HTMLElement>(".map-pin-name");
      const dot = entry.el.querySelector<HTMLElement>(".map-pin-dot");
      if (name && dot && name.offsetWidth > 0) entry.size = { w: name.offsetWidth, h: name.offsetHeight, d: dot.offsetHeight };
    }
    const width = this.layer.clientWidth;
    // Section 34b.7: a pin's name that would sit on one placed before it (an earlier, more important row's) is hidden
    // for this frame, as the landmark labels are ("The Mandovi Riverfront", then named the Mandovi waterfront, lay over "Taleigao").
    const taken: Rect[] = [];
    for (const entry of this.pins) {
      const at = this.project(entry.pin.x, entry.pin.y, entry.pin.z);
      place(entry.el, at);
      if (at && entry.size) this.nudge(entry.el, entry.pin, entry.size, at, headBoxes, width);
      if (!at || !entry.size) continue;
      const name = entry.el.querySelector<HTMLElement>(".map-pin-name");
      const shift = /translate\((-?\d+)px, (-?\d+)px\)/.exec(name?.style.transform ?? "");
      const cx = at.x + (shift ? Number(shift[1]) : 0);
      const cy = at.y - entry.size.d / 2 - 2 - entry.size.h / 2 + (shift ? Number(shift[2]) : 0);
      const box: Rect = { x0: cx - entry.size.w / 2, y0: cy - entry.size.h / 2, x1: cx + entry.size.w / 2, y1: cy + entry.size.h / 2 };
      const hidden = taken.some((other) => overlaps(box, other));
      entry.el.style.visibility = hidden ? "hidden" : "";
      if (!hidden) taken.push(box);
    }
    if (this.note) {
      if (nowMs > this.note.until) {
        this.note.el.remove();
        this.note = null;
      } else {
        const at = this.project(this.note.pin.x, this.note.pin.y, this.note.pin.z);
        place(this.note.el, at);
        // A note beside its tile stays on screen: to the tile's left near the right edge, clear of the top and bottom.
        if (at && this.note.el.classList.contains("beside")) {
          const layer = this.layer.getBoundingClientRect();
          const { width, height } = layer;
          const w = this.note.el.offsetWidth;
          // Section 34b.1: a tile under the HUD card gets its note on the card's bottom edge, at the tile's x.
          const card = this.layer.ownerDocument.querySelector(".panjim-clock")?.getBoundingClientRect();
          const under = !!card && card.width > 0 && at.x >= card.left - layer.left && at.x <= card.right - layer.left && at.y >= card.top - layer.top && at.y <= card.bottom - layer.top;
          if (under && card) {
            // Where its box goes; the transform leaves out the CSS margins (34 px left, -24 px top) that set it beside a tile.
            const x = Math.max(8, Math.min(width - w - 8, at.x - w / 2));
            const y = Math.min(height - this.note.el.offsetHeight - 8, card.bottom - layer.top + 8);
            this.note.el.style.transform = `translate(${Math.round(x - 34)}px, ${Math.round(y + 24)}px)`;
          } else {
            const y = Math.max(90, Math.min(height - this.note.el.offsetHeight - 40, at.y));
            // Section 34c.2: with the card top right, a note to the right of a tile just left of the card would run
            // under it: to the tile's left then, as at the window's right edge.
            const h = this.note.el.offsetHeight;
            const intoCard = !!card && card.width > 0 && at.x + 34 < card.right - layer.left && at.x + 34 + w > card.left - layer.left && y - 24 < card.bottom - layer.top && y - 24 + h > card.top - layer.top;
            const flip = at.x + 34 + w > width - 8 || intoCard;
            this.note.el.style.transform = `translate(${Math.round(flip ? at.x - 68 - w : at.x)}px, ${Math.round(y)}px)`;
          }
        }
      }
    }
  }

  /**
   * Section 22.2 (owner decision): a pin's name never covers the tile its pin marks or a storm arrow's tip. Above
   * the dot by default; when that would cover either, beside the tile (right, else left), level with the dot.
   */
  private nudge(el: HTMLElement, pin: MapPin, size: { w: number; h: number; d: number }, at: { x: number; y: number }, heads: readonly Rect[], viewportWidth: number): void {
    const name = el.querySelector<HTMLElement>(".map-pin-name");
    if (!name) return;
    const { w, h, d } = size;
    const gap = 2;
    // Its tile on screen: the box round the hex's six corners (radius 1, the board's hex size).
    let tile: Rect = { x0: at.x, y0: at.y, x1: at.x, y1: at.y };
    for (let k = 0; k < 6; k++) {
      const angle = (Math.PI / 3) * k + Math.PI / 6;
      const c = this.project(pin.x + Math.cos(angle) * 0.92, pin.y, pin.z + Math.sin(angle) * 0.92);
      if (c) tile = { x0: Math.min(tile.x0, c.x), y0: Math.min(tile.y0, c.y), x1: Math.max(tile.x1, c.x), y1: Math.max(tile.y1, c.y) };
    }
    const above: Rect = { x0: at.x - w / 2, y0: at.y - d / 2 - gap - h, x1: at.x + w / 2, y1: at.y - d / 2 - gap };
    const clear = (r: Rect): boolean => !overlaps(r, tile) && heads.every((b) => !overlaps(r, b));
    let dx = 0;
    let dy = 0;
    if (!clear(above)) {
      const level = h / 2 + gap + d / 2;
      const right: Rect = { x0: tile.x1 + 4, y0: at.y - h / 2, x1: tile.x1 + 4 + w, y1: at.y + h / 2 };
      const left: Rect = { x0: tile.x0 - 4 - w, y0: at.y - h / 2, x1: tile.x0 - 4, y1: at.y + h / 2 };
      // Right unless that covers an arrow or leaves the window while the left side is clear of both.
      const rightBad = heads.some((b) => overlaps(right, b)) || right.x1 > viewportWidth - 4;
      const leftBad = heads.some((b) => overlaps(left, b)) || left.x0 < 4;
      const side = rightBad && !leftBad ? left : right;
      dx = side.x0 - above.x0;
      dy = level;
    }
    name.style.transform = dx === 0 && dy === 0 ? "" : `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
  }

  dispose(): void {
    this.layer.remove();
  }
}

function place(el: HTMLElement, at: { x: number; y: number } | null): void {
  if (!at) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";
  el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
}
