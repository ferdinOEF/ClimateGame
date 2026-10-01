# Root & Ruin — Step Prompt: Real Hazard Water, Element Scale/Detail, and Dynamic Interaction

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, `STEP_PROMPT_hazard_science.md`, `STEP_PROMPT_icon_legibility_pass.md`, or `STEP_PROMPT_creature_reactions.md` — read all five first. This prompt exists because a live playtest surfaced four related complaints at once: the hazard phase doesn't look like real water, individual elements read as small/undetailed, mangroves and khazans don't feel interactive, and the overall motion feel lacks fluidity. Treat these as four sub-passes under one prompt, not one monolithic change — ship and verify each section before starting the next, per the project's own standing "small pieces, verify live" rule (`STEP_PROMPT_liquid_glass_build_menu.md` Section 3).

**Before writing any new code, verify what's actually live.** This project has a documented, repeated pattern of a STEP_PROMPT being written, implemented, and marked done in `PROGRESS.md`/`NEXT_STEPS.md`, while the deployed build still shows the old behavior (`STEP_PROMPT_liquid_glass_build_menu.md` Section 0: scroll-zoom and the Mangrove redesign both had this exact discrepancy). Specifically for this prompt: `STEP_PROMPT_creature_reactions.md` (tap reactions for Mangrove/Khazan/all nine elements) and `STEP_PROMPT_icon_legibility_pass.md` (Khazan/Sand Mining/Breakwater geometry) both describe themselves as implemented and verified. Before touching Section 3 below, load the live build, tap a Mangrove and a Khazan, and confirm with a screenshot whether those reactions actually fire. If they do and the complaint is really "the reaction is too subtle/small to notice" rather than "nothing happens," say so explicitly and scope Section 3 as a tuning pass, not a from-scratch build. Don't assume either way — check.

---

## 1. Hazard-phase water: simulated flow, not a tinted overlay sweep

**What's live today:** `render/floodOverlayManager.ts` (`HazardOverlayManager`) handles a tinted hazard overlay with a telegraph state — per `STEP_PROMPT_hazard_science.md` Section 6, this is described as "a colored overlay/displacement sweeping... along the hazard's actual BFS propagation front." The complaint is that this reads as a flat color wash over tiles, not as water actually moving.

**The fix is vertex displacement and real surface motion on the existing water planes, not a new rendering system:**

