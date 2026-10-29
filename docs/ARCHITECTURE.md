# Architecture

How the pieces fit, and why they are arranged this way.

## Layout

```
src/
  core/       pure game logic — no DOM, no Three.js, no network
    hex.ts            axial hex math
    gameState.ts      the board: tiles, elements, meters
    elements.ts       element roster loaded from data
    hazard.ts         flood / cyclone resolution
    scoring.ts        the four-meter era score
    objectives.ts     level win conditions          (new)
    runStats.ts       per-run event log             (new)
    levelScore.ts     level score + stars           (new)
    rng.ts            seeded, deterministic RNG     (new)
    exposure.ts       warning heat: computeExposure runs the real zone
                      resolver on a copy (tile probe), heat ramp, shields
    prep.ts           "Get ready" jobs for the next storm, from its exposure
    mayaLines.ts      Maya's words from game data: hotspot, place, Aftermath
  render/     Three.js scene and mesh managers
    heatOverlay.ts    the warning heat: one instanced layer, one shader
    townGeometry.ts   the seven building kinds and the garden
    townDecor.ts      roads, bridges and gardens (instanced)
    ambientLife.ts    walkers and boats (instanced)
  ui/         HUD, popovers, modals
    theme.css         the interface's colour tokens, calm and storm (Section 33)
    harbour.css       the shapes panels and buttons share (Section 33)
    screens/          full-screen shell surfaces    (new)
  levels/     campaign definitions, map registry, progression
    levelMap.ts       which board each level plays on
    townLayout.ts     Panjim's town plan: building kinds, colours,
                      gardens and roads, deterministic from the seed
  services/   Firebase, auth, leaderboard, storage
    playerRegistry.ts name/age/email collected before the first level
  app/        entry, shell, and the game session
  data/       authored JSON: elements, levels, nuggets
    maps/             one file per board — generated, never hand-edited
```

The `core/` rule is the important one and it predates this pass: nothing in
there imports a renderer, a DOM node or a network client. That is what lets
the whole objective/scoring/progression system be unit-tested in Node with
no browser, and it is why the new pure modules were put there rather than
alongside the UI that uses them.

## The dependency direction

```
main.ts → appShell → gameSession → render/ + ui/ + core/
              ↓                          ↓
          services/ ────────────────→ levels/ → core/
```

Nothing in `core/` imports from `levels/`, `services/`, `ui/` or `app/`.
`levels/` imports `core/` only. Services import `levels/` for types. The
arrows never point back.

## The three big structural changes in this pass

### 1. `main.ts` became `app/gameSession.ts`

It used to be the entire game: 1,100 lines that built a Three.js scene at
import time, read fixed hazard constants, and ran one endless sandbox until
the tab closed.

It is now `startGameSession(options)` — a function taking a `LevelDef` and
returning a handle with `dispose()`. The body is the original game loop
near-verbatim; what changed is that everything which was a module-level
`const`/`let` is a local of the function, so two sequential runs are
genuinely independent rather than sharing stale state.

`dispose()` is not optional bookkeeping. Browsers cap live WebGL contexts
(around 16) and silently drop the oldest past that, so a campaign that
starts a scene per level *must* hand each one back. `createScene` grew a
matching `dispose()` that stops the render loop, aborts every listener
(including the `window` ones, which outlive the canvas and are the ones
that actually leak) and releases GPU resources.

### 2. Levels are data

`src/data/levels.json` holds the campaign. A level defines starting Coin,
hazard cadence and severity, its objectives, its turn par, and its star
thresholds. `gameSession` reads those; it has no per-level branches at all.
Adding level 9 is a JSON edit plus a test run.

Objectives are a discriminated union with one `evaluate` switch
(`core/objectives.ts`), following the same rule `GameState.meterTotal()`
already set for meters: new content is data, not engine code.

### 2b. Maps are data too, and there are nine of them

`levels/levelMap.ts` is a registry: a level names a `mapId` and the session
builds everything — game state, terrain meshes, hazard propagation, the
camera — from that map's tiles.

This replaced a windowing function over a single authored coastline. One map,
cropped to a radius that widened through the campaign, solved onboarding and
nothing else: every level was the same place at a different zoom. The
`mapRadius` machinery is still there and still tested, because it remains the
right answer for a level that wants one corner of a large map; no level uses
it today, since each map is sized to the level it belongs to.

