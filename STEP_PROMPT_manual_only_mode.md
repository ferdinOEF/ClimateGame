# Khazan — Step Prompt: Manual-Only Mode (No Auto Era-End, No Auto Board Reset, No Turn-Based Drift; Manual Reset + Remove Controls)

**How to use this document:** a scoped mode-change, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or the prior step prompts — read those first, especially `STEP_PROMPT_remove_schedule_confirm_shadowing.md` (which already removed the turn-based *hazard* schedule; this prompt removes everything else that still changes state on its own) and `STEP_PROMPT_gameplay_stability_test.md` (whose `checkEraEnd()` audit this prompt supersedes — that pass confirmed the auto-reset was firing correctly; this pass removes the auto-reset entirely, a design change, not a bug fix). Direct instruction from the user: *"Remove the end of era. Do not reset the board. Provide a button to reset manually. Provide button to remove an element. Do not trigger any turn based events, remove all turn based events, we are doing everything manually right now."* Drafted after reading the current `src/core/gameState.ts`, `src/main.ts`, and `src/ui/buildPopover.ts` directly.

**Why this exists:** every hazard is already manually triggered (Test Hazards panel / dev params, per the earlier Bug 2/3 fixes). What's still automatic is (1) `checkEraEnd()` wiping the board the instant Resilience hits zero, whether that's from a manual hazard trigger or from background Food-deficit drain, and (2) `GameState.advanceTurn()`'s own background drift — income, maintenance/neglect, Food-deficit drain, flood-buffer recovery — all firing silently on every single build. For a testing/tuning phase where the goal is isolating exactly what one hazard or one defense does, that background drift is noise: it makes two otherwise-identical tests diverge for reasons that have nothing to do with what's actually being tested. This prompt makes state change **only** in response to an explicit action: build, remove, trigger a hazard, or hit reset. Nothing else.

---

## Part A — Remove automatic era-end / board-reset entirely

**In `main.ts`:**

- Delete the `checkEraEnd()` call from `triggerFlood()` (currently `if (!options.skipEraCheck) checkEraEnd();`) and from `triggerCyclone()` (same line). Since every trigger already effectively skips it today, this is just making that permanent and removing the now-pointless `skipEraCheck` option/plumbing entirely — drop the `{ skipEraCheck?: boolean }` parameter from both functions' signatures, and drop `{ skipEraCheck: true }` from every call site: the Test Hazards panel's callbacks, the `?flood=`/`?cyclone=` dev-param handlers, and `__triggerHazardForTest`. A hazard still resolves fully (damage, absorption, meter changes, the visual sweep) — only the now-entirely-removed reset consequence goes away, which was already the effective behavior for every real call site.
- Delete the unconditional `checkEraEnd();` call at the end of `openTilePopover()`'s build callback (the comment above it currently reads "check unconditionally so an era can't silently end without the banner/reset firing" — that's exactly the behavior being removed).
- **Repurpose `checkEraEnd()` into `resetBoard()`** (rename, and drop the `if (!state.isEraOver) return;` guard at the top — a manual reset should always run, not only when Resilience happens to be at zero). Keep the rest of the sequence exactly as it is today, since it's already correct and tested: `elements.reset()`, `hazardOverlay.reset()`, `hazardTestPanel?.reset()`, `state.startNewEra()`, `terrain.resetClaims(...)`, re-placing `STARTING_STATE.prebuiltHouses`, resetting `nextFloodAtTurn`/`nextCycloneAtTurn`, `updateHazardTestSchedule()`, `refreshHud()`.
- **Drop the score banner.** `hud.showBanner(\`Era ${erasSoFar} retired — score ${score}. A new era begins.\`)` was written for a surprise automatic event — a player deliberately clicking "Reset Board" already knows what they just did, so a score/era narrative doesn't fit anymore. Either drop the banner call entirely (the visual reset itself is enough feedback) or replace it with a short neutral confirmation (e.g. `hud.showBanner("Board reset.")`) — your call, low-stakes either way. If `computeEraScore()` ends up with no remaining caller, remove its now-dead import from `main.ts` (leave `scoring.ts` itself alone — not this prompt's concern).
- `state.startNewEra()` itself (`gameState.ts`) needs no changes — keep its name and internals exactly as they are (still an accurate description of what it structurally does: clear elements, reset coin/trust/resilience/severityBaseline/turn, increment `erasCompleted`). Only *who calls it and when* changes — manually, via the new button below, never automatically.

