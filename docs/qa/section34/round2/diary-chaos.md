# Diary: chaos tester (Section 34, round 2)

## 1. Who I am and what I wanted

I am the mischievous player: the kid who mashes every button, the adult who presses Escape out of habit, the visitor who walks off mid-game. I knew nothing about Riptide Rising beyond what the screen showed. I wanted to break it: crashes, frozen screens, soft locks, lost input, numbers that disagree, visual glitches and console errors. I still meant to finish one whole run of Play Panjim and play through the Tutorial.

Setup: Chromium at 1366x768 driven through the local driver. I checked the console after almost every attack. **The console stayed empty for the whole session: no errors and no warnings.**

A note on timing: every driver call took a few seconds, so storms (about 20 to 40 s) were often over before my second or third action landed. Where I say "mid storm" I mean the actions landed while the storm or its replay was still on screen, which the screenshots show.

## 2. What I tried, in order

| # | Attack | What happened | OK? |
|---|---|---|---|
| 1 | Escape twice and a right click on the main menu | Nothing happened | OK |
| 2 | Six parallel clicks on "Tutorial" | Opened the Tutorial brief once, cleanly | OK |
| 3 | Escape on the Tutorial brief | Nothing happened: the brief only closes through Begin | OK (by design, I think) |
| 4 | Resizes with the brief open: 1000x1400, 2560x700, 500x400 | The brief reflowed well every time, and at 500x400 it went to one column. At 1000 wide the top bar's flood pill was squeezed under the cyclone pill, and the bottom hint "Build where the city is at risk..." was cut off behind the defence card | Minor glitch |
| 5 | Double click plus 5 more clicks on Begin | Started once. The extra clicks fell on sea tiles and did nothing | OK |
| 6 | 8 fast clicks on a glowing beach tile | The build menu toggled open and shut and ended closed. Nothing was built | OK |
| 7 | Resize to 1000x1400 and 2560x700 with a build menu open | The menu stayed at its old pixel position while the board re-centred, so it was no longer next to its tile. At 2560x700 the Seawall card and the "Not here" line were cut off at the bottom of the screen | **Bug (minor)** |
| 8 | Escape with a build menu open | Closed the menu | OK |
| 9 | Reload with a build menu open (Tutorial) | Back to the Tutorial brief. The Tutorial had warned that it is not saved | OK |
| 10 | Double click on the Dune card | Built one dune (22 to 18 at risk, year +1). The second click went through to the map and opened a new build menu on the tile underneath | **Bug (minor): clicks pass through** |
| 11 | Tab through the page; arrow keys on the map | Focus visits ?, Menu and the map. A white hex cursor appears on the map, the arrows move it and the camera follows it. Several tab stops showed no visible focus ring | Mostly OK; minor focus visibility |
| 12 | Arrow keys on the focused map | **The game dropped back to the main menu once and lost the Tutorial.** I ran the same sequence again and could not reproduce it | Unexplained, could not reproduce |
| 13 | Idle on the Tutorial brief | Went back to the menu after about 3 minutes | OK (by design) |
| 14 | Idle on the board pressing only arrow keys (4+ min), then only Tab (4 min) | Never reset: keys count as input | OK |
| 15 | Idle on the board mid run, no input | Warning at about 2:30 ("Still there? ... 30 s" countdown, bottom centre), then back to the menu at 3:00. The run was lost | OK (by design) |
| 16 | A click during the idle warning | The warning went away and play went on | OK |
| 17 | Escape on an empty board | Opens "Leave the Tutorial?" or "Leave Panjim?" with Stay focused. Escape again closes it. While it is open, the zoom keys and the wheel are ignored | OK, but an Escape-happy player sees it a lot |
| 18 | Double click on "Stay" | Closed the dialog. The second click went through to the map and opened a build menu (small dam) | **Bug (minor), same pass-through** |
| 19 | Three parallel clicks on the Pandanus card | Built exactly once (bio +3, at risk 18 to 14) | OK |
| 20 | Wheel: 6 times (−2000 then +3000), 5 times −3000, then 8 times +5000 at the top-right corner | No crash. Zoom-in stops at a sensible close-up. **Zooming out at a corner pushes the whole board into that corner, small and half hidden behind the ? and Menu buttons.** Home brings it back, but nothing on screen tells you that | **Bug (minor/major for kids)** |
| 21 | Three huge drags towards the corners | The board stays partly on screen (it is clamped) | OK |
| 22 | Right click on a build card | Did not build | OK |
| 23 | Tutorial cyclone: clicks on the map and the top bar, Escape, while it ran | No effect, no errors. The result was 22 of 22 | OK |
| 24 | Reload over the Tutorial result card | Back to the brief, the Tutorial restarts | OK (warned) |
| 25 | Tutorial again with a different tile choice, 8 clicks on Speed up | Same 22 of 22 result | OK |
| 26 | Double click "On to 2030" | Advanced once. The second click selected a house ("House" tooltip) | Minor (pass-through again) |
| 27 | Tutorial flood: resized to 2560x700 and 1000x1400 mid storm, pressed Escape and +, clicked the top bar | The storm kept running and re-laid out each time. + zoomed in mid storm. Result 26 of 26 | OK |
| 28 | Escape on the flood result card (reached with Back) | Jumped forward to the final card, although Escape on the cyclone card did nothing | Minor inconsistency |
| 29 | Double click "Try again" on the Tutorial final card | Restarted the Tutorial cleanly | OK |
| 30 | Opened the Menu (☰) over the brief, then "Leave the Tutorial" and Leave | Back to the main menu | OK |
| 31 | Two tabs: built a dune in tab 0, opened a new tab | The new tab starts a fresh Panjim run (year 1), not a copy. I built a pandanus there. Switching back to tab 0, its run was untouched (year 2, its own numbers) | OK, the tabs are independent |
| 32 | Reload in tab 0 mid run (year 2) | Back to the Panjim brief, the run lost. The Leave dialog says "Nothing is saved", but reload/F5 gives no warning | Minor (design) |
| 33 | Mid cyclone 2030: Escape, a click on the top bar, double and right clicks on the map, Enter, r | Storm continued; a "Replay Cyclone" panel came up (I may have triggered it with a key, or it may come up by itself). Speed up x6 then went to the result | OK |
| 34 | **"Try this storm again", three times** | Each time it went back to **2026, year 1**, and wiped all 5 builds. The board really was exactly as at the start: 9 at risk, same three glowing tiles, biodiversity 0. When I rebuilt the same things the result was identical, 9 of 9 and "Miramar Beach Damaged". A double click on it also worked, with a stray "House" tooltip | Works and is deterministic, but see bug list (label vs effect) |
| 35 | Menu (☰) opened mid storm, then Escape, s and m | The menu opens over the storm. Nothing broke | OK |
| 36 | Flood 2040: switched to tab 1 for 5 s mid storm, then back, plus 5 Speed up and 5 top-bar clicks | The storm finished correctly; 51 of 57 | OK |
| 37 | Escape on the "Coming up" card | Nothing happened | OK |
| 38 | Final storm 2050: Escape, resize to 1000x1400 and back mid storm, Speed up x6 | Finished fine; 45 of 57 | OK |
| 39 | Final card: Escape (nothing), resize to 500x900 | The card reflowed fine. **The top bar breaks at 500 wide**: "2050" cut off, timeline labels jumbled ("20302050"), the OSM credit behind the ? button | Minor glitch |
| 40 | Reload on the final card | Back to the Panjim brief; the cleared result is gone | Minor (design) |
| 41 | Second run: idle from a build through the storm and over the result card | **Over 6 minutes on the result card with no input, and it never went back to the menu.** No warning either | **Bug (major for the festival)** |
| 42 | Reload mid storm (second run, cyclone 2030) | Back to the Panjim brief, the run lost, no console errors | OK (nothing is saved) |
| 43 | 20 parallel random clicks across the map | One build menu ended open. Nothing was built by accident; no error | OK, but you can't tell which tile an open menu belongs to |

