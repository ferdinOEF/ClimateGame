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

**Bucket A is effectively clear as of 2026-08-20** — A1 and A2 fully
closed, A3 closed for every element that currently exists (7/8; the 8th,
House, is genuinely blocked on B2 introducing it, not skipped). Proceeding
into Bucket B.

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

Status: open, and this is now a correction against a live build, not a
fresh spec. This pass's playtest panned across the current generated map
and found: sea wraps around a map corner (visible on both the left edge
and, after panning, the bottom edge), with the river-like band cutting
across horizontally near one edge — not the clean, explicit layout below.

The intended layout (`GAUNTLET_PROMPT.md` Section 4, v2.4): left to right
— Sea → Beach → Land (interior) → Estuary/River, with the river continuing
further right/inland past the estuary. Land is a new terrain type
(interior/inland, generic buildable ground, hosts the residential area and
House elements, Section 5) that didn't exist in v2.2/v2.3's coastal-only
set — add it to `terrain.json` and to the mapgen region rules (Coast/Beach
fill the left portion, Land fills the middle, Estuary/River are toward the
right).

Also new: a real Goa reference is worth pulling in for shape/proportion —
Goa's actual coastline (visible on OpenStreetMap or Wikipedia) has a
gently curved shore and a distinctively wide, branching estuary where two
rivers meet the sea close together near a peninsula. Borrow those
proportions (a wide/branching estuary relative to the coastline, a gentle
coastal curve) in the region rules — don't trace or ship any copyrighted
map image as a game asset, the shape can be expressed in generation rules
and hex proportions.

Fix: update `/tools/mapgen`'s region constraints to the explicit
left/right layout above; add `land` to `terrain.json`'s terrain types;
regenerate `map.json`.

Verify: a screenshot (with camera pan) shows Sea on the left, Beach
fronting it, a Land interior, and Estuary/River toward the right, in that
order, legibly; the estuary reads as noticeably wide/branching rather than
a single narrow notch.

### B2. Finish: the 8-element roster — House/Land is new, Resort's eligibility widens, Mangrove/Khazan gain a Food effect

Status: partially landed, confirmed by live playtest — clicking a claimed
Estuary tile correctly offered exactly "Mangrove" and "Khazan," no terrain
mismatches (the old Laterite-Plateau-offering-Seawall class of bug appears
fixed for the original 3-terrain roster). What's still needed:
1. Add House (`GAUNTLET_PROMPT.md` Section 5/8): terrain `["land"]`, category economic, effects `{ money: +5, food: -1 }` — these exact numbers are explicitly placeholder (only `food: -1` was actually specified, at the requested default value of 1; `buildCost` and `money` are invented placeholders, flag them as such in `PROGRESS.md`, don't treat them as final).
2. Widen Beachside Resort's terrain eligibility from `["beach"]` to `["beach", "estuary", "river"]`.
3. Add a Food effect to Mangrove and Khazan (`{ food: +1 }` each, default value 1 per the same instruction as House's food cost).

Fix: update `elements.json` per the three points above; wire the popover
to House/Land the same way it's already correctly wired for the other
three terrain types (per B1's new Land terrain).

Verify: a Land tile's popover offers House (and only House, until more
Land elements exist); a Beach, Estuary, or River tile's popover all
correctly include Beachside Resort as an option; building Mangrove or
Khazan visibly increases the Food value in the HUD. Also covers A3's
deferred 8th icon: House needs its own distinct flat-silhouette icon,
verified the same way the other 7 already were (visible and
distinguishable at actual popover size).

### B3. Add: Population/Food economy and the new starting state

Status: open, new (`GAUNTLET_PROMPT.md` Section 4/7/8). Three pieces:
1. Food as a tracked resource, produced by Mangrove/Khazan, consumed by House, at the default value of 1 per unit on both sides (per B2 above). What a Food deficit actually does is explicitly not decided yet — for this pass, just track the number accurately and show it in the HUD; don't hard-block House construction on it without being told to.
2. Population as a tracked value, starting at 50. Population growth mechanics beyond "tied to House count" aren't specified — don't invent a detailed growth curve, a simple placeholder (e.g. population scales with House count) is fine for now.
3. New starting state: the player begins already owning a small coastal claim and a pre-built residential area of 10 Houses on Land, inland from the coastal claim — not something the player builds turn one. Starting Coin is 1,000, explicitly a temporary testing value (see the `startingState.json` example in `GAUNTLET_PROMPT.md` Section 8) — not tuned game balance.

Fix: add `food` and `population` to the tracked-meters accumulator; add a
`startingState.json` (or equivalent) config driving the initial claim, the
10 pre-built Houses, starting Population (50), and starting Coin (1,000);
wire the HUD to show Food and Coin at minimum (Population display is
nice-to-have, not blocking).

Verify: a fresh game load shows Coin at 1,000, a visible residential
cluster of 10 Houses already built on Land near the starting claim, and
Food/Population values present (even if 0/50 respectively) in tracked
state.

## Log

- Map redesign, fixed/authored map + claim mechanic (v2.1): closed. Superseded by later items below.
- Camera pan: closed. Confirmed by live playtest this pass — click-drag pans the view smoothly in all directions; previously reported as completely non-functional (neither scroll nor drag worked), now working via drag. Zoom still not verified/may not exist — low priority, drag-pan alone is enough to satisfy the original blocker (reaching and seeing the full map).
- Claim-anywhere: closed. Confirmed by live playtest this pass — the claimable-hex count jumped from a small adjacent ring (~9) to the full visible unclaimed map (240), and a hex far from any claimed tile, with no claimed neighbor at all, showed the claimable hover outline correctly. Matches the v2.2/v2.4 spec.
- Defense-eligibility-by-terrain filtering (original Bucket B item): closed for the pre-v2.4 3-terrain roster. Confirmed by live playtest — an Estuary tile now correctly offers only Mangrove and Khazan, no coastal/river mismatches. Superseded by B2 above for the v2.4 roster additions (House, widened Resort eligibility).
- 2026-08-20, A1: closed. Root-caused live via Playwright (not static reading) — auto-close already worked; the real gap was clicking an occupied tile doing nothing instead of showing info. Added `BuildPopover.showInfo()` for built-tile info cards, a `document`-level outside-click listener (the old canvas-only listener couldn't see clicks on the HUD), and an Escape-key listener. All 4 sub-checks (auto-close, occupied-tile info, outside-click, Escape) confirmed via a live Playwright session against the running dev server, plus viewport-clamp re-verified via `testpopoverclip` screenshots.
- 2026-08-20, A2: closed. The 72%-toward-shared-fog blend from the previous pass over-corrected — different unclaimed terrains converged too close together. Rebalanced `terrainMeshManager.ts`'s `dim()` to desaturate each terrain's own color first (keeping its hue/lightness distinguishable), then blend a smaller 32% toward fog. Verified via `a2_rebalanced_close.png`/`a2_rebalanced_far.png` — unclaimed Coast now reads as clearly different from unclaimed Beach, claimed cluster still pops. Noted: the interior still looks Beach-monotonous at wide zoom because it genuinely is almost all Beach right now — that's B1's terrain-diversity job, not a color bug.
- 2026-08-20, A3: 7/8 closed. Confirmed the existing 7-element roster's icons (built in the earlier trimmed-roster pass) are legible and distinguishable via `bucketb_elements2.png`. House (the 8th) doesn't exist as an element until B2 lands — deferred its icon check to B2's own Verify step rather than jump ahead of Bucket A's own sequencing rule to manufacture a placeholder element early.