## Part B — Add a manual "Reset Board" button

Add it to `HazardTestPanel` (`src/ui/hazardTestPanel.ts`) — same dev-tooling category as the rest of that panel (`?debughazards`-gated), since a full board wipe is exactly the kind of testing-phase control that doesn't belong in front of a real player yet. Wire its callback into `resetBoard()` from Part A. Since this is destructive and can't be undone, consider a lightweight confirm (a plain `window.confirm("Reset the board?")` is fine here — this control lives inside an already-interactive dev panel, not behind an automated/scripted flow) rather than firing instantly on click; your call on exact wording/styling.

## Part C — Add a manual "Remove element" control

Put this on the tile-info popover (`src/ui/buildPopover.ts`'s `showInfo()`), not the dev panel — removing what you built is a natural counterpart to building it, not a hidden testing tool, and the popover already shows exactly the right context (which element, on which tile) when a tile has something built. Extend `BuiltElementInfo`/`showInfo()` to accept an `onRemove: () => void` callback and render a "Remove" button alongside the existing name/effects display. Wire it in `main.ts`'s `openTilePopover()`, for the `built` branch, to a new `removeElement(coord)` function that does exactly what the existing `__destroyForTest` test hook already does — `elements.destroy(coord)` (render-side) and `state.elements.delete(key)` (state-side) — plus `refreshHud()` and `buildPopover.hide()` afterward so the popover doesn't linger showing info for a tile that's now empty. **Consolidate rather than duplicate**: have `__destroyForTest` call the new real `removeElement()` function instead of repeating its two lines, same as `__triggerHazardForTest` already calls straight into the real `triggerCyclone`/`triggerFlood`.

No coin refund on removal — matches the current sandbox/testing framing (free to experiment, free to undo). Flag this as a placeholder policy in `PROGRESS.md` for `STEP_PROMPT_balance_tuning.md` to revisit if a partial refund ever makes sense for player-facing design; not a decision to make in this pass.

## Part D — Remove all automatic turn-based side effects

**In `gameState.ts`'s `advanceTurn()`**, currently:

```ts
advanceTurn(): void {
  this.turn++;
  this.coin += this.meterTotal("money");
  for (const [key, inst] of this.elements) {
    const def = ELEMENT_BY_ID.get(inst.elementId);
    if (!def || !def.maintenanceCostPerTurn || def.maintenanceCostPerTurn <= 0) continue;
    if (this.coin >= def.maintenanceCostPerTurn) {
      this.coin -= def.maintenanceCostPerTurn;
    } else if (def.maintenanceNeglectPenaltyPerTurn) {
      inst.degradeAmount += def.maintenanceNeglectPenaltyPerTurn;
      this.elements.set(key, inst);
    }
  }
  const deficit = Math.max(0, -this.food);
  if (deficit > 0) {
    this.trust = Math.max(0, this.trust - deficit * FOOD_DEFICIT_TRUST_FACTOR);
    this.resilience = Math.max(0, this.resilience - deficit * FOOD_DEFICIT_RESILIENCE_FACTOR);
  }
  for (const inst of this.elements.values()) {
    if (inst.floodBufferFilled <= 0) continue;
    const def = ELEMENT_BY_ID.get(inst.elementId);
    if (!def || def.floodBufferCapacityM3 === undefined) continue;
    inst.floodBufferFilled = Math.max(0, inst.floodBufferFilled - def.floodBufferCapacityM3 * FLOOD_BUFFER_RECOVERY_RATE);
  }
}
```

Strip it down to just the turn counter:

```ts
advanceTurn(): void {
  this.turn++;
}
```

`this.turn` still needs to increment on every `build()` call — it's what drives element maturity (`maturityFraction()`'s `this.turn - inst.builtOnTurn`), which is a consequence of the build action itself, not background drift, and should keep working exactly as it does today (an element still ramps up to full effect/absorption over its `matureTurns`).

**Everything else in that function goes**, since each one is a value changing on its own without an explicit trigger:

