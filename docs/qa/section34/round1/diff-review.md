# Section 34 Round 1: independent diff review

Scope: `git diff pre-section-34..HEAD -- src tests tools/section34Checks.ts tools/fuzz34.ts tools/playtest` (28 files,
+1201 / -77), at HEAD `f77cf37`. Read against CLAUDE.md and docs/REVIEW_34.md's Round 1 issue list.

How it was checked: by reading every changed code path, `npx tsc --noEmit` (clean), `npx vitest run` (92 files,
734 passed, 6 skipped), and five small Playwright scripts against `vite` dev on port 4391 (Chromium 1234, real GPU,
1366x768 and 1920x1080), kept outside the repo in the session's scratchpad. No source file was changed.

**Counts: 1 BLOCKER, 2 MAJOR, 7 MINOR, 5 NIT.**

---

## BLOCKER

### B1. A mouse click on the board moves the camera to the keyboard cursor, and the click opens the wrong tile (Panjim and the Tutorial)

`src/app/gameSession.ts:2583` makes the canvas focusable (`canvas.tabIndex = 0`). A focusable element takes focus on
a mouse press, and nothing in `scene.ts:324` (the board's `pointerdown`) prevents it. The new `focus` listener
(`gameSession.ts:2601`) then runs for mouse focus as well as keyboard focus. It sets the cursor to the objective's
first pick (or `levelMap.focus`) and calls `showCursor(true)`. That calls `focusOn(world.x, world.z, true)` (line
2596): the third argument is `immediate`, so the camera jumps there with no glide, even though the comment says glide.
It also turns the ring to the dark keyboard colour.

When this happens:
1. **The first press on the board of every run.** The camera jumps between `mousedown` and `click`, so the click's
   raycast hits whatever is now under the pointer.
2. **Every time a build menu or a tile card closes.** `BuildPopover.hide()` (`buildPopover.ts:475`) puts focus back
   on the canvas, which had it when the cards opened. That fires `focus` again, and the camera jumps back to the
   stale cursor tile. This covers Esc, a build, and the new click-through.

Measured (scratchpad `focuscheck2.cjs`, `firstclick.cjs`, `tutorial.cjs`):
- Panjim, first press at (400,500): camera x 11.69 → 8.66 on `mousedown`. `document.activeElement` becomes the CANVAS
  and the ring turns `#1d2b3a`.
- Panjim, first click aimed at the buildable tile 12,11 (centre projected beforehand) opened a **"House"** card.
- Panjim: after panning to (20.12, 56.05) and opening a menu, Esc took the camera back to (8.66, 50.32). The dark
  keyboard ring was left visible on the pick tile -4,18.
- **Tutorial**, first press: camera x -3.24 → 0.00. CLAUDE.md says the Tutorial must never break.

`tools/section34Checks.ts` cannot see this: it calls `canvas.focus()` from script before any mouse step.

Fix: react to focus only when it comes from the keyboard. For example, return early unless
`canvas.matches(":focus-visible")`, or set a flag on Tab keydown. Never move the camera on focus; move it only on
arrow keys, and glide (`focusOn(x, z, false)`). Also consider not giving focus back to the canvas when the menu was
opened by a pointer, or setting `cursor` to the clicked tile in `openTileAt`. Add a browser check that presses the
mouse on an unfocused board and asserts that the camera and the opened tile are unchanged.

---

## MAJOR

### M1. The keyboard cursor disappears while the mouse rests over the board

`updateHover` (`gameSession.ts:2655`) treats "the camera moved under a still mouse" as a hover move. Each arrow press
moves the camera at once (B1's `immediate`), so the next frame's `pickHover` (line 2564) calls
`tileHover.show(<the tile under the mouse, or null>)`. That overwrites the cursor `showCursor` just drew.
`setKeyboard(false)` runs only on `pointermove`, and `hoverAt` stays set until `pointerleave`. Measured
(`focuscheck2.cjs` step 4, mouse parked at the centre of the board): after each ArrowRight, ArrowRight, ArrowUp the
ring was `visible=false`, though its position stepped along. So the keyboard player who uses "a mouse click per build"
(the K diary) loses the cursor completely once the mouse has been over the board.

Fix: while the keyboard cursor is active, skip `pickHover`'s `tileHover.show` (or clear `hoverAt` on an arrow
keydown) until the next real `pointermove`. Gliding instead of snapping also removes most of the triggers.

### M2. With a card open, almost every click on the board now opens another card instead of closing it

`buildPopover.ts:604-608` with `gameSession.ts:2679-2682`: any click on the backdrop over the canvas hides the card
and then runs `openTileAt` at that point. Nothing checks whether that point is the tile already open, or whether the
tile takes a build. So:
- clicking the open tile again (the usual way to dismiss) closes it and opens it again;
- clicking a house opens a "House" card;
- clicking plain land or scenery opens the new note "Nothing can be built here...". That note also has a backdrop, so
  the next click on land opens another note.

Measured at 1920x1080 (`dismiss.cjs`): with the dune menu open, 6 of 8 clicks on the board opened something new (the
same dune menu, House twice, the note, a seawall menu twice). Only 2 closed it. Before this round, any click outside
closed the card. Issue 6 asked only that a click **on another tile** be passed through. Desktop mouse play comes
first, and this is a new kind of click that seems to go nowhere useful.

Fix: pass the click through only when it lands on a different tile that opens a build menu (`buildableAt` not
empty). Otherwise only close. A press that becomes a drag on the backdrop should only close too: today it ends as a
`click` on the backdrop and opens the tile under the release point.

---

## MINOR

1. **The idle warning is spoken every second, and can be hidden under the final card.** `idleNote` has
   `role="alert"` (`gameSession.ts:353`), and its text changes every second (`idleReset.ts:278`, countdown), so a
   screen reader is interrupted 30 times. Use `aria-live="polite"` and change the announced text only every 10 s, or
   announce once. Also, `.idle-warning` and `.result-cards` both use `z-index: 60` in the same container
   (`harbour.css:592`, `panjim.css:2331`), and the result cards are appended later (`panjimController.ts:317`), so
   they draw on top. The final card is shown after `busy = false` (`panjimController.ts:1650-1659`, then
   `finale()`), so the idle clock runs there, and the warning sits under that layer. Give the warning a higher
   z-index (below Leave's 80).
2. **The new "nothing can be built" note is wrong on the near sea's unbuildable tiles.** `gameSession.ts:2484` says
   "Defences go on the beach, the wetland, the river and the near sea." On Panjim, 16 `coast` tiles in play are in
   `state.unbuildable` (counted with `sessionRun`). A click on one gets a note that says the near sea takes
   defences. Reword it ("This spot takes no defence."), or pick the text from the tile's terrain.
3. **The Tutorial's credit changed from net to gross with no test.** `panjimController.ts:1525` now credits
   `riskChangeBy(...).saved`. That is the homes a build takes out of risk, ignoring `added` (the homes it puts at
   risk, for example a seawall pushing water round its ends). The old `homesSavedBy` was `before - after`, the net
   figure, floored at 0. So a Tutorial seawall's row can now claim homes its own push cancelled. The new test
   (`tests/section34.test.ts:53`) only checks the total against `housesSaved` and builds no seawall. Either credit
   `saved` minus `added`, or say plainly on the card that the row counts homes taken out of the way, before any it
   put at risk.
4. **"Defences broken" is counted from the final board (core review MAJOR 4, partly fixed).**
   `gameSession.ts:1359` counts `inst.broken` on `state.elements` at the end. A broken seawall or dam that was built
   over (`gameState.ts:293`: a broken one "leaves its tile free for a new build, which replaces it") or demolished is
   not counted. "Unbroken" can still be awarded after defences broke. Count from the storm records or the run's
   outcomes (`failedIds`) instead.
5. **The tests for the DOM fixes check source text, not behaviour.** `tests/section34.test.ts:21-30` and `94-168`
   assert that strings such as `"canvas.tabIndex = 0;"` or `"if (open.length >= need || tiles.size === 0) return
   open;"` appear in the source. They pass with B1, M1 and M2 present, and any refactor breaks them.
   `tools/section34Checks.ts:111` passes "a click on another tile ... opens that tile's menu" whenever *any* popover
   is open (a House card or the note pass too), and the script focuses the canvas from script, which hides B1. Check
   the opened tile and the camera, and press the mouse on an unfocused board.
6. **Show risk now comes on by itself once the objective is done** (`panjimController.ts:359-366`, and the Help line
   "It comes on once the objective is done"). This changes Section 21.4's accepted default (off at the start of a
   phase, on in the warning years) and is not in the Round 1 issue list. Under CLAUDE.md ("do not change accepted
   behaviour unless the task says so") and REVIEW_34's own rule, it should be listed under "Owner decisions needed"
   (still empty) for sign-off.
7. **The Sources screen no longer says that seven citations were checked only from a search engine's quotation.**
   `facts.json` moved "Checked from the search engine's quotation of the page (the page itself could not be opened
   from this environment)" into a `checked` field that the screen never shows (`sourcesScreen.ts:159` shows only
   `note`). Removing the "Section 30.3" developer notes was right. This sentence, though, was a disclosure that the
   source was not read directly. Under the honesty rule ("only verified, cited real world facts"), either open and
   verify those pages, or keep a short player-facing caveat. Also add `usedFor` and `checked` to the `Citation`
   type (`facts.ts:28`) so the fields are typed and documented.

