# Playtest diary: the optimiser (round 2)

## 1. Who I am and what I wanted

I'm an optimiser. I read every rule (I opened Help before my first build), I try to break the scoring, and I use any retry to compare plans on the same storm. I wanted 9 of 9 stars in Play Panjim, a list of the strategies I compared, and an answer to one question: is there a cheap trick or a single defence that always wins?

I got 9 of 9 and cleared Panjim, but only after one lost run and four storm retries. The cheap trick exists. It isn't one defence, it's one tool: the hover note "This doesn't change the next storm" used together with the Homes at risk counter (details in section 3).

## 2. The play, in order

**Run A (lost).** The menu, then the Panjim intro (about 110 words), then Help. Help is the one place that gives the star rule (30% / 55% plus no biodiversity loss / 85% plus biodiversity up 6, or up 40 by the end of 2050), and I needed it. I pressed R for the risk overlay: 9 homes at risk, shown as hatched red tiles. Then I clicked the pulsing beach tile north of the school. All three cards were offered, and the panel said "This doesn't change the next storm". The tile the game was pulsing, with the objective tag on it, did nothing. I probed other tiles and found the note belongs to whichever card is hovered. I built a dune on the beach tile in front of the arrow (homes at risk 9 to 4), then pandanus on the two other pulsing tiles (4 to 1 to 0). That was my first build, at about 175 s and about 12 actions. Then one of my screenshot calls hung for about 2 minutes. When I came back the game was on the main menu and the run was gone. I never saw a warning. Annoyed.

**Run B, cyclone 2030, attempt 1.** I replayed the same three builds: dune, pandanus, pandanus, giving 0 at risk and biodiversity +8 after only 3 builds. A new objective appeared, "Get ahead: the monsoon flood". I spent the two spare pre-cyclone builds in Merces. The mangrove (+3) did not tick the khazan objective, so the second build went on the khazan. Result: 3 stars, 9 of 9, +13. It felt good but too easy: 3 builds were enough for 3 stars.

**Cyclone 2030, attempt 2 (scoring test with seawalls).** I used "Try this storm again". A seawall on the main beach tile also took risk from 9 to 4, the same as the dune, but cost 5 biodiversity. I put a second seawall on the south pulsing tile, where the note said "doesn't change". The note was honest: risk stayed at 4 and biodiversity fell to −10. Pandanus filled the rest. The game moved the pulse to a tile where the objective dune "doesn't change" but pandanus does. Result: 9 of 9 homes saved, biodiversity −1, **1 star**: "Your homes held, but nature paid for it". Clear and fair (shot optimiser-storm1-seawalls-1star.jpg).

