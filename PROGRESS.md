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

## Phase 5 — Era loop, scoring, polish — DONE

**What's here:**
- The remaining 3 of Section 7's 4 meters: `GameState.resilience` (starts
  100, drops with every hazard's unmitigated damage via
  `applyHazardOutcome`), and `biodiversity`/`carbon` as **derived getters**
  rather than accumulated totals — the sum of every standing defense's
  `coBenefits`, weighted by maturity. A destroyed engineered defense simply
  stops contributing; no separate bookkeeping needed to "undo" its effect.
  Trust (from Phase 4) now also reacts generally to hazard outcomes, not
  just Cyclone Shelter: a flat `WEATHERED_TRUST_BONUS` for coming through
  clean, an extra `CATASTROPHIC_TRUST_PENALTY` per destroyed engineered
  defense — the balance test's own numbers now show this directly (see
  below), not just the isolated unit tests.
- `severityBaseline`: Section 2's "slowly rising monsoon intensity / cyclone
  season modifier that never decreases within an era" — `+0.04` after every
  hazard resolution, folded into the random severity roll for the next one.
- `GameState.isEraOver` (Resilience <= 0) and `startNewEra()`: soft-ends the
  era in place — no hard game-over — resetting tiles/buildings/defenses/
  coin/meters/turn while preserving `erasCompleted` (Section 2's light
  meta-progression hook: a counter that survives the reset, ready for
  future unlock content to key off).
- `src/core/scoring.ts` — `computeEraScore`: Trust + Resilience +
  Biodiversity×4 + Carbon×3 + turns×0.5 + map-size×0.3. Map-size and turn
  terms are weighted well below the meters on purpose (Section 7: don't let
  score collapse to "biggest map wins"); "never build engineered wins" is
  avoided structurally, not by formula-fudging — Biodiversity/Carbon already
  penalize engineered defenses in their own data, while Trust/Resilience
  reward the stronger protection engineered buys, so the tradeoff is real
  on both sides of the formula.
- `terrain.reset()` / `buildings.reset()` / `defenses.reset()`: added to let
  a new era visually clear the map (InstancedMesh instances are simply
  hidden via `count = 0`, not destroyed — cheap and instant).
- HUD polish: the four meters now share one compact strip with Coin (`T/R/B/C`
  chips) instead of stacking separate corner blocks — still one small
  corner element, not a growing pile of them. A brief, non-blocking
  top-center banner (`hud.showBanner`) announces era retirement with its
  score, auto-hiding after ~3.5s — never a modal, matching Section 3.
