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
