# Khazan — Step Prompt: Hazard Mechanics Fixes (Flood Defenses, Test-Trigger Reset, Test Panel Visibility)

**How to use this document:** a scoped bug-fix pass, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or the prior step prompts — read those first, especially `STEP_PROMPT_hazard_science.md` (the mechanics this pass is defending) and `STEP_PROMPT_remove_claiming.md` (Section 10's dev-tooling convention, cited below). Drafted after reading `src/core/hazard.ts`, `src/data/elements.json`, `src/main.ts`, and `src/core/gameState.ts` directly, and after live-testing both the deployed build at climate-game-psi.vercel.app and a fetch of its shipped JS bundle to confirm which of these bugs are already live versus only present in the local working tree.

**Why this pass exists:** the whole premise of Khazan is that the defenses are scientifically grounded and actually matter — a seawall or a stand of pandanus should visibly blunt a storm surge, a khazan should visibly hold back a flood, because that's the entire teaching point of the game. Two real bugs currently undermine that premise, plus one testing-workflow issue that made them hard to see clearly. All three are fixed here together because they were found together, debugging the same complaint.

---

## Bug 1 (confirmed, currently only in the local working tree, not yet deployed): Flood-targeting defenses never register as targeting Flood

`hazard.ts`'s `resolveMonsoonFlood()` resolves the hazard by calling:

```ts
resolveHazardWave(state, "flood", upstream, channelAwareDecay(FLOOD_DECAY), skipDamage)
```

— the hazard id passed through the whole resolution pipeline is the literal string `"flood"`. But `elements.json` currently declares the flood-relevant defenses like this:

```json
"targetsHazards": ["monsoon_flood", "cyclone"]   // mangrove, khazan
"targetsHazards": ["monsoon_flood"]              // small_dam, sand_mining
```

Inside `resolveHazardWave`, every absorption/reservoir/failure branch is gated on `def.targetsHazards?.includes(hazardId)`. Since `"flood" !== "monsoon_flood"`, this is `false` for every one of these defenses, every time Flood resolves — Mangrove and Khazan's absorption never applies, Khazan's flood-buffer reservoir (`floodBufferCapacityM3`, `drawDownFloodBuffer()` — Section 4's whole reservoir mechanic) never engages, and Small Dam's failure-threshold branch never triggers either. All four fall straight through to the final `else` branch and take/pass full undefended severity, regardless of maturity or absorption values. **Storm Surge is not affected** — both `hazard.ts` (`resolveHazardWave(state, "cyclone", ...)`) and every relevant `elements.json` entry (`dune`, `sandy_vegetation`, `seawall`, and the `"cyclone"` half of `mangrove`/`khazan`'s arrays) agree on `"cyclone"`, and live A/B testing confirmed it: triggering Storm Surge at the same 1.0× severity dropped Resilience 47 points on an undefended map versus 28 points on a defended one — a real, working reduction.

We confirmed via `fetch()` against the deployed bundle's own source that the string `"monsoon_flood"` doesn't appear anywhere in what's currently live — only `"flood"` does — which is why testing the deployed URL directly still showed Khazan/Mangrove mitigating Flood correctly. The mismatch exists only in the local `elements.json` (grep confirms `"monsoon_flood"` appears in exactly those 4 lines, nowhere else in the codebase — `hazard.ts`, `main.ts`, and every other `targetsHazards` entry all agree on `"flood"`). It looks like `"monsoon_flood"` crept into `elements.json` during the Storm-Surge/Flood renaming pass (`STEP_PROMPT_hazard_science.md` Section 0), which explicitly kept `cyclone` as the code id while changing only its *display* name — the same rule was meant to apply to Flood's code id, and `elements.json` is the one file that didn't get the memo.

**Fix:** change all four `targetsHazards` entries in `elements.json` from `"monsoon_flood"` back to `"flood"`, matching `hazard.ts`, `main.ts`, and every other defense already in the file. Don't touch `hazard.ts` — its `"flood"` id is the one every other part of the codebase already agrees with; `elements.json` is the outlier.

## Bug 2 (confirmed live): a manually-triggered hazard that crosses Resilience to zero wipes the whole map

Reproduced directly on the deployed build: after building enough via `?autobuild` that the Food deficit alone had already driven Resilience to 0 (visible in the HUD, map still intact — `devAutoBuild()` doesn't call `checkEraEnd()`), clicking the Test Hazards panel's "Trigger now" on Flood immediately cleared every element on the map and reset Coin/Trust/Resilience/Food/Population to their starting values. This is `triggerFlood()`/`triggerCyclone()` in `main.ts` correctly doing what they're designed to do for a *real* hazard — call `checkEraEnd()`, which calls `state.startNewEra()` and wipes `elements`/`hazardOverlay` the moment `state.isEraOver` — but it's the wrong behavior for a *test* trigger, exactly per the user's note: manually firing a hazard to see what it does shouldn't cost you the board you built to test it on.

**Fix:** give `triggerFlood()`/`triggerCyclone()` (or their callers) a way to skip the `checkEraEnd()` call specifically when the trigger came from the test panel / a debug URL param, while leaving it fully intact for the two real call sites (`checkHazardSchedule()`'s scheduled firing, and `openTilePopover()`'s post-build check). The simplest shape: add an optional parameter (e.g. `triggerFlood(baseSeverity, { skipEraCheck = false } = {})`) that the test panel and the `?flood=`/`?cyclone=` URL-param handlers pass as `true`, and that the real scheduled path never sets. The hazard still resolves fully — damage, absorption, Resilience/Trust changes, the visual sweep — only the era-reset consequence is suppressed for a test fire. If Resilience is already at or below zero when a scheduled (non-test) hazard fires, the reset should still happen exactly as it does today — this fix is scoped to the test-trigger path only, not a change to when eras actually end.

## Bug 3 (confirmed live, a process gap more than a code bug): the Test Hazards panel is visible to every visitor, with no gate

Loading `https://climate-game-psi.vercel.app/` with no URL params at all shows a "Test hazards" button in the bottom-left corner, always — anyone who opens the game can find it. This runs against a convention the codebase already states explicitly for exactly this kind of tooling (`main.ts`, above `devAutoBuild()`): *"Dev-only scenario helpers (Section 10: a hidden, non-UI debug overlay is explicitly sanctioned for testing). Not part of the real UI — no button, no visible affordance. Triggered only via URL params."* The Test Hazards panel is the same category of tool as `devAutoBuild`/`?coinboost`/`?resilienceboost` — testing-only, not meant for players — but unlike those, it shipped as a persistent, discoverable UI element instead of a hidden URL-param hook. This matches the user's explicit note directly: *"The test triggering of hazards is only for me right now but will not be in the actual game."*

**Fix:** gate the panel's existence behind a URL param, same pattern as every other dev tool already in `main.ts` — e.g. only construct/mount the Test Hazards panel when `params.has("debughazards")` (or fold it into an existing flag if one reads better). No button, no drawer tab, nothing rendered at all for a normal visit with no params — same "no visible affordance" bar the rest of Section 10's tooling already holds itself to. This is purely an addition to how the panel is mounted; the panel's own sliders/buttons/behavior (which already closely matches what `STEP_PROMPT_hazard_test_sliders.md` asked for) don't need to change.

---

## What NOT to change

- No changes to absorption values, `matureTurns`, `overwhelmSeverity`, or any other tuning numbers in `elements.json` — this pass fixes the *id* mismatch, not the balance. Once Bug 1 is fixed, Flood mitigation numbers become live for the first time and may well need their own tuning pass (`STEP_PROMPT_balance_tuning.md`) — expect that as a natural follow-up, not something to pre-emptively adjust here.
- No changes to `checkEraEnd()`'s actual trigger condition (`state.isEraOver`, i.e. `resilience <= 0`) — Bug 2's fix suppresses the *call* on the test path, not the *condition*.
- No changes to Storm Surge's resolution — it isn't broken.

## Verify

- With Bug 1 fixed: build a mature Khazan and/or Mangrove on Estuary tiles, trigger Flood at a fixed severity (e.g. 1.5×) via the test panel, and confirm the resulting Resilience drop is meaningfully smaller than the same trigger against an undefended map — the same kind of A/B comparison this document's Storm Surge numbers already demonstrate. Also confirm a Khazan's `floodBufferFilled` actually changes (log it, or check via a debug hook) — proof the reservoir mechanic is engaging at all, not just that damage numbers moved.
- With Bug 2 fixed: drive Resilience to zero (Food deficit or a first hazard), then use the test panel to fire another hazard — the map should NOT reset; elements stay standing, Coin/meters reflect the new hazard's effects on top of the already-low Resilience. Separately, confirm a *real* scheduled hazard (wait out `nextFloodAtTurn`/`nextCycloneAtTurn`, or drop Resilience to 0 via `?resilienceboost=-999` and continue playing normally) still correctly resets the era exactly as before — this fix must not touch that path.
- With Bug 3 fixed: loading the bare URL with no params shows no Test Hazards button anywhere; loading with the chosen debug param shows it exactly as today.
- `npm test` passes.
- `PROGRESS.md` gets the usual note — flag Flood mitigation as "newly actually active, may need its own balance pass" so it isn't mistaken for having been tuned already.
