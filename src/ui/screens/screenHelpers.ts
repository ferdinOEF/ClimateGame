/**
 * Small DOM helpers shared by the shell screens.
 *
 * Deliberately not a framework. The game itself is imperative Three.js
 * with hand-built HUD elements, and adding React purely for four menu
 * screens would mean a second rendering model, a second mental model and a
 * large dependency, in exchange for very little. These few helpers cover
 * what the screens actually need.
 *
 * `text()` and `attr` set properties rather than interpolating strings,
 * which is what keeps player-supplied content (display names from the
 * leaderboard, most importantly) out of the HTML parser. Nothing in this
 * file ever concatenates untrusted text into innerHTML.
 */

type Child = Node | string | null | undefined | false;

export interface ElementSpec {
  className?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
  children?: Child[];
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  spec: ElementSpec = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (spec.className) node.className = spec.className;
  // `text` is the safe default and what nearly every call site uses.
  // `html` exists for the handful of places assembling a static, literal
  // fragment of markup — never for anything a player can influence.
  if (spec.text !== undefined) node.textContent = spec.text;
  if (spec.html !== undefined) node.innerHTML = spec.html;
  for (const [name, value] of Object.entries(spec.attrs ?? {})) node.setAttribute(name, value);
  for (const [event, handler] of Object.entries(spec.on ?? {})) {
    if (handler) node.addEventListener(event, handler as EventListener);
  }
  for (const child of spec.children ?? []) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** A row of filled/empty stars. Uses characters rather than images so it costs nothing to load and scales with the font. */
export function starRow(stars: number, max = 3): HTMLElement {
  const wrap = el("span", { className: "star-row", attrs: { "aria-label": `${stars} of ${max} stars` } });
  for (let i = 0; i < max; i++) {
    wrap.appendChild(
      el("span", {
        className: i < stars ? "star filled" : "star",
        text: i < stars ? "★" : "☆",
        attrs: { "aria-hidden": "true" }
      })
    );
  }
  return wrap;
}

/** Thousands-separated integer, for scores. */
export function formatScore(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Removes every child of a node. Screens are torn down and rebuilt wholesale rather than diffed. */
export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
