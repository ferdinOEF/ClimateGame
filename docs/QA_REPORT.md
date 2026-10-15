# QA report: invented people removed, cited facts, branding, OSM 21%, Low quality

Branch `hazard-vfx-and-fixes`, against master `0b1f414` (PR #9's merge).

**Safety copies of that master:**
- the local tag `pre-content-branding`;
- the branch `backup/pre-content-branding` on GitHub.

**Last round.** The tag `pre-hazard-vfx-and-fixes` (`5f3fdfd`) still marks
the master before that round. Its QA report is in this file's git history
at `0b1f414`.

**Test environment.** Every browser check ran in headless Chromium with
software GL (SwiftShader). This container has no GPU, so absolute frame
rates are meaningless here; relative numbers, draw calls and triangles are
not.

## Summary

| Gate | Result |
|---|---|
| Typecheck (`tsc --noEmit`, strict) | Pass. There is no lint script; strict tsc is the lint. |
| Unit tests (`npm run test`) | 372 pass, 6 skipped (skips are pre-existing). New: `facts.test.ts` (14), `noInventedPeople.test.ts` (3), `oldSaves.test.ts` (2), and 2 more in `mapLayer.test.ts`. |
| Production build | Pass. |
| Tutorial walkthrough (`npm run walkthrough`) | Pass: menu, Tutorial, Back, browser Back, Panaji; no console errors. |
| `verify:maya` | Pass: all checks, including the street map at 21%. |
| Maya layout (`tools/mayaLayoutTest.ts`) | Pass: 105 of 105 layouts at 1366, 1920 and 2560, with the tallest Discovery card shown. |
| Credits, Sources, Discovery (`tools/creditsCheck.ts`) | Pass: every check, at 1366, 1920, 2560, DPR 2 and 760 px. |
| Functional (`tools/qaFunctional.ts`, `docs/qa/functional.md`) | Pass: all checks. |
| axe-core | No serious or critical issues on the menu with the strip, the Sources screen, the Tutorial or Panaji. |
| Pixel diff vs pre-change | Menu: no pixel changed outside the new strip. Tutorial: only the reworded text changed. |
| Perf and leaks (`docs/qa/perf.txt`) | Low draws 25% fewer triangles than High in a cyclone. Heap 25 → 26 MB over three storms. No errors or failed requests. |
| Bots, 20 seeds | Smart 3★ on 60 of 60 storms; Casual ≥1★; Greedy 1★ on every finale. Outcomes do not depend on quality. |
| Truthfulness | Pass. See below. |
| Independent review | 1 MAJOR, 7 MINOR, 3 NIT. All fixed; see below. |
| Cross-browser | Chromium only. Firefox and WebKit are not installed here, and this environment forbids `playwright install`. Not run: a gap. |

**Verdict.** No BLOCKER is open. The known gaps are:
- cross-browser testing (cannot be run here);
- frame rates on a real GPU (cannot be measured here);
- the finale's ~40% target (see Bots);
- the live source pages, which could not be opened from here (see Truthfulness).

## Truthfulness

- **Invented people.** `tests/noInventedPeople.test.ts` scans `src/`,
  `public/`, `index.html` and the README. It fails on any removed name, on
  "Voices of Panjim" or `showVoicesPanel`, and on an "X says/asks/told"
  line in the text data. It passes.
- **Cited facts.** `tests/facts.test.ts` checks that:
  - every shown fact has a full citation with an https link;
  - no shown fact holds a number its source note does not;
  - game rules start "In this game, ";
  - hidden entries never show, and a reported fact names its reporter;
  - no year or named cyclone appears in any shown text;
  - Maya's tips are game rules or practical guidance.
- **The Sources screen in the browser** lists all 5 cited facts, in order,
  with https links (`creditsCheck`). Every shown fact is on it. The 16
  game rules are listed below the facts.
- **Old saves.** Notes saved on players' devices by earlier builds are
  re-worded on load, so the old tips cannot survive on a device
  (`tests/oldSaves.test.ts`).
- **Every claim and its verdict** is in `docs/FACTS_AUDIT.md`.
- **Sources not opened directly.** The five source sites are blocked by
  this container's network. Each claim was checked against the pages' own
  text as quoted in web search results. A person with normal access should
  open the five URLs before release (FACTS_AUDIT has the steps).

## Functional checks (`docs/qa/functional.md`, plus `creditsCheck`)

**Routing:**
- the menu still offers exactly Tutorial and Choose a level;
- there is no email field;
- Tutorial, Back, browser Back and refresh all behave.

**Sources screen:**
- it opens from the menu's "Facts & sources" link and from a card's Source
  button (scrolled to that fact);
- inside a level, Tab stays in the dialog and the page behind is inert;
- one Esc closes it, even while Maya is talking;
- afterwards the page is reachable again;
- it closes on any route change.

**Discovery card:**
- the Source tooltip reads "McIvor et al., 2012 · The Nature Conservancy
  and Wetlands International (...)";
- on Panaji the card sits above the street-map switch and the credit;
- leaving Panaji clears that offset, so the Tutorial is unaffected.

**Sound:** silent until the first click.

**Resize, hidden tab, fullscreen:** pass.

**Keyboard:**
- R, M and S work;
- Tab reaches 17 HUD stops, each with a visible focus ring;
- Esc closes tooltips.

**Flash:** peak opacity 0.15 (the cap is 0.25); at most 1 flash a second
(the limit is 3).

**Drawn depth equals core depth:** worst difference 0 over 8,242
tile-moments.

## Branding strip (`docs/qa/credits/`)

**Measured at 1366×768, 1920×1080, 2560×1440, 1920×1080 at DPR 2 and
760×900:**
- the plate touches no menu element; the closest gap is 207 px, at
  760×900;
- both logos are 60 px tall, loaded, in their own proportions, and not links;
- alt text is "OneEarth Foundation logo" and "Gokhush Charitable Trust logo";
- the label "Brought to you by" has a contrast of 11.7:1;
- there is no horizontal scroll;
- the strip is absent inside levels.

**If the menu ever reaches it** (the hidden extra buttons, or a short or
narrow window), the plate moves below the menu in the scroll instead.

**The logo files:**
- `public/branding/` holds the supplied files byte-for-byte; sha256
  checked against the originals;
- the only addition is a 256 px WebP of the OneEarth logo, made from the
  original;
- `strip-1920x1080@2x.png` shows both logos sharp at DPR 2.

## Pixel diff against the pre-change build (`docs/qa/pixeldiff/`)

- **Menu:**
  - 1.68% of pixels differ, all inside the rectangle (742,984)–(1178,1066):
    the new plate;
  - nothing above y = 960 changed, so the centred menu did not move.
- **Tutorial first screen:**
  - 1.83% of pixels differ, all inside (760,97)–(1160,817);
  - that area is the brief card and the first coach step, whose
    unsourced wording ("every Goan river mouth", "where fresh water meets
    salt") was rewritten;
  - the board, HUD and layout are unchanged.

## Performance (`docs/qa/perf.txt`, software GL)

| quality | cyclone triangles | flood triangles | finale triangles | draw calls (storm) |
|---|---|---|---|---|
| Low | 184,044 | 186,400 | 187,396 | 24–31 |
| Medium | 219,128 | 222,780 | 229,868 | 23–37 |
| High | 246,940 | 254,016 | 262,808 | 23–37 |

- **What Low saves.** In storms, Low's flat sky and flat water cut 25–29%
  of High's triangles. The calm board is the same at every quality (about
  184k triangles).
- **Frame rates** under SwiftShader are about 2 fps for every row, so
  fps, 1% low and p95 (all in the file) only show that no quality is
  slower than another.
- **The "no frame over 100 ms" target** cannot be judged without a GPU.
- **Leak check:** JS heap 25 → 26 MB and DOM 452 → 471 nodes across three
  storms on one page.
- **Errors:** no console errors, warnings or failed requests.

## Screenshot matrix (`docs/qa/matrix2/`, each with a `-gray` twin)

**Headless frame rates.** Auto quality steps down under software GL, so
these shots show Auto at Medium or Low unless a shot sets Low itself.

| Shot | Finding |
|---|---|
| `panaji-osm21-1920x1080` | The street map at 21% reads under the tiles; the tiles' own colours lead. The credit is visible bottom-left. |
| `panaji-osm21-2560x1440` | Same at 2560; the HUD is the same size, and there is more board. |
| `panaji-osm21-1366x768` | Same at 1366; Maya's greeting bubble sits clear of the HUD. |
| `roads-near-1920x1080` | Close in: roads are thin lines from the street map at 21%, with no beige strips. |
| `roads-near-2560x1440` | Same at 2560; the street names show faintly through the land tiles. |
| `roads-far-1920x1080` | Far out: roads are faint and never compete with the houses or the coast. |
| `roads-near-osmoff-1920x1080` | Street map off: no road lines at all, as intended (roads follow the map). |
| `heat-1920x1080` | The warning heat over the 21% map; orange beach and red tiles read clearly. |
| `heat-roads-near-1920x1080` | Heat close in: roads show under the tint without muddying it. |
| `cyclone-1920x1080` | Landfall at Medium: 3D spiral, rain, surge rings. Maya's landfall line sits clear of the HUD. |
| `cyclone-prot-1920x1080` | Protanopia: sea blue against yellow land; the surge still reads. |
| `cyclone-deut-1920x1080` | Deuteranopia: same; nothing depends on red against green. |
| `cyclone-low-1366x768` | Low: a flat painted spiral, sparse rain, flat water, no whitecaps. The storm is still unmistakable. |
| `flood-1920x1080` | River flood: navy channel water; flooded land is striped (not colour alone). |
| `flood-deut-1920x1080` | Deuteranopia: the navy water and the land stay distinct. |
| `flood-low-1920x1080` | Low: the same flood with a flat surface and plain foam; the stripes are kept. |
| `finale-1920x1080` | The pincer: the surge meets the swollen river, and the indigo meeting zone shows. |
| `finale-prot-1920x1080` | Protanopia: the indigo zone still separates from the sea and the river. |
| `tutorial-1920x1080` | The Tutorial brief with the reworded text. The layout is unchanged. |

**Also checked** (in `docs/qa/credits/` and `docs/qa/layout/`):
- the landing page with the strip at every resolution, including DPR 2;
- the Sources screen, opened from the menu and from a card;
- Maya beside the Discovery card shown and hidden, at 1366, 1920 and 2560.

## Contact sheets (0.25 s frames, `docs/qa/contact/`)

- **`cyclone-high.jpg` and `cyclone-low.jpg`:** the same cyclone, storm
  time 8.0 to 11.0 s, at High and at Low.
- **High** shows 3D cloud puffs, whitecaps and the surge climbing ring by
  ring.
- **Low** keeps the same timing and path:
  - the spiral arrives and turns as a flat sheet;
  - the surge climbs at the same times, on a flat surface;
  - Maya's lines come at the same moments.
- **Earlier sheets** (`after-*`, `before-*`) are from last round and still
  apply.

## Independent review: findings and fixes

A separate reviewer read the whole diff and ran tsc and the tests. Its
findings, each verified and fixed:

**MAJOR:**
- **Old tips survived on players' devices.** Maya's notes are stored with
  their full text, so a player who had heard the old tips kept the
  unsourced wording in the Field Guide, and "Hear it again" replayed it.
  - Now saved notes take today's title and text on load, and notes for
    removed lines are dropped (`refreshSavedNotes`).
  - Tested in `tests/oldSaves.test.ts`.

**MINOR:**
1. **The card offset outlived Panaji.** The map-corner class and height
   stayed on the shared game layer, raising the Discovery card in later
   levels. They are now cleared when a level is disposed. Checked in the
   browser.
2. **Esc during a level.** Maya's Esc handler ran first, so one Esc closed
   her bubble and not the Sources screen. Sources now has one window-level
   listener, added at load, that runs first. Checked in the browser.
3. **No focus trap.** Tab now cycles inside the dialog, and the page
   behind is `inert` while it is open. Focus returns only to an element
   still on screen.
4. **The Sources screen survived navigation.** It now closes on every
   route change and when a level is disposed.
5. **The layout test missed the tallest card.** It now shows
   `dunes-barrier` (the longest cited fact, with its Source row): 105/105.
6. **The dune fact said more than its note.** "Move and change shape" was
   an elaboration. It now reads "Research on dunes in England and Wales
   found that ... and are best managed as dynamic natural defences."
7. **The credits check skipped menu blocks.** It now covers every menu
   block. The plate also moves into the flow if the menu would reach it.

**NIT:**
- Old autosaves carrying `voiceStatus` now have a test.
- `reset()` clears the card's hover hold.
- The whole card, not only its Source row, now holds it open under the
  pointer.

## Bots (easy-test, 20 seeds per persona)

| Persona | 1★ | 2★ | 3★ (of 60 storms) |
|---|---|---|---|
| smart | 0 | 0 | 60 |
| casual | 20 | 16 | 24 |
| greedy | 20 | 20 | 20 |
| banker | 0 | 29 | 31 |
| walls | 0 | 4 | 56 |
| mangroves | 0 | 4 | 56 |

- **The finale.** Casual and Greedy take 1★ on all 20 finales.
- **Determinism.** Bots run the pure core only, and graphics quality is
  renderer-only. No `src/core` module reads it, so outcomes are identical
  at every quality.
- **The ~40% target is still not met** (`tools/panjimBots/finaleDefences.ts`
  and the sweep in `docs/PROGRESS.md`).
  - With both defences, homes hit drop by either about 0% or 81–97%,
    depending on the finale's strength; never about 40%.
  - The cause: houses in a zone face the same leak against one fixed
    resilience, so they fall together.
  - Fixing it needs a change to the house model, such as per-house
    resilience. That is a design decision for the user, so it is not made
    here.

## Known residual issues

- **Cross-browser:** Firefox and Safari/WebKit were not tested; neither can
  be installed here.
- **Frame rates:** absolute fps, 1% lows and the 100 ms frame target need a
  real GPU.
- **Sources:** the five pages were not opened directly. Their text was
  confirmed via search results, so a person should open the URLs once
  before release.
- **The finale's ~40%:** not achievable without a model change (above).
- **The moderate axe `region` rule** (content outside landmarks) remains on
  the game screens, as before.

---

# Section 1 — locality names as our own label layer

Branch `section-1-locality-labels` off master `f26cd0a` (tag
`pre-city-hill-mechanics`). Headless Chromium with software GL, as above.

| Gate | Result |
|---|---|
| tsc, tests, build | Clean. 383 tests pass (6 skipped). 11 new tests in `labelPlacement.test.ts`. |
| Label overlap test (`npm run test:labels`, permanent) | **25 of 25 pass.** The 19 settled views are 1366, 1920 and 2560 × the opening view, two zoom steps, after a pan, Maya talking, Maya on the board, plus the Tutorial. The other 6 are frame-by-frame passes during a drag-pan and during Maya's hop, at each size. No two labels touch, and no label touches the HUD or Maya, in any view or frame. Each Panaji view draws at least two locality names. |
| Label-layer cost | About 0.6 ms a frame (median); worst frame 6.8 ms, under SwiftShader. |
| Maya layout (`npm run test:layout`) | 105 of 105, three runs in a row (after the fade-in wait below). |
| Walkthrough (menu, Tutorial, Panaji) | Clean, no console errors. The Tutorial loads and plays. |
| Functional and axe (`docs/qa/section1/functional.md`) | See the bottom of this entry. |
| Frame rate at 1920×1080, calm board (`docs/qa/section1/perf.txt`) | Low 1.7, Medium 1.9, High 1.7 fps. Draw calls 42 / 35 / 33. Software GL, so these show only that the layer adds no draw calls. Real-GPU frame rate cannot be measured here. |
| Grayscale and deuteranopia | `docs/qa/section1/labels-gray-1920x1080.jpg` and `labels-deuteranopia-1920x1080.jpg`: names stay legible. Dark ink on a pale halo does not depend on hue. |
| Cross-browser | Chromium only. Firefox and WebKit are not installed here (`/opt/pw-browsers` holds Chromium alone), and `playwright install` is not allowed. |

## Screenshots (`docs/qa/labels/`)

What was wrong, looked for before accepting:

- **`panaji-zoom1-*` (opening view).**
  - Only the city localities show: at 1366 Campal, Altinho and Fontainhas;
    at 1920 also Merces; at 2560 also Miramar.
  - Miramar is dropped at 1366 and 1920, correctly: Maya's greeting bubble
    is where it would go. Taleigao, St Cruz and Dona Paula are off screen.
  - Accepted: that is the overlap rule working.
- **`panaji-zoom3-*`.**
  - Monument pills fill the old centre, and our names sit just above the
    raster's own faint copies.
  - **Fixed:** localities are now centred on their point, so the halo
    covers the raster's copy.
- **`panaji-maya-1366x768`.**
  - Washed-out monument pills (fade 0.01–0.3) were holding space.
  - **Fixed:** cards are candidates only from half faded in.
- **`panaji-pan-2560x1440`.**
  - At 2560 the names are small for the screen: 14 px rank 1, now 13 px
    rank 2.
  - Accepted for now: the whole HUD is fixed-size CSS pixels at every
    resolution.
- **`tutorial-1920x1080`.** All five Tutorial labels as before.

## Independent review (Section 1)

**MAJOR (3), all fixed:**

1. **Obstacles went stale while things moved.**
   - The HUD was re-read every 120 ms, so a moving forecast label, Maya or
     the build menu could overlap a name for a few frames.
   - Now their rectangles are read every frame from the whole document; the
     element list and their visibility are refreshed every 250 ms.
   - A panel fading in counts as an obstacle.
   - The test now checks every frame during a drag-pan and Maya's hop.
2. **The test could pass with nothing drawn.**
   - It now requires at least two locality names per Panaji view.
   - It fails if a scenario returns false, if Maya does not move for the
     jump, or if the test hook is missing.
3. **Dona Paula (rank 1) vanished when zoomed out.**
   - A locality named like a monument now stays, and gives way only in a
     frame where that monument's card is drawn.

**MINOR, all fixed:**

- Near-invisible cards no longer push names out.
- More obstacles are now covered: help, storm report, era end, welcome,
  Sources and the Source credit. The test's own list gained these and
  `.hud-corner`.
- Edge and panel blinking: labels already showing get 2 px less
  clearance.
- The rank-2 zoom threshold now has a show/hide band (29.5 / 30.5).
- Names sit on their point.
- Labels are re-measured on font load and node resize, and measuring is
  marked done after one pass.
- The debug frame data is built only when a test asks for it.
- The vacuous unit test was replaced, and edge-jitter, twin and
  centring tests were added.

**NIT:**

- **Fixed:** São Tomé is now spelled as OSM prints it, and rank 2 is 13 px.
- **Kept:**
  - Atal Setu stays as a minor label in locality ink. The board has
    always named it, and it is documented as a bridge.
  - "St Cruz" stays: it is the board's existing name for the area.

## Fixed in the QA tools while running this gate

- **`mayaLayoutTest`: 3, then 2, of 105 failed intermittently.**
  - Under software GL the first check after page load caught Maya's
    bubble at opacity 0, at the start of its 220 ms fade-in.
  - Every check that expects the bubble now waits up to 3 s for the fade
    to finish, as the resize case already did. It still fails if the
    bubble never shows.
- **`qaFunctional` flash check saw 0 flashes.**
  - Its window was a fixed 14 s of wall-clock time, and this run's frames
    were slow enough that storm time only reached 8.4 s.
  - It now waits on storm time (to 12 s, past landfall), capped at 90 s.

## Functional and axe (Section 1, final run)

All checks pass (`docs/qa/section1/functional.md`):
- routing, refresh and Back;
- sound unlocks only on the first click;
- resize, hidden tab and fullscreen;
- keyboard (17 HUD stops, each with a focus ring);
- drawn depth equals core depth (worst difference 0);
- flash: 1 onset, at most 1 a second, peak 0.15;
- no console errors or failed requests.

**axe-core:** no serious or critical violations on the menu, the Tutorial
or Panaji. The menu with the strip and the Sources screen were already
covered by `creditsCheck`.

**Machine speed:** this container ran the flash check at roughly half the
frame rate of last round's machine (load average about 4 on 4 cores, from
the QA runs themselves). Labels are hidden during storms, so the label
layer is not in that path.

