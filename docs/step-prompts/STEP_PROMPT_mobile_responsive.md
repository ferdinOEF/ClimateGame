# Khazan — Step Prompt: Mobile Browser Responsiveness

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md` or `NEXT_STEPS.md` — read both first. This pass makes the game genuinely usable when opened on a phone or tablet browser. It's UI/layout/input work only — no hazard math, no balance numbers, no map data, nothing covered by `STEP_PROMPT_balance_tuning_findings.md` or `STEP_PROMPT_ghats_wave_demo.md`.

**What's already in decent shape, confirmed by reading the live code — don't rebuild these:**

- `index.html` already has a real viewport meta tag (`width=device-width, initial-scale=1.0, maximum-scale=1`) — reasonable as-is, since blocking the browser's own pinch-zoom is correct here (the in-game camera should own zoom, not the page). Section 1 below adds one thing to it, doesn't replace it.
- The HUD is already architected as small, corner-anchored strips rather than a desktop-style sidebar or fixed panel (`hud.css`'s own comment: "the map is the interface... HUD elements are small, corner-anchored strips only, never a panel competing with the map") — that's the right foundation for a small screen. The gap is that every size/position value is a hardcoded px number with zero `@media` queries anywhere in the file, not that the architecture is wrong.
- Camera pan (`scene.ts`) already uses Pointer Events (`pointerdown`/`pointermove`/`pointerup`), which unify mouse and touch input in every modern mobile browser — single-finger drag-to-pan should already basically work. The real gap is zoom: it's wired to `wheel` only, which never fires on a touchscreen. Section 2 below adds pinch-to-zoom alongside it, not instead of it.
- `BuildPopover` already has real viewport-clamping logic (`positionAndReveal()`) so it doesn't get cut off near a screen edge — keep that, just make what's inside it (button sizes, spacing) touch-friendly per Section 3.

---

## 1. Viewport fundamentals

- `#app`/`html, body` in `hud.css` use `100vh`/`100vw`. On mobile browsers, `100vh` includes space the address bar/toolbar occupies even when it's not currently visible, causing a jumpy/oversized layout as the toolbar shows and hides during scroll/interaction — a well-known real issue, not a hypothetical one. Switch to `100dvh` (dynamic viewport height) with a `100vh` fallback for older browsers (`height: 100vh; height: 100dvh;` — CSS falls back correctly since an unsupported value is ignored, keeping the earlier declaration).
- Add `viewport-fit=cover` to the existing viewport meta tag, and add `env(safe-area-inset-*)` padding to whichever HUD corner elements sit flush against a screen edge — a notched or gesture-bar phone otherwise crops or obscures corner content that a desktop browser never would.
- Add `touch-action: none` on the canvas element (or its container) specifically for the camera-control region — without it, a mobile browser may interpret a single-finger drag as an attempt to scroll the page or trigger pull-to-refresh, fighting the camera pan in `scene.ts`. Verify this doesn't also suppress button taps elsewhere (scope it to the canvas, not the whole document).
- Prevent double-tap-to-zoom and overscroll/bounce on the page itself (`overscroll-behavior: none` on `html, body` is usually sufficient) — a bounce or native zoom mid-game reads as a bug, not a browser being helpful.

---

## 2. Touch camera controls: add pinch-to-zoom

