import copy from "@data/tooltips.json";

/**
 * Hover tooltips for every HUD control: one plain sentence saying what
 * pressing or reading it does, with live values where they help.
 *
 * All the wording lives in src/data/tooltips.json, so it can be edited
 * without touching code. An element opts in with `attach(el, key, values)`:
 * the key picks the sentence and `values` fills its {placeholders} at the
 * moment it is shown, so a readiness tip always quotes the current numbers.
 *
 * Behaviour:
 *   - mouse: shows after 400 ms of hovering, hides on leave;
 *   - keyboard: shows on focus, hides on blur;
 *   - touch: shows on a press held for 500 ms, hides when the finger lifts;
 *   - Esc closes it;
 *   - placed below the element (above if there is no room, then beside),
 *     never over it, and always inside the viewport;
 *   - the element's `aria-describedby` points at the tooltip while shown.
 *
 * Elements carry `data-tip` with their key, which is also what the HUD
 * check (`missingTooltips`) looks for.
 */
type Values = () => Record<string, string | number>;

const COPY = copy as Record<string, unknown>;
const HOVER_DELAY_MS = 400;
const HOLD_DELAY_MS = 500;
const GAP = 8;
const MARGIN = 8;

/** Fills a template's {placeholders}. Unknown ones are left out rather than shown raw. */
export function tooltipText(key: string, values: Record<string, string | number> = {}): string {
  const template = COPY[key];
  if (typeof template !== "string") return "";
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (values[name] !== undefined ? String(values[name]) : ""));
}

/** The one-line description of an element in the build menu. */
export function buildWhat(elementId: string): string {
  const what = COPY.buildWhat as Record<string, string>;
  return what[elementId] ?? "";
}

let nextId = 0;

export class Tooltips {
  private readonly tip: HTMLElement;
  private readonly abort = new AbortController();
  private owner: HTMLElement | null = null;
  private timer = 0;
  private readonly bindings = new WeakMap<HTMLElement, { key: string | (() => string); values?: Values; side?: "right" }>();

