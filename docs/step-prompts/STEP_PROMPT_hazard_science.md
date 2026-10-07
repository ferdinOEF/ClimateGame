# Khazan — Step Prompt: Hazard Mechanics, Rooted in Real Coastal Science

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md` or `NEXT_STEPS.md` — read both first. **This does not add a third/fourth hazard** — Section 0.1's "exactly two hazards" rule holds. It reframes and deepens the same two hazards already in the game (`cyclone`, `monsoon_flood`) with correct names and a physically-grounded mechanic, and adds the compound-event interaction between them that the current architecture doesn't yet model. Drafted after reading `hazard.ts`, `elements.json`, `gameState.ts`, and `main.ts` directly, and after researching the actual coastal-engineering literature so the numbers below aren't invented — sources are cited per section, and every figure is labeled by how solid its grounding actually is.

---

## 0. Renaming, for accuracy

- `cyclone` → **Storm Surge Wave**. What it represents: a wave/surge pushing in from the sea, hitting the coast and pushing up the river channel. The id can stay `cyclone` in code if renaming it is more churn than it's worth — this is a display-name and mechanics fix, not a new hazard.
- `monsoon_flood` → **Flood**, redefined as a genuinely two-sided event: water coming down the river from upstream, **and**, when it coincides with a Storm Surge Wave, water also getting pushed back up the river from the sea. Both id and internal logic change here (see Section 3).

---

## 1. What's actually in the literature (cite honestly — some of this is solid, some is reasoned extrapolation)

| Element | Claim | Grounding |
|---|---|---|
| **Mangrove** | Wave height reduced 13–66% per 100m of mangrove belt, strongly dependent on density/species/water depth | **Solid, direct.** McIvor, Spencer, Möller & Spalding (2012), *"Reduction of Wind and Swell Waves by Mangroves"* (The Nature Conservancy/Wetlands International Natural Coastal Protection Series) states this range verbatim, built on Mazda et al. 1997/2006 field data. Use 66% as the matured/dense ceiling (already in `elements.json`'s intent), and treat a young/sparse stand as closer to the 13-20% floor — which `matureTurns`' interpolation already does mechanically, it just wasn't grounded in a citation before now. |
| **Sandy Vegetation (Pandanus)** | Meaningful but lower wave attenuation than mangrove | **Reasoned extrapolation, not directly cited.** Pandanus wasn't in McIvor et al.'s study species — it's a sparser canopy with a different (prop-root, not tangled-stilt) structure than the mangrove stands studied. Keeping its absorption meaningfully below Mangrove's ceiling (today's `elements.json`: Mangrove 0.55 vs. Sandy Vegetation 0.2 at maturity) is the scientifically honest call — don't push Pandanus's number up toward Mangrove's without real species-specific data to back it. |
| **Seawall** | A well-built vertical seawall reflects/blocks a large majority of incoming wave energy up to its design height, then fails suddenly once overtopped/breached | **Solid, direct, and it already matches what's built.** Coastal engineering describes this via reflection coefficient (Kr) rather than a "% per 100m" figure — vertical seawalls run Kr ≈ 0.7–1.0 (energy reflected ≈ Kr², so roughly 50–100%), per Goda's *Random Seas and Design of Maritime Structures* and the USACE Coastal Engineering Manual. `elements.json`'s existing Seawall (`absorptionAtMaturity: 0.9`, catastrophic failure via `failureThreshold`) is already a good match for this real behavior — high protection while intact, total failure on breach, not a gradual degrade. No change needed here beyond documenting why the existing number is right. |
| **Dune** | A real but secondary, differently-mechanized defense — protects by sacrificial erosion, not by a clean "% wave energy per 100m" the way vegetation does | **Grounded, but the literature doesn't give a clean per-100m figure to translate directly** — USACE/FEMA dune design instead uses cross-sectional sand volume, and wetland-analog surge-reduction studies (USACE 1963; Fitzpatrick 2008 SLOSH modeling) cite figures on the order of 1 foot of surge reduction per **several kilometers** of frontage, useless at 100m-hex scale. The honest conclusion: keep Dune's absorption modest (today's 0.35 is reasonable — below Mangrove's ceiling, above Sandy Vegetation's) and keep its existing "no destruction, absorption cut when overwhelmed" failure mode, which fits the real sacrificial-erosion mechanism better than a catastrophic-breach model would. |
| **Khazan** | A flood *buffer/reservoir*, not a wave-attenuating structure — a fundamentally different mechanic from every element above | See Section 4 — this needs a new field, not just a tuned `absorptionAtMaturity`. |
| **Small Dam** | Standard hydraulic engineering: holds back flow until overwhelmed, then breaches | Already well-modeled (`absorptionAtMaturity: 0.75`, `failureThreshold`) — dams are conventional, well-understood structures; no literature conflict with the existing approach. |
| **Compound flooding** | Storm surge and upstream/fluvial flood *interacting* produce worse outcomes than either alone, especially in tidal rivers/estuaries | **Solid, direct.** Wahl et al. (2015, *Nature Climate Change*) and Moftakhari et al. (2017, *PNAS*) both formalize this. This is the scientific basis for Section 3/5 below — the two hazards aren't just independent events that happen to share a calendar, they should actually interact where their effects overlap. |

---

## 2. Storm Surge Wave: propagate inland, and preferentially up the river channel

Keep the existing source rule (originates at Coast/Estuary tiles) and the existing decay-by-hop BFS engine in `hazard.ts` — but give the river channel its own, shallower decay rate. This is a real, well-documented phenomenon (storm surge funnels up tidal rivers and estuaries with markedly less energy loss than it experiences spreading overland, because the channel constrains and directs the flow instead of letting it spread and dissipate in two dimensions).

**Concrete change:** in `resolveHazardWave`, when the wave is propagating hop-to-hop **between two River tiles specifically**, use a shallower decay constant than the general-terrain decay already in use for this hazard (`CYCLONE_DECAY = 0.6` today). A reasonable starting placeholder — same "flag it, let the balance harness refine it" convention as every other number in this project — is **`RIVER_CHANNEL_DECAY = 0.82`** (noticeably shallower than 0.6, letting surge reach much further upriver than it would spreading over Beach/Land). Every other adjacency (river-to-non-river, or non-river-to-non-river) keeps the existing `CYCLONE_DECAY`.

**Eligible defenses (per the confirmed roster):** Dune, Seawall, Sandy Vegetation (all Beach), Mangrove (Estuary). Small Dam and Khazan do **not** defend against Storm Surge Wave — they're Flood-side defenses (Section 1/4), consistent with `targetsHazards` already existing as a per-element field, no architecture change needed, just confirm each element's `targetsHazards` array matches this split.

---

## 3. Flood: two sources, meeting in the channel

Today, `resolveMonsoonFlood` originates at *every* river tile simultaneously, all at the same base severity — that's not really "water flowing down a river," it's more like the whole river materializing at full severity everywhere at once. Redefine it as genuinely directional:

- **Upstream source:** the river tile(s) at the map's inland extreme (the highest-`q` river tiles, per the "river continues off the east/inland edge" convention from the map-reshape pass) — this represents catchment discharge arriving from upstream, off-map. This alone, propagating downstream hop-by-hop toward the sea (using the same shallow `RIVER_CHANNEL_DECAY` from Section 2, since it's the same physical channel), is the Flood hazard **on its own**, no Storm Surge Wave required.
- **Downstream/tidal-push source, added only when a Storm Surge Wave is concurrently active:** the river tile(s) nearest the Estuary (the lowest-`q` river tiles) also become a severity source, propagating *upstream* — representing the sea pushing back into the river mouth during a surge. This is the compound case.
- **Where the two wavefronts overlap in the same resolution pass, combine their severities** (sum, capped at some reasonable ceiling like 2.5–3× base severity so it doesn't run away) rather than resolving them as two independent, non-interacting layers. This is the direct mechanical expression of the compound-flooding science in Section 1 — the overlap zone should visibly, measurably fare worse than either hazard alone.

**Eligible defenses:** Mangrove (Estuary), Khazan (Estuary), Small Dam (River) — per the confirmed roster. Mangrove's root tangle slowing floodwater (not just wave energy) is a separate, well-established hydraulics effect from its wave-attenuation role (vegetated channels have higher hydraulic roughness/Manning's n, which is standard open-channel hydraulics, not the same McIvor citation) — worth a one-line comment in the code so it's clear Mangrove's dual role isn't a shortcut, it's two different real mechanisms.

---

## 4. Khazan as a flood buffer: a reservoir, not a percentage

A Khazan doesn't attenuate a wave the way vegetation does — it **stores** water, up to a capacity, then that capacity has to drain before it can absorb more. This needs a genuinely different field and a genuinely different piece of resolution logic, not just a tuned `absorptionAtMaturity`.

- **New field on the Khazan element:** `floodBufferCapacityM3` (or similar name) — a volume in cubic meters. Arbitrary, per the requester's own instruction, but *dimensionally* grounded rather than a random pick: paddy/wetland flood-storage literature (Japan's NARO "paddy-field-dam" studies, and general "flood reduction function of paddy fields" research) puts realistic storage headroom at roughly **1,000–2,000 m³ per hectare**. Since one hex here is defined as 100m × 100m = 1 hectare, **1,500 m³ is a defensible starting placeholder** for one Khazan tile's buffer capacity — round, mid-range, and traceable to a real order-of-magnitude source rather than pulled from nowhere.
- **Resolution logic:** when a Flood hazard reaches a Khazan tile, instead of (or in addition to) the usual `severity * (1 - absorption)` formula, first draw down the tile's remaining buffer capacity by the incoming water volume implied by the hazard's severity (pick a reasonable severity-to-volume conversion, e.g. `volume = severity * hexAreaM2 * someDepthFactor` — flag the exact conversion as a placeholder for the balance pass same as everywhere else); damage only starts passing through once the buffer for that tile is exhausted for this event. The buffer refills gradually over subsequent turns (a simple per-turn recovery rate, e.g. 10-20% of capacity per turn, is a reasonable placeholder) rather than instantly resetting, so back-to-back floods before a Khazan has recovered are meaningfully more dangerous — which is itself realistic (saturated wetlands genuinely provide less protection against a second event soon after the first).

---

## 5. Trigger scheduling (`main.ts`)

Both hazards already trigger on independent turn intervals (flood every 15, storm surge every 11) and can already coincidentally land on the same or nearby turns — that's fine, keep it, it's already "can come individually or together" at the scheduling level. What's missing is the *resolution* awareness in Section 3 — today, even when both happen to fire close together, `triggerFlood` and `triggerCyclone` (soon: `triggerStormSurge`) run as two completely independent calls with no shared state. Make the Flood resolver check whether a Storm Surge Wave is currently active/telegraphing (or resolved within the last turn or two) before deciding whether to add the downstream tidal-push source from Section 3 — that's the actual compound mechanic, not just calendar overlap.

---

## 6. The three animations

**Is Claude up to building these? Yes — this is well-trodden Three.js territory, not beyond capability.** Vertex-displacement/color-sweep water effects, drifting sprite-based cloud layers, and animated overlay planes are standard low-poly-game techniques, and this codebase already has real infrastructure to build on rather than starting from zero: `render/floodOverlayManager.ts` already handles a tinted hazard overlay with a telegraph state, and `render/settleAnimation.ts` already handles timed mesh animation. The three requested animations extend that existing pattern rather than inventing a new rendering system:

1. **Storm surge wave from the sea** — a colored overlay/displacement sweeping from the Coast/Estuary edge inland along the hazard's actual BFS propagation front (Section 2), timed to the hop-by-hop resolution so the animation visually matches which tiles are actually being hit each moment, not a generic decorative wave — extend `HazardOverlayManager`'s existing telegraph-then-resolve pattern rather than building a parallel system.
2. **Flood water advancing down (and, in a compound event, up) the river** — same overlay technique, but along the river's tile chain specifically, from both ends per Section 3 when it's a compound event, meeting visibly in the middle.
3. **Clouds crossing the sky** — the simplest of the three: a small number of flat, low-poly cloud-shaped meshes (matching the existing no-texture, flat-shaded style — not photoreal cloud cards) drifting slowly across the sky dome during a hazard's telegraph window, giving the player advance visual warning independent of the HUD telegraph text.

None of these need new rendering infrastructure, a new library, or capabilities outside normal Three.js/WebGL work — they're a genuine but ordinary build. If it's useful, I can put together a small standalone prototype (a self-contained demo showing the wave-sweep and cloud-drift techniques in isolation) as a reference Claude Code can lift code from directly, rather than only a written spec — say the word and I'll build it.

---

## Verify

- A Storm Surge Wave triggered alone reaches meaningfully further up a River channel than it spreads across equivalent Beach/Land distance, visibly and in the damage numbers.
- A Flood triggered alone (no concurrent surge) only carries the upstream-to-sea direction — no tidal push-back.
- A Flood and Storm Surge Wave triggered together produce a visibly worse outcome in the river/estuary overlap zone than either would alone at the same severity — the compound mechanic from Section 3 is actually observable, not just present in code.
- A Khazan tile's buffer visibly depletes across a flood event and only partially recovers before a second event hits it soon after, per Section 4.
- `npm test` passes with new coverage for the compound-overlap case and the Khazan buffer draw-down/recovery.
- `PROGRESS.md` gets the usual placeholder-number flags: `RIVER_CHANNEL_DECAY`, the severity-to-volume conversion, the Khazan buffer's recovery rate, and Pandanus's absorption value (explicitly marked as reasoned extrapolation, not directly cited, per Section 1) are all named as first-pass numbers for the balance-tuning harness to refine, not settled figures.
