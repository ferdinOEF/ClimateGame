# Khazan — Step Prompt: Knowledge Nugget Popup + Two HUD Corner Changes

**How to use this document:** three related changes, landed as their own commits per this project's usual convention — Part A and Part B are small, mechanical, and exist specifically to clear the two HUD corners Part C needs. Do Part A and Part B first; Part C depends on both being done (it claims the corner Part A frees, and needs the corner Part B vacates to not collide with it).

Content (the 30 facts) and visual direction (the "Discovery Badge" style, with a global collection counter and a colored glow) were already designed and signed off in chat before this prompt was written — this is not a fresh design pass, it's an implementation of a decided design. Don't redesign the popup while building it.

---

## Part A — Delete the Yacht goal box

**What it is:** the "Yacht / 750 / 750c" widget, bottom-right corner, always visible. Confirmed in `hud.ts`: constructed at lines 160–165 (`yachtGoalEl`/`yachtValueEl`), driven by `setYachtGoal()` at lines 200–204, called from `main.ts`'s `refreshHud()` at line 245 (`hud.setYachtGoal(state.coin, YACHT_COST, state.hasElement("yacht"))`). Styled in `hud.css` lines 524–565 (`.yacht-goal` and its `.affordable`/`.achieved` states), plus two mobile-responsive touch-ups at line 1021 (shares a rule with `.empty-prompt`) and lines 1179–1185 (its own font-size overrides).

**Remove entirely, not just hide** — matching this repo's own dead-code-cleanup convention (see `STEP_PROMPT_code_review_cleanup.md` / the palm-tree removal in `STEP_PROMPT_test_slider_resort_damage.md`):

- `hud.ts`: delete the `yachtGoalEl`/`yachtValueEl` fields, the DOM construction block (lines 160–165), and the whole `setYachtGoal()` method.
- `main.ts`: delete the `hud.setYachtGoal(...)` call at line 245. Leave `YACHT_COST` (line 185) alone if anything else still reads it (check first — `state.hasElement("yacht")` and the Yacht's own `buildCost` may still be used elsewhere, e.g. the build popover's affordability check); delete it too if this was its only remaining use.
- `hud.css`: delete the `.yacht-goal` block (lines 524–565) in full. At line 1021, remove just the `.yacht-goal,` selector, leaving `.empty-prompt { padding: 10px 16px; }` on its own. Delete the two rules at lines 1179–1185 (`.yacht-goal { font-size: 13px; }` and `.yacht-goal .yacht-value { font-size: 15px; }`) entirely.

**The Yacht element itself is untouched** — still buildable, still costs 750, still purely cosmetic. This only removes the always-on HUD tracker for it. A player can still see what a Yacht costs from the build popover itself.

**Verify:** bottom-right corner is empty on a fresh load and stays empty regardless of Coin or whether a Yacht is built. `tsc --noEmit` clean (confirms nothing else still references `setYachtGoal`/`yachtGoalEl`/`yachtValueEl`).

---

## Part B — Move the Test Hazards tab + panel to bottom-right

**Why now, not just tidiness:** confirmed in `hud.css` line 793, the Test Hazards tab's own comment says it explicitly: *"bottom-left is the one HUD corner nothing else uses."* That's no longer true after Part C — the knowledge nugget popup needs bottom-left for itself. Moving Test Hazards out is load-bearing for Part C, not cosmetic. Bottom-right is free the moment Part A lands.

**Confirmed in `hud.css`:**
- `.hazard-test-tab` (lines 795–810): `bottom: calc(16px + env(safe-area-inset-bottom)); left: calc(12px + env(safe-area-inset-left));`
- `.hazard-test-panel` (lines 821–836): `bottom: 54px; left: 12px;` (no safe-area handling on this one today — don't add it as part of this move, just mirror what's already there)

**Change:** in both rules, replace the `left` declaration with the equivalent `right` declaration (`.hazard-test-tab` → `right: calc(12px + env(safe-area-inset-right));`, `.hazard-test-panel` → `right: 12px;`), keep every other property (including `bottom`) unchanged. `hazardTestPanel.ts` itself has no hardcoded positioning — it only sets class names — so no TS change should be needed here, only the two CSS rules.

