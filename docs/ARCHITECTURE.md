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
  render/     Three.js scene and mesh managers
  ui/         HUD, popovers, modals
    screens/          full-screen shell surfaces    (new)
  levels/     campaign definitions, map registry, progression
    levelMap.ts       which board each level plays on
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

`services/profileStore.ts` fronts persistence with **localStorage as the
primary store** and Firestore as a mirror. The game is fully playable —
campaign, unlocks, stars, badges — with no network and no Firebase project
at all. Cloud sync adds cross-device continuity and the shared board; it is
never load-bearing. Writes are local-first and synchronous, cloud-second
and fire-and-forget, so a slow upload never blocks the win screen.

Cloud merges are **best-of per level**, never last-write-wins: someone who
played offline on a laptop and signed in on a phone keeps both halves.

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
