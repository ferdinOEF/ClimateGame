# Khazan — Step Prompt: Remove Auto-Scheduled Hazards, Confirm & Harden Defense Shadowing

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or the prior step prompts — read those first, especially `STEP_PROMPT_hazard_mechanics_fixes.md` (Bug 1's fix is a prerequisite for the shadowing work below to matter for Flood) and `STEP_PROMPT_hud_instrument_cluster.md` (whose hazard-incoming display this partially reverses — explained below). Drafted after reading the current `src/main.ts` and `src/core/hazard.ts` directly.

---

## Part A — Remove the turn-based auto-trigger

**The ask, confirmed:** hazards should no longer fire on their own schedule (`FLOOD_INTERVAL_TURNS`/`CYCLONE_INTERVAL_TURNS`). The Test Hazards panel (gated behind `?debughazards`, per `STEP_PROMPT_hazard_mechanics_fixes.md` Bug 3) becomes the *only* way a hazard happens right now — this is a deliberate choice for the current testing phase, so hazard timing and severity stay entirely under the tester's control while the propagation/defense mechanics get worked out, without a scheduled event interrupting a test mid-setup.

**What to change in `main.ts`:**

- `checkHazardSchedule()` currently does two things per hazard: fire it if the schedule's due (`triggerFlood(rolledSeverity())` / `triggerCyclone(rolledSeverity())`), otherwise update its telegraph (`updateFloodTelegraph()` / `updateCycloneTelegraph()`). Both go — stop calling `checkHazardSchedule()` from `openTilePopover()`'s build callback entirely (or delete the function and its call site together; either is fine, whichever reads cleaner to leave for later).
- **This also retires the telegraph systems that only existed to warn about the auto-schedule**: the river/coast terrain tint (`updateFloodTelegraph()`/`updateCycloneTelegraph()`'s `terrain.setTint(...)` calls), the cloud layer's schedule-driven visibility (`updateCloudVisibility()`'s `floodTelegraphing || cycloneTelegraphing` condition), and the spinning storm icon (`cycloneIcon.visible`). None of these should keep running once nothing is actually counting down to a real event — a telegraph that never resolves into anything is worse than no telegraph, it just reads as broken.
- **`hazardIncomingInfo()`/`Hud.setHazardIncoming()`** (just added per `STEP_PROMPT_hud_instrument_cluster.md`) becomes dead weight for the same reason — there's no schedule left to report a countdown against. Simplest correct fix: have `hazardIncomingInfo()` return `[]` unconditionally (or stop calling `hud.setHazardIncoming(...)` from `refreshHud()` at all), so the HUD's hazard-incoming line area just renders nothing rather than showing a stale or nonsensical countdown. **Don't delete the plumbing** (the HUD method, the CSS, `nextFloodAtTurn`/`nextCycloneAtTurn` themselves) — a real scheduling/telegraph design is very likely coming back once the actual player-facing trigger mechanism gets designed (see the note below), and re-enabling a countdown display should be cheap when that happens, not a rebuild.
- The Test Hazards panel's own `setScheduleInfo()` call (`updateHazardTestSchedule()`) can stay exactly as-is if it's still useful context while testing (e.g. showing what the retired schedule *would* have been), or go if it now reads as confusing/misleading next to a schedule that no longer fires anything — your call, low-stakes either way. If kept, its label should make clear this is informational only and nothing will actually happen at that turn count.

**Explicitly not in scope here:** designing what *does* eventually trigger a hazard for real players. Right now that's an open question — a later pass, possibly tied to the "zone-based resolution model" `elements.json`'s `small_dam` note already flags as a forward-looking direction, or something else entirely. This step prompt only removes the current placeholder mechanism; it doesn't replace it. **Flag this explicitly in `PROGRESS.md`**: real players currently have no way to experience a hazard at all (the trigger panel is dev-gated, and the schedule is gone) — that's fine for the mechanics-testing phase this and the previous step prompt are both part of, but it's a real gap before this goes in front of anyone else, and shouldn't be forgotten.

---

## Part B — Confirm and harden the defense-shadowing mechanic

**The ask, confirmed:** a defense (Seawall, Khazan, Mangrove, Dune, Pandanus, Small Dam) shouldn't just reduce damage at its own tile — it should reduce how much of the hazard continues on to the tiles behind it, in the direction the hazard is traveling. A tile shielded by a mature Seawall should come through a storm surge meaningfully better than an equivalent undefended tile, depending on the surge's intensity.

**Good news: this already exists in `resolveHazardWave()` (`hazard.ts`), and it's worth being explicit that it's deliberate, not incidental.** The relevant lines:

```ts
const dealt = severity * (1 - absorption);
tileDamage.set(key, dealt);
passthrough = dealt;   // <-- the same reduced value both damages this tile AND is what continues to its neighbors
```

Every hop afterward multiplies `passthrough` (not the original, undefended `severity`) by that edge's decay factor. So a mature Seawall at 90% absorption doesn't just take 90% less damage itself — it also relays only 10% of the incoming severity onward, before that next hop's own terrain decay even applies. In practice: a severity-1.0 storm surge hitting a Seawall'd Beach tile deals 0.1 damage there and relays `0.1 × decay` onward — for `CYCLONE_DECAY = 0.6`, that's `0.06`, already below `MIN_SEVERITY` (`0.08`), meaning the next tile inland is never even touched. **That's the "tile behind a seawall gets saved" mechanic, already working, scaling exactly the way the request describes — weaker on a low-severity trigger, breached at high enough severity** (a severity-3.0 surge through the same Seawall still relays `3.0 × 0.1 × 0.6 = 0.18`, well above the cutoff, so a strong enough storm does get through).

**One real caveat worth naming explicitly, because it's very likely why this hasn't been reading as obvious in testing:** Storm Surge's sources are *every* Coast/Estuary tile simultaneously (`resolveCyclone()`'s `sources` map), and `resolveHazardWave()` keeps the **maximum** severity arriving at a tile from any neighbor (`if (existing === undefined || hopSeverity > existing) nextWave.set(...)`) — not the minimum, not an average. That means a tile sitting behind one defended Beach tile can still take a full hit if it's *also* reachable, at a similar hop-distance, through a neighboring **undefended** Beach tile. A partial, gapped defensive line gives partial, gapped protection — water (or wind-driven surge) goes around the gap, not just through the wall. This is physically realistic (a real seawall that doesn't fully enclose what's behind it doesn't fully protect it either), but it means the clean "one seawall, one saved tile" mental model only holds when the defended tiles actually form an unbroken line across every approach — a single Seawall tile with open Beach on either side won't read as "working" the way this request expects, even though its own math is correct.

**What to actually do here:**

1. **Nothing needs to change in the propagation math itself** — Part A's own testing (once Bug 1's `elements.json` id fix lands, so Flood's defenses register at all) should be enough to confirm this mechanic already does what's being asked, for both hazards.
2. **Add the verification case that actually proves it**, since nothing so far has isolated it cleanly: use `?autodefend` or manual builds to put a **contiguous, mature** line of Seawall (or Dune/Pandanus) across an entire Beach column — no gaps — then trigger Storm Surge at a moderate severity (the test panel's slider, e.g. 1.0–1.5×) and confirm the tiles immediately behind that unbroken line take zero or near-zero damage, while a deliberately gapped line (skip one tile) lets damage through at the gap and its immediate neighbors. Do the equivalent for Flood with a contiguous Khazan/Mangrove line across an Estuary column, once Bug 1 is fixed. This is the concrete repro that either confirms the existing mechanic is doing its job (expected outcome) or surfaces a real bug if the unbroken-line case still doesn't protect what's behind it (in which case there's something beyond the id mismatch worth investigating further).
3. **Worth adding, not required:** some visible confirmation in the hazard-sweep animation that a tile was shielded — e.g. a distinct, muted overlay tint (or simply no overlay at all, since a tile whose severity got cut below `MIN_SEVERITY` is never visited and never gets an overlay today) versus a damaged one, so a player watching a storm surge sweep in can actually *see* the wave stop at the defended line rather than having to infer it from the Resilience number afterward. This is a legibility improvement, not a mechanics fix — skip it for this pass if it adds meaningfully more work than the verification above, and pick it up later once the underlying mechanic is confirmed solid.

## What NOT to change

- No changes to absorption values, decay constants, or `MIN_SEVERITY` — Part B is about confirming and demonstrating the existing mechanic, not retuning it.
- No changes to `resolveHazardWave()`'s "take the max severity across incoming edges" rule — the flanking behavior described above is realistic and worth keeping; it's the reason a *contiguous* defensive line matters, which is itself a meaningful, teachable part of the game's coastal-engineering point.

## Verify

- A normal playthrough (no `?debughazards`) never sees a hazard fire, telegraph, or count down — nothing happens without the tester triggering it. `PROGRESS.md` carries the "no real trigger mechanism yet" flag from Part A.
- The Test Hazards panel still works exactly as it does today (severity sliders, "Trigger now," `skipEraCheck`) — Part A doesn't touch it.
- The contiguous-defensive-line test (Part B, item 2) shows the tiles directly behind an unbroken line of matured Seawall/Dune/Pandanus taking zero or minimal damage at a moderate Storm Surge severity, with visibly more damage getting through at a deliberately-left gap. Repeat for Flood behind Khazan/Mangrove once Bug 1 is fixed.
- `npm test` passes.
- `PROGRESS.md` gets the usual note, plus the two flags above (no live trigger mechanism yet; defense shadowing confirmed via the contiguous-line test).
