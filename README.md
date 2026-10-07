# Riptide Rising

A coastal resilience game set in Goa. Plant mangroves, raise seawalls,
restore Khazan fields, and find out whether your slice of coast survives
the monsoon — and what each kind of defence really costs.

Built with Vite, TypeScript and Three.js. Deploys to the Firebase **Spark
(free)** tier.

**Play it: <https://rootandruin.web.app>**

The project's original default address, <https://rootride-4ddaa.web.app>, is
deployed alongside it and serves the same build, so older links keep working.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. That is the whole setup — **no Firebase
project needed**. Without cloud config the game runs against
`localStorage`: the full campaign, levels, stars, badges and personal bests
all work. Only the shared leaderboard and cross-device sync are unavailable.

To connect a backend, follow [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (vitest, no browser needed) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run emulators` | Firebase Auth + Firestore emulators |
| `npm run deploy` | Build and deploy everything |
| `npm run deploy:hosting` | Deploy the site only |
| `npm run deploy:rules` | Deploy Firestore rules and indexes |
| `npm run balance-sim` | Bot-plays the real map to sanity-check balance |
| `npm run walkthrough` | Plays the whole game in a headless browser and screenshots every stage |
| `npm run mapgen:panaji` | Rebuilds the Panaji board from its source layout |
| `npm run mapgen:cities` | Rebuilds the seven unused Goan coasts from their coordinates |
| `npm run mapgen:tutorial` | Rebuilds the tutorial map from its ASCII layout |

## The game

You hold one stretch of Goan coast against storm surges and monsoon
floods. Every hex can take one thing, and every choice is a trade:

- **Nature-based** — mangroves, dunes, pandanus. Slow to mature, but they
  feed biodiversity, lock away carbon, and degrade gracefully instead of
  failing all at once.
- **Engineered** — seawalls, breakwaters, dams. Full strength immediately
  and much stronger, until they are overwhelmed, at which point they fail
  catastrophically and take the wave through with them.
- **Hybrid** — the Khazan, Goa's centuries-old system of earth bunds and
  sluice gates. It doesn't block a flood, it drinks one, then farms the
  water it kept.

Turns only advance when you build, so the pace is yours — but a
telegraphed storm lands when its countdown reaches zero regardless.

### The campaign

A guided tutorial, then one level: **Panaji**, on the Mandovi estuary.

The Panaji board is **743 hexes of real Panjim geography**. The coastline from
Miramar down to Dona Paula, the Mandovi and its estuary fringe, the sand, and
the sixteen landmarks are all where they really are — so a player from the city
can find Campal, Altinho, Fontainhas and Patto on the board by their shape.

It is derived from map data rather than drawn, in three offline steps:

1. `npm run mapgen:basemap` renders Panjim from OpenStreetMap into one image
   and records the exact geographic box it covers.
2. `npm run mapgen:geocode` looks up the sixteen landmarks by name and rejects
   any answer that falls outside Panaji.
3. `npm run mapgen:panaji` lays a hex grid over a chosen rectangle of that
   image, asks the picture what is at each hex centre, places the landmarks
   through the same projection, and writes the board.

**The image is a build input, not an asset.** It is read once, offline, to
decide what each hex is; the game itself draws flat palette colours and never
loads a map tile. The image and its metadata live in `tools/mapgen/` rather
than `public/` for exactly that reason.

Two things the picture cannot answer are decided on top of it — open sea is
split from the Mandovi by a named line across the river mouth, and the sand is
widened inland from a thin ribbon to a band about three tiles deep, because
Dune, Pandanus, Seawall and Beachside Resort all need somewhere to go.

**Sixteen real Panjim landmarks stand on the board** as buildings rather than
as marker stars — Our Lady of the Immaculate Conception, the Mahalaxmi Temple
with its lamp tower, the Adil Shah Palace on the waterfront, the Municipal
Market, Kala Academy at Campal, Dhempe College at Miramar, Dona Paula out on
the headland. They are permanent and decorative: nothing can be built on their
tile, no hazard touches them, and clicking one tells you what it is.

Landmark positions and the terrain itself come from OpenStreetMap, © OpenStreetMap
contributors, licensed under the ODbL. That makes the board a derived database,
so the credit shown in its corner is a condition of the licence even though no
map imagery ships.

Seven other Goan coasts were generated in an earlier pass — Morjim, Calangute,
Colva, Betul, Vasco, Palolem and the Terekhol — rasterised from traced
coastlines, river centrelines and beach strips in latitude and longitude. The
map files and the coordinates they came from are still on disk under
`src/data/maps/` and [`tools/mapgen/cities.ts`](tools/mapgen/cities.ts), but
they are no longer imported, so they cost nothing in the bundle. Re-adding one
is a line in `levelMap.ts` plus a line in `levels.json`.

**Both levels are unlocked.** Flip `ALL_LEVELS_UNLOCKED` in
`src/levels/progression.ts` back to `false` to restore sequential unlocking.

Plus a **daily challenge** seeded from the UTC date, so every player worldwide
gets the same storms on the same coast.

### Before you play

The first time someone presses Start, they are asked for a name, an age and
an email, once. It is saved on the device and mirrored to
`playtesters/{uid}` in Firestore so a test session leaves a record somebody
can act on. Only the name is ever shown to another player. See
[`docs/DEPLOY.md`](docs/DEPLOY.md) for what is stored, what the rules
enforce, and how to check the write is landing.

## Project layout

```
src/core/       pure game logic (no DOM, no Three.js, no network)
src/render/     Three.js scene + mesh managers
src/ui/         HUD, popovers, place labels, and the shell screens
src/levels/     campaign data, the map registry, progression, achievements
src/services/   Firebase, auth, leaderboard, player registry, persistence
src/app/        entry point, shell, and the game session
src/data/       authored JSON: elements, levels, nuggets
src/data/maps/  one file per playable board — generated, never hand-edited
tools/mapgen/   the coordinates the maps are built from, and the rasteriser
tools/          balance simulation, the headless walkthrough, smoke tests
docs/           deployment, architecture, and build history
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits
together, and [`docs/PROGRESS.md`](docs/PROGRESS.md) for the build history.

## Dev URL parameters

Hidden by default — no visible affordance without an explicit param.

| Param | Effect |
|---|---|
| `?debughazards` | Shows the hazard test panel (manual triggers, severity sliders) |
| `?coinboost=N` | Adds N Coin |
| `?resilienceboost=N` | Adjusts Resilience |
| `?autobuild` / `?autodefend` | Fills the map with buildings / defences |
| `?flood=N` / `?cyclone=N` | Fires a hazard at severity N immediately |

## Licence

Not yet specified.
