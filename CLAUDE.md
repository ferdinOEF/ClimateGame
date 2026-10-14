# Riptide Rising — working rules

A climate hex-tile city-builder (Three.js + TypeScript + Vite) set in Panjim
(Panaji), Goa. Production: https://climate-game-psi.vercel.app (Vercel).

`master` is canonical. The current `master` is the owner-accepted baseline: do
not change accepted behaviour unless the task says so.

Read `docs/ARCHITECTURE.md`, `docs/PROGRESS.md` and `docs/NEXT_STEPS.md` before
changing anything. `docs/QA_REPORT.md` holds the latest QA evidence.

## Commands

- `npx tsc --noEmit` — typecheck (strict tsc is the lint; there is no lint script)
- `npm run test` — vitest (pure logic, Node, no browser)
- `npm run build` — production build
- `npm run walkthrough` — headless browser run through menu, tutorial and every level
- `npm run test:labels`, `npm run test:layout`, `npm run test:maya` — label overlap,
  Maya layout, Maya stability
- `npm run bots` — bot playthroughs (balance); `npm run verify:maya` — Maya and street-map checks
- `npm run mapgen:panaji` — rebuild the Panaji board from the checked-in OSM basemap

## Shipping, section by section

1. Tag `pre-section-N` on `master` first (the safety copy).
2. Work on a branch `section-N-<name>`.
3. Pass the QA gate below, then merge to `master` with a merge commit
   (`git merge --no-ff`) and push, so Vercel deploys. Vercel's production
   deployment of `master` is the build that matters; never rely on previews.
4. Undo a section with `git revert -m 1 <merge commit>`.

## Fixed rules

- **Tutorial must never break.** The menu shows only Tutorial + Choose a level.
  No email field (the account/email code stays behind `VITE_REQUIRE_EMAIL`, off
  by default; see `src/services/features.ts`). Run length is not hard-coded.
- **Scientific honesty.** Only verified, cited real-world facts. Game mechanics
  are labelled as game rules ("In this game, …"), never as science. No invented
  people, no unsourced statistics. `tests/facts.test.ts` and
  `tests/noInventedPeople.test.ts` enforce this.
- **Maya: do not redraw her.** Edit only `src/ui/panjim/mayaArt.ts`, `maya.ts` and
  `panjim.css`. She is locked in place (`tests/mayaLocked.test.ts`). Her colours
  come from `MAYA_PALETTE`. Whenever any HUD element
  moves, update `HUD_OBSTACLES` (in `maya.ts`) and her layout rules.
- **Desktop browsers first** (Chrome, Edge, Firefox, Safari; mouse, wheel,
  keyboard; 1080p to 4K; test at 1920x1080 at least). Never make desktop worse
  to help phones.
- **Fixed, do not change:** the OSM street map stays at 21%; map geography, CRZ,
  OSM data and elevation.

## QA gate (before every merge)

Record the evidence in `docs/QA_REPORT.md` and update `docs/PROGRESS.md`.

- `tsc --noEmit`, `npm run test`, `npm run build` clean; zero console errors.
- `npm run walkthrough`, `test:labels`, `test:layout`, `test:maya` pass.
- Screenshots at 1366x768, 1920x1080 and 2560x1440. Look at them and fix what is
  wrong. Make grayscale and deuteranopia copies of the key shot.
- Bots over 20 seeds if mechanics or balance are touched; the
  preview-equals-resolution test passes.
- axe: no new serious or critical issues.
- An independent reviewer subagent checks the diff and screenshots; fix every
  BLOCKER and MAJOR.
- Say plainly what could not be run (e.g. real-GPU frame rates, Firefox/WebKit:
  past runs were Chromium with software GL only).
- After the merge: load production, check the console, and confirm the deployed
  commit matches the merge commit. If the network does not allow it, say so.

## Conventions

- `src/core/` never imports a renderer, the DOM or the network.
- Maps under `src/data/maps/` are generated; change the generator, not the JSON.
