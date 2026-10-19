# Bugs found in Section 21's end to end pass

The game played in a browser (Playwright, Chromium with software GL) as a player would, at 1280x600, 1366x768,
1920x1080 and 2560x1440, by `tools/playthrough21.ts` (landing, continue, two tabs, input, edges, a full run in each
play style), `tools/section21Shots.ts` (live risk, ruins, damaged landmarks), and the standing suites
(`npm run walkthrough`, `tools/section17bChecks.ts` for every card's text, `tools/section16bChecks.ts` for the HUD,
the modal manager and Esc). Each bug: what, where, how to reproduce, a screenshot (in `docs/qa/section21/`), the fix
and the test that keeps it fixed.

## Fixed

1. **How to play scrolled on short desktop windows.** Where: the How to play card (the ? button). At 1366x768 the
   last section and the sources note sat below the card's edge and the card scrolled; at 1280x600 by 77 px.
   Repro: open Help at 1366x768. Screenshot before: `playthrough/open-help-1366x768.jpg` (first pass); after:
   `help-1366x768.jpg`, `help-1280x600.jpg`. Fix: under 900 px high the card widens to 780 px with smaller pictures
   (132x84), under 680 px to 880 px with 108x68 pictures and 13 px text (`src/ui/panjim/panjim.css`); at 1080p and
   above nothing changes. Test: `npm run test:help` (`tools/helpFit.ts`) opens Help at 1280x600, 1366x768,
   1920x1080 and 2560x1440 and fails if any part of the card scrolls; the playthrough's layout scan checks it too.

## Checked and not a bug

Problems the pass reported that came from the test tools, not the game; each tool was fixed.

- **"The card reads undefined of undefined homes saved".** The tool's do-nothing style moved the year on with the
  `pass-year` test scenario, which hurries the storm and presses the result cards' buttons itself, so the cards
  were gone before the tool read them. A player's click during a storm does not close the cards. The tool now
  builds away from the storms through the player's own build path.
- **"After a resize mid storm the board stays at 1025x576".** The canvas follows the window on the browser's resize
  event; with software GL a frame takes about a second, so 0.8 s was too short a wait. The tool now waits up to 6 s.
- **Every play style stalled in 2030.** The tool built with the `buildNow` test hook, which on purpose refuses the
  build that brings a storm. The tool now builds as a player does: it opens the tile and clicks the card.
- **"The run reaches the final card" failed at 2050.** The skyline reveal and the title come before the final card;
  the tool checked too soon. It now waits up to 40 s; the card offers Play again and Back to the menu.
- **The well style's first card never opened.** The tool pressed ? and clicked Help during the storm and left Help
  open; a storm and its cards wait while Help, ☰ or the Field Guide is open (Section 16 B5, accepted). The tool now
  shuts such a layer, as a player would, and logs it.
- **Blank pictures in Help.** In the first screenshots two of Help's pictures were empty teal panels: the images had
  not decoded yet in a browser busy with software GL. The files are fine; the tools now wait for them.

## Owner decisions needed

These would change accepted behaviour or a design decision, so they are not changed here.

1. **"Begin" beside a saved run.** With a run saved, the start popup offers "Continue from 2027" and "Begin"; "Begin"
   starts over and drops the saved run without saying so. The Section 16 tools check for exactly "Begin" ("as before
   Section 16"), so it is accepted behaviour; "Begin again" (the words in Section 21's brief) would say what it does.
   Screenshot: `playthrough/continue-1366x768.jpg`.
2. **Repair brings a ruined home back.** A home a storm destroyed is now a ruin for the rest of the run (Section
   21.3), but the game has long offered "Repair (uses this year's build)" on it, which rebuilds it (and its ruin goes).
   Kept; the owner decides whether a ruin should be repairable. Rebuilding was not added.
3. **The result card counts earlier ruins as not saved.** "N of M homes saved" takes M as every home in the storm's
   path, including homes an earlier storm already ruined, so 2050 on an undefended run reads "0 of 106 homes saved"
   while that storm itself took 43. The ruins on the board match the card (the ruins in the path are M minus N), but
   a player may read it as 106 homes lost in 2050.
4. **The storms' strengths (Section 21.2).** Tuned inside what earlier sections accepted: the cyclone stays 1.2
   (above 1.3 the undefended cyclone reaches the homes by Kala Academy, against Section 16.4's "nothing at Kala
   Academy"), the flood is 2.35 (at 2.4 its icon and word turn "severe", like 2050's; at 2.6 its track leaves the
   Ribandar channel, Section 19), the 2050 storm 3.8; stars at 0.80 and 0.70. Two trade-offs for the owner:
   - **1.5 / 2.6 / 3.6 meets more targets** (sensible clears 74%, random 3%, nature beats seawalls on stars too), but
     changes those two accepted behaviours. Tables: `docs/qa/section21/tuning-option-1.5-2.6-3.6.md`.
   - **Nature only against the sensible clear rate.** The 2050 storm at 3.8 brings sensible play down to 79% clears,
     but nature only saves 36% of the homes over a run (61% before Section 21). At 3.0 it would save 50%, and sensible
     play would clear 92%. Nature only never clears at these stars: the cyclone is all or nothing (every home or about
     a third), seawalls stop it and the nature bot does not; a player who follows the objective card (dunes in front
     of Sharada Mandir School, nature based) does.
5. **One kind of defence can clear the level.** Clear is 5 stars of 9 and a storm gives at least 1, so three stars in
   the 2030 cyclone alone clears it. Best play limited to one kind (`docs/qa/section21/tuning-after-only.md`): dunes
   only, pandanus only, seawalls only and breakwaters only each clear 100% of seeds while saving 5 to 30% of the homes
   over the run; no single kind reaches three stars in every storm. A rule the owner could add: a level is clear
   only with at least two stars in two storms, or with half the homes saved over the run.
6. **The tuning changes what a player sees.** Building by eye on the forecast (the Casual bot) saved 60 to 82% of the
   homes over a run before Section 21 and saves 25 to 60% now (mean 41%); `tests/panjimBots.test.ts` was changed to
   match, and Casual's lead over Greedy from 20 points to 15. Two stars now need 70% of the homes in the path saved
   (50% before); three stars 80% (79%).
