# Root & Ruin — Step Prompt: Icon Legibility Pass (Breakwater / Sand Mining / Khazan)

**What it is:** a follow-up geometry pass on three of the nine elements `STEP_PROMPT_icons.md` already redesigned. All nine were implemented per that spec (see `elementGeometry.ts`) and six read clearly — House, Mangrove, Beachside Resort, Dune, Seawall, Small Dam. Breakwater, Sand Mining, and Khazan still don't read at a glance in a built-out scene; this prompt diagnoses why from the current implementation and gives concrete replacement geometry for those three only.

**Scope:** `breakwaterGeometry()`, `sandMiningGeometry()`, `khazanGeometry()` in `elementGeometry.ts`. Nothing else — not the other six builders, not `effects`/`buildCost`/any field in `elements.json`, not `palette.ts`'s terrain colors.

**Caveat, stated plainly:** this diagnosis is from reading the current geometry code and the camera setup (`CAM_ELEVATION_DEG = 58` in `scene.ts` — a fairly steep top-down angle, closer to looking straight down than side-on), not from a fresh in-scene screenshot. The reasoning below is sound but unverified against a render — treat the numbers as a strong starting point to tune by eye, not gospel. The Verify section at the end exists specifically to catch anywhere this guess was wrong.

---

## Why each one is likely failing to read

**Breakwater** (`breakwaterGeometry()`, lines 60–76): four boxes in a single row, capped by one continuous `crest` bar spanning all of them (`box(0.9, 0.05, 0.14, "#a49a86", 0.17)`). That continuous top bar is the problem — it's the exact same "block wall + cap slab" silhouette language `seawallGeometry()` uses (a wall body plus a lighter cap course), just lower and rougher. At the 58° camera angle you mostly see tops, and the top you see is a straight unbroken bar either way. The two elements collapse toward the same read: "gray/tan wall segment," differing mainly in height — which is exactly the kind of "guess from build order, not shape" problem noted in review.

**Sand Mining** (`sandMiningGeometry()`, lines 290–309): a 3-tier stacked cone frustum in three close shades of the same sand-gold hue (`#c9832e` / `#d5972e` / `#e0a857`), plus a dredge arm (`coneFrustum(0.035, 0.05, ...)`, roughly the thickness of a Mangrove prop root) and a small scoop tucked in close beside the mound. Two compounding issues: the tier colors are a lightness ramp on one hue, which is close to how a single cone would shade under directional light anyway, so the "terracing" doesn't register as three deliberate steps, it just looks like a smoothly-lit cone; and the dredge arm — the one piece of geometry that signals "active excavation" rather than "natural mound" — is thin, gray, and small relative to a 0.42-radius base, so it's the first thing to disappear at normal zoom. It's also the same sand-gold family as Dune (`#c9932e`/`#b5842a`), which sits on the adjacent Beach tile type, so the two can read as "the same brown mound thing" from a distance even though they're on different terrain.