# Section 2 — risk area: red fill, breaking wave, fold into the button

Branch `section-2-risk-wave` off master `5dda14e` (Section 1's merge).
Headless Chromium with software GL, as above.

| Gate | Result |
|---|---|
| tsc, tests, build | Clean. 394 tests pass (6 skipped). `tests/riskIntro.test.ts` has 11 tests: first warning only (and not the 2nd or 3rd), the gate surviving a save, no particles or shader in reduced motion or on Low, eased motion, the timeline, every timing in data. |
| Browser check (`tools/riskIntroCheck.ts`, `docs/qa/section2/riskIntroCheck.txt`) | **27 of 27 pass.** Plays on warning 1 and not on warnings 2 and 3, across a run played through storms 1 and 2. A saved and continued run does not play it again. The shader is created at the fold, not before. Opening the build menu, the Field Guide or the Sources screen mid-sequence cancels it and leaves nothing behind. Reduced motion and Low never create the particle system or the shader. No console errors or warnings. |
| Contact sheet (`docs/qa/section2/contact-sheet.jpg`, 20 held frames) | Looked at. The fill and the left-to-right dark crest with its foam edge read clearly as a wave crossing the area, and the droplets burst at the right edge. The fold (10.4 s) reads as the sheet gathering and crumpling into a smaller patch, then a ball. It does **not** read as a wave rolling itself up. The flight and the button's pulse read. |
| Label overlap (`npm run test:labels`) | 25 of 25 pass. |
| Walkthrough (menu, Tutorial, Panaji) | Clean, no console errors. The Tutorial loads and plays. |
| Maya layout (`npm run test:layout`) | 105 of 105 layouts at 1366, 1920 and 2560. |
| Functional and axe (`tools/qaFunctional.ts`) | All checks pass. axe: no serious or critical issues on the menu or the Tutorial (moderate "region" only, as before). |
| Frame rate at 1920×1080 while it plays | High 1.3 fps (worst frame 2.2 s), Low 1.5 fps (worst frame 0.9 s), under SwiftShader. These numbers say nothing about a real GPU. The spec's "reduce particles if High < 50 fps" cannot be judged here. The droplets are 40 small 2D circles on a canvas, and the shader is one quad. Medium was not measured separately: the sequence has only two modes on screen (full on High and Medium, flat on Low). |
| Grayscale and deuteranopia | `wave-gray-1920x1080.jpg` and `wave-deuteranopia-1920x1080.jpg`. The crest stays readable without hue: a dark band behind a white dashed foam edge. |
| Cross-browser | Chromium only (Firefox and WebKit are not installed, and `playwright install` is not allowed). |

## Independent review (Section 2)

- **MAJOR, both fixed:**
  - Overlays other than the build menu did not cancel the sequence, and the ball drew over modals. Now every modal cancels it (Field Guide, Sources, help, reports, era end), and the ball sits under them (z-index 14).
  - The once-per-playthrough gate was not saved, so continuing a run replayed it. Now the save records `riskIntroSpent`, and an old save with a storm already landed counts as spent.
- **MINOR, all fixed except one:**
  - Gate semantics: first warning only, and spent if a later one is seen.
  - Projection cost, and hexes behind the camera.
  - The reduced-motion glow was cut short.
  - The flat sheet now fades out, and the sequence aims for the on-screen centroid.
  - Shader: created lazily, with a disc fallback, and correct for device pixel ratio.
  - A quality or motion change mid-play cancels it.
  - The fold now curls, with a dark rim.
  - Droplets come from the middle rows.
  - A redder fill.
  - It plays only when the area is on screen.
  - `aria-hidden`, and a zero-size button.
- **Not changed:** the 10 s rest before the fold is the spec's own timing, so it stays as written.

## Fixed in the QA tools while running this gate

- `tools/walkthrough.ts` and `tools/smoke.ts` found "the canvas" with a bare `canvas` selector. The risk sequence adds its own canvas, so that became ambiguous. They now select the board's canvas only.
- The browser check closes the Field Guide and Sources with their own close buttons. Escape outside the build menu is the quit key and left the level.

# Section 3 — Panjim as a city, Altinho as a hill

Branch `section-3-city-hill`, with master `4563615` (Section 2's merge) merged in.
Headless Chromium with software GL, as above.

| Gate | Result |
|---|---|
| tsc, tests, build | Clean. 406 tests pass (6 skipped). New: `cityHill.test.ts` (8), `cityFabric.test.ts` (2), `fabricLifecycle.test.ts` (2). |
| Board unchanged | Every tile's position and terrain is byte-for-byte the board before this section (sha256 of `[q, r, terrainId]`). No building sits on a non-land, road, bridge or monument tile. Water, beach and wetland render as before (no lift, same geometry, same colour path). |
| Elevation | Copernicus DEM GLO-30, on every tile. Altinho over 40 m within two tiles of its name; Campal, Fontainhas, Patto and São Tomé under a third of that; the wetland's median 5 m or less. |
| Label overlap (`npm run test:labels`) | **37 of 37 pass.** Now includes a monument name card at the opening zoom at each size (drawn, ahead of the localities, overlapping nothing) and a real mouse hover over the Mahalaxmi Temple's tile bringing up its card. |
| Walkthrough | Clean, no console errors. The Tutorial loads and plays (it has no relief and no town). |
| Maya layout (`npm run test:layout`) | 105 of 105 (see below for the test fix). |
| Functional and axe | All checks pass; no serious or critical axe issues. |
| Monument sizes (`cityHill.test.ts`) | Every building: footprint 1.60x and height 1.38–1.55x the largest House beside it. |
| Grayscale and deuteranopia | `oldcity-gray`, `oldcity-deuteranopia`, `core-gray`, `core-deuteranopia`. The monuments stand apart from the fabric by silhouette (domes, minarets, lamp tower, sheds, the church stair) and by their pale plazas, without colour. |
| Cross-browser | Chromium only. |

**Frame rate (`docs/qa/section3/perf-*.txt`, calm board, software GL):**

| Size | Low | Medium | High | Draw calls | Triangles |
|---|---|---|---|---|---|
| 1366×768 | 1.7 | 1.7 | 1.8 | 49–51 | about 350k |
| 1920×1080 | 1.2 | 1.4 | 1.3 | 50–54 | about 350k |
| 2560×1440 | 1.0 | 1.0 | 1.0 | 45–50 | about 349k |

- **Before this section:** 32 draw calls and 183k triangles.
- **What the fabric costs:** 1,608 instanced structures, 4 draw calls, about 225k triangles.
- **What the fps figures mean:** SwiftShader renders on the CPU, so these say nothing about a real GPU. The spec's "reduce density if High is under 50 fps at 1920" cannot be judged here.
- **What I can say:** the city adds a handful of draw calls and a quarter of a million triangles, which desktop GPUs draw easily. So I did not reduce the density. If it proves heavy on real hardware, the place to cut is `FABRIC_MAX` in `townLayout.ts`.
- **Memory and errors:** no leaks over three storms, and no console errors.

**Screenshots (`docs/qa/section3/`):**
- **Views:** `full`, `core`, `altinho` and `oldcity` (with the church's name card) at 1366, 1920 and 2560.
- **Before/after pair:** `before-after-1920x1080.jpg` (left: before, right: after, same cameras).
- **What I saw:**
  - **Altinho:** close up it is unmistakably a hill: terraces of raised tiles with dark step sides and contour rims. From the opening camera it reads as raised ground behind the old city.
    - At my first setting (2.4 times true scale) it did not; it read as flat. I raised the exaggeration to about 3.8 times.
    - The hill is clear but not dramatic at that zoom, because the street map dominates the land's tops there.
  - **The city:** it reads as dense blocks along streets rather than one house per tile. Fontainhas is the saturated quarter, and the rest is calmer.

**Independent review:** 1 MAJOR and 10 MINOR findings, all fixed (listed in PROGRESS, Section 3).

**Fixed in the QA tools while running this gate:**
- `labelOverlapTest.ts` now waits for the card before measuring. Frames take over a second under software GL with the city drawn.
- `__monumentsForTest` no longer counts the plazas as monuments.
- `mayaLayoutTest.ts`:
  - **The symptom:** "resized to 80%" failed in about half the runs (Maya over the bottom prompt).
  - **The cause:** her layout runs on the game's frame, and with the city drawn a frame takes about a second under software GL. The check read a layout made before the Discovery card closed and the prompt came back, with the re-layout already pending (`layoutDirty`, 750 ms since the last pass). On a real GPU that is under a quarter of a second.
  - **The fix:** the check now waits for a fresh, clean layout pass before measuring. It also fails on any page error, which would stop her layout.
  - **Result:** 4 of 4 runs at 1366 clean, then the full run.
  - **Master:** passed 3 of 3 before the fix, with lighter frames.

# Section 4 — survival, propagation and balance

Branch `section-4-mechanics`, off master `a47fc7f` (Section 3's merge).
Headless Chromium with software GL, as above. Everything is in `docs/qa/section4/`.

| Gate | Result |
|---|---|
| tsc, tests, build | Clean. 390 tests pass (6 skipped). New or rewritten: `section4.test.ts` (6), the tile-by-tile `zones.test.ts` (13, with the protection rules), `exposure.test.ts` (preview equals resolution, 20), `panjimBots.test.ts` (6), `aftermath`, `hazardDepth`, `maya`, `combos`. `easyTest.test.ts` deleted with the preset. |
| Preview equals resolution | 6 seeds, every storm, undefended and defended, checked on the warning's last quarter. No house is lost that was not shown at risk. At most 50% of the houses shown at risk stand (the ±1 cone). The preview at the real landfall is exactly the houses lost. Flood previews are exact. |
| Easy-test gone | No source, tool, test or level file mentions it, a balance preset or a coin multiplier. No level carries `balancePreset`, `balancePresets` or `presets`. Income is exactly `state.income × incomeScale`. |
| Finale survivable | A plain 500-coin defence at three landfalls: 32–40% fewer houses lost than none, 37% on average. |
| Elevation | Altinho and every tile next to its name stay dry in flood, cyclone and compound at strength 3.8. Most low wetland takes the monsoon flood. |
| Bots, 20 seeds | Casual 30%, Smart 79%, Greedy 15% (4–29%, beats Casual on 3 seeds), do-nothing 0%. Every defence's margin is 6.0–41.2 points. One kind alone saves at most 48% (mangroves). Full tables: `bots.md`. |
| Walkthrough | Clean, no console errors. The Tutorial loads and plays. |
| Label overlap (`npm run test:labels`) | **37 of 37 pass**, no overlap in any view; label layer at most 8 ms a frame. Of 30 place labels, those dropped or out of view: 23–27 at 1366, 16–26 at 1920, 14–26 at 2560 (most are off screen at the opening zoom; the counts fall as the camera closes in), 1 in the Tutorial. |
| Maya layout (`npm run test:layout`) | 105 of 105. |
| `verify:maya` | All checks pass. Cyclone preview on the last quarter: 19 houses at risk, 17 lost, every lost house shown. Flood: 57 at risk, 57 lost. The tool read the cyclone preview three quarters out (cone ±3) and failed the 50% rule there (40 shown, 17 lost); it now reads it on the last quarter, where the rule is stated. |
| Playthrough (`tools/section4Shots.ts`) | Three storms played at human pace through the real build path, 19 shots, no console errors. The cone narrows from 58 sea tiles five quarters out to 13 on the last quarter (cyclone), and from 53 to 20 (finale). |
| Functional and axe (`functional.md`) | All checks pass on an idle machine, with no serious or critical axe issues. Drawn depth equals the model's depth on every wet tile for all three storms. A first run beside the 20-seed bot run (all four cores busy) failed two "canvas fills the window" checks: the resize event fired after the 900 ms wait. |
| Grayscale and deuteranopia | `warning-1920x1080-gray`, `warning-deuteranopia-1920x1080`. The cone reads as a light-and-dark double band in both, and the heat as darker tiles in grayscale. |
| Cross-browser | Chromium only. |

**Frame rate at 1920×1080 (`perf-1920x1080.txt`, software GL):**

| Quality | calm | cyclone | flood | finale | Draw calls | Triangles |
|---|---|---|---|---|---|---|
| Low | 1.0 | 1.3 | 1.2 | 1.1 | 32–52 | 347–355k |
| Medium | 1.2 | 1.2 | 1.0 | 0.5 | 31–45 | 349–403k |
| High | 1.3 | 1.4 | 0.8 | 1.0 | 31–48 | 350–442k |

- **What the numbers mean:** SwiftShader renders on the CPU, so these numbers say nothing about a real GPU. The draw calls and triangles are in line with Section 3.
- **The cone's cost:** two meshes.
- **Memory:** no leak over three storms (heap 29 MB before and after).
- **Heat redraw:** what changed in the frame is the redraw itself, measured in Node. It is about 106 ms worst case, five quarters out (heat, undefended heat and gauge together), down from about 560 ms before the review fix.

**Independent review:** 1 MAJOR, 8 MINOR and several NITs, all fixed. They are listed in PROGRESS, Section 4.

# Section 1b — Maya's appearance

Branch `section-1b-maya`, off master `82e3776` (Section 4's merge).
Headless Chromium with software GL, as above. Everything is in `docs/qa/section1b/`.

| Gate | Result |
|---|---|
| tsc, tests, build | Clean. 402 tests pass (6 skipped), including `mayaArt.test.ts` (12). Those tests cover: the feature boxes hold every expression and brow pose; no ringlet centre lies inside 1.2× the face oval; no front curl touches a feature; the art is seeded; the arms stay inside the HUD box for every CSS rotation; the palette is the only source of colour. |
| States contact sheet | `maya-states.png` (+ `-gray`): every state in the game. Eyes, brows, nose and mouth are never covered. |
| Full figure | `maya-full.png`, large: the fingers, the fist and the binoculars (gold lens rims) read. `maya-hud-crop.png` is the HUD crop. |
| Screenshots | 1366×768, 1920×1080 and 2560×1440: the brief, docked over the map, over the pale old city and over the dark river, each with a `-gray` copy. Also an Aftermath card and the Tutorial's brief at 1920. The teal shirt reads against both city and water. |
| Label overlap (`npm run test:labels`) | **37 of 37 pass**; label layer at most 6.8 ms a frame. |
| Maya layout (`npm run test:layout`) | **105 of 105.** The first run failed one case: 1366×768 resized to 80% (1093×614). The wider figure left her bubble no room, so the line was held back. Windows 700 px tall or less now draw the HUD figure at 114×112. That is CSS size only; the layout rules are unchanged. |
| Walkthrough | Clean. |
| Console errors | None (`tools/section1bShots.ts`). |
| Tutorial | Loads. Maya's full figure stands beside its brief. The Tutorial has never had the HUD Maya. |
| SVG nodes | HUD figure 66 → 404 SVG nodes (413 in her HUD layer). Badge 8 nodes → 1 image. Full figures are one cached image each. |
| Frame rate, 1920×1080 (`tools/mayaPerf.ts`) | Panaji, Medium: 0.87 fps shown against 1.07 hidden. Single samples range 0.7–1.3, so the gap is within noise and well under the 2 fps threshold; the hair is not flattened. Her figure alone: new 1.3 fps, old 1.2 fps, empty page 51 fps. |
| Cross-browser | Chromium only. The pivots use `transform-box: view-box` with a non-zero viewBox origin. Firefox and Safari are unverified. |

**Deviations from the reference:**
- The fringe sits higher and a little smaller: its lower coils reached the brows.
- HUD forearms are drawn at 0.4 length, and the crop is wider, so every gesture stays in her box.
- The worried brows now tilt with their inner ends up.
- The brief and Aftermath figures are images beside the card.
- The props (bulb, alert, stars) moved to her left, clear of the minimise button.

# Section 1c — Maya: rounder chin, whole body in the HUD, 70% size

Branch `section-1c-maya`, off master `c7c3dd3` (Section 1b's merge).
Headless Chromium with software GL, as above. Everything is in `docs/qa/section1c/`.

| Gate | Result |
|---|---|
| tsc, tests, build, walkthrough | Clean. New or rewritten in `mayaArt.test.ts` (18): every arm pose in `panjim.css` (rotation and shortening) stays inside her box; no pose puts a hand or the binoculars through her face; the binoculars arm only ever draws in; her hands fit inside the checked reach points; the legs sit behind the torso in the body group; the box is sized from the crop's aspect and the one scale; the new chin is in both face paths, the full figure, the HUD and the badge, the old curve is gone, and the jaw shadow and chin line lie inside the shorter chin. |
| Chin | `maya-chin.png`: old and new at 4x. Visibly rounder; brows, eyes, nose and mouth untouched. |
| States | `maya-states.png` (+ `-gray`), every state in the real game, whole body: idle, greeting, tip, explains, warning, worried, celebrates, jump. No hand or binocular crosses the face, nothing clipped. |
| Full body | `maya-hud-crop.png` (+ gray): the HUD figure at about 1x, 2x and 4x. Boots included; fingers and binoculars read. |
| Screenshots | 1366×768, 1920×1080, 2560×1440: idle with no line, with a line showing, over the pale old city and over the dark river, each with a `-gray` copy; the brief, the Aftermath card and the Tutorial's brief at 1920. Whole body and boots visible, the bubble clear of her and of the HUD. |
| Label overlap (`npm run test:labels`) | **37 of 37 pass**; label layer at most 6.6 ms a frame. |
| Maya layout (`npm run test:layout`) | **105 of 105.** |
| Console errors | None. The Tutorial loads and its brief shows Maya. |
| SVG nodes | HUD figure: 405 on master (Section 1b), 425 now (66 before Section 1b). Her legs add 20 nodes; they are one static group. DOM nodes in her HUD layer: 433. |
| Frame rate, 1920×1080 (`tools/mayaPerf.ts`) | Panaji, Medium: 1.70 fps shown, 1.75 hidden; her cost 0.05 fps. Her figure alone: 1.7 fps now, 1.8 on master; an empty page 56 fps. Far inside the 2 fps limit, so the legs were not flattened to an image. |
| Cross-browser | Chromium only. |

**Size:** `MAYA_SCALE = 0.7` (`mayaLayout.ts`) is the only scale. maya.ts sets it as `--maya-scale` with the figure's box (`--maya-fig-w`, `--maya-fig-h`), and the CSS multiplies every size of hers by it: figure, bubble padding and radius, tail, Got-it button, minimise button, badge. Her drawing keeps the size it had (139 px per 158 art units), so the figure is 103×271 at 1366×768 (×1.17 on large screens, ×0.82 under 700 px tall, ×0.68 on phones). Bubble text holds at 12 px (the name label at 10 px) and only its box scales. The minimise button is 15 px, with a 25 px hit area.

**Deviations from the brief:**
- **HUD_FOREARM and `fromShoulder` are gone.** At full length (1) they did nothing. A pointing or explaining arm would reach into her bubble, so `panjim.css` shortens that one arm about the shoulder (`scale(0.4)` tip, `0.55` explains, `0.75` celebrates); every other pose is full length.
- **Warning and celebrates raise only the right arm.** Raising the binoculars arm swung them out of her box and over her head. The binoculars hand is her resting arm.
- **The wave swings 10° (-148° to -158°),** not 22°: at -172° the full-length arm lay along her cheek.
- **The crop is 168 × 442 art units from y34** (was 158 wide): room for the wave and the shoulder-high hand.
- The reference copy in `docs/design/` is the new one with the rounder chin.

# Section 1d — one guide: Maya says everything the Discovery card said

Branch `section-1d-one-guide`, off master `0ba9d9d` (Section 1c's merge).
Headless Chromium with software GL (about 1 fps, so the browser tools are slow). Everything is in `docs/qa/section1d/`; the wording before and after is `wording.md`.

| Gate | Result |
|---|---|
| tsc, tests, build, walkthrough | Clean. 419 tests pass (6 skipped). New: `discoveries.test.ts` (8: one line per element in the right state, the count is made when she says it, the pick order is kept, nothing without a Maya, replay, the queue order, the director's order, and the card's classes and label are gone from the source). Rewritten in `facts.test.ts`: every shown fact is 20 words or fewer, none opens "In this game", a rule has no citation, her tips are rules or guidance, none of her lines runs over 25 words. |
| One of each element (`tools/section1dChecks.ts`, `checks.txt`) | 97 checks pass. A real build of each of the ten elements: Maya says one of its facts, ten different facts in all, in her tip state (worried for the resort, sand mining and the yacht), once, with "N of 21", a Source button on a cited fact and a "Game rule" tag on a rule, and no card or label left on screen. |
| Warning and fact together | The warning is said first, the fact is next in her queue and is said at the next quarter. |
| Keyboard and reduced motion | Tab from her minimise button reaches Source, then Got it; Enter on Source opens the Sources screen (her line goes away) and Esc closes it. Esc and Got it dismiss, with and without reduced motion. A line waits past its reading time while focus or the pointer is in the bubble. |
| axe-core | No violations on her bubble with a cited fact up and with a game rule up. |
| Field Guide | Shows her count ("11 of 21") and keeps each fact as a note that she says again. |
| Text size | 12 px at least in every part of the bubble at 1366×768, 1920×1080 and 2560×1440 (her name label is 10 px). |
| Screenshots | `discovery-fact-*` and `discovery-rule-*` at the three sizes, each with a `-gray` copy; Maya at 45%. |
| Label overlap (`npm run test:labels`) | **37 of 37 pass**; label layer at most 7.3 ms a frame. |
| Maya layout (`npm run test:layout`) | **105 of 105**, with a discovery (the tallest cited fact) in place of her tip in half the cases. |
| Credits and Sources (`tools/creditsCheck.ts`) | Pass. Its check of the Sources list had been counting the map-data entries since Section 3; it now counts the cited facts only. It now reads Source from Maya's bubble. |
| Leftovers | No "New discovery" text, `nugget-badge`, `nugget-source` or `nugget-credit` anywhere in `src`, `tools`, `tests`, `index.html`, the docs or the built bundle. |
| Console errors | None. The Tutorial loads, with its coach and no card or bubble. |
| Frame rate, 1920×1080 | Her cost 0.07 fps (1.60 shown, 1.67 hidden); her figure alone 1.6 fps now and on master; SVG nodes 425 and 425. |
| Cross-browser | Chromium only. |

**Decisions and deviations:**
- **`MAYA_SCALE` is 0.45** (it was 0.7), taken from the brief's "Maya at 45%". The bubble keeps a 190 px minimum width, and her badge (30 px) and minimise button (14 px, 26 px hit area) keep a minimum size.
- **The Tutorial has no Maya,** so it no longer shows discoveries; its coach is its one voice.
- **Muting or minimising Maya** holds the facts back with her lines.
- **A discovery skips the two-quarter rest between tips,** and goes ahead of ordinary tips but never ahead of a warning; the one-line-a-quarter limit still holds.
- **The four "In this game," tips were rewritten** and tagged "Game rule", so the khazan tip still matches the khazan rule word for word.
- **Each discovery is kept as a Field Guide note** (so it can be heard again), and the guide shows her count.
- **A fact is counted when she says it,** not when it is picked.
- **A line is not repeated within a session:** after every fact of an element has been said, a further build says nothing.

# Section 1e — Maya: 30% smaller, locked in place, no glitching

Branch `section-1e-maya-locked`, off master `5490cdf` (Section 1d's merge).
Headless Chromium with software GL (about 1.5 fps with the city on screen, so a 60 fps recording is not possible here). Everything is in `docs/qa/section1e/`; the cause of the glitching, and the evidence, is `FINDINGS.md`.

| Gate | Result |
|---|---|
| tsc, tests, build, walkthrough | Clean. 428 tests pass (6 skipped). New or rewritten: `mayaLocked.test.ts` (4: the travelling code is gone from the source, the figure is placed by CSS and never by script, only the HUD is watched, at most one layout a frame); `mayaLayout.test.ts` (her home is the bottom-left corner on whole pixels, nothing changes it, her scale is in one place, her bubble flips above her and never moves her); `mayaArt.test.ts` (her figure is a stack of layers, 73 nodes, each layer turns about the point the art says). |
| Permanent stability test (`npm run test:maya`) | 38 checks pass. In each of seven states, over 10 seconds: her figure's rectangle never moved, she stands 12 px from the left and 12 px from the bottom, on whole pixels. Idle for 3 seconds on a still page: stable. With her animations off, no pixel of her changes between photographs, in any state. The Tutorial loads. Zero console errors. |
| Before and after (`stability-before.md`, `stability-after.md`) | Layouts a second: 1.0 to 1.2 before (one per frame; 60 a second on a real display), **0 after while she is idle**, about 0.35 while a line is up. Her box before: 78.375 x 205.906 px; after: 54 x 142 px at 12, 926. With animations off, one pixel changed in her warning state before; none in any of the seven states after. |
| The cause | The map's labels write `class` on every frame (30 writes a frame), which fired her layout observer every frame. Her one SVG of 425 nodes was repainted every frame by its animations (48 fps alone against 60 without), and the live drop-shadow filter cost about 5 fps more. Both are fixed; see FINDINGS.md for each of the seven suspects and which were real. |
| Frame rate, 1920x1080 (`tools/mayaPerf.ts`) | Her figure alone: **60.0 fps now, 43.9 fps on master** (an empty page: 59.9). In the game (Panaji, Medium): her cost 0.00 fps (1.57 shown, 1.57 hidden); 0.07 before. HUD figure nodes 425 → 73. |
| Contact sheet | `maya-states.png` (+ gray), her seven states in the game at 1366x768. The eighth, jump, no longer exists. |
| Screenshots | `idle-*` and `warning-*` at 1366x768, 1920x1080 and 2560x1440, each with a `-gray` copy. Her box is the same with and without the warning at every size (checked in the tool). The street-map switch and credit stand to her right; the bubble is beside her and clear of the HUD. |
| Zoom crops | `maya-zoom-1920x1080.png` (the pixels on a 1x screen, enlarged 8x with no smoothing) and `maya-zoom-dpr2.png` (a 2x screen). At 1x her face (about 17 x 24 px) reads as a face; the binoculars read; the fingers do not. On a 2x screen all of it reads. The scale was not changed. |
| Label overlap (`npm run test:labels`) | **37 of 37 pass.** During a warning's camera glide, frame by frame, no overlap, and she does not move. |
| Maya layout (`npm run test:layout`) | **105 of 105**, now also asserting at every case that her figure (or badge) is at her home, on whole pixels, and clear of every other HUD element. |
| Cross-browser | Chromium only. The layers' pivots are percentages of their own box, so they no longer depend on `transform-box: view-box`; only her eyes and brows still do. |

**Deviations and things to know:**
- **`MAYA_SCALE` is 0.315** (0.45 × 0.7), the one constant. Her badge (30 px) and minimise button (14 px, 26 px hit area) keep a minimum size, and her text stays 12 px.
- **The street-map switch and credit moved right** (`--maya-reserve`) so that nothing covers her home.
- **Celebrates still bounces** (2 px, in place); the box she stands in does not move. The head no longer nods.
- **Her figure's shadow** is baked into each of her pictures, on the hair, legs, shirt and arms, instead of one filter on the whole figure.
- **Lines held back:** if no bubble spot is free beside her (a tiny window), the line waits; she does not move to make room.
- **The map's name labels** rewrite their `class` on every frame (480 writes in 16 frames). They no longer touch her, but it is a cost of their own, and is not changed here.

# Section 1f — Minimal HUD: two panels, each shut to a small button

Branch `section-1f-minimal-hud`, off master `2ea1beb` (Section 1e's merge).
Headless Chromium with software GL. Everything is in `docs/qa/section1f/`.

| Gate | Result |
|---|---|
| tsc, tests, build, walkthrough | Clean. 436 tests pass (6 skipped). New: `hudPanels.test.ts` (8: the obstacle lists, elements moved not rebuilt, 36 px round buttons with no text, names and focus ring, the 180 ms transform-and-opacity open and its reduced-motion and calm-motion form, Esc and outside press, no storage, the danger mark's shape and ring, the jar's gain). |
| Browser checks (`tools/section1fChecks.ts`, `checks.txt`) | 61 checks pass. |
| Screenshots | `shut-`, `status-open-`, `settings-open-` and `both-shut-` at 1366x768, 1920x1080 and 2560x1440, each with a `-gray` copy. With both shut the map, the labels and Maya are unobstructed: all that is left is two 36 px buttons. |
| The buttons | Both 36 x 36 px, no text and no number, the names "Status" and "Settings" (aria-label), aria-expanded false and true, a tooltip only on hover and keyboard focus, a visible focus ring. A shut panel is just its button (36 x 36). |
| Out of the way while shut | The instrument cluster, coin jar, Field Guide button, the toggle row, and Show risk, Maya, Sound and Quality are not rendered. |
| Keyboard | Tab reaches both buttons; Enter and Space open; Esc closes and returns focus to the button; R, M and S toggle Show risk, Maya and Sound with both panels shut, with Status open and with Settings open; opening one closes the other; a press on the map closes an open panel. |
| axe-core | No serious or critical violations: both shut, Status open, Settings open. |
| Danger mark | Not shown on a calm load. Shown on the shut Status button for a fall in Resilience (until the panel is opened) and for a storm warning (still shown after opening, while it is up); its name becomes "Status: danger". It is a ringed diamond on a lit rim: readable in `danger-resilience-1920x1080-gray.jpg`. |
| The jar's gain | A "+N" floats beside the shut Status button and is gone in about a second (`gain-pop-1920x1080.jpg`). |
| Risk wave | `tools/riskIntroCheck.ts` passes with its target updated: with Settings shut the wave flies to the Settings button (and lands on it); with Settings open, to the Show risk control. |
| Label overlap (`npm run test:labels`) | **37 of 37**; label layer at most 5.8 ms a frame. |
| Maya layout (`npm run test:layout`) | **105 of 105.** |
| Tutorial | Loads with its own HUD as it was: no panels. |
| Console errors | None. |
| Cross-browser | Chromium only. |

**Decisions and things to know:**
- **The Settings button is under the Houses counter, not in the very corner:** the top-right corner is held by Back and Help, so the button stands where the toggles stood (134 px down). Its panel opens downward from it.
- **Opening Status moves the cluster down 44 px** (it opens under its button, where it used to stand at the corner).
- **The cluster's own collapse (its chevron and pill) is hidden inside the panel:** the panel is the collapse now. The elements are the same ones; nothing was rebuilt.
- **Tutorial:** the panels are Panjim's only; the Tutorial keeps its cluster, as it has no coin jar, Field Guide or toggles.
- **The jar's gain floats when coin lands in the jar and when it is banked,** not on the first look at load.
- **What counts as danger:** a storm warning up (the heat is on), or a fall in Resilience since the panel was last opened.

# Section 5 — yearly turns, coins off, instant defences

Branch `section-5-yearly-turns`, off master `895a487` (tag `pre-section-5`;
the git proxy refuses tag pushes, so `backup/pre-section-5` on GitHub marks
the same commit). Headless Chromium with software GL. Evidence in
`docs/qa/section5/`.

| Gate | Result |
|---|---|
| `tsc --noEmit` | Clean. |
| `npm run test` | 433 pass, 6 skipped (the existing hand-edit skips in `mapgen.test.ts`). New or rewritten: `actionRun.test.ts` (the yearly clock, the cap, Next year at 0/1/4 builds, demolition and repair, homes not demolishable, coins off, growth off, a defence built in the storm's year at full strength), `climate.test.ts` (the fixed calendar, every seed meets the same storms at turns 5/15/25 and 1.2/1.8/2.6), `exposure.test.ts` (heat equals loss, exactly), `tutorialLocked.test.ts`. |
| `npm run build` | Clean. |
| `npm run walkthrough` | Clean: 8 screenshots, no console errors. |
| `npm run test:labels` | 37 of 37 views; label layer at most 5.7 ms a frame. |
| `npm run test:layout` | 105 of 105 layouts. |
| `npm run test:maya` | Pass, after a fix to the tool (below). |
| `npm run verify:maya` | All checks pass; in the browser the cyclone's heat showed 28 houses at risk and the storm took those 28; the flood 33 and 33. |
| Section 5 browser checks (`tools/section5Checks.ts`, `checks.txt`) | **41 of 41.** |
| Tutorial (`tools/tutorialDiff.ts`, `tutorial/diff.txt` and `*-diff.png`, magenta where a pixel differs) | Against the `pre-section-5` build, five states (brief, coach steps 1 and 2, a tile's build menu, How to Play): **text identical, 0.000% of pixels differ** by more than 24/255 in every one. Its level entry and map are pinned by `tests/tutorialLocked.test.ts`. |
| axe-core | No serious or critical violations: the board at the start, Status open, the build menu with no builds left. |
| Console errors | None in any run. |
| Bots, 20 seeds (`bots.md`) | Run and recorded. Balance is not tuned here (Section 7): Casual 58%, Greedy 45% (6 of 20 above Casual), Smart 98%, do-nothing 0%. |
| Cross-browser, real GPU | Not run: Chromium with software GL only (Firefox and WebKit are not installed here; no GPU). |

**What the browser checks prove** (`checks.txt`):
- The clock reads "2026 Year 1 of 25"; "Builds left this year 4 of 4"; "Next: Cyclone · end of 2030 · mild · 5 years"; one Next year button.
- Four builds go through in 2026, a fifth is refused; the build menu then says "No builds left this year. Press Next year to go on." with every option disabled, and its Next year button moves to 2027 with four fresh builds. Next year works after 0 and 1 builds too.
- Building never changes Coin (10000 throughout).
- **No coin, price, cost, reward, earning, growing or quarter wording** in the visible text, labels, titles or any tooltip on screen, and no coin jar, price column, reward, "growing" or Coin counter drawn, in 15 states: the brief, the board, Status, Settings, How to Play, the build menu, the menu with no builds left, an info card, two years before the cyclone, its year, mid-storm, the storm's replay, the Aftermath, after the storm, the finale card, the results.
- The cyclone resolves on Next year in 2030 (the Aftermath reads "end of 2030", Replay offers 2029) and the run goes on in 2031; all three storms resolve by the finale.

**Screenshots** (`start-`, `menu-`, `status-`, `heat-`, `brief-` at 1366x768, 1920x1080, 2560x1440, each with `-gray`; `-deut` copies of `start-1920x1080`, `heat-1920x1080` and the key shot `cap-1920x1080`). Looked at, and fixed what was wrong:
- the build menu's options were centred once the price column went: left-aligned (scoped to Panaji's coin-free menu);
- the Outlook's year labels were hidden under the storm pins, and all three pins pulsed for the whole run (every storm was "locked"): pins now sit in the top of the track above the labels, and only the next storm inside its warning glows (still under reduced motion);
- the "Cyclone landfall" label sat under the warning banner at 1366x768: it is kept below the banner;
- at two years out the heat was too faint to hatch, so it read by colour alone (seen in review): two years out is now 35%, over the hatch line;
- still true and noted: a focused control's tooltip shows after a click (by design, from Section 1f); the warning banner and the build-cap banner are transient.

**Independent review (Section 5): 0 BLOCKER, 1 MAJOR, 5 MINOR, 8 NIT; all fixed except where noted.**
- **MAJOR, free demolition:** demolishing cost nothing, so a player could clear the houses the heat marks and take three stars without a defence. Demolishing now uses one of the year's builds, and the city's homes cannot be demolished.
- **The Outlook moved to the next year while the storm was still staged:** it now reads the storm's year until the new year ticks in.
- **No hatch in the first warning year:** fixed (above).
- **The landfall label under the banner:** fixed (above).
- **QA record and bots:** this section and `bots.md`.
- **Reload lost the years since the last storm:** the run is saved on every Next year and after a Replay; old quarterly saves are cleared.
- **NITs fixed:** the seed test now also pins that no seed reaches the calendar; the new CSS rule is scoped to Panaji's coin-free menu; the dead landfall-cone overlay and its helpers are gone; stale "quarter" wording (coin jar, heat overlay, growth) and the save comment are corrected; "three storms" is no longer written into the Outlook, Help or the readiness tooltip; the seawall's "strong at once" is now "strong, but".
- **NITs left:** the finale's Livelihoods bar still comes from the city's income, which is not shown while coins are off (it is a count in the Panjim 2050 index, not a price); the container's Chromium path in the walkthrough and map generator follows the other tools' existing pattern.

**Fixed in the QA tools while running this gate:**
- `walkthrough` and `mapgen:panaji` launched Playwright's bundled headless shell, absent here; they now use the container's Chromium when present, like the other tools.
- `test:maya`'s reduced-motion pass compared a 40 px margin of the moving board round Maya, so a passing boat failed "no pixel of her changes" (it failed the same way on the untouched `pre-section-5` build). It now hides the board's canvas while photographing her, so only her pixels are compared: 0 changed in every state.
- Two first runs of `test:maya` and `verify:maya` were void: the source was being edited, and the dev server reloaded the page under them. Both were re-run on the final source.
