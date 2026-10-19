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