- **Give the hazard overlay plane(s) actual wave geometry.** Replace (or layer onto) the flat tinted plane with a subdivided plane mesh whose vertices are displaced by a sine/Gerstner-wave function driven by elapsed time — `y_offset = amplitude * sin(frequency * (x + time * speed) + phase)`, combined across 2-3 overlapping wave components at different frequencies/directions so it doesn't read as a single uniform ripple. This is standard low-poly water technique, well within Three.js's normal capability — no new library, no shader work beyond a vertex shader or a per-frame `BufferAttribute` update on the CPU side if a custom shader is more than this pass wants.
- **Orient the wave's direction of travel to match the hazard's actual propagation**, not a decorative default direction: for Storm Surge Wave, waves travel from the Coast/Estuary edge inland, timed to the same hop-by-hop BFS resolution already driving the color-sweep (`hazard.ts`'s propagation front) — the wave crest should visibly reach a tile at roughly the same moment that tile's damage resolves, same principle the science doc already established for the color overlay, just extended to geometry.
- **For Flood specifically, give the river its own standing/flowing water surface**, not just a hazard-time overlay: a permanent, subtly-animated water plane along every River tile (slow, continuous wave motion, modest amplitude) that intensifies in amplitude/speed when a Flood is telegraphing or resolving. This is what makes the river read as a real body of water rather than a flat blue tile all game, with the flood just "turning the volume up" on something already alive rather than switching on an effect from nothing.
- **Compound-event confluence (Section 3 of `STEP_PROMPT_hazard_science.md`):** when Flood and Storm Surge Wave are both active, the two wave systems (upstream-sourced and downstream/tidal-push-sourced) should visibly meet and roughen/spike at their overlap zone — a simple approach is summing both displacement fields at overlapping tiles and clamping amplitude at a ceiling, which gives a visibly choppier, taller surface exactly where the science doc's damage-multiplier overlap already is, so the visual and the mechanic agree.
- **Foam/whitewater accent at the propagation front:** a thin, bright, high-contrast strip (vertex color or a cheap additive-blend plane) riding the leading edge of the wave as it advances — this is the single highest-value detail for making a sweep read as "water arriving" rather than "color fading in," borrowing the same principle Dorfromantik/Townscaper use (motion and incident light doing the work, not texture).
- **Keep the existing telegraph-then-resolve state machine in `HazardOverlayManager` as the control layer** — this pass changes what renders during each state, not when states change or how they're triggered.

---

## 2. Element scale and detail: a legibility pass across all nine, not just the three already flagged

**What's live today:** `STEP_PROMPT_icon_legibility_pass.md` already fixed Breakwater, Sand Mining, and Khazan's worst silhouette problems, and confirmed via screenshot that the other six (House, Mangrove, Beachside Resort, Dune, Seawall, Small Dam) "read clearly" — but clear silhouette at debug-screenshot zoom isn't the same complaint as "too small/lacks detail" at normal in-game camera distance during actual play. Re-run the legibility check at the camera's default playing distance and zoom range, not a close-in debug shot.

- **Scale pass:** every element's bounding geometry today is sized well under a hex tile's own footprint (per the existing geometry constants in `elementGeometry.ts` — radii/dimensions in the roughly `0.15-0.9` range against what reads as a `~1.0`-ish tile unit). Increase each element's overall footprint to fill noticeably more of its tile — a reasonable target is 60-80% of the tile's visual diameter at the base, versus whatever smaller fraction is live today for the worst offenders. Scale up as a whole-assembly transform first (quick to test), then re-distribute proportions by hand only where a straight scale-up makes a part (like Sand Mining's dredge arm, already flagged as too thin even post-fix) disappear relative to its neighbors again.
- **Detail pass:** "lacks detail" at the current poly budget most often means too few distinguishing secondary shapes, not too few polygons overall. For each element, add one or two secondary forms that read at a glance without raising the poly budget into performance risk — texture-free secondary silhouette cues (a second roof plane, a visible root/stilt structure, a distinguishable water-vs-planted split) in the same flat-shaded, vertex-colored language already established, never a texture or sprite (`GAUNTLET_PROMPT.md` Section 9's "color, not texture" rule stays).
- **Re-verify against the grayscale check** (`GAUNTLET_PROMPT.md` Section 9) after scaling: a bigger, more detailed element still needs to be distinguishable by shape/value alone, not just because it's now large enough to notice.
- **Camera distance matters more than the geometry here** — before scaling every element up, confirm what the actual default zoom level is in a fresh playtest screenshot (not a zoomed-in debug shot) and measure element size as a fraction of visible tile size at *that* distance. If the default camera is simply further out than earlier passes assumed, a camera-distance/FOV tweak may be the cheaper, more correct fix than re-scaling nine elements — check both, report which (or both) actually moved the needle.

---

## 3. Dynamic interaction: verify, then ship or fix, `STEP_PROMPT_creature_reactions.md`

Per the verification step at the top of this document: this entire spec already exists in detail (tap-triggered creature reactions for all nine elements, Khazan's Season-driven ambient paddy cycle) and claims to be implemented. Three possible states, handle accordingly:

1. **Not actually live** (most likely given this project's track record) — implement `STEP_PROMPT_creature_reactions.md` in full, it does not need to be re-designed, it needs to be built. Pay particular attention to Section 0's calibration principle (one clear reaction, 1.5-3 seconds, then quiet) and Section 1's grow→hold→exit plateau pattern — this is also the fluidity fix for Section 4 below, so get this animation shape right once and reuse it.
2. **Live but too subtle to notice during normal play** — the reaction mesh/motion exists but reads as a flicker or is too small/fast given the new element scale from Section 2. Increase reaction mesh scale proportionally to whatever the element scale-up in Section 2 lands on, and lengthen the "hold" beat if it's currently reading as instantaneous.
3. **Live and working** — if a fresh screenshot/recording genuinely shows birds swooping into a tapped Mangrove and a creature leaping from a tapped Khazan, the "lack of dynamic interaction" complaint is about something else (most likely: the *ambient* feel, i.e. elements look inert between taps, which Section 4 below addresses) — say so plainly rather than re-implementing something that already works.

**One addition beyond what the creature-reactions doc specs, if verification shows it's needed:** a light ambient idle motion for Mangrove and Khazan specifically (not the "general ambient idle-sway pass across every element" the creature-reactions doc explicitly ruled out for all nine — just these two, since they're the ones named in the complaint) — a slow canopy sway for Mangrove, a faint ripple on Khazan's water plane, both subtle enough not to compete with the tap reaction's own motion. This is new scope beyond the existing doc, only build it if Section 0's live-check shows the tap reactions alone don't resolve the "feels inert" complaint.

---

## 4. Fluidity: one shared animation standard, applied everywhere motion happens

"Lack of fluidity" is a cross-cutting complaint, not a single bug — the fix is holding every motion system in the game to the same standard rather than patching water/elements/reactions independently with different easing conventions.

- **Standardize on the grow→hold→exit plateau curve** already validated in `STEP_PROMPT_creature_reactions.md` Section 1 and reused in `STEP_PROMPT_liquid_glass_build_menu.md`'s build-confirmation pulse: ease in to peak, hold the peak value unchanged for 30-40% of total duration, ease out. Any animation in the game that currently skips the hold (continuous motion start to finish) is a fluidity bug by this project's own established standard — audit `SettleAnimator` and any other tween/animation helper for this specifically.
- **Water motion (Section 1) and element reactions (Section 3) should share easing functions and timing constants** where their motion types overlap (e.g. any ripple/surface-settle behavior), via one shared easing utility rather than each system hand-rolling its own curve — reduces the chance of two water-adjacent effects visibly disagreeing in feel.
- **Respect `prefers-reduced-motion`** if the game doesn't already — a fluidity pass is also the right moment to confirm this, since it's a standing baseline web-accessibility expectation independent of this project's own design language.

---

## Explicitly out of scope for this prompt

- Hazard resolution logic, damage formulas, `elements.json` fields, economy/Chapter content — this is rendering/animation only, same boundary every prior visual-pass STEP_PROMPT in this project has held to.
- The isometric-camera/diegetic-UI rework in `STEP_PROMPT_isometric_diegetic_ui.md` — separate, not yet greenlit, don't fold in.
- A full water-shader/GPU-particle system rewrite — vertex displacement on existing geometry is the right scope for this pass; flag if performance forces a lighter-weight approach, don't preemptively over-build.

---

## Verify

- Section 0: a screenshot/recording showing the actual current live state of creature reactions, before any new work in Section 3 starts.
- Section 1: a recorded Storm Surge Wave and a recorded Flood each show visible wave geometry (not a flat color plane) advancing in the correct direction, timed to the hop-by-hop resolution; a compound event shows the two wavefronts visibly meeting/roughening at their overlap zone.
- Section 2: a fresh playtest screenshot at default camera zoom (not a close-in debug shot) showing all nine elements meaningfully larger/more detailed than the current build, still passing the grayscale distinguishability check.
- Section 3: screenshots/recording of a Mangrove and Khazan tap each showing a clear reaction, plus (if built) the new ambient idle motion for both, not competing visually with the tap reaction.
- Section 4: a short list of every animated system in the codebase audited against the grow→hold→exit standard, noting which already complied and which were changed.
- `tsc --noEmit` clean, existing test suite passing, production build succeeds.
- `PROGRESS.md` entry per the project's standing convention, explicit about which of Sections 1-4 were net-new builds versus tuning passes on already-shipped work.
