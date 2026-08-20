# Khazan — Next Steps (living punch list)

Per the build prompt's revision log, this file is the running, step-by-step
punch list and takes precedence over the build prompt on anything it
contradicts, until the prompt is next revised.

**Section 0.1's standing sequencing rule: Bucket A before Bucket B, always.**
Until Bucket A is empty, do not add hazard simulation, additional terrain,
or additional elements, no matter how tempting.

**Bucket A is now clear (all four items below fixed and verified) — Bucket B
work may begin.**

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

- [ ] **Coastal-only terrain.** Retire khazan_flatland, village_plains,
      laterite_plateau, forest, and the 3-tier elevation system. Only
      Coast (sea edge, not buildable), Beach, River, Estuary remain.
      Rewrite `/tools/mapgen`: one sea-facing edge, Beach fronting it, one
      continuous River path reaching the sea at a single Estuary tile.
      Hazard spread moves from elevation-tier-based to distance/adjacency
      from the hazard's source (the sea for cyclone, the river for flood).
- [ ] **Generic effects schema (standing architectural requirement, not a
      one-time task).** Every buildable element gets an open
      `effects: { key: delta }` map; one generic accumulator applies
      whatever keys are present (`for (const [key, delta] of
      Object.entries(element.effects)) meters[key] += delta`) — never a
      hardcoded per-meter branch in engine code. `buildings.json` +
      `defenses.json` merge into one `elements.json`.
- [ ] **7-element roster**, replacing the entire earlier defense/building
      list: Dune, Sandy Vegetation (Pandanus), Beachside Resort, Seawall
      (Beach); Mangrove, Khazan (Estuary); Small Dam (River). Each needs
      its own distinct, legible flat-silhouette icon (Section 6) — not
      placeholder low-poly props.
- [ ] **Meters simplified**: Resilience (the only hazard-facing property
      now — v2.3 removed the separate Risk value introduced in v2.2),
      Biodiversity, Money/Coin. Trust carried forward but untouched by this
      roster, no HUD prominence needed yet. Carbon deprioritized.

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
