# Playtest diary: keyboard-only player with deuteranopia

## 1. Who I am and what I wanted

I play with the keyboard only, because a motor impairment means I can't use a mouse. I also have deuteranopia (red-green colour blindness). I wanted to play the Tutorial and then one whole run of "Play Panjim" with Tab, Shift+Tab, Enter, Space, Escape, the arrow keys and any shortcuts the game told me about. I was watching for four things: whether I could always see where focus was, whether I could reach everything, whether any key got me stuck, and whether red against green, or hue alone, ever carried meaning I couldn't read.

Short version: I could not pick a map tile with the keyboard, so I couldn't build without a mouse. I recorded that as a blocker and then used one mouse click per build, on the tile only. Everything else I did by keyboard: picking cards, dialogs, result cards, the quest list, the menu, retrying and leaving. In total I clicked about 40 times: 7 in the Tutorial and about 33 in Panjim. Some of those were missed clicks on tiles that couldn't be built on.

## 2. The play, in order

**Main menu.** My first Tab went to the "Board render, map data © OpenStreetMap" link in the top right, the second to Tutorial. The focus ring is clear.

**Tutorial intro dialog ("How this works").** Focus did not start on Begin, and I could see no focus on the dialog at all. Tab moved focus *out of* the dialog, to the "?" button behind it. It took 8 key presses to find Begin: Menu, then an invisible stop, then ?, then Begin. One Enter on the invisible stop did nothing.

**Tutorial board, 2026.** Maya's tip told me to try "the glowing card and tiles". Pressing Tab made her speech bubble vanish. The Tab order on the board is only 4 stops: Maya's "−", Menu, an invisible stop (the map, I think: "+" zoomed it when it was focused), and "?". The cards and tiles are not in it. On the invisible stop, arrow keys, Enter, Space and "1" did nothing visible, and "+" zoomed in. The How to play page says "Click a tile and pick a card" and lists no keys for tiles. The menu lists R (risk), M (Maya) and S (sound). **Blocker. I used my one allowed mouse click on the glowing beach tile.** After that click the card list opened with focus on the first card, and Tab, Enter and Escape all worked in it. First build was a Dune, at about 56 key presses and about 3 minutes.
- 2027 Pandanus (mouse click on the tile, Tab, Enter). 2028 Breakwater. 2029 Seawall. Each build needed a mouse click on the tile.
- **Cyclone 2029: 3 stars, 22 of 22 saved.** The storm was over before I'd looked properly. "On to 2030" had focus.
- 2030 Mangrove, 2031 Khazan, 2032 Small dam. **River flood 2032: 3 stars, 26 of 26.** "See what you tried" led to the "Play Panjim" button, which had focus.

**Panjim, 2026–2030.**
- 2026: the intro dialog had the same problem: Tab first went to "?", then the quest card's "−", then a quest item, and only then Begin.
- I learned that a quest item in the bottom-right card is a tab stop, and Enter on it **pans the camera to that place**. That was the most useful keyboard feature I found. It still doesn't select a tile.
- 2026 Dune and 2027–28 two Pandanus at Sharada Mandir School, then 2029 a Khazan in Merces (a "get ahead" quest). In 2030 I put a Pandanus on the beach. Homes at risk went 9 → 4 → 3 → 0.
- **Cyclone 2030: 3 stars, 9 of 9 saved.** The replay panel's legend is "■ hit ■ wet, standing ■ defence", and its three squares looked almost the same to me.

**Panjim, 2031–2040 (monsoon flood).** "Watch the red." A quest asked for 1 mangrove in Taleigao, 3 khazans in St Cruz, 2 mangroves and 2 khazans in Merces.
- 2031–32 two mangroves in Merces, 2033–34 two khazans in Merces, 2035–37 three khazans. One of those counted for Taleigao rather than St Cruz, and homes at risk dropped 29 → 20 on it.
- 2038: Enter on the St Cruz quest item panned to the last glowing tile, where I built a khazan. Then I couldn't find a tile for the Taleigao mangrove. One tile I tried said "This doesn't change the next storm", so I pressed Escape, which closed the card list cleanly. A river tile offered a Small dam with no warning, so I built it (15 → 12).
- 2040: a second Small dam ("Last call! 12 homes").
- **Monsoon flood 2040: 3 stars, 50 of 57 saved, 7 lost.**

