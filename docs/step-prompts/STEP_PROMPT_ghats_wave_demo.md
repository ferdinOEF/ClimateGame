# Khazan — Step Prompt: Western Ghats Backdrop + Storm Surge Wave-Front Spectacle (Demo)

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `STEP_PROMPT_hazard_science.md`, `STEP_PROMPT_map_reshape_veg_icons.md`, or `STEP_PROMPT_pacing_telegraph_preview.md` — read those first, especially the pacing/telegraph one (its `arrivalRound`-staggered reveal is exactly what Section 2 below layers real spectacle on top of).

**Revised scope, mid-draft, per explicit direction: Storm Surge only, for now.** An earlier draft of this document also covered the separate Flood hazard (originating upriver, near where the Ghats sit) — that's been dropped. Section 0 below explains why that's actually fine, not a loss. **Land the two sections in order** — confirm Section 1 (disabling scheduled Flood, adding the Ghats backdrop) looks and behaves right before starting Section 2 (the storm surge wave-front, the real "demo" part of this pass). Two commits.

---

## 0. Why dropping Flood doesn't cost anything here — read before starting

Storm Surge (`resolveCyclone()` in `hazard.ts`, id `"cyclone"`, display name "Storm Surge Wave") is **the hazard the requester specifically described as having two components, both originating from the sea and moving inland**: an open-water wave, and a flood-like push into the estuary/river mouth. That's not a new mechanic to build — it already happens today, for free, as a side effect of how `resolveCyclone()`'s BFS works:

- Its sources are every Coast + Estuary tile — the open-water wave.
- Its spread (`resolveHazardWave()`) walks every neighbor of a hit tile that's present on the map, with no terrain-type restriction on *traversal* — only on decay rate. Where the wave reaches a River tile connected to an Estuary tile (several are directly adjacent), it keeps propagating up that River tile's channel, hop to hop, using the same shallow `RIVER_CHANNEL_DECAY` the Flood mechanic uses for its own channel-funneling (`channelAwareDecay()`, shared by both hazards). That's the inland "flood" push, sea-to-upriver, already computed correctly by the existing code.

So: **Section 2 below needs zero new hazard-resolution logic.** Both the "wave hits the coast" and "water pushes up the river mouth" visuals the requester described come out of one `resolveCyclone()` call's `tileDamage`/`arrivalRound` data — the render layer just needs to show both parts of what's already being computed, not compute anything new.

(For context/history, since it's still true and may matter again later: `resolveMonsoonFlood()`'s own upstream-source computation — "the river tile farthest along the channel from the Estuary" — was investigated for tying the Ghats' position to Flood's origin point, and found to currently resolve to the river's short west branch near the coast, not the east side. That's now moot for this pass since Flood's schedule is being turned off below, but it's a real, verified finding worth keeping in mind whenever Flood comes back.)

---

## 1. Turn off the scheduled Flood hazard (keep the code, don't delete it)

**Disable, don't delete** — same convention this project has used every other time something's being set aside rather than removed for good (see the telegraph system's own history: turned off, commented as intentionally inert, brought back later exactly as predicted). Flood coming back is a real possibility, not a hypothetical.

- In `checkHazardSchedule()` (`main.ts`), gate out the Flood branch (`if (state.turn >= nextFloodAtTurn) { ... } else { updateFloodTelegraph(); }`) behind a clearly-named `FLOOD_HAZARD_ENABLED = false` constant near the top of the file, next to `FLOOD_INTERVAL_TURNS`. Leave the Cyclone branch directly below it completely untouched.
- With Flood's branch gated off, `nextFloodAtTurn` never advances and `updateFloodTelegraph()` never runs — confirm there's no stray reference elsewhere (HUD countdown display, etc.) that assumes Flood is always active and would show a stale/frozen "next flood in N turns" readout. If there is, gate its display too, behind the same constant.
- **Leave the Test Hazards panel's manual Flood trigger and the `?flood=` dev URL param alone** — those are the separate, permanent testing tool this project has consistently kept independent of the real schedule (`STEP_PROMPT_pacing_telegraph_preview.md`'s own explicit rule). Being able to manually fire a flood for testing, even while its schedule is off, is still useful. If you think the panel should visually flag Flood as "disabled in the live schedule," that's a reasonable small addition — not required for this pass.
- Don't touch `resolveMonsoonFlood()`, `hazard.ts`, or any Flood-specific balance constant — this is a scheduling change in `main.ts` only, fully reversible by flipping one constant back.

