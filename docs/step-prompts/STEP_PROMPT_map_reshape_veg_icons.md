# Khazan — Step Prompt: Map Reshape (winding river, distributed Estuary) + Vegetation Icon Density

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or the prior step prompts — read those first. **This supersedes `STEP_PROMPT_economy_food_yacht.md` Section 3's Estuary-widening instruction** — that section asked for "roughly 4-6 Estuary tiles" without saying where; this document gives the actual spatial layout to build instead, drawn directly from the requester's own sketch. If Section 3 of that document hasn't been built yet, build this version instead; if it has, treat this as the follow-up reshape.

Two independent changes:

---

## 1. Map reshape: a winding river with Estuary distributed along its bends, not clustered at one mouth

**Reference image attached: `khazan_map_reference_v2.png`.** Read it the same way as the earlier Panaji/Taleigao reference (`STEP_PROMPT_visuals_map_river.md` Section 2) — **a proportions/shape reference redrawn for the game, not a traced or literal map, and not to be shipped as a game asset.** It's a clean redraw of the requester's own hand-sketch, with the sketch's informal labels translated to actual in-game terrain ids (legend included on the image itself).

**What it shows, and what to change in `tools/mapgen/generate.ts`:**

- **Sea and Beach** keep their existing convention — Sea fixed to the map's west/left edge as background, Beach the buildable strip fronting it. No change here.
- **River** should wind more than the current shape: entering near the Beach, then bending through several turns as it runs east, continuing off the map's east edge (implying it carries on beyond the playable area, same "continuous channel" rule as `GAUNTLET_PROMPT.md` Section 8, just with more visible meander than the current build's single wide-mouth-then-straight shape).
- **Estuary stops being one region and becomes several distinct patches strung along the river's bends** — this is the actual answer to "how many and where" that `STEP_PROMPT_economy_food_yacht.md` Section 3 left open. Per the reference image: one larger patch at the river's widest central bend (the requester's own "floodplain/wetland" label — this is Estuary, not a separate terrain type), plus roughly five smaller detached Estuary patches at other bends along the river's course. Total Estuary tile count should land somewhere in the 6-9 range across all these patches combined — a bit more generous than the earlier "4-6" figure, since the point of spreading them out is to make several independent Khazan/Mangrove sites, not one dense cluster.
- **Land keeps two distinct clusters instead of one plateau region:** a small patch near the estuary (a handful of tiles, close to the water), and the main residential cluster placed further away, set apart from the river — this is where the starting claim + pre-built Houses (`startingState.json`) should continue to sit, same as today, just relocated per this new layout rather than adjacent to the river mouth.
- Stay within the previously-set 80–120 total hex budget for the whole map (`STEP_PROMPT_visuals_map_river.md` Section 2). Coast, River, and the roster rules already established (River = Small Dam + Sand Mining only, Beachside Resort on Beach/Estuary only) are all unchanged — this is a shape/region-layout change, not a rules change.

**Verify:** a full-map screenshot (camera zoomed out) shows a visibly winding river rather than a single gentle curve; multiple separate Estuary patches are visible along its length, not one blob; the small Land patch near the estuary and the larger main Residential cluster are both present and clearly separate from each other; total hex count stays in the 80–120 range; flag the actual Estuary tile count and total hex count landed on in `PROGRESS.md`, same convention as every prior mapgen pass.

---

## 2. Mangrove and Sandy Vegetation (Pandanus): read as a stand, not a single plant — and read as something that stops a wave

**The ask, in the requester's own words:** each tile should show *multiple* plants, not one, so the tile reads instantly at a glance, and the cluster should visually suggest it can actually hold back a wave — not just "here is a plant," but "here is a barrier."

Both icons were revised in the field-plates review to reflect this — see the updated **Khazan Field Plates** artifact (same one from the icon pass) for the exact shapes; summarizing the geometry change here for the build:

**Mangrove:** currently a single stilt-root tree with a two-tone canopy, centered on the tile. Revise to **three fused clumps** at different scales — one full-size clump at the tile's center (same construction as before: four arching stilt-root struts down to the waterline, a two-tone rounded canopy above), flanked by two smaller versions of the same clump on either side, positioned so their canopies visually overlap the center clump's into one continuous mass rather than three separate trees with gaps between them. The unbroken canopy line facing outward (toward where a wave would come from) is the detail that should sell "this is a barrier," not just "this is vegetation."

**Sandy Vegetation (Pandanus):** currently a single trunk + spiky rosette + two prop roots (the "minimal single" design already picked as final). Revise the same way — keep the full-size plant at center, add two smaller versions (roughly 65% scale) staggered on either side, close enough that their rosettes overlap into one dense spiky mass. Same principle: a continuous, overlapping silhouette reads as "planted cover holding ground" in a way one isolated plant doesn't, however bold that one plant's own silhouette is.

**In both cases:** translate into the existing low-poly/flat-shaded 3D construction the same way the original icon pass did (`STEP_PROMPT_icons.md`'s translation note still applies) — three separate small mesh instances (or one mesh with three clustered geometry groups) rather than a literal flat cutout. Keep total poly count reasonable — three smaller instances of an existing shape shouldn't cost much more than the current single instance at full size, but flag in `PROGRESS.md` if it comes in meaningfully heavier.

**Verify:** a live playtest screenshot of a claimed Mangrove tile and a claimed Sandy Vegetation tile both show a visibly clustered, multi-plant silhouette rather than one lone specimen, at normal camera zoom (not just close up); the cluster's outward-facing side reads as a continuous mass, not three distinct gaps; no change to either element's `effects`, `buildCost`, or other data fields — this is a geometry-only revision.