- In `scene.ts`, alongside the existing `wheel` handler (`ZOOM_SPEED`, `CAM_DISTANCE_MIN`/`MAX` — keep these constants and keep the wheel path for desktop unchanged), add two-finger pinch handling via Pointer Events: track two simultaneous active pointers by id, compute the distance between them on each `pointermove`, and map the frame-to-frame distance delta to the same `distance` variable `updateTransform()` already reads — reuse the existing clamp (`CAM_DISTANCE_MIN`/`MAX`), don't invent a second zoom range.
- The existing single-pointer pan logic (`pointerDown`/`didDrag`/`DRAG_THRESHOLD_PX`) needs to coexist with this cleanly: a second finger touching down mid-pan should hand off to pinch mode without the pan's existing drag position causing a jump, and lifting one finger back to one should cleanly resume pan (or just stop, and require a fresh single-finger press — simpler and fine for this pass, don't over-build gesture continuity that isn't asked for).
- Confirm the existing `wasDrag()` check (used by `main.ts`'s tile-click handling to suppress a click after a pan) also correctly suppresses a spurious tile click after a pinch gesture ends — a pinch shouldn't ever be interpreted as a tap on whatever tile happens to be under one of the two fingers.
- Don't touch the `click`-based raycasting/tile-selection code in `main.ts` itself — a tap that isn't a drag or pinch should keep working exactly as it does today (browsers synthesize a `click` event from a clean tap automatically; this has no reason to need its own touch-specific path).

---

## 3. Responsive HUD, popover, and modal sizing

- Add real `@media` breakpoints to `hud.css` — there are currently zero in the file. A reasonable starting set: a narrow-viewport breakpoint (roughly `max-width: 600px`, catching phones in portrait) and a check that things still look right on a small tablet (roughly 768-820px, an iPad in portrait). Don't just shrink everything to fit — mobile needs **larger** tap targets than desktop, not smaller ones, even if that means being more selective about what's shown at once.
- Audit every fixed-px `width`/`max-width` on a card/modal-style element — `BuildPopover`'s `.build-popover`, `EraEndScreen`'s `.era-end-card`, and whatever the HUD instrument cluster/meter strip components use — and switch to something that can't overflow a narrow viewport: `max-width: min(320px, 92vw)` (or similar — pick values that read well, this is a judgment call) rather than a bare fixed pixel width that could exceed a 375px-wide phone screen entirely.
- Tap target sizing: every clickable control a touch user has to hit — build options in `BuildPopover`, the "Remove" button, `EraEndScreen`'s "Start New Era" button, any zoom/camera controls if this pass adds on-screen ones — should have a comfortable minimum touch target (roughly 44px on a side is the standard iOS/Android guidance) even where the visual content inside is smaller. Padding, not just font-size, is usually the right lever.
- Font sizes and line-heights throughout `hud.css` are currently small, fixed px values tuned for a desktop viewing distance (13px HUD corner text, etc.) — bump these up within the narrow-viewport breakpoint specifically, rather than globally, so desktop is untouched.
- **Explicitly out of scope / low priority:** the `?debughazards` Test Hazards panel. It's a developer tool, gated behind a URL param, not something a real mobile player ever sees — don't spend this pass's effort making its sliders/checkboxes touch-friendly unless it's genuinely trivial alongside the rest.

---

## 4. HUD collapse/expand toggle (mobile) — "Status Pill" direction

**The problem:** even with Section 3's breakpoint sizing applied, `.instrument-cluster` (top-left, `hud.css`) still occupies a real fraction of a small phone screen — 225px wide, and tall once the coin row, income row, resilience gauge, hazard-incoming line, and the two meter chips are all stacked. That's the one corner element actually worth collapsing; the smaller pieces (`tile-count-value` top-right, `.yacht-goal` bottom-right, `.era-banner` top-center) stay exactly as they are — don't extend this section to them.

A direction was mocked up and signed off on before this was written (four options compared side by side; reference if useful, not required to build this: https://claude.ai/code/artifact/5f99d40b-8dec-42b9-a94e-56058c125be3). **The chosen direction — build this one:**

**Expanded (default, unchanged):** `.instrument-cluster` renders exactly as it does today — coin row, income row, resilience gauge, hazard-incoming line, chip grid — with one addition: a small chevron-up glyph inline in `.cluster-header`, to the right of the existing `turn-era-row` text (12px, stroke `#fdf6e6`, opacity `0.7`, same visual weight as the resilience gauge's numbers). Give it a comfortably tappable hit area via padding even though the glyph itself is small — the visible icon can stay small while the clickable region reaches ~44px, a common and correct pattern (don't inflate the icon itself to 44px, it'll look oversized next to the rest of the header). Tapping it collapses the cluster.

**Collapsed:** the entire card becomes a single-row pill, same top-left position (`top: 12px; left: 12px`), height ~34px, `border-radius: 17px`, background `rgba(20, 30, 26, 0.9)`, `border: 1px solid rgba(255, 255, 255, 0.14)`, `box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4)` — same card language as the expanded state, just shorter. Inside, left to right, separated by thin `1px` vertical dividers (`rgba(255, 255, 255, 0.15)`):
  1. A small coin glyph (a plain circle with a horizontal bar through it is enough — stroke `#ffe9a8`, no need for new iconography) + the coin amount, `12px` `700`, `#fdf6e6`.
  2. A `6px` colored dot + the resilience percentage, `12px` `700`. Color the dot the same way `.resilience-gauge-fill`/`.resilience-gauge-fill.critical` already do (`#7bd4c4` normal, the critical red-orange when resilience is in its critical range) — this pill is a summary, so it should carry the same "is this actually fine" signal the full gauge does, not just a number.
  3. A small wave-glyph (a simple sine-like stroked path reads as "hazard/storm" and fits the game's own coastal language) + the same "turns until next hazard" number the existing `hazard-incoming-line` sentence is built from. Pull that from wherever `hazard-incoming-line`'s text is actually assembled in `hud.ts` — reuse the underlying number, don't parse it back out of the rendered sentence.
  4. A trailing chevron (pointing right or down, `11px`, stroke `#fdf6e6`, opacity `0.65`) as the visible "there's more" affordance. The whole pill is the tap target to re-expand, not just the chevron.
  - The pill needs `pointer-events: auto` explicitly — `.hud-corner`'s base rule is `pointer-events: none`, and `.instrument-cluster` normally relies on that (nothing inside it is clickable today). `.preview-toggle` already opts back in the same way for its own button; follow that precedent.
- **Implementation approach:** don't destroy/rebuild the cluster's DOM on every toggle. Add a `collapsed` state (a class on `.instrument-cluster`, e.g. `.instrument-cluster.collapsed`) that CSS-hides the existing detailed rows and reveals a summary-pill row that's `display: none` in the normal state. Whatever `hud.ts` code currently updates the coin/resilience/hazard text needs to also keep the summary pill's own text nodes in sync (same source values, written to both places) — the pill must never show stale numbers relative to the expanded view underneath it.
- **Default state is expanded** on every fresh load — don't persist a collapsed preference unless it turns out to be trivial; resetting to expanded each load is fine for this pass.
- Scope this to the mobile breakpoint(s) from Section 3 — hide the chevron toggle above the breakpoint (or leave it inert; it won't matter much at desktop width where 225px is a small fraction of the screen). Don't build a desktop-specific treatment.
- Animate the swap between the detailed rows and the pill (a CSS transition on the two rows' opacity/max-height, or a similar crossfade) rather than an instant snap — respect `prefers-reduced-motion`.
- Purely a visibility toggle on `.instrument-cluster` — must not affect `BuildPopover`, `EraEndScreen`, camera controls, or any game logic. Toggling it while a popover is open shouldn't close or move the popover.

**Verify (this section):** at each mobile breakpoint from Section 3, confirm the cluster starts expanded on load with the chevron visible in its header; tapping the chevron collapses it to the single-row pill with correct, live coin/resilience/hazard values and the resilience dot's color matching the gauge's own critical-vs-normal logic; tapping the pill re-expands to the exact original layout; the transition doesn't clip or flash; the chevron's hit area is comfortably tappable even though the glyph is small. Confirm build/remove/tile-tap interactions with the map are unaffected in either state. Confirm desktop is unchanged.

---

## 5. Orientation

Don't force a specific orientation (no Screen Orientation API lock, no "please rotate your device" gate) — the game is a pan/zoom camera over a fixed map, which has no inherent portrait-vs-landscape requirement the way a side-scroller would. Just make sure Section 3 and Section 4's layout work is checked in both orientations, not only one.

---

## Guardrails

- No changes to hazard math, balance constants, map data, or anything covered by `STEP_PROMPT_balance_tuning_findings.md` or `STEP_PROMPT_ghats_wave_demo.md`.
- No changes to desktop mouse/wheel/keyboard behavior — every change here is additive (new touch handling, new `@media`-scoped CSS) or a fallback-safe fundamental (dvh-with-vh-fallback), not a replacement of the existing desktop experience.
- Don't rebuild the HUD's architecture — it's already the right shape (small corner strips, not a desktop panel). Sections 3 and 4 are a sizing/breakpoint/collapse pass on top of the existing structure, not a redesign.
- One concern per commit is a reasonable split here too: (1) viewport fundamentals, (2) pinch-to-zoom, (3) responsive HUD/popover/modal sizing, (4) HUD collapse/expand toggle. Orientation (Section 5) is really just a verification step across sections 1-4, not its own code change.

## Verify

- Test at a real spread of common breakpoints, not just one phone size: iPhone SE (375×667), a modern iPhone (390×844), a common Android (~412×915), and an iPad in portrait (~768×1024) — Chrome DevTools' device emulation with touch simulation is fine for this, real-device testing is better if available.
- In each: confirm single-finger drag pans the camera, two-finger pinch zooms it (both directions), and a clean tap on a tile still opens the build popover/info card — with no spurious popover opening after a pan or pinch ends.
- Confirm the page itself never scrolls, bounces, or double-tap-zooms — only the in-game camera moves.
- Confirm `BuildPopover`, `EraEndScreen`, and the HUD's meter strip/corner elements are all fully visible (no overflow off-screen, no text clipped) and comfortably tappable at the narrowest tested width (375px).
- Confirm the HUD collapse toggle behaves per Section 4's checklist at each breakpoint.
- Confirm the layout holds in both portrait and landscape at each breakpoint.
- Confirm nothing changed on desktop — same viewport meta behavior, same mouse/wheel camera controls, same HUD sizing above the new breakpoint's threshold.
- `tsc --noEmit` clean; existing test suite passing at current baseline or better.
- `PROGRESS.md` gets the usual entry, including which breakpoint widths were actually landed on and how the collapsed HUD state was implemented.
