/**
 * Small on/off switches in the top-right, under the Houses counter: "Show
 * risk" (the warning heat) and Maya's voice. Each is a real button with
 * `aria-pressed`, has a keyboard shortcut, and remembers its state on this
 * device. Storage is wrapped in try/catch: a browser that refuses it simply
 * gets the default every time.
 */
export interface PrefToggleOptions {
  /** localStorage key. */
  storageKey: string;
  label: string;
  /** Single-letter shortcut shown on the button, e.g. "R". */
  shortcut: string;
  defaultOn: boolean;
  /** Extra class on the button. */
  className: string;
}

export function readPref(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Private mode or storage disabled: the choice lasts for this level.
  }
}

/** The shared row the toggles sit in, created once per container. */
export function togglesRow(container: HTMLElement): HTMLElement {
  let row = container.querySelector<HTMLElement>(".panjim-toggles");
  if (!row) {
    row = document.createElement("div");
    row.className = "panjim-toggles";
    container.appendChild(row);
  }
  return row;
}

export class PrefToggle {
  readonly el: HTMLButtonElement;
  private on: boolean;

  constructor(container: HTMLElement, private readonly options: PrefToggleOptions, private readonly onChange: (on: boolean) => void) {
    this.on = readPref(options.storageKey, options.defaultOn);
    this.el = document.createElement("button");
    this.el.type = "button";
    this.el.className = `panjim-toggle ${options.className}`;
    this.el.innerHTML = `<span class="toggle-dot" aria-hidden="true"></span><span class="toggle-label"></span><kbd></kbd>`;
    (this.el.querySelector(".toggle-label") as HTMLElement).textContent = options.label;
    (this.el.querySelector("kbd") as HTMLElement).textContent = options.shortcut;
    this.el.setAttribute("aria-keyshortcuts", options.shortcut);
    this.el.addEventListener("click", (event) => {
      event.stopPropagation();
      this.set(!this.on);
    });
    togglesRow(container).appendChild(this.el);
    this.paint();
  }

  get value(): boolean {
    return this.on;
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    writePref(this.options.storageKey, on);
    this.paint();
    this.onChange(on);
  }

  toggle(): void {
    this.set(!this.on);
  }

  private paint(): void {
    this.el.setAttribute("aria-pressed", String(this.on));
    this.el.classList.toggle("on", this.on);
  }

  dispose(): void {
    this.el.remove();
  }
}

/** True when a key press is meant for a text field rather than a shortcut. */
export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
