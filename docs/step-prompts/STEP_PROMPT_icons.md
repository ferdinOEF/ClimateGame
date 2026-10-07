# Khazan — Step Prompt: Element Icon Redesign (all 9 elements)

**How to use this document:** this is a scoped addition, not a replacement for `GAUNTLET_PROMPT.md` or `NEXT_STEPS.md` — read both first, especially `GAUNTLET_PROMPT.md` Section 0.1's sequencing rule and whatever section currently defines each element's placeholder geometry/materials in the 3D scene.

**What this covers:** replacing the current placeholder low-poly meshes for all nine buildable elements with better-designed ones. This was worked through as a 2D design review first (silhouette, proportion, color) before writing this prompt, specifically to settle two open questions and fix one readability problem:
- **Sandy Vegetation (Pandanus)** — the placeholder didn't read as a pandanus at all. Settled on a specific silhouette below.
- **House** — same issue, too generic. Settled on a specific silhouette below.
- **Beachside Resort** — read too much like a second House at a glance, no clear "this is bigger, this is lodging" signal. Redesigned as an actual small hotel block, distinct in kind, not just in color.

The other six elements (Dune, Seawall, Mangrove, Khazan, Small Dam, Sand Mining) get their first proper pass in this prompt too — they were still using rougher placeholders.

**Important on translation:** every description below was designed as a flat 2D silhouette (hex-tile-backed SVG) to review proportions and color fast, *not* as a literal 2D icon to import. Translate each into the same **low-poly, flat-shaded, vertex-colored 3D construction** already used for the other geometry in the scene — simple primitives and extrusions (boxes, cones, tapered cylinders, lathed/extruded polygons), no textures, no gradients, matching the existing Dorfromantik-style rendering language. Where a description below says "trapezoid," "arc," or "rosette," read that as the 3D equivalent (a tapered box, a lathed ring segment, a small fan of angled flat planes) rather than a flat cutout standing on the tile. Use judgment on exact vertex counts/segment counts to stay consistent with whatever poly budget the rest of the elements already use — flag in `PROGRESS.md` if any of these end up meaningfully heavier than the existing meshes.

Colors below are given as hex — treat them as vertex-color targets, adjust lightness/saturation slightly if needed to match the corrected palette from the readability pass (`STEP_PROMPT_visuals_map_river.md` Section 1) rather than reintroducing the old muted/desaturated look.

All nine are independent of each other — build and verify in any order, but do them as one pass since they share the "translate flat silhouette → low-poly mesh" step.

---

## 1. Dune (Beach · NBS)

**Silhouette:** two overlapping low ridge arcs (a dune line), plus 2–3 short grass-tuft marks along the crest.

**Geometry:** two shallow arched ridges, back ridge slightly taller/set back, front ridge lower and forward — think two flattened, elongated dome/wedge shapes overlapping, not a single mound. Add 2–3 thin angled blade shapes (grass tufts) poking up from the crest of the front ridge, angled slightly, not perfectly vertical.

**Colors:** back ridge `#c9932e` (paler sand-gold), front ridge `#b5842a` (slightly darker sand-gold), grass tufts `#4b5a34` (dark olive).

---

## 2. Seawall (Beach · Engineered)

**Silhouette:** a squat trapezoid block wall, wider at the base, with a distinct cap course and horizontal joint lines.

**Geometry:** a single tapered block (wider base, narrower top) sitting across the tile, with a slightly lighter cap slab on top (a thin flat box sitting on the trapezoid). Add 2–3 shallow horizontal groove lines across the face to read as coursed masonry, not a smooth monolith.

**Colors:** wall body `#8a8f91` (concrete gray), cap `#b7bbbc` (lighter gray).

---

## 3. Sandy Vegetation / Pandanus — final: "Minimal single"

**Silhouette:** one straight trunk/stem rising from the tile, topped by a single large spiky rosette (like a starburst of blades), with two thin prop-root struts braced against the trunk near the base.