**Cyclone 2030, attempt 3.** I swapped the order: pandanus on the main tile (only 9 to 6, worse than the dune's 9 to 4) and the dune on the north tile. That also ended at 0 at risk and +8 after 3 builds, then khazan plus mangrove in Merces. Again 3 stars, 9 of 9, +13. Same builds, same result: the storm looks deterministic.

**Monsoon flood 2040, attempt 1.** 47 homes at risk and 10 builds. Each build was greedy: probe the notes, build, read the counter. Results:
- Mangrove in Merces: −4.
- Khazan next door: −3.
- Mangrove between St Cruz and Taleigao: −3.
- Khazan: −4.
- Mangrove in Taleigao: −9 (lovely).
- Mangrove: −3.
- Mangrove at Merces north: −4.
- Mangrove on a pulsing tile I didn't probe: **0**, a wasted year (shot optimiser-wasted-pulsing-build.jpg).

Then the camera jumped and Maya said Taleigao was most at risk. I found the tiles beside the Taleigao cluster with my probe and built two more (−3, −4). Result: 47 of 57 saved, 82%, **2 stars**.

**Flood, attempt 2.** I replayed the 10 builds and tested mangrove instead of khazan on the second Merces tile. Mangrove gave −1 where khazan had given −3, so card choice matters per tile. My own probe script also clicked through the open card menu and built a khazan by accident. That khazan plus a mangrove beside Taleigao cleared the whole Taleigao cluster (20 to 13). For the last build I tried a small dam on the river at Merces (−1 biodiversity, −3 homes). Result: 47 of 57 again, 2 stars. This was a different plan with the exact same total.

**Flood, attempt 3.** I combined what had worked: the attempt-1 opening, the khazan and mangrove beside Taleigao early, the Merces north mangrove, and the small dam. Result: 49 of 57, 86%, **3 stars**. Retrying paid off, but the margin is one home.

**Cyclone and flood 2050, attempt 1.** 27 at risk and 10 builds. The beach tile at the Campal landfall did nothing whatever I hovered. One sea tile offered Breakwater (−2 biodiversity) and took risk from 27 to 19, the best single build of the run (shot optimiser-breakwater-card.jpg). After that each build saved about one home:
- A second breakwater: −1.
- Two pandanus on the Campal beach: −1 each.
- A seawall: −1.
- A mangrove at Ourem: −1.
- A mangrove at Merces NE: −2.
- A khazan: −1.
- The last build: nothing anywhere would change the storm, so I planted a mangrove for biodiversity.

Result: 45 of 55, 82%, **2 stars**. The card said "The wind alone took 5 of the homes lost. In this game pandanus shields the homes within 2 tiles of it." That was useful, but no pandanus tile was left near Campal.

**2050, attempt 2.** I changed the opening:
1. Breakwater, −8.
2. Mangroves on two new pulsing tiles, −1 each.
3. A breakwater on the north Campal sea tile, −2 (better than the −1 spot from attempt 1).
4. Merces NE mangrove, −2.
5. Both pandanus, −1 each.
6. The Ourem mangrove. This one now "doesn't change" because another mangrove covered it, so I wasted it again (my fault this time).
7. A khazan at Merces NE, −1.
8. With biodiversity at +52 I could afford it: a last seawall on a sea tile at Campal, −1. That made 8 lost.

Result: 47 of 55, 85.45%, **3 stars**. Final card: 9 of 9 stars, 105 of 121 homes, +47 biodiversity, Panjim cleared (shot optimiser-final-9of9.jpg).

## 3. Strategies compared and what each gave

| Storm | Plan | Homes saved | Biodiversity | Stars |
|---|---|---|---|---|
| 2030 | Dune (main beach) + pandanus × 2 (pulsing tiles) + mangrove + khazan in Merces | 9/9 | +13 | 3 |
| 2030 | Seawall (main beach) + seawall (south, "doesn't change") + pandanus × 3 | 9/9 | −1 | **1** |
| 2030 | Pandanus (main) + pandanus (south) + dune (north) + khazan + mangrove | 9/9 | +13 | 3 |
| 2040 | Greedy mangrove/khazan on pulsing tiles, one wasted build | 47/57 | +41 | 2 |
| 2040 | Same, but mangrove on a khazan tile, Taleigao side tiles, small dam | 47/57 | +37 | 2 |
| 2040 | Best mix: Taleigao side tiles early, khazan where khazan beats mangrove, small dam last | 49/57 | +36 | 3 |
| 2050 | Breakwater + 2nd breakwater + 2 pandanus + seawall + mangroves/khazan, one build useless | 45/55 | +47 | 2 |
| 2050 | Breakwater + better 2nd breakwater + 2 pandanus + mangroves/khazan + late seawall | 47/55 | +47 | 3 |

Per-tile measurements, from the Homes at risk counter:
- **Main beach, storm 1:** dune −5 = seawall −5 > pandanus −3. On the two other beach tiles only pandanus worked; dune and seawall "don't change". The game calls the seawall "the strongest wall", yet on 2 of 3 beach tiles it did nothing.
- **Wetland:** neither card dominates. Mangrove gave −4 and −9 on some tiles. On another tile mangrove gave −1 where khazan gave −3, and on one tile only khazan counted at all. Mangrove still wins most of the time because it gives +3 biodiversity against khazan's +2.
- **Sea, 2050:** breakwater was the single best build of the run (−8), and its position mattered: −2 on one sea tile, −1 on another.
- **Seawall:** −5 biodiversity for about 1 home. It is only worth it at the very end, once biodiversity is far past +40.

**Exploits and dominant strategies:**
1. **The oracle exploit (key finding).** Hovering each card tells you whether it changes the next storm. Building updates "Homes at risk" at once, and that number matched the losses in every result (0, 10, 8, 10, 8). So you never guess: probe, build, read the counter, repeat. A greedy search wins without understanding the water at all. Add "Try this storm again", which puts you back at the start of that storm's build window with everything you learned, and storms that are deterministic (same plan, same result; the cone never surprised me). 9 of 9 becomes a matter of patience, not judgement.
2. **Biodiversity snowballs.** Nature builds give +2 or +3 each, so biodiversity was already +41 by 2040, past the "+40 by end of 2050" bar. After that the biodiversity rule is dead weight, and seawalls (−5) and breakwaters (−2) cost no stars. The only place biodiversity bites is storm 1, where two seawalls drop you to 1 star.
3. **Storm 1 is solved in 3 builds** (dune + 2 pandanus = 0 at risk, +8 biodiversity). The other 2 builds can go to the flood.
4. **Objectives don't matter for stars.** I got 3 stars in 2040 with the khazan objectives at 1/3 and 1/2, and 3 stars in 2050 with 1/8 khazans and 0/1 mangrove. Some objective tiles pulse with a card that "doesn't change the next storm". Following the pulse is not the winning strategy: twice it cost me a full year.
5. **No single defence always wins.** Mangroves come closest (they did most of the work in 2040 and 2050), but storm 1 needs beach builds and 2050 needs a breakwater. There is no all-nature or all-seawall autopilot. The tile pattern that wins is simply "whatever the oracle says changes the storm, most first".

## 4. What confused me (each with what would have helped)

- **Pulsing tiles and "Objective" tags point at builds that do nothing** (the storm 1 north tile, several flood tiles, the wasted 2038 build). Only pulse tiles where the objective card changes the storm, or say on the objective why it matters if not now.
- **"This doesn't change the next storm" depends on which card is hovered**, but it sits under the whole card list as if it described the tile. Put the note on each card ("no effect on next storm") so you see all three at once.
- **The objective ticks are unclear.** I planted a mangrove on the tile beside the "The Ourem creek" label and the objective stayed 0/1. A khazan on a pulsing tile left "8 khazans at 4 places" at 0/8. Highlight exactly which tiles count.
- **The counts don't line up.** The flood started at "Homes at risk 47", but the result said 57 homes stood in its path. Storm 3 went from 27 to 55. Say that the city grows into the path, or show the path total during the build years.
- **The breakdown doesn't match the counter.** The first breakwater dropped risk by 8, but "What protected" said Breakwater 4. The overlap note explains it, but a list of "homes this build saved" per build would be clearer.
- **The camera moves on its own** two years before a storm (with Maya's prompt), and one drag-pan at 2049 did nothing. My tile positions shifted under me. Pan gently, or let me turn it off.
- **What the spare storm 1 builds do for later storms isn't obvious.** The risk counter only covers the next storm, so pre-building for 2040 is blind. A "next-next storm" risk toggle would help planners.

## 5. Where I was bored

- **Retries make you re-place every build by hand.** The flood retry meant re-placing 10 identical builds to change 2 of them. A "keep my builds, rewind one year" option, or undoing the last build, would remove the grind.
- **Watching the storms.** 30 to 90 s each, plus the replay, every time, including retries. Speed up exists, but I'd want Skip on retries.
- **The late 2050 builds.** Once the counter stopped moving, the last builds were probing tile after tile to find one that saves a single home.

## 6. Where I smiled

- One dune and the counter drops from 9 to 4, including homes far inland by the river. Instant feedback on every build is great.
- A mangrove in Taleigao took 9 homes off in one go.
- The 1-star seawall result: "Your homes held, but nature paid for it." The scoring punished my brute-force plan exactly as the rules said.
- The breakwater at the Campal landfall: −8, a real discovery.
- Squeezing the flood from 2 to 3 stars by 2 homes, and 2050 by exactly the 85% line.

## 7. Bugs and glitches

1. **Major: the idle reset lost my whole run with no warning I saw and no resume.** Steps: Play Panjim, Begin, build 3 times, then no input for about 3 minutes (one of my screenshot calls hung for about 2 minutes). Expected: a "Still there?" warning I could answer, or the run kept. Got: the main menu (with the title text selected by my next drag) and a fresh 2026 on Play. Shot optimiser-idle-reset-to-menu.jpg. The Leave dialog says "Nothing is saved", so there is no way back. The warning may have appeared while my driver call hung, but nothing survived it.
2. **Major (design): objective and pulsing tiles where the objective card has no effect on the next storm.** Steps: 2026, click the pulsing tile north of Sharada Mandir School (Dune is tagged Objective) and hover Dune: "This doesn't change the next storm". Also in the flood (2038), a pulsing tile in St Cruz: a mangrove there gave 17 to 17. Expected: pulses lead to useful builds. Got: a wasted year. Shots optimiser-pulsing-tile-doesnt-change.jpg and optimiser-wasted-pulsing-build.jpg.
3. **Minor/major (UX): the card menu covers map tiles, and one click on a card builds it irreversibly with no confirmation.** Steps: open a tile's card menu, then click what looks like a map tile under the menu. You build that card on the first tile. That's how I got an unplanned khazan in 2038. Expected: clicking the map closes the menu, or a confirm or undo exists. Got: an instant build and a lost year.
4. **Minor: objectives didn't tick.** Steps: 2041, plant a mangrove on the tile beside "The Ourem creek" label: "Plant 1 mangrove at the Ourem creek" stays 0/1. A khazan on a pulsing tile near Fontainhas: "Build 8 khazans at 4 places" stays 0/8 (it went to 1/8 only after a khazan at Merces NE). Expected: a tick, or the tile shown clearly. No shot.
5. **Minor: Escape with no menu open brings up "Leave Panjim?"** (Stay or Leave). Pressing Escape to close a menu that already closed puts one click between you and losing the run.
6. **Minor: a label moved.** After the 3rd build of storm 1, the "Sharada Mandir School" label sat over the dune tile on the beach instead of the school.
7. **Minor: a drag-pan didn't move the camera once** (2049, right after the automatic camera move). A second drag worked.
8. **Minor: the result total (57 or 55 in path) doesn't match the starting "Homes at risk" (47 or 27)**, with no explanation.
9. **Console:** `/console` at the end returned no messages (empty). It was also empty when I checked after the idle reset.

## 8. Fun signals

- **First build:** about 175 s, after about 12 actions (Play, Begin, Help, close, R, two tile probes, card hovers, Dune).
- **Whole run:** about 34 minutes of real-player time (my tally of about 3 s per click, 4 words per second and storm playback). That covers the lost run A (about 3.5 min) and four storm retries. A single no-retry run would be about 12 to 15 minutes.
- **My real choices** (at least two good options with different outcomes): 8.
  1. Storm 1, main beach: dune (−5, +2) vs pandanus (−3, +3) vs seawall (−5, −5). The dune is best.
  2. Storm 1: spend the 2 spare builds on the flood (Merces) or on biodiversity.
  3. Second Merces tile: khazan (−3) vs mangrove (−1).
  4. Follow the flood objectives/pulses, or build on unmarked tiles beside the Taleigao cluster (cleared 7).
  5. Last flood build: small dam (−1 biodiversity, −3 homes) vs khazan.
  6. 2050 landfall: breakwater (−8) vs pandanus vs seawall.
  7. Second breakwater: north Campal tile (−2) vs middle (−1).
  8. Last 2050 build: a seawall for 1 home (only affordable once biodiversity is in surplus) vs a nature build for biodiversity.
- **One defence or tile pattern that always wins?** No single defence. The winning pattern is "probe with the hover note, build where the counter drops most". Mangroves are the near-dominant card in the flood and 2050. Seawalls are dominated until biodiversity is in surplus, then free.
- **Storm results that surprised me:**
  - The seawall on the south beach did literally nothing.
  - 9 of 9 homes saved still got 1 star.
  - One dune saved homes far inland by the river.
  - The 2050 breakwater also cleared the Ourem creek cluster far away.
  - Mangrove vs khazan differed −1 vs −3 on the same tile.
  - Two different flood plans gave exactly 47 of 57.
- **Why I lost the homes I lost, after each storm's result card:**
  - 2030, attempt 1: lost none. The card made the 3 stars clear.
  - 2030, seawall test: lost no homes but lost 2 stars to biodiversity −1. The card ("Seawalls cost nature", water pushed round the ends to the school) made this very clear.
  - 2030, attempt 3: lost none. Clear.
  - 2040, attempt 1: lost 10 in Merces north, Fontainhas and Taleigao, because I wasted a build and found the Taleigao side tiles late. The card gave only the count, not where; the replay map showed it, but not that well.
  - 2040, attempt 2: lost 10, mostly Merces north and Fontainhas. Again only the count.
  - 2040, attempt 3: lost 8 on the Fontainhas and Merces edges, places I couldn't defend. The game didn't say which homes.
  - 2050, attempt 1: lost 10 on the Campal strip. "Wind alone took 5... pandanus within 2 tiles" was clear about the cause, but there was no tile left to act on.
  - 2050, attempt 2: lost 8 on the Campal strip, 6 of them to wind. Clear about wind, silent about the other 2.

## 9. Results

| Storm | Best attempt | Homes saved | Biodiversity | Stars |
|---|---|---|---|---|
| Cyclone 2030 | 1st (and 3rd) | 9 of 9 | +13 | 3 |
| Monsoon flood 2040 | 3rd | 49 of 57 | +36 | 3 |
| Cyclone and flood 2050 | 2nd | 47 of 55 | +47 | 3 |

The final card shows 105 of 121 homes, +47 biodiversity and **9 of 9 stars: Panjim cleared**. Worse attempts along the way: 1 star (2030 with seawalls), 2 stars twice (2040), 2 stars (2050).

## 10. Would I play again? Would I tell a friend?

**Play again:** Yes, once, to find a 2040 plan that scores 3 stars first time and to test an all-mangrove flood. Not more than that: the storms are deterministic and the hover note plus the counter remove the uncertainty, so a second clear is just execution.

**Tell a friend:** Yes. I'd tell them: "Nice little Goa coast puzzle with real places. Open Help for the star rules, hover each card before you build (it tells you whether it does anything), watch Homes at risk drop, and ignore the pulsing tiles. Seawalls cost you stars early, and mangroves are your friend."

## 11. Verdict

A clever, honest little defence puzzle, but the hover note plus the live risk counter turn it into greedy trial and error, and free deterministic retries make 9 of 9 a matter of patience rather than skill.

## Knowledge questions (asked after play)

1. **What does a mangrove do in a storm?** The card says it "slows cyclone surge and waves, and river floods too", and Maya's game rule after the flood said mangroves slowed the water through their roots and sheltered the streets behind them. It is also "a nursery for fish and crabs", which is good for biodiversity (+3).
2. **Why can a seawall be risky?** The card says it costs nature (−5 biodiversity) and cracks with age. My 2030 result card said "a seawall pushes water round its ends: it reached Sharada Mandir School", and two seawalls dropped me to 1 star even with every home saved.
3. **What is a khazan, and what is it for?** The card only says it "holds back river floods" and that "farmers and fishers share it", and it is built on wetland tiles. What a khazan physically is, I don't know: the game never showed me beyond that card.
4. **Where did the 2040 flood come from, and why from there rather than the sea?** Maya's game rule: monsoon rain swells the Mandovi upstream, and the flood comes down the river through the channel at Ribandar into Merces, St Cruz and Taleigao. So it is river water from rain upstream, not the sea; the game gave no reason beyond that.
5. **What helps homes against a cyclone's wind?** Pandanus. Its card says it "shields homes from cyclone waves and wind", and the 2050 result card said "pandanus shields the homes within 2 tiles of it" after the wind alone took 5 (and later 6) of my lost homes.