**Panjim, 2041–2050 (cyclone and flood together).** The quests asked for "4 mangroves at 3 places, shown on the map" and "6 khazans at 4 places, shown on the map". I followed the glowing tiles: mangroves and khazans around Altinho, the Mandovi waterfront and Merces. Homes at risk went 38 → 20.
- Maya twice said Campal was most at risk. Every beach and water tile I tried near Campal said "This doesn't change the next storm", and two clicks did nothing at all.
- Last build (2050): a Seawall in the sea west of Campal.
- **Cyclone and flood 2050: 2 stars, 39 of 58 saved, 19 lost (around Campal).**

**Final card:** "98 of 124 homes saved, 8 of 9 stars, Panjim cleared." Focus was on "Play again". Tab then Enter on "Back to the menu" worked.

## 3. Keyboard: what worked, what didn't

**Worked well**
- The focus ring on normal buttons is a clear dark double outline, easy to see on the cream panels (menu buttons, Begin, result buttons, quest items).
- The default button usually has focus when a result card opens ("On to 2030", "See what protected your city", "Next: …", "Play again"). Enter alone carries you through every result screen.
- In the card list, focus starts on the first card, Tab and Shift+Tab move between cards, Enter builds and Escape closes the list. The card list itself is fully keyboard-friendly.
- Shortcuts R, M and S are shown in the menu. R (show risk) works from anywhere and adds **hatching**, not just colour. See `keyboard-risk-hatching.jpg`.
- "Home" re-centres the map and "+" zooms.
- An Enter on a quest item pans the camera to that place (`keyboard-quest-enter-pans.jpg`). It's very helpful, but nothing says it does this.
- Escape closes the menu and returns focus to the Menu button. It also closes the card list.

**Didn't work**
1. **BLOCKER: map tiles can't be selected by keyboard.** Steps: start the Tutorial and Begin, then Tab through the board. The only stops are Maya's "−", Menu, an invisible stop (the map) and "?". On the map stop, arrows, Enter and Space do nothing, and "+", "-" and Home only move the camera. No tile cursor ever appears, and How to play only says "Click a tile". Every one of my 32 builds needed a mouse click. Screenshot `keyboard-invisible-map-focus.jpg`.
2. **Major: dialogs don't take or hold focus.** When the "How this works" / "Panjim" intro dialog opens, focus is not on Begin, and Tab goes to buttons *behind* the dialog ("?", Menu, the quest "−", quest items). Begin is about the 4th to 8th Tab. Screenshot `keyboard-focus-behind-dialog.jpg`.
3. **Major: Escape doesn't close How to play unless focus is inside it.** I opened How to play with Enter on "?" and pressed Escape: nothing happened. Tab then went to Maya's "−" and Menu *behind* the dialog. I had to Tab 5 times to reach the OSM link inside the dialog before Escape worked. The × close button was never a stop I could see. Screenshot `keyboard-escape-ignored.jpg`.
4. **Major: the map stop has no visible focus.** One Tab stop shows nothing at all, so I kept losing track of where I was.
5. **Minor: Tab dismisses Maya's tip.** Her speech bubble disappears on the first key press, sometimes before I'd read it. The same goes for a mouse click: my first click on a tile while a tip showed only closed the tip.
6. **Minor: focused and "glowing" (suggested) cards look almost the same.** Both get a blue fill and outline, so with two highlighted cards I couldn't tell which one Enter would build until I pressed Tab. Screenshot `keyboard-focus-vs-glow-cards.jpg`.
7. **Minor: arrow keys don't move between cards.** Only Tab does. I expected arrows to work in a list.
8. **Minor: the main menu's first Tab stop is the attribution link,** before Tutorial.

I found no keyboard traps: I could always get out with Tab or Escape. But because dialogs don't contain focus, I often ended up working buttons I couldn't see properly.

## 4. Colour: what relied on red vs green or hue alone

- **"Watch the red." / "The red shows where the flood will hit."** Maya and the How to play page ("red marks the homes it would flood") use **red** as the instruction. To me that red looks like the same dark olive and khaki as the land. It was only usable because the at-risk tiles are also **hatched with diagonal stripes**. Without the hatching I couldn't follow the hint. Screenshots `keyboard-colour-watch-the-red.jpg` and `keyboard-colour-red-shows.jpg`.
- **Replay legend "■ hit ■ wet, standing ■ defence".** The three squares look nearly identical to me: two near-black and one dark grey. In the replay I couldn't tell hit homes from defence tiles by colour. The words above it ("7 homes hit, 50 homes wet but standing") carried the meaning instead. Screenshot `keyboard-colour-replay-legend.jpg`.
- **Fine for me:**
  - The forecast maps use dark, mid and pale steps ("Most likely / Likely / Possible"), which I can read as lightness.
  - "Area to protect" is a dashed outline, and "Where they meet" is blue stripes.
  - Stars are filled versus outlined.
  - Toggles in the menu use filled versus hollow dots.
  - "Stood" and "Damaged" are text badges, with a solid or dashed border.
  - Homes lost turn black, which I could see.
