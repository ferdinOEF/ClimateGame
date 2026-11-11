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

- **The menu shows only Play Panjim** (Section 39, owner decision). The Tutorial
  level stays in the code and by its route; its button is hidden by
  SHOW_TUTORIAL_BUTTON. Play Panjim goes to the name card, then How to play,
  then the game; the level select is reachable only by its route (`#/levels`),
  never from a button (`tests/menu.test.ts`).
  No email field (the account/email code stays behind `VITE_REQUIRE_EMAIL`, off
  by default; see `src/services/features.ts`). Run length is not hard-coded.
- **Two sets of colours** (Section 40, owner decision). The static screens (the main screen, Facts & sources, the
  name card, How to play, the result cards with the last card and the nudge, Leave Panjim?, the replay card, the idle
  warning) take their colours from Section 40's block in `src/ui/theme.css`, which sits on those screens' root
  elements; the game takes its from `:root` and `:root.storm`, which do not change (`tests/theme.test.ts`). A static
  screen's own colour rules go in `src/ui/fiveColours.css`, every one under a root. How to play is three screens
  (Next, Next, "Let's Play!"); a QA tool starts Play Panjim with `tools/letsPlay.ts`.
- **Scientific honesty.** Only verified, cited real-world facts. Game mechanics
  are labelled as game rules ("In this game, …"), never as science. No invented
  people, no unsourced statistics. `tests/facts.test.ts` and
  `tests/noInventedPeople.test.ts` enforce this.
- **Maya is visible** (Section 29, owner decision; Section 17c had hidden her): she and her speech bubbles appear
  in the Panjim game, the start popup, the Tutorial and the result cards; ☰ has her item and M mutes her. The switch
  stays: `VITE_SHOW_MAYA=false` hides her everywhere (`SHOW_MAYA`, `src/services/features.ts`). Her skin is 50%
  fairer (Section 29, a `MAYA_PALETTE` change). The old rule holds: do not redraw her; edit only
  `src/ui/panjim/mayaArt.ts`, `maya.ts` and `panjim.css`; she is locked in place in the bottom left corner
  (Section 34c.2, owner decision; Section 33b had the bottom right; `tests/mayaLocked.test.ts`); her
  colours come from `MAYA_PALETTE`; whenever a HUD element moves, update `HUD_OBSTACLES` (in `maya.ts`) and her
  layout rules.
- **Shore defenses** (Section 41, owner decisions of 10 November 2026; game rules). Seawalls and breakwaters stand at
  the shore, never out at sea. "The first sea tile" is a sea tile with a beach or land neighbour (a river tile never;
  a sea tile that touches only wetland never). A breakwater fits only there; a seawall fits its shore tiles and
  there. One rule, `GameState.isFirstSea` (Panjim has 83 such tiles; `tests/section41.test.ts`). In the 2050 storm
  (cyclone and flood together) a seawall also holds back the river, with the metres it has against the cyclone; in a
  flood on its own it does nothing (`answersHazard`, `src/core/hazardModel.ts`, the one place).
- **Panjim's storms and its start** (Section 41). The 2030 cyclone is 1.15, the 2040 flood 2.35, the 2050 storm 3.0
  with a wind share of 0.9 (`src/data/levels.json`). Two khazans at Merces (26,6 and 16,15) and a mangrove at
  Taleigao (7,21) stand from the first turn (`standingDefences`): they protect as built ones do and are in the
  starting biodiversity, earn no living coast or veteran points, and may be removed at the cost of a year. A storm's
  path is counted with them in place (Section 41.6, owner decision of 11 November 2026): the homes they alone keep
  are not at risk, not saved and earn nothing; words that credit "your" defenses count only the player's own; they
  have their own row, "Standing nature", last on "What protected your homes". Campal's
  four water edge tiles (6,9), (8,7), (4,11), (3,12) hold no home (`houses.openLand`). The committed best plan
  (`docs/qa/section41/best_plan.json`) loses no home in any storm and `tests/bestPlan.test.ts` pins it: after any
  change to a rule or the map, search it again (`npm run bestplan`).
- **One board, tagless** (Section 41.6, owner decision: the festival is over). No season or festival label anywhere a
  player sees (the name card's Top 10, the last card's board box, their offline and empty states); no reply from
  `/api/board` carries the stored label. One board: old and new rows together, no reset. Test tags
  (`?tag=FestTesters`) are a different thing and stay.
- **Desktop browsers first** (Chrome, Edge, Firefox, Safari; mouse, wheel,
  keyboard; 1080p to 4K; test at 1920x1080 at least). Never make desktop worse
  to help phones.
- **Fixed, do not change:** the OSM street map stays at 21%; map geography, CRZ,
  OSM data and elevation.

## QA gate (before every merge)

Record the evidence in `docs/QA_REPORT.md` and update `docs/PROGRESS.md`.

**The default gate, every section** (Section 23.3, owner decision):

- `tsc --noEmit`, `npm run test` and `npm run build` clean.
- The preview-equals-resolution test passes.
- Bots over 20 seeds if mechanics or balance are touched.
- A few targeted screenshots of what changed, at 1366x768 and 1920x1080. Look at
  them and fix what is wrong.
- Zero console errors in those runs.
- An independent reviewer subagent checks the diff; fix every BLOCKER and MAJOR.
- Say plainly what could not be run.
- After the merge: confirm Vercel deployed the merge commit, and load production if
  the network allows it (say so if not).

**The full browser check** runs ONLY when the owner explicitly asks for it ("full QA"
or "full browser check"): `npm run walkthrough`, `test:labels`, `test:layout`,
`test:maya`, screenshots at all four sizes (1280x600, 1366x768, 1920x1080,
2560x1440), the full playthroughs, axe (no new serious or critical issues) and the
grayscale and deuteranopia copies of the key shot.

## Conventions

- `src/core/` never imports a renderer, the DOM or the network.
- Maps under `src/data/maps/` are generated; change the generator, not the JSON.
