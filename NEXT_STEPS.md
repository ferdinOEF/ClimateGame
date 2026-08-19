# Khazan — Next Steps (living punch list)

Per the v2.1 build prompt's revision log, this file is the running,
step-by-step punch list and takes precedence over the build prompt on
anything it contradicts, until the prompt is next revised.

## Bug found in manual testing

**Build popover has no reliable dismiss path and can silently confirm a
purchase on an unrelated click.**

Root cause (confirmed by code inspection): `BuildPopover` dismissed itself
via a `capture: true` click listener on the shared `container`, while
`main.ts` had its own independent `click` listener on the canvas that
raycasts and immediately opens a *new* popover if the click landed on a
different buildable tile. Because the capture-phase dismiss fires before
the canvas's own listener runs, a single click meant to "close the current
popover" that happens to land on another buildable tile closes the old
popover *and* immediately opens a new one in a nearby screen position on
the very same click. A player clicking again to actually dismiss can end up
clicking a build-option button that just appeared under their cursor,
confirming an unintended purchase.

**Fix:** remove the popover's own outside-click auto-dismiss. Dismissal is
now handled explicitly, as the first thing the unified canvas click handler
does: if the popover is open, that click closes it and does nothing else —
a second, separate click is required to claim a tile or open a different
tile's popover. No more same-click close-and-reopen chains.

Status: **fixed.** Verified: `BuildPopover` has no listeners of its own
anymore; `main.ts`'s single click handler checks `buildPopover.isOpen` first
and, if true, closes it and returns — nothing else happens on that click.

## v2.1 map rework (Section 4 rewrite) — DONE

The terrain map is now fixed/pre-generated, not player-drawn. The hand-of-3
terrain-tile-draw loop is removed entirely, replaced by claiming an
authored map one hex at a time.

- [x] `/tools/mapgen` — WFC-lite solver run once, offline, over a full hex
      grid under region constraints (coast/estuary west, plateau/forest
      east, exactly 2 continuous river paths east-to-west terminating at a
      shared estuary tile, khazan/village-plains midland). Serializes
      `src/data/map.json`; loaded at runtime, never regenerated live.
      Independently re-verified by `tests/mapgen.test.ts` (0 incompatible
      edges, band constraints hold, a real continuous 20+ tile river network
      reaches the declared estuary).
- [x] `GameState` reworked: `placed` now holds the *entire* fixed map from
      construction (this is why `src/core/hazard.ts` needed zero changes —
      hazards already spread across whatever's in `placed`, which now
      means the whole landscape, not just player-grown land). Added
      `claimed`, `claimFrontier()`, `claim()`. Removed the hand/edge-legality
      runtime machinery (`isLegal`, `legalFrontierFor`, `placeFromHand`,
      hand drawing) — that logic now lives only in mapgen's offline solver.
- [x] Render: full map renders at boot, unclaimed tiles dimmed/desaturated
      (and slightly sunken), claiming triggers a rise+brighten reveal
      animation reusing the existing settle-animation feel. The old
      frontier "ghost hex at an empty coord" concept is gone (every coord
      already has real terrain now) — replaced by a thin glowing ring
      overlay marking which *unclaimed* tiles are currently adjacent to
      claimed land, visual-only, not a separate raycast target.
- [x] HUD: hand strip removed entirely (there's no longer a choice of
      *what* to place, only *where* to claim next). Replaced with Section
      3's "next hex to claim" prompt (a count + cost, not a form).

**Bugs this rework caught (screenshots and tests, not eyeballing code):**
- The camera was hard-framed on axial `(0,0)`, which is an arbitrary point
  in the middle of the fixed map's wide east-west strip — the player's
  actual starting cluster near the estuary could be far off-frame. Fixed
  with `scene.ts`'s new `focusOn(x, z)`, called once at boot with the
  starting claim's centroid.
- `khazan_flatland` had no bias toward appearing near rivers/the estuary in
  the generator, despite the khazan defense specifically requiring water
  adjacency and khazans being *inherently* riverside land — this made the
  khazan defense nearly unbuildable in a full playthrough
  (`tests/balance.test.ts` caught it: only ~2 of 40 khazan_flatland tiles
  were water-adjacent). Fixed by biasing the generator's fill toward placing
  khazan_flatland next to already-assigned river/estuary tiles.
- `computeEraScore`'s Biodiversity/Carbon terms were unbounded accumulators
  (they sum every standing defense's coBenefits) weighted ×4/×3, while
  Trust/Resilience are capped at 100 — with enough defenses built, this let
  Biodiversity alone swing the score by over a thousand points, silently
  recreating the exact "never build engineered wins" collapse Section 7
  warns against once structure counts got large. Fixed by clamping each to
  ±40 before a much smaller ×1.5 weight.

See `PROGRESS.md` for the phase-by-phase build history this sits on top of.