Eight of the nine maps are real stretches of the Goan coast. They are
**generated, never hand-edited**: `tools/mapgen/cities.ts` holds traced
coastlines, river centrelines and beach strips in latitude and longitude, and
`tools/mapgen/buildCityMaps.ts` rasterises them onto a hex grid at 400–520 m
per tile. The ninth is a 63-tile teaching diagram authored as an ASCII picture
in `tools/mapgen/buildTutorialMap.ts`.

Keeping the coordinates upstream of the tile data is the point. A list of
hexes with terrain ids is useful to the game and useless to a human trying to
check whether Miramar is on the right side of the Mandovi; a list of
coordinates can be pasted into a map and compared against the real thing.

Two independent layers stop a broken map shipping, and they answer different
questions:

- The generator refuses to call a map finished if it is missing any of the
  five terrain types, if a river has come out as a dashed line, or if a
  landmark has drifted into open water. That is *is the geography drawable*.
- `tests/levels.test.ts` checks each LEVEL's objectives against the tiles of
  the map it was assigned. That is *is the level winnable*, which a perfectly
  good map can still fail.

### 3. Hazard severity is seeded

The prototype called `Math.random()` for severity. That is fine for a
sandbox and wrong the moment scores are compared: two players "on level 3"
must be playing the same level 3. Severity now comes from a `mulberry32`
generator seeded on the level id, so the storm sequence is identical for
everyone — which is also what makes a bug report reproducible.

### 3b. Storms are drawn from their own resolution

A Panjim 2050 storm is decided once, when it lands, and then shown.

**Resolving** (`core/stormRecord.ts` → `resolveStorm`):
- runs the zone resolver exactly as before, with its tile probe listening;
- also resolves the same storm on copies of the board as it stood before:
  with no defences, and with each kind of defence removed in turn;
- the copies feed the Aftermath replay, Maya's line and the storm card,
  which therefore quote real numbers.

**Depth** (`core/hazard.ts`):
- `buildDepthField` turns the probe's per-tile intensities into water depth
  over time;
- `surgeDepth`, `floodDepth` and `combinedDepth` read it;
- 1 is the depth at which a house is lost, so houses hit ⇔ depth > 1.

**Script.**
- `core/stormScript.ts` derives the timed moments from the resolution:
  houses going, tested defences answering, the slow-motion beat, lightning.
- `core/stormReplay.ts` writes the replay's captions.

**Showing** (`app/stormDirector.ts`):
- plays the record on one storm clock, driving
  `render/storm/stormWater.ts` (one instanced draw),
  `render/storm/stormSky.ts`, `StormManager` (weather, capped darkness,
  flash and shake) and `ui/stormSound.ts`;
- nothing in the render layer computes a depth of its own.

**Checks:** `tests/hazardDepth.test.ts`, plus the browser comparison in
`tools/qaFunctional.ts`.

**Sheltered tiles** (Section 23.1, a game rule): a challenge may list
`shelteredTiles` in `levels.json` (the 2050 storm: the sheltered middle of
Taleigao). `shelterOf()` (`core/climate.ts`) turns them into
`StormInput.sheltered`; `core/hazardModel.ts` leaves no water or wind on
them. Every caller that resolves, previews or draws a storm passes it (the
resolver, `computeExposure`, `resolveStorm`, `forecastCone`, the objective,
the bots), so the preview still equals the resolution
(`tests/section23.test.ts`).

## The interface's look: tokens and the storm class (Section 33, Harbour Morning)

Every interface colour is a CSS variable in `src/ui/theme.css`, imported once
in `src/main.ts` before the sheets that use it. `hud.css`, `panjim.css`,
`screens.css` and `harbour.css` name no colour of their own;
`tests/theme.test.ts` fails on any hex, `rgb()`, `hsl()` or named colour in
them, and on any colour variable that is not a token.

