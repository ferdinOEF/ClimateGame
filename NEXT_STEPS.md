# Khazan — Next Steps (running punch list)

This is the step-by-step queue for the gauntlet loop, kept separate from
`GAUNTLET_PROMPT.md` (the design spec) on purpose: the spec says what the
game is, this file says what to do right now, one item at a time. Read
`GAUNTLET_PROMPT.md`'s Revision log first, especially v2.4 and Section 0.1.

Work Bucket A in order before touching Bucket B. Explicit sequencing
directive, Section 0.1: get the existing loop feeling good to actually
play before adding or expanding content.

Don't start the next item until the current one's "Verify" step is
actually done and noted in the Log (date + one line), not just assumed.

## Bucket A — UI/UX & Playability (work this first)

### A1. Fix: build popover doesn't auto-close after a successful build, and doesn't reflect a tile's already-built state — top priority

Status: closed (see Log). Found the actual root cause this time, and it's
a single bug explaining every symptom below at once: `.build-popover` in
`hud.css` has its own unconditional `display: flex`. Author-stylesheet
rules always beat the user-agent stylesheet's `[hidden] { display: none }`
default *regardless of selector specificity* — so every previous pass's
`this.el.hidden = true` was updating the DOM attribute correctly (confirmed
live via `getComputedStyle`: `hiddenAttr: true`, `computedDisplay: "flex"`)
but the popover never actually disappeared on screen. That explains:
- Outside-click/Escape "not dismissing" — they *were* setting the right JS state the whole time; the CSS just never reflected it.
- Clicks passing through to the map underneath a "stale" popover — `main.ts`'s canvas handler checks `buildPopover.isOpen` (`!el.hidden`), which correctly read `false` after a close, so it correctly treated the next click as a normal map interaction — there was nothing to "pass through," the popover was already closed as far as the game logic knew, it just still *looked* open.
- A5 (Mangrove-on-Estuary charging Coin but not building) — almost certainly this same illusion: the build actually completed correctly (confirmed independently — see Log), but the stale-looking popover made it read as if nothing happened.

Fixed with `.build-popover[hidden] { display: none; }`, plus the
explicitly-requested real modal layer on top: `BuildPopover` now owns a
`.popover-backdrop` (full-viewport, `position: fixed; inset: 0`, z-index
between the canvas and the popover box) that's shown/hidden together with
the popover. While open, the backdrop physically sits above the canvas
*and* the HUD, so every click except one on the popover's own content hits
the backdrop first and just closes the popover — the "stale popover, click
leaks to the map" scenario is now structurally impossible, not just
guarded against. `main.ts`'s old document-level outside-click listener
(added last pass to patch around the CSS bug) is gone — the backdrop
subsumes it entirely.

Verified live (Playwright driving the actual page, checking
`getComputedStyle(...).display` — not the `.hidden` attribute, which is
exactly the signal that gave a false "working" reading last time):
auto-close on build, occupied-tile info card, Escape, and the critical
one — clicking a totally different, unclaimed tile far away while a
popover was open closes the popover *and* leaves that other tile's claim
state and Coin completely untouched (13 tiles / 1000 coin before and
after). Also confirmed a click on the popover's own padding does *not*
close it. Popover clipping near the viewport's top edge: re-verified via
the `testpopoverclip` dev hook, still clamps correctly — not a real issue.

### A2. Unclaimed-but-visible hexes should read as visually distinct from claimed ones

Status: closed (see Log). Did the explicit dedicated re-check this pass:
claimed one isolated tile of each terrain type (Beach, Land, River,
Estuary), away from the starting cluster, and screenshotted each next to
its unclaimed neighbors. All four are clearly distinguishable by
color/saturation alone: claimed Beach reads gold/orange against
tan/khaki, claimed Land reads bright green against dim olive, claimed
River reads bright teal against grayish-blue, claimed Estuary reads deep
green against dim grayish-teal. This confirms the mixed signal from the
prior pass — it wasn't a fluke or an already-improved regression, the
dimming logic genuinely does work per-terrain; the original report was
likely affected by the A1 popover bug making it hard to cleanly test
claim state at the time.

Fix: none needed — already correct.

### A3. Add: thoughtfully designed icons for each buildable element

Status: closed (see Log). The House geometry in
`src/render/elementGeometry.ts` had flared eaves and a notch cut into its
base with no distinct wall section at all — nothing between "roofline"
and "ground," which is exactly why it read as a bench/couch/wagon instead
of a dwelling. Replaced with a plain pentagon silhouette (flat-topped
walls at the eaves, rising to a peak above them — the standard "home"
pictogram) plus a small chimney block. Confirmed by screenshot: reads
clearly as a house at both normal and close zoom. The other 7 elements
were already confirmed distinguishable/legible in earlier passes — see
Log — so this closes the full 8-element roster.

### A4. Claiming an unclaimed hex changes Coin by +46 instead of the stated -4c

Status: investigated, closed as **not a bug** — this is two individually-
correct mechanics combining in a way that reads as broken from the HUD
alone, not a sign/magnitude error. Traced `claim()` in `GameState`: it
does subtract the displayed price correctly (`-4`), but `claim()` is also
the sole call site of `advanceTurn()` — the "one claim = one turn" design
from earlier phases — which pays out every standing element's income for
that turn via `meterTotal("money")`. At the starting state (10 pre-built
Houses, each `money +5`), that payout is `10 × 5 = 50`. Net effect:
`-4 + 50 = +46` — exactly the reported number, exactly reproducible, and
independent of which tile/terrain is claimed (claim cost is flat and
income comes from standing elements, not the claimed tile). Isolated
diagnostic confirmed both halves of the math independently before
recombining them.

Deliberately **not** changing this: `claim()` is the only place
`advanceTurn()` is called anywhere in the codebase, so decoupling them
would either remove per-claim income entirely (breaking the B3 economy
loop this same pass confirmed working) or require inventing a second turn
trigger with no spec basis. The displayed "4c" is the claim cost, not a
promise that Coin will *drop* by 4 — it will net positive whenever standing
income exceeds it, which is the intended shape of the economy (claim more
land → own more income-producing tiles → afford to claim faster), not an
exploit. Flagging this explicitly rather than closing it silently, since
it diverges from the original repro's "pure money-printing exploit"
framing: the exploit read is understandable from the HUD's "4c" label
alone, but the label describes the cost, not the net delta.

If the HUD label is still misleading in practice, the fix is a copy/UI
change (e.g. show the net effect, or label it "claim cost" more
explicitly) — not a state-management fix.

### A5. Fix: building on an Estuary tile deducts Coin but doesn't actually build anything

Status: closed (see Log) — and the real root cause turned out to be
neither the build-confirmation flow nor A1's CSS bug, but a third,
previously-undiscovered bug: a stale cached `boundingSphere` on
`THREE.InstancedMesh` silently breaking raycasting (click detection)
against specific tiles.

`GameState.build()` and `ElementMeshManager.place()` were both proven
correct in isolation early in this investigation — Mangrove-on-Estuary
writes its state and renders its icon perfectly when driven directly,
without going through a click at all. That pointed at click handling
itself. Tracing `renderer.domElement`'s click listener live (with
temporary debug logging, since removed) showed the raycaster returning
zero hits at screen positions that were visibly, unambiguously over
Estuary tiles — confirmed by comparing against a manual straight-down ray
to the same world coordinates, which hit correctly every time.

The mechanism: `THREE.InstancedMesh.boundingSphere` is computed lazily
(on a mesh's first raycast, or its first frustum-culling check during
render) and then cached forever — nothing in Three.js ever invalidates it
automatically as instances move. `TerrainMeshManager`/`ElementMeshManager`
both animate tiles/elements into place via a shared `SettleAnimator`
(`claimTile()`'s reveal, `place()`'s drop-in), which repeatedly calls
`mesh.setMatrixAt()` well after that first bounding-sphere snapshot — so
once a mesh's very first bounding-sphere computation happens to land
mid-animation (or, as in this repro, during a burst of many claims fired
synchronously by `?autoclaim=N` before the first render frame even runs,
freezing several instances at their elevated "drop-in" starting
transform), every later click against that mesh gets silently rejected by
a broad-phase bounds check against a sphere that no longer describes
where the geometry actually is. This is a general engine-level bug, not
specific to Mangrove, Estuary, or even terrain — it happened to surface
on Estuary in this repro because of autoclaim's specific timing, and
would affect any tile or built element whose mesh's bounding sphere is
first computed while something on that mesh is still mid-settle.

Fixed in `src/render/settleAnimation.ts`: `SettleAnimator.tick()` now
invalidates (`mesh.boundingSphere = null`) every mesh it touches each
tick an animation is in flight, so the cached sphere is always
recomputed fresh once things stop moving (cheap — a null assignment,
and only while something is actually animating). Also invalidated
defensively at the other two places `TerrainMeshManager`/
`ElementMeshManager` write instance matrices directly outside the
animator: `TerrainMeshManager.resetClaims()` (era reset) and
`ElementMeshManager.place()`'s non-animated branch.

Verified live: re-ran the exact original repro (claim an Estuary tile,
open its popover, build Mangrove) after the fix — Coin drops by exactly
30, the popover closes immediately, and re-clicking the tile now shows
a proper info card ("Mangrove — biodiversity +3 · food +1"), confirming
both B2's Mangrove Food effect and A1's auto-close behavior were already
correct all along; they just couldn't be reached because the click
that should have re-selected the tile was the one silently swallowed.

## Bucket B — Content: coastal-only scope (work this after Bucket A is solid)

### B1. Fix: map generation doesn't match the explicit left/right orientation — plus add the Land terrain type

Status: closed (see Log). This was a real, deeper bug than the earlier
q-banding fix addressed — not a near-miss. Root cause: `axialToWorld`'s
formula (`x = √3·(q + r/2)`) has a shear term in `r`, so a plain
rectangular range of axial coordinates (`q ∈ [min,max]` for every `r`)
does not render as a rectangle in world space — it renders as a
*parallelogram*, sheared further sideways the more `r` moves from 0. With
a fixed, non-yawing camera, that shear reads exactly as this pass
described it: a landmass that looks wedge-shaped/triangular, with a
"diagonal vein" running through the middle instead of a straight band,
and Sea appearing to wrap around every side because the parallelogram's
slanted edges cut across what should be uniform west/east boundaries.

Fixed with row-offset coordinates in `tools/mapgen/generate.ts`: each
row's q-range now starts at `rowQMin(r) = Q_MIN - floor(r/2)`, which
exactly cancels the shear term, so every row's west edge lands on the
same world-space x (within one natural half-hex stagger — confirmed by a
new sanity check computing per-row west-edge world-x drift, which came
back at exactly 0.866, i.e. √3/2, the theoretical half-hex value — not
approximately right, exactly right). All banding logic (coast/beach/
water-zone thresholds, confluence scoring) now keys off `colIndex(c)`
(position within its own row) rather than raw `q`, since raw `q` is no
longer comparable across rows once each row starts at a different offset.

Verified via `tests/mapgen.test.ts`'s new rectangle test (checks the
world-space drift claim programmatically) and visually via screenshots at
multiple zoom levels: a clean vertical Coast edge on the west side, and a
fully zoomed-out view with straight top/bottom map boundaries and no
wrap-around. Regenerated `map.json`/`startingState.json`; new estuary
center is `{q:3, r:0}`. Full 50/50 test suite passes.

### B2. Finish: the 8-element roster — House/Land is new, Resort's eligibility widens, Mangrove/Khazan gain a Food effect

Status: closed (see Log). All three pieces confirmed:
1. House — confirmed working correctly. Land tile shows House-only in its build menu; building it (from earlier rounds) applies effects correctly; clicking a built House tile shows a clean info card ("House / BUILDING / money +5 · food -1 · population +5"), not a build menu. Closed — see Log.
2. Beachside Resort's widened eligibility — confirmed working. This pass directly observed a River tile's popover offering "Beachside Resort 40c" alongside "Small Dam 55c", and separately an Estuary tile's popover offering "Beachside Resort 40c" alongside "Mangrove 30c" and "Khazan 65c (Bundh & Sluice)". Beach was not re-tested this pass (already covered by original roster) but River and Estuary are now both directly confirmed. Closed — see Log.
3. Mangrove/Khazan Food effect — initially unverifiable, blocked by A5's click-detection bug (not a real build-flow bug — see A5 for the full story). With A5 fixed, re-tested and confirmed: building Mangrove on a claimed Estuary tile correctly shows `food +1` on its re-click info card. Closed — see Log.

Fix: none needed beyond A5 itself — with the click-detection bug fixed,
re-testing confirmed Mangrove's Food effect was already correctly wired
in `elements.json` all along. Closed — see Log.

Verify: build Mangrove on an Estuary tile, confirm Coin -30, the tile
shows a Mangrove info card on re-click with `food +1` listed among its
effects. (Khazan not independently spot-checked this pass, but goes
through the identical code path — low risk.)

### B3. Add: Population/Food economy and the new starting state

