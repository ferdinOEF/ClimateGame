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

## Phase 2 — Town buildings + economy — DONE

**What's here:**
- `src/core/buildings.ts` + `src/data/buildings.json` — the 4 Section 4
  buildings (Village Hut, Paddy Field, Coconut & Areca Grove, Fishing Dock),
  each with a build cost, per-turn Coin income, valid terrain ids, and (for
  Fishing Dock only) a coast/estuary-adjacency requirement.
- `GameState` gained `coin`, `turn`, and `buildings` (coord -> building id):
  `buildableAt(coord)` filters by terrain + adjacency, `canBuild`/`build`
  handle affordability, and each successful tile placement now also counts
  as a turn — `advanceTurn()` pays out every built building's income. One
  building per tile, matching Section 2 ("you may build **one** thing").
- `src/render/buildingMeshManager.ts` + `buildingGeometry.ts` — one
  `InstancedMesh` per building category (same rule Section 8 applies to
  terrain), each a small merged low-poly shape: hut = box + pyramid roof,
  paddy = a shallow raised patch, grove = two trunk+canopy trees, dock = a
  plank pier with a mooring post. Buildings sit on their tile's actual top
  surface (`TerrainMeshManager.heightAt`), which varies by elevation tier.
- Factored the tile-settle animation out of `TerrainMeshManager` into
  `settleAnimation.ts` (`SettleAnimator`) so buildings reuse the same
  drop-and-settle feel instead of duplicating the tween code.
- `src/ui/buildPopover.ts` — the contextual build menu: a small popover
  anchored to the clicked tile's *screen* position (world-to-NDC-to-pixel
  projection each time), listing only the options valid for that tile,
  dimmed if unaffordable. Closes on an outside click or after a selection.
  Never a persistent panel — Section 3's rule holds.
- Click handling now raycasts frontier ghosts and placed terrain instances
  together; a hit on an owned tile with no building yet opens the popover,
  a hit on the frontier places a tile (unchanged from Phase 1).
- HUD gained a top-left Coin counter alongside the existing tile counter and
  hand strip — still only small corner strips, no panel.

**A real readability bug the first screenshot caught:** Paddy Field's
`colorKey` was `paddyGreen` — identical to the khazan_flatland terrain it's
built on, so the building was nearly invisible against its own tile. Added a
dedicated `paddyRipe` (golden amber) palette entry for it; re-verified it
reads clearly now.

**Verification:**
- `npm test` — 21/21 passing (`tests/buildings.test.ts` covers terrain
  gating, coast/estuary adjacency, cost deduction/affordability rejection,
  and turn-based income payout).