  constructor(private readonly container: HTMLElement) {
    this.tip = document.createElement("div");
    this.tip.className = "hud-tooltip";
    this.tip.id = `hud-tooltip-${nextId++}`;
    this.tip.setAttribute("role", "tooltip");
    this.tip.hidden = true;
    container.appendChild(this.tip);
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && !this.tip.hidden) {
          this.hide();
          // A focused control's tooltip is closed by Esc, not the level.
          if (document.activeElement && this.bindings.has(document.activeElement as HTMLElement)) event.stopPropagation();
        }
      },
      { capture: true, signal: this.abort.signal }
    );
  }

  /**
   * Gives `el` a tooltip. `key` is a sentence in tooltips.json (or a
   * function returning finished text, for the build menu); `values` fills it
   * in when shown. Calling again on the same element replaces its binding.
   */
  attach(el: HTMLElement, key: string | (() => string), values?: Values, side?: "right"): void {
    const fresh = !this.bindings.has(el);
    this.bindings.set(el, { key, values, side });
    el.dataset.tip = typeof key === "string" ? key : "custom";
    // The native tooltip would show alongside this one.
    el.removeAttribute("title");
    if (!fresh) return;
    const signal = this.abort.signal;
    el.addEventListener(
      "pointerenter",
      (event) => {
        if (event.pointerType === "touch") return;
        this.schedule(el, HOVER_DELAY_MS);
      },
      { signal }
    );
    el.addEventListener("pointerleave", () => this.release(el), { signal });
    el.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "touch") this.schedule(el, HOLD_DELAY_MS);
        else this.release(el);
      },
      { signal }
    );
    el.addEventListener("pointerup", (event) => {
      if (event.pointerType === "touch") window.setTimeout(() => this.release(el), 1200);
    }, { signal });
    el.addEventListener("pointercancel", () => this.release(el), { signal });
    el.addEventListener("focus", () => this.show(el), { signal });
    el.addEventListener("blur", () => this.release(el), { signal });
  }

  private schedule(el: HTMLElement, delay: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.show(el), delay);
  }

  private release(el: HTMLElement): void {
    window.clearTimeout(this.timer);
    if (this.owner === el) this.hide();
  }

  /** Shows `el`'s tooltip now. */
  show(el: HTMLElement): void {
    const binding = this.bindings.get(el);
    if (!binding || !el.isConnected) return;
    const text = typeof binding.key === "function" ? binding.key() : tooltipText(binding.key, binding.values?.());
    if (!text) return;
    if (this.owner && this.owner !== el) this.owner.removeAttribute("aria-describedby");
    this.owner = el;
    this.tip.textContent = text;
    this.tip.hidden = false;
    el.setAttribute("aria-describedby", this.tip.id);
    this.place(el, binding.side);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.tip.hidden = true;
    this.owner?.removeAttribute("aria-describedby");
    this.owner = null;
  }

  get openFor(): HTMLElement | null {
    return this.tip.hidden ? null : this.owner;
  }

  /**
   * Below the element if it fits, else above, else beside; clamped inside the
   * viewport, never over the element. `side: "right"` (the build menu's
   * options) goes beside the element's group first, so the tip never covers
   * the neighbouring options.
   */
  private place(el: HTMLElement, side?: "right"): void {
    const box = this.container.getBoundingClientRect();
    const group = side ? (el.parentElement ?? el) : el;
    const target = side ? (() => {
      const own = el.getBoundingClientRect();
      const outer = group.getBoundingClientRect();
      return { left: outer.left, right: outer.right, top: own.top, bottom: own.bottom, width: outer.width, height: own.height };
    })() : el.getBoundingClientRect();
    this.tip.style.left = "0px";
    this.tip.style.top = "0px";
    this.tip.style.maxWidth = `${Math.min(340, window.innerWidth - 2 * MARGIN)}px`;
    const tip = this.tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centreX = target.left + target.width / 2 - tip.width / 2;
    const clampX = (x: number): number => Math.min(vw - MARGIN - tip.width, Math.max(MARGIN, x));
    const clampY = (y: number): number => Math.min(vh - MARGIN - tip.height, Math.max(MARGIN, y));
    let left: number;
    let top: number;
    if (side === "right" && target.right + GAP + tip.width <= vw - MARGIN) {
      left = target.right + GAP;
      top = clampY(target.top + target.height / 2 - tip.height / 2);
    } else if (side === "right" && target.left - GAP - tip.width >= MARGIN) {
      left = target.left - GAP - tip.width;
      top = clampY(target.top + target.height / 2 - tip.height / 2);
    } else if (target.bottom + GAP + tip.height <= vh - MARGIN) {
      left = clampX(centreX);
      top = target.bottom + GAP;
    } else if (target.top - GAP - tip.height >= MARGIN) {
      left = clampX(centreX);
      top = target.top - GAP - tip.height;
    } else if (target.right + GAP + tip.width <= vw - MARGIN) {
      left = target.right + GAP;
      top = clampY(target.top + target.height / 2 - tip.height / 2);
    } else {
      left = Math.max(MARGIN, target.left - GAP - tip.width);
      top = clampY(target.top + target.height / 2 - tip.height / 2);
    }
    this.tip.style.left = `${Math.round(left - box.left)}px`;
    this.tip.style.top = `${Math.round(top - box.top)}px`;
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.abort.abort();
    this.tip.remove();
  }
}

/**
 * The HUD controls that should carry a tooltip but do not: every button,
 * slider, checkbox and readout inside the HUD's own containers. Used by the
 * browser checks to prove the coverage claim rather than assert it.
 */
export const HUD_SELECTORS = [
  ".instrument-cluster .coin-row",
  ".instrument-cluster .income-row",
  ".instrument-cluster .resilience-gauge",
  ".instrument-cluster .meter-chip",
  ".instrument-cluster button:not([hidden])",
  ".hud-chrome button",
  ".panjim-clock .clock-face",
  ".panjim-clock button",
  ".panjim-clock .outlook-track",
  ".panjim-clock .outlook-line",
  ".panjim-clock .outlook-gauge:not([hidden])",
  ".panjim-clock .outlook-sea",
  ".coin-jar",
  ".field-guide-button",
  ".houses-counter",
  ".panjim-toggles button",
  ".maya-dismiss",
  ".get-ready",
  ".map-layer-control input",
  ".build-popover .build-option:not(.built-info-header)"
];

export function missingTooltips(root: ParentNode): string[] {
  const missing: string[] = [];
  for (const selector of HUD_SELECTORS) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      if (!el.dataset.tip) missing.push(`${selector} ${el.className || el.tagName}`.trim());
    }
  }
  return missing;
}