Status: closed (see Log). Three pieces, all confirmed:
1. Food as a tracked resource — present in the HUD (`F -10` at game start, consistent with 10 pre-built Houses each costing food -1). Producer side (Mangrove/Khazan) confirmed end-to-end once A5's click-detection bug was fixed — see A5/B2.
2. Population as a tracked value — confirmed at game start: HUD shows `P 100`, which is exactly 50 (spec's starting Population) + 10×5 (10 pre-built Houses at population +5 each) = 100. The "population scales with House count" placeholder is working as intended. Closed — see Log.
3. Starting state — Coin confirmed at exactly 1,000 on a fresh load this pass, and the 10-House residential cluster on Land is present and visibly built (not something the player has to build). Closed — see Log.

## Bucket C — Step prompt: readability, Panaji/Taleigao map, river roster

Source: `STEP_PROMPT_visuals_map_river.md`, worked as a scoped addition
once Bucket A/B closed out. All three items independent of each other,
all closed this pass — see PROGRESS.md's "Step prompt" section for full
detail (root causes, exact numbers, screenshots).

### C1. Color theme & readability

Status: closed. Root cause was two-part: `palette.ts`'s base colors were
under-saturated, and `terrainMeshManager.ts`'s `dim()` function (a
"blend toward `fog`" approach) could never guarantee a real lightness
gap for a terrain already close to `fog`'s own brightness — exactly
Beach's problem, measured at 1 point of luminance apart pre-fix.
Rewrote `dim()` as a proportional lightness cut instead. Built
`tools/verify_readability.ts` (new, permanent — `npm run
verify:readability`) to read real rendered pixels off the live canvas
and assert the claimed/unclaimed luminance delta clears 30 points for
every buildable terrain — now passing with real margin (Beach 63.8,
Land 52.8, River 34.5, Estuary 31.1).

### C2. Regenerate the map: smaller, Panaji/Taleigao-shaped

Status: closed. Cut from 243 hexes (27×9) to 105 (15×7). The Land/water
boundary now bulges per-row (narrows near the estuary's own latitude,
widens away from it) so the plateau reads as curving around a wide,
rounded estuary mouth rather than a flat rectangle — the reference
schematic's most distinctive feature. New counts: coast 7, beach 14,
land 65, river 12, estuary 7. Sea-left/Beach/Land/Estuary-River-right
ordering independently re-verified per row, unchanged.

### C3. River roster: Small Dam + Sand Mining only

