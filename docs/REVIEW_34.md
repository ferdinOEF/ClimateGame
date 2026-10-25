# Section 34: the deep review

Branch `section-34-deep-review`, from master `1c4eaba` (Section 33's QA record). Safety copy: the tag `pre-section-34`
and the branch `backup/pre-section-34`, both on GitHub. The owner asked for a full QA, so the full browser check in
CLAUDE.md applies.

## Where we are (read this first after a restart)

- Round 0 (setup): done. See "Setup" below.
- Round 1: done (eight playtesters, bots, fuzz, the core review, the diff review; every BLOCKER and MAJOR fixed;
  commits on `section-34-deep-review`).
- Next: health measurements (frame time per quality, memory over three runs, load time), then Round 2 with eight fresh
  playtesters on the new build.

## What the game is (one page)

**Riptide Rising** is a coast defence game set in Panjim (Panaji), Goa, built in Three.js and TypeScript. The board is
a hex map of the real city drawn from OpenStreetMap and the Copernicus DEM, adjusted by hand by the owner (four rounds of
edits); north of the Mandovi, the east edge past Ribandar and the creek corner east of Merces are grey scenery that
never counts. The menu has two buttons only: **Tutorial** and **Play Panjim**.

**A run of Play Panjim.** Twenty five years, 2026 to 2050. One build a year, and every build moves the city on a year:
there is no other way to end a year. Three storms at fixed years with fixed strengths and places:
- **2030 cyclone** (strength 1.2, "mild"), landing at -5,18 on the Miramar beach in front of Sharada Mandir School;
  5 builds before it.
- **2040 monsoon flood** (2.35, "strong"), coming down the Mandovi from its east edge, through the channel at Ribandar
  into Merces, St Cruz and Taleigao; 10 builds before it.
- **2050 cyclone and flood** (3.0), landing at Campal (2,12) with the river in flood; the sheltered middle of Taleigao
  takes no water or wind; 10 builds before it.

Seven defences, each a game rule with a pro and a con: dune, pandanus (the only wind shelter), mangrove (wetland only),
khazan (pairs like a small dam, never wears) are nature based and raise biodiversity; seawall (strongest, breaks in its
second cyclone, cracks at 10, pushes water round its ends), breakwater (at sea, breaks at 10) and small dam (the only
build on a river tile, breaks in its second flood, cracks at 10) are engineered and cost biodiversity. The build cards
show no numbers; the objective card bottom right suggests nature based builds only, its tiles pulse on the board.

What the player sees: the forecast cone at each phase's start (on the start popup for the first), the faint storm track
all phase, the red heat (live risk) in the two years before each storm or with R, "Homes at risk" and a Biodiversity
counter in the top bar, a hover glow on a build card (green for the homes it saves, red for those it puts at risk).
Maya, a field researcher, says one short line at a time.

**Each storm** plays out on the board (Speed up available), homes it destroys become ruins for the rest of the run, and
result cards follow: stars (one from 30% of the standing homes saved; two from 55% with biodiversity at or above the
start; three from 85% with biodiversity up 6, and up 40 by the end of 2050 for the 2050 storm), what protected the city,
the next storm's forecast. "Try this storm again" on card 1 puts the run back at the start of that storm's build years.
The final card gives N of 9 stars: **Panjim cleared** needs a star in every storm and 5 of 9 in all.

**The Tutorial** (about 3 to 5 minutes): a made up coast, 7 builds 2026 to 2032, a cyclone after the fourth and a river
flood after the seventh. It nudges one new defence each year (its card glows, its best tiles pulse) with a short "How it
works" caption backed by a cited fact, then result cards and a last card leading to Play Panjim.

Nothing is saved: a reload starts fresh at the menu (Section 28.2). After 3 minutes with no input the game goes back to
the menu (festival mode, Section 30.12).

## Owner decisions this review must not break

From CLAUDE.md, docs/PROGRESS.md and docs/BUGS.md. If one hurts the fun, it goes under "Owner decisions needed" with
evidence and a recommendation; it is not changed here.
- The menu shows only Tutorial and Play Panjim; Play Panjim goes straight to the game view and its start popup; the
  level select only by `#/levels`. No email field. The Tutorial must never break.
- Scientific honesty: only cited facts (facts.json, the facts tests); every mechanic said "In this game…"; no invented
  people or statistics.
- Maya visible (Section 29), not redrawn, locked in place, her colours from `MAYA_PALETTE`; ☰ has her item, M mutes her.
- Map geography, CRZ, OSM data, elevation and the street map at 21% are fixed; maps are generated, never hand edited.
- The 2030 cyclone on Sharada Mandir School and Miramar (strength at most 1.3: above it reaches Kala Academy).
- The 2040 flood from the Mandovi through the Ribandar channel (under 2.4 so it stays "strong" and on that route).
- The sheltered centre of Taleigao is untouched in 2050.
- One build a year, 25 builds, phases of 5, 10 and 10 builds; storms at fixed years, nothing random moves them.
- Objectives suggest nature based defences only; build cards carry no numbers; no pop up after a build; no note after a
  build off the objective's tiles.
- A ruined home stays ruined; repair is for defences only. A storm counts against the homes still standing.
- The clear rule: a star in every storm and 5 of 9; the star lines with biodiversity (Section 25, 26).
- The defences' pros and cons, ageing, the wind on the two cyclones, pandanus the only wind shelter (Sections 25, 26).
- "Try this storm again" on every storm's card; no saved progress; festival mode's idle reset.
- The Harbour Morning look (Section 33): every colour a token, the storm class.
- No dots or hyphens between words in any player text (Section 17b, `tests/punctuation.test.ts`).
- Desktop first; never make desktop worse to help phones.

## Setup (Round 0)

- The checkout on this machine (Windows 11, an i7 laptop with Intel Iris Xe) was 518 commits behind; fast forwarded to
  `1c4eaba`. Twelve files in the repo have a `:` in their name (Maya screenshots in `docs/screenshots/maya/` and two
  in `docs/qa/section13`, `section14`), which Windows cannot create: they are kept out of the working tree with a sparse
  checkout (`core.protectNTFS=false` in this clone only, so git keeps them in the index untouched).
- Push access: confirmed (the tag and the backup branch went up).
- `npm ci` clean. `npx tsc --noEmit` clean. `npm run build` clean. `npm run test`: 713 passed, 6 skipped, 1 failed on
  this machine only: `tests/punctuation.test.ts` "reads a real body of text" compared file names with forward slashes
  while the helper built them with Windows backslashes. Fixed in the helper (`tests/helpers/uiStrings.ts`), no game
  change; after it, all pass.
- Browsers: no `/opt/pw-browsers/chromium` here (that is the Linux container's path); the tools fall back to
  Playwright's own Chromium (build 1234, already installed). Headless Chromium here can use the real GPU (ANGLE D3D11 on
  Iris Xe), which no earlier section had: the playtest driver uses it; the existing QA tools keep their software GL
  flags as written.
- The last 10 commits on master: 1c4eaba, 838553c (Section 33 QA record and its merge), 849fbcd (Section 33's merge),
  7c906eb, 53e11c5 (33.6), 4317e73 (33.5e), e516d14 (33.5d), 7e17015 (33.5c), 681165d (33.5b), 883d63b (33.5a).
  No section branch is open or unmerged (33b exists only as `backup/pre-section-33b`, equal to master).

### The QA tools reused

- Bots and balance: `tools/panjimBots/` (`bots.ts` play styles far, random, nature, seawalls, smart, best, guided,
  casual, greedy; `tune21.ts` many seeds over child processes; `index.ts` is `npm run bots`), the solver
  `tools/bestPlan/` (`npm run bestplan`, Section 24), `tools/buildsNeeded.ts`, `tools/tutorial/sim.ts`.
- Browser runs: `tools/walkthrough.ts` (`npm run walkthrough`), `tools/playthrough21.ts` (`npm run playthrough`, five
  play styles at a window size), `tools/labelOverlapTest.ts` (`test:labels`), `tools/mayaLayoutTest.ts`
  (`test:layout`), `tools/mayaStability.ts` (`test:maya`), `tools/verifyMaya.ts` (`verify:maya`), `tools/helpFit.ts`
  (`test:help`), `tools/section17bChecks.ts` (text and fit), `tools/section28Shots.ts` (retry, no saves, axe, gray and
  deuteranopia copies), `tools/section24Replay.ts` (the best plan in the browser), `tools/stormPerf.ts`,
  `tools/ruinPerf.ts`, `tools/mayaPerf.ts` (frame cost), `tools/qaFunctional.ts`, `tools/tutorialPlay.ts`.
- Test hooks (`src/app/gameSession.ts` `testHooks`): `__panjimForTest` (the controller: `run`, `build`, `scenario`,
  `host`), `__stormForTest` (`freeze`, `playing`, `time`, `compare`), `__panjimScenarioForTest`, `__openTileForTest`,
  `__focusTileForTest`, `__ruinsForTest`, `__frameStatsForTest`, `__heatForTest`, `__labelsForTest`, and more.

### New in this section

- `tools/playtest/driver.ts`: a browser a playtester drives by hand over a local port (screenshot, the words on
  screen, click, key, wheel, drag, resize, reload, a second tab, console), logging every action with the game's year
  for the measurements. The playtesters use only it; the one hook it reads is whether a storm is still playing, to wait.
- `tools/fuzz34.ts`: random action sequences (builds, demolitions, repairs, retries) through the game's own run, every
  invariant checked after each action and each storm.

## Round 1

Eight fresh playtester agents, each driving its own Chromium through `tools/playtest/driver.ts` on the production
build (`vite preview`), by screenshot and click only. Diaries: `docs/qa/section34/round1/diary-*.md`; screenshots
`docs/qa/section34/round1/shots/`. The optimiser and the chaos tester were cut off by an API rate limit and resumed.

### Results and fun signals

| Persona | Tutorial | Panjim stars (2030 / 2040 / 2050) | Final | First build | Whole run (player time) | Real choices | Play again / tell a friend | Quiz |
|---|---|---|---|---|---|---|---|---|
| Festival visitor (1920x1080, never opens Help) | 3 / 3 | 3 / 2 / 2 | 7 of 9, cleared | 34 s (Tutorial), 165 s in Panjim | about 10 min (2.3 + 7.4) | 3 | not today / yes | 4.5 |
| Student 13 to 15 (1366x768) | skipped | 3 / 2 / 2 | 7 of 9, cleared | 33 s | about 8 min | 4 | yes once / maybe | 4.5 |
| Casual, story (1366x768) | 3 / 3 | 3 / 2 / 2 | 7 of 9, cleared | 65 s (Tutorial) | about 17 min (4.5 + 12) | 5 | yes once / yes | 4.5 |
| Optimiser (1920x1080) | skipped | 3 / 3 / 2 | 8 of 9, cleared | 155 s | about 33 min (an idle reset made it replay) | many (9 plans compared) | yes / yes | 4.5 |
| Panjim local (1920x1080) | skipped | 3 / 3 / 2 | 8 of 9, cleared | 69 s | about 14 min | 4 | yes once / yes | 4.5 |
| Coastal scientist (1366x768) | 3 / 3 | 3 / 2 / 2 | 7 of 9, cleared | 60 s (Tutorial) | about 16 min | not counted | yes / yes | 4.5 |
| Keyboard only, deuteranopia (1366x768) | 3 / 3 | 3 / 3 / 2 | 8 of 9, cleared (a mouse click per build) | about 3 min, 56 keys | about 19 min | 5 | no, not by keyboard / yes | 4.5 |
| Chaos tester (1366x768) | (running) | | | | | | | |

- **Quiz** (asked after play: what a mangrove does in a storm, why a seawall can be risky, what a khazan is for,
  where and why the 2040 flood came from, what helps against wind): every persona answered four fully; nobody could
  say *why* the flood came from the river (the game says where, never why). The optimiser's seawall answer repeated an
  outdated Maya line ("if a storm is bigger than the wall, it fails all at once"), no longer the rule.
- **Why homes were lost**, one sentence after the cards: clear for 2030 everywhere; partly for 2040; for 2050 most
  could not say (Speed up skips the replay, and the card names no places for the homes lost).
- **One pattern wins?** No single defence: the optimiser's one kind plans all lost stars (five seawalls 1 star, five
  pandanus 2). But "khazans on the glowing wetland tiles" is the answer every persona found for the floods.
- **Surprises:** the breakwater out at sea saving 0 in 2030; "Homes at risk 15" before the flood against "57 homes"
  on the card; a damaged landmark when every home stood.

### Issues

Who found it, how to reproduce, what fixed looks like (F festival, S student, C casual, O optimiser, L local,
Sc scientist, K keyboard, X chaos, R the core review in `docs/qa/section34/core-review.md`).

**BLOCKER**
1. **No keyboard way to pick a map tile** (K). Tab reaches only Maya's minimise, ☰, an invisible map stop and ?;
   arrows, Enter and Space do nothing on the map. Fixed: from the map, arrow keys move a visible tile cursor and Enter
   opens its build menu.
2. **The idle reset wipes a run with no warning** (O twice, S once). Three minutes without input (festival mode,
   Section 30.12) goes back to the menu mid run. Fixed: the owner's reset kept, with a "Still there?" warning for the
   last 30 s that any input cancels.

**MAJOR**
3. **A pulsing tile did not say which defence counts** (C, F, S): a khazan on a mangrove row's tile never ticks.
   Fixed: on a pulsing tile the build menu marks the objective's card ("Objective").
4. **A row can be left with no pulsing tile** (F: "2 khazans in Merces" stuck at 1/2; S): its picked tiles were taken
   by other builds. Fixed: such a row pulses other tiles in its area where its defence fits.
5. **A second click right after the menu opens builds its first card** (L: an unwanted seawall). Fixed: the cards
   ignore a click in the first moment after the menu opens.
6. **Clicks swallowed** (C, L, O, S): the first map click after an open menu or a house's card only closes it. Fixed:
   a click on another tile closes the open card and opens that tile.
7. **The biodiversity counter lags the last build before a storm** (F, C, Sc, S, O).
8. **Homes at risk against the card's homes** (F, S, O): the HUD counts the homes the storm would take, the card the
   homes in its path. Fixed: the card says "in its path".
9. **Developer notes on the Facts & sources screen** (Sc): "Section 30.3, the build card's second line", "Checked
   from the search engine's quotation".
10. **Maya lines without a tag, one outdated** (Sc, O): "A seawall holds no water. If a storm is bigger than the wall,
    it fails all at once." (not the rule since Section 25); "Dunes and pandanus shield the beach from a cyclone's
    surge"; "Mangroves slow the surge before it reaches the houses" said before the flood; the khazan rule once with
    its tag and once without.
11. **Tutorial text against what the player just saw** (Sc): "Small dam: the strongest stop for a river flood" after
    the mangrove saved more; the mangrove card's "waves and surge in both storms" mixes the hazards (Sc, F).
12. **Three definitions of "what protected your homes"** (Sc); Panjim's rows do not add up and nothing says why.
13. **Keyboard: dialogs do not take focus or keep it; Esc does not close Help opened by keyboard** (K).
14. **Colour only: the replay legend's three squares** (K, deuteranopia); "Watch the red" readable only by hatching.
15. **The middle of the run is "click the glowing tile"** (F, S, C, L): 3 to 5 real choices in 25 builds; the two
    ten build stretches are the boring part. See balance and the owner decisions.
16. **The run record and badges** (R MAJOR 1 and 4): a run not cleared recorded as completed; "Unbroken" and "Ahead
    of the Weather" on every finish. Fixed (`tests/section34.test.ts`).
17. **The Tutorial's How to play gave Panjim's clear rule** (R MAJOR 2). Fixed (`tests/section34.test.ts`).
18. **The Tutorial's flood rows credited homes an earlier storm ruined** (R MAJOR 3). Fixed (`tests/section34.test.ts`).

**MINOR** (fixed where cheap; the rest carried to later rounds)
19. Clicking land that takes no build gives no feedback (F, L, O, K).
20. "Shared the work" cut off on card 2 (S).
21. A result card's stars read as three stars to a screen reader whatever the stars (O).
22. Maya's tips can close before Got it or Source is clicked (Sc, O); an old tip beside the final card (F).
23. ☰ does nothing over the final card (Sc).
24. The breakwater and the khazan beside mangroves are found only by luck (O).
25. Labels overlap in the old city; "Government Polytechnic" drifts over Campal zoomed out (C, S).
26. "The Mandovi waterfront" area name sits between Patto and Merces (L).
27. The dune rule said a dune "weakens for that storm" (the wear lasts until repaired); rules about sand mining, the
    resort and the yacht shown though no level offers them (R MINOR 2). Fixed (`tests/section34.test.ts`).
28. `docs/HAZARD_ELEMENT_CITATIONS.md` out of date with the data (R MINOR 1).
29. Dead code and old comments in core (R MINOR 3 to 8, NITs): listed in `core-review.md`.

**Fixed later in Round 1:** 10 (the director dropped the tips' "Game rule" tag, so they read as plain claims), 12 (card
2 says the rows need not add up), 14 (the replay's three tints now differ by lightness and the legend names it), 19
("Nothing can be built on this tile."), 20 ("Shared the work" column), and two facts added from the game's own
sources, opened and checked: khazan bunds breach when not kept up (Lobo 2020), a broken mud bandhara can bring flash
floods (Down To Earth 2020). The six citations once checked only from a search engine's quotation were opened and
verified word for word. Issue 21 is not a bug: the stars carry `role="img"` with "N of 3 stars". Carried: 22 to 26.

### Round 1: the diff review and its fixes

An independent reviewer read the round's diff (`docs/qa/section34/round1/diff-review.md`): 1 BLOCKER, 2 MAJOR,
7 MINOR, 5 NIT. All fixed:
- BLOCKER, the map focus: a mouse press focused the board, which jumped the camera to the keyboard cursor, so the
  click opened another tile (Panjim and the Tutorial). Now a mouse press never focuses the board, the cursor shows
  only on keyboard focus, and the camera glides after the arrows.
- MAJOR, the cursor vanished with the mouse resting on the board: the pointer's hover now leaves it alone until the
  mouse moves.
- MAJOR, most clicks with a card open opened something new: the click passes through only to a different tile that
  takes a build, never after a drag; the open tile, a house, land and sea only close.
- MINOR: the idle warning is said once (polite) and draws above the result cards; the note's wording; the Tutorial's
  rows back to net credit, capped by the homes still standing; broken defences counted from the storms' records;
  real browser checks for each fix (`tools/section34Checks.ts`, all pass at 1366x768 and 1920x1080); the live risk
  default restored (owner decision 7) with Maya pointing to R instead; the sources verified (above).
- NIT: the driver listens on 127.0.0.1 only; the fuzz's always true check removed; Maya's seawall tip tested against
  the data; an unused class removed.

### Round 1 measurements

**Bots, 200 seeds a style** (`docs/qa/section34/round1/bots.md`; identical to Section 30, nothing in the model
changed):

| Style | 2030 homes saved, stars 1/2/3 | 2040 | 2050 | Whole run | Clears |
|---|---|---|---|---|---|
| far (nothing) | 0%, 0/0/0 | 0% | 0% | 0%, 0.0 of 9 | 0% |
| random | 4%, 4/0/0 | 18% | 19% | 17%, 0.4 | 0% |
| nature only | 99%, 0/2/98 | 81%, 0/98/3 | 67%, 0/100/0 | 76%, 7.0 | 100% |
| seawalls only | 56%, 100/0/0 | 0% | 44%, 100/0/0 | 15%, 2.0 | 0% |
| sensible (smart) | 98%, 33/36/32 | 82%, 0/69/31 | 80%, 3/98/0 | 82%, 6.3 | 98% |
| guided (follows the card) | 100%, 16/37/48 | 84%, 0/100/1 | 81%, 0/89/12 | 84%, 6.4 | 100% |
| best | 100%, 35/61/5 | 90%, 0/0/100 | 84%, 0/100/0 | 88%, 6.7 | 100% |

Targets: nothing 0% (met); random under 10% (0%, met); sensible 60 to 80% (98%, not met: owner decision 1); best 100%
(met); nature only above seawalls only over the run (76% against 15%, met) and in the flood (81% against 0%, met);
2050 the hardest (for nature, smart, guided and best, met; the seawalls bot does worst in the flood).

**Fuzz** (`docs/qa/section34/round1/fuzz.md`): 1,200 random runs (600 Panjim, 600 Tutorial), 25,174 actions, 3,922
storms, 922 retries, 0 failures over every invariant: preview equals resolution (3,693 storms), ruins equal homes
lost, the card adds up, the heat equals Homes at risk (25,174), objective completion equals the board, stars equal the
thresholds, a retry restores the exact board (922), nothing counts or builds on unplayable tiles (5.3 million tile
checks), the sheltered centre untouched (775 storms). No walker on water: `tests/noWalkingOnWater.test.ts` passes.

**Health** (`tools/health34.ts`, production build, 1920x1080, the laptop's Intel Iris Xe through ANGLE D3D11;
`docs/qa/section34/round1/health-gpu.md`):
- Load: the menu's first paint 140 ms, on screen 341 ms; Play Panjim to its start popup 3.6 s.
- Frame time on the calm board: median 16.7 ms (the display's 60 Hz), p95 33.4 ms, 43 to 45 fps at Low, Medium and
  High. Section 21's numbers were software GL (2.0 to 2.3 fps at 1920x1080); the same software GL tool
  (`tools/stormPerf.ts`) is run again for the comparison below.
- **A memory leak, found and fixed.** Three full runs in one tab first grew the JS heap 15.5, 19.3, 22.2, 26.9 MB
  (DOM flat). Heap snapshots (`tools/leak34.ts`, new) traced it to things shared across sessions at module level: a
  shared material kept a "dispose" listener from every renderer (`particleMaterial`, the creature materials, the
  window glow, the rubble material), shared geometries and the map overlay's placeholder texture kept each old
  renderer's GPU record, and through either the old canvas and its whole session stayed alive, about 4.5 MB a run.
  Each session now disposes them as it ends (`releaseSharedReactionMaterials`, `releaseSharedMonumentMaterials`,
  `releaseRuinGeometries`, `releaseTownGeometries`, `releaseOverlayPlaceholder`, before the scene goes). After: 18.6,
  19.3, 19.6 MB at the ends of runs 1 to 3 (heap snapshots: 35 KB between runs 1 and 3). Test:
  `tests/section34.test.ts`.
- Console errors and warnings over the three runs: none.

**Inputs per playthrough** (the driver's logs): festival 88 inputs for the Tutorial and a full run (first build at
command 17); student 96; casual 114; local 121; scientist 128; keyboard 217 (keys); optimiser 374 (nine plans); chaos
704.

**What changed in the feel of the game this round.** Before: a handsome, legible first storm, then twenty builds of
following pulses without knowing which defence a pulse wanted, losing clicks, and a silent reset that wiped runs.
After: each pulse names its defence on its card, a row never strands the player, clicks go where they are aimed,
the counter and the headline tell the truth about biodiversity, Maya's rules say they are rules, and the whole game
can be played without a mouse. The middle of the run is still the weakest part: once the checklist is done, Maya now
points to R, but the red does not come on by itself (owner decision 7).

**Checked, not bugs**
- Card 2 showing the same numbers in 2040 and 2050 (C): headless, the numbers differ storm by storm on every seed
  tried; not reproduced.
- "Homes at risk said 15, 9 were lost" (O): the last build is what brings the storm, so the counter before it cannot
  count that build.

## Owner decisions needed

Each would change an accepted behaviour or an owner decision, so none is changed here.

1. **The sensible clear rate (target 60 to 80%) is 98%.** Evidence: the smart bot clears 98% of 200 seeds; all eight
   Round 1 playtesters cleared (7 or 8 of 9). Why it cannot be met: the clear rule is a star in every storm and 5 of 9
   (owner, Section 22), the 2030 cyclone is capped at strength 1.3 (owner, Section 16.4) and its objective saves all
   9 homes, so 3 + 1 + 1 already clears. Raising the two star line far enough (to about 80% of the homes) turns a
   player's 46 of 57 into "a heavy hit" and costs the festival visitor the payoff. Options: (a) accept; (b) a harder
   clear (for example two stars in two storms); (c) a stronger 2030 cyclone. **Recommendation: (a).** The most common
   reason players gave to play again was "one home short of three stars": the stars, not the clear, carry the
   challenge.
2. **Rules that teach the wrong real world lesson, though labelled "In this game"** (the scientist). Defences at full
   strength the year they are planted (growth off, Section 5); khazans never wear (Section 25); the small dam as the
   flood defence (the roster); a seawall can stand on a sea tile. Done here: two sourced facts the game now shows,
   from the game's own sources, checked today: khazan bunds breach when they are not kept up (Lobo 2020), and a broken
   mud bandhara can bring flash floods (Down To Earth, 2020). Options for the rules themselves: (a) keep; (b) growth
   on for mangroves; (c) khazan upkeep; (d) seawalls on the shore line only. **Recommendation: (a) for this festival,
   with the two facts; revisit (b) and (d) later.**
3. **Esc on a result card jumps to the last card** (Section 9). The chaos tester and others lost a storm's payoff to
   one Esc. Options: (a) keep; (b) Esc on the cards does nothing (Back and the buttons stay). **Recommendation: (b).**
4. **No saved progress** (Section 28.2): a reload or a closed tab loses a run of 10 to 30 minutes (chaos tester).
   **Recommendation: keep for the festival** (the idle reset now warns first).
5. **"The Mandovi waterfront" area** (local): the objective names it where the zone lies, between Patto and Merces,
   not on the riverfront road. The zone is map data (generated, fixed). Options: rename the zone ("the Ourem
   riverside"?) or redraw it. **Recommendation: rename**, the owner's call as map data.
6. **The idle reset's 3 minutes** (Section 30.12). Thinking players pause; the reset now warns for 30 s. Options:
   keep 3 minutes, or 4. **Recommendation: keep 3 with the warning.**
7. **Show risk once the objective is done** (Section 21.4: off at a phase's start, on by itself in the two years
   before a storm). Four of eight playtesters called the builds after the checklist "aimless": they could not see which
   homes were still at risk. Tried in Round 1 and reverted (it changes the accepted default); Maya now says once a
   phase "The list is done. Press R to see the homes this storm would still take". Options: (a) keep; (b) the red
   comes on by itself once the objective is done (R still turns it off). **Recommendation: (b).**