Since Section 33b the values are **Tone A, Sand and Sea** (owner decision): the
interface takes its colours from the map (sand panels, sea-teal bands and
buttons, the dusty blue gone). The names are Section 33's; only the values
changed, and `--panel-edge` (the HUD card's and the objective's 1 px edge) and
`--hud-shadow` (the HUD card's soft shadow) were added.

- **Harbour tokens** (`--panel`, `--panel-edge`, `--panel-raised`, `--panel-shadow`, `--band`,
  `--band-ink`, `--ink`, `--ink-2`, `--ink-3`, `--accent-ink`, `--button`,
  `--button-border`, `--button-on`, `--button-on-border`, `--cta`,
  `--cta-shadow`, `--cta-ink`, `--warn`, `--warn-soft`, `--warn-ink`,
  `--gold-soft`, `--stitch`, `--good`): calm values on `:root`, storm values
  on `:root.storm`. Every text and background pair the CSS uses is checked for
  4.5:1 (3:1 for large text) in both moods by the same test.
- **Details** (`--cta-stitch`, `--mesh`, `--mesh-dot`, `--overlay`) and the two
  font tokens (`--font-head`, Zilla Slab; `--font-body`, Work Sans, both
  bundled with @fontsource so the service worker caches them).
- **Fixed tokens** (`--fixed-*`): colours that are not the interface's (the
  forecast cone's bands and preview map, the map's place labels and the
  objective's pins, the lightning, the letterbox, the arrival edge, the risk
  intro's Low-quality ball, Maya's shadow). Their values are the ones the
  sheets had; they are the same calm and storm. Nothing under `src/render/`
  reads any token.

`src/ui/harbour.css`, imported after the three sheets, holds the shapes many
components share: the cream panel with its flat shadow, the header band and
its dashed stitch, the large modal cards' `--warn` and mesh strips, the
overlay, secondary buttons and chips, the one main action (`--cta`), build
cards, the focus outline, tooltips and map notes. Each component's own sheet
keeps its size and layout. Canvas pictures (the share card, the storm card)
read the tokens at draw time with `src/ui/themeColor.ts`.

**The storm class.** `PanjimController.stormHues(on)` puts `storm` on `<html>`
when a storm starts playing (Panjim and the Tutorial) and takes it off when its
result cards open, and on leaving. The tokens that change are registered with
`@property` as colours, so the variables themselves fade over 600 ms and every
panel follows; nothing moves. With Calm motion on the controller also sets
`storm-instant` (and the system's reduced motion has the same effect), and the
change is at once. During the storm the Homes at risk box wears a 3 px `--warn`
ring at 30%. `tools/section33Storm.ts` checks all of it in a browser.

## The game screen's layout (Section 33b; corners swapped in Section 34c)

Owner decisions: every status and the objective live in **one static card in
the top right corner** (Section 34c.2; it was top left), which never
collapses, never moves and stays during storms; **Maya lives in the bottom left
corner** (Section 34c.2; it was bottom right); the OpenStreetMap credit is in
the bottom right.

- **The HUD card** (`.panjim-clock`, `src/ui/panjim/clockHud.ts`, styled in
  `panjim.css`): 14 px from the right, 12 px from the top, 300 px wide (Section
  34c.1; it was 400), as tall as its content (about 300 x 250 at 1366x768 with a
  four row objective); no header band, stitch or strips. Line 1 is a small grid:
  the year (34 px) with ? and ☰ beside it, and under it "Year N of 25" and the
  countdown chip (`OutlookBar.mountCountdown`) on one line at 13 px. The face
  (`.clock-face`) is `display: contents`, so the year and the turn are the
  grid's own cells; the clock tooltip sits on them. ? and ☰ are the existing
  `.hud-chrome` and ☰ panel, moved into `clock.chromeSlot`; ☰'s menu opens
  under it and hangs leftward, inside the window. Line 2: the timeline
  (`OutlookBar`): a dot at each storm year whose tooltip (`markerText`) says
  which storm and how it went, small dots at 2035 and 2045, a mark for the
  current year. Line 3: Biodiversity and Homes at risk, one row of two boxes.
  Below a divider, `clock.objectiveSlot` holds the objective (`GetReadyPanel`,
  title 14 px, rows 13 px, at most two lines a row) or, in the Tutorial, its
  caption and checklist (`TutorialPanel`): the old bottom right objective
  panel is hidden in the Panjim game (it remains for the old levels). Larger
  text scales the same layout. In the page the card comes before the board, so
  the keyboard goes card, board, Maya, as the screen reads.
- **The era banner** sits left of the card at every width (`right` = 14 + 300 +
  16 px), centred in the space it has.
- **Maya** (`mayaLayout.ts homeRect`): `HOME_MARGIN` in from the left and the
  bottom; her bubble opens to her right, else above her; her minimise button is
  on her right shoulder as the viewer sees her. `HUD_OBSTACLES` names the HUD
  card at its full size. The street map corner (its credit; the switch is in
  ☰) is in the bottom right.
- **The hint** (`.empty-prompt`) is a 40 px pill at the bottom centre, until
  the run's first build.
- **The build menu** opens beside its tile with a pointer on the side facing it
  (`pointer-left`/`pointer-right`, `--pointer-y`), and keeps off the HUD card,
  Maya and the hint. A note beside a tile goes to the tile's left when it would
  run under the card.
- **A phase's opening view.** `showConeIfPhaseStart` frames the forecast (its
  arrows and the land they cross) and passes those points, with the places the
  objective pins, to `frameWorld`, which asks the scene (`keepClearOf`) for the
  smallest pan of where the camera looks (never its distance or angle). It
  tries, in order, the first a pan can clear winning: the forecast with the
  objective's places and the main town names; with the places; the forecast
  alone; the arrows with the places; the arrows alone. The places and names are
  secondary points: never under the HUD card or Maya, but they never push a
  forecast point off the screen. A point over the card at the screen's top edge
  counts as hidden by the card.
