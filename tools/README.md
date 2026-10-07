# tools/

- `mapgen/generate.ts` (`npm run mapgen`) — regenerates `src/data/map.json`. Run once, offline; never at app runtime.
- `mapgen/fetchPanajiBasemap.ts` (`npm run mapgen:basemap`) — downloads the
  OpenStreetMap tiles covering Panjim and composites them into
  `mapgen/panaji-basemap.jpg`, plus the geographic box it covers. Tiles are
  cached in the system temp directory, so a re-run costs no downloads. The
  image is a BUILD INPUT and is deliberately not under `public/`: the game
  draws flat coloured hexes and never loads it.
- `mapgen/geocodePanaji.ts` (`npm run mapgen:geocode`) — looks the sixteen
  landmarks up by name and rejects any answer that falls outside Panaji.
  Writes `mapgen/panajiPlaces.json`.
- `mapgen/buildPanajiMap.ts` (`npm run mapgen:panaji`) — lays the hex grid over
  the basemap, classifies each hex from the pixels under it, places the
  landmarks, and writes `src/data/maps/panaji.json`. Also writes an overlay
  preview to the temp directory: the finished board painted back onto the map
  it was read from, which is the only way to actually check the result.
- `mapgen/cropPreview.ts` — cuts a region out of that overlay and scales it up,
  for looking at one neighbourhood closely.

The three Panjim steps run in that order, by hand, and their output is checked
in. The game never calls a tile server or a geocoder, and ships no map imagery
— only the board those steps produced.
- `smoke.ts` (`npm run smoke`) — headless Playwright smoke test: boots the dev server, loads the build, screenshots, fails on any console error.
- `balance_sim/index.ts` (`npm run balance-sim`) — the permanent balance-testing harness from `STEP_PROMPT_balance_tuning_findings.md` Section 5. Imports this repo's real, unmodified `GameState`/`resolveMonsoonFlood`/`resolveCyclone` and mirrors `main.ts`'s actual scheduling/severity formulas; a bot plays the real 145-tile map across many seeded runs per configuration, so every number it prints reflects what the live code does, not an estimate.

  Run it directly with `npm run balance-sim`, or import `coverageAtTurn()`/`finalCoinStats()` from it for a new one-off diagnostic. To add a new sweep, edit `main()`'s `base` config and add another `summarize(label, runBatch(...))` call — it's plain `tsx`, not Vite, so it uses relative imports into `src/`, not the `@core/*`/`@data/*` aliases `main.ts` uses (those are resolved by Vite's bundler, which this script doesn't run through — see the file's own top comment). Keep `base`'s `floodIntervalTurns`/`cycloneIntervalTurns`/`severityBase` in sync with `main.ts`'s live constants if those are ever retuned again, or the harness will be sweeping stale numbers.
