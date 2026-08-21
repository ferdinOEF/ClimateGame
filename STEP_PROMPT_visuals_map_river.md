# Khazan — Step Prompt: Readability Pass, Panaji/Taleigao Reference Map, River Roster Change

**How to use this document:** this is a scoped addition to work from, not a replacement for `GAUNTLET_PROMPT.md` or `NEXT_STEPS.md` — read both first, especially `GAUNTLET_PROMPT.md` Section 0.1's sequencing rule.

**Status update, checked directly against the repo's own `NEXT_STEPS.md` on 2026-08-21: Bucket A and Bucket B are both closed.** Everything that document's Log records is worth reading in full before starting below, but two closures specifically correct assumptions made earlier in this project and should be treated as the current understanding, not re-investigated from scratch:
- **A4 (claim cost) was investigated and closed as *not a bug*.** `claim()` is the sole call site of `advanceTurn()`, so a claim both pays its displayed cost *and* collects that turn's income from every standing element — at the starting state (10 Houses × `money +5`) that's `-4 + 50 = +46`, exactly the previously-reported number. This is the intended economy shape (own more income tiles → afford to claim faster), not an exploit; the displayed "4c" is the claim cost, not a promise Coin will drop by 4. If it still reads as confusing in play, that's a HUD-copy fix (e.g. label it "claim cost" more explicitly, or show the net effect), not a state-management one.
- **A5 (Estuary builds not committing) was closed — root cause was a `THREE.InstancedMesh.boundingSphere` caching bug in the rendering layer** (a mesh's bounding sphere computed mid-settle-animation gets cached stale, silently failing raycasts/clicks against it afterward), not a build-confirmation flow bug. Already fixed by invalidating the cached bounding sphere every animation tick.

Since Bucket A/B are clean, work the three items below directly, in the order given — each is independent of the other two, but 1 and 2 are cheaper and should go first.

---

## 1. Color theme & readability — fix, with a concrete baseline to check against

**Verification finding, from a live playtest of the current build:** a screenshot was converted to grayscale and sampled at several tiles. The result is a real, measurable problem, not a subjective one:

| Tile | Color (RGB) | Grayscale luminance (0–255) |
|---|---|---|
| Sea (open water) | (206, 230, 232) | 223 |
| Coast strip, unclaimed | (131, 155, 139) | 146 |
| Beach, **unclaimed** | (187, 181, 147) | **179** |
| Beach, **claimed** | (202, 179, 112) | **178** |
| Land, unclaimed (edge) | (186, 178, 142) | 176 |
| Land, claimed/built (House tile) | (114, 53, 25) | 68 |
| Land, further from claim | (159, 171, 131) | 163 |

**The problem:** claimed Beach and unclaimed Beach are visually distinct in color (gold vs. tan) but differ by **one point** of grayscale luminance (178 vs. 179) — in grayscale, or for anyone with a color-vision deficiency, they are indistinguishable. Unclaimed Land (176) sits in that same narrow band too. Only the House-built tile stands out, and only because it's a very different color family (brown), not because "claimed" itself reads as a distinct state.

**Fix:**
1. For every terrain type, claimed and unclaimed states need a real **lightness** separation, not just a hue/saturation difference — a good working target is **at least 30–40 points of grayscale luminance apart**, verified the same way the numbers above were produced (screenshot → grayscale → sample). Don't rely on hue alone to do this job.
2. Different terrain types need to stay distinguishable from each other in the same lightness band they currently occupy — right now Beach and Land's unclaimed states (179, 176) are close enough to blur together at a glance even in color. Push their base lightness values further apart, not just their hues.
3. Re-run `GAUNTLET_PROMPT.md` Section 9's existing grayscale check, but make it a scripted, repeatable part of the test suite (Section 13) rather than a one-off manual look: take a screenshot, convert to grayscale, sample a known claimed hex and its terrain-matched unclaimed neighbor, assert the luminance delta clears the threshold from point 1. This turns "does it look readable" into something that can regress-test automatically going forward.
4. While in this area: the overall palette reads as fairly muted/desaturated across the board (note the earlier `GAUNTLET_PROMPT.md` Section 9 direction — "Goan, not generic-tropical," turquoise sea, sun-bleached sand gold, deep mangrove teal, laterite red-orange) — lean harder into that palette's actual saturation, not just its hues. Right now everything sits in a narrow olive/khaki/tan family that undersells the intended coastal contrast.

**Verify:** re-run the grayscale sampling above on the updated build; claimed vs. unclaimed for every terrain type clears the luminance-delta threshold; a human glance at a full-color screenshot immediately reads which hexes are claimed without needing the HUD's tile-count as a hint.

---

## 2. Regenerate the map: smaller, and shaped like the Panaji/Taleigao stretch of the Mandovi

**Two changes bundled together since they're the same mapgen pass:**

**Smaller map.** The current generated map is roughly 243 hexes total ("230 hexes to claim" + 13 already claimed) and, per the last playtest round, turned out to be a small island shape with sea wrapping every edge rather than a coastline strip (`NEXT_STEPS.md` B1). Cut total map size down substantially for this pilot — **roughly 80–120 hexes** is a reasonable target (small enough to see the whole coastline in one camera view with a little panning, not so small the terrain variety feels cramped) — this is a suggested range, not a hard number; use judgment and flag the actual count landed on on in `PROGRESS.md`.

**Shaped with a bit of Panaji/Taleigao likeness.** Attached: `panaji_taleigao_reference_schematic.png` (and its source `.svg`). **Read this carefully — it is a schematic sketch drawn from a written geography description, not a traced or literal map, and it should be used exactly that way: a proportions/shape reference for tuning the mapgen's region rules, never copied pixel-for-pixel or shipped as a game asset.** What it shows, and why it was drawn this way:

- The Arabian Sea sits to the **west**. Convenient overlap with the existing convention: this game already fixes Sea to the map's **left** edge, so orienting the reference with west = left needs no translation.
- A **Beach** strip (standing in for Miramar) fronts the sea directly.
- Inland from the beach is a **plateau** of buildable **Land** (standing in for the Taleigao plateau — real Taleigao is described as "a level village, neither on a hill nor in a valley," with fields extending east), bulging out toward the coast rather than forming a straight inland wall.
- The land plateau's shape wraps around a wide, rounded **estuary mouth** where the river reaches the sea — this is the single most distinctive feature to borrow: the Mandovi's mouth near Panaji is broad and rounded, not a narrow notch, with a defined landmass (the plateau) curving around its southern edge.
- The **River** continues inland (east) past the estuary as a continuous, gently meandering channel, per the existing Section 8 orientation rule.
- A small peninsula tip (Dona Paula-like) sits south of the estuary mouth, at the seaward end of the plateau — a nice-to-have detail, not essential if it complicates the region-generation rules.

**What to actually change in mapgen:** bake the *proportions* above into the existing region constraints (`GAUNTLET_PROMPT.md` Section 8) — a wide/rounded estuary mouth relative to the coastline (not a narrow single-hex notch), a plateau-shaped Land region that bulges toward the coast rather than sitting as a flat rectangle, and the smaller overall hex count. Do not attempt to hit exact real-world coordinates or proportions — "a bit of likeness," in the requester's own words, is the bar, not geographic accuracy.

**Verify:** a full-map screenshot (camera zoomed out) shows a compact map — no longer an island wrapped by sea on every side — with a recognizably wide, rounded estuary mouth and a plateau-shaped Land region; total hex count is in the reduced target range; the Sea-left/Beach/Land/Estuary-River-right ordering from Section 8 still holds.

---

## 3. River roster change: only Sand Mining and Dam, and Small Dam's resilience sign flips

**This is an explicit correction to the existing roster, not an addition on top of it.** As of `GAUNTLET_PROMPT.md` v2.4/v3.0, River tiles offer Small Dam and (after the v2.4 widening) Beachside Resort. **That widening is reverted for River specifically** — a River tile's build menu should now offer exactly two options: **Small Dam** (with its effects corrected below — read this carefully, this isn't the same Small Dam as earlier revisions) and a **new Sand Mining** element. Beachside Resort remains eligible on Beach and Estuary (unchanged there) but is no longer offered on River tiles.

