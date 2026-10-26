# Section 34 Round 2: independent diff review

Scope: `git diff 646313f..HEAD -- src tests tools` (commits 5639468 and b2962e7). Read against CLAUDE.md and
docs/REVIEW_34.md.

Not in this range: the shared material, geometry and texture disposal (elementReactions.ts, monumentMeshManager.ts,
ruinGeometry.ts, townGeometry.ts, mapOverlayShader.ts, gameSession dispose) landed in 55da8b9, which comes before
646313f. I did not review it here.

What I ran:
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 92 files, 741 passed, 6 skipped.
- Four Playwright scripts against `vite preview` on port 4173, with chromium and d3d11 ANGLE. They live in the
  scratchpad, not the repo. The served `dist` has this round's strings, so it is HEAD.
  - Idle reset while a result card is up (the clock was pushed forward by overriding `Date.now`).
  - The O key compared with the pulsing tiles over six builds, with `renderOutlook` and `renderGetReady` timed.
  - The O key in the Tutorial.
  - Help fit at 1280x600, 1366x768 and 1920x1080.
- I edited no source file.

Counts: **1 BLOCKER, 1 MAJOR, 5 MINOR, 2 NIT.**

---

## BLOCKER

### B1. An idle reset during a result card leaves the next visitor with no keyboard, and leaks the whole session

Where:
- `src/app/gameSession.ts:361-365`: the idle reset is now held only by `stormDirector?.playing`.
- `src/ui/panjim/resultCards.ts:260-383` (`show`) and `385-387` (`dispose`).
- `src/app/panjimController.ts:1063, 1081, 1301`.

Until this round, `panjim.isBusy` held the idle clock through the whole year end, cards included. Now the reset fires
while the cards are up, and the session is disposed with them still pending. That is the very case the change was
made for: a festival visitor walks away at a result card.

`ResultCards.show` registers a `window` keydown listener in the capture phase. Its `AbortController` is aborted only
by `close()`. `dispose()` only does `this.el.remove()`. It never aborts that listener and never sets `this.open`
back to false. So after the reset, the stale listener (`if (!this.open) return;` passes, because `open` is still true)
does this:
- any other key: `stopImmediatePropagation()` at window capture, so no handler on the menu or in the next session
  ever sees it;
- Tab: `preventDefault()`, then focus goes to a button in the detached card, so focus never moves;
- Enter: `preventDefault()` plus `advance()` into the detached card, so a focused button is never pressed;
- Escape: swallowed.

The listener's closure also holds `resolve`, so it keeps the never-resolved continuation alive: the
`PanjimController`, the host and the whole session. That is the leak class this round set out to fix.

Measured, at 1366x768 on Panjim: cards up, then 4 minutes forward, and the app went back to the menu. Then:
- Of three key presses (`a`, Tab, Tab), a document listener saw only the two Tabs. `a` was swallowed.
- Focus stayed on `BODY` after two Tabs. Control, on a fresh menu: two Tabs reach the Tutorial button.
- With the Tutorial button focused, Enter did nothing (the hash stayed empty). Control, on a fresh menu: Enter goes to
  `#/play/l00-tutorial`.
- No console errors. It fails silently.

So, until the page reloads, keyboard players cannot start the Tutorial ("Tutorial must never break"), and every key
in the next session is dead: arrows on the map, Enter, Esc, M, R.

A second, smaller loss: if the reset fires on the final card (`panjimController.ts:1301`), `onRunComplete` never
runs, and a finished run is not recorded. The same holds for the Tutorial's last card.

Fix: keep the open card's `AbortController` (and a way to settle it) on the instance. `dispose()` aborts it, sets
`open = false` and hides the element. Optionally, the idle path could record a finished run first. Add a test: a
session disposed with cards open leaves no window keydown listener behind. A source-level test would do, like the
rest of `tests/section34.test.ts`.

---

## MAJOR

### M1. The O key jumps among the phase's original picks, not the tiles that pulse: in the Tutorial and in Get ahead it says "No tile left for the objective." while tiles glow

Where: `src/app/gameSession.ts:2663-2674`. The pulsing tiles come from `panjimController.ts:663` (Tutorial), `703`
and `712-744`.

O builds its list from `panjim.run.objective?.picks` filtered by `canBuild`. What pulses comes from elsewhere:
- in the Tutorial, `goodTiles` (there is no `run.objective`);
- once the objective is done, Get ahead's `aheadPicks`;
- the fallback tiles in a row's area;
- and, from this round, only the picks where `riskChangeBy` still saves homes. A done row's leftover picks are never
  pulsed.

Measured:
- **Tutorial:** `run.objective` is null. After focusing the map and pressing O, the live region says "No tile left
  for the objective." while the step's tiles glow. Maya says "Try a seawall on a glowing tile by the sea". The
  canvas label promises "O jumps to the next tile the objective asks for".
