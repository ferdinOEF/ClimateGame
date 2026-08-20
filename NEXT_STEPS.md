# Khazan — Next Steps (living punch list)

Per the build prompt's revision log, this file is the running, step-by-step
punch list and takes precedence over the build prompt on anything it
contradicts, until the prompt is next revised.

**Section 0.1's standing sequencing rule: Bucket A before Bucket B, always.**
Until Bucket A is empty, do not add hazard simulation, additional terrain,
or additional elements, no matter how tempting.

**Both buckets are now clear** — every item in Bucket A and Bucket B below is
fixed and verified. This file has no open punch-list items; the next
revision of the build prompt (or a fresh playtest) is what should add more.

## Bucket A — UI/UX & Playability (do this first)

Gaps found by playtest/review of the v2.1 build:

- [x] **No camera pan/zoom.** Fixed: pointer-drag pan and wheel zoom added
      to `src/render/scene.ts` (`updateTransform`, `panScale`, distance
      clamped to `[8, 40]`). Verified via `tools/smoke.ts`'s `simpan` hook
      (simulated drag + wheel) and before/after screenshots.
- [x] **Popover clipping.** Fixed: `BuildPopover.show()` measures itself
      via `getBoundingClientRect()` after unhide-but-before-paint and clamps
      to the viewport with an 8px margin. Verified at both top-left and
      bottom-right screen corners via the `testpopoverclip` dev hook.
- [x] **Claiming is adjacency-gated; v2.2 changes this.** Fixed:
      `GameState.isClaimable`/`canClaim`/`claim` no longer check adjacency
      — any unclaimed tile on the fixed map is claimable. The old
      always-on frontier-ring display is replaced by a single hover-only
      ring (`main.ts` `pointermove` listener + `ClaimRingMeshManager`,
      cleared on claim). `devAutoClaim` and the `tests/gameState.test.ts` /
      `tests/balance.test.ts` scripted-playthrough harness were updated to
      match (no more `claimFrontier()`, which was removed). Verified via a
      headless Playwright click at a tile far from the starting cluster
      (unclaimed count 240 → 239, no console errors) and via the hover-ring
      screenshot showing the ring rendering under the cursor at that
      distant tile before the click.
- [x] **Unclaimed-tile visual distinction needs to actually read clearly.**
      Root cause found via screenshot check: the old dimming (scale HSL
      saturation down, nudge lightness toward mid-gray) dimmed each tile
      *relative to its own terrain color*, so a light terrain (sun-bleached
      sand) dimmed still read lighter than a dark terrain (deep forest)
      shown at full color — legible tile-by-tile, not at a glance across a
      mixed-terrain map. Fixed in `src/render/terrainMeshManager.ts`:
      unclaimed tiles now blend hard (72%) toward the shared `fog` palette
      tone instead, so every unclaimed tile converges on roughly the same
      hazy color regardless of terrain, and claimed tiles — the only ones
      still showing full per-terrain saturation — read as a group at any
      zoom level. Verified via default-zoom and zoomed-out screenshots.

## Bucket B — Trimmed content (only after Bucket A is clear)

Scope narrowed on purpose (v2.2/v2.3) — small enough to fully polish before
anything wider gets added back:

- [x] **Coastal-only terrain.** Retired khazan_flatland, village_plains,
      laterite_plateau, forest, and the 3-tier elevation system entirely —
      `TerrainDef` now carries a direct `height` field instead of an
      `elevationTier` indirection. Only Coast (sea edge, not buildable),
      Beach, River, Estuary remain. `/tools/mapgen` rewritten: finds the
      sea-facing edge via a narrow world-X band (so it renders as a
      straight coastline despite axial skew), carves one continuous River
      from a single inland source to the nearest shore tile (which becomes
      the one Estuary), and fills everything else Beach — no more WFC
      edge-matching (`edgeTypes.ts` deleted, nothing needed it once there's
      only one land terrain). Hazard spread moved from elevation-tier
      gating to pure adjacency/distance decay — flood's old
      `toTier <= fromTier` gate is simply gone, since the underlying wave
      engine was already hop-decay-based (a form of graph distance); cyclone
      needed no change at all, it was already tier-agnostic. Verified via
      `tests/mapgen.test.ts` (rewritten: single sea edge, exactly one
      Estuary reachable from Coast, one connected River, Beach fills
      everything else) and fresh/zoomed screenshots.