- **The heat years' camera move** (Section 34b.3): once a storm, to its hot
  tiles; with the objective done also to Get ahead's pulsing tiles, centred
  between the two sets, or to them alone when nothing is hot (Section 34c.4).

## Navigation and history

`AppShell` keeps the current screen in a field, and for a long time that was
the whole story — which meant the browser knew nothing had happened. Pressing
Back left the site, and inside a level there was no visible way out at all
except a small unlabelled cross in the objectives panel.

Both are now the same mechanism. Every navigation goes through `enter()`,
which writes a history entry and encodes the route in the URL hash:

```
/                      menu
#/levels               level select
#/play/<levelId>       a run
#/leaderboard[/<id>]   the boards
#/settings  #/signin  #/signup  #/start[/<levelId>]
```

The hash rather than the path, for two reasons: the game already uses query
parameters for its dev flags (`?debughazards`, `?flood=N`) and keeping routing
out of the query string means neither can clobber the other; and a hash cannot
404 on a static host however the rewrites are configured. The menu is the one
exception — it gets a bare URL, because that is the address being handed out
and it should not rewrite itself into something uglier on load.

Three rules carry most of the behaviour:

- **The in-app Back control defers to the browser.** `goBack()` calls
  `history.back()` rather than navigating to a fixed destination, so the HUD
  button, the Escape key and the browser's own Back cannot disagree about
  where "back" is. At the start of our own history there is nothing of ours
  behind us, so it falls back to the menu — that is somebody who opened a
  level link directly, and they should land on the game, not leave it.
- **Some screens replace rather than push.** The registration sheet, once
  filled in, is not somewhere Back should return to; nor is a finished run.
  Both are replaced by what follows them, so Back from a score sheet reaches
  wherever the player started the level from.
- **`#/results` is addressable but not restorable.** The results screen is
  built from a run held in memory. Landing on that URL fresh gives the menu,
  because there is no honest alternative.

The registration gate lives in `enter()` too, not only on the menu button —
otherwise a pasted `#/play/...` link would walk straight past it.

`tools/walkthrough.ts` covers both exits: that the in-level Back control
returns to the menu, and that the browser's Back button lands on the menu
rather than leaving the app.

## State and persistence

```
GameState        one board, right now. No memory of events.
RunTracker       what happened this run (hazards weathered, defences lost,
                 meter peaks). Feeds objectives and achievements.
PlayerProgress   per-level bests, stars, badges. Persisted.
```

The split between the first two is deliberate: `GameState` is a snapshot
(a destroyed defence simply stops existing; nothing records that it ever
did), and objectives need history. Bolting an event log onto the board
model would have muddied both.

**Section 28.2 (owner decision): nothing about progress is saved on the
machine.** Runs, stars, the Tutorial's "done", achievements and the Field
Guide live in memory for one visit; a reload starts fresh at the menu and
Play Panjim always starts at 2026. `services/storagePolicy.ts` clears the
keys older versions wrote, once on load, and lists the keys still used
(display preferences only). "Try this storm again" (Section 28.1) works
from in-memory snapshots, `ActionRun.phaseSnapshots`, taken at the start of
each storm's phase. The paragraphs below describe the design before that.