**Verify:** with `?debughazards` in the URL, the "Test hazards" tab renders bottom-right instead of bottom-left, at both breakpoints checked in the last QA pass (375×667 and 1280×800+) — panel opens without clipping off the right edge of a narrow viewport. Bottom-left is now visibly empty at rest (confirms Part A + Part B together actually cleared it for Part C).

---

## Part C — The knowledge nugget popup

**What it does:** the instant a player successfully builds one of ten specific elements, a small card appears bottom-left showing one of that element's three pre-written facts, then auto-dismisses. A global counter tracks how many of the 30 total facts have been seen across the session. Visual style is "Discovery Badge": a colored glow, an icon medallion, an eyebrow label, and a thin progress bar reading "N of 30 facts found."

### C.1 — Data file

New file, `src/data/nuggets.json`, `Record<string, string[]>` keyed by `elements.json`'s own `id` field, exactly three strings per key, in this exact order (order matters — see C.3's pick logic):

```json
{
  "mangrove": [
    "Mangroves can cut wave height by up to 66%. Plant a strong belt and even a monster storm surge arrives exhausted.",
    "A mangrove forest is a coastal nursery. Baby fish, crabs, and prawns hide in those roots until they're big enough for open water.",
    "Mangroves lock away carbon faster than almost any rainforest on Earth. You're not just building a defense, you're building a climate superweapon."
  ],
  "sandy_vegetation": [
    "Pandanus roots grip the sand tight enough to blunt an incoming storm surge, right where mangroves can't even grow.",
    "Goan families have woven Pandanus leaves into mats, baskets, and festival decorations for generations. This plant works just as hard on land as it does on the coast.",
    "It's the cheapest defense you can build, and it pays back the most biodiversity per coin in the game. Small investment, big return."
  ],
  "dune": [
    "A dune doesn't fight the wave. It sacrifices its own sand to soak up the energy, then slowly rebuilds itself.",
    "Sea turtles and shorebirds nest in the sand a healthy dune protects. Keep the dune standing and you're keeping their nursery too.",
    "A dune that takes a beating is still there tomorrow. Smaller, but standing, and ready for the next storm."
  ],
  "seawall": [
    "A solid seawall can bounce back up to 90% of an incoming wave's force. That's serious muscle for a wall of concrete.",
    "Push it too far and it doesn't bend, it breaks. Overwhelm a seawall and it fails all at once, sending the wave crashing through anyway.",
    "Nothing grows on a seawall. It's the toughest defense in the game and the one with zero room for wildlife."
  ],
  "breakwater": [
    "A breakwater doesn't even touch the shore. It sits out at sea and shatters the wave's power before it gets anywhere near land.",
    "Give a breakwater enough time and barnacles, oysters, and coral move in. Today's concrete slab becomes tomorrow's reef.",
    "Before breakwaters existed, open coastline had nowhere to hide from a storm surge. Now it does."
  ],
  "khazan": [
    "The Khazan is one of the oldest engineered landscapes in India, holding back the sea with nothing but earth bunds and sluice gates since ancient times.",
    "A single Khazan field grows rice and raises fish at the same time. Open the sluice gates, let the fish swim in with the tide, close them, harvest both.",
    "A Khazan doesn't block a flood, it drinks it. It soaks up an entire flood's worth of water like a giant sponge before any damage gets through."
  ],
  "small_dam": [
    "A dam holds the line right up until it can't. Push it past its limit and it fails all at once, releasing everything it was holding back.",
    "Skip the maintenance and a dam quietly weakens every turn. Real flood protection needs upkeep, not just concrete.",
    "A dam actually earns its keep, storing floodwater and boosting resilience at the same time. That's a rare two for one."
  ],
  "beachside_resort": [
    "A resort pays out coin every single turn, but every pool and sun deck replaces habitat that used to be there.",
    "Goa's coastline has lived this trade for real. Mangroves and wetlands cleared for waterfront rooms, one resort at a time.",
    "A resort brings in cash but can't defend itself from anything. Take a direct hit and you'll see the damage in the paint."
  ],
  "sand_mining": [
    "Sand Mining can bring in a lot of money, but it weakens the land around it. Fast money, imminent destruction.",
    "Every truckload of sand pulled from a riverbed is a truckload of natural flood buffer gone with it.",
    "Strip enough sand from a river and the sea starts creeping upstream to fill the gap. You're not just weakening the bank, you're inviting the ocean further inland."
  ],
  "yacht": [
    "The Yacht does absolutely nothing for your economy, your defenses, or your resilience. It exists purely to be seen.",
    "Every time a yacht drops anchor, it can flatten the seagrass meadow underneath it. All that status comes with a quiet cost beneath the waterline.",
    "At 750 coin, the Yacht is the single most expensive thing you can build in this whole game, and it does less than a single House."
  ]
}
```

