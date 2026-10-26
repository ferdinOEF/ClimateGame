# Playtest diary: keyboard only, deuteranopia

Screenshots are in `shots/` (named `keyboard-*.jpg`). Time estimates use about 1.5 s per key press plus reading at 4 words a second. My own thinking time is not counted.

## 1. Who I am and what I wanted

I play with the keyboard only (motor impairment, no mouse) and I have deuteranopia, so reds and greens look like the same muddy olive or brown to me. I wanted to get through the Tutorial and one whole run of "Play Panjim" without touching a mouse. I was also checking two things: can I always see where keyboard focus is, and does any meaning depend only on colour? I never needed the emergency mouse click. Everything I did, I did with keys.

## 2. The play, in order

**Menu.** Tab reaches "Tutorial", "Play Panjim" and "Facts & sources". The focus ring is a thick dark-blue outline and easy to see. Enter started the Tutorial.

**Tutorial, first attempt (2026 to 2027).** A "How this works" dialog opened with "Begin" already focused. Enter took me to the board. I tabbed onto the map and moved a white hex cursor with the arrow keys. Enter on a beach tile opened a card picker ("In this game"): Dune, Pandanus, Seawall, plus "Not here: …". I pressed Enter on Dune and it was built. That was my **first build: about 50 s and 14 key presses**. In year 2 I opened the picker on the next beach tile and pressed ArrowDown twice; Dune and Pandanus then both looked highlighted. Tab put a clear ring on Pandanus. I pressed Enter and **the game dropped me straight back on the main menu**, with no warning, and the tutorial progress was gone (see bugs).

**Tutorial, second attempt.**
- 2026: Dune on the beach.
- 2027: Pandanus.
- 2028: Breakwater on an "Open sea" tile.
- 2029: Seawall.
- **Tutorial cyclone:** 3 stars, 21 of 22 homes saved. The result card listed Dune 4, Pandanus 6, Breakwater 4, Seawall 7.
- 2030 to 2032: Mangrove, Khazan, Small dam.
- **Tutorial river flood:** 3 stars, 23 of 25 saved. The card said Mangrove 12, Khazan 5, Small dam 6, and each cyclone defence 0 ("A cyclone defence; this was a river flood").
- "You tried 7 of 7 defences" came next, and its "Play Panjim" button was reachable by keyboard.

**Panjim, years 2026 to 2030.**
- Objective: protect Sharada Mandir School with 1 dune and 2 pandanus. I zoomed with `+` and `-`, which the game supports.
- Builds: Dune, Pandanus, Pandanus. That completed the objective.
- Then a "get ahead" objective: a khazan in Merces. Getting the cursor from Miramar to Merces took about 30 key presses.
- 2030: a Mangrove in Merces. Then the cyclone hit.
- **Cyclone 2030:** 3 stars, 9 of 9 homes saved, +13 biodiversity. "What protected your homes": Dune 5, Pandanus 4.

**Years 2031 to 2040, monsoon flood.**
- Objectives: 1 mangrove in Taleigao, 3 khazans in St Cruz, 2 mangroves and 2 khazans in Merces.
- I followed them tile by tile with arrows, then Enter, then Tab to the second card, then Enter.
- At 2039 Maya said "The red shows where the flood will hit". I can't see red, though I did notice hatched tiles.
- 2040 was "Last call!", and my last build was a small dam on the river by Fontainhas.
- **Flood 2040:** 3 stars, 52 of 57 saved. Khazan 22, Mangrove 21, Small dam 4.

**Years 2041 to 2050, cyclone and flood.**
- Objectives: 2 mangroves at Taleigao and the Ourem creek, and 7 khazans at 5 places "shown on the map".
- I did both mangroves and 6 of the 7 khazans.
- With 2 builds left, Maya warned "Campal is most at risk". I built a Seawall on a sea tile off Campal. Two other sea tiles and a beach tile said "This doesn't change the next storm".
- My last build was a Pandanus on the Campal beach, instead of the 7th khazan.
- **Cyclone and flood 2050:** 2 stars, 45 of 58 saved. "The wind alone took 4 of the homes lost." Khazan 15, Mangrove 15, Seawall 4, Pandanus 3.

**Final card:** "Panjim, 2026 to 2050": 106 of 124 homes saved, +50 biodiversity, **8 of 9 stars, Panjim cleared**. "Play again" was focused; Tab went to "Back to the menu", and Enter on it returned me to the menu.

## 3. Keyboard: what worked, what didn't