**The two River options, both finalized this pass:**

| Element | Terrain | Category | Effects | Notes |
|---|---|---|---|---|
| **Small Dam** | River | Engineered | Money + (unchanged from earlier revisions), Biodiversity −, **Resilience + (flood) — sign flipped from every earlier revision, this is intentional** | Re-framed as a flood-control structure, not a flood-defense-trading one: a dam that actually holds back floodwater, at biodiversity's expense (blocked sediment/fish migration — a real, defensible tradeoff for a river dam). Section 2's catastrophic-failure rendering (a dam breaking under load and dumping its held-back water downstream at a multiplier) still applies and is arguably a better fit for this framing than the old one — an overwhelmed Small Dam should still fail dramatically, it's just now failing *out of* a resilience-positive role rather than confirming a resilience-negative one |
| **Sand Mining** | River | Engineered/Economic | Money +, Biodiversity −, **Resilience −** (flood) | The element that now carries the "income at a real cost" role Small Dam used to carry alone — Sand Mining costs *both* Resilience and Biodiversity for its Money, a harsher trade than Small Dam's (which now only costs Biodiversity and actively helps Resilience). This is a real, worth-flagging balance question, not settled by the numbers given: as specified, Small Dam is close to strictly better than Sand Mining (money either way, plus a Resilience benefit instead of a cost, for the same Biodiversity cost) — tune `buildCost`/magnitudes so Sand Mining earns its place, e.g. cheaper to build, faster (no maturation delay where Small Dam has one), or a meaningfully higher Money return, so a player has an actual reason to pick it over Small Dam rather than it just being the worse option |

Flag the exact `buildCost`/`money`/`resilience`/`biodiversity` numbers as placeholders in `PROGRESS.md`, same convention as House's numbers in the existing spec — the direction of every effect is now specified, the magnitudes aren't.

**Fix:** update Small Dam's `effects.resilience` in `elements.json` from negative to positive (double-check `hazards.json`/damage-formula code for any place that special-cases Small Dam as "the flood-resilience-negative element" — Section 2's catastrophic-failure language was written with the old framing in mind and needs re-reading against the new one, even though the visual failure behavior itself should carry over); add `sand_mining` with `effects: { "money": +, "biodiversity": -, "resilience": - }`; remove `"river"` from Beachside Resort's `terrain` array (back to `["beach", "estuary"]`); update popover terrain-eligibility filtering — mostly a data change given the existing generic-effects/terrain-filter architecture (`GAUNTLET_PROMPT.md` Section 11), not new engine logic.

**Verify:** a claimed River tile's popover offers exactly two options, Small Dam and Sand Mining, no Beachside Resort; building Small Dam increases both Money and Resilience and decreases Biodiversity; building Sand Mining increases Money and decreases both Resilience and Biodiversity; a scripted flood scenario against a Small-Dam-defended River tile shows it actually helping (not hurting) local flood outcomes now, the reverse of earlier revisions; the popover correctly shows each element as the tile's occupant afterward (one-tile-one-element rule, as everywhere else).