- `npm run smoke -- <label> "autoplace=45&coinboost=300&autobuild=1"` — dev-only
  URL hooks (Section 10's sanctioned debug overlay, no UI button) drive real
  placements and builds through the same code paths clicks use. 46 tiles,
  11 buildings across all 4 types, zero console errors.

![Phase 2 settlement](tools/screenshots/phase2.png)

## Phase 3 — Monsoon Flood hazard + defense trio — DONE

**What's here:**
- `src/core/defenses.ts` + `src/data/defenses.json` — 4 structures covering
  all 3 categories against flood: Mangrove Buffer + Riparian Forest Buffer
  (NBS), River Embankment & Pump Station (Engineered), Khazan (Hybrid, the
  signature mechanic). `GameState` gained a parallel `defenses` map (coord ->
  `{defenseId, builtOnTurn, degradeAmount}`) alongside `buildings` — a tile
  can carry one of each, matching how a real khazan protects farmland behind
  it. `buildableDefensesAt`/`canBuildDefense`/`buildDefense` mirror the
  building API; `effectiveAbsorption(coord)` factors in maturity progress
  (`matureTurns`) and any permanent degrade.
- `src/core/hazard.ts` — `resolveMonsoonFlood`: a wave-by-wave BFS from every
  river tile, decaying 0.72x per hop, refusing to flow onto a higher
  elevation tier. A tile's own defense (if it targets flood) absorbs a
  fraction of the arriving severity; engineered defenses above
  `failureThreshold` are destroyed and pass an *amplified* spike onward
  (`failureRedirectMultiplier`) instead of the normal decayed leftover —
  the redirect falls out of the same wave propagation rather than needing
  special-cased "inland neighbor" logic. NBS/hybrid defenses above
  `overwhelmSeverity` lose most of their absorption for that event only;
  khazan additionally takes a permanent `gracefulDegradeStep` (its
  "no catastrophic breach, but neglect and overwhelm both cost you
  effectiveness" tradeoff). `GameState.advanceTurn()` also now processes
  defense upkeep: paid if affordable, or a silent permanent weakening if not
  (`maintenanceNeglectPenaltyPerTurn`) — decays even with no hazard involved.
- Render: `defenseMeshManager.ts`/`defenseGeometry.ts` (mangrove = shrub
  cluster, riparian = a tree hedge, embankment = a raised concrete ridge,
  khazan = a bund ring + sluice-gate marker — engineered reads angular/gray,
  NBS reads organic/green, khazan reads earthy-brown, on purpose).
  `floodOverlayManager.ts` shows a rising-water disc on every damaged tile,
  sized *and* colored by how much damage it took (pale shin-deep splash to
  dark serious inundation — a first pass used one fixed color/opacity and
  read as "everything is equally flooded," fixed after the first screenshot
  made that illegible). A catastrophic engineered failure collapses its
  prop to nothing (`SettleAnimator.collapse`, factored out alongside the
  existing settle-in tween); khazan overwhelm tints its bund toward a patchy
  weathered brown proportional to its degrade.
- Telegraph: 2 turns before an automatic flood, every river tile's color
  blends toward a dark storm tint (`TerrainMeshManager.setTint`) — in-scene,
  no text warning. Floods auto-trigger on a 15-turn cadence at a randomized
  moderate severity (1.0-1.6); `?flood=N` (dev-only) forces one immediately
  at a chosen severity for testing.
- The build popover now lists buildings and defenses together, tagged by
  category (`building`/`nbs`/`engineered`/`hybrid`), still one small
  popover — no second panel.

**Two real bugs/gaps the verification screenshots caught:**
1. `forest`'s elevation tier was `highland`, one tier above `river`
   (`midland`) — under the downhill-only flow rule, flood could *never*
   reach a forest tile adjacent to the river that spawned it, which broke
   the riparian buffer entirely (its own unit test caught this before any
   screenshot did). Reassigned forest to `midland` — Ghats-foothill forest
   sitting at a transitional elevation near the river is also more accurate
   than "as high as the laterite plateau."
2. The flood overlay's fixed color/opacity made a severe, map-wide flood
   screenshot unreadable — every tile looked equally flooded regardless of
   actual damage. Added per-instance color intensity (pale to deep blue)
   scaled by severity; a follow-up moderate-severity screenshot shows the
   falloff clearly.

**Verification:**
- `npm test` — 30/30 passing. `tests/hazard.test.ts` covers the DoD's exact
  scenario matrix: no-defense baseline, NBS absorbing normally, NBS
  overwhelmed-but-surviving, engineered absorbing below threshold, engineered
  catastrophic failure (destroyed + a comparative control run proving the
  redirected spike deals *more* downstream damage than no defense at all),
  khazan overwhelmed-but-never-destroyed, khazan's degrade persisting into a
  second event (measurably more damage the second time), and maintenance
  neglect decaying a defense with no hazard involved.
- `npm run smoke -- <label> "autoplace=N&coinboost=N&autodefend=1&flood=N"` —
  dev-only hooks drive real placements, defense construction, and hazard
  resolution through the same code paths play uses. Two screenshots: a
  moderate flood (clear severity gradient, all defenses surviving) and a
  severe one (map-wide coverage, engineered structures destroyed). Zero
  console errors both runs.

![Phase 3 moderate flood](tools/screenshots/phase3.png)
![Phase 3 severe flood](tools/screenshots/phase3_severe.png)

## Phase 4 — Cyclone hazard + Cyclone Shelter — DONE

**What's here:**
- `resolveHazardWave` in `src/core/hazard.ts`: extracted the wave-BFS engine
  Phase 3's flood resolver used into a shared function parameterized by
  source tiles, decay rate, a `canPropagate` gate, and a `skipDamage`
  predicate. `resolveMonsoonFlood` is now a thin wrapper over it (river
  sources, downhill-only, river itself exempt from damage); `resolveCyclone`
  is a second thin wrapper (coast/estuary sources — *every* coastal tile is
  independently a source, since the storm hits the whole coastline, not one
  point that propagates along it — no elevation gating since wind reaches
  uphill as readily as down, faster decay for a more sudden/localized
  hazard, and the source tiles themselves take damage, unlike the river).
  The catastrophic-failure redirect and NBS/khazan overwhelm logic is
  shared unchanged between both hazards.
- 3 new defenses in `defenses.json`: Coastal Dune & Windbreak (NBS, cheap),
  Seawall (Engineered, expensive, catastrophic-failure profile matching the
  river embankment), and **Cyclone Shelter** — the deliberate outlier.
  `absorptionAtMaturity: 0`, so it does *nothing* to `tileDamage`. Instead
  `resolveCyclone` runs a second pass: any damaged tile with a town building
  loses Trust, *unless* a Cyclone Shelter sits within `protectionRadius`
  hexes, in which case it keeps 85% of the Trust it would have lost. A first
  minimal slice of Section 7's meter system (`GameState.trust`) exists now
  just to make this real and testable — the other three meters and the full
  HUD meter display are Phase 5 work.
- Render: 3 new low-poly defense shapes (dune = a squashed sandy mound with
  wind-bent grass tufts, seawall = a taller version of the embankment's
  concrete ridge, shelter = a small flat-roofed refuge with a flag —
  high-visibility, reading as "for people" not "for land"). Generalized the
  flood-only overlay renderer into `HazardOverlayManager`, parameterized by
  a shallow/deep color pair, so cyclone damage renders as wind-swept
  tan-to-storm-gray rather than reusing flood's blue (they're visibly
  different hazards). A rotating torus "spinning storm icon" appears over
  the coastal centroid during the 1-turn telegraph window (Section 5: fast,
  little warning, unlike the flood's 2-turn one) — in-scene, not text.
- Build popover now also surfaces cyclone defenses on coastal tiles
  alongside everything else, still one small popover per tile.

**Balance check (Phase 4's own DoD requirement):** `tests/balance.test.ts`
runs three scripted 55-placement playthroughs from the *same seed* (so tile
layout and hand draws are identical — defense choices never consume the
RNG), each preferring to build only NBS, only engineered, or only khazan
defenses whenever legal and affordable, against the same fixed
flood/cyclone schedule. Results (logged in the test output):

| category   | tiles damage (cumulative) | defenses built | coin remaining |
|------------|---------------------------|-----------------|-----------------|
| NBS        | 65.3                      | 17               | 1530            |
| Engineered | 78.0                      | 12               | 1                |
| Khazan     | 77.1                      | 5                | 1234             |

No landslide: NBS wins on cumulative damage by being cheap enough to cover
many more tiles per coin; engineered spends nearly everything (matching its
"expensive, strong, risky" design) for a similar damage outcome; khazan
gets built far less often (its only valid terrain is `khazan_flatland`, a
narrower footprint than NBS/engineered's broader valid-tile sets) but still
lands in the same range as engineered despite covering *both* hazards per
structure instead of needing separate flood and cyclone defenses — a
reasonable read of "the structure that rewards paying attention to the
whole map," not proof of imbalance, but worth another look once Phase 5's
full scoring exists. **Honest gap:** this harness builds no town buildings,
so Trust — which only reacts to damaged buildings — never actually engages
here; Cyclone Shelter's Trust-protection is separately and directly proven
in `tests/cyclone.test.ts`'s dedicated comparative test instead.

**Verification:**
- `npm test` — 37/37 passing.
- `npm run smoke -- <label> "autoplace=55&coinboost=800&autodefend=1&cyclone=1.3"` —
  dev-only hooks drive real placement, defense construction (all 7 defenses
  now, both hazards), and cyclone resolution through the same code paths
  play uses. Zero console errors.

![Phase 4 cyclone](tools/screenshots/phase4.png)

**Section 10 self-assessment (Phases 3+4 combined):**
- *Does at least one hazard create a real NBS-vs-engineered-vs-khazan
  decision?* Yes — the balance table above shows three genuinely different
  resource-allocation strategies landing in a comparable outcome range, not
  one obviously-correct answer.
- *Does a catastrophic engineered failure feel like a real setback?* Yes on
  paper: it's not just "reduced protection," the structure is destroyed
  (visibly, in-scene — it collapses) and the redirected surge measurably
  hits the next tile harder than if no defense had existed at all, proven
  by a comparative control run in both `hazard.test.ts` and
  `cyclone.test.ts`. Not yet felt through actual play, only through
  automated verification.
- *Is there a Dorfromantik-style "that tile fit perfectly" moment?* Present
  since Phase 1 (frontier highlighting + the settle animation), unchanged
  by this phase.

## Next: Phase 5 — Era loop, scoring, polish

Standing severity baseline escalation (Section 2's "rest of the era"
modifier), era retire/soft-loss + score banking, light meta-progression
hook, the remaining 3 meters (Biodiversity, Carbon, Resilience) and full HUD
meter display, grayscale-readability re-check across the now-complete
palette, audio hooks.
