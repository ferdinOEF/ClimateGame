# Khazan — Step Prompt: Economy Expansion, Food Pressure, Estuary Widening, Yacht Achievement

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md` or `NEXT_STEPS.md` — read both first. This one changes the roster and the map that `STEP_PROMPT_balance_tuning.md` (sent last round) plays against, so **do this step first, then run/refine that balance-tuning pass against the result** — tuning against the old roster now would just mean re-tuning again once this lands. Drafted after reading the current `elements.json`, `elements.ts`, `gameState.ts`, `hud.ts`, and `terrain.json` directly.

Four independent changes, in the order given:

---

## 1. Mangrove earns Coin too — differentiated money generation across the four

**Confirmed direction:** Beachside Resort, Sand Mining, Khazan, and Mangrove should all generate Coin per turn through the existing generic `effects.money` accumulator, and the *amounts should differ* rather than converge — that difference is what makes each a distinct strategic choice, not an interchangeable income source.

Today: Sand Mining `money: 14`, Beachside Resort `money: 5`, Khazan `money: 1`, Mangrove has no `money` key at all. Add one, and nudge Khazan slightly so all four land on genuinely distinct values reflecting each element's actual risk profile:

| Element | `effects.money` | Why this ordering |
|---|---|---|
| Sand Mining | 14 (unchanged) | Highest — and it already pays for that with the roster's worst Biodiversity *and* Resilience hit. Riskiest income, correctly the biggest. |
| Beachside Resort | 5 (unchanged) | High — its cost is Biodiversity alone, no Resilience hit, so it sits below Sand Mining. |
| Khazan | 2 (was 1) | Modest — already a well-rounded hybrid tile (Biodiversity +2, Food +1); a small bump keeps it clearly ahead of Mangrove without approaching Resort. |
| Mangrove | 1 (new) | Smallest, deliberately — Mangrove's value proposition is Biodiversity (+3) and Food (+1), not income. Treat this as a bonus, not its purpose, or it stops being the "purest NBS" pick. |

**These are placeholder numbers**, same convention as every other flagged value in `elements.json` today — the point of this section is the *relative ordering and the fact that all four differ*, not that `2` and `1` are precisely correct. Feed the actual magnitudes into `STEP_PROMPT_balance_tuning.md`'s simulation harness once it's re-run against this updated roster; adjust from there.

**Reinforces, doesn't replace, the balance-tuning prompt's existing cost direction:** Beachside Resort, Seawall, and Small Dam should cost relatively more to build than the roster's other options — Seawall (90) already anchors the top end, Small Dam (55) and Beachside Resort (40) sit below it. Don't hand-tune these numbers in this pass; let the balance harness (Section 4 of that document) find them once it's playing against Mangrove's new income and the food mechanic below — both change the economy enough that last round's numbers may no longer be right.

---

## 2. Food pressure: a soft consequence, not a hard wall

Food is already tracked (`GameState.food`, the generic accumulator over Mangrove/Khazan +1 each, House −1) but a deficit currently does nothing — confirmed in `gameState.ts`'s own comment ("a deficit doesn't block anything until a hazard/outcome pass decides what it should do"). Give it a real, non-blocking consequence: a running Food deficit should visibly cost the player something every turn, so building enough Khazan/Mangrove to sustain the Houses already standing becomes a genuine part of play — without ever hard-blocking a build or freezing progress (that's too harsh a wall for the "12-year-old can play this" end of the design brief).

**Add to `advanceTurn()` in `gameState.ts`**, alongside the existing money/maintenance step:

```
const FOOD_DEFICIT_TRUST_FACTOR = 0.4;      // Trust lost per turn, per unit of Food deficit
const FOOD_DEFICIT_RESILIENCE_FACTOR = 0.15; // smaller — hunger erodes preparedness too, but less directly than Trust

