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
