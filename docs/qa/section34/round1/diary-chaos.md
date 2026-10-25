# Riptide Rising, round 1: the chaos tester's diary

## 1. Who I am and what I wanted

I'm the chaos tester. Nobody told me anything about the game, so I knew only what the screen showed me. I wanted to break it: spam clicks, mash keys, press Escape everywhere, resize to silly shapes, reload at the worst moments, run two tabs, walk away mid-run and abuse the storm buttons. I also wanted to finish one honest run of "Play Panjim" to its final card, and to try the Tutorial.

Everything below came from the screen at 1366x768 unless I say otherwise. My screenshots are numbered in the session folder (`scratchpad/r1/chaos/NNN-name.jpg`). The ten key ones are copied into `round1/shots/chaos-*.jpg`.

## 2. What I tried, in order

1. **Menu, key mash and click spam.** I pressed Escape, Enter, Tab, r, +, - and Home. I left- and right-clicked the background six times each and scrolled the wheel by -3000. Nothing changed and there were no console errors. **OK.**
2. **Facts & sources.** It opens and Escape closes it. Scrolling works. Some entries show what look like internal author notes ("Section 30.3, the build card's second line… the page itself could not be opened from this environment"). **Not OK (minor, see 3.3).**
3. **Tutorial, double-clicking "Tutorial".** I got one tutorial and no duplicate. **OK.**
4. **Escape on the tutorial's "How this works" card.** It does nothing, so you must press Begin. **OK** (no soft lock).
5. **Eight fast clicks on Begin.** It started once. The spare clicks went through to the map and opened a build menu for the sea tile under the button. **Minor** (clicks fall through to the board).
6. **Ten fast clicks on the Dune card.** Exactly one dune was built and exactly one year passed (Year 1 to Year 2, "1 of 7"). **OK.**
7. **Right-click, then two double-clicks on the Pandanus card.** One pandanus was built. **OK.**
8. **Breakwater, then five fast clicks on other tiles.** It built once. A build menu opened for the last tile I clicked, and nothing showed which tile it belonged to. **Minor.**
9. **Tutorial cyclone, with clicks and Escape during it.** The result card came straight up: 22 of 22 saved, 3 stars, and the defence numbers added up (Dune 4 + Pandanus 0 + Breakwater 12 + Seawall 6 = 22). **OK.**
10. **Reload over the tutorial result card.** The tutorial restarted from Year 1. The game says the Tutorial is not saved, so this is **OK**.
11. **Tutorial, second try, free choice.** I built a seawall where Maya wanted a dune. The game let me, and Maya then said "Try a dune on the glowing beach". **OK.**
12. **Zoom spam.** I scrolled by -2000 ten times, then +3000 ten times, then pressed + eight times and - fifteen times. Zoom stops at sensible limits and nothing broke. **OK.**
13. **Wild panning (four big drags).** The board left the screen completely and only empty sky remained (`chaos-pan-board-lost.jpg`). Home brought it back, but nothing on screen says so. **Minor.**
14. **The ? help.** It opens and Escape closes it. It explains the rules but not the controls (pan, zoom, Home, R). **Minor.**
15. **A hands-off tutorial storm.** It lasts about 4 seconds, and the "Speed up" button shows "It hurries the storm". **OK.**
16. **Resize to 1000x1400 with a build menu open.** The board re-zoomed, but the menu stayed where it was and no longer pointed at its tile (`chaos-resize-menu-detached.jpg`). Building from it still worked, on the right tile. **Minor.**
17. **Resize to 2560x700, then a build, then a resize back to 1366x768 while the flood ran, with Speed up pressed five times.** The first press worked and the button then disappeared, so the other four clicks found nothing. The result card arrived. Numbers: 23 at risk, Mangrove 6, Khazan 8, Small dam 8, 1 lost. All consistent. **OK.**
18. **The tutorial's final card.** I tried Escape, Back and "Try again". Try again took me back to the start of the tutorial. **OK.**
19. **In-game Menu.** I toggled "Larger text" three times; it ends up on and the text gets bigger. "Leave the Tutorial" asks to confirm, Escape cancels, and Leave goes to the main menu. **OK.**
20. **Play Panjim: reload with a build menu open (Year 1).** I came back to the Panjim intro, which is fine.
21. **Reload after my first build (Year 2).** All progress was gone and I was back at Year 1 with 0/1 dune. **Major**: nothing warns that Panjim isn't saved.
22. **Idle on the board mid-run (Year 2).** I sampled every 3 seconds. Somewhere between about 163 and 166 seconds of inactivity, the game silently dropped me back on the main menu. "Play Panjim" then started a new game, so the run was lost (`chaos-idle-reset-menu.jpg`). I reproduced it three times. It also happened for real: my first full run reached 2040 and was wiped while I paused, through no fault of mine, and I had to replay it. **Blocker.**
23. **Clicks and Escape spam during the first Panjim cyclone.** I clicked the map and the top bar five times and pressed Escape five times. The storm, its replay and both result pages were skipped in one go, and I landed on "Coming up: monsoon flood" without ever seeing my result (`chaos-escape-skips-result.jpg`). The Back button got the result back. Later I confirmed that one Escape on a result card jumps over both result pages. **Minor/major:** an impatient or keyboard player misses the payoff.
24. **Menu open mid-storm, then resizes to 1000x1400 and 2560x700 mid-storm.** All fine. The storm kept going and the timeline tooltip and Speed up button laid out correctly. **OK.**
25. **"Try this storm again" on the first cyclone, four times running, plus a triple-click on the button once.** Each time I was back at 2026, Year 1, Biodiversity 0, 9 homes at risk, with no builds left on the board. **OK.**
26. **The same five builds (seawall plus four far dunes) three times.** I got the same result each time: 5 of 9, 2 stars, the wind took 4, Seawall 5, Dune 0. The game is deterministic. **OK.**
27. **A hands-off Panjim cyclone.** The storm ran about 16 to 18 seconds, then a "Replay: with no defences at all" with a Skip button, then the card. **OK.**
28. **Speed up pressed during the Panjim cyclone and the final storm.** The first press disappears and the rest of the storm and its replay finish almost at once (about 1 second in the final storm). It behaves more like "skip" than "speed up". **Minor.**
29. **Reload mid-storm.** I was back at the Panjim intro, Year 1, all builds lost. **Major** (same root cause as attack 21).
30. **Two tabs.** I built a dune in tab 0, opened a new tab, and in tab 1 started Panjim fresh and built two seawalls. I switched back to tab 0: still Year 2, Biodiversity +2. The tabs are fully independent and nothing leaked. **OK.**
31. **Idle over a result card for 3.5 minutes (tab 1).** No reset; the card stayed. Meanwhile the background tab 0, idle on its board, had gone back to the main menu. **Partly OK:** a result card is safe and the board is not.
32. **A tile that can't be built on, clicked by mistake.** I clicked a house or plain land and nothing showed: no menu and no message. Then the next click on a buildable tile is swallowed and no menu opens. I reproduced this three times and once lost a build year by misreading it. **Minor/major.**
33. **The full run** (results in section 6): 3 + 3 + 2 stars, 8 of 9, Panjim cleared.
34. **The final card: Escape three times, double-clicks and right-clicks, resize to 1000x1400 and 2560x700.** The card stayed, laid out correctly, with no console errors. **OK.**
35. **Idle about 200 seconds over the final card, then reload.** The card stayed up while I was idle. The reload went back to the Panjim intro at Year 1 and the finished result was gone. **Idle OK; reload minor** (see 3.3).

