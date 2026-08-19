# Khazan — Build Progress

v2 build. v1 (a Leaflet sidebar-panel prototype with no 3D world) is archived at
`_archive_v1_panjim_digital_twin/`, not deleted, per the v2 brief's Section 0.

## Phase 0 — Scaffold + visual proof of life — DONE

**What's here:**
- Fresh Vite + TypeScript + Three.js repo, folder structure per Section 8.
- `src/core/hex.ts` — axial hex math (neighbors, distance, edge-adjacency, axial<->world).
  10/10 unit tests passing (`tests/hex.test.ts`): neighbor generation, distance,
  edge-adjacency and its inverse (`oppositeEdge`).
- `src/core/edgeTypes.ts` — the 6 edge-socket types (WATER/SAND/GRASS/FARM/ROCK/FOREST)
  and a compatibility matrix, ready for Phase 1's placement legality checks.
- `src/data/terrain.json` — all 7 terrain types from Section 4 with elevation tier,
  edge types, and a palette key.
- `src/render/` — palette, hex prism geometry, one `InstancedMesh` per terrain
  category (not per-hex meshes), Dorfromantik-style camera (58° elevation,
  pan/zoom only) + one directional sun + hemisphere fill + fog.
- `src/main.ts` — hand-placed proof cluster: estuary at the river mouth, coast
  and khazan flatland beside it, a 2-tile river reaching inland, then plains,
  forest, and laterite plateau — following Section 4's coast-to-highland
  gradient, all built via `neighbor()` so adjacency is real, not eyeballed.

**Verification approach:** the interactive Browser-pane tool in this session was
unreliable (screenshots timing out, tabs resolving to stale proxy ports). Rather
than depend on a human keeping a panel focused for every check, built
`tools/smoke.ts` — a headless Playwright script (`npm run smoke [label]`) that
boots the dev server, loads the page, asserts zero console errors, and saves a
PNG to `tools/screenshots/`. This is the repeatable, non-interactive path
Section 10 already asks for, so it's now the default way to verify renders,
not a fallback.

**Two real bugs the first screenshot caught:**
1. **Hex tessellation mismatch.** `hexGeometry.ts` rotated the hex prism 30°
   under the assumption that gave a "Dorfromantik-style" tile, but
   `axialToWorld`'s spacing formula assumes a pointy-top silhouette (vertex on
   ±Z), which is what `THREE.CylinderGeometry`'s default 6-segment cross-section
   already produces unrotated. The 30° rotation silently flipped the geometry to
   flat-top while the spacing math stayed pointy-top — a mismatch that would
   show up as gaps/overlaps once the map grew past a simple chain. Removed the
   rotation; geometry and math now agree.
2. **Palette failed its own grayscale QA.** Desaturating the first render
   (`0.3R+0.59G+0.11B` luma) showed laterite red and river blue landing only ~4
   luma points apart — indistinguishable once color is removed, despite very
   different hues. Recomputed all 7 terrain colors for an even ~20-26 point luma
   spread (forest 62 → mangrove 88 → laterite 115 → river 137 → paddy 162 →
   plains 182 → sand 208), rechecked with a desaturated re-render. See
   `src/render/palette.ts` for the luma annotations.

**Screenshot (`npm run smoke`, 1280x800, headless Chromium):**

![Phase 0 cluster](tools/screenshots/phase0.png)

**Grayscale check:**

![Phase 0 grayscale](tools/screenshots/phase0_grayscale.png)

DoD: screenshot matches Section 6 direction (grayscale-readable, laterite red
present, no UI panel) — done. `npm test` — 10/10 passing. `npm run dev` boots
clean, zero console errors — done.

## Decisions logged (Section 11 escape hatches)

- **River continuity, simplified for the pilot:** rather than full per-edge
  rotation/socket matching for a curvy single-hex-wide river (Dorfromantik's
  actual system), river/estuary are both WATER-family tiles with uniform
  edges; continuity will be enforced at placement time in Phase 1 by requiring
  a new water tile to touch the existing water network. Revisit if playtesting
  shows the map's rivers read as blobs rather than channels.