**`house` has no entry, deliberately** — it's the one buildable non-cosmetic element left out of this set (a decision made in chat, not an oversight). The popup must no-op safely (not throw) when built with an id that isn't a key in this file, so a future element added without nuggets yet doesn't break the build flow.

### C.2 — Tint: reuse two existing colors, don't invent new ones

Not a per-element color — a **positive/negative** framing decided in chat: the seven defense elements get one tint, the three cautionary ones get another. Both already exist in `palette.ts`, reuse them rather than adding new hex values:

- **Positive** (`mangrove`, `sandy_vegetation`, `dune`, `seawall`, `breakwater`, `khazan`, `small_dam`): `PALETTE.defenseMangrove`, `#4FAE6E`.
- **Caution** (`beachside_resort`, `sand_mining`, `yacht`): `PALETTE.defenseSandMining`, `#C68A3D`.

A small local map in the new component (`NUGGET_TINT: Record<string, string>` or equivalent) is fine — `hud.css` can't import from `palette.ts` (different module systems), so the two hex values get duplicated into CSS/inline-style the same way `defenseDune`/`defenseMangrove` etc. already are as literals elsewhere in `hud.css` (e.g. `.hazard-test-row.storm`'s `#3e86b0` comment at line 851 does exactly this and explains why).

### C.3 — Component

New file `src/ui/nuggetPopup.ts`, matching this project's own convention of one small class per corner widget (`eraEndScreen.ts`, `hazardTestPanel.ts` are the closest precedents) rather than folding more state into `Hud` itself.

```ts
export class NuggetPopup {
  constructor(container: HTMLElement) { /* builds the DOM once, hidden */ }

  /** No-ops silently if elementId has no entry in nuggets.json. */
  show(elementId: string): void { /* ... */ }

  /** Same "doesn't need to persist across a reset" convention as HazardTestPanel.reset() — clears the per-element pick-order state and the discovered-count back to zero. */
  reset(): void { /* ... */ }
}
```

**Pick order, per element, not global:** shuffle each element's own 3-fact array once (on first build of that type, or once at construction/reset — either is fine), then hand out facts in that shuffled order on successive builds of the same element; once all three have been shown, reshuffle and continue. This guarantees no immediate repeat of the same fact twice in a row, without needing true randomness-with-memory. (This was flagged as an open question during design and this is the resolution — no immediate repeats, reshuffle after exhausting the set.)

**Discovered count:** track with a `Set<string>` of `"<elementId>#<factIndex>"` keys, not a raw counter — a counter alone can't tell "shown again" from "shown for the first time," and the badge's progress bar needs the real unique count. Total denominator is computed from `nuggets.json` itself (sum of every array's length — currently 30, but don't hardcode 30; if the data file grows later this should track it automatically), not a magic number in the component.

