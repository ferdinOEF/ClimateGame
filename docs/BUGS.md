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

# Section 22: the owner's answers (22.4) and what was done

1. **Begin again.** Beside a saved run the start popup now reads "Begin again"; it asks "Start a new run? Your run
   from <year> will be lost." with Cancel and Begin again before the save is dropped. Checked in the playthrough
   (`tools/playthrough21.ts`: the wording, Cancel keeps the popup and the save, Begin again starts at 2026;
   screenshot `docs/qa/section22/playthrough/begin-again-confirm-*`). `tools/section16Checks.ts` expects the new label.
2. **Ruined homes stay ruined.** Repair is for defences only: `ActionRun.needsRepair` is false and `repair` refused
   for a home; a ruined home's popover says "Ruined in a storm. In this game a ruined home stays ruined for the rest of
   the run: repair works on defences only." Test: `tests/section22.test.ts`.
3. **A storm counts against the homes still standing.** The card reads "N of M homes saved" with M the homes in its
   path still standing when it hit, and "Lost in earlier storms: K" under the bar; stars come from the same count.
   Tests: `tests/ruins.test.ts` (the card's homes, and ruins equal M − N + K storm by storm).
4. **The stronger setting is not used.** The cyclone stays 1.2 (Sharada Mandir and Miramar, nothing at Kala
   Academy) and the flood 2.35 (through the Ribandar channel); only the 2050 strength and the stars were tuned.
5. **Nature only against seawalls only.** Cause: a nature defence holds back at most 5 m of water round its tile (6 m
   with an engineered one among the defences; `maxProtectionM` in `src/data/hazardModel.json`), a mangrove's own
   strength is 4.5 m against a seawall's 14.4 m, and the stronger 2050 storm's water passes the ceiling, so nature
   defences fall short first (few are overwhelmed: 1 to 3 of 25). Fixed by lowering the 2050 storm, 3.8 to 3.0, rather
   than changing the hazard rules: nature only then saves more homes than seawalls only over the run and far more in
   the flood (tables in `docs/QA_REPORT.md`).
6. **Clear.** At least one star in every storm and five of the nine in all (`clearsLevel`, `CLEAR_TOTAL_STARS`); the
   final card shows "N of 9 stars" and "Panjim cleared" or "Not cleared yet" with the rule as a game rule; How to play
   says it. Test: `tests/section22.test.ts`.
7. **Stars.** A one-star line: below 30% saved, no star. Two at 50%, three at 85% (from the owner's starting point
   30 / 55 / 80, tuned on the bots). Targets this leaves unmet are listed in `docs/QA_REPORT.md`.

# Section 25: the owner's decisions, and the choices made carrying them out

Done as asked (each defence's pro and con, stars from homes and biodiversity); see `docs/PROGRESS.md`. Where the brief
left a choice, this is what was chosen, for the owner to confirm or change:

1. **"The first cyclone it faces".** A seawall counts every storm that brings a cyclone while it stands (a small dam,
   every storm that brings a river flood), whether or not that storm's water reaches its tile; it breaks as the second
   comes, so it gives no protection in that storm. A wall built after 2030 meets only the 2050 storm and comes
   through it.
2. **A broken seawall or dam keeps its biodiversity cost** (it stands on the board, broken) until a new build replaces
   it. The breakwater keeps its depth rule and, when it fails, is also drawn broken.
3. **The wall's ends.** A wall is a line of seawalls; an end has at most one seawall beside it. Where the surge stands
   against an end, the land beside it that lies lower than that water keeps at least 0.3 m of water, whatever the
   protection round it. 0.3 m is under the 0.6 m that takes a home, so the push alone takes none; with the wind near
   the landfall it can.
4. **Two of a kind side by side.** Two dunes (or khazans) count together only when they stand next to each other. On
   the land within two tiles of the pair they protect within 10% of one seawall (one small dam); further out, where a
   seawall still holds back its full 6 m, a pair gives less.
5. **The Tutorial's stars** still count the homes saved only (its one storm, three builds); its Help line says Play
   Panjim counts biodiversity too. Changing the Tutorial's own rule would change its balance.
6. **The best plan for the most homes.** The final search keeps a third of its plans by each of goal 1, goal 2 and a
   greener order; its best loses 10 homes (9 of 9 stars). An earlier run that kept half for goal 2 found a plan
   losing 9 homes at 8 of 9 stars (the 2030 cyclone held with breakwaters, biodiversity 0, two stars).

# Section 26: the owner's decisions, and the choices made carrying them out

Done as asked (engineered defences age, biodiversity at the end of 2050 counts, a stronger wind); see
`docs/PROGRESS.md`. Where the brief left a choice, this is what was chosen, for the owner to confirm or change:

1. **Age.** A defence's age is the years since it was built (built in 2027, 10 years old in 2037). A breakwater breaks
   as the year it turns 10 begins (the year turn after the 2036 build, so one built in 2027 is broken from 2037),
   storm or not, with a note on the board ("Broken with age"). A seawall or small dam 10 years old or more is
   cracked: it breaks in the next storm of its kind, even its first (so one built in 2036 is cracked in 2046 and breaks
   in the 2050 storm; one built in 2040 is 10 in 2050 and breaks then too). The Section 25 second-storm rule is kept.
   A breakwater no longer fails by depth or storm count. Previews (the forecast, the live risk, "homes this saves")
   judge each defence at the age it will be when the storm comes.
2. **Broken defences** (breakwater, seawall, dam) stay on the board, drawn broken, protect nothing, keep their
   biodiversity cost, and the tile takes a new build.
3. **The 2050 storm's three star biodiversity: +40, measured at the end of 2050** (after the last build and the
   storm; the storm itself wears no biodiversity, so this is the board's biodiversity after the 2050 build). 2030
   and 2040 keep +6. Set with the solver: the best plan (9 of 9) has +39 when the 2040 flood comes and ends 2050 at
   +45, so it reaches the target only through its builds after 2040 (`tests/bestPlan.test.ts` checks both). The
   margin is small: the breakwater and dam it needs after 2040 for homes cost biodiversity, and its mangroves and
   pandanus after 2040 make that up. At +40 a plan that stops building nature by 2040 needs +40 by then.
4. **The stronger wind is the two cyclones' own** (`levels.json`, `wind` on the 2030 and 2050 storms); the Tutorial and
   the model's default (0.2 m a strength) are unchanged. 2030: 1.0 m a strength, keeping 0.8 of itself a hex
   inland. 2050: 0.6 m a strength, 0.8 a hex, 1.1 of it in the compound storm. Pandanus share kept at 0.5.
5. **Where the wind targets were measured.** On the opening board the water takes every home near the beach first, so
   the wind is never the deciding loss there. The targets were measured on defended boards (the Section 25 best plan,
   its breakwaters rebuilt, and the new best plan with and without its pandanus): 2030, the wind alone takes 1 to 3
   of the 9 homes in its path, and pandanus within 2 tiles stops them. 2050, the wind alone takes 10% to 14% (6 of 60
   to 9 of 64, by board): "about 10%", at the high side on the best plan's board.
6. **Unmet: pandanus cannot stop most of the 2050 wind.** The 2050 storm lands at Campal, and the homes its wind takes
   are on the Mandovi waterfront, 5 to 8 tiles from any beach: pandanus grows only on beach tiles and shields within 2
   tiles, so it reaches few of them (the best plan's 3 pandanus save 3 of 12 such homes). Within reach, pandanus halves
   the wind as before. Options for the owner: let pandanus grow on more ground (a game rule), move the 2050 landfall,
   or accept it.
7. **The best plan's search is seeded** (`seed=` in `npm run bestplan`, `tools/bestPlan/seed26.json`): the beam alone
   kept missing the 2030 trio (a dune and two pandanus in front of the school) because each one alone saves little.
   The seed is a hand plan (that trio, the Section 25 plan's middle builds, then greedy builds after 2040: 9 of 9, 17
   homes lost, +45); the search scores it with its own plans every year and ends no worse. With the seed in its beam
   the search found its own plan, as good (9 of 9, 17 homes lost, +45), which is the one reported. Ties in the final
   pick now go to the most biodiversity at the end of 2050.
8. **The Section 25 shot renamed.** `docs/qa/section25/result-card-nature-*.jpg` showed the seawall run's 2030 card,
   so it is now `result-card-seawall-run-*.jpg` (QA report and `tools/section25Shots.ts` updated).
9. **An old test changed:** the result cards' words never said "wind" (Section 17). The 2030 card now says how many
   of the homes lost the wind alone took ("The wind alone took 3 of the homes lost": homes whose water stayed under
   the loss line), as the brief asks; the test allows that line only.
10. **Build cards:** seawall "Strongest; breaks in its 2nd cyclone, cracks at 10"; small dam "Strong in floods; breaks
   in its 2nd flood, cracks at 10"; breakwater "Breaks waves at sea; lasts 10 years".

# Section 30b: Maya's speech bubble flickered and Got it missed (owner bug)

**What:** in the owner's recording (a laptop, the browser not full screen) a Field Guide tip ("5 of 20", Got it)
flickered: for single frames the bubble jumped up the screen, then snapped back; it began as the pointer reached
Got it, and Got it often missed because the button moved away under the pointer.

**Cause, confirmed in a browser at 1024x640:** "Got it" carries a HUD tooltip ("Closes Maya's tip.", attached in
`src/app/panjimController.ts` `attachTooltips`), and `.hud-tooltip` is one of Maya's obstacles (`HUD_OBSTACLES`,
`src/ui/panjim/maya.ts`). 400 ms after the pointer reached Got it the tooltip opened below the button, over the
bubble's lower edge; her layout moved the bubble clear (y 469 to 321); the pointer was then off Got it, the tooltip
hid, and the bubble moved back: a loop about once a second. Not the tile hover (it is not an obstacle, and the
board's outline already clears when the pointer leaves the canvas for the bubble).

**Fix (`maya.ts` and `panjim.css` only):**
- While the pointer is on her figure or her bubble, the bubble does not move (laid out again once it leaves).
- A tooltip on one of her own controls is never an obstacle (matched by the tooltip's id in the control's
  `aria-describedby`).
- A bubble already up moves only to a spot that has held for 250 ms (`SETTLE_MS`), at most once a second
  (`MOVE_GAP_MS`, counted from the line's first appearance too), and the new spot fades in (220 ms; off with reduced
  or calm motion). A transient lack of room no longer hides it for a frame. A held move is looked at again when due,
  not every frame. The search's trial widths and compact look are put back whenever it ends without a move, so the
  bubble never changes shape where it stands. A new line is placed at once.
- Test: `tools/section30bBubble.ts` (1366x768, 1024x640, 1920x1080): the pointer on the bubble and on Got it for 3 s
  each, the bubble at one position in every frame and Maya drawn; one click on Got it closes it; no tile outline; an
  obstacle dropped on the bubble: unchanged where it stood, then one change within about a second.
  `tests/section30b.test.ts` pins the rules.

**For the owner:** while the pointer rests on Maya or her bubble, a card that opens over the bubble does not push it
aside until the pointer moves (the rule as asked: her position is frozen under the pointer).

**Left as it is, for the owner:** Got it keeps its tooltip ("Closes Maya's tip.": every HUD control has one, checked
by `verify:maya`). In a small window it opens above the button, over the bubble's last lines (the "5 of 20" count),
while the pointer is on Got it. It no longer moves the bubble. Say if Got it should lose its tooltip.

# Section 30: the review's bugs (30.11), and the choices made carrying out the owner's decisions

**Bug 1, "Objective complete" while Sharada Mandir School was Damaged.** Reproduced headless on master
(the board in `tools/section30Shots.ts`): the objective's builds plus a seawall
beside the school. The cause is the seawall's end push (Section 25.1, a game rule): the land beside each end of a wall
keeps `endPushM` (0.3 m) of water. The school's tile is beside the wall, so it takes 0.3 m and is drawn Damaged while
all 9 homes are saved; the seawall's cost to biodiversity takes the storm to 2 stars. On master the card said
"Objective complete" and nothing else. Now (Section 30.9) a card under 3 stars says "Objective done" with one line
on what stopped the third star ("In this game biodiversity was +1; three stars need +6."), and a damaged place beside
a seawall is named: "In this game a seawall pushes water round its ends: it reached Sharada Mandir School."
With Section 30.2 the objective now asks for a dune at -4,18, so the seawall can only go beside it (-3,17).

**Bug 2, the 2050 map's names.** The names grew with the map's 12 px minimum font after their boxes were checked
at the map's own size, so long names ran off the edge and onto others. Now each name is placed as drawn (its real
box): to the right of its dot, else to its left, slid back inside an edge, and left off if it would still cover one
placed before it. On the 2040 storm's last card: "Our Lady of the Immaculate Conception" and "Mahalaxmi Temple"
shown, "Adil Shah Palace" left off (it sat on the first).

**Bugs 3 to 13:** done as asked; see docs/QA_REPORT.md (Section 30) for each one's check. Choices made:
- Bug 5: a breakwater breaking with age already had a note at its tile; it now also gets a banner, wherever the
  camera is, and a seawall or small dam turning 10 (cracked) gets both.
- Bug 7: the combo line asked for ("Khazans side by side protect each other.") does not match the rule in the game:
  the pair is a khazan beside mangroves (Living Bund), and three or more mangroves together (Mangrove Belt). The
  toasts say so in plain words: "A khazan and mangroves side by side protect each other." and "Three or more
  mangroves side by side protect each other." Both are in the Field Guide ("Side by side"), as game rules.
- Bug 8: the data names are now "Pandanus" and "Khazan" (they were "Sandy Vegetation (Pandanus)" and "Khazan
  (Bundh & Sluice)"), so every place that shows a name says the same.
- Bug 13: "Shared the work" reads where a defence's own number is 0 only because another would have covered for it
  (taken away together with that other, the storm takes more homes than without the other alone).

**Owner decisions carried out, and where the brief and the board differ:**
- 30.1: three of the 16 tiles listed as "already unplayable" (27,10, 27,11 and 26,12) were playable river tiles;
  all 33 are now dry and grey. 13 of the 33 were already grey scenery.
- 30.3: the mangrove's "best for biodiversity" reads "great for biodiversity": in this game pandanus ties it (+3
  each). The dune's second line stays a game line ("Good for nature: it adds to biodiversity."): no one source was
  found that says "home to beach plants and ghost crabs", and no page could be opened from here to check one (leads
  kept in facts.json, `card-dune`). The four others are sourced (facts.json `card-*`, the Sources screen); three of
  them were checked from the search engine's quotation of the page, as the pages could not be opened from this
  environment (their notes say so). The khazan keeps its sourced line ("Farmers and fishers share it.").
- 30.9: a merged row that would name more than about 40 characters of places counts them instead ("Build 7 khazans
  at 5 places, shown on the map"); the tiles pulse and a click pans to one.
- 30.12: the idle reset runs in the Tutorial too (it returns to the menu, which is what a festival needs); Larger
  text is not remembered (each visitor starts with the usual size).