- `src/ui/audioHooks.ts`: placeholder audio hooks (Section 9's "audio
  hooks, placeholder SFX fine") wired at every meaningful moment — tile
  settle, build, hazard telegraph, hazard resolve, era end — so real SFX
  can be dropped in later without threading call sites through the
  codebase retroactively.
- Final grayscale-readability check across the now-complete palette
  (terrain + buildings + defenses together): prop silhouettes (hut,
  embankment, Cyclone Shelter's flag, mangrove clusters) stay
  distinguishable by shape alone in addition to the luma-separated terrain
  colors from Phase 0 — a stronger readability guarantee than color alone.

**Verification:**
- `npm test` — 42/42 passing across 8 test files, including
  `tests/era.test.ts` (an undefended era reaches `isEraOver` via repeated
  hazards, `severityBaseline` only ever increases within an era,
  `startNewEra` resets correctly while preserving `erasCompleted`) and
  `tests/scoring.test.ts` (score responds to defenses built, isn't
  dominated by map size alone).
- `npm run smoke -- <label> "autoplace=200"` — a long dev-hook run that
  crossed several full era cycles end to end (visible in the screenshot
  below: **"Era 3 retired — score 110. A new era begins,"** with the map,
  meters, and Coin all correctly reset afterward) with zero console errors
  and no stuck state — directly satisfying this phase's DoD.
- A separate, richer `"autoplace=18&coinboost=800&autobuild=1&autodefend=1"`
  run (kept short enough to stay inside one era) shows the full current
  palette together: all 7 terrain types, both buildings with distinct
  props, and defenses from all 3 categories, immediately followed by its
  grayscale conversion.

![Phase 5 era loop cycling](tools/screenshots/phase5_era.png)
![Phase 5 full palette](tools/screenshots/phase5.png)
![Phase 5 grayscale check](tools/screenshots/phase5_grayscale.png)

**Section 10 self-assessment, final:**
- *Does at least one hazard create a real NBS-vs-engineered-vs-khazan
  decision?* Yes (Phase 4's balance table, now with Trust differentiated:
  NBS/khazan ended at Trust 60, engineered at 32 after taking a real
  catastrophic-failure hit — three different strategies, genuinely
  different but non-landslide outcomes).
- *Does a catastrophic engineered failure feel like a real setback?*
  Structurally yes — visible collapse, an amplified redirected spike proven
  via comparative control runs, and now a distinct, larger Trust penalty
  than an equivalent NBS shortfall gets, all proven in automated tests.
  Not yet felt through actual human play — this pilot was verified through
  code paths and screenshots, not a playtest session.
- *Is there a Dorfromantik-style "that tile fit perfectly" moment?* Yes,
  present since Phase 1 and unchanged since: frontier highlighting plus the
  settle-in animation.

**Honestly out of scope for this pilot** (logged per Section 11's escape
hatches, not silently dropped): voluntary era retirement (only the
automatic Resilience-hits-zero soft-loss exists — no UI action to retire
early); actual unlock *content* keyed off `erasCompleted` (the counter
exists and persists correctly, but nothing consumes it yet); real audio
assets (hooks only); mobile/Capacitor (explicitly deferred per Section 8);
a third hazard or further defense variants (Section 11: "the natural next
expansion once the two-hazard pilot is proven").

## Build complete: Phases 0-5

All six phases from the build brief are implemented, tested (42 tests
across 8 files, `npm test`), and verified through headless screenshots at
every phase boundary, each committed to git individually.
`npm run dev` for interactive play, `npm test` for the full suite,
`npm run smoke -- <label> [urlParams]` for a headless verification
screenshot (dev-only URL hooks: `autoplace=N`, `coinboost=N`, `autobuild=1`,
`autodefend=1`, `flood=N`, `cyclone=N` — see `src/main.ts`'s bottom section).

## v2.1 — fixed map + claim loop rework — DONE

The build prompt was revised (v2.1) on top of the completed v1-through-v5
build above: the terrain map is now fixed and pre-generated (Section 4
rewrite), not player-drawn — the hand-of-3 terrain-tile-draw mechanic is
gone, replaced by claiming an already-authored Goa-shaped map one hex at a
time. Full detail, including a bug found in manual testing and three more
caught by this rework's own tests/screenshots, is in `NEXT_STEPS.md` (the
living punch list this revision introduced — read it alongside this file).

**Summary of what changed:**
- `/tools/mapgen/generate.ts` (`npm run mapgen`) — a WFC-lite solver run
  once, offline: coast/estuary confined to the west band, laterite
  plateau/forest to the east band, exactly 2 continuous river paths
  east-to-west sharing one estuary mouth, khazan flatland/village
  plains/forest filling the midland band via a greedy edge-compatible fill
  (biased to place khazan flatland near rivers — see the bug list below).
  Output is checked in at `src/data/map.json`, loaded once at boot, never
  regenerated live.
- `GameState`'s `placed` now holds the *entire* fixed map from construction
  instead of growing tile-by-tile — `src/core/hazard.ts` needed zero
  changes as a result, since it already just spread across whatever was in
  `placed`. Added `claimed`/`claimFrontier()`/`claim()` (small flat Coin
  cost, counts as a turn); removed the hand-drawing/edge-legality runtime
  machinery entirely (that logic now lives only in mapgen's offline solver).
- Render: the whole map renders at boot, unclaimed tiles desaturated and
  slightly sunken; claiming triggers a rise+brighten reveal reusing the
  existing settle-animation feel. The old "ghost hex at an empty coord"
  frontier concept doesn't apply anymore (every coord already has real
  terrain) — replaced by `ClaimRingMeshManager`, a thin glowing ring
  overlay over currently-claimable tiles, visual-only and decoupled from
  raycasting (clicks raycast the terrain tiles directly; `GameState`
  answers whether that coord is claimed/claimable).
- HUD: the hand strip is gone (there's no choice of *what* to place
  anymore, only *where* to claim next) — replaced by Section 3's small
  "N hexes to claim — cost each" prompt.
- Fixed the manual-testing bug: the build popover dismissed itself via a
  capture-phase listener that ran *before* the canvas's own click handler,
  so a click meant to dismiss could land on a different buildable tile,
  close the old popover, and silently open a new one under the cursor —
  a second dismiss-click could then confirm an unintended purchase.
  Removed the popover's own listener; the single canvas click handler now
  checks `isOpen` first and, if true, closes and consumes that click.

**Three more bugs this rework's own verification caught** (detailed in
`NEXT_STEPS.md`): the camera was hard-framed on axial `(0,0)`, an arbitrary
point in the middle of the map, while the player's actual starting cluster
could be far off-frame (fixed with `scene.ts`'s new `focusOn`); khazan
flatland had no bias toward river/estuary adjacency in the generator despite
the khazan defense requiring it, making khazan nearly unbuildable in a full
playthrough (`tests/balance.test.ts` caught it — fixed via a generator
bias); and `computeEraScore`'s Biodiversity/Carbon terms were unbounded
accumulators weighted high enough that a large defense count could swing
the score by over a thousand points, silently recreating the "never build
engineered wins" collapse Section 7 warns against (fixed by clamping them
before weighting).

**Verification:** 47/47 tests passing across 9 files (added
`tests/mapgen.test.ts` — independently re-verifies the checked-in map
satisfies every Section 4 constraint — and reworked the claim-mechanic
tests in `tests/gameState.test.ts`). Production build succeeds. Screenshots
below: the fresh map with the camera correctly framed on the starting
cluster and its 7-hex claim frontier glowing, and a grown 15-tile claim
with buildings, defenses, and a 12-hex frontier — both via the real
click-path code, zero console errors.

![v2.1 fresh map, camera framed on the starting claim](tools/screenshots/v21_fresh_map.png)
![v2.1 grown claim with buildings and defenses](tools/screenshots/v21_growth.png)

## v2.2 — Bucket A: UI/UX & playability — DONE

The v2.2 revision (Section 0.1) set a standing sequencing rule: no more
mechanical depth (hazards, terrain, elements) until every playability gap
found in review of the v2.1 build is fixed and verified. Full detail is in
`NEXT_STEPS.md`; summary here.

**Camera pan/zoom** (`src/render/scene.ts`): the camera was framed once at
boot and never moved again. Added pointer-drag pan (`panScale` tied to
camera distance so pan speed stays consistent at any zoom) and wheel zoom,
clamped to `[8, 40]` world units, no rotation (Section 6). Verified via
`tools/smoke.ts`'s `simpan` dev flag, which simulates a drag + wheel-zoom
headlessly and screenshots before/after.

**Popover clipping** (`src/ui/buildPopover.ts`): the build popover had no
viewport-bounds check, so it could render partly or fully off-screen near a
map edge. `show()` now positions it, measures itself with
`getBoundingClientRect()` in the same synchronous task before the browser's
next paint (no visible flash), and clamps within an 8px margin. Verified at
both top-left and bottom-right screen corners via the `testpopoverclip` dev
hook.

**Claim-anywhere** (`src/core/gameState.ts`, `src/main.ts`): Section 2's one
deliberate departure from Dorfromantik's adjacency rule — any unclaimed hex
anywhere on the fixed map can now be claimed directly, not just one
touching the existing footprint. `isClaimable`/`canClaim`/`claim` dropped
the adjacency check entirely; the old always-on frontier-ring display
(pointing at every claimable tile at once) is replaced by a single
hover-only ring, shown only under the cursor while it's over a claimable
tile and cleared immediately on claim. `tests/gameState.test.ts` and
`tests/balance.test.ts`'s scripted-playthrough harness (previously built
around the now-removed `claimFrontier()`) were reworked to match. Verified
with a headless Playwright click on a tile deliberately far from the
starting cluster (unclaimed count dropped 240 → 239, zero console errors)
and a screenshot of the hover ring rendering under the cursor at that
distant tile before the click.

**Unclaimed-tile visual distinction** (`src/render/terrainMeshManager.ts`):
the earlier dimming approach (scale HSL saturation down, nudge lightness
toward mid-gray) dimmed each tile *relative to its own terrain color*, so a
naturally light terrain (sand) dimmed still read lighter than a naturally
dark terrain (forest) at full color — legible tile-by-tile but not at a
glance across a mixed-terrain map, exactly what playtest flagged. Fixed by
blending unclaimed tiles hard (72%) toward the shared `fog` palette tone
instead of desaturating in place, so every unclaimed tile converges on
roughly the same hazy color regardless of terrain and claimed tiles stand
out as a group. Verified via default-zoom and zoomed-out screenshots.

**Verification:** 47/47 tests passing across 9 files, `tsc --noEmit` clean,
production build succeeds, zero console errors across every smoke-test and
one-off Playwright check run during this work.

![Unclaimed tiles read as a uniform hazy field; the 3-tile claimed cluster stands out](tools/screenshots/unclaimed_fog.png)
![Hover ring over a claimable tile far from the claimed cluster, proving no adjacency gate](tools/screenshots/hover_ring.png)

## v2.2 — Bucket B: trimmed content — DONE

With Bucket A clear, the v2.2/v2.3 revision's other standing requirement —
narrow the scope to coastal-only terrain, put a generic effects schema in
place as permanent architecture, and rebuild the roster around it — could
start. Full detail in `NEXT_STEPS.md`; summary here.

**Coastal-only terrain.** `src/data/terrain.json` now holds exactly four
terrains: Coast (sea, not buildable), Beach, River, Estuary. The 3-tier
elevation system (`coastal`/`midland`/`highland`) is gone along with every
terrain that needed it — `TerrainDef` carries a direct `height` field
instead. `/tools/mapgen/generate.ts` was rewritten from a WFC-lite
edge-matching solver into a deterministic authored layout: it finds the
sea-facing edge as a narrow band of world-X (so it renders as a straight
coastline despite axial skew — the same technique the old generator used
for its region bands), carves one continuous River with a near-greedy walk
from a single inland source to the nearest shore tile (which becomes the
one Estuary, "reaching the sea" per Section 4), and fills every remaining
tile Beach. `src/core/edgeTypes.ts` and its compatibility matrix are
deleted — nothing needs edge-matching once there's only one land terrain.

**Hazard spread moved from elevation to distance/adjacency.** The shared
BFS wave-propagation engine in `hazard.ts` already decayed by hop-count per
step, which is a form of graph distance — the only thing tying it to
elevation was flood's `canPropagate` gate (`toTier <= fromTier`, "never
flows uphill"). With no elevation tiers left, that gate is simply gone;
flood now spreads by adjacency/decay exactly like cyclone always did
(cyclone needed no change — Section 5 already specified no elevation
gating for it).

**Generic effects schema.** `buildings.json` + `defenses.json` merged into
one `src/data/elements.json` / `src/core/elements.ts`. Every element
carries an open `effects: { key: delta }` map instead of the old
building-only `coinPerTurn` field and defense-only `coBenefits: {
biodiversity, carbon, trust }` struct. `GameState.meterTotal(key)` is the
one generic accumulator — sums every standing element's `effects[key]`
weighted by maturity fraction, with no hardcoded meter names anywhere in
engine code. `biodiversity`/`carbon` are thin getters over it; Coin's
per-turn income goes through the identical path
(`this.coin += this.meterTotal("coinPerTurn")` in `advanceTurn()`). Adding
a new meter to the game means adding a key to an element's `effects` in
data, never new engine code. Absorption/failure/maintenance fields stay
explicit, structured fields — they're conditional mechanics (thresholds,
redirects, graceful degrade), not simple additive deltas, so folding them
into `effects` would have hidden real branching logic behind a
misleadingly generic-looking key instead of actually generalizing it.

