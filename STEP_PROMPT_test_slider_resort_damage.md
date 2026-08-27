# Khazan — Step Prompt: Test-Panel Severity Rescale, Resort Icon Fix, Storm-Damaged Buildings

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md` or `NEXT_STEPS.md`. Three independent changes, none touching hazard math itself — land as three separate commits.

---

## 1. Rescale the Test Hazards panel's severity sliders — same label range, half the actual strength, capped

**Current behavior, confirmed in `hazardTestPanel.ts`:** both sliders (`storm-slider`, `flood-slider`) run `min="0" max="3" step="0.1"`, and the raw slider value is passed straight through as `baseSeverity` with no conversion — six call sites do this: the two `Trigger now` button handlers (`onTriggerStorm`/`onTriggerFlood`), the two `input` handlers (live-updates an active Preview at the current slider value), and the two Preview checkboxes' `change` handlers. The visible "×" readout is just that same raw value.

**Requested change:** halve what a given slider position actually produces, and lower the max. Concretely — a slider position that used to read "0.5×" and produce `baseSeverity 0.5` should now need to be set to "1.0×" to produce that same `0.5` severity; what used to be "1.0×" (`baseSeverity 1.0`) now needs "2.0×". In other words: **the number displayed next to the slider stays exactly what the raw slider value is (unchanged UI), but the actual `baseSeverity` passed to `triggerCyclone`/`triggerFlood`/the preview path becomes `sliderValue / 2`.** Combined with capping the slider's own max at `2` (down from `3`), the strongest severity now reachable from either slider is `baseSeverity 1.0` — what used to require the slider's lowest-third position now needs to be pushed most of the way up, which is the actual fix for "currently tuned to strong hazards."

**Implementation — keep this entirely inside `hazardTestPanel.ts`, don't touch `main.ts` or `hazard.ts`:**

- Change both sliders' `max="3"` to `max="2"`.
- Add one small conversion, e.g. `const sliderToSeverity = (v: number) => v / 2;`, and apply it at every one of the six call sites listed above — the readout text (`.storm-readout`/`.flood-readout` `textContent`) keeps displaying the raw, un-halved slider value exactly as it does today; only the number handed to a callback changes.
- `DEFAULT_SEVERITY` (currently `1.0`, used for both the initial slider position and `reset()`) is a judgment call — leaving it at `1.0` keeps the visible default unchanged (now producing `baseSeverity 0.5` under the new mapping) and seems like the sensible default; change it only if that default actually feels wrong once you're looking at real triggered severities.
- Don't change `step="0.1"` — same granularity, smaller range.

**Verify:** open the panel, set a slider to `1.0×`, trigger it, and confirm (via a console log of `baseSeverity` in `triggerCyclone`/`triggerFlood`, or just by feel against the now-known-broken original numbers) that the actual severity used is `0.5`, not `1.0`; confirm the slider physically cannot be moved past `2.0×`; confirm Preview (checkbox + live drag) reflects the same halved value the real trigger would use — preview and trigger must never disagree about what a given slider position means.

---

## 2. Remove the palm tree from Beachside Resort's icon

**Location, confirmed in `elementGeometry.ts`:** `beachsideResortGeometry()` ends with `parts.push(palmGeometry(0.78, 0.15));` (line ~223) — a lone palm tree placed beside the resort building, built by the `palmGeometry()` function directly above it (~line 142).

**Change:** remove that one `parts.push(palmGeometry(0.78, 0.15))` line, so the resort's icon is the building block, parapet, windows, awning/door, pennant, and pool — no palm. Once removed, `palmGeometry()` has no remaining caller anywhere in the file — remove the now-dead function too, matching this project's own established dead-code-cleanup convention (`STEP_PROMPT_code_review_cleanup.md`), rather than leaving an unused function behind.

**Verify:** a claimed Beachside Resort tile screenshot shows no tree; every other part of the icon (block, parapet, window grid, awning, door, pennant, pool) is unchanged; `tsc --noEmit` clean (confirms nothing else still references `palmGeometry`).

---

## 3. Show damage on House/Beachside Resort when Storm Surge hits them

**The gap:** House and Beachside Resort are "building"-kind elements, not defenses — in `resolveHazardWave()`, they fall into the plain `else` branch (no `targetsHazards`, so no absorption/overwhelm/failure logic ever runs for them), meaning they silently take full damage into `tileDamage` with **zero visual feedback**. The only existing consequence today is numeric: `resolveCyclone()` already has a loop that walks `result.tileDamage`, and for every tile where `damage >= DAMAGE_TRUST_THRESHOLD (0.3)` and `state.hasBuildingAt(key)` is true, deducts `TRUST_LOSS_PER_DAMAGED_BUILDING` from Trust. **That condition is exactly "a House or Resort just took meaningful storm damage"** — reuse it directly rather than computing a second, possibly-inconsistent notion of "damaged enough to show."

**Also worth knowing, since it's genuinely useful infrastructure here:** `ElementMeshManager` already has `setDegradeVisual(coord, degradeAmount)`, which tints an instance's color toward `DEGRADED_TINT` (a dull, patchy brown) proportional to `degradeAmount` — currently only called for Khazan's graceful-degrade mechanic. The tint-blend technique is exactly the visual language this ask wants ("switch to a damaged version"); the question is only whether to reuse it as-is or add a purpose-built sibling.

**Implementation:**

- In `hazard.ts`, extend `CycloneResult` with a new field — `damagedBuildings: string[]` (coord keys) is a reasonable name — and populate it inside `resolveCyclone()`'s existing trust-loss loop, alongside the `trustLost` accumulation (same `if` condition, no new logic branch needed): every key that causes a Trust deduction also gets pushed onto this list.
- In `main.ts`'s `triggerCyclone()`, after `resolveCyclone()` returns `result`, iterate `result.damagedBuildings` (use `axialFromKey()` from `core/hex.ts` to get back to `{q, r}`, same as other code in this file already does) and call into the `ElementMeshManager` instance `main.ts` already holds for `place()`/`destroy()`/`setDegradeVisual()` elsewhere, to apply the damaged look.
- **Default recommendation — add a small, purpose-named method rather than repurposing `setDegradeVisual` with a made-up `degradeAmount` number:** something like `setBuildingDamagedVisual(coord: AxialCoord): void` in `ElementMeshManager`, which does the same tint-toward-`DEGRADED_TINT` blend `setDegradeVisual` already does (reuse that color/blend math directly — don't invent a second damaged palette) but is named for what it actually represents here: a discrete "this building was hit" state, not a gradual defense-wear amount. Keeping it a separate, clearly-named method is worth the few extra lines — `setDegradeVisual`'s own name and doc comment are specifically about graceful defense degradation, and conflating the two ideas under one call site (`setDegradeVisual(coord, 0.5)` with a magic number chosen only to reach full tint) would read as a hack later.
- **Alternative worth flagging, not doing by default:** a genuinely distinct damaged mesh (boarded windows, a missing roof section, a listing wall) built the same low-poly-primitive way every other icon in `elementGeometry.ts` is, swapped in via `ElementMeshManager` the same way a defense's geometry could theoretically be swapped. This reads as more literally "a damaged icon" than a color tint does, but it's real new asset-modeling work for two elements (House and Resort each need their own damaged variant) rather than reusing existing, already-verified code. Default to the tint approach above; only build this if the tint reads as too subtle once you're actually looking at it in the scene.
- **Persistence:** there's no repair mechanic anywhere in this codebase today, so the damaged tint should simply persist until the tile is removed and rebuilt (the existing `BuildPopover` "Remove" flow already calls `destroy()`, and a fresh `place()` on rebuild gets a clean `baseColor` with no tint) or a new era resets everything (`ElementMeshManager.reset()` already clears every instance). Don't build a separate "repair" action as part of this pass — out of scope.
- Scope check: this is Storm Surge only, per the request's own wording ("if there was a house, resort that gets impacted or affected by storm surge"). Don't extend the same treatment to `resolveMonsoonFlood()`/`triggerFlood()` in this pass.

**Verify:** trigger a Storm Surge (Test Hazards panel, at a severity high enough to actually deal ≥0.3 damage to at least one House/Resort tile — check the rescaled slider from Section 1 can still reach that; if the new capped max can't, that's worth flagging back rather than silently working around) and confirm any House/Resort tile that took meaningful damage visibly tints/darkens right after the wave-sweep resolves; confirm a House/Resort tile that took little-to-no damage stays unchanged; confirm the tint persists after the hazard's aftermath summary closes and normal play resumes; confirm removing and rebuilding a damaged tile restores its normal, undamaged look; confirm nothing changes for defenses (Seawall, Mangrove, etc.) — this section only touches building-kind elements.

---

## Guardrails

- No changes to hazard math, decay constants, `DAMAGE_TRUST_THRESHOLD`, `TRUST_LOSS_PER_DAMAGED_BUILDING`, or any balance constant from `STEP_PROMPT_balance_tuning_findings.md`.
- Section 1 stays entirely inside `hazardTestPanel.ts` — the real scheduled hazard loop's severity formula (`rolledSeverity()` in `main.ts`) is untouched by this pass.
- Section 3 is Storm Surge only, building-kind elements only (`hasBuildingAt`) — don't widen scope to Flood or to defenses.
- Three separate commits: (1) slider rescale, (2) resort tree removal, (3) storm-damaged building visual.

## Verify (whole pass)

- `tsc --noEmit` clean; existing test suite passing at current baseline or better.
- `PROGRESS.md` gets the usual entry, including whichever choice was made on Section 3's tint-vs-new-geometry question and why.
