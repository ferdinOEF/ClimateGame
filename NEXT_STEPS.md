# Khazan — Next Steps (running punch list)

This is the step-by-step queue for the gauntlet loop, kept separate from
`GAUNTLET_PROMPT.md` (the design spec) on purpose: the spec says what the
game is, this file says what to do right now, one item at a time. Read
`GAUNTLET_PROMPT.md`'s Revision log first, especially v2.4 and Section 0.1.

**Note (this revision):** only v2.3 copies of `GAUNTLET_PROMPT` could be
found on disk (Downloads: `.docx` and two `.md` exports, all describing
v2.2/v2.3 — Risk still present or just-removed, no Land terrain, House,
Food, or Population). No v2.4 document exists yet. This file is detailed
enough to act on directly (exact effects values, terrain lists, starting
state) — proceeding from it rather than blocking. Cross-check against a
real v2.4 doc later if one turns up.

Work Bucket A in order before touching Bucket B. Explicit sequencing
directive, Section 0.1: get the existing loop feeling good to actually
play before adding or expanding content.

Don't start the next item until the current one's "Verify" step is
actually done and noted in the Log (date + one line), not just assumed.

**Both buckets are clear as of 2026-08-20** — A1-A3 (A3's deferred 8th
icon closed out by B2 adding House) and B1-B3 all closed. This file has no
open punch-list items; the next revision of the build prompt (or a fresh
playtest) is what should add more.

## Bucket A — UI/UX & Playability (work this first)

### A1. Fix: build popover doesn't auto-close after a successful build, and doesn't reflect a tile's already-built state — top priority

Status: closed (see Log). Root-caused with a live Playwright session rather
than guessing from the repro text: point 1 (auto-close) actually already
worked — `BuildPopover`'s own button handler always called `hide()` after
`onSelect`. The real, confirmed gap was point 2: clicking an *occupied*
tile just silently did nothing (`buildableAt` correctly returns `[]` for a
built tile, and `show()` calls `hide()` on zero options with no other
feedback), which reads exactly like "the popover never closed / never
registered the build" to a player re-clicking to check — almost certainly
what the original report was actually seeing. Points 3 (outside-click/
Escape) were genuinely missing entirely. Also confirmed at the data layer:
`state.build()` was deducting Coin and writing to `state.elements`
correctly the whole time — this was purely a UI-feedback gap, never a
double-charge risk.

Fix, all in one pass since it's the same state-management code path:
1. On a successful build, close the popover immediately — no lingering, no re-showing the same list. (Already worked; verified, not changed.)
2. Clicking a tile that already has an element built on it now shows a read-only info card (name, category, effects) via `BuildPopover.showInfo()` instead of silently doing nothing or offering a build menu — Section 3's "one tile, one element" is now enforced at the UI level, not just the data layer.
3. A new `document`-level click listener in `main.ts` closes the popover on any click that lands outside both the canvas and the popover itself (the HUD, previously unreachable by the canvas-only listener); a `keydown` listener closes it on Escape. Neither charges Coin.
4. Popover position still clamps to stay within the viewport — re-verified after refactoring the clamp math into a shared `positionAndReveal()` helper used by both the build menu and the new info card.

Verify: build an element on a tile, confirm the popover closes immediately
and the tile now renders that element; click the same tile again, confirm
it shows the built element's info, not a build menu; open a popover on any
tile, click outside (on the HUD)/press Escape, confirm it closes with no
Coin change; repeat near a viewport edge and confirm nothing clips. All
four confirmed via a live Playwright session against the running dev
server (not just static code reading) — see Log.

### A2. Unclaimed-but-visible hexes should read as visually distinct from claimed ones

