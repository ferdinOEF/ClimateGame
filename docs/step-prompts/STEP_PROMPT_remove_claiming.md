# Khazan — Step Prompt: Remove the Claiming Step, Build Advances the Turn

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or the prior step prompts — read those first. Drafted after reading `gameState.ts`, `hazard.ts`, `main.ts`, `hud.ts`, and `tests/balance.test.ts` directly.

**The ask, confirmed:** every tile on the map is already active/open — there's no separate "claim it first" step before a player can build. The player looks at the map and starts building wherever they want, immediately. **Confirmed separately: Build becomes the action that advances a turn**, taking over that job from Claim (which goes away entirely) — same cadence idea (pays income, ticks maintenance, moves the flood/cyclone schedule forward), just triggered by a different player action. An idle player who builds nothing doesn't advance turns or draw hazards, same as today's behavior with claiming.

---

## What changes in `gameState.ts`

- **Remove `claim()`, `isClaimable()`, `canClaim()`, and `CLAIM_COST`.** There's no longer a paid action that turns a tile from inert to active — every tile already is.
- **`claimed` stays in the codebase, but becomes "every tile on the map," always.** Rather than ripping `claimed` out of every place that reads it (the HUD tile counter, `computeEraScore()`'s map-size term, `buildableAt()`'s gate), the minimal, low-risk change is: initialize `claimed` to contain every key in `placed` — both in the constructor and in `startNewEra()` — instead of just the small starting cluster. Once `claimed` always equals `placed`, every existing check that reads `claimed` keeps working correctly with zero behavior change beyond "now it's everything, from turn one." `buildableAt()`'s `!this.claimed.has(key)` check can stay as-is (always true now) or be simplified to check `placed.has(key)` directly — either is fine, whichever reads cleaner.
- **`startingClaim` in `map.json` becomes vestigial.** It no longer gates anything once `claimed` = `placed` unconditionally. Leave the field in existing map files (harmless, just unused) rather than requiring an edit to every map — including the hand-paintable map editor's export format, which still writes it through unchanged.
- **Move the turn-advancing call from `claim()` into `build()`.** Today, `claim()` is the sole call site of `advanceTurn()` — that responsibility transfers directly: after `build()` successfully deducts `buildCost` and places the element instance, call `this.advanceTurn()` (same method, unchanged internals — pays `meterTotal("money")`, ticks maintenance, and now also the food-deficit drain from `STEP_PROMPT_economy_food_yacht.md` if that's landed). No hazard-timing or income-cadence logic needs to change, only what triggers it.

## What changes in the UI (`main.ts`, `hud.ts`, `buildPopover.ts`)

- **Clicking any unbuilt tile should open its build popover directly** — no intermediate "claim this tile" click, no claim cost, no claim ring animation. `ClaimRingMeshManager` (`render/claimRingMeshManager.ts`) has no more job to do once there's no claim action to visualize — stop calling it (removing the file entirely is fine too, your call on how much dead code to clean up in this pass).
- **HUD's "next hex to claim" prompt (`Hud.setClaimable`)** no longer makes sense as worded — either remove it, or repurpose it into something that still orients the player (e.g. "N tiles still empty" as a soft progress indicator). Either is fine; the only requirement is it shouldn't still say "claim."
- **The `?autoclaim` dev URL param** (`main.ts`) has nothing left to do — remove it, or leave it as a harmless no-op if that's less churn than tracing every call site.

## Cross-cutting: the balance-tuning harness calls `claim()` directly

**This is the one place a silent breakage is likely.** `tests/balance.test.ts`'s scripted playthrough loop calls `state.claim(coord)` every iteration as both "take this tile" and "advance a turn" in one call. Once `claim()` is gone, that test won't compile. Update the harness's loop to just call `state.build(coord, elementId)` directly wherever it previously did `state.claim(coord)` followed by an opportunistic build — since every tile is already ownable, the harness's per-turn logic simplifies to "pick a tile, build on it if there's an affordable, category-preferred option" with `build()` alone now carrying the turn forward. If `STEP_PROMPT_balance_tuning.md`'s fuller archetype pass (naive/economic-rush/defense-max/balanced/do-nothing) hasn't been run yet, do this compatibility fix first — that pass should be built against the claim-free architecture from the start, not patched twice.

## Worth flagging, not mandating a fix

`computeEraScore()`'s `state.claimed.size * 0.3` term (`scoring.ts`) rewards map footprint — but once every tile is claimed from turn one for every playthrough alike, that term becomes a constant identical across every run, no longer differentiating anything. It's not broken, just inert. Leave it as-is for this pass (removing it is a scoring-formula change, out of scope here) but note it in `PROGRESS.md` as something worth revisiting when scoring next gets tuned — it may want to reward something that actually varies now, like elements built or a build-density ratio, in its place.

---

## Verify

- A fresh game load: every tile is immediately clickable to open its build popover — no claim step, no claim cost anywhere in the flow.
- Building something anywhere on the map pays its `buildCost`, places the element, and advances the turn exactly once (income paid, maintenance ticked, and — if the maturity/hazard-schedule turn counters are checked right after — the flood/cyclone schedule has moved forward by one turn).
- An idle session where the player never builds never advances past turn 0 and never draws a hazard.
- `npm test` passes, including the updated `tests/balance.test.ts` (no more calls to the removed `claim()`/`canClaim()`/`isClaimable()`).
- `PROGRESS.md` gets the usual note — the era-score map-size term flagged as inert, and confirmation of what replaced the claim-ring visuals/HUD prompt.