The console stayed empty for the whole session; I checked after every attack.

## 3. Bugs and glitches

### 3.1 Blocker

**B1. Idle for about 2.75 minutes on the board and the run is silently thrown away.**
- **Steps:**
  1. Main menu, then "Play Panjim", then Begin, then Got it.
  2. Build a dune on the glowing beach tile (Year 2).
  3. Touch nothing.
  4. After about 163 to 166 seconds the screen is the main menu.
  5. "Play Panjim" shows the intro again at Year 1 of 25, 0/1 dune, Biodiversity 0.
- **Expected:** the run waits for me, or at least warns me and lets me carry on.
- **Got:** no warning and no resume; the run is gone. It happened to me for real at 2040, halfway through my full run, while I paused to think.
- **Screenshot:** `chaos-idle-reset-menu.jpg`
- **Console:** nothing.

### 3.2 Major

**M1. No saving in Play Panjim: a reload, or a reload mid-storm, wipes a 25-year run.**
- **Steps:**
  1. Play Panjim, then Begin.
  2. Build a dune (Year 2).
  3. Reload.
- **Expected:** back at Year 2, or a clear warning like the one the Tutorial gives ("The Tutorial is not saved").
- **Got:** the Panjim intro at Year 1 with everything lost. The same happens when I reload mid-storm in 2030.
- **Screenshot:** `052`/`054`/`076` in the session folder.
- **Console:** nothing.

