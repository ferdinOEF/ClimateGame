# Section 34: the deep review

Branch `section-34-deep-review`, from master `1c4eaba` (Section 33's QA record). Safety copy: the tag `pre-section-34`
and the branch `backup/pre-section-34`, both on GitHub. The owner asked for a full QA, so the full browser check in
CLAUDE.md applies.

## Where we are (read this first after a restart)

- Round 0 (setup): done. See "Setup" below.
- Round 1: in progress.

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
