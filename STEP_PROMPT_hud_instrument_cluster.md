# Khazan — Step Prompt: HUD v3 (Instrument Cluster, Resilience-Only, Hazard Incoming)

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `NEXT_STEPS.md`, or the prior step prompts — read those first. Drafted after reading `src/ui/hud.ts`, `src/ui/hud.css`, and `src/main.ts` directly, and after the user picked "Instrument Cluster" (Option A) from `khazan_hud_options.html`, with two amendments to that option.

**The ask, confirmed:**

1. Keep Option A's card layout (top-left grouped card, evolving the current corner-chip HUD), but **show only Resilience as a gauge — hide Trust.** Trust stays in the data model and keeps accumulating exactly as it does today (`gameState.ts`'s `trust` field, `applyHazardOutcome()`, the Food-deficit drain); it's only the HUD display that drops it. This tracks the actual mechanics: `get isEraOver()` in `gameState.ts` reads `this.resilience <= 0` only — Trust has never been the meter that ends an era, so surfacing it as a second "life bar" alongside Resilience was overstating its importance. (If Trust turns out to matter for something else later, it's one line to bring back — this isn't a data-model change.)
2. **Add a hazard-incoming readout to the main HUD card itself** — not the Test Hazards panel (see `STEP_PROMPT_hazard_mechanics_fixes.md` for why that panel needs to stop being player-visible at all). Real players should be able to see a storm surge or flood telegraphing without needing any debug tooling.

## What changes in `hud.ts` / `hud.css`

**Remove the Trust gauge and its element references** — `trustEl` and the markup row that renders it. Resilience becomes the sole life-meter, and per the HUD-options mockup, it's worth promoting to a real gauge (a labeled bar, not just a numeric chip) since it's the one number that actually threatens an era-end. The rest of the chip grid (Biodiversity, Carbon, Food, Population) stays as-is — those don't need bars, the existing numeric-chip treatment already reads fine for meters that don't gate anything.

**Add a hazard-incoming line to the card**, something like `Hud.setHazardIncoming(kind, turnsUntil)`:

- Reads the same countdown `main.ts` already computes internally for the terrain-tint telegraph — `nextCycloneAtTurn - state.turn` and `nextFloodAtTurn - state.turn` (see `updateCycloneTelegraph()` / `updateFloodTelegraph()`). This is a display-only addition; the telegraph math itself doesn't change.
- Show whichever hazard is closer when both are more than `CYCLONE_TELEGRAPH_TURNS` / `FLOOD_TELEGRAPH_TURNS` out (i.e., neither is "imminent" yet) — e.g. "Storm Surge in 7 turns." Once a hazard enters its actual telegraph window (1 turn for Storm Surge, 2 for Flood — the existing terrain-tint/cloud-layer trigger point), switch its line to an urgent treatment (the warm/warning color already used for the Food-deficit chip, `meter-chip-warning` in `hud.css`) so the HUD's telegraph and the in-scene tint/cloud telegraph reinforce each other instead of being two disconnected signals.
- If both hazards are simultaneously within their telegraph windows, show both lines — don't collapse to one; that's exactly the compound-event case `STEP_PROMPT_hazard_science.md` Section 3/5 cares about, and hiding one hazard's warning because the other is closer would work against the "did you notice this is a compound event" goal.
- Call `setHazardIncoming(...)` from wherever `refreshHud()` already runs (`main.ts`), reading the same `nextCycloneAtTurn`/`nextFloodAtTurn`/`state.turn` values — no new state to track, this is a read of numbers that already exist.

## Layout notes (non-binding specifics, follow the mockup's spirit)

- Keep the card at top-left, same footprint family as today's `meters-panel`.
- Suggested order top-to-bottom: Coin + Turn/Era header row → Resilience gauge → hazard-incoming line(s) → the Biodiversity/Carbon/Food/Population chip grid. The hazard line sits between the life-meter and the secondary meters because it's the thing that's about to affect the life-meter — that adjacency is doing real communicative work, not just tidiness.
- Tile-empty prompt and Yacht goal stay where they are (bottom-center / bottom-right corners) — this pass only touches the top-left card.

## What NOT to change

- No changes to `nextCycloneAtTurn`/`nextFloodAtTurn` scheduling, `CYCLONE_TELEGRAPH_TURNS`/`FLOOD_TELEGRAPH_TURNS`, or the terrain-tint/cloud-layer telegraph systems — this prompt only adds a HUD *display* of numbers those systems already compute.
- No changes to `gameState.ts`'s `trust` field, its accumulation logic, or anything that reads it outside the HUD (e.g. if `scoring.ts` or anything else uses Trust, that's untouched — only `hud.ts`'s rendering of it goes away).

## Verify

- A fresh game load shows Resilience as a gauge, no Trust anywhere in the HUD.
- Playing until Storm Surge is ~7 turns out shows the neutral "Storm Surge in 7 turns" line; playing into its 1-turn telegraph window shows the same line switch to the warning treatment, in sync with the coastal terrain tint and cloud layer.
- Forcing both hazards into their telegraph windows at once (e.g. via `?resilienceboost` and a couple of scripted turns, or just waiting out a natural near-collision) shows both incoming-hazard lines simultaneously, not one hiding the other.
- `PROGRESS.md` gets the usual note.