**Timing:** appears immediately on a successful build (no artificial delay), auto-dismisses after **5000ms** (longer than `showBanner`'s 3500–4000ms default since this card has more to read — icon, eyebrow, label, fact text, and the progress bar). No manual dismiss control, matching the signed-off Discovery Badge design (it has no close button, unlike the Field Note alternative that was considered and not chosen). If a second nugget-eligible element is built while one is still showing, replace the content and restart the timer rather than stacking a second card — same "restart cleanly" pattern `Hud.flashArrival()` already uses (remove the animating class, force a reflow, re-add it).

**Markup/visual spec** (already designed and shown live in the chat-reviewed mockup — build to this, don't redesign it):

```html
<div class="hud-corner bottom-left nugget-badge" hidden>
  <div class="nugget-badge-icon"><!-- small inline SVG glyph, tint-colored --></div>
  <div class="nugget-badge-body">
    <div class="nugget-badge-eyebrow">New discovery</div>
    <div class="nugget-badge-label"><!-- element display name --></div>
    <p class="nugget-badge-text"><!-- the fact --></p>
    <div class="nugget-badge-track"><div class="nugget-badge-fill"></div></div>
    <div class="nugget-badge-progress"><!-- "N of 30 facts found" --></div>
  </div>
</div>
```

Styling: same dark-translucent card language every other HUD card already uses (`rgba(20, 30, 26, 0.9)`-ish background, ~10-12px radius, the usual box-shadow) — but with a colored 1px border in the tint color, plus a soft outer glow (`box-shadow` with a low-alpha blur in the tint color, stacked alongside the normal drop shadow, not replacing it). Icon sits in a small tint-colored circular badge to the left of the text column. Progress bar fill width is `(discoveredCount / total) * 100%`, same tint color. Entrance: fade + slide up, ~300ms, guarded by `prefers-reduced-motion` same as every other animated element in this file already is.

**New `.hud-corner.bottom-left` variant needed** — doesn't exist yet in `hud.css` (checked directly; only `top-left`/`top-right`/`bottom-center`/`top-center`/`bottom-right` exist today). Add it following the exact same pattern as the other four (`bottom: calc(16px + env(safe-area-inset-bottom)); left: calc(12px + env(safe-area-inset-left));`).

### C.4 — Wiring

In `main.ts`:

- Construct once, alongside the other corner widgets: `const nuggetPopup = new NuggetPopup(container);`
- In `openTilePopover()`'s build callback (confirmed at lines 872–887), right after `elements.place(coord, id, terrain.heightAt(coord), { animate: true });` (line 874): `nuggetPopup.show(id);`
- In `resetBoard()` (confirmed at lines 718–738), alongside the other `.reset()` calls (`elements.reset()`, `hazardOverlay.reset()`, `hazardTestPanel?.reset()`): add `nuggetPopup.reset();`
- The `devAutoBuild`/`__buildForTest` code paths (dev-only, URL-param-gated / test-hook-only) do **not** need to call `nuggetPopup.show()` — this is a player-facing moment, not something a scripted bulk-build should spam. Leave those paths untouched.

### C.5 — Mobile

Check against the four required breakpoints from `STEP_PROMPT_mobile_responsive.md` (375×667, 390×844, 412×915, 768×1024) — this is exactly the bug class the QA gauntlet pass already hunted for once (`.era-banner`'s overflow fix): confirm the card's width plus its `left` offset never pushes it past the right edge on the narrowest viewport, and that it doesn't collide with `.empty-prompt` (bottom-center) at any of them.

---

## Guardrails

- No hazard math, no `elements.json` balance numbers, no absorption/failureThreshold values touched by any part of this pass.
- Part A and Part B are each their own commit; Part C can be its own commit or split further (data file / component / wiring) — whatever this repo's usual granularity is for a multi-file feature.
- Content is final as reviewed in chat — don't rewrite any of the 30 facts while implementing. If one reads awkwardly once it's actually on screen at real size, flag it back rather than silently editing it.

## Verify

- `tsc --noEmit` clean, existing test suite at current baseline (65/71) or better.
- Bottom-right: empty after Part A, Test Hazards tab after Part B (behind `?debughazards`).
- Bottom-left: empty at rest, shows the Discovery Badge card for ~5s after building any of the 10 nugget-eligible elements, stays empty when building a House.
- Build the same element type three times in a row (Reset Board between if needed to afford it) — three different facts, no immediate repeat, a fourth build reuses the set without erroring.
- Progress bar and "N of 30" both increase only on a genuinely new fact, not on a repeat.
- `PROGRESS.md` gets the usual entry.