## 3. Bugs and glitches

### Blocker
None found. Nothing crashed or froze, and I found no soft lock. The console stayed empty all session.

### Major

**M1. The idle reset never fires over a storm result card.**
- Steps: Play Panjim, Begin, make 5 builds; the last one starts the cyclone. Then touch nothing. The storm and replay finish and the "CYCLONE IN 2030 / Your city came through" card appears. Wait.
- Expected: the "Still there?" warning at about 2:30, then back to the menu at 3:00, as on the board and on the Tutorial brief.
- Got: still on the result card more than 6 minutes after my last input (10:07:10 to 10:13:18), with no warning. At a festival, a visitor who walks away after a storm leaves the stand stuck on their result.
- Screenshot: chaos-idle-result-card-6min.jpg
- Console: none.

**M2. "Try this storm again" throws away every build since the last storm.** This works as designed, but the label says the opposite.
- Steps: finish the first cyclone (5 builds), then press "Try this storm again" on the result card.
- Expected (from the words): the same storm again on the same board, or at least a warning that 5 years of builds will be undone.
- Got: straight back to 2026, year 1, with every defence gone and no confirm. The board did return exactly to how it began, and replaying the same builds gave the same result, so the reset itself is correct. For the 10-build chapters this costs a lot.
- Screenshot: chaos-retry-back-to-2026.jpg