// inside advanceTurn(), after the existing money/maintenance logic:
const deficit = Math.max(0, -this.food);
if (deficit > 0) {
  this.trust = Math.max(0, this.trust - deficit * FOOD_DEFICIT_TRUST_FACTOR);
  this.resilience = Math.max(0, this.resilience - deficit * FOOD_DEFICIT_RESILIENCE_FACTOR);
}
```

Both factors are placeholders in the same spirit as everything else here — feed this into the balance-tuning harness as another lever (it already touches Trust/Resilience, which the harness already scores), and treat "how many Khazan/Mangrove tiles does N Houses actually need to break even" as one of the things that harness should be able to answer once it's run.

**HUD:** Food is already shown in the meter strip (`hud.ts`'s `food-value` chip) — add a simple visual state change when `food < 0` (e.g. a warning color on that one chip, no new layout) so the deficit is legible at a glance without needing to open a popover or do mental math, reinforcing the new consequence rather than just the number.

---

## 3. Widen the Estuary region — there's currently exactly one Khazan-eligible tile

`tests/balance.test.ts`'s own comment confirms the fixed map generates a single Estuary tile total, already claimed as part of the starting cluster. That's fine for Mangrove/Khazan as a novelty, but it directly conflicts with Section 2 above — there's no way to build "enough Khazan to sustain the Houses" if there's only ever one Estuary tile in the entire game to build on.

**Fix:** widen the Estuary region in `tools/mapgen/generate.ts` so the map generates roughly **4–6 Estuary tiles** rather than 1 — enough room for several Khazans plus at least one Mangrove, without the Estuary region crowding out the rest of the map's terrain mix. Keep the existing "wide, rounded estuary mouth" shape from the Panaji/Taleigao reference schematic (`STEP_PROMPT_visuals_map_river.md` Section 2) — this is about growing that region's tile count, not changing its shape or position, and it doesn't touch the River roster rule (Small Dam + Sand Mining only) at all. Stay within the previously-set 80–120 total hex budget for the map as a whole.

**Verify:** a fresh map generation shows multiple distinct Estuary tiles clustered around the river mouth, still reading as one coherent estuary region rather than scattered fragments; total map hex count stays in the 80–120 range; River and Beach region sizes are otherwise unaffected.

---

## 4. New element: Yacht — a pure cosmetic achievement, always visible as a goal

**What it is:** a capstone purchase with zero gameplay effect — no Biodiversity, Money, Food, Population, or Resilience contribution, nothing defended, nothing produced. Its entire value is bragging rights: a very high Coin cost that takes real, sustained good play to reach, existing purely so a player has something to visibly save toward. Confirmed placement: the **Coast** tile (the turquoise strip already fronting Beach in `terrain.json`) — there is no separate claimable open-water "Sea" terrain in the fixed map today, Coast is the closest thing to "on the sea," and conveniently no element currently builds on Coast at all, so this doesn't compete with anything else for tile space.

**Data model change needed first:** `ElementKind` in `core/elements.ts` is currently `"building" | "defense"` — add a third member, `"cosmetic"`, for exactly this element (no `category`, no `targetsHazards`, no absorption/failure fields — those all stay `undefined`/omitted, same as they would for any non-defense element).

**`elements.json` entry:**

```json
{
  "id": "yacht",
  "name": "Yacht",
  "kind": "cosmetic",
  "validTerrainIds": ["coast"],
  "buildCost": 750,
  "maintenanceCostPerTurn": 0,
  "matureTurns": 0,
  "colorKey": "yachtHull",
  "effects": {},
  "note": "PLACEHOLDER buildCost. Purely cosmetic — zero effects, by design. Should read as a genuine long-run savings target reachable only through several turns of well-managed income, not something a player stumbles into early. Tune alongside the rest of the economy pass in STEP_PROMPT_balance_tuning.md."
}
```

**Geometry/color, same translation convention as `STEP_PROMPT_icons.md`:** a low, elongated hull shape (tapered at both ends, sitting shallow on the tile — a flattened lens/canoe form, not a boxy shape), a single thin mast rising from the hull's center, one angled triangular sail plane. Colors: hull `#f2ede0` (the same crisp whitewash used for Beachside Resort — reads as "premium," not utilitarian), a thin waterline trim in gold `#d8b158` for a touch of luxury glint, mast `#7c6a4f` (the same wood-brown used elsewhere), sail a soft off-white `#e7e2cf` with a fine gold edge trim. Keep it simple — this is a single small accent piece sitting on one tile, not a scene centerpiece.

**"Always visible" requirement — a new persistent HUD element, not just a popover option:** the player should see the Yacht goal without needing to have claimed or even reached a Coast tile yet. Add a new corner widget to `Hud` (`hud.ts`), alongside the existing tile-counter/meters-panel/claim-prompt/era-banner corners — something like a small fixed tile reading "Yacht — 750c," updating every `refreshHud()` cycle the same way Coin and the meter strip already do:
- Dimmed/muted while `state.coin < 750` (or whatever the tuned cost lands on) — show progress plainly, e.g. "320 / 750c," not just the target.
- Visibly lit/highlighted once affordable, so the player gets a clear "you can do this now" signal even before opening a Coast tile's popover.
- A distinct built/achieved state once a Yacht actually exists on the map (e.g. a small checkmark/trophy treatment) rather than continuing to show the countdown.

**Verify:** a fresh game load shows the Yacht goal HUD element immediately, correctly reflecting starting Coin against its cost; the widget's affordable state flips the moment Coin crosses the threshold, independent of whether a Coast tile is claimed yet; building it deducts Coin normally and contributes nothing to any meter (confirm via `meterTotal()` — every key should read the same with or without a placed Yacht); the popover on a claimed Coast tile offers Yacht and nothing else (Coast has no other eligible elements today).

---

## Verify (all four, together)

- `npm test` still passes, including `tests/balance.test.ts`'s existing invariants — extend that suite for the new Mangrove `effects.money` key and the food-deficit mechanic once numbers are chosen, per `STEP_PROMPT_balance_tuning.md`.
- A live playtest: claim the Estuary region and confirm multiple tiles are available for Khazan/Mangrove; let Food run into deficit deliberately (e.g. via `?autobuild` on Houses without matching Khazan/Mangrove) and confirm Trust/Resilience visibly tick down turn over turn, never freezing anything; claim a Coast tile and confirm Yacht is the only build option there; confirm the Yacht HUD goal is visible from a fresh load and updates live as Coin changes.
- `PROGRESS.md` gets the same placeholder-number flags as every prior pass — Mangrove/Khazan money values, the food-deficit factors, and the Yacht's buildCost are all explicitly marked untuned starting points, not final numbers.
