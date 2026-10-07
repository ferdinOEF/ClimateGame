# Khazan — Step Prompt: Gameplay Stability Pass (Hanging, Map Reset, Leftover Bug 1)

**How to use this document:** a scoped bug-hunt/fix pass, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or the prior step prompts — read those first. Drafted after live-testing `https://climate-game-psi.vercel.app/?debughazards` directly (Claude-in-Chrome) and reading the current `src/main.ts`, `src/ui/hazardTestPanel.ts`, and `src/data/startingState.json`. This is a response to the user's report: *"There are a few bugs already like game hanging, the map getting reset etc. I want a proper gameplay test done."*

**Why Claude Code, not live-browser testing, owns this pass:** reproducing something as vague as "hanging" needs a profiler, breakpoints, and source maps against the actual dev server — tools that only exist in the local environment. Live-browser testing (which already happened, see below) is good for confirming *what ships* and catching UI/UX regressions, but it can't step through a slow frame or inspect a memory snapshot. Do the reproduce-and-fix loop here, locally; a live adversarial re-check on the deployed build happens after, same pattern as the hazard-mechanics pass.

---

## What's already been checked live (so you don't re-derive it)

Tested directly against the deployed build just now, `?debughazards`:

- **Rapid-fire hazard triggers (6 clicks in a row, alternating Storm Surge/Flood, no defenses on the map) did not hang** — Resilience dropped 100→0 smoothly across the 6 triggers, no console errors, no frame freeze, no dropped clicks.
- **Building after Resilience is already at 0 correctly triggers a soft era-end** — `Era 1`→`Era 2`, Resilience reset to 100, elements cleared, Coin/Food/Population reset to starting values. This is `checkEraEnd()` working exactly as designed (`STEP_PROMPT_hazard_mechanics_fixes.md` Bug 2's fix is confirmed live: the *test-triggered* hazards did NOT reset the map; only the subsequent normal build, once Resilience was genuinely at 0, did). **If this is the "map getting reset" the user is describing, it may not be a bug at all — it's the intended soft-era-loop — but it's worth confirming with the user whether that's what they're seeing, or something else** (e.g. a reset that fires with Resilience still above zero, which would be a real bug and is NOT what was reproduced here).
- **`checkHazardSchedule()` is fully gone from both the local tree and the live deployed bundle** — Part A of `STEP_PROMPT_remove_schedule_confirm_shadowing.md` has landed and deployed. Confirmed via direct fetch of the shipped JS bundle.
- **Bug 1 (`elements.json`'s `"monsoon_flood"` → should be `"flood"`) is STILL NOT FIXED** — `src/core/hazard.ts` and `src/data/elements.json` both still carry their pre-fix mtimes as of this pass. This means Flood-mitigation defenses (Mangrove, Khazan, Small Dam, Sand Mining) are still not registering at all. **Please pick this back up as part of this pass** — it's a one-line-per-entry fix, already fully specified in `STEP_PROMPT_hazard_mechanics_fixes.md` Bug 1, just hasn't landed yet.
- Noted but not investigated: `startingState.json`'s `startingCoin` is now `10000` (a large jump from whatever it was before) and the HUD shows `Food -10` at Turn 0, before the player has done anything. Neither is in scope here — flagging only in case either was unintentional (a debug value left in) rather than a deliberate balance choice.

None of the above rules out "hanging" — it just means the simple version (a handful of rapid clicks on a mostly-empty map) doesn't trigger it. The scenarios below are more likely to.

---

## Part A — Reproduce and fix "hanging"

Try these, roughly in order of likely culprit, using the local dev server with devtools open (Performance tab / Memory tab, not just the console):

1. **Staggered-overlay pileup**: `applyHazardResult()` in `main.ts` schedules one `setTimeout` per damaged tile (`delayMs = arrivalRound * ROUND_DURATION_MS`), uncapped. On a map with many defended/undefended tiles taking damage across many BFS rounds, or from several hazard triggers fired close together (each queuing its own full batch of timeouts on top of the previous batch's still-pending ones), this could pile up hundreds of pending timeouts and `hazardOverlay.show()` calls in a short window. Reproduce with `?autodefend` (or `?autobuild`) to fill the map, then fire several hazards back-to-back at high severity (2.5–3.0×) via the test panel, clicking "Trigger now" again before the previous sweep has visually finished. Watch the Performance tab for a long task / dropped frames, and check whether `hazardOverlay`'s internal state (mesh instance count, whatever backs `.show()`) grows unbounded rather than being capped or deduped per tile.
2. **Cross-era leak**: `checkEraEnd()` calls `elements.reset()` and `hazardOverlay.reset()`, and `state.startNewEra()` — check what these actually do to the underlying Three.js resources (geometries, materials, instanced mesh buffers). If `reset()` clears JS-side bookkeeping but doesn't call `.dispose()` on the corresponding Three.js objects (or doesn't shrink an `InstancedMesh`'s allocated capacity), repeated eras — easy to force via `?resilienceboost=-999` in a loop, or scripted repeated builds — will leak GPU memory and progressively slow the frame rate until it reads as "hanging." Take a heap snapshot before and after 5–10 forced era resets and compare retained Three.js object counts.
3. **Autobuild/autodefend at scale**: `devAutoBuild()` iterates every tile in `state.claimed` synchronously in a single call — on the full map (145 tiles, per the live HUD's "Tiles claimed" counter) this is a lot of synchronous work (`state.build()`, `elements.place()` with `{ animate: true }` triggering settle animations) in one tick. Confirm this alone doesn't block the main thread long enough to look like a hang, especially combined with `?autodefend&autobuild` together.
4. **General**: if none of the above reproduces it, ask the user for more specifics next time they hit it — browser/OS, roughly how long into a session, whether it recovers or needs a reload, any console output at the time. "Hanging" covers a wide range of actual failures (infinite loop vs. GC pause vs. a genuinely frozen tab vs. just a slow frame that felt like a freeze) and the fix is completely different depending on which it is.

## Part B — Confirm "map getting reset" is (or isn't) the intended era-loop

- Walk through the exact repro confirmed live above (drain Resilience to 0 via any means, then build) and confirm it matches what the user is describing. If so, this isn't a bug — but consider whether the era-end banner (`hud.showBanner(...)`, 3.5s, non-blocking) is easy to miss, making a genuine mechanic feel like unexplained data loss. A slightly longer banner duration or a more prominent treatment might be worth a note in `PROGRESS.md` as a UX follow-up, not a code fix in this pass.
- Actually try to find a reset that fires with Resilience still above zero — that would be the real bug. Places worth double-checking: any other call site of `state.startNewEra()` besides `checkEraEnd()`; whether `?resilienceboost` with a negative value can somehow leave `state.resilience` inconsistent with what the HUD displays; whether opening/closing the build popover rapidly, or clicking a tile mid-animation, can double-fire `checkEraEnd()` or otherwise corrupt state.

## What NOT to change

- No changes to the era-end condition itself (`state.isEraOver`, `resilience <= 0`) — Part B is about confirming/auditing, not altering when an era ends.
- No changes to absorption/decay tuning — that's Bug 1's fix (bring it back in scope here) plus whatever `STEP_PROMPT_balance_tuning.md` covers later, not this pass.

## Verify

- Bug 1 (`elements.json`'s `"monsoon_flood"` → `"flood"`) is fixed and confirmed via the A/B test already specified in `STEP_PROMPT_hazard_mechanics_fixes.md`.
- Whatever "hanging" scenario gets reproduced has a named root cause and a fix (or, if genuinely not reproducible after a real attempt at Part A's scenarios, say so plainly in `PROGRESS.md` along with what was tried, rather than silently dropping it).
- The "map getting reset" behavior is either confirmed as the intended era-loop (with a plain explanation for the user) or a real bug is found and fixed.
- `npm test` passes.
- `PROGRESS.md` gets the usual note, plus explicit lines for: Bug 1's fix landing, the hanging investigation's outcome, and the map-reset finding.