**M3. Zooming out with the wheel at a screen corner pushes the board off into that corner.**
- Steps: on the board, scroll out hard (wheel dy=+5000, 8 times) with the pointer at the top-right (1300,100).
- Expected: zoom-out stops with the board still centred and filling the screen.
- Got: a tiny board in the top-right corner, half behind the ? and Menu buttons, and empty sky everywhere else. Home restores it, but nothing on screen says so; dragging also works. A child mashing the wheel would be lost.
- Screenshot: chaos-zoomout-offscreen.jpg

### Minor

**m1. Clicks pass through to the map.** The second click of a double click on a card or dialog button lands on the tile underneath.
- Steps: (a) open a build menu and double click Dune. (b) Escape on the board to get "Leave the Tutorial?" and double click Stay. (c) Double click "On to 2030" or "Try this storm again".
- Expected: one action.
- Got: the action happens, and then a new build menu opens on the tile below, or a "House" tooltip appears. It never built twice.
- Screenshot: chaos-doubleclick-passthrough.jpg (the second build menu opened right after the dune was built)

**m2. An open build menu is pinned to the screen, not to its tile, when the window is resized.**
- Steps: click a glowing tile to open the build menu, then resize to 2560x700 (or 1000x1400).
- Expected: the menu moves with its tile and stays on screen.
- Got: the menu stays at its old pixel position while the board re-centres. At 700 high the Seawall card and the "Not here" line are cut off at the bottom.
- Screenshot: chaos-buildmenu-after-resize.jpg

**m3. The top bar breaks at narrow widths.**
- Steps: on the final card (or any screen), resize to 500x900. At 1000x1400 it is milder.
- Got: at 500 wide, "2050" is cut off, the timeline year labels run together ("20302050"), and the OpenStreetMap credit sits behind the ? button. At 1000 wide the flood pill is squeezed under the cyclone pill and the bottom hint is cut off behind the defence card.
- Screenshot: chaos-narrow-topbar.jpg

**m4. The star text disagrees with the stars shown on the 2050 result card.**
- Steps: get 2 stars in the 2050 storm (I lost 12 of 57) and read the card's text, as a screen reader would.
- Expected: two filled stars and one empty, in both the picture and the text.
- Got: the picture shows ★★☆, but the card's text reads "★★★". The top bar's text does show ★★☆. A screen-reader user may hear three stars.
- Screenshot: chaos-2050-result-two-stars.jpg

**m5. The year marker on the top bar covers the last storm's star pill.** On the 2050 result and final cards, the vertical "now" line runs through the third storm's pill ("★★☆" is hard to read). See chaos-final-card.jpg.

**m6. Escape behaves differently on different result cards.** On the cyclone result card Escape does nothing. On the flood result card (reached with Back from the final Tutorial card) Escape jumps forward to the final card.

**m7. Escape on an empty board always offers to leave.** Escape first closes a menu or Maya's bubble, then opens "Leave Panjim? Nothing is saved: leaving ends this run." Stay is focused, so it is safe, but I hit it six or seven times by accident. See chaos-escape-leave-dialog.jpg.