**Worked**
- **Menu, dialogs and result cards.** The primary button always had focus already (Begin, On to 2031, See what protected your city, Next: the flood in 2040, Play again), so most of the run was simply Enter, Enter. The focus ring is thick and blue, and easy to see (shot `keyboard-result-2030-focus.jpg`).
- **Map cursor.** Arrow keys move a white hex outline, and Enter opens the card picker on that tile. When zoomed in, the cursor is clear.
- **Card picker.** Tab and Shift+Tab step through the cards, and the focused card gets a thick blue double outline. Enter builds; Escape closes the picker without building.
- **Help.** "?" is reachable by Tab, shows a tooltip ("Opens How to play.") and opens How to play; Escape closes it.
- **Zoom and risk keys.** `+` and `-` zoom. `r` toggles a risk view (it is in How to play).
- **Leaving.** "Back to the menu" on the final card is reachable and works.
- **No traps.** I never got stuck anywhere.

**Didn't work, or was hard**
1. **Unexpected exit from the Tutorial (major).**
   - Steps: Tutorial, Begin, build a Dune; in year 2 open the picker on the next beach tile, press ArrowDown twice, Tab (the ring lands on Pandanus), then Enter.
   - Result: main menu, progress lost.
   - On the second try, pressing Tab then Enter on the same card built it normally.
   - Shots: `keyboard-picker-two-highlighted.jpg` and `keyboard-tutorial-kicked-to-menu.jpg`.
2. **Two cards look selected at once.** After ArrowDown in the picker, Dune had the focus ring while Pandanus had the filled highlight, which I think is the tutorial "glow" (shot `keyboard-picker-two-highlighted.jpg`). Focus and the tutorial suggestion look almost the same, so I could not tell which one Enter would pick.
3. **Focus leaks out of the open picker.** Tabbing past the last card (Seawall) moved focus to the objective panel's "–" button in the bottom right, while the picker stayed open (shot `keyboard-focus-leaves-picker.jpg`). Pressing Enter there would collapse the panel, not build. Focus should either wrap inside the picker or close it.
4. **Map cursor is tiny when zoomed out.** At full zoom-out the cursor is a hairline hex about 20 px wide, and it disappears against pale tiles (shot `keyboard-cursor-tiny-zoomed-out.jpg`). I had to zoom in every time I wanted to check where I was.
5. **Long key paths across the map.**
   - Moving to an objective tile across the city took 10 to 30 arrow presses.
   - I found no "jump to next objective tile" or "jump to at-risk area" key.
   - Up and Down on the hex grid zig-zag, so I often overshot by one tile and had to correct.
   - Near the map edge the camera stops panning and the cursor walks off centre.
6. **Camera jumps away from the cursor.** After my 23rd build the camera jumped to Campal to show Maya's warning, but the cursor stayed where it had been, off screen. I had to press an arrow key to find it again.
7. **"Speed up" during storms.** While a storm played, Tab cycled through "?", the menu button, Maya's small "–" button and the OpenStreetMap credit. I never saw the ring land on "Speed up", so I could not confirm it is reachable by keyboard. Maya's "–" focus ring is also very small (shot p131, not copied).
8. **Picking "Back to the menu" mid-run.** I didn't try leaving mid-run through the ☰ menu, because I didn't want to lose the run. I only know that ☰ is reachable and shows a "Menu" tooltip.

## 4. Colour: anything that relied on red vs green or hue alone

1. **"The red shows where the flood/storm will hit" (major for me).** Maya said this twice (2039 and 2049), and How to play says "red marks the homes it would flood". With deuteranopia I see no red anywhere. What I did see was dark diagonal hatching on some home tiles near Campal and Taleigao (shot `keyboard-maya-says-red.jpg`), so the pattern does carry the meaning. The words "the red" do not match what I see; "the striped tiles" would.
2. **Forecast legend: "Most likely / Likely / Possible".** These are three shades of brown-olive, from dark to medium to pale (shot `keyboard-forecast-legend.jpg`). I could tell them apart by lightness, but only just between the dark and medium shades on the small preview map. The dashed "Area to protect" line and the blue-and-white hatched "Where they meet" stand out well.
3. **Replay legend: "dark: lost / pale: wet, standing / gold: defence".** All three swatches looked like near-black squares to me. The words "dark", "pale" and "gold" saved it, because those name lightness rather than hue.
4. **Stars.** Earned stars are filled and the missing one is an outline (shot `keyboard-result-2050-stars.jpg`), so I can read them by shape. Fine.
5. **Good and bad biodiversity.** It is shown as signed numbers ("+3" and "−5" on the cards; "+50" in the bar), so it does not depend on colour. Fine.
6. **Buttons.** The primary button is yellow-gold and the secondary is pale blue; both have text. Fine.
7. **Map terrain.** Sea is grey or blue, land is olive and beach is yellow. Beach and land are close in hue for me but differ in lightness. "Where they meet" uses blue and white stripes. Fine.
8. **Objective tiles.** These are marked with a thick pale ring, not a colour fill, so they were usable. They are faint when zoomed out.