- The Biodiversity bar and the "+2 / −5" leaf badges on cards use a sign as well as colour, which is good.

## 5. What confused me

- How to build with no mouse. The game never says.
- **"This doesn't change the next storm"** showed up on two glowing quest tiles in 2041–2043 (the khazans near Altinho), yet homes at risk still fell by 1 each time. Is the quest telling me to do something useless?
- Campal was "most at risk", but every beach and water tile next to it said "doesn't change the next storm", and some tiles did nothing at all when clicked. Nothing told me *why* a tile can't help, or which tile would.
- Final storm card: "Lost in earlier storms: 5", but the 2040 flood said 7 homes lost.
- 3 stars in 2040 even though 7 homes were lost. The rule (85% saved) only appears on the last card.
- The tutorial card says Mangrove "Protects against waves and surge", but the side panel says it helps in river floods too, and it saved 13 in the flood.
- Map labels overlapped ("Taleigao" on top of "Mandovi waterfront").

## 6. Where I was bored

- Hunting through Tab stops behind every dialog to find Begin.
- 2041–2050: ten builds of mangrove, khazan, mangrove, khazan on glowing tiles. The quest more or less played itself, and every build cost me a mouse click.

## 7. Where I smiled

- The birds (blue and white) flying over the wetlands after I planted mangroves.
- Maya's facts with "Source" links (mangroves cut wave height by 13–66%; Lobo 2020 on khazan bunds).
- Enter on a quest item pans the camera there. That's a real keyboard win.
- "Your city came through." with three stars, and the "What protected your homes" bars.

## 8. Bugs and glitches

1. **Blocker: no keyboard way to select a map tile.** Steps: start the Tutorial and Begin, then try Tab, arrows, Enter or Space. Expected: a tile cursor that arrow keys move and Enter opens. Got: nothing, so I needed a mouse click to build every year. Shot: `keyboard-invisible-map-focus.jpg`.
2. **Major: intro dialogs don't trap focus and don't focus Begin.** Steps: menu, Tutorial, Enter, then Tab. Expected: focus on Begin and staying inside the dialog. Got: focus goes to "?", Menu and the quest buttons behind the dialog. Shot: `keyboard-focus-behind-dialog.jpg`.
3. **Major: Escape doesn't close How to play when it's opened by keyboard.** Steps: Tab to "?", Enter, then Escape. Expected: the dialog closes. Got: nothing, and focus stays on "?" behind it. Escape only works after Tabbing to a link inside. Shot: `keyboard-escape-ignored.jpg`.
4. **Major (colour): the replay legend's three squares are colour-only** and look the same with deuteranopia. Shot: `keyboard-colour-replay-legend.jpg`.
5. **Minor: no visible focus on the map's tab stop.** Steps: on the board, Tab past Menu. Expected: a visible ring. Got: nothing. Shot: `keyboard-invisible-map-focus.jpg`.
6. **Minor: any key press or click dismisses Maya's tip,** and when a tip is showing, the first click on the map is used up dismissing it. Steps: Begin, then press Tab. Shot: `keyboard-focus-behind-dialog.jpg` and the board shots.
7. **Minor: focused and suggested (glowing) cards look alike.** Steps: 2027 in the Tutorial, click a beach tile. Expected: a distinct focus style. Got: two blue-filled cards. Shot: `keyboard-focus-vs-glow-cards.jpg`.
8. **Minor: clicking a non-buildable tile gives no feedback at all** (for example, beach tiles near Campal in 2048–2049). Expected: a "can't build here" message. Got: silence.
9. **Minor: quest-glowing tiles say "This doesn't change the next storm"** (Altinho khazans in 2042–2043) while homes at risk still drop.
10. **Minor: number mismatch.** The 2050 result says "Lost in earlier storms: 5", but the 2040 result said 7 lost. Shot: the final result card (not copied).
11. **Cosmetic: map labels overlap** ("Taleigao" and "Mandovi waterfront" in 2049).
12. **Minor:** the first cyclone in the Tutorial played out before I could watch it. My wait after the build was only 3 seconds.

/console at the end: **no messages** (empty).

## 9. Fun signals