**A consequence worth flagging, not fixing here:** `STEP_PROMPT_balance_tuning_findings.md`'s pacing numbers (Flood every 45 turns, Storm every 33) were tuned assuming both hazards compounding. With only Storm Surge active, the game's actual pace and difficulty will be different from what that simulation found — likely gentler, since one fewer thing is chipping away at Resilience. That's expected and fine for this demo pass; note it in `PROGRESS.md` as a known open question rather than re-tuning numbers as part of this document.

---

## 2. Western Ghats decorative backdrop

Same as the original ask: a purely cosmetic hill range on the map's eastern edge, 4 columns, rising. With Flood off, there's no hazard-origin point to align it with — **place it directly per the reference sketch, adjacent to the existing east-side map edge, no map-data changes needed.**

**This must NOT go into `map.json`'s `tiles` array.** Everything in that array becomes part of `GameState.placed` and therefore part of the hazard BFS graph (`resolveHazardWave()` walks every neighbor present in `state.placed`, regardless of terrain — there's no terrain-type filter on traversal, only on decay rate and damage-skipping). A hill tile sitting in that array would get swept into Storm Surge's BFS and show damage/overlay reveals — exactly the "no functionality" promise this feature is supposed to keep. Keeping it out of `map.json` entirely is what makes that promise airtight.

**Build a new `render/ghatsBackdropManager.ts`**, independent of `TerrainMeshManager`, `GameState`, raycasting, and the build/claim system:

