# Khazan — Build Prompt for Claude Code (Gauntlet Loop) — v3

*Working title: **Khazan**, after Goa's traditional bund-and-sluice tidal farming system (see Section 4) — a real, centuries-old example of exactly the "nature-based vs. engineered vs. something cleverer than both" theme this game is about. A hex-grid town builder set in a stylized Goa, where you grow a coastal settlement Dorfromantik-tile-by-tile, then weather monsoon floods and cyclones Thronefall-wave-by-wave.*

---

## Revision log

- **v2.1:** v2's build got the visuals and the contextual-popover interaction right — real progress, verified by hand. Two changes landed on top of it: (1) **the terrain map is fixed/authored, not player-drawn** — the hand-of-3 terrain-tile-draw mechanic is removed, replaced by a claim-to-expand loop over a pre-generated Goa-shaped map. (2) A concrete interaction bug was found in manual testing (build popover has no dismiss path) — tracked in `NEXT_STEPS.md`, not repeated here.
- **v2.2:** confirmed by playtest that v2.1's map-generation change landed correctly, and it surfaced real gaps (no camera pan/zoom, terrain-eligibility filtering wrong, unclaimed land not visually distinct — all in `NEXT_STEPS.md`). On top of that: claiming is no longer adjacency-gated (any unclaimed tile anywhere can be claimed); scope narrowed to a coastal-only ecosystem (Coast, Beach, River, Estuary only); the buildable roster replaced with a small, concrete, fully-specified 7-element set; the data layer moved to a generic, extensible `effects: {key: delta}` schema (standing architectural requirement, not one-time); and a sequencing directive was set — UI/UX and playability come before further mechanical depth (Section 0.1).
- **v2.3:** Risk removed as a tracked property. There is now only Resilience, moved up or down — an element that makes a tile more exposed or dangerous is expressed as a larger Resilience decrease, not a separate value.
- **v2.4:** live playtest confirmed camera pan, claim-anywhere, and terrain-eligibility filtering all working; also sharpened the popover auto-close/occupant-state bug (`NEXT_STEPS.md` A1). On top of that: explicit map orientation (Sea fixed left, Beach fronting it, Land filling the interior, Estuary/River toward the right — the live generator didn't match this yet, confirmed real rework needed); a real-world Goa reference recommended for shape/proportion only; a Population/Food economy added (50 starting Population, 10 pre-built Houses on new Land terrain); one-tile-one-element made an explicit hard rule; Beachside Resort's eligibility widened to Beach/Estuary/River; starting Coin raised to 1,000 as an explicit testing value.
- **v3.0 (current) — game mechanics deep dive.** Everything above was about making the existing loop (claim → build → watch a hazard resolve) work correctly and read clearly. This revision is different in kind: it's a full design pass on the *mechanics themselves* — requested explicitly, with two design pillars stated up front: (1) simple enough for a 12-year-old to pick up and enjoy, (2) with real depth and escalating challenge for adults, and the overriding priority across both is **fun first** — this is a game before it's a teaching tool. Five substantial additions, detailed in the new sections below:
  1. **The core loop gains a Forecast beat and a local (zone-based), not purely global, resilience calculation** (Section 2) — hazards now telegraph *where* they'll strike, and defense placement matters spatially, not just as a number added to a global pool. This is the single biggest architectural change in this revision — see Section 2's design-rationale callout.
  2. **Cyclone and Flood get distinct mechanical identities** (Section 3) — different origin, different telegraph, different zone of the map that matters most to defend — so "prepare for a flood" and "prepare for a cyclone" are genuinely different spatial puzzles, not the same button with a different name.
  3. **A Chapter-based progression and difficulty system** (Section 5, new) — the accessibility-for-kids and depth-for-adults asks are reconciled by scaling map size, roster size, and hazard generosity across a short authored campaign, plus an uncapped "Challenge Mode" postgame for players who want to keep pushing. No separate kid-mode/adult-mode ruleset — one set of mechanics, tuned by data.
  4. **A non-punishing scoring and feedback system** (Section 6, expands old Section 7) — star ratings per season, no hard game-over in the campaign, and a short, specific, non-preachy educational line after every hazard tied to what actually happened that season.
  5. Sections renumbered throughout to make room for the above; every cross-reference below has been checked against the new numbering.
  
  **This is a design document, not a go-ahead to start building it.** Section 0.1's sequencing rule still governs implementation order: `NEXT_STEPS.md`'s Bucket A items — including the two critical bugs found in the most recent playtest (claiming currently *adds* Coin instead of charging it, and building on an Estuary tile silently fails to commit) — come first, full stop. Treat this revision as the next layer to build once the existing loop is correct and pleasant to play, not as new work to start immediately.

---

## 0. What went wrong in v1, and how to start this time

The v1 build (a "Calm phase" panel with resource counters, a row of buy-buttons, and a `<select>` dropdown to *choose which hazard to simulate*) was not the game. There was no hex map, no tiles, no Goa, no Dorfromantik. The loop optimized for testable game-logic and a debug UI and never got around to — or never prioritized — the thing that actually makes this game what it is: a rendered, tactile, tile-by-tile 3D world you watch grow and then watch weather a storm.

**Start a brand-new repository. Do not attempt to evolve the v1 codebase.** The state machine and data-file thinking from v1 can be salvaged as reference if useful, but the rendering layer and UI approach must be rebuilt from nothing against the rules in Section 7 below. If a prior repo exists, archive it (rename the folder, don't delete outright) and init fresh.

**The standing rule for every phase from now on, no exceptions:** the primary viewport, at all times during both the Calm phase and the Hazard phase, is the rendered 3D hex map. If at the end of any phase the majority of the screen is a text panel, a form, or a dropdown, and the map is small, absent, or an afterthought — that is a **critical failure**, full stop, higher priority than any mechanical feature or test passing. Stop, fix the rendering, and re-verify with a screenshot before doing anything else. Section 10's phase gates enforce this explicitly and early, on purpose.

### 0.1 Sequencing: playability and UI/UX come before further game-mechanic depth

This is a standing priority order, not a one-time instruction: **until the existing loop feels good to actually play — clean camera control, a build interaction that behaves predictably, correct economy math, clear visual feedback for what's claimed vs. not, thoughtfully designed icons for each element — do not spend implementation effort on Section 2–6's new mechanics below.** `NEXT_STEPS.md`'s Bucket A is the current source of truth for what's blocking; as of this revision it includes two data-correctness bugs (claim cost inverted, Estuary builds not committing) that are more urgent than any UI polish item, on top of the popover state-management bug carried over from earlier rounds. Design and plan against this revision's new sections now; implement them only once Bucket A is clean.

---

## 1. Vision & pitch

**One line:** Grow a stretch of the Goan coast — a mangrove stand in the estuary, a dune-backed beach, a khazan behind its bund — then hold your breath as the monsoon river rises or a cyclone comes in off the Arabian Sea, and see whether the mangroves, the seawall, or the old khazan you built actually holds.

**Feel:** exactly the reference pairing requested — Dorfromantik's unhurried, tactile tile-laying (the pleasure of a hex clicking into place, a "perfect fit" moment, watching a little settlement sprawl outward with no rush) as the Calm phase, and Thronefall's clean, low-stakes-but-real tension of a short, mostly-automated wave you've prepared for as the Hazard phase. It should look and feel like a cozy diorama you're building, not a spreadsheet with a 3D thumbnail.

**Who this is for, and how one game serves both (new in v3.0):** a 12-year-old and an engaged adult should be able to open the same game and both have a good time, without one of them being condescended to and the other bored. The answer isn't two rulesets — it's one set of mechanics, simple enough at its core to explain in one sentence ("build things that protect you, then see if they held"), with the *scale* of the challenge doing all the work of separating a gentle first hour from a genuinely hard tenth hour. Section 5 is where this gets concrete.

**Setting:** a stylized, game-appropriate Goa — not a literal GIS map. Real Goan geography gives the *shape* of the world (Section 4), real Goan hazards give the *stakes* (Section 3), and Dorfromantik gives the *look* (Section 7). Nothing here needs to be geographically accurate to Goa; it needs to feel unmistakably, specifically Goan rather than generic-tropical.

**Scope for this pilot, deliberately narrow:** browser only (no mobile/Capacitor work this pass — see Section 9), two hazards only — **Monsoon Flood** and **Cyclone** (Section 3) — and a trimmed solution roster (Section 4). Depth comes later, and now has a defined shape (Section 5's Chapters + Challenge Mode) rather than being an open-ended "add more stuff eventually."

---

## 2. Core loop — Calm, Forecast, Hazard, Aftermath

**Design rationale, read this before the mechanics below:** the loop as originally specced (Calm phase → telegraph → Hazard phase → meters update) was structurally sound but had one quiet gap that undercuts both the "12-year-old can play it" goal and the "adults get real depth" goal at once: **every effect fed one global number.** A Mangrove built anywhere on the map added the same amount to the same single Resilience pool as a Mangrove built exactly where the storm surge was about to hit. That makes tile *placement* — the entire point of a hex-grid game, and the source of Dorfromantik's actual pleasure — mechanically irrelevant to surviving a hazard. It also breaks the teaching goal: in reality a mangrove protects the coastline near it, not the country. The fix doesn't require abandoning the generic `effects: {key: delta}` architecture (Section 8 still applies) — it requires the hazard-resolution step to *read* those effects zone-by-zone instead of summing them into one global pool. Everything below assumes this fix.

### The loop, one Season at a time

A **Season** is the basic unit of play — one Calm period followed by one Hazard resolution, matching Goa's real dry-season/monsoon-season rhythm. (A handful of early Seasons in Chapter 1 have no hazard at all — see Section 5 — purely so a new/young player gets a few uninterrupted Seasons of just the satisfying tile-claiming loop before anything threatens it.)

**1. Forecast (new phase, sits between Seasons):** at the start of a Season, before the player touches anything, the game shows what's coming — hazard type, a rough strength indicator (1–3 icons, simple enough for a 12-year-old to read as "mild / strong / severe" without a number), and, critically, **where**: a translucent highlight sweeping in over the zone(s) of the map that will take the hit (Section 3 defines exactly how this differs between Cyclone and Flood). This turns the Calm phase that follows from open-ended sandbox building into a directed puzzle — "the storm's coming for the south beach, that's where reinforcing actually matters this Season" — without ever taking away the player's freedom to build anywhere they like. Shown in-scene (a translucent arc/tint over the threatened hexes plus small corner icons), never as a text panel, consistent with Section 6's "no player-facing hazard selector, no competing UI" rule.

**2. Calm phase (town growth — claiming and building):**
- The terrain map is fixed and pre-generated per Section 4; the player's own claimed footprint on it is what grows, one hex at a time, and **any unclaimed hex anywhere already visible on the map can be claimed** — the one deliberate departure from Dorfromantik's own frontier-adjacency rule, so a player can jump straight to the stretch of coast the Forecast just told them matters.
- On any owned tile, build **one** thing via the contextual popover (Section 6), filtered to what's valid on that terrain type and, from Chapter 2 onward, further filtered to whatever's unlocked so far (Section 5).
- **Player-paced, not timed.** There is no countdown clock pressuring the Calm phase — this is deliberate and non-negotiable for the 12-year-old bar: young players (and plenty of adults) disengage from tile-laying puzzles under time pressure. The player ends the Calm phase themselves, via an explicit "Ready" action, whenever they're satisfied with their preparation for the Forecast they've already seen. (Challenge Mode, Section 5, may add an optional soft timer as one of its harder-difficulty toggles — never in the campaign.)

**3. Hazard phase (consequence — short, mostly automatic, watchable):**
- Camera holds on the affected zone(s) from the Forecast. The hazard visibly propagates hex to hex along its spread rule (Section 3), roughly one hex per second — enough to read as a wave, not so fast it's illegible, not so slow it drags.
- **Local resolution, not a single dice roll:** at each hex the hazard reaches, the game sums the Resilience-relevant effects of elements built *on that hex and within its immediate zone* (Section 8 defines the exact radius/zone mechanism) and compares that local total against the hazard's current local intensity. Sufficient local resilience: the tile is protected, rendered as such (defenses visibly "hold" — a Mangrove or Seawall flashes/glows as it absorbs the hit), and the hazard's intensity is reduced before it continues to the next hex. Insufficient: the tile takes damage — a built element can be damaged/destroyed (rendered, not just logged), and if it's a House, Population/Food take a hit — and the hazard continues onward at only slightly reduced intensity.
- Engineered structures that exceed their own failure threshold don't just underperform — they **fail visibly and catastrophically** (a broken bund, a dam giving way), dumping the surge/flood they were holding onto the next hex at a multiplier. Keep this — it's the core "safe until, spectacularly, it isn't" moment, and it should be rare, memorable, and always *seen*.
- After resolution: the local outcomes are aggregated up into the Season's global meter deltas (Section 6) — this is where the generic `effects` accumulator (Section 8) still does its job, just fed by local outcomes rather than a flat sum of everything ever built.

**4. Aftermath (new phase, replaces a bare "meters update"):** a brief, map-still-visible results beat — which zones held, which didn't, meter deltas, a Season star rating, and one short, specific, non-preachy line tied to what actually happened this Season (Section 6). Then Coin/score is banked, the standing severity baseline ticks up slightly (Section 3), and the next Season's Forecast appears.

Repeat for the length of the current Chapter (Section 5). A Chapter ends when its authored Season count is reached; Population hitting zero is the only real story-mode failure state, and even that offers an easy retry of just that Season rather than restarting the Chapter (Section 6). Challenge Mode (Section 5) runs this same loop with no fixed end and a real, permanent loss state.

---

## 3. Hazards — distinct identities, not one mechanic with two skins

Cyclone and Flood need to feel like different problems that call for different preparation, not the same "hazard bar fills up, defend it" mechanic reskinned. This section defines both fully, plus the shared telegraph/escalation machinery.

### Cyclone

| Aspect | Design |
|---|---|
| **Origin** | The Sea edge (fixed side of the map, Section 4) |
| **Telegraph** | 1 Season's warning; a spinning storm icon plus a directional cone overlaid on the map showing which stretch of coastline will take landfall — the cone can be narrow (a focused hit) or wide (a broad Category 3 landfall), and its position varies Season to Season, so "always reinforce the same spot" stops working once Cyclones get stronger |
| **Spread** | Wind + storm surge as one combined effect (kept simple on purpose for this pilot). Hits Coast/Beach edge hexes within the landfall cone first; if local Beach-zone resilience is insufficient, it continues inland into the Land zone at reduced but real intensity, threatening Houses |
| **What matters most to defend against it** | Beach-zone elements — Dune, Sandy Vegetation, Seawall. A player who's invested entirely in the estuary and ignored the coast will feel a Cyclone find that gap directly |
| **Escalation** | Strength shown as 1–3 simple icons (mild / strong / severe), driving landfall-cone width and inland reach. Strength scales with the standing severity baseline (below) |

### Monsoon Flood

| Aspect | Design |
|---|---|
| **Origin** | The River's inland source edge (Section 4) |
| **Telegraph** | 2 Seasons' warning (longer than Cyclone's — floods build more slowly and more visibly in reality); a rainfall-intensity gauge (light / heavy / extreme) shown ahead of time, and the River tiles visibly swell/darken as the Season approaches |
| **Spread** | Flows tile-by-tile down the fixed River path toward the Estuary; if local Estuary-zone resilience is insufficient it can spill onto adjacent Land/Beach hexes near the river mouth |
| **What matters most to defend against it** | Estuary/River-zone elements — Mangrove, Khazan, and *not* over-relying on Small Dam, whose flood-resilience penalty (Section 4) can turn a Flood Season into a dam-break moment if it's carrying too much of the local defense on its own |
| **Escalation** | Rainfall intensity (light/heavy/extreme) scales with the standing severity baseline, driving how far downstream/inland the flood reaches even through moderate defenses |

### Shared machinery

- **Standing severity baseline:** a slowly-rising modifier (already present in earlier revisions, formalized here) that biases both which hazard is more likely to appear and how strong it lands, increasing Season over Season within a Chapter and indefinitely in Challenge Mode. This is what makes "the same Chapter 1 map, replayed" feel meaningfully different by Season 6 than Season 1 without any new rules being introduced — pure data escalation.
- **Compound events — reserved for late Chapters and Challenge Mode only, never early:** a Season where a Cyclone-driven storm surge pushes upriver at the same time heavy rain is swelling the river from upstream, so both defense lines are tested in the same Season. This should read as a clear, telegraphed "big one" — a natural finale beat for a Chapter — not a surprise, and never appears before a player has separately mastered each hazard on its own.

---

## 4. Buildable elements — a small, concrete, fully-specified roster

Unchanged from v2.4's roster in substance; included here for completeness since Section 5 below governs *when* each of these unlocks across the Chapter progression.

### A generic, extensible effects model — standing architectural requirement

**Do not hardcode a fixed set of meter columns (resilience, biodiversity, money, …) into game logic.** Every buildable element has an `effects` map — an open set of `{ key: delta }` pairs — applied generically. This is what lets you add, edit, or delete an element's properties, or add a wholly new tracked property, by editing a data file — never by touching engine code. Section 2's local-resolution model changes *how* Resilience-tagged effects get read during a hazard (zone-scoped, not a flat global sum) — it does not change this schema.

**Resilience is the only hazard-facing property.** No separate Risk/exposure value. An element that makes a tile more exposed or dangerous simply moves Resilience down, by a larger amount if the effect is meant to feel severe.

### Beach elements

| Element | Terrain | Category | Effects | Notes |
|---|---|---|---|---|
| **Dune** | Beach | NBS | Resilience + | Cheap, straightforward erosion/surge buffer |
| **Sandy Vegetation** (Pandanus) | Beach | NBS | Resilience +, erosion protection | Root-network erosion control specifically; Pandanus (screw pine) is a real, recognizable Goan beach plant, use it in the icon (Section 7) |
| **Seawall** | Beach | Engineered | Resilience + (less than Mangrove's number), Biodiversity − | Expensive, fast to build (no maturation delay), reduces biodiversity |

### Estuary elements

| Element | Terrain | Category | Effects | Notes |
|---|---|---|---|---|
| **Mangrove** | Estuary | NBS | Resilience ++, Biodiversity ++, Food + | The strongest single resilience number in the roster, deliberately — the "if in doubt, plant mangroves" baseline other options trade against |
| **Khazan** | Estuary | Hybrid | Resilience + (flood; less than Mangrove's), Money +, Food + | Goa's real bund-and-sluice tidal farming system — works with the tide rather than against it |

### River elements

**River is deliberately restricted to exactly two options (see `STEP_PROMPT_visuals_map_river.md`), and they are no longer symmetric — Small Dam is now a real flood-defense structure, Sand Mining is the purely extractive option:**

| Element | Terrain | Category | Effects | Notes |
|---|---|---|---|---|
| **Small Dam** | River | Engineered | Money +, Biodiversity −, **Resilience + (flood)** | **Sign flipped as of the visuals/map/river step-prompt** — earlier revisions had this as Resilience-negative ("trades away flood defense for income"); it's now a flood-control structure that actively helps, at Biodiversity's cost. Section 2's catastrophic-failure rendering (breaks under load, dumps its held-back water downstream at a multiplier) still applies |
| **Sand Mining** | River | Engineered/Economic | Money +, Biodiversity −, Resilience − (flood) | New. Now carries the "pure income at a real cost" role on River — costs *both* Resilience and Biodiversity, a harsher trade than Small Dam's. Tune magnitudes/build cost carefully (Section 11's schema note) so this isn't simply worse than Small Dam in every respect |

### Land elements

| Element | Terrain | Category | Effects | Notes |
|---|---|---|---|---|
| **House** | Land | Economic | Money +, Food − | The starting residential area is 10 of these, pre-built. Population-per-House and exact income are placeholder values (Section 8), flagged as such |

### Cross-terrain: Beachside Resort

**Beachside Resort** — Economic — Money ++, Resilience −− (the steepest resilience hit in the roster) — eligible on **Beach and Estuary**. (v2.4 had widened this to include River as well; that's reverted — River is now reserved for Small Dam and Sand Mining only, above, so it reads as its own distinct tradeoff rather than overlapping with Resort's.) The tension it creates (good income, worse-defended tile) applies wherever it's legal to build.

**No category is ever strictly better** — Mangrove is the strongest single resilience option and produces Food but no Coin; Khazan makes modest Coin and Food at a real Resilience cost relative to Mangrove; Resort makes strong Coin anywhere, at the steepest Resilience cost in the roster; Seawall buys resilience fast but hurts biodiversity and costs more than it returns compared to Mangrove; Small Dam is Coin with a flood-resilience cost attached, full stop; House is steady Coin that quietly taxes the Food economy.

---

## 5. Progression & difficulty — Chapters for the ramp, Challenge Mode for the ceiling

This is the section that answers "simple enough for a 12-year-old, with real depth for adults" directly. The answer is deliberately **not** two different rulesets — one game, one set of mechanics (Sections 2–4), tuned by data across an authored campaign, with an uncapped postgame for players who want to keep going. This keeps the whole system buildable within the existing data-driven architecture (Section 8) instead of forking the game in two.

### Why Chapters, not a single escalating map

A single map that just gets harder forever is a fine *postgame* (that's exactly what Challenge Mode is, below) but a poor *first hour*: a new or young player needs a few genuinely easy, low-stakes reps of the core loop before the game asks anything hard of them, and the cleanest way to guarantee that without a fragile difficulty-detection system is to hand-author the first few Seasons' worth of generosity directly. Each Chapter is its own small, complete map (generated the same way as before — Section 4's mapgen, parameterized per Chapter) and its own authored sequence of Seasons.

### The campaign, worked as a concrete progression

| Chapter | Map size | Terrain unlocked | Roster unlocked | Hazards | Seasons | Economy | Teaches |
|---|---|---|---|---|---|---|---|
| **1 — First Monsoon** | Tiny (~30–40 hexes) | Beach, Land, a small Estuary (no River yet) | Dune, Mangrove, House (pre-built) | Flood only, mild, telegraphed with an on-screen hint prompt | 3–4, first 1–2 hazard-free | Very generous Coin | The core loop itself: claim, build, watch, survive |
| **2 — Beach Season** | Small | + full Beach | + Seawall, Sandy Vegetation | Cyclone only (Flood paused so the new mechanic is learned in isolation) | 3–4 | Generous | Cyclone's distinct spatial identity |
| **3 — Two Fronts** | Medium | + full River | + Khazan, Small Dam | Both hazards, appearing separately across the Chapter | 4–5 | Standard | Balancing two defense fronts at once |
| **4 — Full Coast** | Full size | All terrain | Full 8-element roster (+ Resort) | Both hazards, finale Season is a telegraphed compound event | 5–6 | Tight | Everything at once, at real stakes |
| **5+ — Challenge Mode** | Full size (or larger, procedurally) | All | All | Both, standing severity baseline escalates every Season indefinitely | Unbounded | Tight, no safety net | Mastery — score is Seasons survived |

**One new rule to teach per Chapter, never two at once** — this is the actual mechanism that makes the ramp work for a 12-year-old without a tutorial wall of text: Chapter 1 is the loop alone, Chapter 2 adds exactly one hazard type on an isolated map, Chapter 3 adds the second front, Chapter 4 removes the training wheels. An adult who already gets it can play through Chapters 1–3 quickly (they're short and the outcome is rarely in doubt) and the real challenge starts around Chapter 4 and continues indefinitely in Challenge Mode.

**A lightweight difficulty toggle, orthogonal to Chapter progress:** within any unlocked Chapter, offer Story / Standard / Tough, which does nothing but scale starting Coin, hazard intensity, and income by a data-driven multiplier (Section 8) — no new rules, no new content, just retuning the same numbers. This lets an adult replay Chapter 1's tiny map on Tough for a real puzzle, or lets a struggling player drop a stuck Chapter to Story rather than getting stuck on the campaign's only copy of that content.

**Roster/terrain gating is itself the accessibility lever**, not a separate "simple mode": a 12-year-old on Chapter 1 is choosing between two elements on three terrain types — a genuinely simple decision space — while an adult in Challenge Mode is juggling all eight elements across five terrain types under an ever-tightening economy. Same rules throughout; the *size of the decision space* is what's actually being scaled.

---

## 6. Scoring, failure state & feedback

**Story-mode Chapters are non-punishing by design.** A hazard can damage or destroy a specific built element and reduce Population/Food if a House takes an unmitigated hit — rendered visibly, per Section 2 — but there is **no hard "Game Over" screen** anywhere in the campaign. A rough Season is a setback to recover from during the next Calm phase (built elements can be repaired for a Coin cost), not a run-ending failure. The **only** real story-mode fail state is Population reaching zero, and even that offers an immediate, easy retry of just that Season with a hint about what went wrong — never a full Chapter restart.

### Season star rating

A simple, three-tier, kid-legible rating computed right after each Hazard resolves:

- **★★★** — no Population loss and no built element destroyed this Season.
- **★★** — some loss, but Population loss under roughly a fifth, or at most one element destroyed.
- **★** — the Season was rough, but the settlement is still standing.

Stars aren't gated behind anything and don't block progression — a Chapter advances regardless of star count, so a young or new player is never stuck. Stars accumulate toward light meta-progression (an unlocked cosmetic building skin, a "legacy tile" carried into the next Chapter) — reward for doing well, never a punishment for doing poorly.

### Aftermath feedback — the educational payoff, delivered through consequence, not lecture

Immediately after each Hazard resolves, one short, specific, non-preachy line, generated from what actually happened that Season (which elements absorbed how much, where the defense held or didn't) — never a generic tip, always tied to this Season's real outcome. For example: *"Your Khazan held the tide back — the fields stayed dry,"* or *"No mangroves on that stretch — the surge went straight through to three Houses."* This is how the game teaches real NBS-vs-engineered tradeoffs: through what just happened on the player's own map, not through onboarding text or a codex nobody reads. Keep this data-driven off the same `effects` map already powering everything else (Section 8) — the line references whichever elements' Resilience effects actually fired locally this Season, not a hand-authored script per hazard.

### Challenge Mode — the one place a real loss state belongs

Once Chapter 4 is complete, Challenge Mode is unlocked: the same full roster and map, the standing severity baseline escalating every Season with no ceiling, and — deliberately, because it's opt-in and post-campaign — a real, permanent loss state ("your settlement was lost — final score: N Seasons survived"). This is where score-chasing, leaderboard-style replay value lives, aimed squarely at the players (of any age) who finished the campaign and want to keep testing themselves. It's the answer to "adults need real depth" that doesn't require compromising the campaign's non-punishing design for everyone else.

---

## 7. What the screen must always show (non-negotiable UI shape)

Borrowing directly from the 80.lv breakdown of Dorfromantik's approach and the actual v1 failure as a cautionary example:

- **The map is the interface.** Resource counts, the current Forecast (Section 2), and the Season star rating are the only persistent/recurring UI, and they're small, corner-anchored, unobtrusive — never a card that competes with the map for screen space.
- **Contextual, not global, menus.** Build choices appear at the tile you clicked, in 3D space, and disappear when you're done. There is no permanent "here are all N buildable things" panel sitting on screen at all times.
- **One tile, one element — a hard rule, not a suggestion.** Every claimed tile can hold at most one built element (no stacking, no replacing without an explicit future demolish step). The instant a build succeeds, the popover closes automatically; clicking a tile that already has something built on it shows that tile's current occupant instead of re-offering the full build menu.
- **The popover needs a real modal layer.** Confirmed by live playtest that clicks currently pass straight through an open popover to the 3D scene underneath it — this is why outside-click/Escape dismissal has been unreliable across several rounds of testing. Give it a backdrop that captures all pointer events while open; clicking anywhere that isn't the popover itself closes it with no charge (`NEXT_STEPS.md` A1 has the full repro).
- **The Forecast lives in the scene, not in a text panel.** A translucent highlight over the threatened zone(s), small corner icons for hazard type/strength — never a "Cyclone incoming!" modal dialog that blocks the map.
- **No player-facing hazard selector.** The game decides and telegraphs what's coming; the player never picks a hazard to test from a menu mid-play. A separate, clearly-labeled developer/debug overlay, toggled by a hidden hotkey and never visible in a normal playthrough, is fine to keep for scenario testing (Section 11).
- **Readable in grayscale.** Before adding any color, check that tile types, building silhouettes, and the Forecast highlight are all distinguishable in a grayscale screenshot.

---

## 8. The world: terrain, layout, and economy

**Scope narrowed on purpose:** no plateau, no Ghats-forest highland, no elevation tiers, for this pilot. Coastal-only.

**The map is fixed and authored, not player-drawn**, generated once at world-init via the WFC-lite edge-matching approach, parameterized per Chapter for size and which terrain types are present (Section 5). The player's claimed footprint is what grows over time, and claiming isn't constrained to grow outward from an existing frontier — any unclaimed hex, anywhere, can be claimed directly.

**Geography, explicit orientation:** live playtesting found the generated map currently doesn't match this yet — the whole landmass renders as a small island with Sea wrapping every side, and the River cuts a thin diagonal vein through the Land interior rather than sitting toward one edge (`NEXT_STEPS.md` B1 has the full repro with a zoomed-out screenshot). The intended layout, unchanged from v2.4 and still the target: **Sea fixed to one edge of the map** (left, by convention). Moving inward from there: a **Beach** strip fronts the sea. Further inland is open, buildable **Land**, where the residential area sits. Toward the opposite side of the map, a **River** channel runs down from an inland edge, and where it reaches the sea it forms an **Estuary** — tidal, mangrove-and-khazan-fringed. Left to right: **Sea → Beach → Land (interior) → Estuary/River**, with the river continuing further inland beyond the estuary as a coherent, branching feature (not a narrow single-hex vein). No highland, no elevation gradient — hazard propagation (Section 3) works by zone/adjacency from the hazard's source.

**A real Goa reference is worth using — as a mood/shape guide, not a trace.** Goa's actual coastline has real character worth borrowing: an elongated, gently curving shore, and — most distinctively — the Mandovi and Zuari rivers reaching the sea close together near a peninsula around Panaji, producing a wide, branching estuarine/backwater complex rather than a single narrow river mouth. Reference OpenStreetMap or Wikipedia's Goa articles for proportions (estuary width relative to coastline, gentle coastal curve) to bake into the mapgen's region rules — never ship a traced copyrighted map image as a game asset.

**Claiming, not choosing:** unclaimed hexes render dimmed/desaturated (of their true terrain color, not one flat placeholder tone — `NEXT_STEPS.md` A2). Claiming costs a small amount of Coin (this must actually subtract, not add — `NEXT_STEPS.md` A4) and reveals the hex at full color/detail with a settle animation.

**Starting state, per Chapter:** Chapter 1 begins with 50 Population, a pre-built residential cluster of 10 Houses on Land, and a generous starting Coin value (1,000 was this pilot's testing value — Section 5's economy tuning replaces this per-Chapter going forward, still clearly flagged as provisional where it remains a placeholder).

**Terrain tile types:**

| Terrain | Flavor | Buildable? | Notes |
|---|---|---|---|
| Coast | Open Arabian Sea | No | Cyclone's origin edge |
| Beach | Sandy shoreline strip | Yes | Cyclone lands here first |
| Land | Interior/inland ground | Yes | Generic buildable interior terrain between Beach and Estuary/River; hosts the residential area |
| Estuary | Tidal, mangrove-and-khazan-fringed river mouth | Yes | Where the River meets the Coast; Flood's downstream end |
| River | Freshwater channel inland from the estuary | Yes | Flood originates upstream and flows toward the estuary |

**Retired for now:** Laterite Plateau, Forest/Ghats-foothill, and the 3-tier elevation system — natural candidates for a post-Challenge-Mode expansion, not this pilot.

**Economy:** Coin (earned from money-generating elements, spent on claiming and building) and Food (produced by Mangrove/Khazan, consumed by Houses, default value 1 per unit pending real tuning). What a Food deficit actually does is still not decided — track it accurately, don't hard-block anything on it without an explicit instruction.

---

## 9. Visual & UX direction — Dorfromantik is the target, not an inspiration board

- **Camera:** a slight top-down perspective, pan and zoom only (both confirmed working by live playtest). No rotation needed for this pilot.
- **Color, not texture:** low-poly hex-prism tiles, no unique per-tile textures — a vertex-color/material-tint system keyed by terrain type, exactly Dorfromantik's own documented approach.
- **Palette — Goan, not generic-tropical:** turquoise-to-deep-blue Arabian Sea, sun-bleached sand gold for Beach, deep mangrove teal-green for Estuary, warm river-brown/green for River, laterite red-orange kept alive through building/roof materials even without a plateau terrain type to carry it.
- **Lighting:** one directional "sun" light plus soft fog/atmosphere for depth.
- **Grayscale check:** before calling a phase's visuals done, desaturate a screenshot and confirm terrain types, buildings, and the new Forecast highlight are still distinguishable by shape/value alone.
- **Motion and feedback live in the world, not in text:** a tile settling into place, a building popping up with a bounce, water visibly rising, a structure visibly breaking, a defense visibly glowing as it absorbs a hit (Section 2). Numbers update in the small corner HUD, but the *event* itself is visible on the map first.
- **Icons need real design thought, not placeholder glyphs.** Each of Section 4's 8 elements needs its own distinct, legible icon. Confirmed by live playtest that the current House icon reads as a bench/couch, not a dwelling — needs a simple pitched-roof-over-a-box silhouette that reads as "house" from the game's camera angle. Dune, Sandy Vegetation (a recognizable Pandanus/screw-pine silhouette, not a generic palm), Seawall, Mangrove, Khazan, Small Dam, Beachside Resort follow the same bar: simple, flat, high-contrast, legible at small size, distinguishable from each other at a glance.

---

## 10. Meters, scoring & data model summary

Five running values, tracked generically per Section 4's effects model, aggregated per-Season from the local hazard resolution described in Section 2: **Resilience** (the single hazard-facing property — driven down by unmitigated damage and by elements like Beachside Resort or Small Dam that trade it away for income), **Biodiversity** (driven by NBS/hybrid coverage and maturity), **Money/Coin** (spendable economy resource), **Food** (produced by Mangrove/Khazan, consumed by House), **Population** (starts at 50 per Chapter 1, tied to House count). Season-level scoring is the star rating in Section 6, not a raw meters-to-score formula — don't let a formula collapse to "biggest map wins" or "build every Resort wins"; the star rating is deliberately outcome-based (did the settlement come through intact) rather than accumulation-based.

---

## 11. Technical architecture (browser-first pilot — mobile is explicitly out of scope this pass)

- **Stack:** Three.js + TypeScript + Vite. Plain `WebGLRenderer` to start; don't reach for WebGPU/TSL for this pilot.
- **Rendering:** one `InstancedMesh`/`BatchedMesh` per terrain and building category, not per-hex meshes.
- **No mobile/Capacitor work this pass.** Normal responsive site, pointer events (not mouse-only) so a later mobile pass isn't a retrofit, but no Capacitor wrapper budgeted this pilot.
- **Data-driven balance, generic effects model — standing architectural requirement:** every terrain, element, and hazard entry lives in a JSON file, and every element's game-state impact goes through one generic `effects: { key: delta }` map applied by one generic accumulator — never a hardcoded per-meter branch. Adding a new element, or a new tracked property, is a data-file edit, never a code change.
- **New in v3.0 — local/zone resilience resolution (Section 2's core change):** the hazard-resolution step needs a spatial scoping mechanism between "per-hex" and "whole map." Recommended MVP for this pilot's map sizes: divide each Chapter's map into a small number of named **zones** (e.g. "North Beach," "Estuary Mouth," "South River," 4–6 per Chapter depending on map size) rather than true per-hex-radius calculation — cheap to implement, still gives real spatial stakes, and scales naturally to more/finer zones on larger Chapter 4+/Challenge Mode maps if per-hex radius calculation turns out to be worth the extra complexity later. A hazard's local intensity at a zone is compared against the sum of Resilience effects from elements built within that zone; insufficient resilience lets the hazard continue to the next zone along its spread path at reduced-but-real intensity. `hazards.json`'s existing `spreadRule` field is where this plugs in — extend it to walk zones (or hexes) in the defined order rather than resolving against a single global Resilience number.
- **New in v3.0 — Chapter config:** each Chapter (Section 5) needs its own small config — map size/seed parameters for mapgen, which terrain types and roster elements are unlocked, hazard set and Season count, and economy multipliers (starting Coin, income scaling) for the Story/Standard/Tough toggle. Keep this as data (`chapters.json` or one file per Chapter), consistent with the rest of the architecture — a new Chapter should be authorable without touching engine code, same principle as `elements.json`.
- **Folder structure**, adjusted for the trimmed scope:

```
/src
  /core        (hexUtils, state/store, turn/phase machine, generic effects accumulator,
                zone-resolution logic for hazard spread — pure logic, unit-testable, no Three.js imports)
  /render      (Three.js scene, InstancedMesh managers, camera controller, claim/build/hazard animations)
  /data        (terrain.json, elements.json, hazards.json, chapters.json)
  /ui          (small corner HUD, contextual in-scene build popover with modal backdrop,
                in-scene Forecast overlay, Aftermath results beat)
/tests         (hexUtils, phase-machine, effects-accumulator, zone-resolution/damage-formula unit tests)
/tools         (mapgen — parameterized per Chapter — and the headless screenshot + smoke-test script)
PROGRESS.md
```

**Data schema examples**, reflecting the roster and the generic effects map (unchanged from v2.4):

```json
{
  "id": "mangrove",
  "name": "Mangrove",
  "category": "nbs",
  "terrain": ["estuary"],
  "targetsHazards": ["monsoon_flood", "cyclone"],
  "buildCost": 40,
  "footprintHexes": 1,
  "matureTurns": 3,
  "effects": { "resilience": 8, "biodiversity": 6, "food": 1 },
  "icon": "mangrove"
}
```

```json
{
  "id": "beachside_resort",
  "name": "Beachside Resort",
  "category": "economic",
  "terrain": ["beach", "estuary", "river"],
  "targetsHazards": [],
  "buildCost": 60,
  "footprintHexes": 1,
  "matureTurns": 0,
  "effects": { "money": 12, "resilience": -8 },
  "icon": "resort"
}
```

```json
{
  "id": "small_dam",
  "name": "Small Dam",
  "category": "engineered",
  "terrain": ["river"],
  "targetsHazards": ["monsoon_flood"],
  "buildCost": 55,
  "footprintHexes": 1,
  "matureTurns": 0,
  "effects": { "money": 10, "biodiversity": -4, "resilience": 5 },
  "icon": "dam",
  "note": "resilience is POSITIVE as of the visuals/map/river step-prompt — earlier revisions had this negative. Re-check any hazard/damage-formula code that special-cased Small Dam as a resilience-negative element."
}
```

```json
{
  "id": "sand_mining",
  "name": "Sand Mining",
  "category": "engineered",
  "terrain": ["river"],
  "targetsHazards": ["monsoon_flood"],
  "buildCost": 35,
  "footprintHexes": 1,
  "matureTurns": 0,
  "effects": { "money": 12, "biodiversity": -5, "resilience": -6 },
  "icon": "sand_mining",
  "note": "PLACEHOLDER NUMBERS — only the direction of each effect is specified (money up, biodiversity down, resilience down). Tune so this isn't simply worse than Small Dam in every respect; a lower buildCost and no maturation delay (both reflected above as a starting guess) are one way to justify it as the 'cheap and fast but harsher' option."
}
```

```json
{
  "id": "house",
  "name": "House",
  "category": "economic",
  "terrain": ["land"],
  "targetsHazards": [],
  "buildCost": 25,
  "footprintHexes": 1,
  "matureTurns": 0,
  "effects": { "money": 5, "food": -1 },
  "icon": "house",
  "note": "PLACEHOLDER VALUES — buildCost, money, and population-per-house are not yet specified; food:-1 is the one number explicitly given (default value 1). Flag these as provisional in PROGRESS.md."
}
```

**New — Chapter config example:**

```json
{
  "id": "chapter_1_first_monsoon",
  "name": "First Monsoon",
  "mapSize": "tiny",
  "terrainUnlocked": ["coast", "beach", "land", "estuary"],
  "rosterUnlocked": ["dune", "mangrove", "house"],
  "hazardsEnabled": ["monsoon_flood"],
  "seasonCount": 4,
  "hazardFreeOpeningSeasons": 2,
  "startingCoin": 400,
  "startingPopulation": 50,
  "startingHouses": 10,
  "difficultyMultipliers": { "story": 1.5, "standard": 1.0, "tough": 0.7 },
  "_note": "Numbers here are first-pass placeholders for the ramp described in Section 5 — tune by actual playtest, not by guessing further."
}
```

The remaining roster elements (Sandy Vegetation, Seawall, Khazan) follow the same shape as the examples above. `terrain.json`: `id`, `edgeTypes` (6), `flammability` (unused this pilot), `decorationDensityRange`, `colorKey`. `hazards.json`: `id`, `spreadRule` (now zone-walking per the note above), `baseSeverity`, `severityBaselineKey`, `telegraphSeasons`, `zoneMap` (which zones this hazard's spread rule walks, in order).

---

## 12. Build milestones — visual gate moved up front, checked every phase

**Read this against `NEXT_STEPS.md` and Section 0.1 before picking up work here.** As of this revision, the actual next work is whatever `NEXT_STEPS.md`'s Bucket A still has open — including the two new critical bugs (claim cost inverted, Estuary builds not committing) — not Section 2–6's new mechanics. The phases below are the fuller intended arc, updated to reflect this revision's additions, for when that's true.

**Phase 0 — Scaffold + visual proof of life.** *(Landed.)* Fresh repo, `hexUtils` unit-tested, a scene renders a small hand-placed multi-terrain cluster with instanced meshes, vertex-color tinting, the Section 9 camera angle, one directional light + fog.

**Phase 1 — Fixed map generation + claim-anywhere loop.** *(Substantially landed — camera pan/zoom and claim-anywhere both confirmed working. Still open: the map's actual generated layout doesn't match Section 8's explicit orientation — confirmed via a zoomed-out screenshot to be a full island shape, not a coastline strip — and the claim-cost sign/amount bug, `NEXT_STEPS.md` A4.)*

**Phase 2 — Beach, Estuary, River, and Land elements.** *(Substantially landed for the build/popover-filtering mechanics. Two open bugs: the popover doesn't auto-close/reflect built state, `NEXT_STEPS.md` A1; and building on an Estuary tile deducts Coin without committing the build, `NEXT_STEPS.md` A5.)*

**Phase 3 — First hazard (Monsoon Flood), global resolution.** Monsoon Flood working end to end with the *original* global-meter resolution — telegraph, spread along the river path, damage, tested against each River/Estuary element.

**Phase 4 — Second hazard (Cyclone), global resolution.** Cyclone added with the same global-resolution approach, tested against each Beach element, checked for no dominant strategy.

**Phase 5 — Local/zone resilience resolution (new, v3.0).** Once Phases 3–4 prove the hazards work at all, upgrade the resolution model from a global meter sum to the zone-based local resolution in Section 2/11 — this is a deliberate two-step build (get the hazard working simply first, then make placement spatially meaningful) rather than trying to build the harder version first.
*DoD:* a scripted scenario shows two otherwise-identical Seasons — Mangrove built in the zone the Forecast telegraphed vs. Mangrove built elsewhere on the map — producing visibly different outcomes; a screenshot shows the Forecast's threatened-zone highlight matching where the hazard actually resolves.

**Phase 6 — Forecast phase + Aftermath feedback (new, v3.0).** The Forecast beat (Section 2) — hazard type/strength/zone shown in-scene before the Calm phase — and the Aftermath beat (Section 6) — star rating plus the data-driven feedback line.
*DoD:* a full Season plays with a visible Forecast highlight, a player-paced Calm phase with no clock, a watchable Hazard resolution, and an Aftermath screen showing an accurate star rating and a feedback line that correctly references what happened that Season.

**Phase 7 — Chapter 1, fully authored (new, v3.0).** Build "First Monsoon" per Section 5/11's config exactly — tiny map, 3 elements, Flood only, hazard-free opening Seasons.
*DoD:* a full Chapter 1 playthrough, start to finish, with no stuck state; this is the first build milestone that should be genuinely handed to a real 12-year-old playtester if one is available.

**Phase 8 — Chapters 2–4 + Challenge Mode.** Build out the rest of the campaign per Section 5's table, then Challenge Mode's uncapped escalation and real loss state.
*DoD:* all four Chapters completable start to finish; Challenge Mode runs indefinitely with visibly increasing difficulty and a working permanent-loss end state.

*(Mobile/Capacitor is intentionally not a phase in this pilot.)*

---

## 13. Self-iteration & testing protocol

Unit tests for hex math/damage formulas/zone-resolution logic/phase transitions block phase advancement on failure. Deterministic seeded-scenario tests catch balance regressions without a human playing — this matters more than ever with per-Chapter economy tuning (Section 11). A headless Playwright smoke test loads the build, runs a scripted sequence, takes a screenshot every run, and checks the console for errors — save screenshots into `PROGRESS.md`'s history. At the end of Phases 5, 6, 7, and 8 specifically, write a short honest self-assessment against: does the local/zone resolution actually make tile placement matter (not just theoretically, but in a scripted "same elements, different placement" test); does a Forecast-to-outcome Season feel like a real puzzle rather than busywork; would Chapter 1 genuinely make sense to a 12-year-old with no explanation beyond the in-scene Forecast and Aftermath beats; is there still a Dorfromantik-style "that tile fit perfectly" moment anywhere. Commit at every phase boundary. Stop and flag a human only for genuinely irreversible/ambiguous calls — everything else, make the smallest reasonable call, log it in `PROGRESS.md`, keep going.

---

## 14. Open questions & escape hatches

- **Name:** "Khazan" is a strong, meaningful placeholder tied directly to the game's signature mechanic — don't block on renaming.
- **Art:** procedural low-poly + vertex color only through Phase 8, no external asset dependency.
- **If performance can't hit a smooth browser frame rate:** reduce live-grid cell cap and instance count before touching the visual language — the look is the point of this rewrite.
- **Mobile:** deliberately deferred.
- **Zone granularity (new, v3.0):** the named-zone MVP in Section 11 is a deliberate simplification of true per-hex-radius resolution — if it turns out to feel too coarse once playtested (e.g., a Mangrove built at the very edge of a zone protecting a hex that's actually quite far from it), moving to a per-hex radius model is the natural next step, and the generic effects architecture doesn't need to change to support it — only the spread-walking logic in `hazards.json`'s `spreadRule`.
- **Third hazard / more elements / plateau-and-highland terrain / Challenge Mode beyond a basic escalating loop (e.g. leaderboards, seasonal community challenges):** all natural expansions once the four-Chapter campaign is proven, polished, and playable — don't scope-creep into any of them now.

---

## Research grounding

- [How Dorfromantik Expands Its Cozy World Through Minimalist Design — 80.lv](https://80.lv/articles/how-dorfromantik-expands-its-cozy-world-through-minimalist-design)
- [Game UI Database — Dorfromantik](https://www.gameuidatabase.com/gameData.php?id=706)
- [Goa River Profile — SANDRP](https://sandrp.in/2016/11/25/goa-river-profile/)
- [Zuari River — Wikipedia](https://en.wikipedia.org/wiki/Zuari_River)
- [Khazans of Chorão Island — Goa Water Stories / Living Waters Museum](https://goawaterstories.livingwatersmuseum.org/stories/khazans-of-chorao-island)
- [Salim Ali Bird Sanctuary — Wikipedia](https://en.wikipedia.org/wiki/Salim_Ali_Bird_Sanctuary)
- [Mangroves of Goa: Silent Protectors of the Coastline — itsgoa.com](https://itsgoa.com/mangroves-of-goa-coastline-protectors)
- [Cyclone Tauktae exposes vulnerabilities along India's west coast — Mongabay India](https://india.mongabay.com/2021/05/cyclone-tauktae-exposes-vulnerabilities-along-indias-west-coast/)
- [Cyclone — Government of Goa, Directorate of Fire & Emergency Services](https://dfes.goa.gov.in/cyclone/)
- (Sections 4/8/9/13 also carry forward all v1 research on WFC hex generation, Thronefall, and general NBS-vs-engineered cost/benefit figures — see the original grounding list, still valid and not repeated here.)
