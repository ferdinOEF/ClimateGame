# QA report: Maya layout, roads and hazard visuals

Branch `hazard-vfx-and-fixes`, against master `5f3fdfd`. The local tag
`pre-hazard-vfx-and-fixes` marks that master, and the branch
`backup/pre-hazard-vfx-and-fixes` holds it on GitHub.

Every browser check below ran in headless Chromium with software GL
(SwiftShader). This container has no GPU, so absolute frame rates are not
meaningful. The relative numbers, draw calls and triangles are.

## Summary

| Gate | Result |
|---|---|
| Typecheck (`tsc --noEmit`, strict) | Pass. No lint script is configured; strict tsc is the lint. |
| Unit tests (`npm run test`) | 355 pass, 6 skipped (pre-existing skips). |
| Production build | Pass. |
| Tutorial walkthrough (`npm run walkthrough`) | Pass: menu, Tutorial, Panaji, no console errors. |
| `verify:maya` | Pass: all checks. |
| Maya layout (`npm run test:layout`) | Pass: 105 of 105 layouts at 1366x768, 1920x1080 and 2560x1440. |
| Functional (`tools/qaFunctional.ts`, `docs/qa/functional.md`) | Pass: all checks. |
| Drawn depth = resolved depth | Pass in unit tests and in the browser. Worst difference 0 over 8,242 tile-moments. |
| Bots, 20 seeds | Deterministic: two full runs gave byte-identical output. Quality is renderer-only (no `src/core` module depends on it). |
| Pixel diff vs pre-change | Menu: 0% differ. Tutorial first screen: 0.07%, only the tile-gap seams the new dark floor fixes. |
| Perf and leaks (`tools/stormPerf.ts`) | No console errors, warnings or failed requests. JS heap 25 → 25 MB across three storms. |
| Cross-browser | Chromium only. Firefox and WebKit are not installed here, and this environment forbids `playwright install`. Not run: a gap. |
| Independent review | 3 MAJOR and 10 MINOR findings. All MAJOR and MINOR fixed; see below. |
| No real-world claims | Pass: a test asserts no years in the replay text, and the reviewer found no named storms, dates or statistics. |

**Verdict.** No BLOCKER remains open. The gaps are cross-browser (not
runnable here) and real-GPU frame rates (not measurable here).

## Functional checks (`docs/qa/functional.md`)

**Routing:**
- the menu offers exactly Tutorial and Choose a level;
- there is no email field;
- the Tutorial route renders;
- browser Back returns to the menu;
- refresh stays on the level.

**Sound:**
- before any click there is no audio context (`unlocked: false, context: false`);
- the first click unlocks sound.

**Resize, hidden tab, fullscreen:**
- the canvas fills 1366x768, 2560x1440 and 1920x1080 after live resizes;
- rendering resumes after the tab is hidden and shown;
- fullscreen enters and leaves.

**Keyboard only:**
- R, M and S each toggle their switch (`aria-pressed`) and back;
- Tab reaches 17 distinct HUD stops, every one with a visible focus ring;
- focus shows a tooltip and Esc closes it.

**axe-core 4.10:** no serious or critical violations on the menu, the
Tutorial or the Panaji board. Two pre-existing critical/serious issues were
fixed on the way:
- `index.html` no longer sets `maximum-scale=1`, so page zoom is allowed.
  The board keeps `touch-action: none`.
- The Outlook markers gained `role="img"` for their `aria-label`.

Only the moderate `region` rule remains (content outside landmarks).

**Truthfulness.** The browser compares the water layer's drawn depth with
`combinedDepth` at the same storm time, on every water tile:

| Storm | Times sampled | Tile-moments | Wet | Worst difference |
|---|---|---|---|---|
| Cyclone | 6, 9, 12, 16, 20 s | 2,930 | 1,819 | 0 |
| Flood | 9, 14, 20, 28 s | 2,632 | 988 | 0 |
| Finale | 10, 16, 22, 30 s | 2,680 | 1,602 | 0 |

**Flash** (cyclone, from 7 s):
- the overlay's keyframe peak is 0.15, against a cap of 0.25;
- at most 1 flash in any second, against a limit of 3;
- scripted strikes are at least 2.5 s apart (unit-tested);
- `StormManager` refuses flashes closer than 0.34 s.

## Performance (`docs/qa/perf.txt`)

Measured at 1920x1080, each storm held at its peak (cyclone 16 s, flood
18 s, finale 18 s), 4 s of frames each:

