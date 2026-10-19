# Bugs found in Section 21's end to end pass

The game played in a browser (Playwright, Chromium with software GL) as a player would, at 1280x600, 1366x768,
1920x1080 and 2560x1440, by `tools/playthrough21.ts` (landing, continue, two tabs, input, edges, a full run in each
play style), `tools/section21Shots.ts` (live risk, ruins, damaged landmarks), and the standing suites
(`npm run walkthrough`, `tools/section17bChecks.ts` for every card's text, `tools/section16bChecks.ts` for the HUD,
the modal manager and Esc). Each bug: what, where, how to reproduce, a screenshot (in `docs/qa/section21/`), the fix
and the test that keeps it fixed.

## Fixed

_(filled in as the pass runs)_

## Owner decisions needed

These would change accepted behaviour or a design decision, so they are not changed here.

1. **"Begin" beside a saved run.** With a run saved, the start popup offers "Continue from 2027" and "Begin"; "Begin"
   starts over and drops the saved run without saying so. The Section 16 tools check for exactly "Begin" ("as before
   Section 16"), so it is accepted behaviour; "Begin again" (the words in Section 21's brief) would say what it does.
   Screenshot: `playthrough/continue-1366x768.jpg`.
2. **Help scrolls at 1366x768 and below.** How to play has six illustrated sections; at 768 px high the card scrolls.
   Fitting it would mean fewer pictures or two pages. Screenshot: `playthrough/open-help-1366x768.jpg`.
3. **Repair brings a ruined home back.** A home a storm destroyed is now a ruin for the rest of the run (Section
   21.3), but the game has long offered "Repair (uses this year's build)" on it, which rebuilds it (and its ruin goes).
   Kept; the owner decides whether a ruin should be repairable. Rebuilding was not added.
4. **The result card counts earlier ruins as not saved.** "N of M homes saved" takes M as every home in the storm's
   path, including homes an earlier storm already ruined, so 2050 on an undefended run reads "0 of 106 homes saved"
   while that storm itself took 43. The ruins on the board match the card (the ruins in the path are M minus N), but
   a player may read it as 106 homes lost in 2050.
