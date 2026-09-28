# Khazan — Step Prompt: A Real Panjim Map, with Iconic-Place Markers

**How to use this document:** a scoped addition to `GAUNTLET_PROMPT.md`/`NEXT_STEPS.md`, not a
replacement. Read `STEP_PROMPT_visuals_map_river.md` (the Panaji/Taleigao-shaped reshape) and
`STEP_PROMPT_map_reshape_veg_icons.md` (the winding-river/distributed-estuary reshape) first —
this step **builds directly on both**, it doesn't restart the mapgen work they already did.

**Decisions already made (don't re-ask):** this replaces the game's current map going forward —
one map, not an additional mode/level. The shape stays a **stylized, recognizable** approximation
of real Panjim (the existing "schematic, not traced" convention from the prior two passes),
not a literal GIS import — same bar as before, just with actual named landmarks added on top of
that same approximated geography, sourced from real Panjim place names via web research rather
than invented.

## 0. What "downscaled version of actual Panjim" means at this game's scale

The game's own existing hazard-model convention already fixes a real-world scale for one hex:
`HEX_AREA_M2 = 10,000` (100m × 100m = 1 hectare), from `HAZARD_ELEMENT_CITATIONS.md`. Use that
same conversion here rather than inventing a new one. At the established 80–120 hex map-size
budget (`STEP_PROMPT_visuals_map_river.md` Section 2), the playable map covers roughly
**0.8–1.2 km²** — genuinely small next to real central Panjim's built-up extent (on the order of
a few km²). That's fine and expected: **this is a compressed, representative slice, not a 1:1
scale model**, exactly the same honesty the game already applies to every other real-world
number it borrows. Say this plainly if it ever surfaces in-game copy (it doesn't need to — this
is a build-note, not player-facing text) — don't imply false precision.

Practically, "appropriately sized, correspondingly big to a downscaled real Panjim" is satisfied
by: keeping the existing 80–120 hex budget, keeping the existing Sea/Beach/Land/Estuary-River
proportional layout the last two passes already tuned to echo real Panjim's geography, and now
placing real landmarks *within* that layout at their correct relative positions to each other —
the historic riverfront core near the water, the beach separately, the inland institutional belt
further back — rather than scattered arbitrarily. Relative position is the thing that has to be
right; absolute distance/scale does not.

## 1. Real Panjim landmarks to add, and where they go on the existing map layout

Researched from current, real sources (see Sources below) — every name here is a real place in
Panjim, not invented. Mapped onto the map zones the last two mapgen passes already established,
because those zones already stand in for the right real districts:

**On the small Land patch near the estuary** (per `STEP_PROMPT_map_reshape_veg_icons.md` Section
1 — "a small patch near the estuary, close to the water" — this is the natural stand-in for
Panjim's historic riverfront core: Fontainhas, Altinho, and the Mandovi-facing government/heritage
quarter, which in reality all sit directly on the water):
- **Church of Our Lady of the Immaculate Conception** — the whitewashed hilltop church that is
  Panjim's single most iconic landmark; this is the "church" the request asks for by name.
- **Mahalaxmi Temple** — a prominent Hindu temple near the church, real and well-documented.
- **Jama Masjid, Panaji** — the city's mosque, so the landmark set isn't church-only.
- **Panjim Municipal Market** (Mercado de Panaji) — directly answers "market"; realistically it
  sits right at the riverfront, so keep it at this patch's water-facing edge.
- **Idalcao Palace / Old Secretariat** — the Portuguese-era riverfront palace (Goa's former
  Secretariat).
- **Institute Menezes Braganza** — a real cultural institute, distinctive azulejo-tiled building.

**On the main residential Land cluster** (per the same document — "the main residential cluster
placed further away, set apart from the river," which stands in for the Miramar/Campal/Taleigao
institutional belt in real Panjim):
- **Dhempe College of Arts and Science** — a real Panjim college (answers "colleges").
- **Don Bosco High School** and **Don Bosco College** — a real school-plus-college pair.
- **Sharada Mandir School** — a well-known Panjim school (answers "schools").
- **Government Polytechnic, Panaji** — a real technical institute.
- **Kala Academy** — Goa's real performing-arts/cultural academy, Campal.
- **Goa State Museum** and **Campal Garden / Azad Maidan** — a real museum and a real public
  ground, rounding out the "etc." the request asked for.

**On the Beach strip** (already the Miramar stand-in): label it as **Miramar Beach** explicitly
rather than leaving it a generic "Beach" tile visually — it already is Miramar in the game's own
established convention, this just makes that legible to a player.

**At the small peninsula tip** (already flagged as a "nice-to-have" in
`STEP_PROMPT_visuals_map_river.md` Section 2 — now make it a firm feature, not optional): the
**Dona Paula viewpoint**, a real, well-known Panjim-adjacent headland lookout.

This gives real coverage of every category the request named (church, market, colleges, schools)
plus temple/mosque/cultural-institute/museum/park/beach/viewpoint — a genuine cross-section of
what actually makes Panjim recognizable, not a random scatter.

## 2. How landmarks work in the game — decorative and named, not a new game mechanic