**Geometry:** a single vertical tapered cylinder (trunk), thicker at the base. At the top, a radial fan of 8 flat blade shapes (elongated narrow triangles/wedges) arranged in a rosette around the trunk apex, angled outward and slightly downward-drooping like real pandanus leaves — not a flat circular puff, a spiky asymmetric burst. Two thin angled struts (prop roots) run from partway up the trunk down to the tile surface on either side, bracing it the way real pandanus prop roots do.

**Colors:** trunk `#7c6a4f` (bark brown), prop roots same as trunk, rosette blades in two tones for depth — `#3f6b3a` (base/inner blades) and `#6fa24a` (outer/lit blades).

**Why this one over the other two reviewed:** boldest and simplest silhouette of the three options tested — reads clearly even at small in-scene scale, where the bushier two-branch variants risked collapsing into a green blob.

---

## 4. Mangrove (Estuary · NBS)

**Silhouette:** a cluster of arching stilt roots rising from the waterline into a rounded two-tone canopy above.

**Geometry:** 4 curved, angled support struts (stilt roots) converging upward from a spread base at the tile's waterline into a single trunk point, then a rounded canopy mass on top built from two overlapping dome/ellipsoid shapes (a slightly larger base dome, a smaller highlight dome offset toward the light side) for a two-tone leafy look rather than one flat green blob.

**Colors:** stilt roots `#5a4632` (dark root-brown), canopy base `#1f6e66` (mangrove teal), canopy highlight `#3c9c8e` (lighter teal).

---

## 5. Khazan (Estuary · Hybrid)

**Silhouette:** an earthen bund enclosing a split interior — water on one side, planted rows (paddy) on the other — with a visible sluice gate at the center.

**Geometry:** a low tapered bund/berm ring (trapezoid cross-section) forming the tile's border. Inside the enclosure: one half a flat water plane, the other half a set of parallel low ridge lines (paddy rows). At the center of the bund, a small gray gate structure — a narrow upright slab with 3 vertical slat grooves — marking the sluice.

**Colors:** bund `#a9793f` (earthen brown), water half `#4a90a4` (estuary blue-teal), paddy rows `#3f6b3a`/`#6fa24a` alternating for the ridge lines, sluice gate `#8a8f91` (gray).

---

## 6. Small Dam (River · Engineered)

**Silhouette:** a gray barrier wall across the channel with horizontal ridge lines, a distinct blue spillway notch, and small buttress supports at each base corner.

**Geometry:** a tapered block wall (wider base, narrower top, same family as Seawall but river-scaled) spanning the tile, with 2–3 shallow horizontal ridge grooves. A notch cut into the top-center of the wall, filled with a blue spillway plane sitting slightly lower than the wall crest, showing water passing over/through. Two small triangular buttress supports braced against the base at each end.

**Colors:** wall body `#8a8f91`, cap/ridge highlight `#b7bbbc`, spillway water `#4a90a4`, buttresses match wall body.

**Design note carried over from `STEP_PROMPT_visuals_map_river.md`:** this is the flood-control framing (resilience-positive, biodiversity-negative) — visually it should read as a real barrier actively holding back water, not a failing/leaking one. The catastrophic-failure break animation described in `GAUNTLET_PROMPT.md` Section 2 still applies on top of this geometry.

---

## 7. Sand Mining (River · Engineered/Economic)

**Silhouette:** a stepped, terraced excavation mound with visible terrace-line strokes, plus a small excavator arm-and-scoop shape beside it.

**Geometry:** an irregular terraced mound — a tapered blob-like form built from 2–3 stacked, slightly offset tapered rings/blocks decreasing in size toward the top, with terrace-line grooves marking each step. Beside it, a small angled arm shape ending in a scoop/bucket shape (a short bent cylinder or two-segment jointed arm with a small trapezoid scoop at the end) to signal active extraction.

**Colors:** mound lower terraces `#c9832e`, upper terraces `#e0a857` (lighter, sun-bleached), terrace-line grooves `#a9661d` (darker accent), excavator arm/scoop `#8a8f91` (gray).