---

## NIT

1. `objective-pick` (`panjimController.ts:1841`) is added to the card but no CSS or test uses it.
2. `tools/playtest/driver.ts:214` calls `.listen(PORT)` on every interface, so anyone on the LAN (this machine is
   192.168.31.49) can drive the browser. Use `listen(PORT, "127.0.0.1")`.
3. `tools/fuzz34.ts:166` `check("preview = resolution (no build)", true, "")` always passes. When the storm year's
   action is a demolition or a repair, preview against resolution is never checked. Compare against `before` minus
   that action's change, or drop the check.
4. Maya's seawall tip (`maya.json:44`) says "10 years" while the rule lives in data (`cracksAtAge`). `maya.test.ts`
   pins the wording, so a data change would leave her wrong without failing a test. Assert it against
   `ELEMENT_BY_ID.get("seawall").cracksAtAge`.
5. `showCursor(glide)`'s parameter name and comment say glide, but it calls `focusOn(..., true)` (immediate). See B1
   and M1.

---

## Checked and fine

- **Keyboard on the cards** (Chromium): Enter on the cursor opens the menu with focus on the first card, which carries
  the "Objective" chip (`dune` on -4,18). Enter on it builds (year moves on; `e.detail` is 0, so the 400 ms guard does
  not apply). Space on the canvas opens the menu and its keyup does **not** build the focused card. Esc gives focus
  back to the canvas. Firefox and Safari were not available here (only Chromium is installed), so the keyup case is
  unverified there.
