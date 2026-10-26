# Playtest diary: the optimiser (Section 34, round 1)

## 1. Who I am and what I wanted

I'm an optimiser. I read every rule, look for the dominant strategy, use every retry the game gives me to compare plans on the same storm, and try to break the scoring. My goal was 9 of 9 stars on "Play Panjim". I skipped the Tutorial and read Help (?) before I built anything.

What I worked out from Help and the cards before playing:
- There are 25 builds and 3 storms (after builds 5, 15 and 25).
- Stars per storm: 1 star at 30% of the homes in the path saved; 2 stars at 55% and no loss of biodiversity; 3 stars at 85% and biodiversity up 6 (up 40 by the end of 2050).
- Seawalls cost -5 biodiversity each. My first hypothesis was that they cap you at 1 star.

## 2. The play, in order

**2026-2030, cyclone at Miramar (first run).** Help said R shows risk, so I pressed it. Three beach tiles pulse. I built a dune in front of Sharada Mandir School (homes at risk went 9 to 4), then a pandanus to the south (4 to 1), then a pandanus to the north (1 to 0). The "Homes at risk" counter changes live after every build, and I loved that. It is the optimiser's oracle. With the two spare builds I put a khazan in Merces (the "get ahead" objective) and a pandanus further south. Result: 3 stars, 9 of 9 homes, +13 biodiversity. It was easy.

**Same cyclone, retry: all seawalls.** "Try this storm again" rewinds to 2026 with no confirmation dialog, which suits me. I built 5 seawalls on the same and nearby beach tiles. Homes at risk dropped 9 to 4 after the first wall and then stayed at 4 for all of them. Result: 1 star, 5 of 9, -25 biodiversity. The card said "The wind alone took 4 of the homes lost. In this game pandanus shields the homes within 2 tiles of it" and "a seawall pushes water round its ends". So walls really are bad here, and the card told me exactly why.

**Same cyclone, retry: all pandanus.** Five pandanus. The front pandanus only took risk from 9 to 6 (the dune took it to 4), and the counter got stuck at 4: homes inland by the inlet still flooded. Result: 2 stars, 5 of 9 (55.5%, just over the line), +15.

**Same cyclone, retry: back to the mix.** 3 stars again, the same numbers to the home. The storms are deterministic, so the retry is a perfect lab.

**2031-2040, monsoon flood, try 1.** 50 homes at risk and 10 builds. Objectives: 1 mangrove in Taleigao, 3 khazans in St Cruz, 2 mangroves + 2 khazans in Merces. On the counter, mangroves looked better than khazans (-5 against -1 to -3, and +3 biodiversity against +2). The Taleigao mangrove gave -11 when it was built late. I got to 15 at risk, then wasted two mangroves on wetland tiles that weren't pulsing (counter: 0 change). Result: 2 stars, 48 of 57 (84.2%), one home short of 3 stars. Annoying. Also confusing: the counter said 15 at risk but only 9 were lost, and the card's total was 57, not the 50 the counter started at.

**Flood, try 2: all mangroves.** Mangroves on every pulsing tile, plus two khazans next to the Taleigao cluster on wetland that wasn't pulsing. Worse: 44 of 57. "What protected" showed khazans pulling their weight (15 homes from 3 khazans). So the counter's per-build deltas misled me.

**Flood, try 3: the mix.** I used try 1's pulsing-tile mix (K, M, K, M, M, M, M, K) plus a khazan beside the Taleigao cluster (counter 15 to 9 on a tile that wasn't pulsing!) and a khazan next to the north Merces mangrove. A toast appeared: "A khazan and mangroves side by side protect each other." That is a hidden synergy rule, and I only saw it by accident. Result: 3 stars, 49 of 57 (86%), +38.