**Khazan** (`khazanGeometry()`, lines 234–271): the one genuinely distinguishing feature — the split interior, water on one side and planted rows on the other, inside a bund ring — is exactly the part a fairly-steep-but-not-vertical 58° camera sees the least of. The front bund (`frontBund`, at `z=0.4`, the edge closest to the camera per `scene.ts`'s `camera.position.z = target.z + cos(rad) * distance`) is the same height as the back and side bunds, and the gate structure sitting right in front of it (`z=0.42`, `0.22` tall) is taller than any of the bund walls. Between the front bund and the gate, the two nearest-camera objects are both opaque, roughly wall-height, and sit directly in the sightline to the water/paddy split that's supposed to be the whole story. What likely reads at a glance is "brown ring with a gray tab on it," not "wetland farm, half pond half paddy."

---

## 1. Breakwater — irregular rubble mound, no continuous cap

**Silhouette:** a jagged double row of tumbled boulders, no flat top anywhere — the opposite silhouette from Seawall's clean coursed trapezoid, which is the point.

**Geometry:** drop `crest` entirely — a continuous top edge is what reads as "wall." Replace the single row of 4 near-uniform boxes with 7 boulders across two staggered rows so the skyline is uneven rather than a flat line with height noise:

- Front row (closer to camera, larger — these carry the silhouette): 4 rocks at roughly `x = -0.34, -0.1, 0.14, 0.36`, `z ≈ 0.1–0.16`, heights varying more than today — `0.1`, `0.2`, `0.14`, `0.22` — so the top edge visibly zigzags.
- Back row (smaller, filling gaps, peeking up between front-row rocks): 3 rocks at `x = -0.22, 0.02, 0.26`, `z ≈ -0.12`, heights `0.16`, `0.24`, `0.12` — positioned so a back rock's peak shows in the visual gap between two front rocks, reinforcing "pile," not "row."
- Each rock: `box(w, h, d, color, 0)` with `w`/`d` in the `0.18–0.28` range, then `rotate(rock, jitterX, jitterY, jitterZ)` with small non-zero values on **all three axes** (roughly ±0.05–0.15 rad on X/Z, ±0.1–0.3 on Y) — the current geometry only rotates on Y, which keeps every box's top face perfectly horizontal and axis-flat; a little X/Z tilt is what makes an axis-aligned box read as a tumbled boulder instead of a placed block.
- Colors: keep the existing four (`#7d7568`, `#8f8676`, `#6d6558`, `#847a68`) and add a fifth, `#a89878` (a paler, sun-bleached tone), assigned by rock index so no two adjacent rocks share a tone — reinforces "irregular pile" over "repeating unit."

**Why this fixes it:** removing the unbroken top bar is the single highest-leverage change — it's the one shape feature Breakwater shared with Seawall. The rest (jagged skyline, multi-axis rock tilt, two staggered rows instead of one) makes "rubble mound" the only reasonable read even in silhouette alone.

---

## 2. Sand Mining — higher-contrast terracing, bigger and brighter dredge arm

**Silhouette:** a visibly stepped, flat-shelved terrace (each tier reads as its own ring, not a shading gradient), with a scaled-up, warning-yellow excavator arm that's the second thing your eye lands on after the mound shape itself.

**Geometry — terracing:**
- Keep the 3-tier stack (`bottom`/`middle`/`top`, same `coneFrustum` construction) but widen the radius gap between tiers so each step leaves a visible flat shelf rather than a near-tangent taper: `bottom` top-radius `0.34` → keep; `middle` bottom-radius `0.22` → `0.24` (was already close, fine); increase each tier's own top-vs-bottom radius delta slightly so the *sides* read as sloped scree, not vertical — that contrast between "sloped tier face" and "flat shelf" is what sells terracing at a glance.
- Push the groove rings from decorative hairlines to a real shadow line: `grooveRing` height `0.015` → `0.03`, and give it its own darker color per tier rather than one shared `#a9661d` — `#a9661d` under the bottom shelf, `#8f5a1a` under the top shelf — so each step has a distinct cast-shadow band.

**Geometry — dredge arm (the bigger fix):**
- Scale the whole arm+scoop assembly up roughly 1.6–1.8x versus today's `armBase`/`scoop` — thickness, length, and scoop size all together, not just length, so it doesn't read as a thin stick.
- Reposition it so its silhouette breaks clear of the mound rather than nestling against it: pull it further out along `x` (further than the current `0.36`/`0.5`) and raise the scoop's pivot so the scoop sits at or above the mound's own peak height, not below it.
- Recolor the scoop specifically (not the arm) to a construction-equipment yellow — `#d9a636` — distinct from the gray (`#8a8f91`) used everywhere else (Seawall, Small Dam, Khazan's gate). The arm mast can stay gray; the scoop being a different, warmer hue than every other "engineered gray" part in the roster is what makes it pop as *machinery* against an earth-toned mound instead of blending into the general gray/orange field.

**Why this fixes it:** the terracing fix (wider shelves, per-tier shadow lines) breaks the "one smoothly-shaded cone" read; the arm fix matters more, since it's the only shape in the roster that says "this is being actively dug," and today it's sized like set dressing rather than a focal element.

---

## 3. Khazan — lowered near bund, taller far/side bunds unchanged

**Silhouette:** same ring-with-split-interior concept as today, but the wall nearest the camera drops low enough that the water/paddy split and the gate both stay visible over it, instead of behind it.

**Geometry:**
- `frontBund` (the one at `z = 0.4`, nearest camera): reduce height from `0.16` to `0.06` — keep its footprint/width identical, just squash it. `backBund` and both `sideBund`s stay at the current `0.16` — the ring still reads as a raised earthen border from every side except the one the camera would otherwise see *through* as a wall.
- `gate`: currently `0.22` tall at `z = 0.42`, taller than the (now-lower) front bund it sits just outside of. Reduce to `0.16` tall so it's still the tallest single feature at the front edge (still reads as a landmark) but no longer taller than the interior water/paddy scene it's supposed to be announcing, not hiding.
- `water` and the three paddy `row`s: raise `baseY` slightly, from `0` to `0.015` — a small lip above the tile surface reads as "contained water/planted bed" rather than "flush paint on the ground," and gives both a sliver of visible side-face against the lowered front bund instead of a flush top-only read.
- Leave `backBund`/`sideBund`/the bund color (`#a9793f`) and the water/paddy colors (`#4a90a4`, `#3f6b3a`/`#6fa24a`) untouched — this is a height/visibility fix, not a recolor.

**Why this fixes it:** the water-vs-paddy split was always the right idea — the ring shape genuinely doesn't exist anywhere else in the roster — it just wasn't visible past the same-height front wall and an over-tall gate. Lowering only the near-camera wall is a legibility cheat (real bunds are uniform height), same category as raising a wall's near-camera face lower than reality in an isometric game so interior detail reads — worth flagging as a deliberate "reads better" choice over "geometrically literal," in case that's not the trade you want.

---

## Guardrails

- Touch only `breakwaterGeometry()`, `sandMiningGeometry()`, `khazanGeometry()` in `elementGeometry.ts`. Don't touch the other six builders, `primitives3d.ts`, or any `elements.json` field (`effects`, `buildCost`, `terrain`, absorption values, etc.) — this is geometry-only, same rule `STEP_PROMPT_icons.md` and the vegetation-fusion pass both held to.
- Keep poly count in the same rough range as today's versions of these three — more rocks/tiers is more triangles than before, flag in `PROGRESS.md` if any of these come in meaningfully heavier, same convention as the original pass.
- Khazan's lowered-front-bund is a legibility trade-off, not a neutral change — if it reads as odd/asymmetric once built, that's worth a second look rather than assuming the spec above nailed it blind.

## Verify

- Fresh playtest screenshot, normal camera zoom, all nine elements built out together (same scenario as the review that flagged this). Breakwater, Sand Mining, and Khazan should each be identifiable from silhouette alone, without reading their build order or clicking them.
- Breakwater specifically: side-by-side with Seawall, the two should not require color to tell apart — jagged/moundy vs. flat-topped/coursed should do it from outline alone.
- Sand Mining specifically: side-by-side with Dune, the dredge arm+scoop should be the first thing that visually separates them (Dune has nothing like it); the terracing should read as steps, not a smooth gradient cone.
- Khazan specifically: from the game's default camera angle (not a top-down debug view), confirm the water/paddy split and the gate are actually visible past the lowered front bund — if the fixed 58° elevation still occludes it, the front-bund height may need to go lower than `0.06`, or the gate may need to move off-center so it isn't blocking the one sightline into the interior.
- `tsc --noEmit` clean.
- `PROGRESS.md` gets the usual entry, noting this is a refinement of `STEP_PROMPT_icons.md`'s three weakest results, not a from-scratch redesign.

---

## Addendum: two color calls above don't survive contact with the instance tint

The geometry sections above (heights, radii, positions, rock count/tilt)
held up once actually implemented and screenshotted in a sandbox. Two of
the *color* calls didn't, for the same underlying reason in both cases:
`ElementMeshManager` multiplies every per-vertex color baked in here
against this element's own flat instance tint (`palette.ts`) before it
ever reaches the screen — a step this doc's diagnosis section didn't
account for, since it was reasoning from the geometry code and camera
angle only, not a render.

**Khazan.** Item 3's instruction to leave the water/paddy colors
untouched (`#4a90a4` water, `#3f6b3a`/`#6fa24a` paddy) turned out to
still be the wrong call even after the front-bund/gate height fix: this
element's instance tint (`defenseKhazanBund`, `#8C6A3F`, a warm brown
with very little blue) crushes `#4a90a4`'s blue-teal down to a dark,
near-indistinguishable green — almost the same result as the paddy
rows' own green, defeating the one split that's supposed to make Khazan
readable. Literal blue isn't achievable under this tint. What survives
the multiply is a genuine hue split either side of it instead: water
pushed cool/cyan (`#5fe8e0`), paddy pushed warm/yellow-green
(`#8fc25a`/`#a0d060`). Confirmed against a fresh render, not assumed —
this is a recolor on top of the height fix, not instead of it.

**Sand Mining.** Item 2's specified construction-yellow scoop
(`#d9a636`) has the same problem: this element's instance tint
(`defenseSandMining`, `#C68A3D`, a low-blue orange-gold) multiplies
that yellow down to just another dark orange, barely distinguishable
from the mound underneath it — a screenshot confirmed this directly,
it wasn't a guess. Hue contrast is a lost cause under this tint; what
still works is *lightness* contrast instead: the scoop is now
near-white (`#fdf6e8`), so it multiplies up to the brightest thing on
the model, and the arm mast is now near-black (`#3a352e`), reading as
a shadowed dark strut against it. The scale-up (item 2's "bigger dredge
arm" fix) still stands as originally specified — only the two colors
changed.

Everything else in this doc — the breakwater rubble mound, the
terracing/shelf geometry, the khazan bund/gate heights, the water/row
`baseY` lip — matches what's written above exactly; only these two
color pairs deviate, and both deviations are explained by the same
root cause (vertex color × instance tint) rather than two unrelated
guesses gone wrong.
