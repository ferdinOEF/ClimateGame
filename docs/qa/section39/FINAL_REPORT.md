# Section 39: the first minute — FINAL REPORT

Branch `section-39-first-minute` (from master `0679fb9`; safety copy `backup/pre-section-39`). Not merged.

## What changed, step by step

- **39.1 defense.** Every player facing "defence"/"defences" (src strings, JSON values, index.html, Help, the Field
  Guide, build cards, Maya, tooltips, result and storm cards, the menu eyebrow "A COAST DEFENSE GAME SET IN GOA") is now
  "defense"/"defenses". Identifiers, file names, classes, data keys, ids and test ids are unchanged.
- **39.2 Main screen.** Play Panjim is the one button (primary). `SHOW_TUTORIAL_BUTTON = false` hides the Tutorial
  button; its level, code and route stay, and the walkthrough reaches it by `#/play/l00-tutorial`. The quote band runs
  along the bottom: 150 px at 1366x768, a 3 px orange line, the quote word for word from `src/data/menuQuote.json`,
  "Haruki Murakami, Kafka on the Shore", and Facts & sources in its corner. The CLAUDE.md menu rule and
  tests/menu.test.ts are updated.
- **39.3 How to play.** It replaces Play Panjim's start popup. The flow: main screen, Play Panjim, name card, How to
  play, Let's Play!, the game. The card is 1286 x 708 at 1366x768 and scales to the window. Its numbers and words come
  from the level and element data. Let's Play! is Begin (class `brief-cta`, same handler); focus starts on it and Esc
  does nothing. The Tutorial keeps its own brief.
- **39.4 Guided start.** It runs once per Play Panjim run, after Let's Play!. It never runs after Restart or a retry,
  in the Tutorial, or while Maya is muted or minimised. Steps 1, 1b, 2, 2b and 3 follow mocks 3 to 7. The guide is
  soft: a wrong build or Skip the help jumps to step 3, and step 3's Got it ends it. Facts after a build wait until
  the guide ends. Hook: `__guideForTest` (QA builds only). `noguide=1` leaves the guide out.
- **39.5 Docs and QA.** Updated PROGRESS, QA_REPORT, ARCHITECTURE and NEXT_STEPS. Added `tools/section39Shots.ts` and
  applied the reviewer's fixes.

## Tests

- tsc and build are clean. Unit tests: 113 files, 955 pass, 6 skipped.
- `tools/section39Shots.ts`:
  - 1366x768: 25 of 25 checks pass.
  - 1920x1080 and 1280x720 (screens only): all pass.
  - No console errors and nothing posted (API stubbed, `?tag=FestTesters`).
- `npm run test:layout`: 144 of 144 layouts. `npm run test:maya`: all pass, zero console errors.
- Not run: bots (no mechanics changed), the full browser check, Safari and Firefox.

## Screenshots (docs/qa/section39/)

- Main screen: `1-main-screen` at 1366x768, 1920x1080 and 1280x720.
- `2-name-card` at 1366x768.
- How to play: `3-how-to-play` at 1366x768, 1920x1080 and 1280x720.
- Guide steps at 1366x768: `4-guide-step1`, `5-guide-step1b`, `6-guide-step2`, `7-guide-step2b`, `8-guide-step3`.

## Source lines kept as "defence"

- In `src/data/facts.json`, one source's title, address and summary note: "Sand Dune Processes and Management for
  Flood and Coastal Defence: Summary (FD1302)".
- "Airbus Defence and Space GmbH", a company name in the DEM licence (generated map data).

## Open points

The owner answered these on 30 October; all are settled with no change, and `DEFAULT_TAG=Preview` has been set on
Vercel Preview since 29 October (docs/DEPLOY.md). Kept below as they were raised.

- How to play scales up on large screens (1.43 at 1920x1080). Say if it should stay at 1286 x 708.
- ☰ sits under How to play's overlay, as mock 2 draws it, so Leave cannot be reached there. Esc does nothing there;
  the idle reset still works.
- The guide needs Maya. With Maya hidden, muted or minimised it does not run.
- With `VITE_REQUIRE_EMAIL` on, a Restart through the registration sheet would run the guide again. That setting is
  off by default.
- Help's two threat lines in the old levels' help keep a spaced dash. They are older than this section.
- QA tools that read the old start popup's forecast or title no longer find it. The gate tools use `noguide=1`.
- Still open from before: real GPU timing, and Safari
  and Firefox.