- **Panjim after the objective is done** (2029): pulse is `["16,16"]` (Get ahead's khazan) and O's list is `[]`, so
  O says "No tile left for the objective."
- From the code, mid phase: O also visits picks that no longer pulse (`fits` but not `helps`) and picks of rows
  already done. The same round removed exactly those from the pulse because players spent a year there for nothing.

Help now says "O jumps to the objective's tiles". The feature exists for keyboard players, and it fails them in the
first thing they play.

Fix: have O cycle the keys last passed to `host.showObjectiveTiles`. gameSession already receives them. That gives
one source of truth for "the tiles the objective asks for".

---

## MINOR

### m1. A row whose picks no longer save homes stays open with nothing pulsing and nothing said

Where: `src/app/panjimController.ts:712-744`.

`open` now needs `helps(key)`, and the fallback keeps only tiles with `saves > 0` that also `helps`. A row whose homes
another build already saved still counts as not done: `prepProgress` counts builds, not homes saved. It now shows
"1/2" with no pulse and no O target ("No tile left for the objective."). Row click falls back to `job.tiles[0]`,
which may be a tile where the defence does not fit.

The objective then cannot show as complete, so its result line is lost and Get ahead never appears. Nothing tells
the player why. Before this round those tiles still pulsed.

Either mark such a row "done: its homes are already safe" (or drop it from the done check), or say so on the row. I
did not reproduce this in the browser; it is read from the code.

### m2. Maya's "most at risk" and "most of them around {place}" can now be false

Where: `src/app/mayaDirector.ts:110-146`.

The hotspot is now chosen among the at-risk homes within 3 tiles of an open pick, when there are any. The lines
still say "{place} is most at risk" and "Last call! {count} homes are still in danger, most of them around {place}",
with `count = exposure.housesAtRisk.length`, the total.

Example: 30 homes at risk around Taleigao with no pick near them, and 5 near a pick in Merces. Maya says "Last call!
35 homes are still in danger, most of them around Merces." For the subset case, either reword ("{place} needs you
most", "…, and a build near {place} can still save some") or count only the subset.

### m3. A single-entry risk cache thrashes in Get ahead: each repaint redoes the exposure and the trials

Where: `src/core/actionRun.ts:702-707` (`cardCache` is keyed `${moment}|${challenge.id}`, one entry) and
`panjimController.ts:722`.

`pulseKeys` now calls `riskChangeBy` for every open pick. In Get ahead those picks are for the storm after next. The
Outlook's `homesAtRisk(next)` and the build menu's `riskChangeBy(next, …)` reset the cache to the next storm, so
every `renderOutlook` and every build menu opening recomputes `exposureFor` and every trial for Get ahead.

Measured at 1920x1080:

| state | renderGetReady right after a renderOutlook | renderOutlook |
|---|---|---|
| normal | 0.2 to 0.4 ms | 15 to 18 ms |
| Get ahead (2029) | 8.8 ms | 36 to 41 ms |

This is not per frame, but it adds a dropped frame to each repaint. Fix: key the cache map by challenge, two
entries.

### m4. Honesty: the build card still states as fact what its source now hedges; the new Field Guide asides say more than their sources

- `src/data/facts.json:442` now reads "Mangroves can be nursery grounds…". The source says "may function as". The
  card line that fact backs (`usedFor`: the build card's second line) is unchanged, at
  `src/ui/panjim/defenceCards.ts:38`: "A nursery for fish and crabs; great for biodiversity." Suggestion: "Can be a
  nursery for fish and crabs; great for biodiversity."
- `defenceCards.ts:91` (small dam): "Goa's real bandharas … are opened in big floods". The cited note
  (`bandhara-floods`) reports one bandhara (Rumda) that "had to be opened urgently in the November 2019 floods".
  Suggestion: "one had to be opened in the 2019 floods" or "can be opened".
- `defenceCards.ts:88` (khazan): "(real bunds breach when they are not kept up)". The source, `khazan-bund-breach`,
  is a blog post that the facts file says to show "as reported by the author". Here it is stated flatly. NIT-level
  on its own.

### m5. The tests are source-string checks only, for behaviour that broke

`tests/section34.test.ts:193-229` checks that strings are present: the idle predicate, `clampTarget();` appearing at
least twice, the `helps` filter line, the O key literal. None of them exercises:
- the idle reset with cards up (B1);
- O against the pulsed tiles (M1);
- `pulseKeys` dropping a pick that no longer saves homes, or what happens to the row (m1).

`pulseKeys` and the O list are pure enough to test on an `ActionRun` in Node.

---

## NIT

- n1. `gameSession.ts:2663`: the O handler does not check modifiers, so Ctrl+O (or Cmd+O) on the focused map calls
  `preventDefault` and blocks the browser's Open file. The arrow handler, which was there before, has the same gap.
- n2. `gameSession.ts:2774`: `buildPopover.hide()` runs on every resize event even when the menu is closed. That
  means `onHide`, `tooltips.hide()` and `cardHover` many times during a window drag. It is harmless today; guard with
  `if (buildPopover.isOpen)`.

## Checked, no finding

- **Pan clamp** (`scene.ts:165-167, 389, 441`). It is applied only on drag and on wheel zoom at the pointer. Neither
  `focusOn` nor `fitTo` is clamped, so Home, Maya's focus, the storms' `channelMid` and the skyline reveal are never
  fought. A zoom during one of those glides clamps a target that is already on the board (bounds plus 4 tiles).
- **Click-through revert** (`buildPopover.ts`, `gameSession.ts`). It is clean. `tileAt`, `lastOpenedKey` and
  `onOutsideClick` are fully removed (tsc is clean), and `tools/section34Checks.ts` now expects "only closes".
- **Focus trap on the build menu.** The menu focuses its first enabled card on open (`buildPopover.ts:310`). The trap
  handles only Tab, and Esc still closes the menu (`gameSession.ts:2779`). The listener lives on the popover
  element, so it goes with the DOM.
- **Wording rules.** The new player text has no dots or hyphens between words: the canvas label, the Help line, the
  khazan card line, the tutorial seawall line and Maya's "striped red tiles". The game rules keep their "In this
  game" lead. The khazan card line matches `khazan-what`.
- **Help fit.** "How to play" still fits with no scrolling at 1280x600 (top 18, bottom 582), 1366x768 and 1920x1080.