`services/profileStore.ts` fronted persistence with **localStorage as the
primary store** and Firestore as a mirror. The game is fully playable —
campaign, unlocks, stars, badges — with no network and no Firebase project
at all. Cloud sync adds cross-device continuity and the shared board; it is
never load-bearing. Writes are local-first and synchronous, cloud-second
and fire-and-forget, so a slow upload never blocks the win screen.

Cloud merges are **best-of per level**, never last-write-wins: someone who
played offline on a laptop and signed in on a phone keeps both halves.

## Points, the board and feedback (Section 35)

Play Panjim counts points (`core/resiliencePoints.ts`) as each storm resolves, inside `ActionRun.land`, from the same
storm record the result cards use: homes saved, iconic places saved (buildings on card 1's list that the storm would
have damaged with no defences, and that stood), the objective done, the living coast standing and protecting (each
dune, pandanus, mangrove or khazan taken away alone and the storm run again), and at the end of 2050 biodiversity
above the start and veterans (defences standing after all three storms). A storm's points live with its record, so
"Try again from {year}" drops them with it. `ActionRun.buildLog` keeps every year's action as played (a retry trims
it). The Tutorial counts none.

**The server replay is the anti cheat.** A client never sends a score. The finale sends the run's build list (year,
tile, element) to `POST /api/board`; the server (`server/handlers.ts`) plays it again on a fresh run started exactly as
the game starts Play Panjim (`levels/panjimRun.ts newPanjimRun`), through the same hazard model, and stores the points
that replay counts (`replayBuilds`). A list that is not a legal run (a build out of its year, on a tile it cannot go)
is refused. `server/` and the core are bundled into `api/_lib/server.mjs` by esbuild (`npm run build:api`), because
the core's path aliases are not read by Vercel's own step; `tests/apiBundle.test.ts` keeps the bundle current.

**Four tables, never joined by a name** (`db/schema.sql`, Neon Postgres):
- `runs`: one row a Play Panjim run (reach, completion, points, stars, builds), by a random id the client makes. No
  name, IP or device.
- `board`: the running board: a name, points, stars, the season label (`BOARD_SEASON`), dated to the day. No run id.
- `feedback`: the form after the game, by run id. No name.
- `rate_limits`: writes per salted IP hash per hour, deleted after a day.
The name a player gives goes only to the board; the runs and the forms, which hold a child's age band and free text,
are by run id alone, so no query can put a name to an age or an answer through a shared key. (The points a run
scored are in both `runs` and `board`, as the brief asks; two runs rarely tie, so the owner should treat the export as
personal data.)

**The edit token.** A board post answers with a random token for its row, kept by the client in memory for that run
only; `PATCH /api/board` with it renames the row (the feedback form's name field). It is never shown, exported or
stored on the machine. Nothing about a run is saved on the machine (Section 28): the name lives in memory
(`services/playerName.ts`) and goes at the menu.

## Sound: the sample bank, the music and the storm's hand over (Section 36)

Every sound goes through the master gain in `ui/audioHooks.ts`, so the Sound switch (S) and the volume slider cover
all of it, and nothing plays before the player's first click or key press (the unlock; `onAudioUnlock` runs what was
waiting for it). Any audio failure is swallowed.

- **The sample bank** (`ui/sampleBank.ts`): the recorded sounds in `public/sound/`, each as Ogg Vorbis and as MP3 (the
  MP3 when `canPlayType("audio/ogg; codecs=vorbis")` is empty: Safari). Each is fetched and decoded once, by name,
  into an AudioBuffer on the context from `audioOut()`, never before the unlock, so first paint never waits for a
  sound. A Panjim or Tutorial session asks for all eight once the player has clicked: the seven short ones together,
  the music last. A sample that fails resolves to null and is skipped. The service worker precaches `public/sound/`
  with the rest of `public/` (both formats, 5.3 MB).
- **Build sounds**: `playSample(name)` plays a one shot at 0.8 of the master, at most two at once (a third is
  dropped), each with a random pitch of ±4%. `BuildSounds` (one a session) maps a defence to its sound: seawall,
  breakwater and small dam their own recording, the living coast (mangrove, khazan, dune, pandanus) the next call of
  a fixed bird cycle, so no call repeats twice in a row. `gameSession.playBuildSound` plays it where the defence lands,
  in place of the synthesised `"build"` tone, which stays for everything else (and for a build before the sample has
  loaded: one or the other, never both).