**These are map dressing, not buildable/economic elements.** The request is for the map to *read*
as Panjim via iconic places, with the existing game UI and mechanics otherwise unchanged — so
landmarks don't have `effects`, aren't claimable, aren't part of the Resilience/Biodiversity/
Money/Food/Population model, and don't occupy a tile a player could otherwise claim and build on
(place them on non-claimable map dressing, or on tiles explicitly excluded from the claim pool,
whichever is the smaller change to the existing claim system).

**Data-driven, same standing rule as everything else in this project:** a new `landmarks.json`,
one entry per landmark:

```json
{
  "id": "panjim_church",
  "name": "Church of Our Lady of the Immaculate Conception",
  "category": "religious",
  "zone": "estuary_core_land",
  "icon": "landmark_church",
  "note": "Real Panjim landmark, placed for recognizability; decorative only, not part of the effects model."
}
```

`zone` refers to whichever named region the mapgen already tracks internally for the estuary-core
Land patch, the main residential Land cluster, the Beach strip, and the peninsula tip — reuse
whatever internal naming the last two mapgen passes already established rather than inventing new
region names; if none exist yet, add them now since this pass needs them anyway.

**Rendering:** small, simple, low-poly flat-shaded markers/mini-structures in the same visual
language as every buildable element (`GAUNTLET_PROMPT.md` Section 9 — no unique textures, vertex-
color tinting, legible in grayscale) — not photorealistic, not a flat 2D icon sprite pasted onto
the 3D scene. A simple recognizable silhouette per category is enough (a small dome/cross-topped
shape for the church, a stepped-tower shape for the temple, a dome-and-minaret shape for the
mosque, a stall/awning shape for the market, a books/building shape for schools and colleges, a
simple bench/railing shape for the viewpoint) — distinctiveness at a glance matters more than
detail. A label on hover/click (reusing whatever info-card pattern the game already uses for a
built element's occupant, per `GAUNTLET_PROMPT.md` Section 7) shows the landmark's real name.

**Placement density:** don't cram all twelve-plus landmarks onto a handful of hexes — space them
across their assigned zone the same way the multi-patch Estuary layout avoids one dense cluster
(`STEP_PROMPT_map_reshape_veg_icons.md` Section 1). One landmark per hex, not stacked.

## 3. What does *not* change

- The claim → build → Forecast → Hazard → Aftermath loop, the Chapter/Challenge Mode progression,
  the full buildable roster and its effects, the HUD, the popover/build-menu interaction pattern —
  all exactly as already specified. This step prompt only touches map shape/labeling and adds a
  purely decorative marker layer.
- The winding-river, distributed-Estuary-patches, dual-Land-cluster layout from
  `STEP_PROMPT_map_reshape_veg_icons.md` Section 1 — keep that shape; this pass places real names
  and icons onto it, it doesn't redraw it again.
- The 80–120 hex budget and the Sea-left/Beach/Land/Estuary-River orientation rule
  (`GAUNTLET_PROMPT.md` Section 8) — unchanged.

## Verify

- [ ] A full-map screenshot (camera zoomed out) shows named landmark markers distributed across
      the estuary-core Land patch, the main residential Land cluster, the Beach strip, and the
      peninsula tip — not clustered onto a handful of hexes.
- [ ] Clicking/hovering a landmark marker shows its real name (e.g. "Church of Our Lady of the
      Immaculate Conception," "Panjim Municipal Market," "Dhempe College of Arts and Science") —
      not a placeholder id.
- [ ] Landmark tiles are not claimable/buildable, and building/claiming elsewhere on the map is
      completely unaffected — confirm via a live playtest that the claim pool and Coin economy
      behave exactly as before this pass.
- [ ] Landmark icons are legible in grayscale and distinguishable from each other by silhouette
      alone at normal camera zoom, per the existing readability convention
      (`STEP_PROMPT_visuals_map_river.md` Section 1).
- [ ] `landmarks.json` exists, data-driven, one entry per landmark, each carrying a real name and
      category — no landmark's existence required an engine-code change beyond what Section 2
      specifies.
- [ ] `PROGRESS.md` records the final landmark count and which zone each landed in.

## Sources referenced in this document

- [Fontainhas — Tripadvisor](https://www.tripadvisor.com/Attraction_Review-g303877-d320658-Reviews-Fontainhas-Panjim_North_Goa_District_Goa.html)
- [Top things to do and attractions in Panjim — Wanderlog](https://wanderlog.com/list/geoCategory/104548/top-things-to-do-and-attractions-in-panjim)
- [Panaji/Panjim attractions — Lonely Planet](https://www.lonelyplanet.com/india/goa/panaji-panjim/attractions)
- [49 Best Places to Visit in Panjim — Holidify](https://www.holidify.com/places/goa/panaji-places-to-visit-area.html)
- [Panjim: A Compact Guide to Goa's Capital](https://blogs.elitegoa.com/posts/panjim-a-compact-guide-to-goas-capital)
- [Government Polytechnic Panaji — official site](https://gpp.goa.gov.in/)
- [Don Bosco College, Panjim — GetMyUni](https://www.getmyuni.com/college/don-bosco-college-panjim)
- [Sharada Mandir School — JoonSquare](https://www.joonsquare.com/school/sharada-mandir-school-north-goa)