**m8. Reload or a second tab wipes the run with no warning.** The Leave dialog warns that nothing is saved, but F5 or a reload (mid build, mid storm, or on the final card) silently drops you on the Panjim brief. A new tab is a separate, fresh run (tabs don't interfere, which is good).

**m9. Unexplained drop to the main menu (could not reproduce).** In the Tutorial at year 2 I tabbed onto the map and pressed ArrowRight x2, ArrowLeft x3 and ArrowUp. The next screenshot was the main menu and the Tutorial had restarted. It is possible the idle timer ran out while I was slow; keys did reset it in later tests (4+ min of arrows or Tab only, no reset). The exact sequence, replayed, did not do it again.

**m10. With a build menu open, you can't see which tile it is for.** After a burst of random clicks a menu was open with no highlighted tile.

**m11. Small copy items.**
- "Small Dam" is capitalised on the 2030 "What protected" card but "Small dam" everywhere else.
- The final card says "123 homes stood in its path" for three storms together.
- On the 2040 "What protected" card the rows add to 47 (Khazan 26 + Mangrove 21) while 51 homes were saved. The card says the rows need not add up, but overlap would make the sum larger than the homes saved, not smaller.

**m12. Visual nits.** There are thin white seams between some sea hexes. Place labels jump around between builds ("Open sea" moved about 170 px). Landmark labels stack and overlap near Panjim Municipal Market and Institute Menezes Braganza.

## 4. Things that held up well

- Zero console errors or warnings in about two hours of abuse.
- No double builds from spam: double, triple and parallel clicks on cards built exactly once.
- Storms are robust: resizes, tab switches, Escape, the Menu, keys and Speed up spam mid storm never broke a storm or its result.
- "Try this storm again" is truly deterministic: the board went back exactly, and the same builds gave the same 9 of 9 three times.
- Numbers agree everywhere I checked. "Homes at risk" drops match the "What protected" rows in the Tutorial (4+4+7+7 = 22, and 11+5+10 = 26) and in 2030 (Dune 5 + Pandanus 4 = 9). The biodiversity change on each card matches the top bar. The final card adds up: 9+51+45 = 105 of 9+57+57 = 123, 18 lost, and 3+3+2 = 8 stars, all matching the stated star rule.
- The idle warning is clear, and a click or key dismisses it. Keys (Tab and arrows) count as input.
- Leave dialogs default to Stay, and Escape toggles them.
- The brief and the final card reflow well even at 500 wide.
- Keyboard play works: Tab onto the map, a visible hex cursor, arrows move it and the camera follows.

## 5. Fun signals

I still enjoyed it under the chaos. The storm animation (the "Absorbed" tags popping on my pandanus and dunes) is satisfying, and the result cards are clear. What surprised me: the 2050 storm hit the Campal waterfront facing the river mouth, not the beach I had walled. My last-minute seawall scored 0. Also, the retry button sending me back 5 years was a shock.

Why I lost the homes I lost, after each storm's result cards:
- **Tutorial cyclone (2029), 22 of 22:** I lost none, because the four glowing tiles Maya pointed to (dune, pandanus, breakwater, seawall) covered every home in the path.
- **Tutorial flood (2032), 26 of 26:** I lost none, because the mangrove, khazan and small dam covered the estuary and the river between them.
- **Panjim cyclone (2030), 9 of 9, three times:** I lost none, because the dune and two pandanus in front of Sharada Mandir School took all 9 homes out of the path; only Miramar Beach itself was damaged.
- **Monsoon flood (2040), 51 of 57:** I lost 6 because I spent all ten builds on Maya's objective tiles in Merces, St Cruz and Taleigao and never defended the Fontainhas and Campal side of the river, where homes were still marked at risk.
- **Cyclone and flood (2050), 45 of 57:** I lost 12 because the at-risk homes were the Campal waterfront facing the Mandovi mouth, and I put my last build, a seawall, on the beach south of them, where it saved 0.

## 6. Results of my full run (Play Panjim, run 1)

| Storm | Stars | Homes saved |
|---|---|---|
| Cyclone 2030 | ★★★ | 9 of 9 |
| Monsoon flood 2040 | ★★★ | 51 of 57 |
| Cyclone and flood 2050 | ★★☆ | 45 of 57 |
| **Total** | **8 of 9** | **105 of 123 (18 lost)**, +49 biodiversity |

**Panjim cleared.** (The cyclone was replayed twice through "Try this storm again" before I went on; all three tries gave 9 of 9.)

Tutorial: 22 of 22 and 26 of 26, three stars each, with 7 of 7 defences tried.

## 7. Would I play again? Would I tell a friend?

Play again: **yes**. I want a perfect 9 of 9 now that I know the waterfront matters in 2050, and the game never fought me even when I was trying to break it.

Tell a friend: **yes**. I would say: "It's a quick, pretty hex game about protecting real Panjim from storms, one build a year. Follow Maya's glowing tiles, but look at the red striped houses yourself before the last storm. And don't press 'Try this storm again' unless you want to rebuild the last few years."

## 8. Verdict

Very hard to break: no crashes, no console errors and no double builds under heavy abuse; the real problems are the result card never timing out for the next visitor, a retry button that silently undoes years of building, and corner zoom-out losing the board.

## Knowledge questions (asked after play)

All answers come only from what the game showed me.

1. **What does a mangrove do in a storm?** The defence card said mangrove forests slow the flow of the water, lowering a storm's surge and cutting the height of its waves. It works in both cyclones and river floods (Maya: they slow the water before it reaches the houses), and in this game it adds 3 biodiversity, the most of any defence.
2. **Why can a seawall be risky?** Its card said it costs 5 biodiversity, the most of any defence, and that it pushes water to its ends. It also cracks with age and breaks in its 2nd cyclone or once it is 10 years old.
3. **What is a khazan, and what is it for?** It is Goa's old farmed coastal wetland, reclaimed from marsh: a bund and a sluice gate around paddy fields and fish ponds, shared by farmers and fishers. In the game it holds back river floods by keeping the floodwater in its fields, and adds 2 biodiversity, but it is little help in a cyclone.
4. **Where did the 2040 flood come from, and why from there rather than the sea?** Maya's game rule said monsoon rain swells the Mandovi upstream, and the flood comes down the river through the channel at Ribandar into Merces, St Cruz and Taleigao. So it is a river flood caused by rain, not a sea storm; the game didn't explain more than that, so beyond it I don't know.
5. **What helps homes against a cyclone's wind?** Pandanus (screw pine). The game called it the only defence that shields homes from a cyclone's wind, because a row of it shelters what is behind it.