## 5. What confused me

- The Tutorial suddenly sent me back to the main menu (bug 1).
- Two picker cards highlighted at once: I couldn't tell the tutorial's suggestion from my focus.
- What `r` (Show risk) changes. When I toggled it I saw little or no difference: thin rings around some homes, maybe. With "red" being invisible to me, the risk view gave me almost nothing.
- I first thought "This doesn't change the next storm" was about the tile. It actually depends on the focused card: on the Campal beach, Dune and Seawall said it, but Pandanus didn't. This is a good hint, but it is only a line of small text under the cards, and it's easy to miss.
- Which tile the cursor is on after the camera jumps.
- The 2050 objective said "7 khazans at 5 places, shown on the map". The ringed places were spread far apart and hard to find when zoomed out.
- The text read by the page for the 2050 result shows "★★★" even though only 2 stars are filled on screen (bug 5).

## 6. Where I was bored

- Years 2031 to 2048 in Panjim. They were mostly: find the ringed tile with 5 to 30 arrow presses, Enter, Tab, Enter. The objectives make the right answer obvious, so it felt like following a checklist rather than deciding.
- Storm replays when I already knew the result. The "Skip" and "Speed up" buttons exist, but I wasn't sure I could reach "Speed up" by keyboard.

## 7. Where I smiled

- Maya after the 2030 cyclone: "Without your pandanus, 4 homes more would have been hit." It made my build feel like it mattered.
- "Every home in the path survived. 9 of 9 homes saved."
- The big "Panjim, 2050 / 25 years, 3 storms" title before the final card.
- The "This doesn't change the next storm" hint, once I understood it. It let me test cards with Tab before committing.
- The real place names (Kala Academy, Campal Garden, Mahalaxmi Temple) in the "Damaged / Stood" list.

## 8. Bugs and glitches

1. **Major: the Tutorial exits to the main menu on Enter.**
   - Steps: Menu, Tutorial, Begin. Build a Dune on the first beach tile. Year 2: ArrowUp ×2 and ArrowRight ×2 to the next beach tile, then Enter to open the picker. Press ArrowDown ×2, then Tab (the ring is on Pandanus), then Enter.
   - Expected: Pandanus is built, year 3.
   - Got: the main menu, tutorial lost, no confirmation.
   - Shots: `keyboard-picker-two-highlighted.jpg` and `keyboard-tutorial-kicked-to-menu.jpg`.
   - It didn't happen when I pressed only Tab, then Enter. It might be connected to the ArrowDown presses inside the picker, or to an idle timeout I never saw a warning for.
2. **Minor/major for keyboard users: focus leaves the open card picker.**
   - Steps: open the picker, Tab past the last card.
   - Expected: focus stays in the picker (wraps), or the picker closes.
   - Got: focus moves to the objective panel's "–" button while the picker is still open.
   - Shot: `keyboard-focus-leaves-picker.jpg`.
3. **Minor: two cards look selected.**
   - Steps: Tutorial year 2, open the picker, ArrowDown.
   - Expected: one clear selection.
   - Got: one card has the focus ring and another has the filled highlight.
   - Shot: `keyboard-picker-two-highlighted.jpg`.
4. **Minor (colour): Maya and How to play talk about "red" danger.**
   - For a deuteranope nothing looks red; the hatching is what actually carries the meaning.
   - Expected: wording like "the striped tiles".
   - Shot: `keyboard-maya-says-red.jpg`.
5. **Minor (a11y text): the star text doesn't match the display.**
   - Steps: finish the 2050 storm with 2 stars.
   - Expected: text like "2 of 3 stars".
   - Got: the dialog text reads "★★★" while the screen shows 2 filled stars and 1 outline.
   - Shot: `keyboard-result-2050-stars.jpg`.
6. **Minor: the camera jumps but the cursor doesn't follow.**
   - Steps: build the 23rd year in Panjim (Maya: "Campal is most at risk").
   - Expected: the cursor moves with the camera, or the camera stays.
   - Got: the camera is at Campal and the cursor is off screen.
   - Shot: p116 (not copied).
7. **Minor: the cursor is nearly invisible when zoomed out.**
   - Shot: `keyboard-cursor-tiny-zoomed-out.jpg`.
8. **Unknown: whether "Speed up" is reachable by keyboard.** It never received visible focus in my Tab cycles during storms.
9. **Console:** `/console` at the end showed no messages (empty list). An earlier check after the tutorial exit was also empty.

## 9. Fun signals