- Reuse `axialToWorld()` (`core/hex.ts`) and `createHexPrismGeometry()` (`render/hexGeometry.ts`) for positioning/geometry — no need to reinvent hex math, just don't route through `TerrainMeshManager`'s per-tile-type instancing (that class's `loadMap()` only ever sees `mapTiles`, i.e. `map.json`'s array — a second, parallel call path here is the point).
- **Four columns, rising:** place hill tiles starting immediately past the map's current eastern edge (the existing Land/River tiles' highest `q`, around `q=9`) — e.g. `q = 10, 11, 12, 13` — each column spanning roughly `r = -3` to `r = 3` (mirroring the existing map's vertical extent). Treat this as a starting point, not a fixed requirement; adjust by eye once it's actually rendering, matching the reference sketch's proportions rather than these exact numbers.
- **"Slowly rising":** each successive column should sit visibly taller than the last — e.g. roughly `0.9 → 1.4 → 2.0 → 2.7` world-space height, increasing with `q` — and each column's color should shift toward `PALETTE.fog`/`PALETTE.sky` as it rises, the same atmospheric-perspective principle the scene's existing `THREE.Fog` already uses for depth cueing (a distant hill reads as hazier/cooler than a near one). Add the new tiers as named entries in `render/palette.ts` (e.g. `ghatsNear`, `ghatsMid`, `ghatsFar`, `ghatsDistant`) rather than inlining hex literals in the new manager — matches how every other render color in this codebase is organized.
- Individual tiles within a column don't need to be perfectly uniform height — a small per-tile random variation (same `jitterColor`-style deterministic-seed approach `palette.ts` already uses, applied to height instead of color) will read as a natural ridge rather than a mesa. Use your judgment on exact shape; this is explicitly the "demo" part of this pass — get it looking good, don't over-engineer the geometry.
- **Non-interactive, by construction, not by special-casing:** don't add these tiles to `TerrainMeshManager.raycastTargets`, don't run them through the claim/dim system, don't give them a `terrainId` any element's `validTerrainIds` could ever reference. They should never highlight on hover, never accept a click, never appear in the build popover. If it's genuinely simplest to route them through `TerrainMeshManager` for some reason, that's a sign the "does this end up in `state.placed`" question above needs revisiting — flag it rather than quietly building it that way.
- Wire the new manager's `.group` into the scene the same way `TerrainMeshManager.group`/`CloudLayerManager.group` already are. A `.tick()` for idle motion isn't required for the demo.

---

## 3. Storm Surge wave-front — sea to inland, wave AND channel-push, real motion not staggered tiles (the demo)

**Current state:** `applyHazardResult()` in `main.ts` iterates `result.tileDamage`, and for each tile schedules a `hazardOverlay.show(...)` call at `arrivalRound × ROUND_DURATION_MS` via `setTimeout` — tiles light up in sequence, but each is still just a static disc appearing/disappearing (`HazardOverlayManager`, `render/floodOverlayManager.ts`). This section adds a genuinely different layer on top: actual moving water sweeping across the affected area in real time, driven by the same `arrivalRound` data so it stays honest to the real BFS resolution rather than becoming a disconnected decoration.

**Two visual components, both originating from the sea (per Section 0 — both are already present in one `resolveCyclone()` result, no new hazard data needed):**

1. **The open-water wave** — hits Coast/Beach/Land/Estuary tiles directly. A moving wave-front shape (a plane or elongated shape with a rippled/foam-tinted leading edge is enough for a demo; a full displacement shader is a nice-to-have, not a requirement) sweeping inland from roughly the coastline. The coastal centroid `main.ts` already computes (`coastalCentroid()`, used today for the cyclone telegraph icon) is a reasonable starting position.
2. **The channel push** — the same event's damage funneling up any River tile connected to an Estuary tile (Section 0). This should read visibly differently from the open-water wave — narrower, following the river channel's actual tile-by-tile path rather than a broad front over open ground — water pushing *up* the river from its mouth, not arriving from open water. Both components still originate from the sea end; neither should ever appear to originate upriver.

**Build:**

- Drive both components' position/scale over the same real-time window `sweepDurationMs(result)` already defines (`maxRound × ROUND_DURATION_MS + 500`) — each part of the visual should visibly reach a tile at roughly the same moment `arrivalRound` says that tile is actually reached, the same principle the existing per-tile stagger was built on (see `hazard.ts`'s own comment on `arrivalRound`: "instead of a generic decorative sweep disconnected from the real propagation" — hold this new effect to that same bar). You can distinguish which of the two components a given damaged tile belongs to by its terrain: Coast/Beach/Land/Estuary tiles are the open-water wave, River tiles reached via the channel are the push.
- Keep the existing per-tile `hazardOverlay.show()` reveals — they're the "impact" read (does this specific tile hold or breach); the new wave-front/channel-push visuals are the "spectacle" read (something is physically arriving). They should layer, not replace each other.
- Trigger/cleanup lives alongside the existing `triggerCyclone()`/`applyHazardResult()` call in `main.ts` — spawn both visual components there, dispose/hide them once `sweepDurationMs()` elapses (reuse that existing timing function, don't duplicate its math).
- This is the demo — get it looking and feeling right, actually playtested (trigger via the Test Hazards panel, which still works exactly as before), camera framing checked, timing checked against a real triggered hazard, before considering this pass done.

---

## Guardrails

- No changes to hazard math — `FLOOD_DECAY`, `CYCLONE_DECAY`, `RIVER_CHANNEL_DECAY`, severity formulas, `RESILIENCE_DAMAGE_FACTOR`, and every constant from `STEP_PROMPT_balance_tuning_findings.md` Section 1 stay untouched. Section 1 above is a scheduling gate in `main.ts`, not a hazard-resolution change.
- No changes to `map.json`'s `tiles` array, `qRange`/`rRange`, or anything that would make the Ghats backdrop part of `GameState.placed`.
- The Ghats backdrop must never appear in `state.placed`, `GameState`, raycast targets, or any element's `validTerrainIds`. Treat any code path that would require it to be part of these systems as a sign to stop and reconsider, not push through.
- Land as two separate commits in the order given: (1) disable scheduled Flood + Ghats backdrop, (2) Storm Surge wave-front. Confirm 1 looks and behaves right before starting 2.
- Don't touch the existing telegraph/tint/cloud-layer system (`updateCycloneTelegraph()`, `CloudLayerManager`) or the Test Hazards panel's manual triggers for either hazard — the new wave-front effect is additive spectacle layered on top of the existing pacing loop, not a replacement for it.

## Verify

- Let turns advance (or use `?autobuild`) past where a Flood would previously have fired — confirm no flood telegraph, tint, or resolution occurs on schedule, and that the HUD doesn't show a stale/frozen Flood countdown. Confirm the Test Hazards panel can still manually trigger a Flood on demand and it resolves correctly when it does.
- Full-map screenshot, camera zoomed out: the four Ghats columns are visible on the east edge, visibly rising in height/haziness. Confirm the Ghats tiles cannot be clicked, hovered, or selected for building — click on one and confirm nothing happens (no popover, no highlight).
- Trigger a Storm Surge Wave (Test Hazards panel) on a map where at least one River tile is connected to a hit Estuary tile, and confirm two visibly distinct things happen: an open-water wave sweeping in from the coast, and a narrower push of water visibly moving up that river's channel — both timed against the existing per-tile `arrivalRound` stagger, not arriving all at once or out of sync with when tiles actually light up.
- `tsc --noEmit` clean; existing test suite passing at current baseline or better.
- `PROGRESS.md` gets the usual entry, including the Flood-disable flag's name/location (so it's easy to find and flip back), whichever exact row-range/height/color choices Section 2 landed on, any Section 3 polish deferred and why, and the pacing-consequence note from Section 1's closing paragraph.
