# Khazan — Step Prompt: Scheduled Pacing Loop, Wave Spectacle, Hazard Preview

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `STEP_PROMPT_hazard_science.md`, or `STEP_PROMPT_manual_only_mode.md` — read all three first, they're directly relevant here. This reconciles something those two might otherwise seem to conflict on, so read this paragraph before anything else: **Manual-Only Mode was a testing-phase choice, not the shipped design.** Confirmed directly with the person running this project — the real game is meant to run on a **scheduled, telegraphed** hazard loop; the `?debughazards` Test Hazards panel's manual trigger exists purely for testing and stays exactly as it is, permanently, alongside the scheduled loop, not instead of it. This pass reactivates the scheduled path as the game's actual pacing loop, on top of that panel rather than in place of it.

Three features, one coherent loop, deliberately taken together: a telegraphed countdown to build dread, a real-time wave-sweep animation to pay it off as spectacle, and a preview toggle that turns the waiting period into an active decision instead of passive anxiety. Drafted after reading the live code directly — most of the first two already exist, dormant. **Do not touch hazard math, decay constants, or balance numbers in this pass** — that's `STEP_PROMPT_balance_tuning.md`'s job.

---

## 0. What's already there — read this before writing any code

Two of these three features are substantially built already, just disconnected. Confirm this for yourself before starting (things drift), but as of this writing:

- **`HazardResult.arrivalRound: Map<string, number>`** (`hazard.ts`) already records which BFS round each damaged tile was first reached in, specifically so the render layer can sequence a wave-sweep. **`applyHazardResult()` in `main.ts` already consumes it** — each tile's overlay reveal is staggered by `arrivalRound × ROUND_DURATION_MS` (550ms, flagged placeholder) via `setTimeout`. The animation exists. It's just never been seen as a real moment, because hazards currently only fire from the dev-only test panel.
- **The telegraph system is dormant, not deleted.** `hazardIncomingInfo()`, `Hud.setHazardIncoming()` (a complete, working method — just never called), its CSS, `nextFloodAtTurn`/`nextCycloneAtTurn`, `CYCLONE_TELEGRAPH_TURNS` (1) / `FLOOD_TELEGRAPH_TURNS` (2), the terrain-tint and cloud-layer telegraph hooks, and a `hazard_telegraph` sound id are all still in the codebase, left in place on purpose per `STEP_PROMPT_remove_schedule_confirm_shadowing.md`'s own comment: *"a real scheduling/telegraph design is likely coming back once the actual player-facing trigger mechanism gets designed... re-wiring it back into `refreshHud()` is a one-line change, not a rebuild."* That prediction is what this step prompt is.
- **The preview toggle (Section 3) is genuinely new** — no existing plumbing for it. But `resolveHazardWave()`/`resolveCyclone()`/`resolveMonsoonFlood()` are pure: they compute a `HazardResult` from the current `GameState` without mutating it. All the mutation (destroying defenses, degrading visuals, writing `lastHazardResult`) happens separately, afterward, in `applyHazardResult()`. That split is exactly what makes a preview cheap: run the same resolver, render the result differently, skip the mutating half entirely.

---

## 1. Reactivate the scheduled + telegraphed pacing loop (the real game's trigger path)

- Re-wire `hazardIncomingInfo()` back into `refreshHud()`, and confirm `Hud.setHazardIncoming()` renders it — per the comment in `main.ts`, this should be close to a one-line reconnection, not a rebuild. Verify it actually is; if it's grown a second dependency since that comment was written, note that.
- Re-wire the terrain-tint and cloud-layer telegraph visibility, and the `hazard_telegraph` sound cue, back onto the same imminent-window condition `hazardIncomingInfo()` already computes (`turnsUntil <= CYCLONE_TELEGRAPH_TURNS`/`FLOOD_TELEGRAPH_TURNS`). Don't reinvent this condition — reuse the one function that already exists to answer "is a hazard imminent right now."
- **Resolution trigger, confirmed intent:** nothing fires from idle or from the background. `nextFloodAtTurn`/`nextCycloneAtTurn` only advance because the player advances the turn count via `build()` — same as today. Once the countdown reaches zero, the hazard resolves automatically the next time the player's own action would advance past that turn (i.e., discovered and resolved inside the same `build()` call that crosses the threshold, not on a separate hidden tick). The player controls their own pace entirely; they don't get to choose the exact moment the hazard lands, once it's been telegraphed. That's the actual source of the tension — preserve it.
- Give the "countdown hits zero" moment its own beat, distinct from the wave-sweep animation in Section 2 — even a short one (a screen-edge flash, the telegraph tint intensifying, a beat of silence before the sweep starts) so "the storm has arrived" reads as a discrete event, not a build action that happens to also trigger a hazard with no transition.
- **Keep the Test Hazards panel exactly as it is** — same manual trigger, same instant-resolve-on-click behavior, same severity sliders. It's a separate, permanent testing tool now, not a placeholder for the real loop. Confirm a manual trigger from that panel doesn't produce a confusing double-telegraph or fight with the live schedule (it already resets `nextCycloneAtTurn`/`nextFloodAtTurn` on trigger, per its own comment — re-verify that behavior still makes sense once the schedule is actually driving real gameplay, not dormant).
- The panel currently isn't gated behind a build flag or URL param (explicitly deferred in an earlier pass, "flagged in `PROGRESS.md` as a later cleanup once the game is shared with someone who shouldn't see a test panel"). Now that there's a real scheduled path for it to potentially collide with in a real player's session, revisit that gate — at minimum confirm it's not reachable by accident, without necessarily building full flag infrastructure this pass if it's already adequately obscure.
- Update the stale comments on the pieces you're reactivating (`hazardIncomingInfo()`'s "not currently called" note, etc.) — they'll be actively wrong once this lands, which is different from the deliberately-preserved-and-still-accurate "kept but inert" comments elsewhere in the codebase (leave those alone).

