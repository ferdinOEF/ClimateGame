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

## 4. HUD collapse/expand toggle (mobile)

**The problem:** even with Section 3's breakpoint sizing applied, the HUD's corner strips (instrument/meter cluster, schedule readouts, whatever else `hud.css`/the HUD controller currently renders as corner-anchored elements) still occupy a meaningful fraction of a small phone screen simultaneously with the map underneath — "responsive" isn't the same as "out of the way." Give the player a way to shrink it down to reclaim screen space, without removing the information entirely.

- Add a single toggle button — a small, fixed-position control (a corner is fine; pick whichever corner doesn't collide with Section 1's safe-area-inset padding or an existing element) that collapses the HUD to a minimal state and expands it back. A simple chevron/caret icon that flips direction, or a two-state icon (e.g. compress/expand glyph), is enough — this doesn't need new iconography beyond what's easy to render in CSS/inline SVG.
- **Default state is expanded** — same HUD layout as today, unchanged, until the player taps the toggle. Don't persist a collapsed preference across reloads unless it turns out to be trivial; resetting to expanded each fresh load is the simpler and acceptable behavior for this pass.
- "Collapsed" means the corner strips (instrument cluster, schedule/meter readouts, and similar informational HUD elements) shrink or hide down to something unobtrusive — a thin edge strip, or fully hidden with just the toggle button itself remaining visible, whichever reads better once it's actually on screen. Whatever the collapsed form is, the toggle button itself must always stay visible and tappable in both states, so the player can always get the HUD back.
- Don't collapse anything that's actively load-bearing for play at that moment — if there's a HUD element that's the only way to see a live countdown or an urgent state (check what's actually in the corner strips today before deciding), consider whether it should stay visible even when collapsed, or whether collapsing it is fine because the information isn't time-critical. Use judgment once you can see what's actually being hidden.
- Scope this to the mobile breakpoint(s) from Section 3 — this is explicitly a response to the HUD feeling intrusive on a small screen, not a desktop feature. Either hide the toggle button entirely above the breakpoint, or leave it available but expect it won't matter much on a full-size display; don't spend extra effort making it a polished desktop feature.
- Animate the collapse/expand transition (a simple CSS transition on transform/opacity/height is enough) rather than an instant snap — respect `prefers-reduced-motion` same as anywhere else motion is added.
- This is purely a HUD visibility toggle — it must not affect `BuildPopover`, `EraEndScreen`, camera controls, or any game logic. Toggling it while a popover is open shouldn't close or move the popover.

**Verify (this section):** at each mobile breakpoint from Section 3, confirm the HUD starts expanded on load, the toggle button collapses it to a visibly smaller footprint, the toggle button itself remains tappable and visible in both states, tapping again restores the exact original expanded layout, and the transition doesn't clip or flash. Confirm build/remove/tile-tap interactions with the map are unaffected in either HUD state. Confirm desktop is unchanged (or, if the toggle is left visible there too, that it doesn't regress the existing desktop HUD).

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