- **Income** (`coin += meterTotal("money")`) — Coin now only changes via build cost, a manual hazard's outcome (it doesn't currently touch coin, but nothing here should either), or the dev `?coinboost` param. If this turns out to matter for testing (e.g. wanting to see whether a build is affordable from its own income over time), that's a `STEP_PROMPT_balance_tuning.md`-era conversation about a manual "collect income" action, not something to guess at here.
- **Maintenance / neglect degrade** — no defense should silently weaken from unpaid upkeep anymore; `degradeAmount` should now only change via the hazard-resolver's own graceful-degrade path (`state.degradeDefense()`, called from `hazard.ts` when a defense is overwhelmed by an actual triggered event) — that's a manual-action consequence, not background drift, and stays untouched.
- **Food-deficit Trust/Resilience drain** — Trust and Resilience should now only change via `applyHazardOutcome()` (a manually-triggered hazard's actual outcome) or the new manual Reset Board control. Food itself keeps working exactly as before as a **pure live read** (`get food()` is a `meterTotal()` computation off whatever's currently built, not a stored/ticking value) — only the automatic *consequence* of a negative Food number goes away, not the number itself.
- **Flood-buffer recovery** — Khazan/Small Dam's `floodBufferFilled` should now only change via `drawDownFloodBuffer()` (a manually-triggered Flood actually filling it) — it no longer drains back down on its own between triggers. If you want to test a "fresh" buffer again, either use Reset Board or trigger enough Flood events to matter for the test in question; a manual "drain the buffer" control wasn't asked for here and would be scope creep — flag it in `PROGRESS.md` as a possible future addition if testing shows it's actually needed, don't build it preemptively.

**`FOOD_DEFICIT_TRUST_FACTOR`, `FOOD_DEFICIT_RESILIENCE_FACTOR`, and `FLOOD_BUFFER_RECOVERY_RATE` become unused** once their only call sites are deleted. If `tsc --noEmit`/lint is fine with unused top-level consts, leave them in place with a one-line comment noting they're no longer applied automatically and why (same "don't delete useful plumbing" convention this project already follows for the retired hazard schedule) — otherwise remove them cleanly. Your call based on what the build actually reports.

## What NOT to change

- No changes to `resolveHazardWave()`, absorption/decay math, `MIN_SEVERITY`, or anything in `hazard.ts` — this prompt is entirely about *when* state changes happen, not the hazard mechanics themselves. (If `STEP_PROMPT_small_dam_reservoir.md` is mid-flight or already landed, don't touch it here — the two prompts are independent.)
- No changes to `applyHazardOutcome()` — a manually-triggered hazard's Resilience/Trust consequences are exactly the kind of explicit, manual action this prompt preserves.
- No changes to `meterTotal()` or any of the derived getters (`biodiversity`, `carbon`, `food`, `population`) — they stay live computations off currently-built elements, untouched.
- Don't gate the new "Remove element" button behind `?debughazards` — per Part C, it belongs on the normal tile-info popover, not the dev panel.

## Verify

- Build enough Houses to run a Food deficit, then keep building/removing elements for several turns — Trust and Resilience no longer move on their own; the Food number itself still correctly reads negative.
- Trigger a hazard (Test Hazards panel) that would previously have crossed Resilience to zero — the board stays exactly as it was, nothing clears, no banner, and Resilience genuinely reads 0 (or whatever the math produces) rather than being clamped by an era reset.
- Click "Reset Board" — the full sequence runs (elements clear and re-seed with starting Houses, meters return to starting values, hazard overlays clear, Test Hazards panel resets) regardless of what Resilience currently reads, including from a full 100.
- Click a built tile's info popover, hit "Remove" — the element disappears from both the 3D scene and `state.elements`, the tile becomes buildable again, no coin is refunded, and the popover itself closes.
- Build a mature Khazan/Small Dam, trigger Flood to partially fill its buffer, then wait several builds (turns) without triggering anything else — `floodBufferFilled` (check via `__elementStateForTest`) stays exactly where the last trigger left it, no longer drifting back down on its own.
- `tsc --noEmit` clean, `npm test` passes (update/remove any test that specifically asserted the old auto-reset or turn-drift behavior — flag which ones in `PROGRESS.md` rather than silently deleting coverage).
- `PROGRESS.md` gets the usual note, explicitly listing every automatic behavior removed (income, maintenance/neglect, Food-deficit drain, buffer recovery, auto era-end) so it's easy to see the full list in one place later.
