# Riptide Rising — working rules

Read `docs/ARCHITECTURE.md`, `docs/PROGRESS.md` and `docs/NEXT_STEPS.md` before changing anything.

## Project rules

- **Web browsers first.** The game is built for desktop browsers: Chrome, Edge,
  Firefox and Safari, played with a mouse, scroll wheel and keyboard, on screens
  from 1080p to 4K. Optimise and test for that, at 1920x1080 at least. Phones
  are secondary: never make desktop worse to help phones.
- **Always ship to production.** Once work is verified, open the PR for the
  record and then merge it into `master` yourself; do not leave it waiting.
  The production Vercel deployment of `master` is the build that matters.
  Never rely on preview deployments. After merging, check that
  https://climate-game-psi.vercel.app is serving the new build if the network
  allows, and say plainly whether you could check.

## Commands

- `npx tsc --noEmit` — typecheck
- `npm run test` — vitest (pure logic, Node, no browser)
- `npm run build` — production build
- `npm run walkthrough` — headless browser run through menu, tutorial and every level
- `npm run mapgen:panaji` — rebuild the Panaji board, its street-map layer and the
  debug images in `tools/mapgen/debug/` from the checked-in OSM basemap

## Conventions

- `src/core/` never imports a renderer, the DOM or the network.
- Maps under `src/data/maps/` are generated; change the generator, not the JSON.
- The email/account features sit behind `VITE_REQUIRE_EMAIL` (off by default);
  see `src/services/features.ts` and `docs/DEPLOY.md`.
