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

export class MapPins {
  private readonly layer: HTMLElement;
  private pins: { pin: MapPin; el: HTMLElement }[] = [];
  private note: { pin: MapPin; el: HTMLElement; until: number } | null = null;

  constructor(container: HTMLElement, private readonly project: Project) {
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

  /** Shown at all (hidden during storms and result cards). */
  setVisible(visible: boolean): void {
    this.layer.hidden = !visible;
  }

  /** Re-projects every pin; call each frame. */
  update(nowMs: number): void {
    if (this.layer.hidden) return;
    for (const { pin, el } of this.pins) place(el, this.project(pin.x, pin.y, pin.z));
    if (this.note) {
      if (nowMs > this.note.until) {
        this.note.el.remove();
        this.note = null;
      } else {
        const at = this.project(this.note.pin.x, this.note.pin.y, this.note.pin.z);
        place(this.note.el, at);
        // A note beside its tile stays on screen: to the tile's left near the right edge, clear of the top and bottom.
        if (at && this.note.el.classList.contains("beside")) {
          const { width, height } = this.layer.getBoundingClientRect();
          const w = this.note.el.offsetWidth;
          const flip = at.x + 34 + w > width - 8;
          const y = Math.max(90, Math.min(height - this.note.el.offsetHeight - 40, at.y));
          this.note.el.style.transform = `translate(${Math.round(flip ? at.x - 68 - w : at.x)}px, ${Math.round(y)}px)`;
        }
      }
    }
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
