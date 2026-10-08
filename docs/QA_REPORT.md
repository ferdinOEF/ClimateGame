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
