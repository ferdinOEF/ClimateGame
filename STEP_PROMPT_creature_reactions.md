# Khazan — Step Prompt: Element Tap Reactions & Khazan's Living Paddy Cycle

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md` or `NEXT_STEPS.md` — read both first, especially `GAUNTLET_PROMPT.md` Section 0.1's sequencing rule. This work satisfies Section 0.1, it doesn't compete with it: it's UI/UX polish and "motion and feedback live in the world" (Section 7/9), not a new mechanic, so it can proceed regardless of where Bucket A–C in `NEXT_STEPS.md` currently stand — though if anything in Bucket A is open, close that first since it'll make this harder to verify cleanly.

**Source and status:** this executes the open item flagged in `STEP_PROMPT_isometric_diegetic_ui.md`'s self-assessment addendum — "none of this exists in the actual Three.js game yet." The reactions were prototyped and validated as a standalone CSS/SVG study, "Khazan Feel" (https://claude.ai/artifact/YaRJurBFZ7dun4Md2zeUAc, v8) — a UX/visual-direction artifact, not game code. This prompt is the translation of that validated interaction language into the real engine (`Three.js` + `TypeScript`, per `GAUNTLET_PROMPT.md` Section 11).

**This is purely additive and visual.** No change to `elements.json`'s `effects`, `buildCost`, `terrain`, or any other data field; no change to hazard resolution, the economy, or Season logic anywhere in `/src/core`. Everything here lives in `/src/render` (and, for the one ambient system below, a read of existing Season state — not a write).

---

## 0. The calibration this whole study was actually about

The artifact's own throughline (worked out via its "tension dial" exploring Dorfromantik's restraint against curiouswala.com's audio-reactive particle-burst spectacle) is the design principle to carry over, not just the individual reactions: the world should visibly notice a tap — a short, clear, specific answer — then go quiet again. Not competing UI, not a particle-fireworks show, not constant motion demanding attention. Each element gets one signature reaction, over in 1.5–3 seconds, then the scene is calm until the next tap. This is Direction A from the artifact's own two-pole framing, not Direction B or C — keep it there.

---

## 1. The shared technical pattern to port

Every reaction in the artifact follows the same three-beat shape, and it's what makes each one read as real rather than flickery: grow toward the camera → hold fully formed and still for a beat → exit. Concretely, that's not three separate animations — it's one animation curve with a plateau: ease in to a peak scale/position, hold that exact peak value unchanged for roughly 30–40% of the total duration, then ease out. Skipping the hold (constant continuous motion start to finish) is what made earlier attempts read as low-effort — implement the plateau explicitly, don't rely on the tail of an ease-out to fake it.

Port these four things as shared infrastructure before touching any individual element:

- A `spawnReaction()`-style helper (one per creature/species, mirroring the artifact's `spawnBird`/`spawnDragonfly`/etc. pattern): given a tile's world position and a species/variant id, instances a small pre-built low-poly mesh, animates it through grow→hold→exit via a tween (a `THREE.AnimationMixer`/clip, or a hand-rolled lerp driven off elapsed time in the render loop — either is fine, match whatever pattern `SettleAnimator` already establishes for the build/claim animations, since that's the closest existing precedent in this codebase), and disposes/removes itself when the animation completes. Cap concurrent reaction instances at a small number (8–10) and recycle the oldest if that cap is hit, rather than letting spawns pile up unbounded from rapid tapping.
- Deterministic-cycle variety, not pure RNG, for every element with more than one outcome (Mangrove's bird combos, Khazan's three creatures). The artifact's `BIRD_CYCLE` array — a fixed sequence of small preset combinations (`['kingfisher']`, `['kite']`, `['kingfisher','egret']`, …, all three together only rarely) stepped through by an incrementing index, not `Math.random()` picking fresh each time — exists specifically because pure RNG visibly clusters and repeats over a handful of taps in a way a fixed cycle doesn't. Port the same shape: an ordered array of outcome-combinations, an incrementing counter per element instance (or per element type, whichever reads better once it's in front of the real tap cadence), modulo into the array.
- Low-poly, flat-shaded, vertex-colored creature geometry — never a texture, sprite, or billboard. Every new creature (kingfisher, egret, Brahminy kite, dragonfly, prawn, ghost crab, garden lizard, cat, beach ball, pigeon, leaping fish, a generic shorebird, and the Khazan farmer figure below) needs the same multi-facet flat-shading construction already used for the Mangrove canopy and the Section-9-mandated palette: a base shape plus one or two offset highlight shapes in a lighter tone, built from simple primitives/extrusions, matching `STEP_PROMPT_icons.md`'s translation note (its guidance for turning a flat silhouette into a 3D low-poly build applies identically here). Keep each creature's poly count low — these are small, transient, and several can be on screen briefly at once.
- Re-check the tint-multiply gotcha for every new creature, documented in `STEP_PROMPT_icon_legibility_pass.md`'s addendum: `ElementMeshManager` multiplies a mesh's baked vertex color against that element's flat per-instance palette tint, which can crush a color far from the tint's own hue (grey, blue, white) into mud. Creatures spawn as their own meshes near a tile, not as part of the tile's own tinted instance, so confirm whether they go through the same tint pipeline or render with their own untinted materials — if the former, push lightness/saturation before the multiply the same way Sand Mining's scoop and Khazan's water were corrected; if the latter, this doesn't apply, but confirm which is actually true by a screenshot rather than assuming.

---

## 2. Where this hooks into the existing code

Reactions trigger on the same tap/click that currently opens a built tile's occupant info card (the code path `NEXT_STEPS.md` A1/A5 already hardened — raycast hits a built element, `BuildPopover` shows the occupant card). Add the reaction spawn alongside that, gated so it:

- only fires for a tile that already has a built element (never on an empty/unclaimed tile, and never instead of opening the info card — both happen together, the way the artifact's own `runFx()` ran alongside its info display),
- fires once per tap (not once per frame, not repeatedly while the popover stays open),
- spawns the reaction mesh at/near that tile's world position via `axialToWorld`, offset upward enough to clear the tile's own built geometry.

---

## 3. Element-by-element spec

The artifact catalogued 10 items; the real roster (`GAUNTLET_PROMPT.md` Section 4, `STEP_PROMPT_icons.md`) has 9. Nine map directly. "Breakwater" does not exist as a buildable element in this game — skip it. Do not invent a new roster element to use it; if a Breakwater element is ever wanted, that's a separate, explicitly-scoped design decision, not implied here.

For each of the 9 real elements below, the existing, already-approved static low-poly geometry (per `STEP_PROMPT_icons.md` / `STEP_PROMPT_icon_legibility_pass.md` / `STEP_PROMPT_map_reshape_veg_icons.md`) stays exactly as it is — nothing here touches an element's standing built appearance. Only the tap reaction (and, for Khazan, one ambient system) is new.

1. **Mangrove** — tap: 1–3 of White-throated Kingfisher / Little Egret / Brahminy Kite swoop in, hold, peel off, cycling through the artifact's preset combinations. Spawn point: near the 3-clump cluster's canopy (the cluster redesign in `STEP_PROMPT_map_reshape_veg_icons.md` means "near the cluster," not one single fixed tree point).
2. **Khazan** — tap: dragonfly, prawn, or mudskipper (one of three, randomized) leaps/hovers from the water half of the tile. Plus the ambient system in Section 4 below.
3. **Dune** — tap: a few sand-grain particles kick up, a garden lizard darts out from the ridge and back into cover.
4. **Sandy Vegetation** (Pandanus) — tap: the rosette sways, a ghost crab bolts from around the base and skitters back.
5. **House** — tap: a window-glow pulse on the two window insets, a cat stretches near the veranda.
6. **Beachside Resort** — the artifact's "umbrella sways" doesn't map to the current hotel-block redesign (no umbrella in that geometry — see `STEP_PROMPT_icons.md` item 9). Adapt: sway the palm frond instead (the redesign keeps "one stylized palm" beside the pool), plus a beach ball bounces across the pool deck. Two small ripple rings on the pool surface, same as the artifact's version.
7. **Seawall** — tap: spray particles off the block face, two pigeons flutter in and perch on the cap course, peck-bob, then fly off. (Not mudskipper — wrong habitat, already corrected in the artifact after user feedback; not a rock-crab recolor either — build it as its own low-poly bird, per Section 1's "never a recolor trick" rule, which is the same fix the artifact's own self-assessment flagged for its CSS rock-crab shortcut.)
8. **Small Dam** — tap: mist puffs at the spillway notch, a fish leaps clear of the existing blue spillway-water plane and drops back. Spawn point: the spillway notch specifically — that geometry already exists on this element, use it.
9. **Sand Mining** — tap: sand-particle puffs off the mound, a pair of generic shorebirds flee (fast, panicked timing — shorter hold, quicker exit than any other reaction in the roster) rather than any of the Mangrove's three named species. Build one plain, deliberately unornamented flying-silhouette mesh for this — it's meant to read as "some disturbed bird," not a named resident, exactly the distinction the artifact's self-assessment called out.

---

## 4. Khazan's ambient living-paddy cycle — tie it to real Season state, not a fixed timer

The artifact's version ran on an arbitrary 18-second CSS clock, because a static prototype has no real notion of time passing. The actual game does — the Calm → Forecast → Hazard → Aftermath Season loop (`GAUNTLET_PROMPT.md` Section 2) is the real clock this should hook into instead, which is a strictly better fit than porting the arbitrary timer verbatim:

- Every built Khazan's paddy-row half (the existing striped geometry from `STEP_PROMPT_icons.md` item 5, already tint-corrected in the legibility pass) has four pre-built growth-stage variants — shoots, full growth, gold/grain-bearing, stubble — swapped by visibility/opacity, not regenerated geometry.
- Advance one stage per Season transition (read Season/turn state from `GameState`; do not add a second, independent clock). A sensible mapping: shoots at Season start, tall by Forecast, gold going into Hazard, a farmer figure walks the plot at the Aftermath beat of a Season where the Khazan wasn't damaged (a nice, small, positive "the harvest happened" signal layered on top of the existing Aftermath beat — Section 6 of `GAUNTLET_PROMPT.md`), then stubble, then back to shoots next Season.
- Every Khazan tile on the map reads its stage from the same shared Season state — they should all be in the same stage at the same time, which is correct here (unlike the artifact's catalog gallery, where nothing else established a shared timeline) since it reinforces that a Season actually passed across the whole settlement, not just at one tile.
- The farmer figure: one small low-poly figure (per Section 1's construction rules), walking a short fixed path across the plot, present only during that one Aftermath beat, not idle/looping the rest of the time.

---

## 5. Explicitly out of scope for this prompt

- The isometric-camera / orthographic / diegetic-floating-UI proposal in `STEP_PROMPT_isometric_diegetic_ui.md` — a separate, larger, not-yet-approved change (camera type swap, lighting rework). Don't fold it into this pass; it's available as a follow-up if and when it's explicitly greenlit.
- Any change to `elements.json`, hazard resolution, or Chapter/economy logic.
- A general ambient idle-sway pass across every element — only Khazan's growth cycle above is required to be ambient/time-driven; every other reaction here is tap-triggered only.
- Inventing a Breakwater roster element to use the artifact's cormorant reaction.

---

## Verify

- Live-playtest screenshots (or a short recording) of a tap on each of the 9 elements, showing the reaction's grow→hold→exit read clearly, not as a flicker.
- Mangrove and Khazan specifically: tap the same element 4–5 times in a row and confirm visibly different outcomes each time (cycle, not repeat-the-same or fully-random-feeling clustering).
- Khazan: a scripted or manual multi-Season playthrough shows the paddy visibly advance a stage per Season, the farmer appear at one Aftermath beat, and every Khazan tile on the map agreeing on the current stage.
- Screenshot check for the tint-multiply gotcha on any creature whose mesh goes through `ElementMeshManager`'s tint pipeline — confirm its color reads as intended, not crushed toward the tile's tint hue.
- `tsc --noEmit` clean; existing test suite unchanged/still passing; no diff anywhere in `elements.json` or `/src/core`.
- `PROGRESS.md` gets the usual entry, and note explicitly that Breakwater was skipped as a non-roster element rather than silently omitted.