Status: closed (see Log). The previous pass over-corrected: chasing an
earlier "unclaimed doesn't read as unclaimed" bug, the fix blended every
unclaimed tile 72% toward one shared neutral `fog` tone — which does keep
claimed vs. unclaimed obvious, but pushes different unclaimed *terrain*
types close enough together that a wide, mostly-Beach view reads as one
flat tan field, exactly what this pass's playtest flagged. `dim()` in
`terrainMeshManager.ts` now does both things it needs to, in order:
desaturate each terrain's own color first (`hsl.s * 0.55`, so it keeps
enough of its own hue/lightness to stay distinguishable from other
terrains), *then* blend a smaller amount (32%, down from 72%) toward `fog`
(so the whole unclaimed field still reads as muted next to a claimed
tile's full saturation). Re-screenshotted at both close and wide zoom:
unclaimed Coast now reads as a clear blue-teal distinct from unclaimed
Beach's tan, and the claimed cluster still pops via saturation alone.

One caveat worth logging honestly: at today's coastal-only scope, the
*interior* of the map is almost entirely Beach by design (Land doesn't
exist until B1), so a screenshot panned deep inland will still look
fairly monotonous — that's the map's actual terrain composition, not a
color-treatment bug, and should resolve on its own once B1 adds Land.

Verify: a screenshot where claimed vs. unclaimed is obviously
distinguishable by color/saturation alone, and where unclaimed Coast and
unclaimed Beach read as recognizably different hues rather than
converging on one flat tone (confirmed via `a2_rebalanced_close.png` /
`a2_rebalanced_far.png`). Full Beach/Estuary/River/Land variety in one
frame isn't checkable yet — Land doesn't exist until B1 — but the
underlying `dim()` treatment is terrain-agnostic and applies identically
to whichever terrain a tile has, so there's no reason to expect it to
behave differently once Land exists.

### A3. Add: thoughtfully designed icons for each buildable element

Status: 7/8 closed, 1 blocked on B2 (see Log). Dune, Sandy Vegetation
(Pandanus — a spiky radiating-blade rosette, not a generic palm), Seawall,
Mangrove, Khazan, Small Dam, and Beachside Resort each already have a
distinct flat-silhouette icon (`src/render/elementGeometry.ts`, done in the
earlier trimmed-roster pass) — confirmed readable and distinguishable from
each other via screenshot (`bucketb_elements2.png`: Mangrove's rounded
canopy blob, Small Dam's blocky notched barrier, and Beachside Resort's
cabana-plus-umbrella all clearly read apart at actual in-game size). House
is the 8th and doesn't exist as an element yet — it's defined in B2, which
hasn't landed. Genuinely can't design/verify its icon before the element
itself exists with real terrain/effects to inform the silhouette, and
Section 0.1's own sequencing rule says Bucket A shouldn't reach into
Bucket B content to manufacture a placeholder just to check this box.
Deferred: House's icon is now folded into B2's own Verify step rather than
tracked here twice.

Verify: 7 of 8 icons visible together and distinguishable from each other
at actual UI size (done); House's icon to be verified alongside its
element in B2.

## Bucket B — Content: coastal-only scope (work this after Bucket A is solid)

### B1. Fix: map generation doesn't match the explicit left/right orientation — plus add the Land terrain type

Status: closed (see Log). Root-caused the "sea wraps around a corner" bug
precisely: `/tools/mapgen` banded terrain by a *global* world-X threshold
(`worldX < xMin + depth`), but `xMin` is only achieved at one grid corner
(`q=Q_MIN, r=R_MIN`) — each row's own local x-range is itself shifted by
the same axial-skew term (`x = sqrt3*(q + r/2)`), so a narrow global
threshold selects lots of tiles from the rows near that one corner and
almost none from the rows near the opposite corner. Fixed by banding on
axial `q` directly instead: the same q-range is selected in every row, so
every row gets an identical-depth Coast/Beach edge — the resulting edge is
a smooth, gentle diagonal (rows drift together as r changes, following the
hex grid's own natural skew) rather than a corner-hugging wedge, which
also happens to read as a reasonable stand-in for "Goa's gently curved
shore." Added `land` to `terrain.json`, rewrote the region rules for the
explicit Sea → Beach → Land → Estuary/River order, and made the estuary a
genuine multi-tile branching blob (two river arms from separate sources
converging inland, not a single tile) confined to the eastern ~38% of the
map. Verified two ways: `tests/mapgen.test.ts` independently re-checks
every row's left-to-right order and the estuary's connectivity/region
bounds from the checked-in `map.json` (not just trusting the generator's
own self-check), and a live screenshot shows a clean Coast → Beach → Land
band with no corner artifact.

Goa's real geography (a gently curved shore, a wide branching estuary
where rivers meet the sea near a peninsula) was used for proportion only —
the estuary blob and diagonal coastline are expressed entirely in
generation rules and hex math, nothing traced from a map image.

Verify: `tests/mapgen.test.ts` confirms every row reads Coast → Beach →
Land before any Estuary/River tile (0/9 rows violate this), the estuary is
a ≥3-tile connected blob confined to the eastern ~38% of the map, and the
starting claim sits near the coast (not the now-inland estuary). Screenshot
confirmation: `b1_fresh_map.png` (clean Coast/Beach/Land bands, claimed
cluster popping via A2's dimming rebalance) — the estuary itself sits far
enough east that it fell outside every attempted screenshot pan, so it's
verified by the test above reading the actual map data instead of by eye.

### B2. Finish: the 8-element roster — House/Land is new, Resort's eligibility widens, Mangrove/Khazan gain a Food effect

Status: partially landed, confirmed by live playtest — clicking a claimed
Estuary tile correctly offered exactly "Mangrove" and "Khazan," no terrain
mismatches (the old Laterite-Plateau-offering-Seawall class of bug appears
fixed for the original 3-terrain roster). Now closed (see Log):
1. Added House (`terrain: ["land"]`, `kind: "building"`, `effects: { money: 5, food: -1, population: 5 }`). `buildCost: 25` and `money: 5` are invented placeholders (no value was specified for either) — flagged here and in `PROGRESS.md`, not tuned balance. The `population` key is an extra beyond what B2 literally specified — added because it's the cleanest way to satisfy B3's "population scales with House count" through the *same* generic effects accumulator every other meter already uses, rather than a one-off hardcoded id check.
2. Widened Beachside Resort's `validTerrainIds` to `["beach", "estuary", "river"]`.
3. Added `food: 1` to both Mangrove and Khazan's effects.

Also renamed the generic effects key `coinPerTurn` → `money` throughout
(`elements.json`, `GameState.advanceTurn`, docs) to match this document's
own terminology — the two were the same concept under different names,
and one name should win.

Verify: `tests/buildings.test.ts` confirms House is Land-only, Beachside
Resort is buildable on beach/estuary/river but not coast, and Mangrove
raises `state.food` once mature. House's icon (a wide gable-roofed
silhouette with a chimney, distinct from Resort's cabana-and-umbrella)
closes A3's deferred 8th icon — confirmed via `b3_fresh_start.png`.

### B3. Add: Population/Food economy and the new starting state

Status: closed (see Log). `GameState` gained a `food` getter (thin wrapper
over `meterTotal("food")`, same pattern as biodiversity/carbon) and a
`population` getter (`STARTING_POPULATION + meterTotal("population")`) —
both fully generic, no hardcoded element-id checks anywhere in engine code.
The constructor gained two new optional parameters, `startingElements`
(pre-built elements claimed and placed for free, not purchased) and
`startingCoin`, both re-applied on `startNewEra()` too so the pre-built
Houses and 1,000 starting Coin survive an era transition rather than only
appearing once at first boot. `/tools/mapgen` now also writes
`src/data/startingState.json` (`startingCoin: 1000`, `startingPopulation:
50`, `prebuiltHouses`: 10 Land tiles in a compact cluster just inland from
the coastal claim, computed from the same generated map so they're
guaranteed to actually be Land) — `main.ts` loads it and seeds/renders the
Houses at boot with no settle animation (they were never "just built").
HUD gained Food and Population chips alongside the existing four.

Verify: `b3_fresh_start.png` — fresh load shows Coin 1000, HUD reading
"F -10" (10 Houses × -1) and "P 100" (50 + 10×5), "Tiles claimed: 13"
(3 coastal + 10 Houses), and 10 House icons visibly clustered on Land,
inland from the coastal claim.

## Log

- Map redesign, fixed/authored map + claim mechanic (v2.1): closed. Superseded by later items below.
- Camera pan: closed. Confirmed by live playtest this pass — click-drag pans the view smoothly in all directions; previously reported as completely non-functional (neither scroll nor drag worked), now working via drag. Zoom still not verified/may not exist — low priority, drag-pan alone is enough to satisfy the original blocker (reaching and seeing the full map).
- Claim-anywhere: closed. Confirmed by live playtest this pass — the claimable-hex count jumped from a small adjacent ring (~9) to the full visible unclaimed map (240), and a hex far from any claimed tile, with no claimed neighbor at all, showed the claimable hover outline correctly. Matches the v2.2/v2.4 spec.
- Defense-eligibility-by-terrain filtering (original Bucket B item): closed for the pre-v2.4 3-terrain roster. Confirmed by live playtest — an Estuary tile now correctly offers only Mangrove and Khazan, no coastal/river mismatches. Superseded by B2 above for the v2.4 roster additions (House, widened Resort eligibility).
- 2026-08-20, A1: closed. Root-caused live via Playwright (not static reading) — auto-close already worked; the real gap was clicking an occupied tile doing nothing instead of showing info. Added `BuildPopover.showInfo()` for built-tile info cards, a `document`-level outside-click listener (the old canvas-only listener couldn't see clicks on the HUD), and an Escape-key listener. All 4 sub-checks (auto-close, occupied-tile info, outside-click, Escape) confirmed via a live Playwright session against the running dev server, plus viewport-clamp re-verified via `testpopoverclip` screenshots.
- 2026-08-20, A2: closed. The 72%-toward-shared-fog blend from the previous pass over-corrected — different unclaimed terrains converged too close together. Rebalanced `terrainMeshManager.ts`'s `dim()` to desaturate each terrain's own color first (keeping its hue/lightness distinguishable), then blend a smaller 32% toward fog. Verified via `a2_rebalanced_close.png`/`a2_rebalanced_far.png` — unclaimed Coast now reads as clearly different from unclaimed Beach, claimed cluster still pops. Noted: the interior still looks Beach-monotonous at wide zoom because it genuinely is almost all Beach right now — that's B1's terrain-diversity job, not a color bug.
- 2026-08-20, A3: 7/8 closed. Confirmed the existing 7-element roster's icons (built in the earlier trimmed-roster pass) are legible and distinguishable via `bucketb_elements2.png`. House (the 8th) doesn't exist as an element until B2 lands — deferred its icon check to B2's own Verify step rather than jump ahead of Bucket A's own sequencing rule to manufacture a placeholder element early.
- 2026-08-20, B1: closed. Root cause of "sea wraps around a corner": mapgen banded by a global world-X threshold, which is only correct near the one grid corner where that global min/max is actually achieved — every other row's local x-range is shifted by the same axial-skew term. Fixed by banding on axial `q` directly (uniform per row). Added `land` terrain, rewrote region rules for Sea → Beach → Land → Estuary/River, made the estuary a real multi-tile branching blob. `tests/mapgen.test.ts` rewritten to independently verify the new layout from the checked-in map.json (not just trust the generator's own self-check).
- 2026-08-20, B2: closed. Added House (`land`, `{money:5, food:-1, population:5}` — cost/money placeholders, flagged in PROGRESS.md), widened Beachside Resort to beach/estuary/river, added `food:1` to Mangrove/Khazan. Renamed the generic effects key `coinPerTurn` → `money` throughout for consistency with this document's own terminology. House's icon closes A3's deferred 8th slot.
- 2026-08-20, B3: closed. Added `food`/`population` getters to GameState (both routed through the same generic `meterTotal` accumulator everything else uses — population's House-scaling is a `population` effect key, not a hardcoded id check). GameState's constructor gained `startingElements`/`startingCoin` params, re-applied on `startNewEra()` too. mapgen now also writes `startingState.json` (1000 coin, 10 pre-built Houses on Land near the coastal claim); `main.ts` seeds and renders them at boot. HUD gained Food/Population chips. Verified via `b3_fresh_start.png`: Coin 1000, F -10, P 100, 13 tiles claimed, 10 House icons visible on Land.