| Quality | State | avg fps | 1% low | p95 frame ms | Draw calls | Triangles |
|---|---|---|---|---|---|---|
| Low | calm | 2.1 | 1.1 | 933 | 29 | 183,228 |
| Low | cyclone | 2.3 | 1.9 | 517 | 23 | 187,800 |
| Low | flood | 2.1 | 1.3 | 783 | 27 | 188,316 |
| Low | finale | 2.4 | 1.6 | 617 | 37 | 193,228 |
| Medium | calm | 2.1 | 1.1 | 883 | 38 | 183,760 |
| Medium | cyclone | 2.0 | 1.3 | 750 | 23 | 219,128 |
| Medium | flood | 2.0 | 1.4 | 700 | 27 | 222,780 |
| Medium | finale | 2.4 | 2.1 | 483 | 38 | 229,888 |
| High | calm | 2.7 | 1.0 | 1,017 | 33 | 183,392 |
| High | cyclone | 2.0 | 1.8 | 550 | 23 | 246,940 |
| High | flood | 2.0 | 1.1 | 933 | 27 | 254,016 |
| High | finale | 2.1 | 1.9 | 517 | 36 | 262,788 |

**Reading it:**
- **fps.** About 2 fps is SwiftShader's ceiling at 1080p on this machine,
  calm board included (the P0 baseline was the same). It says nothing about
  a real GPU.
- **Draw calls.** A storm adds at most a handful: water, rain, spiral,
  band and bolt, one each. During a storm, labels and walkers are hidden,
  so totals can even fall.
- **Triangles.** Storm geometry ranges from about 5k (Low) to about 80k
  (High).
- **Leaks.** JS heap 25 → 25 MB and DOM 449 → 468 nodes after three
  storms played on one page. The extra 19 are the Aftermath and replay
  cards, which are created once and reused.
- **Real GPU.** Still to be measured: no GPU here.

## Screenshot matrix (`docs/qa/matrix/`, each with a `-gray` twin)

One line per screenshot, after reading it:

**Calm and Tutorial:**
- `calm-1366x768`, `calm-1920x1080`, `calm-2560x1440`: the board is
  readable; the HUD switch column (Show risk, Maya, Sound and its volume,
  Calm motion, Quality) is clear of the Houses counter.
- `tutorial-1366x768`, `-1920x1080`, `-2560x1440`: the Tutorial's first
  screen is unchanged apart from the closed tile seams.

**Cyclone:**
- `cy-07-1920x1080`: the sea draws back before the hit, and the shallows by
  the beach show sand. The spiral is offshore. Maya: "A cyclone is forming
  offshore."
- `cy-10-1920x1080`: landfall. The surge is starting up the beach, under
  heavy slanted rain.
- `cy-16-1920x1080`, `-1366x768`, `-2560x1440`: the surge at its peak,
  turquoise-blue over the land. The houses are still readable above the
  water; wave stripes mark the flooded tiles.
- `cy-22-1920x1080`: draining, with foam on the shallow receding edge.
- `cydef-09-1920x1080`: beach defences answer with a pulsing green rim
  where the water reaches them.
- `cy-16-calm-1920x1080`: Calm motion on. No shake or bolts, thinner rain,
  calmer waves.
- `cy-16-q-low-1920x1080`, `cy-16-q-medium-1920x1080`: Low and Medium read
  the same at a glance, with less wave detail and fewer drops.
- `cy-16-protan`, `cy-16-deutan`: water stays clearly distinct from land
  (blue against khaki); the stripes still mark the flood.

**Flood:**
- `fl-06-1920x1080`: rain and the grey band come first. The river is still
  low. Maya: "Heavy rain upstream."
- `fl-12-1920x1080`: the swell runs downriver with a pale crest; navy water
  and white chop. No brown anywhere.
- `fl-20-1920x1080`, `-1366x768`, `-2560x1440`: overflow onto the low
  banks in dark navy.
- `fl-30-1920x1080`: the river falling. Maya: "The river is falling."
- `fldef-14-1920x1080`: khazans fill teal and glow. Maya: "The khazans are
  holding water." This line is gated: it plays only when khazans are on
  the flood's path.
- `fl-20-protan`, `fl-20-deutan`: navy against yellow-khaki; distinct.

**Finale:**
- `fn-08-1920x1080`: both fronts gather. The spiral is offshore while the
  rain starts upstream.
- `fn-16-1920x1080`, `-1366x768`, `-2560x1440`: the pincer. Turquoise
  surge, navy river, indigo where they meet. Maya explains the backwater.
- `fn-24-1920x1080`, `fn-34-1920x1080`: the fronts ease and the water
  drains.

**Replay and finale screen:**
- `replay-1920x1080`, `replay-1366x768`: the replay card frames the homes
  hit (red) and spared (green); Skip is visible.