- [x] **Generic effects schema (standing architectural requirement, not a
      one-time task).** `buildings.json` + `defenses.json` merged into one
      `src/data/elements.json` / `src/core/elements.ts`, each element
      carrying an open `effects: { key: delta }` map. `GameState.meterTotal
      (key)` is the one generic accumulator — sums every standing element's
      `effects[key]` weighted by maturity fraction, with zero hardcoded
      meter names. `biodiversity`/`carbon` getters and even Coin's per-turn
      income (`advanceTurn(): this.coin += this.meterTotal("coinPerTurn")`)
      all go through this same function now; adding a new meter anywhere in
      the game means adding a key to an element's `effects`, never new
      engine code. Absorption/failure/maintenance fields stay explicit
      (they're conditional mechanics, not simple additive deltas).
- [x] **7-element roster**, replacing the entire earlier defense/building
      list: Dune, Sandy Vegetation (Pandanus), Beachside Resort, Seawall
      (Beach); Mangrove, Khazan (Estuary); Small Dam (River). Cyclone
      Shelter is retired along with it (not in the new roster) — its
      Trust-shielding special case is gone from `resolveCyclone`, which now
      just charges Trust per damaged building uniformly. Each element gets
      its own distinct flat-silhouette icon in `src/render/elementGeometry.ts`
      (a 2D outline extruded a shallow depth) rather than a low-poly prop —
      viable specifically because Section 6's camera never rotates, so a
      flat cutout's front face always faces the viewer. Old
      `defenseGeometry.ts`/`buildingGeometry.ts` and their mesh managers
      merged into `elementGeometry.ts`/`elementMeshManager.ts`. One real bug
      found and fixed during verification: Small Dam sits directly on River
      terrain, but every River tile was unconditionally treated as a
      damage-skipping hazard source, so a dam built there could never
      actually engage its absorption/failure logic — fixed by only skipping
      an undefended river tile (`hazard.ts`'s flood `skipDamage` now checks
      `!state.elements.has(key)` too). Verified via screenshots showing
      Mangrove's canopy-blob icon, Small Dam's blocky-barrier icon, and
      Beachside Resort's cabana-and-umbrella icon all rendering distinctly
      with zero console errors.
- [x] **Meters simplified**: Resilience (the only hazard-facing property
      now — v2.3 already removed the separate Risk value introduced in
      v2.2, and grepping the codebase found no remaining trace of it
      anywhere). Biodiversity and Coin/Money are the effects the new roster
      actually grants; Trust is carried forward untouched by it (none of
      the 7 elements' `effects` maps set a `trust` key); Carbon stays wired
      through the same generic accumulator but deprioritized — nothing in
      the new roster sets it, so it reads 0 unless re-introduced later.

## Resolved (kept for history)

- **Build popover had no reliable dismiss path and could silently confirm
  a purchase on an unrelated click** (found in manual testing of v2).
  Root cause: `BuildPopover` dismissed itself via a `capture: true`
  listener on the shared container that ran *before* the canvas's own
  click handler, so a dismiss-click landing on a different buildable tile
  closed the old popover and silently opened a new one under the cursor.
  Fixed in the v2.1 commit: the popover has no listeners of its own now;
  the single canvas click handler checks `isOpen` first and, if true,
  closes it and does nothing else on that click.

See `PROGRESS.md` for the phase-by-phase build history this sits on top of.