Status: closed. Beachside Resort's River eligibility (v2.4) reverted.
Small Dam gained `effects.money`/`effects.resilience` (both positive) —
re-framed as a flood-control structure; its `absorptionAtMaturity`/
`failureThreshold` fields (what `hazard.ts` actually reads) were already
strong and unchanged. Added Sand Mining (new element, new icon, new
palette color) as the purely-extractive option — its "resilience −"
framing is a real engine effect, not just a label: building it on a
river tile makes that tile stop being exempt from flood damage (an
untouched river tile is the flood's own source and takes none) while
providing almost no absorption in return. Verified live: River's
popover now offers exactly these two options; a new scripted test
confirms Small Dam now reduces downstream flood damage relative to an
undefended river tile.

## Bucket D — Step prompt: element icon redesign (all 9 elements)

Source: `STEP_PROMPT_icons.md`. Visual/geometry only — no
`elements.json` field moved (confirmed by the unchanged 53/53 test
suite). See PROGRESS.md's "element icon redesign" section for full
per-element detail and screenshots.

### D1. Replace all nine placeholder meshes with the designed ones

Status: closed. Every element rebuilt from real low-poly 3D primitives
(boxes, tapered prisms, cones, domes, thin angled blades — new
`src/render/primitives3d.ts`) with baked-in per-vertex color, replacing
the earlier flat-cutout-icon technique entirely. Found and fixed a real
bug along the way: `mergeGeometries()` silently fails when mixing
indexed (`Box`/`Cylinder`/`Sphere`) and non-indexed (`Extrude`)
geometries in one call — exactly what nearly every element does now —
fixed centrally in the shared color-baking helper.

Beachside Resort vs. House (the step prompt's explicit verify item) took
a second pass: the first live side-by-side check found the flat-roof/
window-grid cues read as a different *kind* of building but not
obviously *bigger*. Increased Resort's block height (0.62 → 0.95) and
rescaled its window grid to match; re-verified as unmistakable.

Flagged in PROGRESS.md per that document's own ask: Beachside Resort's
new mesh (388 triangles) is meaningfully heavier than what it replaced
(~7x its old ~56-triangle version) — the most detailed silhouette in the
roster, not a performance concern at this project's scale, but a real
increase worth naming. Every other element also grew 2-4x, an expected
consequence of real 3D volumes vs. thin flat cutouts.

## Bucket E — Step prompt: economy expansion, food pressure, estuary widening, Yacht

Source: `STEP_PROMPT_economy_food_yacht.md`. Explicitly ordered before
re-running `STEP_PROMPT_balance_tuning.md` — this pass changes the
roster and mechanics that harness plays against. See PROGRESS.md's
"economy expansion" section for full detail, numbers, and screenshots.

### E1. Mangrove earns Coin too; E2. Food pressure; E3. Estuary widening; E4. Yacht achievement

Status: all closed.
- **E1** — Mangrove gained `effects.money: 1` (was absent), Khazan bumped `1 -> 2`; all four money-generating elements (Sand Mining 14 > Resort 5 > Khazan 2 > Mangrove 1) now distinct. Placeholder magnitudes.
- **E2** — `GameState.advanceTurn()` drains Trust/Resilience every turn a Food deficit runs (placeholder factors 0.4/0.15), never blocking claims or builds. HUD Food chip warns in red-orange when `food < 0`, confirmed live from a fresh load's own starting deficit.
- **E3** — **Found already satisfied.** The step prompt's "exactly one Estuary tile" premise traced to a stale `tests/balance.test.ts` comment from before the Panaji/Taleigao mapgen reshape — the live map already has 7 Estuary tiles. Fixed the stale comment; no mapgen changes needed.
- **E4** — New `ElementKind` "cosmetic" for the Yacht (Coast-only, 750c placeholder cost, zero effects — confirmed via `meterTotal()`). New hull/mast/sail geometry (new `plan()` primitive for flat top-down-footprint shapes) and a persistent "always visible" HUD goal widget (dimmed/affordable/achieved states). Found and fixed two real bugs along the way: the sail was invisible at first (a 90° rotation put its flat face edge-on to the camera — only caught by actually looking at the render), and the popover's kind-label ternary printed "undefined" for the new cosmetic kind (fixed with a shared `kindLabel()` helper).

## Bucket F — Step prompt: map reshape (winding river, distributed Estuary) + Vegetation icon density

Source: `STEP_PROMPT_map_reshape_veg_icons.md`, drawn from
`khazan_map_reference_v2.png`. Explicitly supersedes Bucket E's E3 item
with a concrete spatial layout, plus an independent vegetation-geometry
density change. See PROGRESS.md's "map reshape... + Vegetation icon
density" section for full detail, exact numbers, and screenshots.

### F1. Winding River + distributed Estuary patches; F2. Vegetation density

Status: both closed.
- **F1** — `tools/mapgen/generate.ts`'s river carving rewritten from two arms meeting at one confluence (confined to an eastern "water zone" band) to a single path threaded through 8 explicit waypoints, winding across the *entire* interior width from just-past-Beach to the east edge. Estuary is now 8 tiles across 5 distinct connected components (was 1 blob of 7), strung along the river's bends rather than clustered at one mouth. The pre-built Houses cluster is reseeded to the Land tile that objectively maximizes distance from any River/Estuary tile (was "first Land tile on the starting claim's row," which no longer guarantees distance once the river winds across the whole map) — landed 2 hexes from the nearest water tile at every house. One real test invariant had to change, not just loosen: "Land always precedes Estuary/River in every row" is no longer true by design (the river can sit right after Beach on rows near its entry column) — replaced with what's still actually true (Coast-then-Beach ordering, River/Estuary never touching Coast/Beach columns, Estuary forming ≥3 components, the whole network staying one connected system, House-cluster distance-from-water). `tests/mapgen.test.ts` grew from 5 to 10 tests.
- **F2** — Mangrove and Sandy Vegetation both rebuilt as fused 3-plant stands (one full-size center + two smaller flanking instances, staggered so canopies/rosettes overlap into a continuous mass) instead of one sparse plant per tile. Geometry-only — `elements.json` untouched for both. New `scale()` primitive added (same pattern as existing `rotate()`/`move()`). Poly counts exactly triple (scaling/merging doesn't change triangle count): Sandy Vegetation 144→432, Mangrove 240→720 — flagged as meaningfully heavier, same convention as every prior pass, still trivial at this project's scale. Verified live for Sandy Vegetation (close-zoom in-game screenshot, unmistakable fused rosette); Mangrove verified by code review only (identical pattern, not independently screenshotted this pass — see PROGRESS.md's honest note on why, including a mid-session resource-usage lapse this file is flagging rather than hiding).

## Bucket G — Step prompt: remove the claiming step, Build advances the turn

Source: `STEP_PROMPT_remove_claiming.md`. Every tile is buildable from
turn one now; `build()` (not a separate `claim()`, which is deleted) is
the sole action that advances a turn. See PROGRESS.md's "remove the
claiming step" section for full detail, numbers, and screenshots.

### G1. Remove claim() from GameState, move turn-advance to build(); G2. Update UI/dev hooks; G3. Fix the balance-tuning harness

Status: all closed.
- **G1** — `claim()`/`isClaimable()`/`canClaim()`/`CLAIM_COST` removed. `claimed` stays as a real field but is now always exactly `placed` (initialized fully in the constructor and `startNewEra()`), per the step prompt's own "minimal, low-risk" guidance — everything that already read it keeps working unchanged. Went one step further than "minimal" in one place: dropped the now-inert `startingClaim` constructor parameter entirely (every call site needed touching anyway or could drop it with zero behavior change) rather than leave it silently ignored. `build()` now calls `advanceTurn()` right after placing the element — a just-built element already counts toward that same turn's income.
- **G2** — Click any tile → build popover directly, no claim step/ring/cost. Deleted `ClaimRingMeshManager` entirely (file, import, every call site) and the `pointermove` listener that only existed for it. HUD's claim prompt is now `setEmptyTiles`/`emptyTileCount` ("N hexes still empty"). Deliberately left the top-right "Tiles claimed: 105" counter's wording alone per the step prompt's own explicit example of what not to rip out — it's now a constant (the fixed map size), flagged in PROGRESS.md alongside the analogous `scoring.ts` note. `?autoclaim`/`devAutoClaim` removed (nothing left for them to do).
- **G3** — `tests/balance.test.ts`'s scripted harness rewritten: each turn now picks an empty tile offering an affordable, category-preferred option and builds it, with `build()` alone carrying the turn forward. Real, named behavior change: a category that exhausts its preferred-buildable land (e.g. `hybrid`/Khazan, capped by Estuary's 8 tiles) now stops early and can draw zero hazards in a run — weakens that category's hazard-resilience coverage specifically, flagged as a known gap for `STEP_PROMPT_balance_tuning.md`'s fuller pass rather than silently shipped. All existing assertions still pass against the new numbers. Retired `tools/verify_readability.ts` (`npm run verify:readability` removed) — its claimed-vs-unclaimed-contrast premise no longer exists once every tile renders full-bright from boot.

## Bucket H — Step prompt: hazard mechanics, rooted in real coastal science

Source: `STEP_PROMPT_hazard_science.md`, using `khazan_hazard_prototype.
html` as a technique reference (not shipped as-is). Still exactly two
hazards (Section 0.1). See PROGRESS.md's "hazard mechanics" section for
full detail, exact numbers, and screenshots.

### H1. River-channel funneling; H2. Flood redefined two-sided + compound merging; H3. Khazan reservoir; H4. Compound trigger scheduling; H5. Three animations

Status: all closed.
- **H1** — `hazard.ts`'s shared BFS engine gained a `decayFor()` hook: both hazards now use a shallower `RIVER_CHANNEL_DECAY` (0.82) for River-to-River hops specifically, vs. each hazard's own general decay everywhere else. Fixed one real `elements.json` mismatch found while auditing the confirmed defense roster: Khazan still targeted Storm Surge Wave from an earlier pass — trimmed to Flood-only.
- **H2** — `resolveMonsoonFlood` now sources from the River tile(s) farthest along the actual channel from the Estuary (upstream, always) plus the tile(s) nearest the Estuary (downstream/tidal, only when a Storm Surge Wave is concurrently active) — found via a small BFS restricted to River/Estuary tiles, not raw coordinates (unreliable across the row-offset grid / winding river shape). Compound overlap: each front resolves independently, then damage sums at shared tiles (capped) — a deliberate, documented simplification (see PROGRESS.md) rather than a single interleaved multi-front BFS. A map with no Estuary tile falls back to the old "every River tile is a source" behavior, which is why the entire pre-existing hazard/cyclone/balance/era test suite kept passing unmodified.
- **H3** — New `floodBufferCapacityM3`/`floodBufferFilled` fields: a Khazan draws down a literal reservoir before any percentage-absorption math applies to the overflow, recovering 15%/turn. Two existing Khazan tests, built around the old pure-percentage model, were obsoleted and rewritten around the new mechanic.
- **H4** — `triggerFlood` now checks whether a Storm Surge Wave is genuinely concurrent (telegraphing or resolved within the last 2 turns) before adding Flood's downstream source, not just relying on the two independent schedules happening to land close together.
- **H5** — Storm-surge/river-flood sweeps are now staggered by a new `arrivalRound` field on `HazardResult`, matching the real hop-by-hop BFS resolution instead of popping in all at once. `HazardOverlayManager` consolidated into one coordinate-keyed instance so it can detect a genuine cross-hazard overlap and blend to a third compound color. New `CloudLayerManager` drifts low-poly cloud puffs during either hazard's telegraph window.

A hand-edited `map.json` (145 tiles, `"handEdited": true`) was discovered mid-pass, external to this work — left untouched, with `mapgen.test.ts`'s 6 procedural-generation-specific assertions gated behind `it.skipIf(MAP.handEdited)` rather than reverting someone else's in-progress work.

## Bucket I — Step prompt: hazard-strength test sliders

Source: `STEP_PROMPT_hazard_test_sliders.md`. A testing/tuning aid — manually
trigger a Storm Surge Wave or Flood at a chosen severity, calling straight
into the existing `triggerCyclone`/`triggerFlood`, not a parallel path. See
PROGRESS.md's "hazard-strength test sliders" section for full detail and
screenshots.

### I1. Two color-coded sliders + trigger buttons, collapsible panel

Status: closed. New `src/ui/hazardTestPanel.ts` (`HazardTestPanel`):
0-3 range/0.1 step, default 1.0, live readout on `input`, "Trigger now"
calling `triggerCyclone`/`triggerFlood` with the slider's value at click
time — so a manual trigger clears the telegraph, updates clouds, resets
the schedule, plays the resolve sound, and checks era-end exactly like a
scheduled hazard. Confirmed live that this also correctly exercises the
compound-flooding path on demand (Storm Surge then Flood within the
compound window) — closing a verification gap the hazard-science pass
itself had flagged (no live screenshot of the true cross-hazard compound
color blend; now confirmed live, screenshotted). Color-coded via left-
border accents (Storm Surge `PALETTE.riverBlue`, Flood
`PALETTE.defenseKhazanBund`, no new tokens). Collapsible, closed on load,
bottom-left tab — the step prompt's own fallback default pending the
separate HUD-layout decision. Caught and fixed one real bug before it
shipped: the schedule readout needs `let` bindings not yet initialized at
`main.ts`'s very first `refreshHud()` call — folding it into `refreshHud`
would have thrown; kept it as its own function instead. Not gated behind
a build flag/URL param this pass, per explicit instruction — flagged for
a later `?debug` param once the game is shared outside the team.

## Bucket J — Step prompt: hazard mechanics fixes + HUD v3 (Instrument Cluster)

Sources: `STEP_PROMPT_hazard_mechanics_fixes.md` and `STEP_PROMPT_
hud_instrument_cluster.md`. See PROGRESS.md's own two sections for full
detail and screenshots. `STEP_PROMPT_hazard_test_sliders.md` is
superseded — the panel it asked for was already built in Bucket I.

### J1. Flood-defense id mismatch; J2. test-trigger era-reset; J3. test panel visibility gate

Status: J1 investigated and found already fixed (not a live bug); J2/J3 closed.
- **J1** — the step prompt claimed `elements.json` still used `"monsoon_flood"` against `hazard.ts`'s `"flood"` id. Checked directly before touching anything: all four `targetsHazards` entries already said `"flood"`, fixed in the hazard-science pass (`d5772b8`). The step prompt's deployed-bundle test was evidently against a stale Vercel build, not this repo. No code change; flagged plainly rather than "fixing" something already correct.
- **J2** — `triggerFlood()`/`triggerCyclone()` gained an optional `{ skipEraCheck?: boolean }` — the Test Hazards panel and `?flood=`/`?cyclone=` pass `true`; the two real call sites (scheduled firing, post-build check) never do, so a genuinely-scheduled hazard still ends an era exactly as before. Verified live: driving Resilience deeply negative via `?resilienceboost` then test-firing Flood left the map, tile count, and Yacht widget all unchanged — no reset.
- **J3** — the Test Hazards panel now only constructs behind `?debughazards`, matching `devAutoBuild`/`?coinboost`'s existing "no visible affordance" convention. `hazardTestPanel` is `HazardTestPanel | null` everywhere it's used.

### J4. Resilience-only HUD gauge; J5. hazard-incoming readout on the main card

Status: both closed.
- **J4** — Trust dropped from `hud.ts`'s display only (`gameState.ts`'s `trust` field and everything else that reads it, e.g. `scoring.ts`, untouched — confirmed via `grep`). Resilience promoted to a labeled gauge bar; fill clamped to `[0,100]` visually even though the raw number can exceed that range; shifts to the Food-chip's warning color once Resilience `<= 25` (a small addition beyond the letter of the ask, in the spirit of "a real gauge").
- **J5** — new `hazardIncomingInfo()` in `main.ts` reads the same schedule numbers the terrain-tint telegraph already computes (no new state); shows one neutral "closer hazard" line normally, or every imminent hazard's own urgent line simultaneously once any is genuinely imminent — a compound event shows both, never collapsed to one. Required moving `refreshHud()`'s first call past the point where `nextCycloneAtTurn`/`nextFloodAtTurn` are declared (previously a temporal-dead-zone trap waiting to happen for exactly this kind of addition) — fixed at the root instead of adding another parallel workaround function.

## Bucket K — Step prompt: remove auto-scheduled hazards, confirm & harden defense shadowing

Source: `STEP_PROMPT_remove_schedule_confirm_shadowing.md`. See PROGRESS.md's
own section for full detail, including the exact before/after damage numbers.

### K1. Remove the turn-based auto-trigger and its telegraph systems

Status: closed. Hazards no longer fire (or telegraph) on their own — the
Test Hazards panel (`?debughazards`) is the only way one happens now.
`checkHazardSchedule()`, the terrain-tint telegraphs, the schedule-driven
cloud layer, and the spinning storm icon are all removed. `hazardIncomingInfo()`/
`Hud.setHazardIncoming()`/CSS/`nextFloodAtTurn`/`nextCycloneAtTurn` were
deliberately left intact but unwired, per the step prompt's own instruction,
for a cheap re-enable once a real trigger design exists. **Known gap,
flagged plainly:** real players currently have no way to experience a hazard
at all — the trigger panel is dev-gated and the schedule is gone. Fine for
this mechanics-testing phase, not fine to ship silently.

### K2. Confirm and harden defense shadowing

Status: closed. Added three dev-only test hooks (`__buildForTest`,
`__triggerHazardForTest`, `__lastHazardResultForTest`) to drive a precise
live verification. Confirmed with real numbers that a defense's absorption
reduces both its own tile's damage and what it relays onward (e.g. Mangrove
cut a flanking tile from `0.72` to `0.324`, and the tile one hop further in
dropped in lockstep) — the mechanic itself is correct and working exactly as
designed, no changes made to the propagation math. But on this real,
hand-edited map, a single Beach column or single Estuary tile isn't a fully
enclosing perimeter — the Estuary sits close enough to offer Storm Surge an
unguarded second front through ordinary Land (which has zero absorption for
a hazard it isn't defended against), so a "one column, one saved pocket"
demo doesn't read cleanly here without also defending that flank. Worth
carrying into future balance-tuning or tutorial-design work on this
mechanic — not a bug, but a real property of this map's geometry.

## Bucket L — Step prompt: gameplay stability pass (hanging, map reset, leftover Bug 1)

Source: `STEP_PROMPT_gameplay_stability_test.md`. See PROGRESS.md's own
section for full detail, including the exact live-repro numbers.

### L1. Leftover Bug 1 (elements.json monsoon_flood → flood)

Status: re-confirmed already fixed, not a local bug. Zero `monsoon_flood`
occurrences anywhere in `src/`; the fix (`d5772b8`) has been on
`origin/master` well before this pass. The step prompt's live test was
against the deployed Vercel build, which appears stale — worth checking
the Vercel dashboard directly, not something a repo-level check can fix.

### L2. "Hanging" — root cause found and fixed

Status: closed. `HazardOverlayManager`/`ElementMeshManager` both used a
strictly-increasing per-type instance-index counter that `destroy()`/an
overlay's own expiry never gave back. Live-reproduced the `ElementMeshManager`
case directly: 200 build/destroy cycles of Seawall on one tile, then an
uncaught `Error: Element instance cap exceeded` on the 201st — thrown from
inside the build popover's click handler, aborting it *before* `this.hide()`
runs, leaving the modal backdrop stuck open and every further click dead.
That's the "hanging" symptom. Fixed by having both managers draw a freed
index from a pool before growing their counter; `HazardOverlayManager` also
gained a generation guard so a stale pending collapse from just before an
era reset can't double-free an index a new era's overlay is already using.
Re-verified live: 205/205 cycles now succeed with zero throws. The other two
hypotheses (cross-era Three.js leak; `devAutoBuild` at scale) were checked
with real profiler data (Long Tasks API, JS heap sampling) and did not
reproduce as player-facing issues — see PROGRESS.md for the numbers.

### L3. "Map getting reset"

Status: closed — confirmed as the intended soft era-loop, not a bug.
Audited every call site of `state.startNewEra()` (exactly one, always
guarded by `isEraOver`) and the build popover for double-fire risk (none
found). Found and fixed one real inconsistency: `?resilienceboost` didn't
clamp at 0 like every other resilience-modifying path, so a large negative
dev-only boost showed a negative Resilience number in the HUD instead of 0
— cosmetic, no real player reachable, fixed to match the same invariant
everywhere else. Noted as a UX follow-up (not fixed this pass): the 3.5s
era-end banner is easy to miss, which can make a correctly-firing mechanic
feel like unexplained data loss.

## Bucket M — Step prompt: Small Dam gets a real reservoir (hydrodynamic correction)

Source: `STEP_PROMPT_small_dam_reservoir.md`. See PROGRESS.md's own section
for full detail, including the live-verification numbers.

Status: closed. Small Dam now uses the same storage-and-release reservoir
model Khazan already has (`floodBufferCapacityM3: 800`, placeholder, ~half
of Khazan's 1500) instead of the instantaneous-percentage-plus-breach model
it wrongly shared with Seawall. `resolveHazardWave()`'s branch order in
`hazard.ts` restructured so the buffer draws down first for any qualifying
defense, with the engineered catastrophic-breach test moved inside that
branch and now evaluated against the post-buffer overflow severity, not the
raw incoming one — a breach now releases what actually overtopped the dam.
Confirmed Khazan and Seawall byte-for-byte unchanged (neither's own branch
condition changed; their existing tests all passed with zero modification).
Live-verified on the real map: Flood 1.0x left the dam's own tile at 0.072
damage with its buffer filled to capacity (800); Flood 3.0x immediately
after (buffer not recovered) breached it, damage 2.46, computed from the
overflow severity. Two tests needed updating (not reverting) as a real,
expected consequence: `hazard.test.ts`'s two Small-Dam numeric assertions
now match the reservoir-first formula; `balance.test.ts`'s "engineered never
strictly ahead" invariant got a documented 10-point tolerance since Small
Dam legitimately avoids catastrophic failure more often now — flagged for
`STEP_PROMPT_balance_tuning.md`, not hand-tuned away. `floodBufferCapacityM3`
(800) and the now-overflow-gated `failureThreshold` (1.15, same number,
different effective trigger rate) both flagged for that same future pass.
`tsc --noEmit` clean, 58/58 tests + 6 `skipIf`-gated unchanged, production
build succeeds.

## Bucket N — Step prompt: manual-only mode (no auto era-end, no auto board reset, no turn-based drift)

Source: `STEP_PROMPT_manual_only_mode.md`. See PROGRESS.md's own section
for full detail, including the live-verification numbers and the one
honest verification gap (Remove button not pixel-screenshotted this pass).

Status: closed. A design change, not a bug fix — state now only changes in
response to an explicit action (build, remove, trigger a hazard, hit Reset
Board), nothing in the background anymore. `checkEraEnd()` repurposed into
`resetBoard()` (no `isEraOver` guard — always runs when called), no longer
auto-called from anywhere; `skipEraCheck` plumbing removed everywhere it
appeared since it's now permanently the only behavior. New "Reset Board"
button on the `?debughazards` Test Hazards panel (confirm-gated, since
destructive). New "Remove" button on the tile-info popover (not dev-gated —
a normal player control), wired to a new `removeElement()` that
`__destroyForTest` now calls into instead of duplicating. `GameState.
advanceTurn()` stripped to just the turn counter — income, maintenance/
neglect degrade, Food-deficit Trust/Resilience drain, and flood-buffer
recovery are all gone; Food itself is unchanged (still a pure live
`meterTotal()` read, can still go negative, just with no automatic
consequence anymore). Live-verified: a guaranteed Food deficit across 6
builds left Resilience untouched at 100; two severity-5.0 Storm Surges
cratered Resilience to 0 with the board fully intact (no auto-reset); Reset
Board then restored it to 100 from that 0, confirming it works regardless
of current Resilience; a Small Dam's `floodBufferFilled` stayed at 800
across 5 more builds with nothing else triggered. Four tests across 3 files
updated (not reverted) to match the new, correct behavior — see PROGRESS.md
for exactly which and why. `tsc --noEmit` clean, 58/58 tests + 6
`skipIf`-gated unchanged, production build succeeds.

## Bucket O — Step prompt: code review & cleanup pass

Source: `STEP_PROMPT_code_review_cleanup.md`. A hygiene pass — see
PROGRESS.md's own section for full detail on what was checked and why.

Status: closed, with two open questions handed back to the user (Section
4's "ask before acting" items) rather than decided unilaterally.

- **Section 1 (line-ending drift)**: the specific reported diff didn't
  reproduce in this session (`core.autocrlf=true` at the Git-for-Windows
  system-config level was already normalizing everything transparently) —
  reported honestly, not silently dropped. Added `.gitattributes` anyway
  as real protective value regardless of any given environment's autocrlf
  setting. Isolated commit, first, per instruction.
- **Section 2 (dead code)**: the three already-flagged inert constants
  re-checked, still accurate, not touched. Found and fixed six stale
  comments describing automatic behavior Manual-Only Mode already
  removed, plus one genuinely dead CSS rule (`.build-popover[hidden]`,
  superseded once hiding moved to the backdrop element) — confirmed dead
  via exhaustive grep before removing. New finding, flagged not fixed:
  `maintenanceCostPerTurn`/`maintenanceNeglectPenaltyPerTurn` are still
  in `elements.json`/`core/elements.ts` but read by zero code — touching
  `elements.json` was out of scope for this pass.
- **Section 3 (tests)**: `era.test.ts`/`cyclone.test.ts` read fresh, both
  genuinely needed no changes (confirms the step prompt's own
  prediction). The 6 `skipIf`-gated tests re-confirmed still gated for
  the live reason (`MAP.handEdited === true`). **Closed the Remove-button
  screenshot gap** flagged in Bucket N — a real headless click-through
  with before/during/after screenshots confirms it works end to end
  (popover shows correctly, Remove closes it, tile count/Population/Food
  all update, tile is buildable again).
- **Section 4 (housekeeping)**: findings only, no unilateral action.
  `tools/screenshots/`: 12 of 54 PNGs aren't linked from any doc (listed
  in PROGRESS.md), mostly companion shots of ones that are — not deleted,
  handed back as a tally. `_archive_v1_panjim_digital_twin/` shows no
  modified files (same non-reproduction as Section 1) — its fate (keep as
  history vs. move out) is the user's call. Step-prompt file organization
  (15 files at repo root) and adding a linter are both noted as questions
  worth raising, not acted on.

`tsc --noEmit` clean, 58/58 tests + 6 `skipIf`-gated unchanged (no test
file needed changing), production build succeeds. Three isolated commits.

## Bucket P — Step prompt: scheduled pacing loop, wave spectacle, hazard preview

Source: `STEP_PROMPT_pacing_telegraph_preview.md`. Reactivates the
scheduled/telegraphed hazard loop (removed by Bucket K) as the game's
real pacing mechanism, permanently alongside the `?debughazards` manual
trigger — confirmed with the project owner that Manual-Only Mode
(Bucket N) was a testing-phase choice, not the shipped design. Full
detail (the two corrected false premises, the polish list's done/
deferred split, live-verification results) in PROGRESS.md.

Status: closed. One open item, flagged rather than fixed:

- **Camera pull-back during the wave sweep** (Section 2's polish item 2)
  deferred — real risk of fighting player camera control, worth a
  dedicated pass with its own verification rather than a rushed add-on.

Landed first as two commits (Sections 1+2 combined, since `src/main.ts`'s
`triggerFlood`/`triggerCyclone` genuinely interleave the two), then
re-split into the literal three the guardrail asked for once asked again
explicitly — safe since nothing had been pushed. See PROGRESS.md for how.

`tsc --noEmit` clean, 58 baseline + 4 new (`tests/preview.test.ts`) = 62
passing, 6 `skipIf`-gated unchanged, production build succeeds. Three
commits (`f70df16`, `2392b81`, `f09ff5d`). No hazard math/decay/`elements.json`
balance changes.

## Bucket Q — Step prompt: balance tuning (simulation-backed findings)

Source: `STEP_PROMPT_balance_tuning_findings.md`. Five independent
changes from a standalone bot simulation against this repo's real
`GameState`/hazard resolvers. Full detail (both decisions' reasoning,
the live-play results, the harness numbers) in PROGRESS.md.

Status: closed. Two decision points, both resolved with a one-line
rationale rather than left open:

- **Section 3 (Coast permanently undefendable)**: Option B — added a
  real `breakwater` defense element, closing the content gap rather
  than declaring it intentional.
- **Section 4 (is Coin a real constraint?)**: Option A — left it.
  Section 1's pacing retune is the real difficulty lever; re-running
  the new harness confirms Coin still isn't binding at the new numbers,
  not just the old ones, and Option B's own guardrail requires
  re-verifying via a harness that hadn't been ported yet at that point
  in the section order.

One flagged-not-fixed finding from live-playing Section 1's retune:
consecutive builds inside the ~450ms hazard-arrival-beat window can
each queue their own resolution of the same hazard — not reachable by
a real player's click cadence, but worth a look if the pacing/telegraph
trigger-timing logic is ever revisited (out of scope for this pass by
its own guardrail).

`tsc --noEmit` clean at every commit, 65/71 tests passing (2 new,
6 `skipIf`-gated unchanged), production build succeeds. Five commits
(`18aaec6`, `67a20d4`, `2b32339`, no-code-change for Section 4,
`806d154`). No `RESILIENCE_DAMAGE_FACTOR`/`CATASTROPHIC_TRUST_PENALTY`/
`WEATHERED_TRUST_BONUS` changes — not implicated by this pass's own
findings.

## Bucket R — Step prompt: Western Ghats backdrop + Storm Surge wave-front spectacle

Source: `STEP_PROMPT_ghats_wave_demo.md`. Full detail (the Section-0
premise check, both live-verified bugs found and fixed) in PROGRESS.md.

Status: closed. Two deferred/flagged items, neither required by the
step prompt's own guardrails:

- **Test Hazards panel's Flood readout stays frozen** at "next
  scheduled in 45 turns" rather than being visually flagged as
  disabled — the step prompt's own explicit "reasonable, not required"
  allowance.
- **Pacing consequence of Flood being off**: `STEP_PROMPT_balance_
  tuning_findings.md`'s Section 1 numbers were tuned assuming both
  hazards compounding — actual difficulty with only Storm Surge active
  is likely gentler. Not re-tuned, per this pass's own explicit
  instruction not to.

Two commits: `8b1eb06` (disable scheduled Flood via a new
`FLOOD_HAZARD_ENABLED` flag in `main.ts`, next to
`FLOOD_INTERVAL_TURNS` + the Western Ghats decorative backdrop, new
`GhatsBackdropManager`), `c04752a` (the wave-front demo itself, new
`WaveFrontManager` — an expanding open-water ring plus a river-channel
push, both driven by real `arrivalRound` data, no new hazard-resolution
logic needed since `resolveCyclone()` already computes both). Both
commits found and fixed a real bug live, not a design gap — see
PROGRESS.md.

`tsc --noEmit` clean at both commits, 65/71 tests unchanged (no
hazard-resolution logic touched), production build succeeds. No
`map.json`/hazard-math/telegraph-system changes.

## Follow-up — new hand-authored map + remove starting Houses

User-supplied a replacement `map.json` (198 tiles) directly and asked
to incorporate the Western Ghats and remove all Houses from the map.
Full detail in PROGRESS.md.

Status: closed. One deferred item: the Ghats backdrop against the new
map shape wasn't visually screenshotted this pass (Browser pane wasn't
displayed this session) — verified via data/render-liveness checks
instead (tile occupancy, HUD numbers, canvas alive). The backdrop's own
logic is unchanged from the prior pass that did screenshot it — worth a
quick visual spot-check next time the pane's available, not expected to
reveal anything new.

`tsc --noEmit` clean, all 65 tests pass unmodified against the new map,
production build succeeds.

## Follow-up — HUD collapse/expand toggle (Section 4)

The step prompt was updated after the first three-commit pass shipped
and pushed: a new Section 4 (mobile HUD collapse/expand toggle),
Orientation renumbered to Section 5, Guardrails bumped to four
commits. Full detail in PROGRESS.md.

Status: closed. One real bug found and fixed during verification (the
collapsible cluster rows' "expanded" `max-height` of 100px was
actually smaller than their real content at the bumped mobile font
size, silently clipping the last meter chip even when nothing was
collapsed — bumped to a generous 220px). One honest testing-
environment wrinkle, not a code gap: this session's Browser pane tab
reports `document.hidden`, which appears to pause CSS transitions
outright — worked around by temporarily disabling transitions to
confirm every element's correct end-state value directly.

`tsc --noEmit` clean, 65/71 tests passing (unchanged), production
build succeeds.

## Follow-up — Status Pill overflow hotfix + slider/resort/damage pass

Two step prompts run back to back: `STEP_PROMPT_hud_pill_overflow_fix.md`
(a one-line CSS hotfix) and `STEP_PROMPT_test_slider_resort_damage.md`
(three independent sections, flagged as not-yet-run by the hotfix
prompt itself). Full detail in PROGRESS.md.

Status: both closed. Hotfix: `.cluster-pill` never set its own
`display`, so it rendered unconditionally (stacked, not as a row) on
any normal desktop window — fixed with one `display: none;` on the
base rule. Slider/resort/damage: Section 1 halved the Test Hazards
panel's actual severity per slider position and capped the max at
`2.0` (verified byte-for-byte identical to a direct call at the
converted value); Section 2 removed the palm tree from Beachside
Resort's icon (and the now-dead `palmGeometry()` with it); Section 3
gave House/Resort a real visual consequence for Storm Surge damage —
a tint reusing the existing degrade-visual blend math, verified
against real rendered pixel colors (not just the data model) for both
the damaged/undamaged split and a same-hazard defense control.

`tsc --noEmit` clean throughout, 65/71 tests unchanged, production
build succeeds. Four commits total (one hotfix + three sections).

## Follow-up — Knowledge Nugget popup + two HUD corner changes

`STEP_PROMPT_knowledge_nuggets.md`: Part A (delete the Yacht goal box),
Part B (move Test Hazards tab/panel to bottom-right), Part C (the
"Discovery Badge" knowledge nugget popup, bottom-left). Every line/color
reference the step prompt cited checked against the actual code first —
all matched exactly, nothing to flag back. Full detail in PROGRESS.md.

Status: closed. Four commits (A, B, then C split into data/component+
styles/wiring). Two real bugs found and fixed during Part C's wiring,
not shipped silently: `.nugget-badge` was missing `box-sizing:
border-box` (rendered ~30px wider than its own `min(280px, 92vw)`
intended, the same trap `.era-end-card`'s own mobile rule already
guards against); and even after that fix, the badge and `.empty-prompt`
(bottom-center) measurably overlapped at every required mobile
breakpoint — fixed by suppressing `.empty-prompt` for exactly as long
as the badge shows, via a `NuggetPopup` constructor callback not in the
step prompt's own sketch (added because that sketch couldn't have
anticipated a bug only visible once the real component existed).
Live-verified end to end: a real build via a real tile click (not the
`__buildForTest` bypass) fired the badge with a real fact, correct
tint, and correct progress count; the pick-order logic (no immediate
repeat, reshuffle-without-repeating-the-seam, 4th+ builds reuse
cleanly, progress only advances on genuinely new facts) exercised
directly via a new `__nuggetPopupForTest` hook; all four required
breakpoints re-verified clean after the two-bug fix, zero console
errors.

`tsc --noEmit` clean, 65/71 tests unchanged (no hazard math, no
`elements.json` values touched), production build succeeds.

## Follow-up — QA Gauntlet (self-looping UI/UX/gameplay pass)

`STEP_PROMPT_qa_gauntlet.md`: backlog check confirmed both prior fixes
(pill overflow, slider/resort/damage) already landed; looped Sections
1-3 (UI rendering, UX behavior, gameplay mechanics) against the live
dev server via real Playwright automation until a full pass found
nothing new. Full detail in PROGRESS.md, including an independently-run
second confirmation pass that landed on the same findings without
reading the first.

Status: closed. One real bug found and fixed: `.era-banner` (the
aftermath banner, e.g. "Storm Surge resolved · Resilience -12 · Trust
-9") had `white-space: nowrap` with no width limit — fine for the
short "Board reset." message it was originally sized for, but the
much longer real hazard-resolution text overflowed both edges of the
viewport on every phone-class breakpoint once centered via `left:50%;
transform:translateX(-50%)`. Fixed with `max-width:calc(100vw - 24px)`
+ `white-space:normal` + `text-align:center` — wraps instead of
overflowing, unchanged for short messages. One item flagged as a
genuine design judgment call, not fixed: `BuildPopover`'s deliberately
transparent backdrop can let it visually overlap `.instrument-cluster`
at narrow widths, with a faint text bleed-through from the app's own
consistent translucent-card language — cosmetic, not overflow/
illegibility, so left for a product decision rather than guessed at.
Confirmed the Test Hazards panel's post-rescale severity cap (max 1.0)
sits below every engineered defense's `failureThreshold` (1.15-1.25),
so breach behavior is no longer directly demonstrable through the
panel UI alone (though the breach mechanic itself is confirmed intact
via a direct trigger) — flagged back, not silently reverted, since the
rescale was itself a deliberate prior decision.

`tsc --noEmit` clean, 65/71 tests unchanged (CSS-only fix), production
build succeeds. One commit.

## Follow-up — Section 4 rebuild: "Status Pill"

The step prompt's Section 4 was rewritten a second time with a fully
specified design (chosen from a signed-off 4-option mockup), replacing
the previous pass's bottom-left circular toggle. Full detail in
PROGRESS.md.

Status: closed. One commit (`7cc874d`). No bugs shipped this pass —
one design tradeoff (nested pill-in-card vs. the card itself reshaping
into the pill) was resolved during the CSS design itself, not caught
as a live regression afterward. Live-verified the collapsed pill's
coin/resilience/hazard values track the expanded view exactly
(including the resilience dot flipping to the critical color in
lockstep with the real gauge during an actual triggered hazard) at
all four required breakpoints plus the tightest landscape case, and
re-confirmed the guardrail (BuildPopover/build-while-collapsed
unaffected) and desktop-untouched.

`tsc --noEmit` clean, 65/71 tests unchanged, production build
succeeds.

## Follow-up — mobile browser responsiveness

`STEP_PROMPT_mobile_responsive.md` executed in full, three commits per
its own Guardrails split. Full detail in PROGRESS.md.

Status: closed. One real bug found and fixed during landscape
verification (EraEndScreen clipping/unreachable on a short-height
viewport like 667×375 — fixed with a scoped `max-height:500px` query,
not a base-rule change, after a first attempt accidentally shrank the
card's desktop width and was caught and corrected). One honest
tooling caveat, not a code gap: this session's browser-automation
tool doesn't emulate a coarse/touch pointer at custom widths ≥768px,
so the `pointer: coarse` half of Commit 3's tap-target rule couldn't
be exercised live at the two wider landscape sizes (844×390, 915×412)
— worth a real-device spot-check there.

`tsc --noEmit` clean, 65/71 tests passing (unchanged), production
build succeeds.

## Follow-up — How to Play button, rewritten (in-game dialog)

`STEP_PROMPT_how_to_play_button.md` was rewritten to replace the
external-tab version from the prior pass — `window.open()` was the
wrong call for a game, no return path, no visual continuity. Every
code citation (EraEndScreen's backdrop/card/`hidden` mechanics,
BuildPopover's click-outside-to-close listener, the prior `window.open`
implementation, `.help-button`'s existing CSS) checked against the
actual code first — all matched exactly, nothing to flag back. Full
detail in PROGRESS.md.

Status: closed. `window.open()` and the hardcoded manual URL removed
completely from `hud.ts` (confirmed via a full `src/` grep — no
external link anywhere in the feature). New `HelpModal`
(`src/ui/helpModal.ts`) combines the EraEndScreen backdrop/card
pattern with BuildPopover's click-outside-to-close behavior; content
embedded as real DOM markup, copied verbatim from the step prompt.
Zero game-state coupling, so `Hud` owns the instance directly — no
`main.ts` changes needed. Live-verified end to end via real Playwright:
"?" opens the dialog dimmed with no navigation/popup; × closes it with
no side effects on the game underneath; clicking the backdrop outside
the card closes it; clicking inside the card does not (the negative
case); internal scroll confirmed via computed `overflow-y`/scrollHeight
vs clientHeight; 375×667 renders a genuine full-width/full-height
sheet with `border-radius: 0`. Screenshots taken at both sizes.

`tsc --noEmit` clean, 65/71 tests unchanged (no hazard/balance/data-
model code touched), production build succeeds.

## Follow-up — Welcome dialog (Laterite Earth)

`STEP_PROMPT_welcome_dialog.md`: a title-moment dialog shown on every
load, before the player touches anything — "Root & Ruin," approved
copy, a pointer to the "?" help button, "IKUZO!" to dismiss. Every
citation (EraEndScreen/HelpModal's backdrop-card-`hidden` mechanics,
BuildPopover's click-outside-to-close listener, `index.html`'s lack of
any prior font-loading convention) checked against the actual code
first — all matched exactly, nothing to flag back. Full detail in
PROGRESS.md.

Status: closed. New `WelcomeModal` (`src/ui/welcomeModal.ts`) reuses
the EraEndScreen/HelpModal backdrop-card pattern and BuildPopover's
click-outside-to-close behavior without touching either file; content
copied verbatim. Deliberately its own rust-red "laterite" palette, not
the green/cream card language elsewhere — new CSS scoped entirely to
`.welcome-*` selectors in `hud.css`. One new font ("Fraunces," title
only) added via a Google Fonts `<link>` in `index.html`'s `<head>`,
since no existing font-loading convention was in place to match. Shows
every load, no localStorage/dismissal-memory logic, per the doc's own
default. Live-verified end to end via real Playwright: fresh load
shows the dialog centered over the fully-built game (not a blank
screen behind it); IKUZO, the corner ×, and an outside-the-card
backdrop click all close it; a click inside the card does not; the
font check went past "looks serif-ish" — computed `font-family`,
an actual `fonts.gstatic.com` woff2 fetch, and `document.fonts`
reporting `"Fraunces 700 loaded"` all confirmed; at 375×667 the corner
× sits fully inside the viewport per the mobile media query and is
genuinely clickable there, not just positioned correctly on paper.

`tsc --noEmit` clean, 65/71 tests unchanged (no hazard/balance/data-
model code touched), production build succeeds.

## Follow-up — Icon legibility pass (Breakwater / Sand Mining / Khazan)

`STEP_PROMPT_icon_legibility_pass.md` (moved here from an untracked
`Claude outputs/` folder to match every other step prompt's location):
a geometry-only refinement of the three weakest results from the
original icon redesign. Pre-verified code from a separate sandbox was
applied directly per the doc's own instruction, plus an addendum
(previously only in the pasted code's comments, now folded into the
`.md` itself) explaining two color corrections found necessary once
actually rendered. Full detail in PROGRESS.md.

Status: closed, with one flagged-and-accepted limitation. Breakwater
(no more continuous `crest` bar, 7 rocks in two staggered rows, full
3-axis tilt) and Sand Mining (wider tier gaps, dredge arm/scoop scaled
~1.7x with a lightness-contrast recolor) both confirmed live —
side-by-side screenshots against Seawall and Dune respectively show
them tellable apart from silhouette alone, pixel-sampled to confirm
the color contrast is real, not assumed. Khazan's height fix
(`frontBund`/`gate` lowered so the interior isn't hidden behind two
wall-height near-camera shapes) also confirmed live. Khazan's *color*
fix did not hold up under its own verification claim, though: the
addendum's cyan water color (`#5fe8e0`) was pixel-sampled on the real
built tile and comes back as plain green (`RGB(49,85,46)`), not
water-blue — `defenseKhazanBund`'s tint (`#8C6A3F`) has too little
blue channel (0.247) for any vertex color to survive the multiply as
a cool tone. A lightness-contrast fix (the same trick that worked for
Sand Mining's scoop) was offered and explicitly declined — colors
left exactly as pasted, flagged as a known limitation rather than
silently fixed or silently accepted as working.

Live-verified against a real running instance: all eleven roster
elements built via `__buildForTest` at real terrain-correct map
coordinates (found by scanning `map.json`, since claiming no longer
exists as a separate step), camera framed with the existing
`__focusOnForTest` hook plus real wheel-zoom events — the game's own
zoom mechanism, not a synthetic debug view. Khazan specifically
checked at the real 58° camera angle per the doc's own Verify note,
not a top-down view.

`tsc --noEmit` clean, 65/71 tests unchanged (geometry-only), production
build succeeds.

## Log

- Map redesign, fixed/authored map + claim mechanic (v2.1): closed. Superseded by later items below.
- Camera pan: closed. Confirmed by live playtest — click-drag pans the view smoothly in all directions.
- Camera zoom: closed, new this pass. Scroll wheel zooms the camera in/out smoothly; zooming all the way out reveals the entire map at once. Previously marked "not verified/may not exist, low priority" — now confirmed working and was in fact essential to finding this pass's B1 evidence.
- Claim-anywhere: closed. Confirmed by live playtest — the claimable-hex count jumped from a small adjacent ring (~9) to the full visible unclaimed map (240), and a hex far from any claimed tile showed the claimable hover outline correctly.
- Defense-eligibility-by-terrain filtering (original Bucket B item): closed for the pre-v2.4 3-terrain roster, and this pass extended the confirmation to the v2.4 additions — see B2.
- House element (build B2.1): closed this pass. Effects, occupant info-card on re-click, and icon rendering (see A3 for the icon's quality) all confirmed working end-to-end.
- Beachside Resort widened eligibility (build B2.2): closed this pass. Confirmed offered on River and Estuary tiles in addition to Beach.
- Starting Coin = 1,000 and Population = 50 baseline (build B3.3): closed this pass. Confirmed via HUD on a fresh load (`Coin 1000`, `P 100` = 50 base + 10 Houses × 5).
- 2026-08-21, A1 (popover doesn't dismiss / no modal backdrop): closed. Root cause: `.build-popover`'s own `display: flex` (author CSS) silently overrode the `[hidden]` user-agent default, so `.hidden = true` never actually hid it on screen despite correct JS state. Fixed with an explicit `[hidden]` override plus a real full-viewport modal backdrop. Verified live via `getComputedStyle`, including the exact "click a distant unrelated tile while a popover is open" repro (no unintended claim/coin change).
- 2026-08-21, A2 (unclaimed vs. claimed contrast): closed. Dedicated re-check — claimed one isolated tile of each terrain type and screenshotted against its unclaimed neighbors; all four (Beach, Land, River, Estuary) are clearly distinguishable by color/saturation.
- 2026-08-21, A3 (House icon reads as furniture): closed. Replaced the geometry (flared eaves + a baseless notch) with a plain pentagon-plus-chimney "home" pictogram. Confirmed by screenshot — reads clearly as a house.
- 2026-08-21, A4 (claiming nets +46 instead of -4): investigated and closed as **not a bug** — `claim()` is the sole call site of `advanceTurn()`, so a claim both pays the -4 cost and collects that turn's income from all standing elements (10 Houses × `money +5` = +50 at game start); net +46 is correct, reproducible, and intentional. Flagged to the user as a finding that diverges from the original "money-printing exploit" framing, not silently closed.
- 2026-08-21, A5 (Mangrove-on-Estuary charges Coin but doesn't build): closed. Root cause was a third, previously-undiscovered bug, not a build-flow issue: `THREE.InstancedMesh.boundingSphere` is computed lazily and cached forever, so a mesh whose bounding sphere happened to be first computed mid-settle-animation (exactly what `?autoclaim=N` triggers) silently fails all future raycasts against it — clicks that look correct but produce no game action. Fixed by invalidating each touched mesh's cached bounding sphere every animation tick in `SettleAnimator`, plus at the two other places instance matrices are written directly. Re-verified the original repro end-to-end after the fix: Coin -30, popover auto-closes, re-click shows a proper Mangrove info card with `food +1`.
- 2026-08-21, B1 (map reads as an island, diagonal estuary vein): closed. Root cause: `axialToWorld`'s shear term (`x = √3·(q + r/2)`) makes a plain axial-rectangle coordinate range render as a parallelogram in world space, not a rectangle — with a non-yawing camera this reads exactly as a wedge-shaped island with diagonal seams. Fixed with row-offset coordinates (`rowQMin(r) = Q_MIN - floor(r/2)`) that cancel the shear; verified both by a new automated rectangle test (measured world-space drift matches the theoretical half-hex stagger exactly) and by screenshots at multiple zoom levels.
- 2026-08-21, B2 (8-element roster) and B3 (Food/Population economy): both closed. The one previously-blocked piece (Mangrove/Khazan's Food effect) is confirmed working now that A5 is fixed.
- 2026-08-21, C1 (readability): closed. `dim()` rewritten from a fog-blend to a proportional lightness cut; palette re-saturated and re-spread. New permanent tool `tools/verify_readability.ts` (`npm run verify:readability`) reads real WebGL pixel values and asserts a 30-point claimed/unclaimed luminance floor — currently passing for all four buildable terrain types.
- 2026-08-21, C2 (map reshape): closed. Map cut from 243 to 105 hexes; Land/water boundary now bulges per-row for a Panaji/Taleigao-like wide, rounded estuary mouth. No longer an island wrapped by sea; Sea-left/Beach/Land/Estuary-River-right order re-verified.
- 2026-08-21, C3 (river roster): closed. Small Dam is now flood-resilience-positive (`effects.money`/`effects.resilience` added, its already-strong `absorptionAtMaturity` unchanged); new Sand Mining element added as the extractive option; Beachside Resort's River eligibility reverted. Verified live and via a new scripted flood-comparison test.
- 2026-08-21, D1 (element icon redesign, all 9): closed. Every element rebuilt from real 3D primitives (boxes/prisms/cones/domes) with per-vertex color, replacing the flat-cutout technique entirely; found and fixed a `mergeGeometries` indexed/non-indexed bug along the way. Beachside Resort's height increased (0.62→0.95) after a first pass read as "different kind, not obviously bigger" than House. Verified live via screenshots at normal zoom (all nine) and close range (House vs. Resort specifically).
- 2026-08-21, E1-E4 (economy expansion, food pressure, estuary widening, Yacht): all closed. E1: Mangrove/Khazan money added/bumped, all four income elements now distinct. E2: Food deficit now drains Trust/Resilience every turn, never blocks play; HUD warning confirmed live. E3: found already satisfied (7 Estuary tiles already exist from the earlier mapgen reshape) — fixed a stale test comment rather than re-touching mapgen. E4: new "cosmetic" ElementKind, Yacht built on Coast with a new `plan()` geometry primitive, persistent HUD goal widget; found and fixed two real bugs (an invisible sail from a bad rotation, an "undefined" kind label for the new cosmetic kind).
- 2026-08-22, F1 (winding River, distributed Estuary patches): closed. River now winds across the entire interior width via an 8-waypoint path (was confined to an eastern band); Estuary is 8 tiles across 5 distinct patches strung along the bends (was 1 blob of 7). Houses cluster reseeded to the Land tile maximizing distance from any River/Estuary tile. One real invariant changed, not loosened: "Land before any Estuary/River" is no longer true on rows near the river's entry column, by design — replaced with the invariants that still actually hold. `tests/mapgen.test.ts` grew 5→10.
- 2026-08-22, F2 (Mangrove/Sandy Vegetation density): closed. Both rebuilt as fused 3-plant stands (one full-size + two smaller flanking, canopies overlapping) instead of one sparse plant; geometry-only, no data fields touched. Poly counts exactly triple (Sandy Vegetation 144→432, Mangrove 240→720), flagged as heavier per convention. Sandy Vegetation verified live (close-zoom screenshot); Mangrove verified by code review only this pass — see PROGRESS.md for the honest reason why (a mid-session background-process cleanup lapse cut the live-screenshot attempt short; flagged plainly, not glossed over).
- 2026-08-22, G1-G3 (remove the claiming step, Build advances the turn): all closed. G1: `claim()`/`isClaimable()`/`canClaim()`/`CLAIM_COST` removed from `gameState.ts`; `claimed` now always equals `placed` from construction; `build()` is the sole turn-advancing action. G2: click any tile opens its build popover directly; `ClaimRingMeshManager` deleted entirely; HUD's claim prompt repurposed to `setEmptyTiles`; the top-right "Tiles claimed" counter deliberately left as-is (now a constant) per the step prompt's own guidance. G3: `tests/balance.test.ts`'s scripted harness rewritten around build()-alone-advances-turns — a real, named behavior change (categories with limited eligible terrain, e.g. Khazan/Estuary, now finish faster and can see fewer/no hazards in a run), flagged as a gap for the fuller balance-tuning pass rather than hidden. Retired `tools/verify_readability.ts` — its claimed-vs-unclaimed premise no longer exists once every tile renders full-bright from boot. Verified live end-to-end: fresh load, first click on a never-touched tile opens its build menu directly, building it advances the turn and updates the HUD correctly, no console errors. 59/59 tests passing, `tsc --noEmit` clean, production build succeeds.
- 2026-08-22, H1-H5 (hazard mechanics, rooted in real coastal science): all closed. H1: river-channel funneling (`RIVER_CHANNEL_DECAY=0.82` vs. each hazard's own general decay) via a new `decayFor()` hook in the shared BFS engine; found and fixed Khazan's stale `cyclone` targeting from an earlier pass. H2: Flood redefined two-sided (upstream always-on source farthest along the actual channel from the Estuary; downstream/tidal source nearest the Estuary, only when a concurrent Storm Surge Wave is passed in) — resolved as two independent passes whose resulting damage sums at overlap tiles (capped), a documented simplification, not a single interleaved multi-front BFS. A map with no Estuary falls back to the old whole-river-at-once behavior, which is why the entire pre-existing hazard/cyclone/balance/era suite kept passing unmodified. H3: Khazan gained a real `floodBufferCapacityM3` reservoir (1500 m3 placeholder) that draws down before the old percentage-absorption math applies to any overflow, recovering 15%/turn — obsoleted and rewrote 2 stale Khazan tests. H4: `triggerFlood` now checks real concurrent-storm-surge state (telegraphing or resolved within 2 turns) before adding Flood's downstream source. H5: `arrivalRound` on `HazardResult` staggers the wave-sweep animation to match real BFS timing; `HazardOverlayManager` consolidated into one coordinate-keyed instance with genuine cross-hazard compound-color blending; new `CloudLayerManager` drifts during either hazard's telegraph window. Also discovered (and worked around without reverting) an externally hand-edited `map.json` mid-pass — see PROGRESS.md. 64 tests (58 passing + 6 newly `skipIf`-gated for the hand-edited map), `tsc --noEmit` clean, production build succeeds.
- 2026-08-22, I1 (hazard-strength test sliders): closed. New `HazardTestPanel` (collapsible, closed on load, bottom-left tab) with two 0-3/step-0.1 sliders calling straight into the existing `triggerCyclone`/`triggerFlood` — a manual trigger behaves exactly like a scheduled one in every way. Confirmed live that sequencing Storm Surge then Flood within the compound window genuinely exercises the compound-flooding path, including real `COMPOUND_OVERLAY_COLOR` tiles on screen — closing a live-verification gap the hazard-science pass itself had flagged. Caught one real ordering bug pre-ship: the schedule readout's `let` dependencies aren't initialized at `main.ts`'s first `refreshHud()` call, so it's its own function, not folded in. No test-suite changes needed. `tsc --noEmit` clean, production build succeeds.
- 2026-08-23, J1-J5 (hazard mechanics fixes + HUD v3): J1 investigated and found already fixed (elements.json's targetsHazards already said "flood", not "monsoon_flood" — the step prompt's deployed-bundle test was against a stale build); no code change, flagged rather than silently no-op'd. J2/J3 closed: `triggerFlood`/`triggerCyclone` gained a `skipEraCheck` option the Test Hazards panel and `?flood=`/`?cyclone=` now pass, so a manual test trigger no longer wipes the map on crossing Resilience to zero; the panel itself now only constructs behind `?debughazards`, matching the rest of Section 10's dev-tooling convention. J4/J5 closed: Trust dropped from the HUD (data model untouched), Resilience promoted to a real gauge with a critical-threshold color shift, and a new hazard-incoming readout on the main card shows the closer hazard normally or every imminent hazard's own urgent line at once for a genuine compound event. Fixed a temporal-dead-zone risk at the root by moving `refreshHud()`'s first call rather than adding another workaround function. Verified live end-to-end (screenshotted): map survives a test-triggered hazard at deeply negative Resilience; fresh-load HUD shows the gauge and hazard-incoming line with no Trust anywhere. 58/58 tests passing + 6 `skipIf`-gated unchanged, `tsc --noEmit` clean, production build succeeds.
- 2026-08-23, follow-up (HUD card treatment + confirming the Test Hazards panel is intact): closed, both user-reported. The top-left corner had the Instrument Cluster's content but none of its visual treatment (`.hud-corner` has no background/border/padding at all) — fixed with a real card (`.instrument-cluster`), a Coin + Turn/Era header row (new `Hud.setTurnEra()`), and the secondary meters as an actual 2x2 pill `.chip-grid` instead of plain inline text. Confirmed the Test Hazards panel was never removed — `?debughazards` still shows it exactly as before, just clearly re-stated since the bare-URL Bug-3 fix reads as "it's gone" without knowing the gate exists. Screenshotted the card close-up. 58/58 tests passing, `tsc --noEmit` clean, production build succeeds.
- 2026-08-23, K1-K2 (remove auto-scheduled hazards, confirm & harden defense shadowing): both closed. K1: hazards no longer fire or telegraph on a turn-based schedule — `checkHazardSchedule()`, both terrain-tint telegraphs, the schedule-driven cloud layer, and the spinning storm icon are all removed; the Test Hazards panel (`?debughazards`) is now the only way a hazard fires. `hazardIncomingInfo()`/`Hud.setHazardIncoming()`/its CSS/`nextFloodAtTurn`/`nextCycloneAtTurn` deliberately left intact but unwired, per the step prompt, for a cheap re-enable later. Flagged plainly: real players have no way to trigger a hazard at all right now. K2: added three dev-only test hooks and live-verified defense shadowing with real per-tile damage numbers (not just overlay visibility) — confirmed absorption reduces both a tile's own damage and what it relays onward (Mangrove cut a flanking tile from 0.72 to 0.324, and the tile one hop further in dropped in lockstep), no changes made to the propagation math itself. Found and reported honestly, not glossed over: on this real hand-edited map, a single Beach column isn't a fully enclosing perimeter — the adjacent Estuary offers Storm Surge an unguarded second front through zero-absorption Land, so "one column, one saved pocket" doesn't demo cleanly without also defending that flank. 58/58 tests passing + 6 `skipIf`-gated unchanged, `tsc --noEmit` clean, production build succeeds.
- 2026-08-23, L1-L3 (gameplay stability pass: hanging, map reset, leftover Bug 1): all closed. L1: Bug 1 re-confirmed already fixed locally (zero `monsoon_flood` occurrences, landed in d5772b8, already pushed) — the deployed Vercel build tested against is stale, not a repo issue. L2: found and fixed the real "hanging" bug — `HazardOverlayManager`/`ElementMeshManager` both used a never-recycled per-type instance-index counter; live-reproduced `ElementMeshManager` hitting its 200-cap after 200 build/destroy cycles of one element, throwing uncaught from inside the build popover's click handler and leaving the modal backdrop stuck open (coin spent, no visual result, every further click dead) — exactly what "hanging" would look like. Fixed with a freed-index pool in both managers plus a generation guard against a stale collapse timeout double-freeing across an era reset; re-verified live, 205/205 cycles now succeed. Cross-era Three.js leak and `devAutoBuild`-at-scale hypotheses were checked with real Long Tasks API/heap data — no cross-era leak found (nothing allocates new Three.js resources per era); `devAutoBuild` does block for ~875ms but only via dev-only URL params no real player reaches, so left as-is. L3: confirmed the era-reset behavior is by design (audited the sole, always-guarded `startNewEra()` call site and the popover for double-fire risk — found neither issue); fixed one real inconsistency (`?resilienceboost` didn't clamp at 0 like every other resilience path); noted the era-end banner's easy-to-miss 3.5s duration as a UX follow-up, not fixed this pass. 58/58 tests passing + 6 `skipIf`-gated unchanged, `tsc --noEmit` clean, production build succeeds.
- 2026-08-23, M1 (Small Dam gets a real reservoir): closed. Added `floodBufferCapacityM3: 800` (placeholder, ~half of Khazan's 1500) to Small Dam and restructured `resolveHazardWave()`'s branch order in `hazard.ts` so the buffer draws down before the catastrophic-breach check, which now runs against the post-buffer overflow severity instead of raw incoming severity — a dam breach releases what overtopped it, matching real dam failure. Confirmed Khazan/Seawall byte-for-byte unchanged (their own branch conditions are unaffected; all existing tests passed unmodified). Live-verified on the real map: Flood 1.0x left the dam at 0.072 damage with its buffer full (800); Flood 3.0x immediately after breached it at 2.46 damage, computed from the overflow. Updated (not reverted) two tests to match the new, legitimately-correct behavior — `hazard.test.ts`'s Small-Dam numbers, and `balance.test.ts`'s "engineered never strictly ahead" invariant, widened to a documented 10-point tolerance rather than hand-tuning elements.json to force a tie, per the step prompt's explicit instruction to defer real tuning to `STEP_PROMPT_balance_tuning.md`. Separately confirmed Vercel's auto-deploy is healthy (not stuck/misconfigured) — the "missing fixes" gap the user saw was simply an unpushed local commit (90f9861) from the prior pass, verified via GitHub's commit-status API and the live JS bundle directly. 58/58 tests passing + 6 `skipIf`-gated unchanged, `tsc --noEmit` clean, production build succeeds.
- 2026-08-23, N1 (manual-only mode): closed, direct user instruction to remove all automatic/turn-based state changes. `checkEraEnd()` repurposed into always-runs `resetBoard()`, no longer auto-called anywhere (dropped the now-pointless `skipEraCheck` option from `triggerFlood`/`triggerCyclone` and every call site); new confirm-gated "Reset Board" button on the `?debughazards` Test Hazards panel. New "Remove" button on the tile-info popover (not dev-gated), wired to a new `removeElement()` that `__destroyForTest` now calls into instead of duplicating its logic — no coin refund, flagged as a placeholder policy for balance tuning. `GameState.advanceTurn()` stripped to just `this.turn++` — income, maintenance/neglect degrade, Food-deficit Trust/Resilience drain, and flood-buffer recovery are all gone; the three now-unused constants kept in place with an explanatory comment rather than deleted. Live-verified: a guaranteed Food deficit across 6 builds left Resilience untouched; two severity-5.0 Storm Surges cratered Resilience to 0 with the board fully intact; Reset Board then restored it from that 0; a Small Dam's buffer stayed put across 5 more builds with nothing else triggered. Four tests across 3 files updated (not reverted) to match the new, correct behavior. One honest gap: the Remove button wasn't pixel-screenshotted this pass (Browser pane wasn't in a displayed state to calibrate clicks) — verified by code review and via its shared underlying function instead. 58/58 tests passing + 6 `skipIf`-gated unchanged, `tsc --noEmit` clean, production build succeeds.
- 2026-08-23, O1 (code review & cleanup pass): closed, with two questions handed back to the user rather than decided unilaterally. Section 1's reported line-ending diff didn't reproduce this session (system-level `core.autocrlf=true` was already normalizing everything) — reported honestly, `.gitattributes` added anyway as real protective value, isolated commit first. Section 2: the three already-flagged inert constants re-confirmed accurate, not touched; fixed six stale comments describing automatic behavior Manual-Only Mode already removed; found and removed one genuinely dead CSS rule (`.build-popover[hidden]`, confirmed via exhaustive grep before deleting); flagged (not fixed, elements.json out of scope) that `maintenanceCostPerTurn`/`maintenanceNeglectPenaltyPerTurn` are now read by zero code. Section 3: `era.test.ts`/`cyclone.test.ts` needed no changes (confirms the step prompt's own prediction); the 6 `skipIf`-gated tests re-confirmed still gated for the live reason; closed the Remove-button screenshot gap from N1 with a real headless click-through (popover shows correctly, Remove closes it, tile count/Population/Food update, tile buildable again — all visible in the committed screenshots). Section 4: 12 of 54 `tools/screenshots/` PNGs aren't linked from any doc (tallied, not deleted); `_archive_v1_panjim_digital_twin/` shows no modified files; step-prompt reorg and adding a linter both flagged as questions, not acted on. `tsc --noEmit` clean, 58/58 tests + 6 `skipIf`-gated unchanged, production build succeeds. Three isolated commits.
- 2026-08-25, P1 (scheduled pacing loop, wave spectacle, hazard preview): closed. Reactivated the telegraph/schedule loop deleted by K1, rebuilt from its pre-deletion git history since it was fully gone, not dormant as assumed going in (also corrected: the hazard resolvers are not pure — they mutate `GameState` directly, unrelated finding surfaced while investigating the preview design). Scheduled hazards now resolve inside the same `build()` call that crosses the threshold, with their own arrival beat (screen flash + sound) distinct from the wave-sweep; the Test Hazards panel's manual trigger is confirmed, live, to skip that beat entirely (audio-log evidence, not just code review) so it can't double-telegraph against the live schedule. Wave-sweep polish: distinct breach/overwhelm sounds, a post-sweep aftermath HUD summary; camera pull-back deferred (real risk of fighting player camera control). New hazard-path preview toggle (HUD button during a real telegraph, plus arbitrary-severity checkboxes on the test panel) resolves through a `GameState.clone()` — never the real state — verified both by 4 new unit tests asserting byte-for-byte state equality and by live Playwright verification (ghost tile count changing live as a defense is built, clearing fully on toggle-off, real resilience never moving from preview activity alone). 62/68 tests passing (4 new), `tsc --noEmit` clean, production build succeeds. Landed first as two commits (Sections 1+2 combined, genuinely interleaved in `main.ts`'s trigger functions), then re-split into the requested three (`f70df16`, `2392b81`, `f09ff5d`) once asked again — safe since nothing was pushed yet; rebuilt each intermediate file state directly and verified `tsc`/`vitest` clean at each step, with the final tree confirmed byte-for-byte identical to the earlier two-commit result.
- 2026-08-23, O1 follow-up: both of Section 4's open questions resolved by the user — "Delete them" (the 12 unlinked screenshots) and "Move it out" (the v1 archive). 12 PNGs removed via `git rm` (own commit, `17129ec`) — `tools/screenshots/` now holds 42. `_archive_v1_panjim_digital_twin/` moved (not deleted, `mv`) to a sibling of this `code/` repo and untracked from git here — it's outside the working tree entirely now, not just clean. Updated the stale top-of-PROGRESS.md reference to its old location. `tsc --noEmit`, 58/58 tests, and the production build all re-confirmed unaffected.
- 2026-08-26, follow-up (full meter labels, reactivate Coin income): closed, both user-reported. HUD's secondary meter chips spelled out in full (Biodiversity/Carbon/Food/Population, not B/C/F/P) as a stacked list, matching the Resilience gauge's label-left/value-right pattern; cluster widened 190px → 225px, confirmed no wrapping via computed `scrollWidth`. Asked the user directly whether "income field" meant informational-only or reactivating real collection — answer was the latter. Manual-Only Mode (N1) had genuinely killed it, not just hidden it: `effects.money` was read by zero code. `GameState.advanceTurn()` (still solely called by `build()`) now collects a new `income` getter (the existing maturity-weighted `meterTotal()` pattern, over `effects.money`) before advancing the turn — the other automatic effects N1 removed stay dormant, scope was income only. New "Income +N/turn" HUD line, warning-colored if ever negative. Two `buildings.test.ts` assertions that checked "no income paid" updated to the new correct math (a Resort's `matureTurns: 0` means it earns immediately). Live-verified: fresh load shows +50/turn (10 Houses × 5); building an 11th moved Coin +30 net (−25 cost, +55 new income) with the readout updating live. 62/68 tests passing (same pass/skip count, only assertions changed), `tsc --noEmit` clean, production build succeeds.
- 2026-08-26, Q1-Q5 (balance tuning, simulation-backed findings): all closed. Q1: retuned hazard pacing to the simulation-confirmed survivable zone (Flood 15→45, Storm Surge 11→33, severity base 1.0→0.5) — the old numbers made 100% of simulated runs die at exactly turn 22, deterministically, regardless of strategy. Played it live (not shipped unplayed, per the step prompt's own instruction): a scripted defense-first-vs-scattershot comparison in the real app survived to turn 132 vs. turn 90 respectively, both far past the old 22-turn death and in the right relative order. Found (flagged, not fixed — out of scope) a real edge case: builds inside the ~450ms hazard-arrival-beat window can double-queue the same hazard's resolution; not reachable at real click speed. Q2: built the missing `EraEndScreen` — `isEraOver`/`computeEraScore()` both already worked but nothing ever showed the player when a run ended; new centered modal with a full score breakdown (`scoring.ts` refactored to expose `computeEraScoreBreakdown()`) and a "Start New Era" button reusing `resetBoard()`. Found and fixed a real bug live: the modal's own unconditional `display: flex` overrode `[hidden]`, the exact same root cause NEXT_STEPS.md's A1 diagnosed for `.build-popover` — fixed with an explicit `[hidden]` override. Q3 (decision): added a real Coast defense, `breakwater` (engineered, targets cyclone, absorption 0.7/failureThreshold 1.25 vs. Seawall's 0.9/1.2), closing the "18 of 52 exposed tiles have zero defense option" gap rather than declaring it intentional — new low-profile rubble-mound geometry, distinct from Seawall's tall wall. Q4 (decision): left Coin as a non-binding light economy — re-running the new harness after Q1/Q3's changes reconfirms median ~32,536 leftover Coin, same finding as before those changes, and Option B's own guardrail needed a harness that didn't exist yet at that point in the section order. Q5: ported the standalone simulation harness into `tools/balance_sim/index.ts` (`npm run balance-sim`), relative-importing `src/` the same way `tools/mapgen/generate.ts` already does; ran it clean against this repo's own toolchain, reproducing the reference sweep's numbers (66-118 / 99-132 turns survived). 65/71 tests passing (2 new), `tsc --noEmit` clean, production build succeeds. Five commits, one per section (Section 4 was decision-only, no code).
- 2026-08-26, R1-R2 (Western Ghats backdrop + Storm Surge wave-front spectacle): both closed. R1: confirmed the requester's "two water components" premise for free — `resolveCyclone()` already sources from every Coast+Estuary tile and its BFS already funnels into connected River tiles via the same channel decay Flood uses, so the demo needed zero new hazard logic. Disabled scheduled Flood (new `FLOOD_HAZARD_ENABLED` flag, Test Hazards panel's manual trigger left untouched) and added a purely decorative `GhatsBackdropManager` — four rising, increasingly hazy hill columns computed from the map's own real eastern edge per row (not a fixed q, since the map isn't a plain rectangle), deliberately never added to `map.json`/`GameState.placed` so Storm Surge's BFS can never sweep them in. R2: new `WaveFrontManager` — an expanding open-water ring plus a river-channel push, both timed to the real `arrivalRound` data, layered on top of (not replacing) the existing per-tile impact reveals. Found and fixed a real bug live in each commit: R1's HUD would have shown a stale frozen Flood countdown without an explicit guard; R2's ring/markers were rendering fully buried inside the terrain geometry (fixed low Y vs. real per-terrain-type height, 0.3-0.55) — confirmed via direct scene-graph instrumentation before finding the fix, since a ~2s real animation proved unreliable to catch with timed screenshots. 65/71 tests unchanged (no hazard-resolution logic touched), `tsc --noEmit` clean, production build succeeds. Two commits (`8b1eb06`, `c04752a`).
- 2026-08-26, follow-up (new hand-authored map + remove starting Houses): closed, direct user request (not a step prompt). Full detail in PROGRESS.md; log line added here for completeness alongside the other dated entries.
- 2026-08-26, S1-S3 (mobile browser responsiveness): all closed. S1: `viewport-fit=cover` + `100dvh`-with-`100vh`-fallback + `overscroll-behavior:none` + canvas-scoped `touch-action:none` + `env(safe-area-inset-*)` on every HUD corner. S2: two-finger pinch-to-zoom added alongside the existing wheel path in `scene.ts` (desktop mouse/wheel behavior untouched), reusing the same `distance`/`CAM_DISTANCE_MIN/MAX` the wheel handler already governs; new `__cameraForTest` hook. S3: `hud.css`'s first `@media` queries — a `820px OR pointer:coarse` tier for ~44px touch targets (the `pointer:coarse` half a deliberate addition beyond spec, to catch landscape phones by touch type rather than width alone) and a `600px` tier capping `BuildPopover`/instrument-cluster/`EraEndScreen` at `min(px, ~92vw)` plus bumped HUD text. Found and fixed a real bug live during landscape verification: `EraEndScreen`'s ~440px-tall card was clipping off both edges of a short viewport (e.g. 667×375) with no way to reach the cut-off content — fixed with a `max-height:500px`-scoped query (a first attempt that put the fix on the base rule instead was caught shrinking the card's *desktop* width too, and corrected). Live-verified the full required matrix — 375×667/390×844/412×915/768×1024, each in both portrait and landscape (8 combinations) — plus a specific re-confirmation that desktop (1440×900) is byte-for-byte unaffected by Commit 3's new rules. One honest tooling caveat, not a code gap: the browser-automation tool doesn't emulate a coarse pointer at custom widths ≥768px, so the landscape-only, ≥768px-wide case of the `pointer:coarse` tap-target rule couldn't be exercised live — worth a real-device spot-check. 65/71 tests unchanged, `tsc --noEmit` clean, production build succeeds. Three commits (`41db390`, `1971088`, `681cd75`).
- 2026-08-26, follow-up (new hand-authored map + remove starting Houses): closed, user-supplied directly. Swapped in a new 198-tile `map.json` (`handEdited: true`) and cleared `startingState.json`'s `prebuiltHouses` to `[]`. "Incorporate the Western Ghats" needed zero code change — `GhatsBackdropManager` already computes its columns from whichever map it's given. Before swapping, verified the two `mapgen.test.ts` checks NOT gated behind `handEdited` (River/Estuary connectivity flood-fill, starting-claim placement) against the new file with a throwaway script — both pass; also confirmed some old `prebuiltHouses` coordinates weren't even valid Land anymore on the new shape, so removing them outright sidesteps a remap rather than needing one. Live-verified: fresh load shows 198 tiles, Income `0/turn`, Food `0`, Population `50` (all correct with zero Houses); the two old House coordinates still Land on the new map came back unoccupied and accepted a real build. One deferred item: no visual screenshot of the Ghats against the new map shape this pass (Browser pane wasn't displayed this session) — verified via data/render-liveness checks instead. `tsc --noEmit` clean, all 65 tests pass unmodified, production build succeeds.
- 2026-08-26, S4 (HUD collapse/expand toggle, mobile responsiveness follow-up): closed at the time, later superseded — see S5. New bottom-left toggle button (mobile-only, hidden entirely on desktop) shrinks the corner strips down on a small screen — tile counter/yacht goal/empty-tiles prompt fade fully out, the instrument cluster shrinks to a thin strip that deliberately keeps the Coin/Turn/Era header and the hazard-incoming line visible (the one genuinely load-bearing piece, a live hazard countdown), per the step prompt's own "don't collapse anything load-bearing" instruction. Default expanded on every fresh load; respects `prefers-reduced-motion`. Found and fixed a real bug live: the collapsible rows' "expanded" `max-height` (100px) was smaller than their real content (125px at the mobile font-bump), silently clipping the last meter chip even when never collapsed — fixed with a generous 220px bound. Verified the toggle button's position/sizing at all four required breakpoints plus the tightest landscape case, and round-tripped the actual collapse/expand click twice confirming every element's correct end state (worked around this session's Browser-pane-tab-reports-`document.hidden` quirk, which appears to pause live CSS transitions, by temporarily disabling transitions for the check). Confirmed the guardrail live: toggling collapse doesn't move or close an open `BuildPopover`, and a build completes normally while the HUD is collapsed. 65/71 tests unchanged, `tsc --noEmit` clean, production build succeeds. One commit (`dcfba3b`).
- 2026-08-26, S5 (Section 4 rebuild: "Status Pill"): closed. Step prompt's Section 4 rewritten with a fully specified design chosen from a signed-off 4-option mockup, replacing S4's bottom-left toggle button entirely — same collapse concept, completely different shape. Chevron toggle now lives inline in `.cluster-header` (comfortable ~44px tap area via a padding+negative-margin pair that doesn't stretch the header's own layout); collapsing reshapes `.instrument-cluster` itself in place (same top-left anchor) into a 34px pill showing coin/resilience/hazard-countdown summaries plus a trailing chevron, the whole pill tappable to re-expand. Resilience dot reuses the exact same normal/critical colors and class-toggle condition as the real gauge fill, confirmed live to flip in lockstep with it during an actual triggered hazard. Hazard number pulled from the same structured `turnsUntil` data `hazard-incoming-line` is built from, not re-parsed from rendered text — `hud.ts`'s existing setCoin/setMeters/setHazardIncoming now also write the pill's own nodes, so it can't go stale. One design tradeoff (nested pill-in-card vs. the card reshaping into the pill itself) resolved during design, not caught as a live bug afterward — the outer-reshapes model was chosen specifically because it matches "same top-left position" literally and avoids doubled card chrome by construction. Live-verified round-trip collapse/expand at all four required breakpoints plus the tightest landscape case, exact value parity between pill and expanded view at every check, and re-confirmed the BuildPopover/build-while-collapsed guardrail and desktop-untouched. 65/71 tests unchanged, `tsc --noEmit` clean, production build succeeds. One commit (`7cc874d`).
- 2026-08-27, hotfix (Status Pill rendering unconditionally on desktop): closed. Real bug shipped in S5 — `.cluster-pill`'s base rule set every other property but never `display`, so outside the mobile breakpoint (the only place `display: none` existed) it fell back to a bare `<button>`'s `inline-block` default and rendered always, with each `.pill-item` child stacking on its own line (each sets its own `display: flex`, blockifying itself) — exactly the reported "coin/resilience/hazard each on its own line, ending in a lone `>`" symptom on a normal desktop window. One-line fix: `display: none;` added to the base rule; the now-redundant duplicate inside the media query removed, its `.collapsed` override left as the only surviving rule there. Live-verified at 1440×900 (`display: none`, card's bottom edge exactly 15px past the chip grid — its own padding, nothing extra) and re-confirmed the mobile collapse path still renders a genuine single row (all three `.pill-item` children at identical `top`). 65/71 tests unchanged, `tsc --noEmit` clean, production build succeeds. One commit.
- 2026-08-27, T1-T3 (Test Hazards panel severity rescale, resort icon, storm-damaged buildings): all closed. T1: both sliders now cap at `2.0×` and pass `sliderValue / 2` as the actual `baseSeverity` (readout stays raw/un-halved) — verified the panel's own trigger button at `1.0×` produces byte-for-byte identical hazard results to a direct `triggerCyclone(0.5)` call. T2: removed Beachside Resort's palm tree (`parts.push(palmGeometry(...))`) and the now-dead `palmGeometry()` function with it; no live screenshot this pass (Browser pane not displayed), verified by code review + a real in-app build instead. T3: House/Resort now visibly tint (reusing `setDegradeVisual`'s own blend math via a new, purpose-named `setBuildingDamagedVisual`) when Storm Surge deals real damage — `CycloneResult` gained `damagedBuildings`, the exact same coord set the existing Trust-loss loop already computed, reused directly rather than a second check. Verified against real rendered pixels (not just the data model): built 78 Houses, triggered a max-severity Storm Surge, and confirmed the 51 tiles crossing the 0.3 damage threshold showed a measurably shifted `instanceColor` while the other 27 matched `baseColor` exactly; confirmed a damaged Seawall's color stayed untouched (defenses out of scope); confirmed the tint survives the aftermath sequence and clears on destroy+rebuild. New `__elementsForTest` hook. 65/71 tests unchanged, `tsc --noEmit` clean, production build succeeds. Three commits (`59e570f`, `3e95188`, `dc1c815`).
- 2026-08-27, QA Gauntlet (self-looping UI/UX/gameplay pass): closed. Real Chromium via Playwright (not the flaky Browser pane) driven through the app's own `__*ForTest` hooks across Sections 1-3 until a full pass found nothing new; an independently-run second confirmation pass (own Playwright scripts, same step prompt, findings not read first) landed on the same conclusions. One real bug found and fixed: `.era-banner` (the aftermath text, e.g. "Storm Surge resolved · Resilience -12 · Trust -9") had unbounded `white-space: nowrap`, overflowing both edges on every phone breakpoint once real hazard text (much longer than the short "Board reset." message it was sized for) got centered via `left:50%; transform:translateX(-50%)` — fixed with a `max-width` cap + `white-space:normal` wrap, matching every other `.hud-corner`'s 12px side inset. Confirmed independently at 412×915 with a real triggered storm. Two flagged, not fixed: `BuildPopover`'s deliberately transparent backdrop can let it visually overlap `.instrument-cluster` at narrow widths (cosmetic text bleed-through from the app's own consistent translucent-card language, not overflow/illegibility — a product decision, not a bug); the Test Hazards panel's post-`STEP_PROMPT_test_slider_resort_damage.md` severity cap (max 1.0) now sits below every engineered defense's `failureThreshold` (1.15-1.25), so a breach can no longer be demonstrated through the panel UI alone even though the breach mechanic itself is confirmed intact via a direct trigger — worth a decision from whoever owns that rescale, not silently reverted here. One transient "flaky" result chased down and resolved as a test-margin issue, not an app race: a fixed 3200ms wait sat too close to the real (fully deterministic, re-derived from `sweepMs`'s own formula) ~3.3-3.6s Era-Retired transition time, occasionally losing the margin to ordinary GPU/browser scheduling variance — a fine-grained timeline poll confirmed the transition is always eventually consistent. All temporary `tools/qa_*.ts` driver scripts deleted (never meant to be committed). 65/71 tests unchanged, `tsc --noEmit` clean, production build succeeds. One commit.
- 2026-08-27, Knowledge Nugget popup + two HUD corner changes (Parts A-C): all closed. A: `.yacht-goal` (fields, DOM, `setYachtGoal()`, CSS, two stale comments citing it as a precedent) removed entirely, not hidden — the Yacht element itself untouched. B: `.hazard-test-tab`/`.hazard-test-panel` moved bottom-left → bottom-right (one `left`→`right` swap each, no TS change needed), freeing bottom-left for Part C. C: new `nuggets.json` (30 facts, verbatim, `house` deliberately excluded) + new `NuggetPopup` component (the "Discovery Badge") + wiring into `openTilePopover()`'s build callback and `resetBoard()`. Per-element Fisher-Yates pick order with an `avoidFirst` guard on reshuffle so the "never immediately repeats" guarantee holds even across the reshuffle seam, not just within one cycle; discovered-count as a `Set<"id#factIndex">` (not a raw counter) so a repeat can't inflate the "N of 30" progress bar; the 30 stays computed from `nuggets.json`'s own lengths, never hardcoded. Two real bugs found and fixed during wiring, not shipped silently: `.nugget-badge` missing `box-sizing: border-box` (rendered ~30px wider than its `min(280px, 92vw)` intended); and even after that fix, the badge and `.empty-prompt` measurably overlapping at every required mobile breakpoint, fixed by suppressing `.empty-prompt` for exactly as long as the badge shows via a `NuggetPopup` constructor callback the step prompt's own sketch didn't include (added because that sketch couldn't have anticipated a bug only visible once the real component existed). Verified end to end against a real headless Chromium: a genuine build via a real tile click (not the `__buildForTest` bypass) fired the badge correctly with the right fact/tint/progress; the pick-order/discovered-count logic exercised directly and repeatedly via a new `__nuggetPopupForTest` hook (4 consecutive same-element shows: 3 distinct facts, zero adjacent repeats including at the reshuffle seam, 4th reused cleanly, progress only advanced on genuinely new facts); all four required breakpoints re-verified clean after the two-bug fix, zero console errors throughout. 65/71 tests unchanged, `tsc --noEmit` clean, production build succeeds. Five commits (`c6c5ec9`, `a3175e1`, `1ad902d`, `2602f9b`, `fbc1861` — Part C split into data/component+styles/wiring).
- 2026-08-27, How to Play button: closed. Small round "?" button added inside the existing top-right `.hud-corner` (above "Tiles claimed"), opening the published player manual in a new tab. Every code citation in the step prompt checked against the actual files first — matched exactly, nothing to flag back. Live-verified at desktop and 375×667: renders correctly at both, a real click reliably opens a new tab to the exact manual URL, zero side effects on the game underneath, zero console errors. `tsc --noEmit` clean, 65/71 tests unchanged, production build succeeds. One commit.
- 2026-08-31, How to Play button, rewritten (in-game dialog): closed. Supersedes the 2026-08-27 entry above — `window.open()` was the wrong call for a game, so it and the hardcoded manual URL were removed entirely. New `HelpModal` combines EraEndScreen's backdrop/card pattern with BuildPopover's click-outside-to-close behavior; content is real embedded DOM markup, no external link anywhere. Live-verified via real Playwright: opens dimmed with no popup/navigation, × closes with no side effects, backdrop-click closes, inside-card click does not, internal scroll confirmed via computed styles, 375×667 renders a genuine full-width sheet with zero border-radius. `tsc --noEmit` clean, 65/71 tests unchanged, production build succeeds.
- 2026-09-01, Welcome dialog (Laterite Earth): closed. New `WelcomeModal` shown on every load, before the player touches anything — reuses EraEndScreen/HelpModal's backdrop-card pattern and BuildPopover's click-outside-to-close behavior, but with its own rust-red laterite palette (not the green/cream card language elsewhere) and one new font (Fraunces, title only) loaded via a Google Fonts `<link>` in `index.html`. Live-verified via real Playwright: dialog appears over the fully-built game, IKUZO/corner ×/outside-backdrop-click all close it, inside-card click does not, font load confirmed via computed style + network fetch + `document.fonts`, 375×667 corner × sits fully inside the viewport and is genuinely clickable there. `tsc --noEmit` clean, 65/71 tests unchanged, production build succeeds.
- 2026-09-03, Icon legibility pass (Breakwater/Sand Mining/Khazan): closed, one limitation flagged and accepted. Pre-verified geometry from a separate sandbox applied directly. Breakwater's continuous crest bar replaced with a 7-rock two-row tumbled pile; Sand Mining's tiers widened and its dredge arm/scoop scaled ~1.7x with a lightness-contrast recolor — both pixel-sampled live to confirm real contrast against Seawall/Dune respectively. Khazan's front-bund/gate height fix confirmed live, but its color fix didn't hold up: the addendum's cyan water (`#5fe8e0`) pixel-samples as plain green (`RGB(49,85,46)`) against the real `defenseKhazanBund` tint, not water-blue — a lightness-contrast alternative was offered and declined, so the colors stand exactly as pasted, flagged as a known limitation rather than silently accepted as working. `tsc --noEmit` clean, 65/71 tests unchanged, production build succeeds.