**M2. Escape, or clicks, on the storm and result screens skip the whole result.**
- **Steps:**
  1. Make the 5th build, so the cyclone starts.
  2. Press Escape and click the map a few times while it plays.
- **Expected:** Escape closes a popup; it shouldn't throw away the payoff.
- **Got:** the storm, the replay, the result card and the "What protected your homes" page are all skipped, and the "Coming up" card appears. One Escape on a result card jumps straight past both pages. Back does recover them.
- **Screenshot:** `chaos-escape-skips-result.jpg`

**M3. The headline and stars feel backwards when biodiversity is low.**
- **Steps:**
  1. Seawall on the glowing beach.
  2. Pandanus, then 2 dunes, then the cyclone.
- **Got:** 8 of 9 homes saved and Biodiversity -3, with the headline "Your city took a heavy hit." and 1 star (`chaos-heavy-hit-8of9.jpg`). Another run saved only 5 of 9 but had Biodiversity +3, and got "Most of your city held." and 2 stars (`chaos-most-held-5of9.jpg`).
- **Expected:** the headline should match the homes. The rule (two stars need no biodiversity loss) is explained only on the final card, so on the first card the result looks plain wrong.

### 3.3 Minor

**m1. A non-buildable tile swallows the next click.**
- **Steps:**
  1. Click a house tile (nothing visible happens).
  2. Click a buildable wetland tile.
- **Got:** no menu opens. A second click opens it, and a third closes it.
- **Expected:** the first click on a buildable tile opens its menu. Some feedback when a tile can't be built on would also help.
- **Screenshot:** `101` (session).

**m2. The board can be panned completely off-screen.**
- **Steps:** four large drags towards the bottom-right.
- **Got:** empty sky. Only the Home key (not listed anywhere) brings the board back.
- **Screenshot:** `chaos-pan-board-lost.jpg`

**m3. Resizing with a build menu open leaves the menu stranded.**
- **Steps:**
  1. Open a tile's menu.
  2. Resize to 1000x1400.
- **Got:** the board re-zooms but the menu stays put and no longer marks its tile. It still builds on the right tile.
- **Screenshot:** `chaos-resize-menu-detached.jpg`

**m4. Facts & sources shows internal notes to players.** Examples: "Section 30.3, the build card's second line." and "Checked from the search engine's quotation of the page (the page itself could not be opened from this environment)." The pandanus fact is also listed twice.
- **Screenshot:** `chaos-facts-internal-notes.jpg`

**m5. Overlapping labels.**
- **Steps:** look at the map at 2041.
- **Got:** "Taleigao" and "The Ourem creek" overlap and read as "Taleigao m creek". The landmark labels around Campal and Fontainhas also crowd each other.
- **Screenshot:** `chaos-label-overlap.jpg`

**m6. Top-bar timeline chips overlap.** At 2030 in the Tutorial, the "Flood in 3 builds" chip covers the finished cyclone's ★★★ chip, and the year marker line cuts through "2030" (`chaos-topbar-chip-overlap.jpg`). On the final card, the third storm's stars are half hidden under the year line and the Biodiversity box (`chaos-final-card.jpg`).

**m7. "Speed up" acts as "skip".** One press ends the storm and its replay within about a second, and the button vanishes, so you can't press it repeatedly.

**m8. Clicks fall through dialogs.** Spam-clicking Begin opened a build menu for the tile under the button.

**m9. The star text doesn't match the picture.** The screen text for a 2-star card reads "★★★" (filled and empty stars are the same character), while the card shows ★★☆. A screen reader would announce 3 stars.

**m10. The defence numbers don't always match the risk counter.** On the final storm card Pandanus is credited with 3 homes. But when I planted the two pandanus at Campal, "Homes at risk" stayed at 22 and didn't drop. My guess is that it counts wind, but on the board the counter and the card disagree.

**m11. Small wording slips.** "Pandanus bring nature back" should be "brings". A tooltip ("Menu") sits on top of the ? button when hovered in the wide layout.

**Addendum on the final-card idle and reload (attack 35):**
- **Idle:** I left the final card alone for about 200 seconds. It stayed up with no reset (session shot `128`). **OK.**
- **Reload over the final card:** the "Panjim 2050" intro came back at Year 1 (session shot `129`). The finished result is gone and there is no record of my 8 stars anywhere. This is **minor**, and part of M1.