- **First build:** at about **3 minutes and about 56 key presses**, but only by using a mouse click on the tile. Keyboard-only, I could never have made a first build.
- **Whole run:** about **6 minutes for the Tutorial and about 13 minutes for Panjim, so about 19 minutes**. That's about 180 key presses × 1.5 s, about 3,100 words read and about 1.5 minutes of storms, plus the time to find each tile and click.
- **Real choices** (moments with at least two good options leading to different outcomes): **5**
  1. 2029: build ahead for the monsoon (khazan in Merces) or more cyclone defence, with 0 homes at risk.
  2. 2030: Pandanus or Dune on the beach before the cyclone (wind versus waves).
  3. 2039: chase the Taleigao mangrove quest or take a Small dam on the river (which costs nature).
  4. 2048: follow the remaining quest tiles or try to defend Campal on the beach.
  5. 2050 last build: Seawall (strongest, −5) or Breakwater (−2) in the sea at Campal.
  Most other builds weren't choices: I clicked the glowing tile and took the card the quest named.
- **Results that surprised me:** 3 stars in 2040 with 7 homes lost, and the 2050 Seawall saving only 1 home.
- **Why I lost the homes I lost:**
  - *Cyclone 2030 (0 lost):* nothing was lost. The game was clear: "Dunes took the first push of the waves".
  - *Monsoon flood 2040 (7 lost):* I think I never covered Taleigao (the mangrove quest stayed 0/1) and the city centre. The result card only lists what *protected* homes. It never says where or why the 7 were lost, so **no, it wasn't clear**.
  - *Cyclone and flood 2050 (19 lost):* Campal. Maya warned me twice, but I couldn't find a tile that changed the storm there (beach and water tiles said "doesn't change the next storm"), and the Seawall saved just 1. The game made it clear *that* Campal was at risk, but **not what would have saved it**.

## 10. Results

| Storm | Stars | Homes saved |
|---|---|---|
| Tutorial cyclone 2029 | ★★★ | 22 of 22 |
| Tutorial river flood 2032 | ★★★ | 26 of 26 |
| Panjim cyclone 2030 | ★★★ | 9 of 9 |
| Panjim monsoon flood 2040 | ★★★ | 50 of 57 |
| Panjim cyclone and flood 2050 | ★★☆ | 39 of 58 |
| **Panjim final** | **8 of 9 stars** | **98 of 124** — **Panjim cleared** |

Biodiversity was +46 at the end of 2050.

## 11. Would I play again? Would I tell a friend?

**Play again: no, not until tiles work from the keyboard.** I needed a mouse click for every one of 32 builds, which is exactly what I can't do. The rest of the game (cards, dialogs, results, quests) almost works with keys, and the story of dunes, mangroves and khazans is lovely.

**Tell a friend: yes, but only one who uses a mouse.** I'd tell them: "It's a calm, pretty strategy game about real Goa. Follow Maya's glowing tiles, plant mangroves and khazans, and watch the birds come back. Keep an eye on Campal at the end." To a keyboard-only friend I'd say: "Not yet, you can't place anything."

## 12. Verdict

A warm, readable game with good colour-blind safeguards (hatching, patterns, words), but keyboard-only players are blocked at the first build: no map tile can be selected without a mouse.

## Knowledge questions (asked after play)

1. **What does a mangrove do in a storm?** It slows the flow of the water, which lowers a storm's surge and cuts the height of its waves. In this game it helps in both kinds of storm. Maya said studies found 100 m of mangroves cut wave height by 13% to 66%, mostly for waves under 70 cm.
2. **Why can a seawall be risky?** In this game it costs 5 biodiversity, the most of any defence, and it pushes water to its ends. It also cracks with age and breaks in its 2nd cyclone or once it is 10 years old.
3. **What is a khazan, and what is it for?** It is Goa's old farmed coastal wetland, reclaimed from marsh: a bund and a sluice gate round paddy fields and fish ponds, shared by farmers and fishers. It holds back river floods by keeping the floodwater in its fields, so nearby homes stay drier, and it adds to biodiversity.
4. **Where did the 2040 flood come from, and why from there rather than the sea?** It came down the Mandovi, through the channel at Ribandar, into Merces, St Cruz and Taleigao. It was called a monsoon (river) flood, but why it came from the river rather than the sea: I don't know, the game never explained it.
5. **What helps homes against a cyclone's wind?** Pandanus (screw pine): a row of it shelters what is behind it from the wind. The game says it is the only defence that shields homes from a cyclone's wind.