- **No tile rotation in Phase 0/1 data model.** All 7 terrain types use a
  uniform 6-edge pattern (same type on all sides) rather than mixed-edge
  variants requiring rotation search. Keeps the WFC-lite placement check in
  Phase 1 simple; can add mixed-edge variants later if the frontier feels too
  permissive.

## Phase 1 — Dorfromantik placement loop — DONE

**What's here:**
- `src/core/gameState.ts` — pure-logic `GameState`: placed-tile map, frontier
  set (all empty neighbors of placed tiles), hand of 3, and `isLegal()` /
  `placeFromHand()`. No Three.js import — matches the core/render split the
  folder structure calls for (also moved terrain data loading out of the
  render layer into `src/core/terrain.ts`, where it belongs).
- Legality = every touching edge pair compatible (`edgeTypes.ts`) **and**,
  for river/estuary, at least one already-placed neighbor is also
  water-family — the simplified river-continuity rule logged as a Phase 0
  escape hatch.
- Hand drawing guarantees at least one legal placement exists: draws
  randomly up to 50 times, and if that fails, falls back to a terrain id
  known to have a legal spot (any already-placed tile's own type, which is
  always self-compatible). After each placement the used slot refills, and
  the whole hand is redrawn if that refill ever leaves it dead.
- `src/core/hex.ts` gained `worldToAxial` (cube-rounded inverse of
  `axialToWorld`) for click-picking; round-trip tested.
- `src/render/frontierMeshManager.ts` — the frontier rendered as translucent
  ghost hexes (same idea as Dorfromantik's own open-slot presentation),
  bright for cells legal for the selected hand tile, dim otherwise.
- Click-to-place: raycast against the frontier `InstancedMesh` directly and
  read `instanceId` back to an axial coord — no separate ground-plane hack
  needed.
- Tile-settle animation lives in `TerrainMeshManager` itself (`placeTile(...,
  {animate:true})` + a per-frame `tick()`): drops from above with a slight
  `easeOutBack` overshoot on both position and scale, the "click into place"
  feel the brief asks for.
- `src/ui/hud.ts` — the only two persistent UI pieces: a top-right tile
  counter and a bottom-center hand strip of 3 buttons (click to select,
  selected one gets a highlighted border). No full-width panel.
- A dev-only `?autoplace=N` URL param (Section 10's sanctioned debug
  overlay — no button, not part of the real UI) drives real placements
  through the exact same code path a click does, so Phase 1's "no dead hand
  across 30+ placements" bar can be checked against the actual render loop,
  not just the unit tests.

**A real design gap the first cluster screenshot caught:** a 21-tile
autoplace run showed only 4 of 7 terrain types (estuary/river/forest/coast) —
`village_plains` (GRASS edges) had no compatibility pair with `WATER`, so it
couldn't attach anywhere near the water-heavy cluster growing from the
estuary seed. Real riverside plains do sit right at the water's edge, so
added `GRASS<->WATER` to the soft-pair list in `edgeTypes.ts`. A follow-up
41-tile run shows 5-6 visibly distinct terrain types.

**Verification:**
- `npm test` — 17/17 passing, including `tests/gameState.test.ts`'s scripted
  35-placement run asserting `handHasAnyLegalPlacement()` never goes false,
  every touching edge stays compatible, and water-continuity holds.
- `npm run smoke -- <label> autoplace=40` — 41 tiles placed through the real
  click-path code with zero console errors; screenshot below.
- The internal gap visible in the screenshot (a frontier cell surrounded by
  placed tiles, not yet filled) is correct Dorfromantik-style behavior, not a
  bug — that cell stays in the frontier until a compatible tile is drawn.

![Phase 1 cluster, 41 tiles](tools/screenshots/phase1.png)

## Next: Phase 2 — Town buildings + economy

Contextual tile popover for the 4 Section 4 buildings, Coin economy, low-poly
building props rendered on their tile (not list icons).