---

## 8. House — final: "Goan cottage"

**Silhouette:** a cottage with a wide overhanging gable roof, a lean-to veranda at the front, and a small window pair.

**Geometry:** a simple rectangular wall block, topped by a wide gable roof (a triangular-prism roof shape) that overhangs the wall on both sides — the overhang is the key detail, the roof should read visibly wider than the wall beneath it, not flush. A lower lean-to shape (a small angled slab, one story tall, roughly a third the width of the main house) attached to the front as a veranda. Two small square window cutouts/insets on the wall face.

**Colors:** wall `#ede3c8` (cream), roof body `#b5502e` (laterite red-orange), roof underside/edge `#8a3a1f` (darker laterite), veranda `#a9793f` (earthen brown), windows same brown tone as veranda for contrast against the cream wall.

**Why this one over the other two reviewed:** most distinctly Goan of the three (wide eave overhang + veranda), while staying close enough to the current mesh's complexity to not be a heavy rebuild.

---

## 9. Beachside Resort — redesigned as an actual hotel, not a bungalow

**This replaces the previous "bungalow + pool + palm" design entirely** — that version read too much like a second House at a glance, with no clear signal that it's a larger, different kind of structure. The brief for this pass was explicitly "make it look like a proper hotel, easier to see and understand."

**Silhouette:** a taller multi-storey block with a flat parapet roof, a 3×3 grid of windows across the face, a ground-floor entrance awning, a small rooftop pennant flag, and the pool kept alongside with a lone palm.

**Geometry:** a tall rectangular block (taller than House's wall block — this height difference is the main "bigger building" signal), topped with a flat parapet cap (a shallow box sitting on top, not a peaked roof — flat roofline is what visually separates this from every gabled/domestic silhouette elsewhere in the roster). Across the block's face, a 3×3 grid of small rectangular window insets, evenly spaced (skip the bottom-center position for the entrance below it). At the base, a flat awning slab across the entrance with a small door inset centered beneath it. A thin vertical pole rising from the roofline with a small triangular pennant flag near the top — a simple, legible "this is a hospitality building" marker. Beside the block: a rectangular pool plane with a lighter shallow-end highlight strip, and one stylized palm (same construction as elsewhere: tapered trunk + angled frond blades).

**Colors:** wall `#f2ede0` (crisp whitewash — cooler/lighter than House's cream, a deliberate material difference from House, not just a size one), parapet cap `#a9791f` with a lighter trim highlight `#d8b158`, windows `#1f6e66` with a `#3c9c8e` highlight strip (same glass technique as elsewhere), entrance awning `#b5502e`/`#8a3a1f` (laterite, matches roof-family colors used elsewhere so it still belongs to the same building vocabulary), door `#8a3a1f`, pennant `#d8b158` (gold), pool `#4a90a4`/`#8fc0c2` highlight, palm fronds `#3f6b3a` on a brown trunk.

**Verify this one specifically:** side-by-side in a live playtest screenshot, House and Beachside Resort should be distinguishable at a glance without needing to click either — height, roofline shape (peaked vs. flat), and the window grid are the three cues doing that work; if they still read as similar at normal camera zoom, the height difference probably needs to increase further before anything else.

---

## Verify (all nine)

- A live playtest screenshot at normal camera zoom shows all nine elements clearly distinguishable from each other and from their terrain background — no silhouette should read as a generic colored blob.
- Sandy Vegetation reads recognizably as a pandanus-family plant (trunk + spiky rosette + prop roots), not a generic bush or palm.
- House reads as a distinct cottage silhouette (roof overhang + veranda visible), not the previous generic pictogram.
- Beachside Resort and House are clearly different buildings at a glance, per the note above.
- No change to `effects`, `terrain`, `buildCost`, or any other data fields — this pass is visual/geometry only, nothing in `elements.json`'s non-visual fields should move.
- Poly count per new mesh stays in the same rough range as the meshes it replaces — flag in `PROGRESS.md` if any of these came in meaningfully heavier.
