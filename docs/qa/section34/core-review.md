# Section 34: core game logic review (read-only)

Branch `section-34-deep-review`. Reviewer: an independent subagent. No source file was changed.

**Scope.** `src/core/*` (mainly actionRun, hazardModel, hazard, zones, exposure, stormRecord, phaseResult,
phaseObjectives, prep, climate, panjimIndex, levelScore, gameState, forecastCone, tutorialNudge), the data they read
(`hazardModel.json`, `elements.json`, `levels.json`), and the places where `src/app/panjimController.ts`,
`gameSession.ts` and `appShell.ts` take results out of core.

**How the claims were checked.** By reading each code path. Four throwaway `npx tsx` scripts (kept in the session
scratchpad, not in the repo) settled the hypotheses below:

| Check | Result |
|---|---|
| Can a seawall's end push make a home lost that is not in the storm's "path" (preview and card would then miss it)? Tried a seawall on every legal tile (498) against both cyclone storms. | 0 cases. Not a finding. |
| Does `shortOfThree`'s "three stars allow N at most" agree with `starsForHouses` for every total from 1 to 2000, at thresholds 0.85, 0.79 and 0.55? | 0 mismatches. Not a finding. |
| How much do the storm paths overlap (homes at risk at the start)? | Tutorial: all 22 cyclone homes are also in the flood's 26. Panjim: c1/c2 0, c1/c3 3, c2/c3 42. |
| Tutorial with a flood defence built before the cyclone, credited the way the controller credits it. | Flood card "18 of 18 homes saved" (8 lost in the cyclone), while its Small dam row says 26. That is MAJOR-3. |

**What held up** (checked, no finding):
- The preview equals the resolution. `exposureFor`, `homesSavedBy`, `riskChangeBy`, `readinessFor`, the phase
  objective, `forecastCone` and `land()` all pass the same kind, strength, landfall, sheltered tiles, wind and combos.
  They also pass the same turn: `challenge.turn - 1`, which is `state.turn` when `land()` runs.
- Retry restores the elements: ruins (`degradeAmount`), `broken`, `stormsSurvived` and `builtOnTurn`, so cracks and
  ages come back too. It also restores the outcomes, landed storms, areas, phase builds, objective-complete flags and
  the deep-copied objective, and it drops the snapshots, records and caches made after the phase began.
  `bioStart` stays the run's own.
- No division by zero when no home is at risk or every home is already ruined (`zones.ts:356,365`, `homesHtml`,
  `computePanjimIndex`).
- Scenery, dry and sheltered tiles stay out of every home count: the resolver, the heat, `homesLost`, the objective
  candidates and the cone.
- The player-facing numbers that match the data: pandanus wind share 50% (shelter 0.5 is above `minKeep` 0.4) within
  2 tiles; breakwater breaks at 10; seawall and dam crack at 10 and break in their second storm of their kind; stars
  30/55/85% and +6/+40 (from data); the clear rule is 5 of 9.

Counts: **0 BLOCKER, 4 MAJOR, 8 MINOR, 5 NIT.**

---

## BLOCKER

None found.

---

## MAJOR

### MAJOR-1: a Panjim run that is "Not cleared yet" is recorded as completed, with at least 1 star

- **Where:** `src/app/gameSession.ts:818` (`onRunComplete: (result, then) => finishRun(true, result, then)`),
  `gameSession.ts:1351` (`stars: panjimResult.levelStars`), `src/core/panjimIndex.ts:68`
  (`levelStars = Math.max(1, …round(total/3))`), `src/app/appShell.ts:403-409` and `src/services/profileStore.ts:293`.
- **What:** `PanjimIndex.cleared` (`clearsLevel`: at least one star in every storm and 5 in all) only drives the final
  card's label (`resultCards.ts:232`). The run is always passed on as `completed: true`, and its stars are
  `levelStars`, which is never below 1.