- **First build:** about 50 s, after 14 key presses (Tutorial, Dune on the beach).
- **Whole session:** roughly 390 key presses (about 10 min) plus about 9 min of reading and about 4 min of storm playback, so **about 23 to 25 minutes**. The Tutorial took about 7 min including the restart; the Panjim run about 17 to 18 min.
- **Real choices** (two good options with different outcomes): about 4.
  1. Year 24: the Campal sea tile offered Seawall (−5 biodiversity, the strongest wall) or Breakwater (−2). I took the Seawall.
  2. Year 25, the last build: finish the 7th khazan objective, or put a Pandanus on the Campal beach for the wind. I chose Pandanus, and the card later said the wind took 4 homes.
  3. Year 15 "Last call": a small dam on the Fontainhas river, or another mangrove somewhere. I chose the dam.
  4. All the wetland tiles offered Mangrove or Khazan. The "Objective" tag usually decided for me, so this was only half a choice.
  Everything else was following the objective list.
- **Storm results that surprised me:** the 2040 flood saved 52 of 57 even though I had spent a lot of builds on khazans in Merces, which surprised me in a good way. In 2050, losing 13 even after two late Campal builds surprised me in a bad way; that was the only storm below 3 stars.
- **Why I lost homes, after each storm's result cards:**
  - *Tutorial cyclone (1 lost):* the card didn't say which home or why; it only listed what protected the others. Not clear.
  - *Tutorial flood (2 lost):* again, no reason was given; it only said the cyclone defences don't help in a flood. Not clear.
  - *Panjim 2030 cyclone (0 lost):* the dune and two pandanus in front of the school covered everything. Clear.
  - *Panjim 2040 flood (5 lost):* I think they were the "9 homes still in danger, most of them around the city" Maya mentioned before my last build, which I spent on a small dam. The result card didn't say where the 5 were. Partly clear.
  - *Panjim 2050 (13 lost):* Campal was under-defended on the sea side, and the card spelled out that "the wind alone took 4". The damaged landmarks list (Kala Academy, Campal Garden, Institute Menezes Braganza, Don Bosco High School) showed where. Clear enough. I started defending Campal two builds too late.

## 10. Results

| Storm | Stars | Homes saved |
|---|---|---|
| Tutorial cyclone 2029 | 3 | 21 of 22 |
| Tutorial river flood 2032 | 3 | 23 of 25 |
| Panjim cyclone 2030 | 3 | 9 of 9 |
| Panjim monsoon flood 2040 | 3 | 52 of 57 |
| Panjim cyclone and flood 2050 | 2 | 45 of 58 |
| **Panjim total** | **8 of 9** | **106 of 124, +50 biodiversity: Panjim cleared** |

## 11. Would I play again? Would I tell a friend?

**Play again: yes, once.** I want to beat 2050 with 3 stars by defending Campal earlier. Between the storms, though, there is a lot of arrow-key walking across the map for a keyboard player. A "jump to the next objective tile" key would make a second run much nicer.

**Tell a friend: yes.** I'd tell them: "It's a calm planning game about real Panjim, one build a year, and it explains why your defences worked. You can play it fully on the keyboard, but zoom in to see the cursor, and ignore it when it says 'red': look for the striped tiles."

## 12. Verdict

Fully playable by keyboard and mostly colour-safe, but a Tutorial exit to the menu, focus leaking out of the card picker, a tiny map cursor and "the red shows…" wording hold it back for a keyboard player with deuteranopia.

## Knowledge questions (asked after play)

I answered these only from what the game showed me.

1. **What does a mangrove do in a storm?** It slows the flow of the water, which lowers a storm's surge and cuts the height of its waves. The game said it helps in both a cyclone and a river flood, and Maya quoted studies where 100 m of mangroves cut wave height by 13% to 66%.
2. **Why can a seawall be risky?** In this game it costs 5 biodiversity, the most of any defence, and it cracks with age. It breaks in its 2nd cyclone or once 10 years old, and it pushes water round its ends.
3. **What is a khazan, and what is it for?** It is Goa's old farmed wetland, reclaimed from marsh: a bund and a sluice gate round paddy fields and fish ponds, shared by farmers and fishers, with bunds that keep out the tide. It holds back river floods by keeping the floodwater in its fields, so nearby homes stay drier.
4. **Where did the 2040 flood come from, and why from there rather than the sea?** Maya said monsoon rain swells the Mandovi upstream, and the flood comes down the river through the channel at Ribandar into Merces, St Cruz and Taleigao. So it came down the river because it is caused by rain upstream, not by a storm at sea; the game didn't explain it further than that.
5. **What helps homes against a cyclone's wind?** Pandanus. The game called it the only defence that shields homes from a cyclone's wind, and said it shields the homes within 2 tiles of it.