- `finale-1920x1080`, `finale-2560x1440`: the 2050 card with the new Storm
  card button.
- `stormcard-1920x1080`: the card image. With your defences beside none;
  red crosses for houses hit.

**Tooltips:**
- `tip-sound-1920x1080`, `tip-quality-1920x1080`: the tooltips show beside
  the switches, clear of the HUD.

**Other screenshot folders:**
- `docs/qa/layout/`: Maya above the Discovery card at three resolutions.
- `docs/qa/roads/`: roads read only through the street map, near and far,
  map on and off, with the heat on top.
- `docs/qa/p8/`, `docs/qa/p9/`: the replay, finale and HUD controls.
- `docs/qa/storm-p2/`: development shots.

## Contact sheets (0.25 s frames, `docs/qa/contact/`)

- **`after-cyclone-landfall.jpg`.** The new build, cyclone from 7 s to 12 s.
  The draw-back shows at 7–8 s. The surge then climbs the beach a ring at a
  time from 8 s, and Maya's landfall line comes at 10 s.
- **`after-finale-pincer.jpg`.** The new build, finale from 11 s to 16 s.
  The surge comes up the Mandovi while the swollen river comes down; the
  indigo meeting zone grows.
- **`before-cyclone-staging.jpg`.** The pre-change build (worktree of
  `5f3fdfd`), recorded as video and cut every 0.25 s.
  - The old staging tinted each zone flat and darkened the whole board by
    about 60%.
  - Nothing moved tile by tile, and the board became hard to read.

## Independent review: findings and fixes

**MAJOR (all three fixed):**
1. Defences the storm never reached could show "Absorbed".
   - **Cause:** every sea and river tile carries water, whatever zones the
     storm crosses.
   - **Fix:** `testedDefences` keeps only defences in a zone one of the
     storm's fronts crossed, for that front's hazard. Only those pulse,
     get a word, take the slow-motion beat or fill.
   - **Test:** an off-path mangrove never answers.
2. The storm card showed today's defences instead of those that faced that
   storm.
   - **Fix:** the `StormRecord` keeps the defences that faced it, and the
     card uses those.
3. Maya's layout ran every frame during storms, forcing reflows.
   - **Fix:** moving storm words, the forecast label and the flash overlay
     no longer mark her layout dirty. Bubble heights are cached per line
     and cleared on resize. Following a tile re-lays out ten times a
     second, not every frame.
   - **Check:** the layout test is still 105/105.

**MINOR (all ten fixed):**
4. **HUD clicks hurried the storm.**
   - **Was:** clicking the volume slider, the switches or Maya during a
     storm sped it up.
   - **Fix:** only a click on the board hurries it now.
5. **Esc didn't skip the replay.**
   - **Was:** Maya's Esc handler took the key first.
   - **Fix:** the replay now listens on `window` as well, so Esc skips it.
6. **Storm sound and timers could outlive the level.**
   - **Was:** thunder and other timers could fire after the level closed.
   - **Fix:** they are cancelled with the storm; `StormSound` ignores calls
     once disposed; dispose ends any storm in progress.
7. **The sky darkened past the cap.**
   - **Was:** the sky darkened about 55%.
   - **Fix:** its lerp is now capped at the same 35% as the sun.
8. **Flash effects stacked.**
   - **Was:** the overlay, sky and sun lifts added up past the cap.
   - **Fix:** the flash lifts the sky and sun by 0.15 and the overlay peaks
     at 0.15; the cap stays 0.25.
9. **Phase lines over-claimed.**
   - **Was:** the mangrove and khazan lines played whenever any existed.
   - **Fix:** the mangrove line needs a real save in the record; the khazan
     line needs khazans on the flood's path.
10. **Lightning bolts were straight.**
    - **Fix:** they now use a seeded generator, so they are jagged.
11. **Per-frame allocations.**
    - **Fix:** removed the needless per-frame array.
12. **Calm motion skipped Maya.**
    - **Fix:** it now stills her animations too.
13. **The counterfactuals reused the real board's combos.**
    - **Fix:** each copy computes its own combos.

**NITs:**
- Fixed: "kept dry" became "spared".
- Not fixed: rain-time precision over very long sessions.

## Bots

- The finale star table and the defence experiment are in `docs/PROGRESS.md`
  (P10). Smart scores 3★ on all 20 seeds, Casual 1★, Greedy 1★, Banker 2★.
- The brief's "~40% cut from belt + khazans" is not exactly achievable with
  the zone resolver: its cut is step-like, 0–8% or 80–97%. The tables and
  the reasoning are in PROGRESS.
