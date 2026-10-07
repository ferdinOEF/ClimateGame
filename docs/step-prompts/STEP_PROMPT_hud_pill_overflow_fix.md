# Khazan — Step Prompt: Fix HUD Status Pill Overflow

**How to use this document:** a one-bug hotfix on top of `STEP_PROMPT_mobile_responsive.md` Section 4 ("Status Pill"). Not a redesign — a single missing CSS rule.

## The bug

Reported live: on a normal desktop-width browser window, `.instrument-cluster` (top-left HUD card) renders extra, garbled content below the chip grid — a vertically-stacked coin/resilience/hazard readout ending in a lone `>`, spilling past where the card visually ends.

**Root cause, confirmed by reading `hud.css` directly:** `.cluster-pill`'s only `display: none` lives inside `@media (max-width: 820px), (pointer: coarse)` (around line 1052), paired there with `.instrument-cluster.collapsed .cluster-pill { display: flex; }`. The pill's *base* rule (`~line 444`, outside any media query) sets `align-items`, `gap`, `width`, `height`, etc., but never sets `display` at all. So on any viewport that doesn't match that media query — e.g. a normal desktop browser with a mouse and a window wider than 820px — `.cluster-pill` falls back to the browser's default `<button>` display (`inline-block`) and renders unconditionally, regardless of whether `.instrument-cluster` has `.collapsed` on it. Because `.cluster-pill` also has no `display: flex` of its own in that fallback state, its children (`.pill-item`, each of which sets its *own* `display: flex` and therefore blockifies itself as a standalone box) stack vertically instead of laying out as a single row — which is exactly the "coin / dot+resilience / wave+turns / chevron, each on its own line" appearance in the report.

In short: the pill was only ever told to hide itself *inside* the mobile breakpoint, never told to hide itself *by default*. Everywhere outside that breakpoint, it's been rendering, always, the whole time.

## The fix

In `hud.css`, add `display: none;` to `.cluster-pill`'s own base rule (the one around line 444 that already sets `align-items: center; gap: 6px; width: 100%; height: 34px; ...` — add the property there, don't create a second rule). Leave everything inside `@media (max-width: 820px), (pointer: coarse)` exactly as it is — `.cluster-pill { display: none; }` at line ~1052 becomes redundant with the new base rule and can either stay (harmless) or be deleted; `.instrument-cluster.collapsed .cluster-pill { display: flex; }` at line ~1056 still correctly overrides the now-global `display: none` whenever the cluster is actually collapsed, same as before.

Do not touch `.cluster-collapse-toggle` — its own base rule already correctly sets `display: none` outside the media query (confirmed while investigating this bug); only `.cluster-pill` was missing the equivalent.

## Verify

- At a normal desktop browser width (no touch, window wider than 820px): `.instrument-cluster` shows only its normal expanded content — coin row, income row, resilience gauge, hazard-incoming line, chip grid — nothing extra below the chip grid, no stray `>`.
- Resize the same window below 820px (or emulate a touch device): the chevron toggle appears in the header; tapping it collapses the cluster to the pill, which now actually renders as a single horizontal row (coin, resilience dot+%, hazard wave+turns, trailing chevron), not stacked lines; tapping the pill re-expands cleanly.
- `tsc --noEmit` clean (this is CSS-only, but keep the usual check since the file is shared with the mobile responsive work).
- `PROGRESS.md` gets a short entry noting the missing base `display: none` as the root cause, so it's on record why the pill briefly shipped broken.

## Separately, while testing — confirm this is still pending

`STEP_PROMPT_test_slider_resort_damage.md` (slider rescale to ×2 cap, removing the palm tree from Beachside Resort's icon, and the storm-damaged building tint) does not appear to have been run yet — `hazardTestPanel.ts` still has `max="3"` with no `sliderToSeverity` conversion, and `beachsideResortGeometry()` in `elementGeometry.ts` still calls `palmGeometry(0.78, 0.15)`. Not part of this hotfix, just flagging it so it isn't assumed done: read and execute that file next if it hasn't been picked up yet.
