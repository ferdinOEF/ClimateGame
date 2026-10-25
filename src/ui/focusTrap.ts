/**
 * Section 34 (a keyboard player's findings): a dialog takes focus when it opens and keeps Tab inside itself while it
 * is open, so Tab never wanders to the buttons behind it. The listener sits on the dialog itself (focus is inside it
 * while it is open), so it goes with the dialog's DOM and never outlives a session.
 */
export function trapFocus(root: HTMLElement, isOpen: () => boolean): void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || !isOpen()) return;
    const stops = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.getClientRects().length > 0 && !el.closest("[hidden]")
    );
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  root.addEventListener("keydown", onKey);
}
