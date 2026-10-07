# Khazan — Step Prompt: Small Dam Gets a Real Reservoir (Hydrodynamic Correction)

**How to use this document:** a scoped mechanics addition, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, `STEP_PROMPT_hazard_science.md`, or the prior step prompts — read those first, especially Section 4's Khazan reservoir writeup (the mechanic this prompt extends) and `STEP_PROMPT_hazard_mechanics_fixes.md`/`STEP_PROMPT_remove_schedule_confirm_shadowing.md` (the shadowing mechanic this doesn't touch). Drafted after a hydrodynamics/coastal-engineering review of Storm Surge vs. Flood as currently modeled, and after reading `src/core/hazard.ts` and `src/core/gameState.ts` directly.

**Why this exists:** Storm Surge is a pulse — wind/pressure-driven, delivered over hours, opposed by structures that either hold, get overwhelmed, or breach at a force threshold. That's a percentage-absorption-against-instantaneous-severity model, and it's what Seawall, Dune, Sandy Vegetation, and Mangrove correctly use against it. Flood is a sustained volume — catchment discharge arriving over days, better opposed by something that stores water up to a capacity and drains gradually. Khazan already models this correctly (`floodBufferCapacityM3`, draws down first, recovers slowly across turns — see `gameState.ts`'s `drawDownFloodBuffer()`/`FLOOD_BUFFER_RECOVERY_RATE`). **Small Dam currently doesn't** — it targets Flood but uses the exact same instantaneous-percentage-plus-catastrophic-breach model as Seawall uses against Storm Surge (`absorptionAtMaturity: 0.75`, `failureThreshold: 1.15` in `elements.json`). That's the wrong physical category: a dam is a storage-and-release structure, not a wave-attenuator. It should behave like a smaller, more brittle version of Khazan's reservoir — and when it does fail, it should fail the way real dams fail: overtopping leads to a breach that releases the *stored* volume, not just a shrug against the raw incoming pulse.

---

## What to change in `elements.json`

Add `floodBufferCapacityM3` to Small Dam's entry, same field Khazan already uses. **Placeholder value, not a settled number** (same convention as every other magnitude in this file) — suggest something meaningfully smaller than Khazan's 1500 m³, since a small engineered check-dam on a River tile is a much smaller structure than a hectare-scale wetland/paddy system: **800 m³** is a reasonable starting placeholder (roughly half of Khazan's), but flag it explicitly for `STEP_PROMPT_balance_tuning.md` to revisit once the mechanic is live. Leave `absorptionAtMaturity` and `failureThreshold` in place — both are still used, just against the *post-buffer overflow* now instead of the raw incoming severity (see below). Note in the entry's own `note` field (matching how every other placeholder in this file documents itself) that the capacity is a placeholder and that `failureThreshold`'s effective trigger rate will shift now that it's tested against overflow rather than raw severity — worth a fresh look in the same tuning pass.

## What to change in `hazard.ts`

**The core problem:** `resolveHazardWave()`'s branch order currently checks catastrophic failure (`def.category === "engineered" && def.failureThreshold !== undefined && severity > def.failureThreshold`) *before* it ever checks `floodBufferCapacityM3`. Since Small Dam is `"engineered"` and already has `failureThreshold`, simply adding `floodBufferCapacityM3` to its JSON entry would do nothing — the breach check would still fire against the raw incoming severity, exactly as it does today, and the reservoir branch beneath it would never be reached. The reservoir has to run first; only once you know what actually overtopped it does a breach test make physical sense.

**The fix:** restructure the branch order so `floodBufferCapacityM3` is checked first — for *any* qualifying defense, not just non-engineered ones — and move the engineered catastrophic-breach test *inside* that branch, evaluated against `overflowSeverity` instead of raw `severity`. Concretely, the current structure is:

```ts
if (def && targets && def.category === "engineered" && def.failureThreshold !== undefined && severity > def.failureThreshold) {
  // catastrophic breach vs. raw severity
  ...
} else if (def && targets && def.floodBufferCapacityM3 !== undefined) {
  // reservoir mechanic
  ...
} else if (def && targets) {
  // plain % absorption
  ...
} else {
  // undefended
  ...
}
```

Restructure to:

```ts
if (def && targets && def.floodBufferCapacityM3 !== undefined) {
  // Reservoir runs first, regardless of category — a storage structure's
  // failure condition is about what overtops it, not the raw incoming pulse.
  const volume = severity * HEX_AREA_M2 * FLOOD_VOLUME_DEPTH_M;
  const overflowVolume = state.drawDownFloodBuffer(tile.coord, volume);
  const overflowSeverity = severity * (overflowVolume / volume);

  if (overflowSeverity < MIN_SEVERITY) {
    passthrough = 0; // fully absorbed by the reservoir this event
  } else if (def.category === "engineered" && def.failureThreshold !== undefined && overflowSeverity > def.failureThreshold) {
    // Catastrophic breach: the buffer overtopped hard enough to fail the
    // structure outright. Releases the OVERFLOW onward at the redirect
    // multiplier — a dam breach dumps what overtopped it, not the raw
    // incoming severity — same mechanic Seawall already uses, just against
    // the post-buffer figure instead of the pre-buffer one.
    tileDamage.set(key, overflowSeverity);
    state.destroyDefense(tile.coord);
    destroyedDefenses.push(key);
    passthrough = overflowSeverity * (def.failureRedirectMultiplier ?? 1);
  } else {
    let absorption = state.effectiveAbsorption(tile.coord);
    if (def.overwhelmSeverity !== undefined && overflowSeverity > def.overwhelmSeverity) {
      absorption *= def.overwhelmedAbsorptionMultiplier ?? 0.5;
      overwhelmedDefenses.push(key);
      if (def.degradeGracefully && def.gracefulDegradeStep) state.degradeDefense(tile.coord, def.gracefulDegradeStep);
    }
    const dealt = overflowSeverity * (1 - absorption);
    tileDamage.set(key, dealt);
    passthrough = dealt;
  }
} else if (def && targets && def.category === "engineered" && def.failureThreshold !== undefined && severity > def.failureThreshold) {
  // Unchanged — Seawall's own path. No buffer involved, so this still
  // tests against raw severity exactly as before.
  ...
} else if (def && targets) {
  // Unchanged — plain % absorption (Dune, Sandy Vegetation, Mangrove's
  // Storm Surge side).
  ...
} else {
  // Unchanged — undefended.
  ...
}
```

**Confirm this doesn't change Khazan or Seawall's behavior**, since that's the whole point of scoping it this way:

- **Khazan** (`category: "hybrid"`, has `floodBufferCapacityM3`, no `failureThreshold`) still lands in the reservoir branch, and since `def.category === "engineered"` is false for it, it falls straight to the same overwhelm/absorption `else` it already used — byte-for-byte identical behavior to today.
- **Seawall** (`category: "engineered"`, has `failureThreshold`, no `floodBufferCapacityM3`) never enters the reservoir branch at all (the `floodBufferCapacityM3 !== undefined` check fails immediately), so it falls through to its own unchanged `else if` — identical behavior to today.
- **Only Small Dam** — `"engineered"` *and*, after this pass, has both `failureThreshold` and `floodBufferCapacityM3` — actually exercises the new combined path.

## What NOT to change

- No changes to Seawall, Dune, Sandy Vegetation, or Mangrove's mechanics or numbers — this pass is Small Dam only.
- No changes to `MIN_SEVERITY`, `FLOOD_DECAY`, `RIVER_CHANNEL_DECAY`, `CYCLONE_DECAY`, or the max-severity BFS merge rule.
- No changes to `FLOOD_BUFFER_RECOVERY_RATE` or how recovery works — Small Dam should recover on the exact same per-turn cadence Khazan already does. (Worth noting, not changing: this actually matches real dam operation — operators pre-release stored water ahead of the next flood season/storm to restore capacity, which is functionally what the existing turn-based recovery already represents. No new mechanic needed here, it just happens to fit.)
- No changes to Sand Mining — it stays a plain, near-useless (`absorptionAtMaturity: 0.1`) flood defense with no reservoir; that's intentional per its own existing `note`.
- Don't hand-tune `failureThreshold` or `absorptionAtMaturity` down to compensate for the new buffer absorbing most of an event first — leave both exactly as they are and let `STEP_PROMPT_balance_tuning.md`'s harness decide whether they need to move, now that they're finally being exercised against the right input (overflow, not raw severity).

## Verify

- Build a mature Small Dam on a River tile, trigger Flood at a low-to-moderate severity (e.g. 0.5–1.0×) via the test panel, and confirm the dam's own tile takes zero or near-zero damage while its buffer fills (log `floodBufferFilled` via a temporary check, or reuse the existing test-hook pattern from the prior shadowing-verification pass) — the reservoir should visibly draw down before any percentage-absorption math runs, same as Khazan's own verified behavior.
- Fire Flood again before the buffer has recovered (back-to-back, within the same or next turn) at a high severity (2.5–3.0×) and confirm it now *can* breach — `destroyedDefenses` includes the dam's tile, and the redirected passthrough is computed from the overflow severity, not the raw incoming severity (check the numbers against the formula above, the same way the shadowing-verification pass checked `dealt`/`passthrough` numerically).
- Confirm Khazan and Seawall's behavior is byte-for-byte unchanged — re-run whatever existing test coverage exists for their absorption/breach numbers and confirm nothing moved.
- `tsc --noEmit` clean, `npm test` passes (58/58 plus whatever this pass adds).
- `PROGRESS.md` gets the usual note, flagging Small Dam's `floodBufferCapacityM3` (800, placeholder) and its now-overflow-gated `failureThreshold` as both needing a look in the next `STEP_PROMPT_balance_tuning.md` pass, same as every other freshly-live number in this project.
