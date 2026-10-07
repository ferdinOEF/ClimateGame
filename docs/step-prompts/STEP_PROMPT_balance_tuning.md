# Khazan — Step Prompt: Element Balance Tuning (playtest simulation, not manual play)

**How to use this document:** scoped addition, not a replacement for `GAUNTLET_PROMPT.md` or `NEXT_STEPS.md` — read both first, especially `GAUNTLET_PROMPT.md` Section 7 (meters/scoring) and Section 11 (generic effects architecture). This was drafted after reading the current `elements.json`, `hazard.ts`, `gameState.ts`, `scoring.ts`, `main.ts`, and `tests/balance.test.ts` directly, so it's grounded in what's actually implemented today, not the original spec's placeholder framing.

**The goal, in the requester's own words:** try out different combinations of elements, find the best-balanced numbers for each element's cost/effects, and make sure the game supports a real range of outcomes — best case to worst case — depending on the choices a player makes. When the Monsoon Flood and Cyclone hit, whatever Resilience the player has built up should genuinely be "pitted against" the hazard: skilled/thoughtful play should reliably come out ahead, naive/careless play should genuinely struggle, and there should be a tense middle band, not everything converging to "fine either way."

**This is a numeric-tuning pass, not a redesign.** Nothing about terrain eligibility, the one-tile-one-element rule, the hazard-resolution formulas' *structure*, or the icon/geometry work from the last pass changes here. What moves is: `buildCost`, `maintenanceCostPerTurn`, `matureTurns`, `absorptionAtMaturity`, `overwhelmSeverity`/`overwhelmedAbsorptionMultiplier`, `failureThreshold`/`failureRedirectMultiplier`, and `effects.{money,food,biodiversity,population}` in `elements.json` — all placeholder-flagged there already or a first real pass, per the file's own `note` fields.

---

## 0. Mental model check, so tuning targets the thing that actually matters

Worth being precise about this since "resilience pitted against the hazard" could describe two different mechanisms, and only one is currently implemented:

- **Not implemented yet (Phase 5, `GAUNTLET_PROMPT.md` Section 2/11):** a single computed "Resilience score" per zone/player, compared directly against incoming hazard severity as one roll. `elements.json` already carries an `effects.resilience` field on Small Dam (+5) and Sand Mining (−4) as forward-compatible data for this — but **nothing reads it yet**. It does not feed into any calculation today. Leave it alone this pass (don't wire it in, don't delete it) — that's a separately-scoped future step, not part of this one.
- **What's actually implemented, and what this pass tunes:** each standing defense has its own `absorptionAtMaturity` — the fraction of hazard severity it blocks at *its own tile*, once mature. `hazard.ts`'s wave-propagation engine deals `severity * (1 - absorption)` at each defended tile, decays the wave outward, and sums total damage across the map. `GameState.applyHazardOutcome()` then drops the global **Resilience meter** (starts at 100) by `totalDamage * 0.5`. So "resilience pitted against the hazard" already happens — just distributed per-tile through each defense's absorption, rolling up into one global health bar afterward, rather than one pre-computed global score. Tuning `absorptionAtMaturity`, `buildCost`, and the effects magnitudes *is* tuning that fight. Era soft-ends when the meter hits 0 (`state.isEraOver`).
- Trust, Biodiversity, Food, Population, Coin are the other four levers (`meterTotal()`'s generic accumulator) — all in play for "best case vs. worst case" too, since `computeEraScore()` (Section 7) weighs Trust + Resilience + clamp(Biodiversity)×1.5 + clamp(Carbon)×1.5 + turns×0.5 + claimed×0.3 as the actual "how did this run do" number, not Resilience alone.

---

## 1. Existing infrastructure to build on, not duplicate

`tests/balance.test.ts` already does real work here: a seeded, deterministic scripted-playthrough harness (`mulberry32` RNG, a fixed 150-turn hazard schedule mirroring `main.ts`'s real 15-turn flood / 11-turn cyclone cadence) that plays three pure defense-category strategies (`nbs`, `engineered`, `hybrid`) and asserts their `computeEraScore()` results land in the same order of magnitude — "no landslide winner" at the category level. Keep this test and its passing invariant. Extend the harness rather than replacing it — same file, same RNG, same hazard-schedule approach.

**What it doesn't cover yet, and what this pass needs to add:**
1. It only ever builds defenses (`nbs`/`engineered`/`hybrid`), never the economic "building" elements — House, Beachside Resort, Sand Mining never get built in any scripted run today. A real player's choices span both.
2. It always sets `state.coin = 2000` — deliberately, to isolate category choice from affordability. That's correct for what it tests, but it means `buildCost` itself has never actually been exercised as a balance lever. This pass needs at least one variant run against the real starting economy (`startingState.json`: 1000 starting Coin, 10 pre-built Houses), so cost tuning has something real to push against.
3. It only compares *categories* against each other for parity — it doesn't yet test whether *skill/strategy quality* produces a real spread, which is the other half of the brief below.

---

## 2. Build a fuller set of scripted archetypes

Extend the harness (or add a sibling `tools/balance_sim.ts` for exploratory sweeps, plus updated assertions in `tests/balance.test.ts` for the ones worth locking in permanently — your call which goes where, but the tuning conclusions need to land as committed test invariants, not just a one-off log) with archetypes that actually span player skill/intent, not just defense category:

| Archetype | Behavior |
|---|---|
| **Naive / first-timer** | Claims greedily wherever affordable, builds whatever's cheapest and immediately available on each newly-claimed tile regardless of category, spends Coin as soon as it has enough — no prioritization, no held reserve. This is the stand-in for "a 12-year-old just playing," and per the original design brief (progressively engaging for kids, tougher for adults) it should land in a losing-or-barely-surviving band, not a comfortable one. |
| **Economic rush** | Prioritizes House / Beachside Resort / Sand Mining wherever terrain allows, defense only as an afterthought (whatever's left over). Tests whether the money-generating elements are tempting enough to be a real (if risky) choice, without being a free lunch. |
| **Defense-max / turtle** | Prioritizes every defense category on eligible terrain first, economic buildings only as needed to afford the next defense. Tests the opposite failure mode — over-investing in Resilience at Trust/Biodiversity/economy's expense shouldn't be a free lunch either. |
| **Balanced / informed** | A sensible mixed heuristic: defend every coastal/river/estuary tile claimed, build economic elements on Land, keep a small Coin reserve. This is the strategy a thoughtful adult player (or a kid on their second or third try) would land on. Should reliably survive the full hazard schedule with a comfortable margin — not a nail-biter, but not trivial either. |
| **Do-nothing control** | Claims tiles but builds nothing beyond the pre-built Houses. Useful as a floor/baseline reference, not a "should win" case. |

Run the full set at least twice: once at the existing `coin = 2000` ample-budget setting (isolates strategy/category choice, keep the current invariant), and once at the real `startingCoin: 1000` from `startingState.json` (makes `buildCost` and pacing actually matter, and is the condition that determines what a real player actually experiences).

---

## 3. What "well-tuned" looks like — the target shape, not a single number

The brief is explicit that this should NOT converge to "every strategy is fine" or "every strategy fails." Concretely, tune toward:

- **Naive**, under the realistic-budget run, ends meaningfully behind Balanced on `eraScore` and/or has visibly lower final Resilience (a real gap worth playtesting for, not a rounding difference) — ideally close to `isEraOver` by the end of a full 150-turn schedule, though it doesn't have to actually cross zero every seed.
- **Balanced**, under the same realistic-budget run, survives the full schedule with Resilience comfortably above zero and a solidly positive `eraScore`.
- **Economic rush** and **Defense-max** should each be *viable but risky in a different way* — economic rush should be able to out-earn Coin and out-score on Biodiversity/Trust in a good run but be exposed to real Resilience damage; defense-max should protect Resilience well but underperform on `eraScore`'s other terms (Trust from never engaging the economy, Biodiversity from an all-engineered mix, etc.) enough that it isn't simply the best answer either. Neither should be a landslide winner over Balanced — extend `tests/balance.test.ts`'s existing "no landslide" spirit from category-vs-category to this fuller archetype set.
- **Do-nothing** sits at the floor, clearly worst, as a sanity check the meters are actually responsive to play at all.
- Some genuine seed-to-seed variance is fine and even desirable (that's the "different scenarios can occur" part of the brief) — a single strategy shouldn't have a wildly different outcome depending on hazard RNG luck alone, but small swings that occasionally tip a middling strategy from "just survived" to "just didn't" are exactly the tension the brief is asking for. If useful, sweep a handful of seeds per archetype in the exploratory script to eyeball how much variance each strategy actually has, not just its single-seed outcome.

## 4. What to tune

Primarily: `buildCost` (does the cheap/fast option actually trade off against the strong/slow one?), `absorptionAtMaturity` + `matureTurns` (is the wait for a stronger defense worth it?), `effects.money/food/biodiversity/population` magnitudes (do the economic elements' Trust/Biodiversity costs feel like real trade-offs against their Coin return?), and `maintenanceCostPerTurn`/`maintenanceNeglectPenaltyPerTurn` (does upkeep meaningfully punish overextension?). Leave `effects.resilience` untouched per Section 0 above. Leave `targetsHazards`/`validTerrainIds`/`category` alone — those are the roster-shape decisions from the last two passes, not this one's concern.

---

## Verify

- `npm test` (vitest) passes, including the existing category-parity invariant and new assertions encoding the target shape from Section 3 (e.g., Naive's `eraScore` under realistic budget is asserted below Balanced's by a real margin; Balanced's final Resilience is asserted comfortably above zero; no single archetype's `eraScore` is asserted as a landslide winner over the others).
- `PROGRESS.md` gets a tuning-report entry: the archetypes tested, the before/after numbers for every changed field in `elements.json` with a one-line rationale each, and the outcome table (Trust/Resilience/Biodiversity/Food/Coin/eraScore per archetype, both budget conditions) so the reasoning is auditable later, same convention as every prior pass's placeholder-number flags.
- A live playtest (browser, matching how every prior pass was verified): run the Balanced strategy by hand through at least one flood and one cyclone — it should visibly hold. Run the Naive strategy by hand the same way — it should visibly struggle (defenses failing/overwhelmed, Resilience meter dropping hard) without the game feeling broken or unfair, just under-prepared.
