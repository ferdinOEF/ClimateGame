# tools/

- `mapgen/generate.ts` (`npm run mapgen`) — regenerates `src/data/map.json`. Run once, offline; never at app runtime.
- `smoke.ts` (`npm run smoke`) — headless Playwright smoke test: boots the dev server, loads the build, screenshots, fails on any console error.
- `balance_sim/index.ts` (`npm run balance-sim`) — the permanent balance-testing harness from `STEP_PROMPT_balance_tuning_findings.md` Section 5. Imports this repo's real, unmodified `GameState`/`resolveMonsoonFlood`/`resolveCyclone` and mirrors `main.ts`'s actual scheduling/severity formulas; a bot plays the real 145-tile map across many seeded runs per configuration, so every number it prints reflects what the live code does, not an estimate.

  Run it directly with `npm run balance-sim`, or import `coverageAtTurn()`/`finalCoinStats()` from it for a new one-off diagnostic. To add a new sweep, edit `main()`'s `base` config and add another `summarize(label, runBatch(...))` call — it's plain `tsx`, not Vite, so it uses relative imports into `src/`, not the `@core/*`/`@data/*` aliases `main.ts` uses (those are resolved by Vite's bundler, which this script doesn't run through — see the file's own top comment). Keep `base`'s `floodIntervalTurns`/`cycloneIntervalTurns`/`severityBase` in sync with `main.ts`'s live constants if those are ever retuned again, or the harness will be sweeping stale numbers.