**7-element roster + flat-silhouette icons.** The entire earlier
building/defense list is retired, replaced by: Dune, Sandy Vegetation
(Pandanus), Beachside Resort, Seawall (Beach); Mangrove, Khazan (Estuary);
Small Dam (River). Cyclone Shelter goes with the old roster — it's not in
the new one, so `resolveCyclone`'s Trust-shielding special case for it is
gone too; Trust is now charged uniformly per damaged building. Each element
gets a distinct flat-silhouette icon (`src/render/elementGeometry.ts`): a
2D outline built with `THREE.Shape`, extruded a shallow depth along Z. This
reads clearly specifically because Section 6's camera never rotates (pan/
zoom only) — a flat cutout's front face always faces the same fixed
viewing angle, unlike a rotating-camera game where it would go edge-on and
vanish. `defenseGeometry.ts`/`buildingGeometry.ts` and their near-identical
mesh managers merged into `elementGeometry.ts`/`elementMeshManager.ts`.

**One real bug found and fixed during verification:** Small Dam sits
directly on River terrain (Section 4's terrain assignment), but the flood
resolver unconditionally treated every River tile as a damage-skipping
hazard source ("the river never takes damage, it's the source") — so a dam
built there could never actually engage its absorption or failure-threshold
logic; `result.tileDamage.get(key)` came back `undefined` and
`destroyedDefenses` never included it, caught by the rewritten
`tests/hazard.test.ts`. Fixed by narrowing the skip condition:
`hazard.ts`'s flood `skipDamage` now only skips an undefended river tile
(`t === "river" && !state.elements.has(key)`), so a dammed river tile goes
through the normal defense-check branch at the source's full, undecayed
severity instead. A related, smaller gap: Mangrove and Khazan are
Estuary-only, and the fixed map has exactly one Estuary tile (Section 4:
"a single Estuary tile") which is already part of the starting claim by
construction — the balance-test harness's per-turn "build on the tile just
claimed" loop would never revisit it, so a hybrid-category scripted run
built zero defenses. Fixed with an opportunistic build pass over the
starting claim before the main loop starts, mirroring what a real player
would naturally do by opening the popover on their own starting tile.

**Verification:** 46/46 tests passing across 9 files (mapgen.test.ts,
hazard.test.ts, cyclone.test.ts, gameState.test.ts, buildings.test.ts,
scoring.test.ts, balance.test.ts, era.test.ts all reworked for the new
terrain/element model), `tsc --noEmit` clean, production build succeeds.
Screenshots below: a fresh map reading as a clean coastal strip with no
elevation stepping, and a built-out claim showing Mangrove's canopy-blob
icon, Small Dam's blocky-barrier icon, and Beachside Resort's
cabana-and-umbrella icon all rendering distinctly, zero console errors.

![Fresh coastal map: Coast/Estuary/Beach reading as flat, distinct colors with no elevation tiers](tools/screenshots/bucketb_fresh.png)
![Built elements: Mangrove, Small Dam, and Beachside Resort icons rendering distinctly on their tiles](tools/screenshots/bucketb_elements2.png)

## v2.4 — Bucket A re-pass: popover state, dimming rebalance — DONE

A fresh live playtest against the committed build (`NEXT_STEPS.md`, no
v2.4 `GAUNTLET_PROMPT.md` found on disk — only stale v2.2/v2.3 copies in
Downloads, so this pass worked directly from the punch list's own detail)
re-opened two Bucket A items thought closed, plus found a genuine gap.

**A1 — build popover state management.** Root-caused with a live
Playwright session against the running dev server instead of guessing from
the bug report, which turned up something the report got slightly wrong:
auto-close-on-build already worked (`BuildPopover`'s button handler always
called `hide()`). The actual bug was that clicking an *already-built* tile
did nothing at all — `buildableAt()` correctly returns `[]` for an
occupied tile, and `show()` silently calls `hide()` on zero options, no
feedback either way. To a player re-clicking to check whether their build
"took," that reads exactly like "the popover never closed" — almost
certainly what the original report actually saw. Fixed by giving
`BuildPopover` a real `showInfo()` mode (name, category, effects, no
buttons) for occupied tiles, replacing the previous silent no-op — Section
3's "one tile, one element" is now enforced at the UI level, not just
inferred from the data layer never double-charging. Also added two
listeners that were missing outright: a `document`-level click listener in
`main.ts` (the old dismissal only lived on the canvas element, so a click
on the HUD — which sits on top of the canvas but isn't part of it — never
reached it) and an Escape `keydown` listener. All four behaviors
(auto-close, occupied-tile info, outside-click, Escape) verified via a
live Playwright session reading actual DOM state, not just source code.

**A2 — unclaimed-tile dimming, rebalanced.** The previous pass's fix
(blend 72% toward one shared `fog` tone) solved the problem it was aimed
at — claimed vs. unclaimed being obvious — a little too well: different
*unclaimed* terrain types converged close enough together that a wide,
mostly-Beach view read as one flat tan field, which is what this pass's
playtest flagged. `terrainMeshManager.ts`'s `dim()` now desaturates each
terrain's own color first (`saturation * 0.55`, keeping enough of its own
hue to stay distinguishable from other terrains) before blending a smaller
32% toward fog — both problems solved by the same function instead of
trading one for the other. Screenshots confirm unclaimed Coast now reads
as clearly blue-teal against unclaimed Beach's tan. Logged honestly: the
map's *interior* still looks Beach-monotonous at wide zoom because it
genuinely is almost all Beach at today's coastal-only scope — that's
Bucket B's job (adding Land), not a color bug.

**A3 — icon roster: 7/8, one genuinely blocked.** The 7 elements that
exist today already have distinct icons from the earlier trimmed-roster
pass, reconfirmed legible via screenshot. The 8th, House, doesn't exist as
an element until Bucket B's B2 item adds it — deferred rather than
manufacturing a placeholder element early just to check a box, which would
have meant reaching into Bucket B content before Bucket A was actually
done, the exact ordering Section 0.1 exists to prevent.

**Verification:** 46/46 tests passing, `tsc --noEmit` clean, production
build succeeds. All three items confirmed via live Playwright sessions and
screenshots, not static code reading alone — A1 in particular would have
been reported "fixed" wrongly if verified only by re-reading the source,
since the actual bug (occupied-tile click) looked identical to the
originally-reported one (stale popover) from the outside.

![Build popover viewport-clamped at the top-left corner](tools/screenshots/a1_clip_topleft.png)
![Info card for an already-built Dune, replacing the old silent no-op](tools/screenshots/a1_built_info_card.png)
![Unclaimed Coast and Beach reading as distinct hues after the dimming rebalance](tools/screenshots/a2_rebalanced_far.png)

## v2.4 — Bucket B: Land terrain, House/Food/Population, new starting state — DONE

With Bucket A clear, this pass worked through the punch list's Bucket B:
a real map-generation bug, a wider element roster, and a new starting
state. Full detail in `NEXT_STEPS.md`; summary here.

**B1 — the "sea wraps around a corner" bug, root-caused.** `/tools/mapgen`
banded Coast/Beach by comparing each tile's world-X against a single
*global* threshold derived from `xMin` — but `xMin` (the minimum world-X
across the whole grid) is only actually achieved at one corner
(`q=Q_MIN, r=R_MIN`), because `axialToWorld`'s `x = sqrt3*(q + r/2)` means
every row's own local x-range is shifted by that same `r/2` term. A
narrow global threshold therefore selects lots of tiles from the rows near
that one corner and almost none from the rows near the opposite corner —
exactly "sea wraps around a corner," and a bug that predates this pass
(the v2.2 coastal-only mapgen rewrite had the same threshold logic, just
never caught). Fixed by banding on axial `q` directly instead: identical
q-range selected in every row, so the edge reads as one smooth line (a
gentle diagonal, since the hex grid's own skew makes same-q hexes drift
together row to row — a reasonable stand-in for "Goa's gently curved
shore," which was the aesthetic goal anyway). Added `land` as a 5th
terrain (`src/data/terrain.json`, new `landGreen` palette color), rewrote
the region rules for the explicit Sea → Beach → Land → Estuary/River
order, and made the estuary a genuine branching blob — two river arms
from separate east-edge sources converging on a shared confluence inland,
the confluence plus its neighbor ring becoming Estuary — confined to the
eastern ~38% of the map rather than touching the coast. `tests/mapgen.test.ts`
was rewritten to independently re-verify the new layout by reading the
checked-in `map.json` directly (every row's terrain order, the estuary's
connectivity and region bounds), not just trusting the generator's own
self-check.

**B2 — the 8-element roster.** Added House (`validTerrainIds: ["land"]`,
`kind: "building"`, `effects: { money: 5, food: -1, population: 5 }`) —
`buildCost: 25` and `money: 5` are invented placeholders, no value was
specified for either, flagged here as such, not tuned balance. The
`population` key goes beyond what was literally specified for House, added
because it lets B3's "population scales with House count" go through the
exact same generic `meterTotal` accumulator every other meter already
uses, instead of a one-off hardcoded element-id check breaking the
pattern. Widened Beachside Resort to `["beach", "estuary", "river"]`, and
added `food: 1` to both Mangrove and Khazan. Renamed the generic effects
key `coinPerTurn` → `money` everywhere (`elements.json`, `GameState.
advanceTurn`) — the two were the same concept under different names, and
this document's own terminology should win. House's icon (a wide
gable-roofed silhouette with a chimney — squatter and plainer than
Resort's cabana-and-umbrella, reading as "ordinary residential" rather
than "beach amenity") closes out A3's deferred 8th icon.

**B3 — Population/Food and a new starting state.** `GameState` gained
`food` and `population` getters, both thin wrappers over `meterTotal`
(the same pattern as `biodiversity`/`carbon` — no new hardcoded engine
logic for either). The constructor gained two new optional parameters,
`startingElements` (pre-built elements claimed and placed for free, not
purchased — a `{coord, elementId}` seed list) and `startingCoin`, both
re-applied inside `startNewEra()` too, so the pre-built Houses and the
1,000 starting Coin survive an era transition rather than only existing
once at first boot. `/tools/mapgen` now also writes
`src/data/startingState.json` (`startingCoin: 1000`, `startingPopulation:
50`, and 10 `prebuiltHouses` coordinates — a compact Land-tile cluster
computed from the same generated map, just inland from the coastal
starting claim, guaranteed to actually be Land rather than hand-picked
blind). `main.ts` loads this file, passes it into `GameState`'s
constructor, and renders the pre-built Houses at boot with no settle
animation (they were never "just built" — the player already owns them).
`Hud` gained Food and Population chips alongside the existing four.

**Verification:** 49/49 tests passing across 9 files, `tsc --noEmit`
clean, production build succeeds. `b1_fresh_map.png` shows a clean
Coast → Beach → Land band with no corner artifact; the branching
river/estuary system itself is far enough east that it fell outside every
attempted screenshot pan, so it's verified by `tests/mapgen.test.ts`
reading the checked-in map data directly instead (connectivity, region
bounds, ≥3-tile blob size) rather than by eye. `b3_fresh_start.png` shows
a fresh load with Coin 1000, HUD reading "F -10" / "P 100" (10 Houses ×
their food/population effects), "Tiles claimed: 13" (3 coastal + 10
Houses), and 10 House icons visibly clustered on Land just inland from the
coastal claim — every number and every visual matching what the
starting-state config actually contains, not just "looks about right."

![Fresh map: clean Coast/Beach/Land bands, no corner-wrap artifact](tools/screenshots/b1_fresh_map.png)
![Fresh starting state: Coin 1000, Food/Population in the HUD, 10 House icons on Land inland from the coastal claim](tools/screenshots/b3_fresh_start.png)

## v2.4 re-pass 2 — a second fresh playtest found deeper bugs under the surface — DONE

A second live playtest (more thorough than the first) re-confirmed A1 with a
new, worse symptom (clicks passing through a stale-looking popover to the
map underneath), and reported two new critical items: A4 ("claiming prints
money") and A5 ("Mangrove-on-Estuary charges Coin, builds nothing"). B1 also
came back with much stronger evidence that the previous corner-wrap fix
hadn't actually fixed the underlying geometry problem. All five investigated
this pass; three were genuine bugs with real root causes, one turned out not
to be a bug at all, and one (A5) turned out to be a *different*, deeper bug
than anyone had diagnosed.

**A1, for real this time.** The previous "fix" tracked open/closed state
correctly the whole time — the bug was CSS: `.build-popover { display: flex; }`
is an author-origin rule, and author rules always beat the user-agent
`[hidden] { display: none }` default regardless of selector specificity. So
`el.hidden = true` updated the DOM attribute but the popover kept rendering
at full opacity. Fixed with an explicit `.build-popover[hidden] { display:
none; }` override, plus the modal backdrop the user explicitly asked for: a
full-viewport `.popover-backdrop` that intercepts every click while a
popover is open, so a click anywhere except the popover's own content always
just closes it — the "stale popover, click leaks to an unrelated tile"
scenario is now structurally impossible rather than merely guarded against.
`BuildPopover` was restructured around this (`isOpen` now reads the
backdrop's `hidden`, not the popover box's), and `main.ts`'s old
document-level outside-click listener (a patch around the CSS bug from the
previous pass) was removed — the backdrop subsumes it.

**A4 — investigated, not a bug.** Claiming a hex nets +46 Coin instead of
charging the displayed 4c. Traced it: `claim()` is the sole call site of
`advanceTurn()` (the "one claim = one turn" design from earlier phases),
so a claim both pays the -4 cost *and* collects that turn's income from
every standing element — at the starting state, 10 Houses × `money +5` =
+50. Net `-4 + 50 = +46`, exactly the reported number, independent of
which tile/terrain is claimed. Both halves are individually correct and
intentional; decoupling them would either kill per-claim income (breaking
the just-verified B3 economy loop) or require inventing a second turn
trigger with no spec basis. Left the mechanic alone and documented the
math in `NEXT_STEPS.md` rather than silently redesigning turn cadence —
this is a case where the investigation's conclusion diverges from the
original bug report's framing, so it's flagged explicitly rather than
folded in as a quiet fix.

**A5 — the actual find of this pass.** The reported symptom (Mangrove
build charges Coin, renders nothing, re-click still shows a build menu)
looked at first like a build-confirmation bug. Isolated tests proved
otherwise: `GameState.build()` and `ElementMeshManager.place()` both work
perfectly for Mangrove when driven directly, no click involved. That
pushed the investigation into click handling itself, where live debug
tracing (temporary, since removed) found the raycaster returning zero
hits at screen positions visibly, unambiguously over Estuary tiles —
confirmed by comparing against a manual straight-down ray to the same
world coordinates, which hit correctly every time, with an unstale camera
matrix and correct instance positions on both sides.

The actual mechanism: `THREE.InstancedMesh.boundingSphere` is computed
lazily on a mesh's first raycast or first frustum-culling check, then
cached forever — nothing in Three.js invalidates it as instances move.
`TerrainMeshManager` and `ElementMeshManager` both animate tiles/elements
into place via a shared `SettleAnimator`, which keeps calling
`setMatrixAt()` well after that first snapshot. When a mesh's first
bounding-sphere computation happens to land mid-animation — as it
reliably does under `?autoclaim=N`, which fires many claims synchronously
before the first render frame, freezing several instances at their
elevated "drop-in" starting transform — every later click against that
mesh gets silently rejected by a broad-phase bounds check against a
sphere that no longer describes where the geometry is. This is a general
engine-level bug, not specific to Mangrove or Estuary; it surfaced there
because of this repro's specific claim timing. Fixed in
`SettleAnimator.tick()`, which now invalidates (`mesh.boundingSphere =
null`) every mesh it touches each tick an animation is in flight, plus
defensively at the two other places `TerrainMeshManager`/
`ElementMeshManager` write instance matrices directly
(`resetClaims()`, `place()`'s non-animated branch). Re-verified the
original repro end-to-end after the fix: Coin -30, popover auto-closes,
re-click shows a Mangrove info card with `food +1` — confirming B2's
Mangrove Food effect and A1's auto-close were both already correct; they
just couldn't be reached because the click that should have re-selected
the tile was the one being silently swallowed.

**B1, actually fixed this time.** The previous corner-wrap fix addressed
a narrower symptom but left the deeper cause untouched:
`axialToWorld`'s formula (`x = √3·(q + r/2)`) has a shear term in `r`, so
a plain rectangular range of axial coordinates does not render as a
rectangle in world space — it renders as a parallelogram, sheared further
the more `r` moves from 0. With a fixed, non-yawing camera, that reads
exactly as this pass's report: a wedge-shaped landmass with Sea on every
side and a diagonal "vein" instead of a straight band. Fixed with
row-offset coordinates in `tools/mapgen/generate.ts`
(`rowQMin(r) = Q_MIN - floor(r/2)`), which exactly cancels the shear, so
every row's west edge lands on the same world-space x within one natural
half-hex stagger — confirmed by a new sanity check whose measured drift
came back at exactly √3/2, the theoretical value. All banding/scoring
logic was ported from raw `q` to a new `colIndex(c)` (position within its
own row), since raw `q` is no longer comparable across rows once each
starts at a different offset. `tests/mapgen.test.ts` gained a matching
rectangle test.

**A2 and A3 re-checks.** A2 (unclaimed-vs-claimed contrast) got the
dedicated side-by-side re-check the user explicitly asked for: claimed one
isolated tile of each terrain type and screenshotted it against its
unclaimed neighbors — all four (Beach, Land, River, Estuary) are clearly
distinguishable by color/saturation, closing this out for real rather than
on a hopeful note. A3's House icon (previously deferred, then reported as
reading like "a bench, a couch, or a wagon") was rebuilt from a flared-eave
shape with a baseless notch to a plain pentagon-plus-chimney "home"
pictogram — confirmed by screenshot.

**Verification:** 50/50 tests passing across 9 files, `tsc --noEmit`
clean, production build succeeds. All fixes re-verified live via headless
Playwright against the actual running game (not just unit tests) — the
A1 backdrop's click-interception, A5's raycast fix end-to-end through a
real build, and A2's four-terrain contrast were each confirmed by
screenshot or `getComputedStyle` inspection of the live DOM, not assumed
from the code alone.

![A2: claimed vs. unclaimed Beach and Land side by side](tools/screenshots/a2_beach_claimed_vs_unclaimed.png)
![A2: claimed vs. unclaimed Estuary](tools/screenshots/a2_estuary_claimed_vs_unclaimed.png)

## Step prompt — readability pass, Panaji/Taleigao reference map, River roster change — DONE

Worked `STEP_PROMPT_visuals_map_river.md`'s three items in order (1 and 2
first as instructed, since they're cheaper); each independent of the
others.

**1 — Color theme & readability.** The step prompt's own grayscale
measurement of the live build was damning: claimed vs. unclaimed Beach
differed by exactly 1 point of luminance (178 vs. 179) — invisible in
grayscale and a real accessibility failure, not a subjective complaint.
Root-caused to two compounding problems, both fixed:
1. **`palette.ts`'s base colors were under-saturated** for a "Goan, not generic-tropical" palette — deepened/punched up every terrain color and re-spread their grayscale luminance further apart (mangroveTeal ~72, seaTurquoise ~93, riverBlue ~117, landGreen ~162, sandGold ~189 — these are the CLAIMED/full-color values).
2. **`terrainMeshManager.ts`'s `dim()` function was structurally incapable of guaranteeing a real gap.** Its "blend toward `fog`" approach can never darken a terrain that's already close to `fog`'s own brightness (exactly Beach's problem). Rewrote it to drop lightness by a *proportional* multiplicative factor instead (`l * 0.3`) rather than blending toward anything or subtracting a fixed amount — a flat-subtraction version was tried first and hit a second, subtler bug: `THREE.Color.getHSL()` runs in a color-managed working space where mangroveTeal's actual `l` measures ~0.06, *below* that version's own floor meant to protect dark colors from crushing to black, which made the floor clamp mangrove's *unclaimed* state brighter than its *claimed* state. A proportional cut sidesteps the whole bug class — multiplying any positive `l` by a factor < 1 always reduces it, no floor needed, regardless of which color space or absolute range `l` lives in.

Built `tools/verify_readability.ts` (new, permanent — `npm run
verify:readability`) as the "scripted, repeatable part of the test suite"
item 1 explicitly asked for: it claims one tile of each buildable terrain
type, pans the camera via a small always-present `window.
__focusOnForTest` hook (harmless, costs one property assignment) so the
tile sits at screen center, and reads the REAL rendered pixel color
straight off the live WebGL canvas via `gl.readPixels` — needs
`preserveDrawingBuffer: true` on the renderer (`scene.ts`, added this
pass) since a completed frame isn't guaranteed to survive outside the
render loop otherwise. Asserts every terrain's claimed/unclaimed
grayscale luminance delta clears 30 points. Getting this tool itself
correct took real debugging — an early version sampled at world Y=0
(ground level) instead of each terrain's actual top-surface height,
which can catch a taller neighbor's face instead of the intended short
tile (River/Estuary sit at height 0.3, squeezed next to Land's 0.55); a
later version picked candidate tile pairs by array index rather than hex
distance, which for a small feature like Estuary (every tile mutually
adjacent) risked anti-aliased edge-bleed from the just-claimed tile
corrupting the "unclaimed" reading right next to it. Both fixed by
sampling at the correct world Y and picking the maximum-hex-distance
pair among candidates.

Final measured deltas (all comfortably over the 30-point threshold):
Beach 63.8, Land 52.8, River 34.5, Estuary 31.1.

![Readability: claimed Estuary vs. its unclaimed neighbors, dramatic contrast](tools/screenshots/readability_estuary_contrast.png)

**2 — Smaller map, Panaji/Taleigao likeness.** Cut the generated map from
243 hexes (27×9) down to **105 hexes (15×7)** — comfortably inside the
suggested 80-120 range, still "wider than tall" per Section 8. Baked the
reference schematic's most distinctive feature — a wide, rounded estuary
mouth with the Land plateau curving around it rather than a flat
rectangle — into the region rules: the Land/water-zone boundary column
now varies per row via a "bulge" function, pulling the water zone west
(narrowing Land) near the estuary's own latitude and tapering back to
the baseline a couple of rows either side, clamped so Land never drops
below a minimum width even at the bulge's peak. The estuary ring itself
was also relaxed to bite into what the column bands alone would call
Land (rather than being confined strictly to the pre-computed water
zone), so the mouth reads as a genuine wide blob (7 tiles) rather than a
narrow 2-tile notch on this smaller map. `tests/mapgen.test.ts`'s
"eastern ~38%" check was loosened from a fixed global percentage to a
generic "eastern third" bound, since the exact per-row boundary is now
an internal tuning knob the test shouldn't hardcode — the real invariant
(Coast→Beach→Land before any Estuary/River, independently re-verified
per row) was already covered by a separate test and needed no change.
New counts: coast 7, beach 14, land 65, river 12, estuary 7.

![Full map, zoomed out: compact, no island-wrap, wide rounded estuary mouth, Land plateau curving around it](tools/screenshots/b2_map_shape_full.png)

**3 — River roster: Small Dam + Sand Mining only.** Reverted Beachside
Resort's v2.4 River eligibility (back to `["beach", "estuary"]`). Small
Dam's role flipped from "trades away flood defense for income" to a real
flood-control structure: added `effects.resilience: 5` (positive) and
`effects.money: 8` — the latter wasn't actually present in the live data
despite being described in both `GAUNTLET_PROMPT.md` Section 4 and this
step prompt's own "unchanged from earlier revisions" phrasing, so this
pass added it to match the documented role, not just flip a sign that
turned out not to exist yet. Its `absorptionAtMaturity`/`failureThreshold`
fields (0.75 / 1.15) — the fields hazard.ts actually reads today — were
left unchanged; they were already strong, i.e. Small Dam was *already*
mechanically flood-positive in practice, just not reflected in its
`effects` map. The new `effects.resilience` key isn't consumed by any
code yet (the generic-effects-driven local/zone resolution model is a
documented but not-yet-built v3.0 phase — see `GAUNTLET_PROMPT.md`
Section 0.1/12) — it's forward-compatible data, added because the
standing architectural rule is that every element's impact goes through
that one generic map, not because it changes today's hazard math.

Added **Sand Mining** (`buildCost: 35`, `matureTurns: 0`, `effects:
{money: 14, biodiversity: -3, resilience: -4}`, all placeholder
magnitudes) as the "pure income at a real cost" role Small Dam used to
carry alone. Its actual in-engine flood behavior comes from a genuinely
mechanical (not just cosmetic) choice: giving it `targetsHazards:
["monsoon_flood"]` with a near-zero `absorptionAtMaturity` (0.1) means
building it on a river tile makes that tile stop being treated as an
undamaged flood *source* (which `hazard.ts`'s `skipDamage` rule exempts
entirely — an untouched river tile takes zero damage, since it *is* the
flood, not a victim of it) and start taking near-full flood damage
instead — a real, engine-verified "resilience −" outcome using existing
mechanics, not just a label. New icon (a jagged sand-pile-with-scoop
silhouette, distinct from Dune's smooth mound and Small Dam's low flat
barrier) and a new warm sandy-orange `defenseSandMining` palette color
(distinct from the cool-gray `defenseEngineered` family Small
Dam/Seawall share) — both needed for `createElementGeometry` not to
throw when a player actually tries to build it.

The step prompt itself flagged a real, not-yet-settled balance question:
as specified, Small Dam is close to strictly better than Sand Mining
(money either way, plus a Resilience benefit instead of a cost, for the
same Biodiversity cost). This pass's answer — Sand Mining costs less to
build (35c vs. 55c) and returns meaningfully more Money (14 vs. 8) — is a
first-pass placeholder tuning, not a balance-tested one; a new test
(`tests/buildings.test.ts`) checks these two levers specifically, not
that the wider balance question is resolved.

Verified live: a claimed River tile's popover now offers exactly Small
Dam and Sand Mining (no Beachside Resort); building Sand Mining and
re-clicking shows its info card with `money +14 · biodiversity -3 ·
resilience -4` — the popover picked up the new `resilience` key with no
UI code changes at all, confirming the generic-effects display really is
fully data-driven. A new scripted flood test confirms a Small-Dam-
defended river tile now reduces downstream damage relative to an
undefended one (`tests/hazard.test.ts`) — the reverse of the "trades
away defense" framing from earlier revisions.

![River roster: Sand Mining's new icon on a claimed River tile, Small Dam and Land visible alongside it](tools/screenshots/river_roster_sand_mining.png)

**Verification:** 53/53 tests passing across 9 files (3 new: River's
exactly-two-options menu, Small Dam/Sand Mining's effect directions and
relative tuning, and the downstream-damage comparison), `tsc --noEmit`
clean, production build succeeds.

## Step prompt — element icon redesign (all 9 elements) — DONE

Replaced every buildable element's placeholder mesh with a properly
designed one, per `STEP_PROMPT_icons.md`'s 2D-silhouette-first
design review. Visual/geometry only — confirmed via the full test suite
(53/53, unchanged) that no `elements.json` field (`effects`, `terrain`,
`buildCost`, or anything else) moved.

**Construction technique changed, not just the shapes.** Every earlier
icon (this project's whole history so far) was a thin flat cutout — a 2D
polygon extruded a shallow ~0.09 depth, standing upright on the tile like
a cardboard sign. This pass's brief was explicit: real low-poly 3D
volumes (boxes, tapered prisms, cones, domes), matching the construction
language the hex-prism terrain already uses, not more of the same
cutout technique with fancier outlines. New `src/render/primitives3d.ts`
holds the reusable pieces (`box`, `taperedSlab`, `coneFrustum`, `dome`,
`blade` for the remaining thin angled parts — grass tufts, fronds, prop
roots, arms — plus `rotate`/`move` helpers), each baking a real
per-vertex `color` attribute so a single element can have multiple
distinctly-colored parts (a dune's paler back ridge vs. darker front
ridge, a house's cream wall vs. laterite roof) without needing a
separate material or draw call per part — `ElementMeshManager`'s material
gained `vertexColors: true` to read it, composed with the existing
per-instance `jitterColor` tint (still applies on top, multiplicatively,
for the same "not perfectly uniform" variety as before).

**A real bug surfaced building this, not just new shapes:**
`THREE.BufferGeometryUtils.mergeGeometries()` silently returns `null`
(logs a console error, doesn't throw) when mixing indexed and
non-indexed geometries in one call — `ExtrudeGeometry` (used by
`taperedSlab`/`blade`, for the trapezoid/wall/wedge shapes) comes out
non-indexed, while `BoxGeometry`/`CylinderGeometry`/`SphereGeometry`
come out indexed, so any element mixing both families — nearly every one
of the nine — would have failed to merge, throwing downstream ("Cannot
read properties of null") the first time `ElementMeshManager` tried to
construct its meshes at boot, not at the specific broken element's build
site. Fixed once, centrally, in `primitives3d.ts`'s shared `paint()`
helper (`geometry.toNonIndexed()` before every geometry gets its color
attribute) rather than requiring every individual builder function to
know about it.

**Per-element notes, only where something needed a second pass:**
- **Beachside Resort vs. House** — the step prompt's own explicit ask. First live side-by-side screenshot found the flat-roof/window-grid cues read as a different *kind* of building but not obviously *bigger* — a real, worth-catching gap between "the geometry is technically taller" and "a player glancing at the map would call it taller." Pushed the main block height from 0.62 to 0.95 (vs. House's wall-plus-roof-peak total of ~0.58) and rescaled the window grid proportionally so three rows stay spread across the now-taller face rather than clustering in the lower half. Re-verified: the height difference reads as unmistakable now, alongside the flat parapet roofline (vs. House's peaked gable) and the 3×3-minus-one window grid.
- **Sandy Vegetation (Pandanus)** — built exactly to the settled "minimal single" spec: one tapered trunk, an 8-blade rosette drooping outward/downward (alternating two leaf tones), two angled prop-root struts. Reads as a distinct spiky plant, not a bush or a palm, at both close and normal zoom.
- **House** — the "Goan cottage": wall block under a gable roof genuinely wider than the wall (the overhang is the point), a lean-to veranda slab at the front, two window insets. The pre-existing starting cluster (10 pre-built Houses) picked this up automatically with no other code changes, since it's the same shared geometry.
- Every other element (Dune, Seawall, Mangrove, Khazan, Small Dam, Sand Mining) built to its spec's silhouette/color description directly — no second-pass issues found in live verification.

**Poly counts** (triangles per instance, read directly off the live
meshes): dune 196, sandy_vegetation 144, beachside_resort 388, seawall
48, mangrove 240, khazan 144, small_dam 60, sand_mining 168, house 72.
**Flagging Beachside Resort as meaningfully heavier than what it
replaced** (its old flat-cutout version — cabana + pole + canopy — was
roughly 56 triangles; the new hotel is ~7x that), a direct consequence
of it being the most detailed silhouette in the roster (8 windows +
sills, parapet + trim, awning + door, pennant pole + flag, pool +
highlight, a full palm). Every other element also grew (roughly 2-4x
their old flat-cutout versions) simply from being built as real 3D
volumes with multiple parts instead of thin single-depth cutouts. None
of this is a real performance concern at this project's scale — even at
the per-type instance cap (200), Resort's worst case is ~78k triangles,
comfortably within budget for any target hardware this pilot cares
about — but flagged as asked, since the increase is real and Beachside
Resort specifically is the standout case.

Verified live: built all nine elements via a scripted playthrough and
screenshotted at both normal-zoom (all nine visible, terrain-adjacent,
no silhouette reading as a flat colored blob) and close range
(House-vs-Resort specifically, per that item's explicit verify note).

![All nine elements built and visible together at normal zoom](tools/screenshots/icons_overview.png)
![Mangrove, Khazan, Small Dam, and Sand Mining close up](tools/screenshots/icons_estuary_mangrove_khazan.png)
![House vs. Beachside Resort: height, roofline shape, and window grid all reading as distinct at a glance](tools/screenshots/icons_house_vs_resort.png)

**Verification:** 53/53 tests passing (unchanged — confirms no data
fields moved), `tsc --noEmit` clean, production build succeeds.

## Step prompt — economy expansion, food pressure, estuary widening, Yacht achievement — DONE

Worked `STEP_PROMPT_economy_food_yacht.md`'s four items. Per that
document's own instruction, this lands *before* re-running/refining
`STEP_PROMPT_balance_tuning.md`'s harness — the numbers below are all
explicitly placeholder, same convention as every prior pass, meant as
the harness's next input, not a finished tuning.

**A stale-assumption finding worth flagging up front.** Item 3 asked to
widen the Estuary region to "roughly 4-6 tiles," citing `tests/
balance.test.ts`'s comment that the map has "exactly one Estuary tile."
Checked directly against the live map before touching mapgen: the
current map already has **7 Estuary tiles** (from the earlier Panaji/
Taleigao mapgen reshape — see that pass's own PROGRESS.md entry), and
they're no longer even part of the starting claim (that's a separate
coastal Beach cluster now). The step prompt's premise was accurate for
an older map, not the current one — `tests/balance.test.ts`'s comment
was simply never updated when that earlier pass landed. Closed this item
by fixing the stale comment (and confirming the actual test logic never
hardcoded the assumption — it already searches the whole map generically
for qualifying tiles) rather than re-touching mapgen for a difference of
0-3 tiles from an approximate target, which would just undo already-
screenshotted, already-approved region shape work for no real gain. 7
tiles comfortably satisfies the item's actual goal ("enough room for
several Khazans plus at least one Mangrove").

**1 — Mangrove earns Coin too.** Added `effects.money: 1` to Mangrove
(previously had no money key at all) and bumped Khazan `1 -> 2`, so all
four money-generating elements now land on distinct values: Sand Mining
14 > Beachside Resort 5 > Khazan 2 > Mangrove 1. **Placeholder
magnitudes** — the point of this pass is the ordering and the fact all
four differ, not that `2`/`1` are correct; feeds into the balance-tuning
harness next.

**2 — Food pressure.** `GameState.advanceTurn()` now drains Trust
(`deficit * 0.4`) and Resilience (`deficit * 0.15`) every turn a Food
deficit is running — both **placeholder factors**. Deliberately never a
hard block: claiming and building both stay fully available regardless
of how deep the deficit runs, per the design brief's explicit "12-year-
old can play this" constraint. Updated the `food` getter's now-stale
comment (it used to say a deficit "doesn't block anything until a
hazard/outcome pass decides what it should do" — that pass is this one).
HUD: the Food chip (`hud.ts`/`hud.css`) now switches to a warm red-orange
warning color whenever `food < 0`, confirmed live in actual play (not
just a scripted check) — the starting state's 10 pre-built Houses with
no Mangrove/Khazan yet is itself a real deficit, and the chip lit up
correctly from a fresh load.

**3 — Estuary widening.** Already satisfied — see the stale-assumption
finding above. No mapgen changes this pass.

**4 — Yacht: a pure cosmetic achievement.** New `ElementKind` member,
`"cosmetic"` (`core/elements.ts`) — zero category/targetsHazards/
absorption fields, an empty `effects` map, confirmed via a new test that
`meterTotal()` reads identically with or without one placed. Lives on
Coast (`validTerrainIds: ["coast"]`), the one terrain nothing else builds
on, so it doesn't compete for tile space with anything. `buildCost: 750`
is a **placeholder** — "a genuine long-run savings target," not tuned.

New hull/mast/sail construction in `elementGeometry.ts`, and a new
primitive, `primitives3d.ts`'s `plan()` — every earlier primitive builds
a shape in the XY plane extruded along depth (a wall, a standing-upright
panel), the wrong orientation for something meant to sit flat and low
like a hull; `plan()` takes a top-down (X,Z) footprint and extrudes it
upward instead. Found and fixed a real bug building the sail: a first
attempt rotated it 90° around Y, which — since `blade()`'s flat face
normal points along Z — turned it exactly edge-on to a camera that looks
in mostly along -Z, making it invisible in the actual rendered scene
despite looking correct on paper. Fixed with a small angle (0.35 rad)
instead, keeping the flat face mostly toward the camera while still
reading as "angled." Screenshotted before and after to confirm — this is
exactly the kind of thing that only shows up by actually looking at the
render, not by reading the geometry code.

New persistent HUD corner widget (`hud.ts`'s `setYachtGoal`, bottom-
right, previously unused corner) — visible from the very first frame,
independent of whether a Coast tile has ever been claimed: dimmed/muted
progress ("320 / 750c") while unaffordable, a lit gold highlight the
moment Coin crosses the cost, a distinct "✓ Achieved" treatment once one
exists anywhere on the map (stops showing the countdown entirely rather
than freezing it at "750/750c"). Also fixed a real bug this surfaced:
the popover's `kindLabel` ternary (`main.ts`) fell through to
`def.category` for any non-"building" kind — fine when the only other
kind was "defense" (which always has a category), silently wrong the
moment "cosmetic" existed (no category, so it would have printed
"undefined" right in the build menu). Replaced with a small shared
`kindLabel()` helper that handles all three kinds explicitly.

Verified live end-to-end: fresh load shows the Yacht widget correctly
reflecting starting Coin (1000) against cost (750) — already affordable
from turn one at these placeholder numbers, which is itself useful
tuning signal for the balance pass to consider; a Coast tile's popover
offers exactly "Yacht / COSMETIC / 750c," nothing else; building it
flips the HUD widget to "✓ Achieved" immediately.

![Yacht: hull, mast, and sail on a claimed Coast tile, HUD widget showing "Achieved" bottom-right, Food chip showing its warning color from real Food-deficit gameplay](tools/screenshots/yacht_icon.png)

**Verification:** 57/57 tests passing (4 new: money ordering/
distinctness, food-deficit-drains-but-never-blocks, food-at-or-above-
zero-does-nothing, Yacht buildability+zero-effects), `tsc --noEmit`
clean, production build succeeds.

## Step prompt — map reshape (winding river, distributed Estuary) + Vegetation icon density — DONE

Worked `STEP_PROMPT_map_reshape_veg_icons.md`, drawn from
`khazan_map_reference_v2.png` (an explicitly non-literal proportions/shape
reference). Two independent changes: `tools/mapgen/generate.ts`'s River/
Estuary region logic rewritten from scratch, and Mangrove/Sandy
Vegetation's geometry densified — no data-field changes in either.

**1 — Winding River, distributed Estuary patches.** The old mapgen carved
two straight-ish river arms meeting at one confluence, with the whole
Estuary/River system confined to the eastern ~60% of the map (a "water
zone" band). Replaced with a single continuous path threaded through 8
explicit (column, row) waypoints — entering the interior immediately past
Beach at the map's north edge, swinging south through a wide bend at the
map's vertical center (the deepest point), then rising back north before
exiting off the east edge — walked hex-by-hex between consecutive
waypoints with the same near-greedy/jitter approach the old two-arm walk
used, just no longer constrained to an eastern band. The River now
legitimately touches every column from just-past-Beach to the map's far
edge, which is the whole point of "winding."

Estuary is no longer one blob: the 6 interior waypoints (excluding entry/
exit) each anchor a patch — the widest/southernmost bend gets a 3-tile
patch (itself plus 2 ring neighbors), the other 5 get a single tile each.
Generated result: **8 Estuary tiles across 5 connected components** (one
of the small patches ended up adjacent to another, merging two of the
intended 6 into one slightly larger one — still comfortably inside the
6-9 target range and still reads as "several distinct patches," not one
region). River: 11 tiles. Total map unchanged at 105 hexes (15×7),
comfortably inside the 80-120 budget.

The pre-built Houses cluster ("the main Residential cluster, set apart
from the river") is no longer seeded from "the first Land tile on the
starting claim's own row" (which, under the old confluence-mouth shape,
happened to already be far from the river; under a river that now winds
across the *entire* interior, that seed could easily have landed right
next to a bend). Reseeded from the Land tile that **maximizes** distance
to the nearest River/Estuary tile — objectively "farthest from the
water," not just "first found" — with a viability filter (its radius-2
spiral must actually contain 10 Land tiles, so a farthest-but-cramped
corner can't be picked and then fail to fit the cluster). Landed at
`(5,3)`, the map's south-east corner, 2 hexes from the nearest water tile
at every one of the 10 houses — independently re-verified by a new test
rather than trusting the generator's own claim.

**A real invariant had to change, not just get loosened.** The old test
suite asserted every row reads "Coast, then Beach, then Land, before any
Estuary/River" — true by construction when the river was confined to an
eastern band. It's now genuinely false on the 1-2 rows nearest the
river's entry column, where the River can sit immediately after Beach
with zero Land tiles ahead of it in that row — an intended consequence of
"entering near the Beach," not a bug. Replaced that check with what's
still actually true: Coast-then-Beach ordering at every row's west edge
(unchanged), River/Estuary never touching the Coast/Beach columns
(structural, enforced by `walkSegment` itself excluding those sets), the
Estuary forming ≥3 connected components (not one blob), the whole River/
Estuary network staying reachable from a single flood-fill seed (the
patches are still strung together by the River, not floating islands),
and the new House-cluster-distance-from-water test. 10 tests total, up
from 5.

Verified the shape by rendering a flat top-down diagram straight from
`map.json`'s terrain ids (same palette colors as the live game) rather
than an in-game screenshot — the live 3D view's unclaimed-tile dimming
(a deliberate, separately-verified readability feature) washes an
entirely-unexplored 105-tile map down to near-monochrome, which would
have made the shape unreadable in a screenshot without also claiming most
of the map (and claiming advances turns/eras in this game, which isn't
worth triggering just to take a picture). This diagram is data-faithful,
just not a literal in-game render.

![Map shape: winding River (blue) with 5 distinct Estuary patches (dark teal) strung along its bends, Land (green) filling the interior, the pre-built Houses cluster (red dots) clearly separated in the south-east corner](tools/screenshots/map_reshape_full.png)

**2 — Vegetation density: Mangrove and Sandy Vegetation as fused
3-plant stands.** Both previously read as a single sparse plant occupying
one small patch of an otherwise-empty tile at normal zoom — not what
"vegetation density" or "the wave-facing side reads as a continuous
barrier" call for. Extracted each element's existing single-plant builder
unchanged (`mangroveClump()`, `pandanusClump()`) and added a new shared
`scale()` transform primitive (`primitives3d.ts`, same pattern as the
existing `rotate()`/`move()` — every primitive already sits base-at-y=0,
so a uniform scale about the origin shrinks a whole clump without lifting
it off the ground). Each element now merges 3 instances: one full-size
center plus two flanking instances (Mangrove 70% scale, Pandanus 65%,
per the step prompt's own numbers) staggered along Z — the axis
perpendicular to the River/waves' east-travelling path — spaced so their
canopies/rosettes overlap into one mass rather than reading as three
separated dots. Purely geometry: `elements.json`'s `effects`/`buildCost`/
every other data field for both elements is untouched.

**Poly counts** (exact, not measured — scaling/moving a merged geometry
never changes its vertex/triangle count, so each is precisely 3× the
single-plant figure from the icon-redesign pass): Sandy Vegetation
144 → **432** triangles, Mangrove 240 → **720** triangles. Both flagged
as meaningfully heavier, same as every prior element in this project that
went from "one thin part" to "several merged parts" — still trivial at
this project's per-type instance cap (200): Sandy Vegetation's worst case
is ~86k triangles, Mangrove's ~144k, both comfortably within budget.

Verified live: claimed a Beach tile via the existing `?autoclaim`/
`?autodefend` dev hooks and screenshotted Sandy Vegetation's new geometry
in the actual running game at a genuinely close zoom — the fused 3-plant
rosette is unmistakable, no gaps between the three canopies on the side
facing the camera. Did **not** get an equivalent live in-game screenshot
of Mangrove this pass: reaching a claimed Estuary tile through the
turn-advancing `?autoclaim` hook proved unreliable (each claim advances a
turn, and enough turns trigger era-cycling side effects that made a
specific target tile hard to reach predictably), and rather than keep
spinning up dev-server/Playwright processes chasing it — several of
which were left running past their useful life mid-session, an
unnecessary resource cost this note is flagging plainly rather than
glossing over — stopped once `tsc`/tests/build all confirmed correct and
Sandy Vegetation's identical code pattern was already confirmed working
live. Mangrove's geometry correctness rests on code review (same
`clump()`-extraction-and-3×-merge pattern, same primitives, same
`scale()` helper) rather than an independent live screenshot; worth a
quick live look next time Estuary terrain is already claimed for other
reasons.

![Sandy Vegetation: three overlapping Pandanus rosettes read as one continuous clump, no gaps, at genuinely close zoom](tools/screenshots/veg_estuary_closeup.png)

**Verification:** 60/60 tests passing (10 in `mapgen.test.ts`, up from
5 — see above), `tsc --noEmit` clean, production build succeeds.