## 4. Things that held up well

- No console errors or warnings at any point in the whole session.
- No crash, no frozen screen and no real soft lock. Every dialog had a way on.
- Build spam is solid: ten clicks gave one build and one year.
- "Try this storm again" truly restores the board (Year, Biodiversity, homes at risk and builds all exactly as before), even four times in a row or triple-clicked. The same builds always give the same result.
- The numbers add up: the cards' totals (9 + 51 + 35 = 95 of 9 + 57 + 57 = 123), the stars (3 + 3 + 2 = 8) and the biodiversity changes all match the top bar.
- Resizing to 1000x1400 and 2560x700 works at calm moments, mid-storm and over cards. Zoom limits work. The two tabs are independent.
- Menu, Field Guide and toggles all work mid-storm.

## 5. Fun signals

- Even under the chaos I enjoyed it. Watching the cone shrink build by build is satisfying, and the "Replay: with no defences at all" bit lands well.
- **Surprises:**
  - Saving 8 of 9 homes earned a "heavy hit" and 1 star, because seawalls cost nature.
  - The 2050 storm is a cyclone and a flood together, and my Campal dune and pandanus did almost nothing (0 and 3).
- **Tutorial cyclone (19 of 22):** I lost 3 because I spent build 1 on a seawall and left 3 homes at the estuary edge still outlined at risk.
- **Tutorial flood (22 of 23):** I lost 1 home that none of my mangrove, khazan or dam reached.
- **Panjim cyclone 2030 (9 of 9):** I lost none; a dune and two pandanus covered the 9 homes behind Miramar beach.
- **Monsoon flood 2040 (51 of 57):** I lost 6 around Patto and Fontainhas and north Merces, where I couldn't find a buildable wetland tile close enough.
- **Cyclone and flood 2050 (35 of 57):** I lost 22 in old Panjim and Campal (Municipal Market, Don Bosco, Menezes Braganza). The water came in from the bay side, and my beach builds at Campal didn't touch it.

## 6. Results of my full run

| Storm | Stars | Homes saved |
|---|---|---|
| Cyclone 2030 | ★★★ | 9 of 9 |
| Monsoon flood 2040 | ★★★ | 51 of 57 (first attempt 46 of 57 and ★★; retried) |
| Cyclone and flood 2050 | ★★☆ | 35 of 57 |
| **Total** | **8 of 9** | **95 of 123** |

Biodiversity ended at +59. **Panjim cleared.**

The run that counts was my second full playthrough, after the idle reset (B1) wiped the first one at 2040.

## 7. Would I play again? Would I tell a friend?

**Play again:** yes. I want to crack the 2050 storm and find where old Panjim can be defended, and the retry button makes experimenting cheap.

**Tell a friend:** yes, with a warning. I'd say: "It's a neat Goa coast puzzle: one build a year, watch the storm, see what saved whom. Don't walk away from the board for three minutes or reload, because it throws your whole run away. And don't press Escape on the result."

## 8. Verdict

Sturdy under abuse (no crash, no console error, exact retries), but the silent idle reset and the lack of any saving can wipe a 25-year run, and Escape skips the payoff.

## Knowledge questions (asked after play)

1. **What does a mangrove do in a storm?** It slows the flow of the water, lowering a storm's surge and cutting the height of its waves. The game says it helps in both kinds of storm, cyclone and river flood, and adds the most biodiversity, being a nursery for fish and crabs.
2. **Why can a seawall be risky?** It pushes water round its ends: my result card said the water reached Sharada Mandir School and Miramar Beach. It also breaks in its second cyclone or once it is 10 years old, and it costs 5 biodiversity, the most of any defence, which cost me stars.
3. **What is a khazan, and what is it for?** It is Goa's old farmed wetland, reclaimed from marsh: a bund and a sluice gate round paddy fields and fish ponds, shared by farmers and fishers. In the game it holds back river floods by holding the floodwater in its fields, so nearby homes stay drier.
4. **Where did the 2040 flood come from, and why from there rather than the sea?** Maya's game-rule note said it comes down the Mandovi, through the channel at Ribandar, into Merces, St Cruz and Taleigao. The game called it a monsoon river flood, which is why it comes down the river and not from the sea. Beyond that, I don't know: the game never explained any further why.
5. **What helps homes against a cyclone's wind?** Pandanus. The game says it is the only defence that lowers the wind: homes within two tiles of it take half the wind damage.
