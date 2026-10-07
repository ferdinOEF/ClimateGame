# Khazan — Step Prompt: Hazard-Strength Test Sliders

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or the prior step prompts — read those first. Drafted after reading `src/core/hazard.ts`, `src/main.ts`, `src/core/gameState.ts`, and `src/ui/hud.ts`/`hud.css` directly.

**The ask:** let the player manually trigger a Storm Surge Wave or a Flood at a chosen severity, on demand, instead of only ever seeing whatever `rolledSeverity()` happens to roll on schedule. This is a testing/tuning aid — it's how the balance work in `STEP_PROMPT_balance_tuning.md` gets driven interactively rather than only through the scripted harness, and how the science in `STEP_PROMPT_hazard_science.md` gets sanity-checked ("what does a 2.5x storm surge actually do to a fully-mangrove coastline?") without waiting out an 11-turn schedule.

There's a companion piece, `STEP_PROMPT_hud_layout.md` (or whatever the follow-up is named once the HUD direction is picked from `khazan_hud_options.html`), which is where this panel's final visual position gets decided. This prompt is written to stand on its own regardless of which HUD direction wins — it describes the control's behavior and a reasonable default placement, not a specific CSS layout.

---

## Why this is low-risk: the hook already exists

`resolveCyclone(state, baseSeverity = 1.0)` and `resolveMonsoonFlood(state, baseSeverity = 1.0, stormSurgeActive = false)` in `hazard.ts` already take severity as a parameter — nothing in the hazard-resolution engine needs to change. `main.ts`'s `triggerCyclone(baseSeverity)` and `triggerFlood(baseSeverity)` already wrap those calls with everything else a real hazard event does: clearing the telegraph tint, updating the cloud layer, resetting `nextCycloneAtTurn`/`nextFloodAtTurn`, playing the resolve sound, refreshing the HUD, checking era-end. **The sliders should call `triggerCyclone()`/`triggerFlood()` directly with the slider's value** — not a parallel code path — so a manual trigger behaves exactly like a scheduled one in every way except where the severity number came from.

One consequence worth keeping, not working around: `triggerFlood()`'s existing `stormSurgeActive` check (`cycloneTelegraphing || state.turn - lastStormSurgeResolvedTurn <= STORM_SURGE_COMPOUND_WINDOW_TURNS`) still runs normally. That means manually triggering Storm Surge and then, within a couple of turns, manually triggering Flood, correctly exercises the compound-flooding path (Section 3/5 of the hazard-science prompt) — which is exactly the scenario worth being able to force on demand rather than hope for.

## What to add

**A small control panel** — two labeled sliders (Storm Surge, Flood) and a "Trigger now" button under each:

- **Range:** 0 to 3, step 0.1. `rolledSeverity()`'s normal range is `1.0 + [0, 0.6) + severityBaseline` — so roughly 1.0–1.6 at the start of an era, creeping upward as `severityBaseline` accumulates (Section 2's "slowly rising monsoon intensity" hook). 0–3 comfortably spans "far weaker than anything that occurs naturally" through "well past worst-case," which is the point of a test control.
- **Default value:** 1.0 (the same floor `rolledSeverity()` starts from) is a reasonable initial slider position — not 0, which would silently do nothing if someone hits "Trigger" without looking at the value first.
- **Live numeric readout** next to each slider (e.g. "1.2×") — update on `input`, not just `change`, so dragging feels responsive.
- **Trigger button** calls `triggerCyclone(sliderValue)` or `triggerFlood(sliderValue)` respectively, reading the slider's current value at click time.
- **Color-code each slider/button to its hazard**, matching the palette already established in `khazan_hazard_prototype.html` and this project's other hazard visuals: Storm Surge blue (`#3E86B0`, i.e. `PALETTE.riverBlue` — the closest existing token, since there's no dedicated "storm" color in `palette.ts` yet), Flood brown (`#8C6A3F`, matching `defenseKhazanBund` — close enough to read as "flood/earth" without introducing a new unreferenced hex value). A small colored dot or left-border accent next to each label is enough; this doesn't need its own icon set.

**Placement:** default to a collapsible panel, closed on load, toggled by a small "Test hazards" tab/button — same instinct as Option A/B in the HUD review (`khazan_hud_options.html`), so a normal playtest looks unchanged unless someone deliberately opens it. If the HUD direction that gets picked already has an opinion on where this lives (e.g. Option C's always-visible bottom console), follow that instead — the collapsible default here is just the fallback if this lands before that decision does.

**Telegraph text, while a slider panel is open, is a nice-to-have not a requirement:** showing "next scheduled Storm Surge in N turns" next to the Storm Surge slider (reading `nextCycloneAtTurn - state.turn`, already computed in `updateCycloneTelegraph()`) helps orient whoever's testing, but skip it if it adds meaningfully more wiring than the sliders themselves.

## What NOT to change

- **`rolledSeverity()` and the turn-based schedule stay exactly as they are.** This is an additional way to trigger a hazard, not a replacement for the scheduled one — real play (and the balance-tuning harness) should keep experiencing hazards on their normal cadence. A manual trigger *does* legitimately reset `nextCycloneAtTurn`/`nextFloodAtTurn` (because it's reusing `triggerCyclone`/`triggerFlood` wholesale, per above) — that's expected and fine, not a bug to route around.
- **No changes to `hazard.ts`'s resolution logic.** `baseSeverity` is already a clean parameter; there's nothing to add there.
- **Don't gate this behind a build flag or URL param for this pass.** The game isn't in front of outside testers yet, and hiding it would just add friction to the tuning work this exists for. Worth revisiting (e.g. a `?debug` param, same convention as the old `?autoclaim`) once the game is further along and gets shared with someone who shouldn't see a test panel — flag it in `PROGRESS.md` as a later cleanup, don't build it now.

## Verify

- Dragging each slider updates its readout live and doesn't trigger anything by itself.
- "Trigger now" on Storm Surge fires `resolveCyclone` at exactly the slider's value — confirm by temporarily logging `baseSeverity` or checking that a slider set to 3.0 visibly destroys far more than one set to 0.3 against the same map state.
- Manually triggering Storm Surge, then Flood within `STORM_SURGE_COMPOUND_WINDOW_TURNS` turns, produces the compound (summed, capped) result — the same overlap behavior the hazard-science prompt describes, just reachable on demand instead of by chance.
- The normal scheduled hazards (turn 11, turn 15, etc.) still fire unaffected by the panel's presence.
- The panel's own state (open/closed, slider positions) doesn't need to persist across an era reset — resetting to default-closed/1.0 on `startNewEra()` is fine and simpler than preserving it.
- `PROGRESS.md` gets the usual note, plus the `?debug` gating idea flagged for later.