- **Focus traps:** the start popup keeps Tab on Begin. Help takes focus on Close, Shift+Tab cycles Close and the link,
  Esc closes it, and focus returns to "?". The traps check `isOpen()` on every key and sit on the dialog's own DOM,
  so they cannot stick after a close or outlive a session.
- **Idle reset:** a storm or a busy year during the warning calls `poke`, which hides it. Any input cancels it, and it
  is taken down when the reset fires. The 1 s interval is cleared by `stopIdle`. Unit test added.
- **Listeners and sessions:** the new ones sit on the canvas, the dialog cards, `idleNote` and `said` (children of the
  session container), and `buildPopover.onOutsideClick` (a per-session object). None is on `window` or `document`. No
  leak found.
- **Pulse fallback cost:** `homesAtRiskKeys` is cached per moment (`actionRun.ts:696-705`). The fallback runs only
  when a row has fewer open picks than it needs. At the start of Panjim the picks equal each row's count (dune 1 of 1,
  pandanus 2 of 2), so accepted behaviour is unchanged until tiles are taken.
- **`:has()`** in `panjim.css:2578`: supported by every target desktop browser (Chrome 105, Safari 15.4, Firefox 121)
  and already used elsewhere in the same sheet (`panjim.css:3312`). The override keeps the base rule's three tracks.
- **Colours:** the new CSS uses tokens only (`--panel`, `--ink`, `--warn`, `--button`, `--accent-ink`,
  `--button-on-border`), and `accent-ink` on `button` is a pair `theme.test.ts` already checks. The hexes in
  `tileHover.ts` follow the renderer's existing practice (`#fff6dc`).
- **Player text:** no dots or hyphens between words (the punctuation test passes). The new mechanic lines carry "In
  this game" or a rule tag: Maya's flood line, the seawall and mangrove tips (`rule: true`). The mangrove card lines
  no longer mix the two storms.
- **Headline and homes line:** `homesStars` is the homes-only star count, so a card says "nature paid for it" only
  when biodiversity alone held the stars down. "N homes stood in its path; M were lost" adds up, because
  `lost ⊂ standing` in `zones.ts:282-286`.
- **Run completion, par and the Tutorial's Help:** `finishRun(level.tutorial === true || result.cleared)` and
  `parTurns: 0` touch only the run record and the end sound (nothing is saved). The Tutorial's Help no longer states
  Panjim's clear rule; Panjim's page keeps it.
- `src/core` still imports no DOM or renderer (`facts.ts` now imports `RETIRED_ELEMENTS` from `./elements`).