- **The music** (`ui/music.ts`): one loop under its own gain into the master. Its level is a pure state machine
  (`MusicMachine`: `"off" | "full" | "soft"`, 0, 0.35 and 0.2 of the master; fades 2.5 s out, 4 s in, 1.5 s between
  full and soft, 1 s on closing). The audio side only follows it with `setTargetAtTime`. The loop's last half second
  fades out, so two sources take turns, each next one starting 1.5 s before the current ends, crossing over with
  equal power curves; there is always one pass queued ahead, from the previous pass's `onended`.
- **Where the storm takes over**: `panjimFxBegin` sends the music off (its fade rides the storm's lead in, and
  `ui/stormSound.ts` plays the storm, unchanged); the storm director's `"end"` cue (beside `stormSound.quiet()`)
  brings it back to full, through the result cards (`panjimFxEnd` does the same for a storm staged without the
  director). `calmEnding` (the finale) makes it soft, and it stays soft on the finale card and the form. The session's
  `dispose` (Exit, Leave, Start again, Play again, the idle reset to the menu) closes it: a 1 s fade, then the loop
  stops; the next session opens it again. The menu and the level select open no session, so no music.
- `__audioForTest()` (QA hooks only) adds the music's state, its last events and the samples played;
  `tools/section36Shots.ts` is the browser pass.

## The Spark constraint

Firebase's free tier has no Cloud Functions, so there is no trusted server
to validate a score. Every integrity guarantee lives in `firestore.rules`:
shape, range, ownership, server timestamps, a 5-second write rate limit,
and improvements-only updates. The remaining gap — a determined player can
still submit an in-range score from the console — is documented in
`DEPLOY.md` along with the Blaze-tier fix.

The quota also shaped the data model: one leaderboard document per player
per level (bounded by player count, not by play volume) and `limit(25)` on
every read.

## Firestore shape

```
players/{uid}                          private; totals + badges
players/{uid}/progress/{levelId}       private; per-level best
playtesters/{uid}                      private; name, age, declared email
leaderboards/{levelId}/entries/{uid}   public read, owner write
globalEntries/{uid}                    public read, owner write
daily/{dateId}/entries/{uid}           public read, owner write
```

`playtesters/` is the sign-up sheet collected before a player's first level.
It is flat and uid-keyed so the whole list reads as one page in the Firebase
console, which is the only reason the data is in the cloud at all.

It holds personal data, including a minor's age whenever a child plays, so the
separation from the public collections is structural rather than conventional:
the leaderboard rules accept `displayName` and nothing else, so no client
change can leak an age or an address onto a public board. Its `email` is
deliberately NOT validated against `request.auth.token.email` the way the one
on `players/` is — it is an address somebody typed into a form, nothing
confirmed it, and the client calls it `declaredEmail` so no later caller can
mistake the two.

## Testing

`npm test` runs vitest against `core/` and `levels/` — pure logic only, no
browser. The suites added in this pass:

- `objectives.test.ts` — every objective type, including that a completed
  objective cannot un-complete when a meter falls.
- `progression.test.ts` — unlock rules, best-of merging, and that a worse
  run never removes progress.
- `levels.test.ts` — data integrity: every level names a map that exists,
  references real elements, asks only for what that map can physically host,
  and only for meters some element actually produces.
- `playerRegistry.test.ts` — the registration validators, which stand between
  a player and the game and so are mostly tested for what they must NOT
  reject.
- `levelScore.test.ts` — star bands, bonus conditions, and that the total
  stays under the ceiling the security rules enforce.

The "meters some element actually produces" check exists because of a real
bug found during this work: Carbon was wired through the HUD, the era score
and the balance harness, but no element granted it, so it read 0 forever.
See the note in `PROGRESS.md`.

### What unit tests cannot cover

Everything above runs without a browser, which is its strength and its limit:
a map file the renderer cannot place, a level that starts but never draws its
brief, or a camera that frames a 350-tile board at a tenth of its size are all
invisible to vitest.

`npm run walkthrough` (tools/walkthrough.ts) closes that gap. It drives a
headless browser along the route a player actually takes — menu, registration
sheet, tutorial, a real build on each terrain type — then starts all eight
campaign levels in turn so every map is rendered and photographed at least
once, failing on any console error and reporting which screen produced it.
Each level is wrapped on its own, so one bad board is recorded and the survey
continues rather than stopping at the first failure.