**2041-2050, cyclone and flood, try 1.** 26 at risk. Objective: 8 khazans at 5 places. A dune at the Campal landing changed nothing (26 to 26). Khazans on the 7 pulsing tiles brought it to 13. The last build was a seawall in front of Campal (late seawalls can't age, and I had spare biodiversity: an exploit idea). Result: 2 stars, 43 of 55, +52. The card's breakdown: khazan 28, pandanus 3, dune 1, seawall 1.

**2050, try 2.** I found the Breakwater card: it only appears on near-sea tiles, which I hadn't clicked before. One breakwater in front of Campal: 26 to 18. That was the single biggest build of the game, and the tile doesn't pulse. A second breakwater only gave -1. Pandanus on the Campal beach gave -3. Result: 2 stars, 45 of 55 (82%). Two homes short of 3 stars.

**2050, try 3.** All 7 pulsing khazans + breakwater + 2 pandanus (my "additive" best guess, about 48 expected). Then the game was suddenly back on the main menu (see bugs) and my whole run was gone. I replayed the best plan for all three storms from 2026, at speed. The cyclone and the flood gave exactly the same results again. 2050 try 3: 44 of 55, 2 stars. It was worse than try 2 even though I'd swapped in a khazan that saved 3 the time before. The defences don't simply add up.

**Final card:** 9/9, 49/57, 44/55. 102 of 121 homes saved, +56 biodiversity, 8 of 9 stars, "Panjim cleared".

## 3. Strategies compared and what each gave

| Storm | Plan | Stars | Homes saved | Biodiversity |
|---|---|---|---|---|
| 2030 cyclone | 1 dune + 2 pandanus on the pulsing tiles (+khazan, +pandanus) | 3 | 9/9 | +13 |
| 2030 cyclone | 5 seawalls | 1 | 5/9 | -25 |
| 2030 cyclone | 5 pandanus | 2 | 5/9 | +15 |
| 2040 flood | Mangrove/khazan mix on the pulsing tiles + 2 off-tile mangroves | 2 | 48/57 | +40 |
| 2040 flood | All mangroves on the pulsing tiles + 2 off-tile khazans | 2 | 44/57 | +41 |
| 2040 flood | Mix on the pulsing tiles + khazan beside Taleigao + khazan beside the Merces mangrove | 3 | 49/57 | +38 |
| 2050 storm | 7 khazans (pulsing) + dune + pandanus + seawall | 2 | 43/55 | +52 |
| 2050 storm | Breakwater + 2nd breakwater + 6 khazans + 2 pandanus | 2 | 45/55 | +52 |
| 2050 storm | Breakwater + 7 khazans + 2 pandanus | 2 | 44/55 | +56 |

Findings:
- **No single defence wins.** Every one-card strategy I tried lost stars: all seawall gave 1 star, all pandanus 2 stars, all mangrove a worse flood. The game makes you mix surge, wind and flood defences. That's good design.
- **Seawalls are a trap, and the game punishes them properly.** They cost -5 biodiversity, don't stop wind, and push water round their ends.
- **A nature-only build is almost dominant on biodiversity.** I ended at +56 against a +40 target without trying, so the biodiversity side of the 3-star bar was never binding for me after 2030. Only the 85% homes bar mattered.
- **Partial exploit: the live "Homes at risk" counter plus a free, instant, deterministic retry.** This lets you brute-force each storm: build, read the counter, retry. It got me 3 stars in two storms with little thinking. But the counter is only a guide: in the flood it said 15 and 9 were lost, and in 2050 the per-build deltas didn't add up to the result. So it is not a perfect oracle, and real thinking was still needed for the last few homes.
- **The pulsing tiles are a strong hint but not the optimum.** Two of my best builds weren't on pulsing tiles: the khazan beside Taleigao (-6 on the counter) and the breakwater off Campal (-8 on the counter).
- **The hidden synergy (khazan next to mangroves) matters**, but it only appears as a brief toast after the fact.
- **Exploit idea with no payoff found:** seawalls and breakwaters in the last years, where ageing can't matter and spare biodiversity can be "spent". It is legal, but it saved only 1-2 homes.
- **Was 9/9 reachable?** I believe so (the 2050 storm needs 47/55 and my best was 45), but I didn't find it in three tries.

## 4. What confused me

- **"Homes at risk" against the card's "homes in path".** In the flood, the counter started at 50 but the card said 57. The counter said 15 before the flood but I lost 9. In 2050 the counter said 10-11 and I lost 10-11, but the deltas weren't additive. *What would help:* use the same number on the counter and the card, or label the counter "estimated".
- **Some cards are only offered on tiles I'd never think to click.** Breakwater only shows on near-sea tiles, and nothing pulses there. I found it in storm 3 by luck, and it was the strongest build in that storm. *What would help:* list Breakwater in Help with where it goes, or pulse a sea tile once.
- **The synergy rule is hidden.** "A khazan and mangroves side by side protect each other" flashes for a couple of seconds at the top. *What would help:* put it in Help or in the card text.
- **The R key toggles between two different overlays.** Once it showed a big outline (the next storm's area?) instead of the red homes, and I had to press it again. In 2038 the red heat didn't show until I pressed R, although Help says red shows by itself in the last two years. *What would help:* one clear state, with a label on screen ("Showing: homes the next storm would hit").
- **Clicking an already-selected tile closes its menu**, and the first click after Escape is sometimes ignored. I had to click twice a lot.
- **Clicking a house tile does nothing.** There is no "can't build here" message.
- **Objective counters vanished in the screen text.** For example "Build 2 khazans in Merces" showed no number after one build (seen in /text). On screen it read 1/2, so this is minor.
- **"Pandanus 4" on the 2030 "What protected" card when I had built 3 pandanus** (later 2050 cards matched what I'd built).
- **Hover on a card gives no preview**, and there's no undo. You only learn a card's effect by committing a year. The "This doesn't change the next storm" line under a sea tile's menu was great, but I saw it only once and didn't know which card it referred to.

## 5. Where I was bored

- Watching the same storm replay at normal speed while comparing plans. Speed up helps, but the replay step ("Replay / Skip") still runs each time.
- After the reset bug, replaying 20+ builds I already knew just to reach the final card.
- Probing tiles one by one to find which ones take which cards.

## 6. Where I smiled

- The first time the counter went 9, 4, 1, 0 as I built. That was instant, readable feedback.
- The seawall card: "a seawall pushes water round its ends: it reached Sharada Mandir School...". The game explained exactly why my exploit failed.
- 48 of 57, missing 3 stars by one home, then finding the off-tile khazan that took the Taleigao cluster from red to clear.
- The breakwater taking 8 homes off in one build.
- "Try this storm again" keeping the earlier storms. It's a real lab for an optimiser.

## 7. Bugs and glitches

1. **The game resets to the main menu on its own, and the run is lost. Blocker for a real player.**
   - Steps: play well into a run (mine was at 2049, the last build of the last storm, after about 25 minutes), then leave the game alone for a while. I had a long pause. The same thing happened right at the start: I clicked Play Panjim, the intro card showed, and a few seconds later it was back on the main menu without my touching it.
   - Screenshots: optimiser-reset-to-menu.jpg (earlier copy: 003-begin).
   - Expected: the run stays, or there is a Continue button. Got: the menu, and Play Panjim starts a fresh 2026. All progress (8 stars so far) was gone. Nothing in the console.
2. **The result card is drawn under the map. Minor.** On the 2050 result, the card showed see-through with 3D map tiles and buildings drawn on top of it for a second or two, then it fixed itself. Screenshot: optimiser-card-overdrawn-glitch.jpg. Expected: the card on top. Got: the map over the card.
3. **The counter disagrees with the result. Major for the optimiser.** "Homes at risk" was 50 at the start of the flood; the card said 57 in the path. The counter said 15 before the flood; 9 were lost. Expected: the same count. Screenshots: optimiser-flood-try1-2stars.jpg.
4. **The biodiversity counter didn't update after the 5th build of 2030. Minor.** It stayed at +10 after a +3 pandanus; the card then said +13. Steps: make the 5th build (the cyclone starts at once) and look at the counter during the storm.
5. **The screen text shows ★★★ on every result card, whatever the stars. Minor, accessibility.** The visual showed 1 or 2 stars, but the page text read "★★★". A screen reader would probably say 3 stars for a 1-star result.
6. **Clicks get swallowed. Minor.** A second click on the selected tile closes its menu, and the first click after pressing Escape is often ignored, so I had to click twice. Steps: open a tile menu, press Escape, click another tile.
7. **Maya's "Got it" tips vanish on their own. Minor.** Sometimes they were gone before I could click Got it, sometimes within about a second.
8. **The camera moves on its own between some builds** in the flood and 2050 storms (it pans to the area at risk). That's nice for a person, but it means the same tile isn't under the same pixel. Minor.
9. Console: /console showed no errors or warnings at the end of the session (empty list).

## 8. Fun signals

- **First build:** about 155 seconds in, about 8 actions (Play, Play again after the reset, Begin, ?, close Help, R, tile, Dune). Reading the intro and Help took most of that.
- **Whole run:** about 33 minutes of player time. That's about 26 minutes for the first pass with 3 tries of each storm, then about 7 minutes replaying the known best plan after the reset bug. 12 storm plays in total.
- **Real choices (at least two good options leading to different outcomes): about 7.**
  1. Dune or pandanus on the front Miramar tile (dune 9 to 4, pandanus 9 to 6).
  2. What to do with spare builds before a storm: get ahead on the next storm (a khazan in Merces) or add more cover now.
  3. Mangrove or khazan on each flood wetland tile (khazan beside mangroves gives a synergy; mangrove gives more biodiversity).
  4. Pulsing tiles or off-pulse tiles next to the red cluster (the Taleigao khazan off the pulse was a top build).
  5. In 2050: Campal (sea/beach) or the river (khazans). You can't fully cover both.
  6. Breakwater, seawall or pandanus at Campal.
  7. Spending surplus biodiversity on hard defences late, or staying all nature.
- **Did one defence or tile pattern always win?** No single defence did. "Build on the pulsing tiles with the matching nature card" got 3 stars in 2030 and nearly in 2040. It's the closest thing to a cheap trick, but it isn't enough on its own in 2040 or 2050.
- **Storm results that surprised me:**
  - All pandanus lost the same 4 homes as all seawall (but kept 2 stars thanks to biodiversity).
  - All mangrove did worse in the flood than the mix, although mangroves had the bigger per-build counter drops.
  - In the flood, the counter predicted 15 lost and only 9 were lost.
  - The 2050 plan I thought was best (try 3) did worse than try 2.
  - A dune at the Campal landing did nothing at all.
- **Why I lost homes after each storm's cards, and whether the game made it clear:**
  - 2030 (best plan): I lost none. With seawalls, the card was clear: wind took 4, and water went round the wall ends.
  - 2040: I lost 8-9 homes in Fontainhas, Merces north and Taleigao that I had no good tile for. The card did not say why (no "wind took" or "water went round" line for the flood), but the red heat with R showed where.
  - 2050: I lost 10-12 homes, mostly in Campal (surge and wind). The card said "The wind alone took 4 (later 1)", and the pandanus rule helped. For the surge losses, nothing said which defence would have stopped them.

## 9. Results

- Cyclone 2030: 3 stars, 9 of 9 homes saved.
- Monsoon flood 2040: 3 stars, 49 of 57 homes saved (best try; others 48 and 44, both 2 stars).
- Cyclone and flood 2050: 2 stars, 44 of 55 homes saved in the final run (best try was 45).
- Final: 8 of 9 stars, 102 of 121 homes, +56 biodiversity. **Panjim cleared.**

## 10. Would I play again? Would I tell a friend?

**Play again: yes.** 2050 is two homes short of 9/9, the storms are deterministic, and I now know about the breakwater and the synergy. That's a solvable puzzle and I want to solve it, as long as the game stops throwing me back to the menu.

**Tell a friend: yes.** I'd say: "It's a short puzzle about defending Panjim. The counter tells you how many homes are at risk after every build, and you can retry any storm. Don't build seawalls. Read Help, try the sea tiles (there's a breakwater), and put khazans next to mangroves. 9 stars is hard."

## 11. Verdict in one line

A good optimiser's puzzle with honest feedback and no single dominant defence, let down by a counter that doesn't match the result, hidden rules (breakwater, synergy), and a reset to the menu that wipes your run.

## Knowledge questions (asked after play)

1. **What does a mangrove do in a storm?** The card said it "protects against waves and surge in both storms". Maya said mangroves slow the surge before it reaches the houses, and that they "slowed the water through their roots and sheltered the streets behind them". It also said mangroves are a nursery for fish and crabs, which is good for biodiversity.
2. **Why can a seawall be risky?** It costs biodiversity (nothing lives on it) and it cracks with age: it breaks in its second cyclone, or in its next one once it is 10 years old. It also pushes water round its ends. Maya said it holds no water, and if a storm is bigger than the wall, it fails all at once.
3. **What is a khazan, and what is it for?** Maya said khazans are Goa's coastal wetlands, reclaimed from marsh, where bunds keep out the tide and farmers and fishers share the land. In the game a khazan holds back river floods by keeping the floodwater in its fields, and mangroves on its outer bund act as wave breakers.
4. **Where did the 2040 flood come from, and why from there rather than the sea?** It came down the Mandovi, through the channel at Ribandar, into Merces, St Cruz and Taleigao. It was a monsoon flood, but why it came from the river rather than the sea: I don't know, the game never said.
5. **What helps homes against a cyclone's wind?** Pandanus: the result card said pandanus shields the homes within 2 tiles of it. Seawalls didn't help against wind: in my all-seawall try, the wind alone took 4 homes.