- **Scenario:** the 2030 storm saves under 30% of its homes (0 stars), then 3 and 3. The final card says "6 of 9
  stars, Not cleared yet". The progress record then says completed with 2 stars. The level card is marked "cleared",
  "First Coast" and "Persistent" unlock, and `recordRunResult` submits the score to the leaderboard
  (`outcome.completed && isNewBestScore`). A 0/0/0 run is recorded as completed with 1 star.
- **Why it matters:** the result card and the system of record disagree about the game's one win condition. Rated
  MAJOR rather than BLOCKER only because progress lasts one visit and the on-screen card is right.
- **Fix:** `onRunComplete: (result, then) => finishRun(result.cleared, result, then)` for Panjim, keeping `true` for
  the Tutorial. Record stars as 0 when not cleared, or record `totalStars`. Add a test that a 3/3/0 run records
  `completed: false`.

### MAJOR-2: the Tutorial's How to play states Panjim's clear rule with the wrong count ("five of the six stars")

- **Where:** `src/ui/panjim/panjimHelp.ts:100` (`count > 1 ? " You clear Panjim with … five of the six stars …"`) and
  `:74-78`. Called from `gameSession.ts:1000` for both levels.
- **What:** since Section 31 the Tutorial has two storms (`t-cyclone` 2029, `t-flood` 2032). `count > 1` is now true
  in the Tutorial, so its Help says "You clear Panjim with at least one star in every storm and five of the six stars
  in all".
  - The Tutorial has no clear rule (it always completes), and it is not Panjim.
  - Panjim's real rule is five of nine.
  - The Tutorial-only branch (`count === 1`: "the stars here count the homes saved. In Play Panjim they count
    biodiversity too") can no longer run, so the Tutorial never says how its stars are given (79/50/30%).
  - The tests still model a one-storm Tutorial (`tests/section22.test.ts:55`, `tests/section25.test.ts:283` use
    `schedule.slice(0, 1)`), so they pass while the real Tutorial is wrong.
- **Fix:** gate the clear sentence on the level, not the storm count. Pass `tutorial: boolean` (or `clearRule:
  boolean`) into `panjimHelpHtml`, use the Tutorial branch for the Tutorial, and test with the real Tutorial schedule
  (`sessionRun(LEVEL_BY_ID.get("l00-tutorial"))`).

### MAJOR-3: the Tutorial's flood card credits defences with more homes than the card says were saved

- **Where:** `src/app/panjimController.ts:1482-1497` (credit = `homesSavedBy(c, …)` for each coming storm, taken at
  build time) and `:1061` (row value = that credit).
- **What:** the rows are meant to "add up to the homes kept safe" (comment at `:1042-1045`). Credits are counted
  forward from each build, but between a pre-cyclone build and the flood, the cyclone ruins homes. Those homes leave
  the flood's count ("Lost in earlier storms") and stay inside the earlier credit. All 22 cyclone homes on the
  Tutorial map are also in the flood's path, so this overlap is the normal case, not a corner case.
- **Scenario (run):** build the best flood defence each year from 2026. The cyclone saves 14 of 22. The flood card
  says "18 of 18 homes saved · Lost in earlier storms: 8", but its rows read "Small dam 26".
- **Fix:** at the flood, count only credited homes that are still standing. Store the set of homes each build took
  out of each storm's risk (`riskChangeBy(...).saved`, which already exists), and at the result card count
  `saved ∩ outcome.standing`. Or credit at storm time with `record.withoutEach`, as Panjim's card 2 does.

### MAJOR-4: the legacy level score still runs for Panjim and the Tutorial, and awards badges the run did not earn

- **Where:** `gameSession.ts:1337-1343` (`computeLevelScore(...)` with `level.parTurns` and `runTracker` stats, then
  spread into the Panjim score), `src/core/levelScore.ts:302,306`, `src/levels/achievements.ts:53,147`,
  `src/core/runStats.ts:96`. `runTracker.recordHazard` runs only on the legacy resolver path
  (`gameSession.ts:1466`) and the record-less staging fallback (`:2217`), never for a recorded Panjim storm.
- **What:** on every Panjim run `stats.defensesDestroyed` is 0, however many seawalls or dams broke, and
  `underPar = (40 − 25) × 8 = 120`. So "Unbroken" ("Clear a level without losing a single defence") and "Ahead of the
  Weather" (`underPar >= 80`) unlock on every Panjim finish. "Unbroken" also unlocks on every Tutorial finish.
  `parTurns` (40 / 7) and `starThresholds` (520/700/900, 280/360/440) in `levels.json` mean nothing in the years
  model, yet they still feed this.
- **Scenario:** a Panjim run where both seawalls break in 2050 and the city loses most homes. Together with MAJOR-1,
  it unlocks "First Coast", "Unbroken" and "Ahead of the Weather".
- **Fix:** for a years-model level, skip `computeLevelScore`, or feed it real stats (count `field.failed` and `aged`
  from each `StormRecord` into `runTracker`) and give `parTurns` no meaning. Better still, make the badges read the
  Panjim result (`cleared`, broken defences from the records).

---

## MINOR

### MINOR-1: `docs/HAZARD_ELEMENT_CITATIONS.md` no longer matches the numbers the game runs on

That file "lists every number the hazards and defences run on" and backs the scientific-honesty rule. The numbers it
gets wrong:

| Entry | The doc says | The data now has |
|---|---|---|
| `surge.baseM`, `perStrengthM` | 8.5, 1.45 | `hazardModel.json` 7, 2.027 |
| `surge.weakStorm` | absent | present |
| `flood.lossPerHex.wetland` | 0.2 | 0.15 |
| the `wind` block (perStrengthM, inlandKeep, landfallReachHex, shelter 0.5, shelterReachHex 2, minKeep 0.4) and the per-storm wind overrides | absent | present |
| `landfall.jitterSites`, `coneFarSites`, `centreMin/Max` | listed | not in the data |
| `stackCap` | "several of one kind count once" | omits the `pairsLike` rule (two dunes or two khazans add up) |
| Khazan resilience | 5 | 4.5 |
| Pandanus / Mangrove maturity (quarters) | 8 / 20 | 0 / 0 |
| "Breaks/wears at" for seawall, breakwater, small dam | depth thresholds | `survivesStorms`, `cracksAtAge`, `breaksAtAge` |
| Sand mining | buildable | retired |
| Level `startingCoin` | 500 | 10000 |
| Storm strengths | 1.2 / 1.8 / 2.6 | 1.2 / 2.35 / 3.0 |
| `houseStars` | 0.9 / 0.6 | 0.85 / 0.55 / 0.3 plus bioTwo 0, bioThree 6 and 40 for 2050 |
| Time costs | quarterly ("build 1 quarter…") | one build a year |

- **Fix:** regenerate the tables from the JSON, or add a test that checks the table's values against
  `hazardModel.json`, `elements.json` and `levels.json`.

### MINOR-2: Sources-screen and Field Guide game-rule texts that contradict the code or name things that cannot be built

The Sources screen lists every shown `gameRule` (`sourcesScreen.ts:191-197`).

- `facts.json:203` "Sand mining lowers biodiversity more than any other build." It is wrong: seawall is −5, sand
  mining −3. Sand mining is also retired.
- `facts.json:114` "A dune … weakens for that storm and is still there for the next." In fact the wear is permanent
  until repaired: `zones.ts:305-309` adds `gracefulDegradeStep` (0.15) to `degradeAmount`, and
  `hazardModel.ts:383` scales every later storm by `1 − degradeAmount`.
- `facts.json:184` (resort) and `:211` (yacht) describe elements that neither shipped level can build: they are
  `MONEY_ONLY`, excluded while the economy is off (`balance.ts:61`).
- Seawall and small dam texts that say "fails outright if a storm is bigger than it" / "until a flood is too big"
  (`tooltips.json:54,57`, `buildWhatPanjim`). They are dead on Panjim (the build popover's `tip` is only used on the
  non-Panjim path, `gameSession.ts:2459`), but they state the removed depth-failure rule.
- **Fix:** correct the dune and sand-mining lines. Gate resort, yacht and sand-mining rules with `needs: ["economy"]`
  or a retired flag. Delete or rewrite `buildWhatPanjim` for seawall and small_dam.

### MINOR-3: dead save and replay machinery in `ActionRun`, with comments that describe features which no longer exist

- `replaySnapshots` (`actionRun.ts:202-206, 918-919, 502`) still takes a full JSON snapshot at every warning. Only
  `tests/aftermath.test.ts` reads it: there is no "Replay from 2029" any more.
- `RunSnapshot` says it "doubles as the autosave" (`:110-111`), but saves were removed in Section 28.2.
- `restore()` is only reached through `retry()` with snapshots from the same version, so its migrations for old saves
  never run: storm counts for saves from before 25.1 (`:479-489`), breakwater ages from before 26.1 (`:491-492`),
  template rows and engineered-row checks (`:505-519`), and filtering areas by shelter (`:521-524`). When
  `savedRowsFit` is false, `restore()` also runs `refreshPrep()`, the full greedy objective search, only for
  `retry()` to overwrite the result.
- **Fix:** drop `replaySnapshots` and the migrations, or mark them like `ECONOMY_DISABLED_V1`. In `retry()`, skip
  `refreshPrep` because the saved objective replaces it.

### MINOR-4: the template "Get ready" system and its level data are dead on both shipped levels

- Both prep levels use `prep.model: true`, and the Tutorial has no `prep`. So `generatePrep`, `openingJobs`
  (`prep.ts:128-213`, `actionRun.ts:393-401`) and the data `prep.templates`, `prep.max` and `prep.opening.steps`
  (`levels.json`, including a breakwater step and a seawall template, which Section 17.2 forbids) are never used.
  `prep.ts`'s header still says each job pays Coin.
- Other dead code in core:
  - `ZoneIndex.exposure()` (`zones.ts:143-166`) has no caller.
  - `seaLevelCm` (`climate.ts:91`) has no caller.
  - `protectsHere` (`actionRun.ts:618`) is used by tests only.
  - `FRONTS[*].share` (`zones.ts:46-56`) is never read.
  - The depth-failure branch in `computeWater` (`hazardModel.ts:751`, `failDepthPerUnit`) cannot fire, because every
    engineered element now has `survivesStorms` or `breaksAtAge`.
  - The legacy resolvers in `core/hazard.ts` (`resolveMonsoonFlood`, `resolveCyclone`) and the whole turn-based
    branch of `gameSession` are unreachable: both levels and the daily copy use `timeModel: "years"`.
    `elements.json` failure notes still say "failureThreshold is kept for the old levels' resolver", but there are no
    old levels.
- **Fix:** delete, or mark with one `LEGACY_TURN_MODEL` tag so a reader can tell kept-on-purpose code from dead code.

### MINOR-5: the Panjim 2050 index is never shown but sets the leaderboard score, partly from the switched-off economy

- **Where:** `panjimIndex.ts:61-69` (`score = index × 10 + stars × 100`; `livelihoods = income / 30` from
  `effects.money`; food and population from house effects), `gameSession.ts:1350-1356`.
- **What:** `FinaleCard.show()` (`finaleCard.ts:50`) is never called, only `title()`, so the player never sees the
  index or its five parts. Yet `money` effects feed the score even though coins are off. Small dam (+8 money) raises
  Livelihoods by about 9 points per dam; a mangrove raises the index more overall, so it is not a dominant exploit.
  The result is a hidden scoring rule and a dead finale card.
- **Fix:** score Panjim on stars plus something shown (homes saved, biodiversity), or show the index. Remove or wire
  up `FinaleCard.show`.

### MINOR-6: the "seawall pushes water round its ends" note on the result card can blame the wrong cause

- **Where:** `panjimController.ts:1140-1151`, `:1005`.
- **What:** any damaged place next to any tile whose pre-storm element has `endPushM > 0` gets the note. That includes
  a broken seawall (`preChallengeIds` keeps broken ones; `pushAtWallEnds` only uses walls standing in `own`) and a
  seawall in the middle of a wall (`pushAtWallEnds` skips tiles with more than one wall neighbour). It also fires
  when the place would have been damaged anyway.
- **Fix:** have `computeWater` return the tiles it pushed (`pushAtWallEnds`'s `push` keys) on the `StormRecord`, and
  name only damaged places on those tiles.

### MINOR-7: comments that describe the old model

These mislead a reader of core:

- `hazardModel.ts:826-829` (`windField` doc): "rows of pandanus and mangroves are shelterbelts … three hexes downwind
  … several rows multiply". The code: pandanus only, any direction, 2 hexes, the best one counts.
- `zones.ts:7-28` header: the zone-by-zone "defence holds, the hazard stops there … That is the whole rule". It was
  replaced by the per-tile water model.
- `zones.ts:197`: "A city that stands always earns at least one". Not true now that there is a 0-star line.
- `maya.json:78`: "the game does not model wind".
- `defenceCards.ts:46` and `panjimHelp.ts:10-11,71`: "the Tutorial's one storm". It has two.
- `hazardModel.json` surge comment: "the finale (at refStrength) is unchanged". The finale is 3.0 and `refStrength`
  2.6.
- **Fix:** rewrite these comments.

### MINOR-8: the daily challenge is Panjim under another id

- **Where:** `src/levels/levels.ts:142-180`.
- **What:** it copies the Panjim template (`timeModel: "years"`, the same `climate`) and re-rolls fields the years
  model ignores: `hazards`, `objectives`, `startingCoin` (economy off). Only `parTurns` changes, which feeds MAJOR-4's
  badge. Its brief ("a new storm sequence every day") is false. The route gate blocks it while menu extras are off
  (`routeGate.ts:141`), so it is dormant, but it would mislead if switched on.
- **Fix:** mark it dormant, or vary `climate.challenges` (strength, landfall) when the daily returns.

---

## NIT

1. **`bioAtEnd` changes nothing with today's data** (`zones.ts:311`). No storm changes biodiversity: houses carry
   none, broken defences keep their cost, and nothing is built after the 2050 storm. The card's "at the end of 2050"
   reads the same number as "as it came".
2. **Duplicated literals.** `resultCards.ts:113` hard-codes "within 2 tiles", and `facts.json:350` hard-codes "two
   tiles … half". `defenceRules()` reads `shelterReachHex` and `shelter` from the model; these should too, or a test
   should pin them.
3. **Field Guide strength words** (`defenceCards.ts:87,89,90`). "khazan does little against a cyclone's surge",
   "breakwater almost no help in a river flood" and "small dam little help in a cyclone" all describe zero: those
   elements do not target that hazard (`defenceMetres`, `hazardModel.ts:382`). The khazan helps only indirectly,
   through the Living Bund combo. Say "nothing", or "only through a mangrove beside it".
4. **Depth line wording.** `ARCHITECTURE.md` says "houses hit ⇔ depth > 1", but `floodsHouse` is `>=`
   (`hazardModel.ts:785`). `hitTime` uses `> 1` (`hazard.ts:842`), so a home exactly on the line falls by the
   arrival-time fallback in `stormScript.ts:101`. It is handled; only the doc is off.
5. **`kindValue` comment** (`hazardModel.ts:445`): "two dunes side by side protect as much as one seawall". The raw
   values are 7.2 against 14.4 m; they are equal only on the seawall's tile and the next one in, where both hit the
   6 m engineered ceiling. Two tiles out the pair gives 5.04 against 6, three tiles out 3.24 against 6. Their path
   drag stays half the seawall's (2.88 against 5.76).

---

## Kept on purpose and marked (not findings)

`ECONOMY_DISABLED_V1` (coin jar, repair coin, `REPAIR_SHARE`, income into the jar, `economyEnabled` checks),
`GROWTH_DISABLED_V1` (`maturityFraction`, `matureQuarters`), `RETIRED_ELEMENTS` (sand mining), `MONEY_ONLY`
(resort, yacht), and the `GameState` constants kept with a note (`FOOD_DEFICIT_*`, `FLOOD_BUFFER_RECOVERY_RATE`).