---

## 2. Promote the wave-sweep animation from test-only to the real spectacle moment

This section is mostly verification and polish, not new construction — see Section 0.

- Confirm the existing `arrivalRound`-staggered reveal in `applyHazardResult()` looks and feels right when it's the payoff for a telegraphed, anticipated event rather than an instant test-panel click. It may not need any code change at all beyond being reachable via Section 1's real trigger path — verify first before assuming it needs work.
- Worthwhile polish, in rough priority order: a distinct sound per outcome type as each tile resolves (holding vs. overwhelmed vs. catastrophic breach currently likely share one generic `hazard_resolve` cue — check, and differentiate if so, since a breach should not sound the same as a Dune quietly absorbing a hit); whether the camera should do anything during the sweep (a slight pull-back to frame the whole affected area is a reasonable default — avoid anything that fights the player's existing camera control); and a brief narrated aftermath beat once the sweep finishes (a short HUD summary — Resilience delta, defenses breached/overwhelmed, Trust change — before returning to normal play), rather than the sweep ending and meters just silently updating in the corner.
- `ROUND_DURATION_MS` (550ms, already flagged placeholder) is a feel-tuning number — fine to leave as-is, or adjust if it plays too fast/slow to read, but that's a judgment call to make by actually watching it, not by changing the number blind.
- Do not touch the BFS resolution itself or `arrivalRound`'s computation — this section is render/pacing layer only.

---

## 3. Build the hazard-path preview toggle

New feature — the one part of this pass that's a real build, not a reactivation.

- **Where it's available:** during an active telegraph window (a hazard is imminent per Section 1's `hazardIncomingInfo()`) — that's the only moment a preview is actually decision-relevant. Also expose it in the Test Hazards panel at arbitrary chosen severities, since that's independently useful for testing and costs little extra once the underlying preview mechanism exists.
- **What it computes:** call the exact same resolver (`resolveCyclone`/`resolveMonsoonFlood`) that will actually run when the telegraphed hazard lands, at its real scheduled severity (whatever `severityBaseline`-derived value the real resolution would use) — a true preview of what will actually happen, not an approximation.
- **What it must NOT do:** call any part of `applyHazardResult()`'s mutating half — no `destroy()`, no `setDegradeVisual()`, no writing `lastHazardResult`. Preview is read-only. Render the returned `HazardResult` through a new, visually distinct treatment (outline/wireframe tint, or a desaturated pulsing overlay — needs a small addition to `floodOverlayManager.ts`/the hazard overlay, reusing its existing per-tile `show()` plumbing with a "preview" mode rather than a parallel rendering path).
- **The actual payoff, worth building for:** the preview should update live if the player places or removes a defense while the toggle is active — "what if I add one more Dune here" becoming instantly visible is the real value of this feature, not a static one-shot snapshot. If that's meaningfully more work than a static preview, it's still worth doing in this pass; flag honestly in `PROGRESS.md` if it has to be deferred instead.
- Turning the toggle off must cleanly clear every preview overlay tile — leftover ghost tiles after toggling off is the kind of bug that reads as "the game is telling me something is still dangerous" when it isn't.

---

## 4. Guardrails

- No hazard math, decay constants, or `elements.json` balance changes anywhere in this pass.
- The Test Hazards panel is not being deprecated or replaced — it comes out of this pass with identical behavior, just coexisting with a now-live scheduled loop instead of being the only way to see a hazard resolve.
- Respect the "kept but inert, commented" convention for anything genuinely still inert after this pass — only touch the comments on pieces you're actively reactivating (Section 1's third-to-last bullet).
- One concern per commit: (1) reactivate the scheduled/telegraph loop, (2) verify/polish the wave-sweep spectacle, (3) build the preview toggle. Land them as three separate, reviewable passes — don't squash into one commit.

---

## Verify

- `tsc --noEmit` clean; `npm test` passing at the current baseline or better (extend `hazard.test.ts` or add a new test file for the telegraph/schedule reactivation and the preview toggle's read-only guarantee — a test that asserts previewing a hazard leaves `GameState` byte-for-byte unchanged is the single most important one to add here).
- Live-verify the full loop: advance turns via `build()` until a hazard enters its telegraph window; confirm the HUD banner, terrain-tint, cloud layer, and telegraph sound all appear; keep advancing until it resolves on its own with no test-panel interaction; confirm the wave-sweep animates tile-by-tile per `arrivalRound`; confirm an aftermath summary appears.
- Live-verify the preview toggle: turn it on during a telegraph window, confirm the ghost overlay matches what the real resolution will produce at that severity; place a new defense while it's active and confirm the preview updates; toggle off and confirm every ghost tile clears; confirm `GameState` is unchanged by any of this (no coin spent beyond the real build, no defense actually destroyed/degraded).
- Confirm the Test Hazards panel still works exactly as before, at any severity, and doesn't produce a confusing double-telegraph when the schedule is also live.
- `PROGRESS.md` gets the usual entry, including which parts of Section 2's polish list were done vs. deferred and why.
