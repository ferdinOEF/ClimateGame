# Khazan — Step Prompt: QA Gauntlet (UI / UX / Gameplay)

**How to use this document:** a self-looping debugging pass, not a feature build — same operating mode `GAUNTLET_PROMPT.md` already establishes for this project (commit at every phase boundary, only stop for genuinely irreversible/ambiguous calls, log everything to `PROGRESS.md`, keep going). Run this against the real local dev server (`npm run dev`) with a real browser — not a code-reading pass. If Playwright is available in this repo, drive it through Playwright for repeatability; if not, drive it manually and note that in `PROGRESS.md`.

**Before starting, confirm the backlog is actually clear** — two prior fixes were handed off and should already be in the tree: `STEP_PROMPT_hud_pill_overflow_fix.md` (the `.cluster-pill` missing base `display: none`) and `STEP_PROMPT_test_slider_resort_damage.md` (slider rescale, resort tree removal, storm-damage building tint). File mtimes suggest both landed — verify with a quick look at `hud.css`'s `.cluster-pill` base rule and `hazardTestPanel.ts`'s slider `max` before assuming either is still open, so this pass doesn't waste a cycle rediscovering something already fixed.

**Loop structure:** work through Sections 1–3 below in order. For each item: reproduce it live, confirm it's real (not a one-off rendering glitch — reload and retry once), fix it as its own small commit, re-verify the fix live, then continue. If a full pass through all three sections finds zero new issues, the loop is done — don't keep searching for problems that aren't there. If an item's fix is genuinely ambiguous (a design judgment call, not a bug), log it in `PROGRESS.md` as a flagged question and move on rather than guessing or stalling the loop on it.

---

## 1. UI — does it render correctly, everywhere?

- **No overflow/clipping anywhere.** The `.cluster-pill` bug (missing base `display: none`, so it rendered unconditionally outside its intended breakpoint) is the exact bug *class* to hunt for elsewhere: any element whose "hidden by default" rule only exists inside a media query, a `.collapsed`/`.active`/`.hidden` state class, or similar — check every corner-anchored HUD element (`instrument-cluster`, `tile-count-value`, `era-banner`, `yacht-goal`, `empty-prompt`, `hazard-test-panel`), `BuildPopover`, and `EraEndScreen` the same way: does it have a correct, unconditional *base* state, with only genuine overrides scoped to the right condition?
- **Every breakpoint from `STEP_PROMPT_mobile_responsive.md`** (iPhone SE 375×667, a modern iPhone 390×844, a common Android ~412×915, iPad portrait ~768×1024) plus a normal desktop width (1280px+, mouse pointer) — check each corner element, the instrument cluster in both expanded and collapsed state, `BuildPopover`, `EraEndScreen`, and the Test Hazards panel for overflow, clipping, overlap between elements, or anything readable-but-ugly.
- **Icon/asset correctness:** Beachside Resort's icon (no palm tree, per the recent fix), House/Resort's damaged-tint visual after Storm Surge damage (does it actually apply, and actually clear on rebuild?), the Western Ghats backdrop, the storm-surge wave-front and river-flood animations — all rendering as intended, no z-fighting, no missing geometry.
- **Contrast and legibility** against the actual 3D scene background, not just against a solid color in isolation — HUD text, popover text, hazard-incoming warnings.
- **z-index / layering:** popover backdrop, era-end backdrop, hazard-arrival flash, and the Test Hazards panel never fight each other or block input to the wrong layer (this codebase has a documented history of exactly this bug class — see `NEXT_STEPS.md`'s A1 comment on `.build-popover`/`.era-end-backdrop` — check nothing has regressed and nothing new has the same shape).

## 2. UX — does it behave the way a player expects?

- **Build popover:** opens on tile click, closes on outside click/Escape, never lets a click pass through to the 3D scene underneath while open, never re-opens the full build menu on a tile that already has something built (shows that tile's info instead), no charge on a cancelled build.
- **HUD collapse/expand pill:** starts expanded, chevron collapses it, pill expands it back, values stay live and in sync between the two states, transition doesn't clip or flash, works at every mobile breakpoint, stays inert/hidden above the breakpoint on desktop.
- **Hazard telegraph:** the Forecast/preview mechanism actually communicates what's coming and where *before* it hits — schedule readout, arrival flash, preview toggle (when available) all agree with each other and with what actually happens when the hazard resolves.
- **Touch input on mobile:** single-finger pan, two-finger pinch-zoom, and a clean tap-to-build all work without one gesture spuriously triggering another (a pinch shouldn't open a build popover on whatever tile happened to be under a finger; a pan shouldn't leave the camera in a stuck state).
- **No dead ends:** every modal/overlay (build popover, era-end screen, reset-board confirm) has a working way out; reload/reset flows actually reset what they claim to.
- **Console is clean** through a normal play session — no uncaught errors/warnings during build, hazard trigger, era-end, or board reset. `read_console_messages`-equivalent output (or the browser devtools console if driving manually) gets checked, not assumed clean.

## 3. Gameplay — does it play the way the mechanics say it should?

- **Via the Test Hazards panel (`?debughazards`):** trigger Storm Surge and Flood at a few severities each (low/near-overwhelm/near-failure-threshold for at least one engineered defense) and confirm the *visible* outcome matches the documented mechanics — wave/flood reaching further up a River channel than equivalent Beach/Land distance, a Seawall/Breakwater/Small Dam breaching above its `failureThreshold` and not below it, an NBS defense (Mangrove/Dune/Sandy Vegetation) losing absorption above its `overwhelmSeverity` but surviving, Khazan/Small Dam's buffer visibly depleting and only partially recovering across back-to-back events.
- **Compound flooding:** trigger Storm Surge and Flood close together and confirm the river/estuary overlap zone visibly fares worse than either alone at the same severity, per `STEP_PROMPT_hazard_science.md` Section 3.
- **Damaged-building visual:** confirm a House/Resort that actually took ≥0.3 damage from Storm Surge tints, and one that didn't stays clean — spot-check against the real trust-loss condition, not just that *something* changed color.
- **Economy sanity, not balance-tuning:** Coin/Food/Population/Biodiversity/Resilience never go to `NaN`/`undefined`/visibly nonsensical values across a normal play session; this is about catching outright breakage, not re-tuning numbers (`STEP_PROMPT_balance_tuning.md` already owns real balance work — don't scope-creep into it here).
- **A full Season/hazard cycle end to end**, at least once: build, get a Forecast, weather a hazard, see Aftermath, keep playing — no crash, no stuck state, no meter that silently stopped updating.

---

## Guardrails

- This is a bug-finding-and-fixing pass, not a redesign or a balance-tuning pass — don't touch hazard math constants, absorption/threshold values, or visual direction unless something is actually broken (throws, silently no-ops, or visibly contradicts its own documented behavior).
- Every real fix is its own small commit, in the same style as every prior `STEP_PROMPT_*` in this repo.
- Log every finding in `PROGRESS.md` as you go, not batched at the end — a genuinely ambiguous call gets logged and flagged, not silently resolved by guessing.
- If the loop runs a full pass through Sections 1–3 with zero new findings, stop and report done — don't manufacture busywork.

## Verify (whole pass)

- `tsc --noEmit` clean; existing test suite passing at current baseline or better, after every commit in this pass, not just at the end.
- A closing `PROGRESS.md` entry summarizing: what was found, what was fixed, what (if anything) was flagged as ambiguous rather than fixed, and confirmation that a full pass found nothing further.
