/**
 * The Panjim HUD, kept almost out of the way: two panels, each collapsed to
 * one small plain button until it is wanted.
 *
 *   Status   (top-left)   the instrument cluster (Coin, income, Resilience,
 *                         Biodiversity, Carbon, Food, Population), the coin
 *                         jar and the Field Guide button.
 *   Settings (top-right)  Show risk (R), Maya (M), Sound (S) and its volume,
 *                         Calm motion, Quality.
 *
 * A panel is one container with one open/closed state. Its contents are moved
 * into it, never rewritten: every element, id, class, handler and keyboard
 * shortcut is the one it was, so R, M and S work with a panel shut. Every load
 * starts shut and nothing is remembered.
 *
 * The shut button shows no number and no label. The one exception is the
 * Status button's danger mark: a small diamond with a ring (so it is not only
 * a colour) while a storm warning is up, or Resilience has fallen and the
 * panel has not been opened since. Danger is never hidden by the panel.
 * Pure DOM; no game state in here.
 */
export type PanelId = "status" | "settings";

const GLYPHS: Record<PanelId, string> = {
  // A 2x2 grid of dots, and three short lines: neutral, they explain nothing.
  status: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="2.1"/><circle cx="14" cy="6" r="2.1"/><circle cx="6" cy="14" r="2.1"/><circle cx="14" cy="14" r="2.1"/></svg>',
  settings: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 5.5h10M5 10h10M5 14.5h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};

const LABELS: Record<PanelId, string> = { status: "Status", settings: "Settings" };

export class HudPanel {
  readonly el: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly body: HTMLElement;
  private readonly dot: HTMLElement | null;
  /** Called when the panel opens (the Status panel counts a fall in Resilience as seen). */
  onOpen: (() => void) | null = null;
  private readonly onToggle: (panel: HudPanel, open: boolean) => void;

  constructor(
    container: HTMLElement,
    readonly id: PanelId,
    onToggle: (panel: HudPanel, open: boolean) => void
  ) {
    this.onToggle = onToggle;
    this.el = document.createElement("div");
    this.el.className = `hud-panel hud-panel-${id}`;
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "hud-panel-button";
    this.button.setAttribute("aria-label", LABELS[id]);
    this.button.setAttribute("aria-expanded", "false");
    this.button.setAttribute("aria-controls", `hud-panel-body-${id}`);
    // The tooltip is the same word, shown on hover and keyboard focus only (hud.css).
    this.button.dataset.label = LABELS[id];
    this.button.innerHTML = GLYPHS[id];
    this.body = document.createElement("div");
    this.body.className = "hud-panel-body";
    this.body.id = `hud-panel-body-${id}`;
    this.body.setAttribute("role", "group");
    this.body.setAttribute("aria-label", LABELS[id]);
    this.body.hidden = true;
    this.el.append(this.button, this.body);
    if (id === "status") {
      this.dot = document.createElement("span");
      this.dot.className = "hud-panel-danger";
      this.dot.hidden = true;
      this.button.appendChild(this.dot);
    } else {
      this.dot = null;
    }
    this.button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggle();
    });
    // The map and the other controls must not feel a click that was meant for a panel.
    this.el.addEventListener("pointerdown", (event) => event.stopPropagation());
    container.appendChild(this.el);
  }

  get isOpen(): boolean {
    return !this.body.hidden;
  }

  /** Moves existing elements into the panel (their handlers and ids go with them). */
  adopt(...elements: (HTMLElement | null | undefined)[]): void {
    for (const el of elements) if (el) this.body.appendChild(el);
  }

  open(): void {
    if (this.isOpen) return;
    this.body.hidden = false;
    this.el.classList.add("open");
    this.button.setAttribute("aria-expanded", "true");
    this.onOpen?.();
    this.onToggle(this, true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.body.hidden = true;
    this.el.classList.remove("open");
    this.button.setAttribute("aria-expanded", "false");
    this.onToggle(this, false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** The danger mark on the Status button (no number, and a shape and a ring as well as a colour). */
  setDanger(on: boolean): void {
    if (!this.dot || this.dot.hidden === !on) return;
    this.dot.hidden = !on;
    this.button.setAttribute("aria-label", on ? `${LABELS[this.id]}: danger` : LABELS[this.id]);
    this.el.classList.toggle("danger", on);
  }

  /** A brief floating "+N" beside the button, for the coin jar's gain while the panel is shut. */
  floatText(text: string): void {
    if (this.isOpen) return;
    const pop = document.createElement("span");
    pop.className = "hud-panel-pop";
    pop.textContent = text;
    pop.setAttribute("aria-hidden", "true");
    this.el.appendChild(pop);
    window.setTimeout(() => pop.remove(), 1400);
  }

  dispose(): void {
    this.el.remove();
  }
}

/**
 * The two panels, with the rules between them: one open at a time, Esc closes
 * the open one (and gives focus back to its button), and a press anywhere
 * outside an open panel (the map, say) closes it.
 */
export class HudPanels {
  readonly status: HudPanel;
  readonly settings: HudPanel;
  private readonly abort = new AbortController();

  constructor(container: HTMLElement) {
    const onToggle = (panel: HudPanel, open: boolean): void => {
      if (open) for (const other of [this.status, this.settings]) if (other !== panel) other.close();
    };
    this.status = new HudPanel(container, "status", onToggle);
    this.settings = new HudPanel(container, "settings", onToggle);
    document.addEventListener(
      "pointerdown",
      (event) => {
        const target = event.target as Node | null;
        for (const panel of [this.status, this.settings]) if (panel.isOpen && !(target && panel.el.contains(target))) panel.close();
      },
      { capture: true, signal: this.abort.signal }
    );
    window.addEventListener(
      "keydown",
      (event) => {
        // Another panel's Esc (the leave prompt, Sources) has priority: it marks the event handled.
        if (event.key !== "Escape" || event.defaultPrevented) return;
        const open = [this.status, this.settings].find((panel) => panel.isOpen);
        if (!open) return;
        event.stopPropagation();
        event.preventDefault();
        open.close();
        open.button.focus({ preventScroll: true });
      },
      { capture: true, signal: this.abort.signal }
    );
  }

  get anyOpen(): boolean {
    return this.status.isOpen || this.settings.isOpen;
  }

  dispose(): void {
    this.abort.abort();
    this.status.dispose();
    this.settings.dispose();
  }
}
