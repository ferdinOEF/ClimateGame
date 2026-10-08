import { CITED_FACTS, SHOWN_FACTS, displayText, fullReference } from "@core/facts";

/**
 * "Sources": every real-world fact the game shows, each with its full
 * citation and a link to the source, and a short list of the game rules
 * (which describe this game, not the world, and so need none).
 *
 * One overlay, opened from the menu's "Facts & sources" link and from the
 * "Source" button on a Discovery card (which scrolls to that fact). Esc,
 * the close button or a click on the backdrop closes it.
 */
let open: { backdrop: HTMLElement; previousFocus: Element | null; inerted: HTMLElement[] } | null = null;

export function isSourcesOpen(): boolean {
  return open !== null;
}

/**
 * One key listener for the life of the page, on `window` in the capture
 * phase and added when this module loads: before any level's own Esc
 * handlers (Maya's, the replay card's), so Esc closes this screen first and
 * the game's shortcuts never fire behind it. Idle when the screen is shut.
 */
function onKey(event: KeyboardEvent): void {
  if (!open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSources();
  } else if (event.key === "Tab") {
    // Keep focus inside the dialog (the page behind is inert as well).
    const stops = [...open.backdrop.querySelectorAll<HTMLElement>("button, a[href]")];
    if (stops.length > 0) {
      const first = stops[0];
      const last = stops[stops.length - 1];
      const inside = open.backdrop.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  event.stopImmediatePropagation();
}
if (typeof window !== "undefined") window.addEventListener("keydown", onKey, true);

export function closeSources(): void {
  if (!open) return;
  const { backdrop, previousFocus, inerted } = open;
  open = null;
  for (const el of inerted) el.inert = false;
  backdrop.remove();
  // Back to where the player was, if that is still on screen (a Discovery card may have closed).
  const back = previousFocus as HTMLElement | null;
  if (back && back.isConnected && back.getClientRects().length > 0) back.focus({ preventScroll: true });
}

/** Opens the Sources screen over whatever is showing; `factId` scrolls to and highlights that fact. */
export function openSources(factId?: string): HTMLElement {
  closeSources();
  const backdrop = document.createElement("div");
  backdrop.className = "sources-backdrop";
  const panel = document.createElement("div");
  panel.className = "sources-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "sources-title");

  const head = document.createElement("div");
  head.className = "sources-head";
  const title = document.createElement("h2");
  title.id = "sources-title";
  title.textContent = "Facts and sources";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "sources-close";
  close.setAttribute("aria-label", "Close sources");
  close.textContent = "×";
  close.addEventListener("click", () => closeSources());
  head.append(title, close);

  const intro = document.createElement("p");
  intro.className = "sources-intro";
  intro.textContent =
    "Every fact about the real world in this game, with where it comes from. Lines that start “In this game” describe the game's rules, not the world.";

  const list = document.createElement("ol");
  list.className = "sources-list";
  for (const fact of CITED_FACTS) {
    const citation = fact.citation!;
    const item = document.createElement("li");
    item.className = "sources-item";
    item.dataset.factId = fact.id;
    const text = document.createElement("p");
    text.className = "sources-fact";
    text.textContent = displayText(fact);
    const ref = document.createElement("p");
    ref.className = "sources-ref";
    ref.textContent = fullReference(citation);
    const note = document.createElement("p");
    note.className = "sources-note";
    note.textContent = citation.note;
    const link = document.createElement("a");
    link.className = "sources-link";
    link.href = citation.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = citation.url;
    item.append(text, ref, note, link);
    if (citation.landingUrl) {
      const landing = document.createElement("a");
      landing.className = "sources-link";
      landing.href = citation.landingUrl;
      landing.target = "_blank";
      landing.rel = "noopener noreferrer";
      landing.textContent = citation.landingUrl;
      item.append(landing);
    }
    list.appendChild(item);
  }

  const rulesHead = document.createElement("h3");
  rulesHead.className = "sources-subhead";
  rulesHead.textContent = "Game rules";
  const rules = document.createElement("ul");
  rules.className = "sources-rules";
  for (const fact of SHOWN_FACTS) {
    if (fact.kind !== "gameRule") continue;
    const item = document.createElement("li");
    item.dataset.factId = fact.id;
    item.textContent = fact.text;
    rules.appendChild(item);
  }

  const body = document.createElement("div");
  body.className = "sources-body";
  body.append(intro, list, rulesHead, rules);
  panel.append(head, body);
  backdrop.appendChild(panel);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeSources();
  });
  // Everything else on the page is out of reach (and out of the tab order) until it closes.
  const inerted = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.inert);
  for (const el of inerted) el.inert = true;
  open = { backdrop, previousFocus: document.activeElement, inerted };
  document.body.appendChild(backdrop);
  close.focus();
  if (factId) {
    const target = body.querySelector<HTMLElement>(`[data-fact-id="${CSS.escape(factId)}"]`);
    if (target) {
      target.classList.add("highlight");
      target.scrollIntoView({ block: "center" });
    }
  }
  return backdrop;
}
